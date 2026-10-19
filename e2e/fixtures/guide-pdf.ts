import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { Page } from "@playwright/test";
import studyGuides from "../../content/study-guides.json";

const FILES = new Map(studyGuides.guides.map((guide) => [guide.slug, guide.file]));

/** Padding stream size: the fixture must exceed pdf.js's two `rangeChunkSize` (64 KiB) chunks, or it never uses ranges. */
const PADDING = 200 * 1024;

/**
 * A minimal valid PDF built in memory (no committed binary, no owner content): `pages` A4 pages that each read
 * "Fixture page n" in Helvetica, an outline with one "Chapter n" entry per page (so the reader shows Chapters),
 * a padding stream so pdf.js reads it by byte ranges, and a correct xref table.
 */
export function guidePdf(pages = 3): Uint8Array {
  const objects: string[] = [];
  const add = (body: string) => void objects.push(body);
  const pageIds = Array.from({ length: pages }, (_, i) => 5 + i * 2);
  const outlineIds = Array.from({ length: pages }, (_, i) => 5 + pages * 2 + i);
  const paddingId = 5 + pages * 3;

  add(`<< /Type /Catalog /Pages 2 0 R /Outlines 3 0 R /PageMode /UseOutlines >>`);
  add(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages} >>`);
  add(`<< /Type /Outlines /First ${outlineIds[0]} 0 R /Last ${outlineIds[pages - 1]} 0 R /Count ${pages} >>`);
  add(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`);
  for (let n = 1; n <= pages; n++) {
    const content = `BT /F1 24 Tf 72 760 Td (Fixture page ${n}) Tj ET`;
    add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents ${pageIds[n - 1] + 1} 0 R >>`);
    add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  }
  for (let n = 1; n <= pages; n++) {
    const links = [n > 1 ? `/Prev ${outlineIds[n - 2]} 0 R` : "", n < pages ? `/Next ${outlineIds[n]} 0 R` : ""].filter(Boolean).join(" ");
    add(`<< /Title (Chapter ${n}) /Parent 3 0 R ${links} /Dest [${pageIds[n - 1]} 0 R /Fit] >>`);
  }
  add(`<< /Length ${PADDING} >>\nstream\n${" ".repeat(PADDING)}\nendstream`);
  if (objects.length !== paddingId) throw new Error("guidePdf: object numbering is off");

  // The padding object comes first in the file, so the pages and the xref sit in later range chunks.
  const order = [paddingId, ...objects.map((_, i) => i + 1).filter((id) => id !== paddingId)];
  let out = "%PDF-1.4\n";
  const offsets = new Array<number>(objects.length + 1).fill(0);
  for (const id of order) {
    offsets[id] = out.length;
    out += `${id} 0 obj\n${objects[id - 1]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= objects.length; id++) out += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

/** One `/api/guides/*` request the fixture answered, with the response it gave. */
export interface GuideRequest {
  url: string;
  /** 200 for the whole file, 206 for a byte range. */
  status: number;
  disposition: string;
  body: Buffer;
}

export interface GuideRoute {
  requests: GuideRequest[];
}

/** One `bytes=a-b`, `bytes=a-` or `bytes=-n` range inside `size`, or null. */
function parseRange(header: string | null | undefined, size: number): { start: number; end: number } | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? "");
  if (!m || (m[1] === "" && m[2] === "")) return null;
  if (m[1] === "") return { start: Math.max(0, size - Number(m[2])), end: size - 1 };
  const start = Number(m[1]);
  const end = m[2] === "" ? size - 1 : Math.min(size - 1, Number(m[2]));
  return start <= end ? { start, end } : null;
}

/**
 * The answer of the R2 Pages Function (`functions/_lib/guides.ts`) for `url`, served from `pdf`: a 404 for an
 * unknown slug, `Accept-Ranges: bytes`, a 206 with `Content-Range` for a `Range` request, and
 * `Content-Disposition: attachment; filename="<guide file>"` for `?download=1` (inline otherwise). Logged into `log`.
 */
function answerGuide(pdf: Buffer, rawUrl: string, rangeHeader: string | null | undefined, log: GuideRoute) {
  const url = new URL(rawUrl);
  const file = FILES.get(url.pathname.split("/").pop() ?? "");
  if (!file) {
    log.requests.push({ url: rawUrl, status: 404, disposition: "", body: Buffer.alloc(0) });
    return { status: 404, headers: { "Content-Type": "text/plain" }, body: Buffer.from("Not found") };
  }
  const disposition = `${url.searchParams.get("download") === "1" ? "attachment" : "inline"}; filename="${file}"`;
  const headers: Record<string, string> = {
    "Content-Type": "application/pdf",
    "Accept-Ranges": "bytes",
    "Content-Disposition": disposition,
    "Cache-Control": "no-store",
  };
  const range = parseRange(rangeHeader, pdf.length);
  const status = range ? 206 : 200;
  const body = range ? pdf.subarray(range.start, range.end + 1) : pdf;
  if (range) headers["Content-Range"] = `bytes ${range.start}-${range.end}/${pdf.length}`;
  headers["Content-Length"] = String(body.length);
  log.requests.push({ url: rawUrl, status, disposition, body });
  return { status, headers, body };
}

/** Answers `/api/guides/*` (the R2 Pages Function, absent from the static server) with the `guidePdf()` fixture. */
export async function routeGuides(page: Page, pages = 3): Promise<GuideRoute> {
  const pdf = Buffer.from(guidePdf(pages));
  const log: GuideRoute = { requests: [] };
  await page.route("**/api/guides/**", async (route) => {
    const request = route.request();
    await route.fulfill(answerGuide(pdf, request.url(), await request.headerValue("range"), log));
  });
  return log;
}

export interface GuideServer extends GuideRoute {
  /** Origin to load the site from: everything but `/api/guides/*` is forwarded to the e2e server. */
  origin: string;
  close: () => Promise<void>;
}

/**
 * The fixture over real HTTP, for a test that needs the downloaded bytes. Chromium hands an `<a download>` click to
 * its download manager, which fetches outside request interception: neither `page.route` nor `context.route` sees
 * the request (handler call count 0), so the e2e static server answers it with a 404 and `download.failure()` is
 * "canceled". Measured with Playwright 1.64.1: the same routed anchor completes when the real server answers the
 * URL, and the bytes are then the server's, not the route's. So the page loads from this proxy, which answers
 * `/api/guides/*` like the Function and forwards every other request to `target`.
 */
export async function serveGuides(target: string, pages = 3): Promise<GuideServer> {
  const pdf = Buffer.from(guidePdf(pages));
  const log: GuideRoute = { requests: [] };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    try {
      if (url.pathname.startsWith("/api/guides/")) {
        const { status, headers, body } = answerGuide(pdf, `http://${req.headers.host}${req.url}`, req.headers.range, log);
        res.writeHead(status, headers).end(body);
        return;
      }
      const upstream = await fetch(new URL(req.url ?? "/", target), { method: req.method, redirect: "manual" });
      const headers: Record<string, string> = {};
      upstream.headers.forEach((value, key) => {
        if (!["content-encoding", "content-length", "transfer-encoding", "connection"].includes(key)) headers[key] = value;
      });
      res.writeHead(upstream.status, headers).end(Buffer.from(await upstream.arrayBuffer()));
    } catch (error) {
      res.writeHead(502).end(String(error));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    requests: log.requests,
    origin: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

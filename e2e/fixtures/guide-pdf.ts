import type { Page } from "@playwright/test";

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

export interface GuideRoute {
  /** Status of every response served: 200 for the whole file, 206 for a byte range. */
  statuses: number[];
}

/** One `bytes=a-b`, `bytes=a-` or `bytes=-n` range inside `size`, or null. */
function parseRange(header: string | null, size: number): { start: number; end: number } | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? "");
  if (!m || (m[1] === "" && m[2] === "")) return null;
  if (m[1] === "") return { start: Math.max(0, size - Number(m[2])), end: size - 1 };
  const start = Number(m[1]);
  const end = m[2] === "" ? size - 1 : Math.min(size - 1, Number(m[2]));
  return start <= end ? { start, end } : null;
}

/**
 * Answers `/api/guides/*` (the R2 Pages Function, absent from the static server) with the `guidePdf()` fixture,
 * like the Function: `Accept-Ranges: bytes`, a 206 with `Content-Range` for a `Range` request, and
 * `Content-Disposition: attachment` for `?download=1`.
 */
export async function routeGuides(page: Page, pages = 3): Promise<GuideRoute> {
  const pdf = Buffer.from(guidePdf(pages));
  const log: GuideRoute = { statuses: [] };
  await page.route("**/api/guides/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const headers: Record<string, string> = {
      "Content-Type": "application/pdf",
      "Accept-Ranges": "bytes",
      "Content-Disposition": `${url.searchParams.get("download") === "1" ? "attachment" : "inline"}; filename="${url.pathname.split("/").pop()}.pdf"`,
      "Cache-Control": "no-store",
    };
    const range = parseRange(await request.headerValue("range"), pdf.length);
    if (range) {
      log.statuses.push(206);
      const body = pdf.subarray(range.start, range.end + 1);
      await route.fulfill({ status: 206, body, headers: { ...headers, "Content-Range": `bytes ${range.start}-${range.end}/${pdf.length}`, "Content-Length": String(body.length) } });
      return;
    }
    log.statuses.push(200);
    await route.fulfill({ status: 200, body: pdf, headers: { ...headers, "Content-Length": String(pdf.length) } });
  });
  return log;
}

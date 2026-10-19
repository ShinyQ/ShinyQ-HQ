import data from "../../content/study-guides.json";
import type { GuidesEnv, PagesContext } from "./types";

/** The fields of a study guide (content/study-guides.json) the Function needs. */
export interface GuideEntry {
  slug: string;
  version: string;
  file: string;
  bytes: number;
}

const DEFAULT_GUIDES: readonly GuideEntry[] = data.guides.map(({ slug, version, file, bytes }) => ({ slug, version, file, bytes }));

const PATH = /^\/api\/guides\/([^/]+)$/;
/** A content version (`?v=`): the first 12 hex digits of the PDF's SHA-256, as in the R2 key. */
const VERSION = /^[0-9a-f]{12}$/;
const IMMUTABLE = "public, max-age=31536000, immutable, no-transform";
const SHORT = "public, max-age=300, no-transform";
// _headers rules never reach Function responses (Cloudflare Pages), so the framing policy is set here.
const FRAME_POLICY = "frame-ancestors 'none'";

function text(status: number, body: string, headers: Record<string, string> = {}): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": FRAME_POLICY, "Cache-Control": "no-store", ...headers } });
}

const notFound = () => text(404, "Not found");

/**
 * Parses a `Range` request header against an object of `size` bytes. One range only: `bytes=a-b` (b clamped to
 * the last byte), `bytes=a-` and `bytes=-n` (the last n bytes, n clamped to the size). Returns "unsatisfiable"
 * when the range starts past the end, and null (serve the whole object) for no header, several ranges or
 * anything malformed.
 */
export function parseRange(header: string | null, size: number): { start: number; end: number } | "unsatisfiable" | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, first, last] = match;
  if (!first && !last) return null;
  let start: number;
  let end: number;
  if (!first) {
    const suffix = Math.min(Number(last), size);
    start = size - suffix;
    end = size - 1;
  } else {
    start = Number(first);
    end = last ? Math.min(Number(last), size - 1) : size - 1;
  }
  if (start >= size || start > end) return "unsatisfiable";
  return { start, end };
}

/** True when an `If-None-Match` header lists `etag` (weak or strong) or is `*`. */
function matchesEtag(header: string | null, etag: string): boolean {
  if (!header) return false;
  return header.split(",").some((token) => {
    const value = token.trim();
    return value === "*" || value.replace(/^W\//, "") === etag.replace(/^W\//, "");
  });
}

/**
 * `GET|HEAD /api/guides/<slug>`: a study guide PDF from the private R2 bucket behind `GUIDES` (key
 * `<slug>/<version>.pdf`), with single byte ranges for pdf.js, ETag revalidation and `?download=1` for an
 * attachment. A well-formed `?v=<version>` reads exactly that version's key (404 when it is gone) and caches it
 * for a year, immutable, since the bytes under a version key never change: a reader opened before a deploy keeps
 * reading the bytes it started with. Without `?v=` (or with a malformed one) it serves the current version with a
 * short cache. A plain GET is one R2 read; HEAD, `If-None-Match` and `Range` read the object's head first.
 */
export function createGuidesHandler(guides: readonly GuideEntry[] = DEFAULT_GUIDES) {
  const bySlug = new Map(guides.map((guide) => [guide.slug, guide]));
  return async function handle({ request, env }: PagesContext<GuidesEnv>): Promise<Response> {
    const url = new URL(request.url);
    const slug = PATH.exec(url.pathname)?.[1];
    const guide = slug ? bySlug.get(slug) : undefined;
    if (!guide) return notFound();
    const method = request.method;
    if (method !== "GET" && method !== "HEAD") return text(405, "Method not allowed", { Allow: "GET, HEAD" });
    const bucket = env.GUIDES;
    if (!bucket) {
      console.error("GUIDES binding missing");
      return notFound();
    }
    const v = url.searchParams.get("v");
    const exact = v !== null && VERSION.test(v);
    const key = `${guide.slug}/${exact ? v : guide.version}.pdf`;
    const cacheControl = exact ? IMMUTABLE : SHORT;
    const disposition = url.searchParams.get("download") === "1" ? "attachment" : "inline";
    const headersFor = (etag: string): Record<string, string> => ({
      "Content-Type": "application/pdf",
      "Accept-Ranges": "bytes",
      ETag: etag,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": FRAME_POLICY,
      "Content-Disposition": `${disposition}; filename="${guide.file}"`,
      "Cache-Control": cacheControl,
    });
    try {
      const ifNoneMatch = request.headers.get("If-None-Match");
      const rangeHeader = request.headers.get("Range");
      if (method === "GET" && !ifNoneMatch && !rangeHeader) {
        const object = await bucket.get(key);
        if (!object) return notFound();
        return new Response(object.body, { status: 200, headers: { ...headersFor(object.httpEtag), "Content-Length": String(object.size) } });
      }
      const head = await bucket.head(key);
      if (!head) return notFound();
      if (matchesEtag(ifNoneMatch, head.httpEtag)) {
        return new Response(null, { status: 304, headers: { ETag: head.httpEtag, "Cache-Control": cacheControl } });
      }
      const headers = headersFor(head.httpEtag);
      if (method === "HEAD") return new Response(null, { status: 200, headers: { ...headers, "Content-Length": String(head.size) } });
      const range = parseRange(rangeHeader, head.size);
      if (range === "unsatisfiable") return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${head.size}` } });
      if (range) {
        const length = range.end - range.start + 1;
        const part = await bucket.get(key, { range: { offset: range.start, length } });
        if (!part) return notFound();
        return new Response(part.body, { status: 206, headers: { ...headers, "Content-Range": `bytes ${range.start}-${range.end}/${head.size}`, "Content-Length": String(length) } });
      }
      const object = await bucket.get(key);
      if (!object) return notFound();
      return new Response(object.body, { status: 200, headers: { ...headersFor(object.httpEtag), "Content-Length": String(object.size) } });
    } catch (error) {
      console.error("GUIDES read failed", error);
      return text(502, "Upstream error");
    }
  };
}

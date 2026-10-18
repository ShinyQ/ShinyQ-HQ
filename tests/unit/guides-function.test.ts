import { afterEach, describe, expect, it, vi } from "vitest";
import { createGuidesHandler, parseRange, type GuideEntry } from "../../functions/_lib/guides";
import type { GuidesEnv, R2Bucket, R2Range } from "../../functions/_lib/types";
import data from "../../content/study-guides.json";

const ORIGIN = "https://kurniadi.pages.dev";
const SIZE = 1000;
const BYTES = Uint8Array.from({ length: SIZE }, (_, i) => i % 251);
const GUIDE: GuideEntry = { slug: "gh-600", version: "abc123def456", file: "GH-600_Study_Guide.pdf", bytes: SIZE };
const KEY = `${GUIDE.slug}/${GUIDE.version}.pdf`;
const ETAG = '"etag-1"';

interface Calls {
  head: string[];
  get: { key: string; range?: R2Range }[];
}

function fakeBucket(objects: Record<string, Uint8Array> = { [KEY]: BYTES }, calls: Calls = { head: [], get: [] }): R2Bucket {
  return {
    async head(key) {
      calls.head.push(key);
      const bytes = objects[key];
      return bytes ? { size: bytes.length, httpEtag: ETAG } : null;
    },
    async get(key, options) {
      calls.get.push({ key, range: options?.range });
      const bytes = objects[key];
      if (!bytes) return null;
      const offset = options?.range?.offset ?? 0;
      const length = options?.range?.length ?? bytes.length - offset;
      const slice = bytes.slice(offset, offset + length);
      return { size: bytes.length, httpEtag: ETAG, range: options?.range, body: new Response(slice).body as ReadableStream };
    },
  };
}

function call(env: GuidesEnv, init: { path?: string; method?: string; headers?: Record<string, string> } = {}) {
  const handler = createGuidesHandler([GUIDE]);
  const request = new Request(`${ORIGIN}${init.path ?? "/api/guides/gh-600"}`, { method: init.method ?? "GET", headers: init.headers });
  return handler({ request, env, waitUntil: () => undefined });
}

async function bodyBytes(res: Response): Promise<Uint8Array> {
  return new Uint8Array(await res.arrayBuffer());
}

afterEach(() => vi.restoreAllMocks());

describe("parseRange", () => {
  const cases: [string | null, ReturnType<typeof parseRange>][] = [
    [null, null],
    ["", null],
    ["bytes=0-99", { start: 0, end: 99 }],
    ["bytes=0-0", { start: 0, end: 0 }],
    ["bytes=500-5000", { start: 500, end: 999 }],
    ["bytes=900-", { start: 900, end: 999 }],
    ["bytes=-50", { start: 950, end: 999 }],
    ["bytes=-5000", { start: 0, end: 999 }],
    ["bytes=999-999", { start: 999, end: 999 }],
    ["bytes=2000-", "unsatisfiable"],
    ["bytes=1000-1000", "unsatisfiable"],
    ["bytes=50-10", "unsatisfiable"],
    ["bytes=-0", "unsatisfiable"],
    ["bytes=0-1,5-6", null],
    ["bytes=-", null],
    ["bytes=a-b", null],
    ["items=0-9", null],
    ["bytes=0x1-9", null],
  ];
  it.each(cases)("parses %j", (header, expected) => {
    expect(parseRange(header, SIZE)).toEqual(expected);
  });
});

describe("GET /api/guides/<slug>", () => {
  it("serves the full PDF with every header", async () => {
    const calls: Calls = { head: [], get: [] };
    const res = await call({ GUIDES: fakeBucket(undefined, calls) });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    expect(res.headers.get("ETag")).toBe(ETAG);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Content-Disposition")).toBe('inline; filename="GH-600_Study_Guide.pdf"');
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=300, no-transform");
    expect(res.headers.get("Content-Length")).toBe(String(SIZE));
    // _headers rules never reach Function responses, so the Function keeps the PDF out of frames itself.
    expect(res.headers.get("Content-Security-Policy")).toBe("frame-ancestors 'none'");
    expect(await bodyBytes(res)).toEqual(BYTES);
    expect(calls.head).toEqual([KEY]);
    expect(calls.get).toEqual([{ key: KEY, range: undefined }]);
  });

  it("answers HEAD with headers only", async () => {
    const calls: Calls = { head: [], get: [] };
    const res = await call({ GUIDES: fakeBucket(undefined, calls) }, { method: "HEAD" });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Length")).toBe(String(SIZE));
    expect(await res.text()).toBe("");
    expect(calls.get).toEqual([]);
  });

  it("serves a byte range", async () => {
    const calls: Calls = { head: [], get: [] };
    const res = await call({ GUIDES: fakeBucket(undefined, calls) }, { headers: { Range: "bytes=0-99" } });
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 0-99/1000");
    expect(res.headers.get("Content-Length")).toBe("100");
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    expect(await bodyBytes(res)).toEqual(BYTES.slice(0, 100));
    expect(calls.get).toEqual([{ key: KEY, range: { offset: 0, length: 100 } }]);
  });

  it("serves an open-ended range", async () => {
    const res = await call({ GUIDES: fakeBucket() }, { headers: { Range: "bytes=900-" } });
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 900-999/1000");
    expect(res.headers.get("Content-Length")).toBe("100");
    expect(await bodyBytes(res)).toEqual(BYTES.slice(900));
  });

  it("serves a suffix range", async () => {
    const res = await call({ GUIDES: fakeBucket() }, { headers: { Range: "bytes=-50" } });
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 950-999/1000");
    expect(res.headers.get("Content-Length")).toBe("50");
    expect(await bodyBytes(res)).toEqual(BYTES.slice(950));
  });

  it("answers 416 for a range past the end", async () => {
    const calls: Calls = { head: [], get: [] };
    const res = await call({ GUIDES: fakeBucket(undefined, calls) }, { headers: { Range: "bytes=2000-" } });
    expect(res.status).toBe(416);
    expect(res.headers.get("Content-Range")).toBe("bytes */1000");
    expect(await res.text()).toBe("");
    expect(calls.get).toEqual([]);
  });

  it("serves the full PDF for multiple ranges", async () => {
    const res = await call({ GUIDES: fakeBucket() }, { headers: { Range: "bytes=0-1,5-6" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Range")).toBeNull();
    expect(await bodyBytes(res)).toEqual(BYTES);
  });

  it("answers 304 when If-None-Match carries the ETag or *", async () => {
    for (const value of [ETAG, `"other", ${ETAG}`, "*", `W/${ETAG}`]) {
      const calls: Calls = { head: [], get: [] };
      const res = await call({ GUIDES: fakeBucket(undefined, calls) }, { headers: { "If-None-Match": value } });
      expect(res.status, value).toBe(304);
      expect(res.headers.get("ETag")).toBe(ETAG);
      expect(res.headers.get("Cache-Control")).toBe("public, max-age=300, no-transform");
      expect(await res.text()).toBe("");
      expect(calls.get).toEqual([]);
    }
    const miss = await call({ GUIDES: fakeBucket() }, { headers: { "If-None-Match": '"other"' } });
    expect(miss.status).toBe(200);
  });

  it("answers 404 for an unknown slug without touching the bucket", async () => {
    const calls: Calls = { head: [], get: [] };
    for (const path of ["/api/guides/nope", "/api/guides/GH-600", "/api/guides/gh-600/extra", "/api/guides/", "/api/guides/..%2Fgh-600"]) {
      const res = await call({ GUIDES: fakeBucket(undefined, calls) }, { path });
      expect(res.status, path).toBe(404);
      expect(res.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
      expect(await res.text()).toBe("Not found");
    }
    expect(calls.head).toEqual([]);
  });

  it("answers 404 when the object is missing", async () => {
    const res = await call({ GUIDES: fakeBucket({}) });
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Not found");
  });

  it("answers 404 and logs when the binding is missing", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await call({});
    expect(res.status).toBe(404);
    expect(error).toHaveBeenCalledWith("GUIDES binding missing");
  });

  it("answers 405 for other methods", async () => {
    const res = await call({ GUIDES: fakeBucket() }, { method: "POST" });
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("GET, HEAD");
  });

  it("offers a download with ?download=1", async () => {
    const res = await call({ GUIDES: fakeBucket() }, { path: "/api/guides/gh-600?download=1" });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="GH-600_Study_Guide.pdf"');
  });

  it("caches immutably only for the current version", async () => {
    const current = await call({ GUIDES: fakeBucket() }, { path: `/api/guides/gh-600?v=${GUIDE.version}` });
    expect(current.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable, no-transform");
    const stale = await call({ GUIDES: fakeBucket() }, { path: "/api/guides/gh-600?v=000000000000" });
    expect(stale.status).toBe(200);
    expect(stale.headers.get("Cache-Control")).toBe("public, max-age=300, no-transform");
  });

  it("answers 502 when R2 throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failing: R2Bucket = {
      async head() {
        throw new Error("boom");
      },
      async get() {
        throw new Error("boom");
      },
    };
    const res = await call({ GUIDES: failing });
    expect(res.status).toBe(502);
    expect(res.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(await res.text()).toBe("Upstream error");
    const getFails = await call({ GUIDES: { ...fakeBucket(), get: failing.get } });
    expect(getFails.status).toBe(502);
  });

  it("answers 404 when get finds nothing after head", async () => {
    const res = await call({ GUIDES: { ...fakeBucket(), get: async () => null } });
    expect(res.status).toBe(404);
  });

  it("reads the dataset by default", async () => {
    const [first] = data.guides;
    const key = `${first.slug}/${first.version}.pdf`;
    const handler = createGuidesHandler();
    const res = await handler({ request: new Request(`${ORIGIN}/api/guides/${first.slug}`), env: { GUIDES: fakeBucket({ [key]: BYTES }) }, waitUntil: () => undefined });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toBe(`inline; filename="${first.file}"`);
  });
});

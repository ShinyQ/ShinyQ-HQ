import { describe, expect, it } from "vitest";
import { bucketOf, sumByBucket } from "../../scripts/measure-delivery";

const at = (path: string, transferSize: number, responseEnd: number) => ({ url: `http://127.0.0.1:4430${path}`, transferSize, startTime: 0, responseEnd });

describe("measure-delivery", () => {
  it("buckets requests by what they are", () => {
    expect(bucketOf("http://x/_next/static/chunks/a1.js")).toBe("js");
    expect(bucketOf("http://x/_next/static/chunks/a1.css")).toBe("css");
    expect(bucketOf("http://x/_next/static/media/inter.woff2")).toBe("page-fonts");
    expect(bucketOf("http://x/fonts/3d/inter-latin-400-normal.0a1b2c3d.woff")).toBe("troika-fonts");
    expect(bucketOf("http://x/data/rooms/en.json")).toBe("rooms");
    expect(bucketOf("http://x/data/hud/index.json?v=1")).toBe("data");
    expect(bucketOf("http://x/en/labs.txt?_rsc=1")).toBe("rsc-prefetch");
    expect(bucketOf("http://x/media/voice-ai-contact-center/01-landing.thumb.webp")).toBe("images");
    expect(bucketOf("http://x/en")).toBe("other");
  });

  it("sums transfer bytes per bucket up to a time", () => {
    const rows = [at("/a.js", 100, 10), at("/b.js", 50, 30), at("/fonts/3d/x.woff", 20, 20)];
    expect(sumByBucket(rows, 25)).toEqual({ js: 100, "troika-fonts": 20, total: 120 });
    expect(sumByBucket(rows)).toEqual({ js: 150, "troika-fonts": 20, total: 170 });
  });
});

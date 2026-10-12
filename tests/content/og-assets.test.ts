import { existsSync, statSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { OG_PHOTO_PATH, OG_STILLS, ogStillPath } from "@/lib/og-layout";

const file = (publicPath: string) => path.join(process.cwd(), "public", publicPath.replace(/^\//, ""));

describe("OG inputs (bun run og:stills)", () => {
  for (const still of OG_STILLS) {
    it(`floor ${still} is a committed 1200x630 JPEG of at most 320 KB`, async () => {
      const f = file(ogStillPath(still));
      expect(existsSync(f), f).toBe(true);
      expect(await sharp(f).metadata()).toMatchObject({ format: "jpeg", width: 1200, height: 630 });
      expect(statSync(f).size).toBeLessThanOrEqual(320 * 1024);
    });
  }

  it("has the owner's photo as a square 400 px PNG of at most 350 KB", async () => {
    const f = file(OG_PHOTO_PATH);
    expect(existsSync(f), f).toBe(true);
    expect(await sharp(f).metadata()).toMatchObject({ format: "png", width: 400, height: 400 });
    expect(statSync(f).size).toBeLessThanOrEqual(350 * 1024);
  });
});

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FLOOR_IDS } from "@/experience/config";
import { floorThumb } from "@/hud/pads/picker";

/** Elevator picker thumbnails are committed renders (`bun run floor:thumbs`): one small lossy webp per floor. */
const MAX_BYTES = 16 * 1024;

describe("floor picker thumbnails", () => {
  it("has a 320 x 180 webp of at most 16 KB for every floor", () => {
    for (const id of FLOOR_IDS) {
      const bytes = readFileSync(path.join(process.cwd(), "public", floorThumb(id)));
      expect(bytes.toString("latin1", 0, 4), id).toBe("RIFF");
      expect(bytes.toString("latin1", 8, 12), id).toBe("WEBP");
      expect(bytes.toString("latin1", 12, 16), id).toBe("VP8 ");
      expect([bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff], id).toEqual([320, 180]);
      expect(bytes.length, id).toBeLessThanOrEqual(MAX_BYTES);
    }
  });
});

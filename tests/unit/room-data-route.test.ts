import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateStaticParams, GET } from "@/app/data/[...path]/route";
import { buildExperienceData } from "@/content/experience";
import { buildEngineRoomViews, buildFloorRoomViews, buildRoomViews, roomDataVersions } from "@/content/room-views";
import type { RoomViews } from "@/content/room-views/types";
import { LOCALES } from "@/content/schema";
import { ROOM_DATA_FLOORS, ROOMS_FILE, roomFloor, roomsUrl } from "@/hud/drawer/data-path";

const PUBLIC = ["L1", "L2", "L3", "L4", "RF"] as const;

async function get(path: string[]) {
  return GET(new Request(`https://example.test/data/${path.join("/")}`), { params: Promise.resolve({ path }) } as never);
}

async function body(path: string[]) {
  const response = await get(path);
  expect(response.status).toBe(200);
  return { text: await response.clone().text(), views: (await response.json()) as RoomViews };
}

describe("/data/rooms per floor", () => {
  it("names one file per locale and floor, the B1 file keeps its name", () => {
    expect(ROOM_DATA_FLOORS).toEqual([...PUBLIC, "B1"]);
    expect(ROOMS_FILE("en", "L3")).toBe("en-L3.json");
    expect(ROOMS_FILE("id", "RF")).toBe("id-RF.json");
    expect(ROOMS_FILE("en", "B1")).toBe("b1-en.json");
    expect(roomFloor("L3:reactor")).toBe("L3");
    expect(roomFloor("RF:contact")).toBe("RF");
    expect(roomFloor("B1:timeline")).toBe("B1");
    expect(roomsUrl("en", "L1", "abc123")).toBe("/data/rooms/en-L1.json?v=abc123");
    expect(roomsUrl("en", "L1")).toBe("/data/rooms/en-L1.json");
  });

  it("pre-renders every floor file for every locale and no longer the single file", () => {
    const paths = generateStaticParams().map((p) => p.path.join("/"));
    for (const locale of LOCALES) {
      for (const floor of PUBLIC) expect(paths).toContain(`rooms/${locale}-${floor}.json`);
      expect(paths).toContain(`rooms/b1-${locale}.json`);
      expect(paths).not.toContain(`rooms/${locale}.json`);
    }
  });

  for (const locale of LOCALES) {
    it(`splits the ${locale} drawer data so the floor files together equal the single file`, async () => {
      const merged: RoomViews = {};
      for (const floor of PUBLIC) {
        const { views } = await body(["rooms", ROOMS_FILE(locale, floor)]);
        expect(Object.keys(views).length).toBeGreaterThan(0);
        // Each room lands in its own floor's file (the id prefix).
        for (const id of Object.keys(views)) expect(roomFloor(id)).toBe(floor);
        Object.assign(merged, views);
      }
      expect(merged).toEqual(buildRoomViews(locale));
      expect((await body(["rooms", ROOMS_FILE(locale, "B1")])).views).toEqual(buildEngineRoomViews(locale));
    });

    it(`keeps the ${locale} drawer arrows on their floor's file`, () => {
      for (const floor of ROOM_DATA_FLOORS) {
        const views = buildFloorRoomViews(locale, floor);
        for (const view of Object.values(views)) {
          if (view.prev) expect(views[view.prev], `${view.id} prev`).toBeDefined();
          if (view.next) expect(views[view.next], `${view.id} next`).toBeDefined();
        }
      }
    });

    it(`versions each ${locale} floor file by the content hash of its body`, async () => {
      const versions = roomDataVersions(locale);
      expect(Object.keys(versions).sort()).toEqual([...ROOM_DATA_FLOORS].sort());
      for (const floor of ROOM_DATA_FLOORS) {
        const { text } = await body(["rooms", ROOMS_FILE(locale, floor)]);
        expect(versions[floor]).toMatch(/^[0-9a-f]{12}$/);
        expect(versions[floor]).toBe(createHash("sha256").update(text).digest("hex").slice(0, 12));
      }
      expect(new Set(Object.values(versions)).size).toBe(ROOM_DATA_FLOORS.length);
      expect(roomDataVersions(locale)).toEqual(versions);
    });

    it(`hands the ${locale} versions to the 3D view with its page data`, () => {
      const names = { L1: "1", L2: "2", L3: "3", L4: "4", RF: "R" };
      expect(buildExperienceData(locale, names).roomData).toEqual(roomDataVersions(locale));
    });
  }

  it("differs per locale", () => {
    expect(roomDataVersions("en").L3).not.toBe(roomDataVersions("id").L3);
  });

  it("answers 404 for the old single file and unknown files", async () => {
    expect((await get(["rooms", "en.json"])).status).toBe(404);
    expect((await get(["rooms", "en-B1.json"])).status).toBe(404);
    expect((await get(["rooms", "fr-L1.json"])).status).toBe(404);
  });
});

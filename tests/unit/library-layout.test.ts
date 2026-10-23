import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { getContent } from "@/content/load";
import { buildFloorLayouts, READY_FLOORS, ROVER } from "@/experience/config";
import { buildNewsroomLayout } from "@/experience/floors/library/concepts/newsroom";
import { buildLibraryLayout, LIBRARY_CONCEPT } from "@/experience/floors/library/layout";
import { LIBRARY_FLOOR, libraryLayoutInput, type LibraryLayoutInput } from "@/experience/floors/library/model";
import { buildRoomCatalog } from "@/experience/missions/rooms";
import { doorAt } from "@/experience/nav/doors";
import { buildNavGrid, isWalkable } from "@/experience/nav/navgrid";
import { structuralLabels } from "@/hud/index-data";
import { expectSpaceRules } from "../helpers/space";

const FLOOR_NAMES = { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" };
const data = buildExperienceData("en", FLOOR_NAMES);
const input = libraryLayoutInput(data.library);
const layout = buildLibraryLayout(input);

describe("L4 Writing floor (the picked concept)", () => {
  it("is the picked concept's layout, shipped as the L4 floor layout", () => {
    expect(layout.concept).toBe(LIBRARY_CONCEPT);
    expect(layout.stations).toEqual(buildNewsroomLayout(input).stations);
    const floors = buildFloorLayouts(data.years.length, { library: input });
    // buildFloorLayouts adds the elevator call pad (inside the spot the concepts keep free) and the Express Return pad.
    const { pads, ...floor } = floors.L4;
    expect(floor).toEqual(layout.floor);
    expect(pads?.map((p) => p.id)).toEqual(["elevator:L4", "return:L4"]);
    const pad = pads![0].at;
    const zone = LIBRARY_FLOOR.padZone;
    expect(pad.x >= zone.minX && pad.x <= zone.maxX && pad.z >= zone.minZ && pad.z <= zone.maxZ).toBe(true);
    expect(READY_FLOORS).toContain("L4");
  });

  it("passes the space rules with the real content", () => {
    const { floor, network } = layout;
    expectSpaceRules({ bounds: floor.bounds, obstacles: floor.obstacles, doors: floor.doors ?? [], network, start: floor.approach });
  });

  it("gives every L4 room in the catalog a door, except posts on the archive board and the Topic Constellation (its own stop)", () => {
    const catalog = buildRoomCatalog(getContent(), structuralLabels()).filter((r) => r.floor === "L4");
    const doors = new Set((layout.floor.doors ?? []).map((d) => d.room));
    const archived = new Set(layout.archive.map((slug) => `L4:${slug}`));
    for (const room of catalog) expect(doors.has(room.id) || archived.has(room.id) || Boolean(layout.floor.stops?.[room.id]), room.id).toBe(true);
    expect(layout.floor.stops?.["L4:topics"]).toEqual(layout.end?.ringStop);
  });

  it("adds the Study Vault stop (a stop and a camera zone, no catalog room or drawer)", () => {
    const vault = layout.end?.vault;
    expect(vault?.books).toHaveLength(data.library.guides.length);
    expect(layout.floor.stops?.["L4:vault"]).toEqual(vault?.stop);
    expect(layout.floor.viewZones?.some((z) => z.id === "L4:vault")).toBe(true);
    const catalog = buildRoomCatalog(getContent(), structuralLabels());
    expect(catalog.some((r) => r.id === "L4:vault")).toBe(false);
    expect(buildLibraryLayout({ ...input, guides: [] }).floor.stops?.["L4:vault"]).toBeUndefined();
  });

  it("parks rooms without a door at the archive board, or at the overview spot when every post is docked", () => {
    expect(layout.floor.listStop).toEqual(layout.board?.stop ?? layout.floor.spawn);
    const many: LibraryLayoutInput = { ...input, posts: Array.from({ length: LIBRARY_FLOOR.maxPosts + 3 }, (_, i) => ({ slug: `p${i}`, date: "2026-01-01", tags: [], external: false })) };
    const crowded = buildLibraryLayout(many);
    expect(crowded.archive).toHaveLength(3);
    expect(crowded.floor.listStop).toEqual(crowded.board!.stop);
    expect(isWalkable(buildNavGrid(crowded.floor, ROVER.radius), crowded.floor.listStop!)).toBe(true);
  });

  it("builds an empty floor without content (placeholder data in tests)", () => {
    const empty = buildFloorLayouts(8).L4;
    expect(empty.doors).toEqual([]);
    expect(empty.door).toEqual({ x: -24, z: 0 });
    expect(doorAt(empty.doors, empty.spawn)).toBeNull();
  });
});

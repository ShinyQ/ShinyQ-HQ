import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { getContent } from "@/content/load";
import { buildFloorLayouts, READY_FLOORS, ROVER } from "@/experience/config";
import { buildNewsroomLayout } from "@/experience/floors/library/concepts/newsroom";
import { buildLibraryLayout, LIBRARY_CONCEPT } from "@/experience/floors/library/layout";
import { LIBRARY_FLOOR, libraryLayoutInput, roomOfPost, trackRoom } from "@/experience/floors/library/model";
import { baySlots } from "@/experience/floors/library/slots";
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

  it("gives every L4 room in the catalog a door or a stop (posts on their bay, the Topic Constellation on its own)", () => {
    const catalog = buildRoomCatalog(getContent(), structuralLabels()).filter((r) => r.floor === "L4");
    const doors = new Set((layout.floor.doors ?? []).map((d) => d.room));
    for (const room of catalog) expect(doors.has(room.id) || Boolean(layout.floor.stops?.[room.id]), room.id).toBe(true);
    expect(layout.floor.stops?.["L4:topics"]).toEqual(layout.end?.ringStop);
  });

  it("docks one bay per reader track in dataset order, alternating north and south, with no board, archive or year marks", () => {
    expect(data.library.tracks.length).toBeGreaterThan(0);
    expect(layout.bays.map((b) => b.track)).toEqual(data.library.tracks.map((t) => t.slug));
    layout.bays.forEach((bay, i) => {
      const track = data.library.tracks[i];
      expect(bay.room).toBe(trackRoom(track.slug));
      expect(bay.posts).toEqual(track.posts);
      expect(baySlots(bay).map((s) => s.slug)).toEqual(track.posts);
      expect(bay.stop).toEqual(bay.door);
      expect(bay.facing).toEqual({ x: 0, z: i % 2 === 0 ? -1 : 1 });
    });
    expect(layout).not.toHaveProperty("board");
    expect(layout).not.toHaveProperty("archive");
    expect(layout.extras).not.toHaveProperty("years");
    const rooms = (layout.floor.doors ?? []).map((d) => d.room);
    expect(rooms).toEqual([...layout.stations.filter((s) => s.zone === "blog").map((s) => s.room), ...layout.bays.map((b) => b.room), ...layout.stations.filter((s) => s.zone !== "blog").map((s) => s.room)]);
  });

  it("drives each post to its bay door, the featured post to its stage (which also keeps its shelf slot)", () => {
    const stage = layout.stations[0];
    expect(stage.zone).toBe("blog");
    const featured = data.library.posts.find((p) => !p.url)!;
    expect(stage.room).toBe(roomOfPost(featured.slug));
    expect(layout.bays.some((b) => b.posts.includes(featured.slug))).toBe(true);
    expect(layout.floor.stops?.[stage.room]).toBeUndefined();
    for (const bay of layout.bays) for (const slug of bay.posts) if (slug !== featured.slug) expect(layout.floor.stops?.[roomOfPost(slug)], slug).toEqual(bay.door);
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

  it("parks rooms without a door or a stop at the featured stage, or at the overview spot without a hosted post", () => {
    expect(layout.floor.listStop).toEqual(layout.stations[0].door);
    const external = buildLibraryLayout({ ...input, posts: input.posts.map((p) => ({ ...p, external: true })) });
    expect(external.stations.some((s) => s.zone === "blog")).toBe(false);
    expect(external.floor.listStop).toEqual(external.floor.spawn);
    expect(isWalkable(buildNavGrid(layout.floor, ROVER.radius), layout.floor.listStop!)).toBe(true);
    expect(LIBRARY_FLOOR).not.toHaveProperty("maxPosts");
  });

  it("builds an empty floor without content (placeholder data in tests)", () => {
    const empty = buildFloorLayouts(8).L4;
    expect(empty.doors).toEqual([]);
    expect(empty.door).toEqual({ x: -24, z: 0 });
    expect(doorAt(empty.doors, empty.spawn)).toBeNull();
  });
});

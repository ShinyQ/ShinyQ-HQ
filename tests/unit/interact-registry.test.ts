import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import id from "../../messages/id.json";
import { buildExperienceData } from "@/content/experience";
import type { FloorId } from "@/content/schema";
import { buildFloorLayouts, FLOOR_IDS, ROVER } from "@/experience/config";
import { careerLayoutInput } from "@/experience/floors/career/layout";
import { buildLabsLayout } from "@/experience/floors/labs/layout";
import { buildLibraryLayout } from "@/experience/floors/library/layout";
import { libraryLayoutInput } from "@/experience/floors/library/model";
import {
  interactablesFor,
  onInteractablesChange,
  registerExtraInteractables,
  type InteractData,
  type InteractLabels,
  type Interactable,
} from "@/experience/interact/registry";
import { roomTarget } from "@/experience/missions/host3d";
import { buildNavGrid, nearestWalkable } from "@/experience/nav/navgrid";

type Messages = typeof en;
const names = { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" };

function labelsFrom(m: Messages): InteractLabels {
  return {
    elevator: m.hud.pads.floorTitle,
    teleporter: (year) => m.hud.interact.teleporter.replace("{year}", String(year)),
    kiosk: m.hud.launcher.askRover,
    board: (wing) => m.hud.interact.board.replace("{wing}", wing),
    archive: m.hud.interact.archive,
    rooms: m.hud.rooms,
  };
}

function setup(locale: "en" | "id") {
  const experience = buildExperienceData(locale, names);
  const layouts = buildFloorLayouts(experience.years.length, {
    labs: experience.labs.pods,
    career: careerLayoutInput(experience.career),
    library: libraryLayoutInput(experience.library),
  });
  const data: InteractData = { experience, labels: labelsFrom((locale === "en" ? en : id) as Messages) };
  const items = Object.fromEntries(FLOOR_IDS.map((f) => [f, interactablesFor(f, layouts, data)])) as Record<FloorId, Interactable[]>;
  return { experience, layouts, data, items };
}

const { experience, layouts, data, items } = setup("en");
const find = (floor: FloorId, key: string) => items[floor].find((i) => i.id === key);

describe("interactablesFor on the real content", () => {
  it("puts the elevator call pad first on every floor, and it opens the floor picker", () => {
    for (const floor of FLOOR_IDS) {
      const [first] = items[floor];
      expect(first.id, floor).toBe(`${floor}:pad:elevator`);
      expect(first.kind).toBe("elevator-pad");
      expect(first.action).toEqual({ type: "elevator-picker" });
      expect(first.at).toEqual(layouts[floor].approach);
      expect(first.label).toBe(en.hud.pads.floorTitle);
    }
  });

  it("adds one teleporter per year on L2 that opens the year picker from its own year", () => {
    const teleporters = items.L2.filter((i) => i.kind === "teleporter");
    expect(teleporters.map((t) => t.action)).toEqual(experience.years.map((year) => ({ type: "teleport-picker", year })));
    for (const t of teleporters) {
      const year = (t.action as { year: number }).year;
      const pad = layouts.L2.pads!.find((p) => p.year === year)!;
      expect(t.id).toBe(`L2:teleporter:${year}`);
      expect(t.at).toEqual(pad.at);
      expect(t.label).toBe(`Teleporter ${year}`);
    }
    for (const floor of ["L1", "L3", "L4", "RF"] as const) expect(items[floor].some((i) => i.kind === "teleporter"), floor).toBe(false);
  });

  it("turns every door into a target that drives to the door pad and opens its room", () => {
    for (const floor of FLOOR_IDS) {
      for (const door of layouts[floor].doors ?? []) {
        const kind = floor === "RF" ? "station" : "door";
        const item = find(floor, `${floor}:${kind}:${door.room.slice(3)}`);
        expect(item, door.room).toBeDefined();
        expect(item!.kind).toBe(kind);
        expect(item!.action).toEqual({ type: "open-room", room: door.room });
        expect(item!.at).toEqual(door.at);
        expect(item!.at).toEqual(roomTarget(undefined, door.room, layouts, experience.years));
      }
    }
  });

  it("gives every career room and every docked pod a target, including the newest content", () => {
    const careerRooms = experience.career.years.flatMap((y) => y.entries.map((e) => `L2:door:${e.slug}`));
    const docked = buildLabsLayout(experience.labs.pods).placed.map((p) => `L3:door:${p.pod.slug}`);
    const ids = (floor: FloorId) => new Set(items[floor].map((i) => i.id));
    for (const id of careerRooms) expect(ids("L2").has(id), id).toBe(true);
    for (const id of docked) expect(ids("L3").has(id), id).toBe(true);
    expect(ids("L2").has("L2:door:serupa-2025")).toBe(true);
    expect(ids("L3").has("L3:door:event-ticketing-platform")).toBe(true);
  });

  it("names rooms after their content", () => {
    for (const p of buildLabsLayout(experience.labs.pods).placed) expect(find("L3", `L3:door:${p.pod.slug}`)?.label).toBe(p.pod.title);
    for (const s of buildLibraryLayout(libraryLayoutInput(experience.library)).stations) {
      const post = experience.library.posts.find((x) => `L4:${x.slug}` === s.room);
      if (post) expect(find("L4", `L4:door:${post.slug}`)?.label).toBe(post.title);
    }
    expect(experience.library.research.length).toBeGreaterThan(0);
    expect(find("L4", "L4:door:research")?.label).toBe(en.hud.rooms.research);
    const entry = experience.career.years[0].entries[0];
    expect(find("L2", `L2:door:${entry.slug}`)?.label).toContain(entry.role);
    expect(find("L2", "L2:door:workshop")?.label).toBe(en.hud.rooms.workshop);
    expect(find("RF", "RF:station:contact")?.label).toBe(en.hud.rooms.contact);
    expect(find("RF", "RF:station:cv")?.label).toBe(en.hud.rooms.cv);
  });

  it("adds the L1 profile hologram, skills wall and Ask Rover kiosk", () => {
    expect(items.L1.map((i) => i.id)).toEqual(["L1:pad:elevator", "L1:station:profile", "L1:station:skills", "L1:kiosk:ask-rover"]);
    expect(find("L1", "L1:station:profile")!.at).toEqual(roomTarget(undefined, "L1:profile", layouts, experience.years));
    expect(find("L1", "L1:station:skills")!.action).toEqual({ type: "open-room", room: "L1:skills" });
    const kiosk = find("L1", "L1:kiosk:ask-rover")!;
    expect(kiosk.kind).toBe("kiosk");
    expect(kiosk.action).toEqual({ type: "command", command: "terminal" });
    expect(kiosk.label).toBe(en.hud.launcher.askRover);
  });

  it("adds both L3 wing directory boards, which open the projects palette from their stop", () => {
    const labs = buildLabsLayout(experience.labs.pods);
    for (const wing of ["software", "ai"] as const) {
      const board = find("L3", `L3:board:${wing}`)!;
      expect(board.kind).toBe("board");
      expect(board.action).toEqual({ type: "command", command: "palette:pods" });
      expect(board.at).toEqual(labs.boards[wing].stop);
      expect(board.label).toBe(`${experience.labs.wings[wing]} directory`);
    }
  });

  it("adds the L4 archive board only while older posts overflow the floor", () => {
    const library = buildLibraryLayout(libraryLayoutInput(experience.library));
    const board = find("L4", "L4:board:archive");
    if (library.board) {
      expect(board?.action).toEqual({ type: "command", command: "palette:posts" });
      expect(board?.at).toEqual(library.board.stop);
    } else {
      expect(board).toBeUndefined();
    }
  });

  it("keeps ids unique, footprints on the slab and every approach point on drivable floor", () => {
    for (const floor of FLOOR_IDS) {
      const list = items[floor];
      expect(new Set(list.map((i) => i.id)).size, floor).toBe(list.length);
      const grid = buildNavGrid(layouts[floor], ROVER.radius);
      const slab = layouts[floor].bounds;
      for (const item of list) {
        expect(item.floor, item.id).toBe(floor);
        expect(item.label.trim(), item.id).not.toBe("");
        const b = item.bounds;
        expect(b.maxX - b.minX, item.id).toBeGreaterThan(0);
        expect(b.maxZ - b.minZ, item.id).toBeGreaterThan(0);
        expect(b.minX, item.id).toBeGreaterThanOrEqual(slab.minX - 1e-6);
        expect(b.maxX, item.id).toBeLessThanOrEqual(slab.maxX + 1e-6);
        expect(b.minZ, item.id).toBeGreaterThanOrEqual(slab.minZ - 1e-6);
        expect(b.maxZ, item.id).toBeLessThanOrEqual(slab.maxZ + 1e-6);
        expect(item.height ?? 1, item.id).toBeGreaterThan(0);
        const near = nearestWalkable(grid, item.at);
        expect(near, item.id).not.toBeNull();
        expect(Math.hypot(near!.x - item.at.x, near!.z - item.at.z), item.id).toBeLessThanOrEqual(1.5);
      }
    }
  });

  it("resolves every label in the active locale", () => {
    const indonesian = setup("id");
    expect(indonesian.items.L1[0].label).toBe(id.hud.pads.floorTitle);
    expect(indonesian.items.L1.find((i) => i.id === "L1:station:profile")!.label).toBe(id.hud.rooms.profile);
    expect(indonesian.items.L1.find((i) => i.id === "L1:kiosk:ask-rover")!.label).toBe(id.hud.launcher.askRover);
    expect(indonesian.items.L3.find((i) => i.id === "L3:board:software")!.label).toBe(`Direktori ${indonesian.experience.labs.wings.software}`);
  });
});

describe("registerExtraInteractables", () => {
  const hall: Interactable = {
    id: "L1:station:highlights-demo",
    floor: "L1",
    kind: "station",
    label: "Demo",
    at: { x: 0, z: 12 },
    bounds: { minX: -1, maxX: 1, minZ: 13, maxZ: 15 },
    height: 3,
    action: { type: "command", command: "palette:pods" },
  };

  it("adds extra targets to their floor until disposed, and tells listeners", () => {
    let calls = 0;
    const off = onInteractablesChange(() => calls++);
    const dispose = registerExtraInteractables("L1", [hall]);
    const withHall = interactablesFor("L1", layouts, data);
    expect(withHall[withHall.length - 1]).toEqual(hall);
    expect(interactablesFor("L3", layouts, data).some((i) => i.id === hall.id)).toBe(false);
    dispose();
    expect(interactablesFor("L1", layouts, data).some((i) => i.id === hall.id)).toBe(false);
    expect(calls).toBe(2);
    off();
  });

  it("keeps the built-in target when an extra reuses its id", () => {
    const dispose = registerExtraInteractables("L1", [{ ...hall, id: "L1:kiosk:ask-rover", label: "Clash" }]);
    expect(interactablesFor("L1", layouts, data).filter((i) => i.id === "L1:kiosk:ask-rover").map((i) => i.label)).toEqual([en.hud.launcher.askRover]);
    dispose();
  });

  it("refuses items that belong to another floor", () => {
    expect(() => registerExtraInteractables("L3", [hall])).toThrow(/L1:station:highlights-demo/);
  });
});

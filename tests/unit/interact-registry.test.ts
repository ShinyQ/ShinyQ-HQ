import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import id from "../../messages/id.json";
import { buildExperienceData } from "@/content/experience";
import type { FloorId } from "@/content/schema";
import { buildFloorLayouts, FLOOR_IDS, LOBBY, ROVER } from "@/experience/config";
import { buildCareerRoad, careerLayoutInput } from "@/experience/floors/career/layout";
import { OPS } from "@/experience/floors/labs/ops";
import { buildLabsLayout, LABS } from "@/experience/floors/labs/layout";
import { highlightsInteractables } from "@/experience/floors/lobby/hallInteract";
import { HALL_LAYOUT } from "@/experience/floors/lobby/hallLayout";
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
import { pickVolume, volumePoint } from "@/experience/interact/pick";
import { roomTarget } from "@/experience/missions/host3d";
import { buildNavGrid, nearestWalkable } from "@/experience/nav/navgrid";

type Messages = typeof en;
const names = { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" };

function labelsFrom(m: Messages): InteractLabels {
  return {
    elevator: m.hud.pads.floorTitle,
    returnPad: m.hud.interact.returnPad,
    teleporter: (year) => m.hud.interact.teleporter.replace("{year}", String(year)),
    console: m.hud.interact.console,
    kiosk: m.hud.launcher.roverMenu,
    board: (wing) => m.hud.interact.board.replace("{wing}", wing),
    archive: m.hud.interact.archive,
    rooms: m.hud.rooms,
    reactorRing: (ring) => m.labs.reactor.ringTarget.replace("{ring}", m.labs.reactor.rings[ring]),
    metrics: m.library.topics.monument.target,
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

  it("adds the Express Return pad on L2, L3 and L4 right after the elevator pad, and it beams home", () => {
    for (const floor of ["L2", "L3", "L4"] as const) {
      const back = items[floor][1];
      expect(back.id, floor).toBe(`${floor}:pad:return`);
      expect(back.kind).toBe("return-pad");
      expect(back.label).toBe("Back to elevator");
      expect(back.action).toEqual({ type: "return-beam" });
      expect(back.at).toEqual(layouts[floor].returnPad);
    }
    for (const floor of ["L1", "RF"] as const) expect(items[floor].some((i) => i.kind === "return-pad"), floor).toBe(false);
    const idItems = setup("id").items;
    expect(idItems.L2.find((i) => i.kind === "return-pad")?.label).toBe("Kembali ke lift");
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
    // L1 doors are the Highlights Hall stations: the hall registers them itself while it is mounted
    // (registerExtraInteractables, see hallInteract.ts), so L1 is checked with that registration.
    const dispose = registerExtraInteractables(
      "L1",
      highlightsInteractables(HALL_LAYOUT, {
        about: en.hud.rooms.highlightsAbout,
        projects: en.hud.rooms.highlightsProjects,
        experience: en.hud.rooms.highlightsExperience,
        contact: en.hud.rooms.highlightsContact,
      }),
    );
    const withHall = { ...items, L1: interactablesFor("L1", layouts, data) };
    dispose();
    // Plus the Visitor Observatory's door (lobbyItems, `L1:station:visits`).
    expect(layouts.L1.doors?.length).toBe(HALL_LAYOUT.stations.length + 1);
    for (const floor of FLOOR_IDS) {
      for (const door of layouts[floor].doors ?? []) {
        const kind = floor === "RF" || floor === "L1" ? "station" : "door";
        const item = withHall[floor].find((i) => i.id === `${floor}:${kind}:${door.room.slice(3)}`);
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

  it("makes the Ops Control Room a point-and-go door over its whole footprint", () => {
    const labs = buildLabsLayout(experience.labs.pods);
    const ops = find("L3", "L3:door:ops")!;
    expect(ops).toMatchObject({ kind: "door", label: en.hud.rooms.ops, action: { type: "open-room", room: "L3:ops" }, height: OPS.h });
    expect(ops.at).toEqual(labs.ops.door);
    expect(ops.bounds.minX).toBe(labs.ops.rect.minX);
    expect(ops.bounds.minZ).toBe(labs.ops.rect.minZ);
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
    expect(find("L2", "L2:station:workshop")?.label).toBe(en.hud.rooms.workshop);
    expect(find("RF", "RF:station:contact")?.label).toBe(en.hud.rooms.contact);
    expect(find("RF", "RF:station:cv")?.label).toBe(en.hud.rooms.cv);
    // The Visitor Observatory moved to the Lobby's south-west corner (owner decision 2026-10-14).
    expect(find("RF", "RF:station:visits")).toBeUndefined();
    expect(find("L1", "L1:station:visits")?.label).toBe(en.hud.rooms.visits);
    expect(find("L1", "L1:station:visits")?.action).toEqual({ type: "open-room", room: "L1:visits" });
  });

  it("adds the L2 Workshop: gateway, time console, one target per bench and per skyline bar", () => {
    const career = buildCareerRoad(careerLayoutInput(experience.career));
    const gateway = find("L2", "L2:station:workshop")!;
    expect(gateway.action).toEqual({ type: "open-room", room: "L2:workshop" });
    expect(gateway.at).toEqual(roomTarget(undefined, "L2:workshop", layouts, experience.years));
    const consoleItem = find("L2", "L2:station:time-console")!;
    expect(consoleItem.label).toBe(en.hud.interact.console);
    expect(consoleItem.action).toEqual({ type: "console-picker" });
    expect(consoleItem.at).toEqual(career.workshop.console.stop);
    for (const p of experience.career.sideProjects) {
      const bench = find("L2", `L2:station:bench-${p.id}`)!;
      expect(bench.label).toBe(p.title);
      expect(bench.action).toEqual({ type: "open-room", room: `L2:side-${p.id}` });
      expect(bench.at).toEqual(roomTarget(undefined, `L2:side-${p.id}`, layouts, experience.years));
    }
    for (const r of experience.career.repos) {
      const bar = find("L2", `L2:station:repo-${r.slug}`)!;
      expect(bar.label).toBe(r.name);
      expect(bar.action).toEqual({ type: "open-room", room: `L2:repo-${r.slug}` });
      expect(bar.at).toEqual(roomTarget(undefined, `L2:repo-${r.slug}`, layouts, experience.years));
    }
    // Unique ids across the floor.
    expect(new Set(items.L2.map((i) => i.id)).size).toBe(items.L2.length);
  });

  it("adds the L1 profile hologram, skills wall, Rover menu kiosk and Visitor Observatory", () => {
    expect(items.L1.map((i) => i.id)).toEqual(["L1:pad:elevator", "L1:station:profile", "L1:station:skills", "L1:kiosk:ask-rover", "L1:station:visits"]);
    const visits = find("L1", "L1:station:visits")!;
    expect(visits.at).toEqual(layouts.L1.doors!.find((d) => d.room === "L1:visits")!.at);
    expect(visits.height).toBe(LOBBY.observatory.h);
    expect(find("L1", "L1:station:profile")!.at).toEqual(roomTarget(undefined, "L1:profile", layouts, experience.years));
    expect(find("L1", "L1:station:skills")!.action).toEqual({ type: "open-room", room: "L1:skills" });
    const kiosk = find("L1", "L1:kiosk:ask-rover")!;
    expect(kiosk.kind).toBe("kiosk");
    expect(kiosk.action).toEqual({ type: "command", command: "terminal" });
    expect(kiosk.label).toBe(en.hud.launcher.roverMenu);
  });

  it("adds all three raised L3 directory boards, which open the projects palette from their stop", () => {
    const labs = buildLabsLayout(experience.labs.pods);
    for (const wing of ["software", "ai", "data"] as const) {
      const board = find("L3", `L3:board:${wing}`)!;
      expect(board.kind).toBe("board");
      expect(board.base).toBe(LABS.board.base);
      expect(board.height).toBe(LABS.board.h);
      expect(board.action).toEqual({ type: "command", command: "palette:pods" });
      expect(board.at).toEqual(labs.boards[wing].stop);
      expect(board.label).toBe(`${experience.labs.wings[wing]} directory`);
    }
  });

  it("gives every L3 board its turned footprint, so the pick volume and the outline cover the board itself", () => {
    const labs = buildLabsLayout(experience.labs.pods);
    for (const wing of ["software", "ai", "data"] as const) {
      const b = labs.boards[wing];
      const item = find("L3", `L3:board:${wing}`)!;
      expect(item.box).toEqual({ center: b.center, w: LABS.board.w, d: LABS.board.width, yaw: b.yaw + Math.PI / 2 });
      const v = pickVolume(item);
      expect(v.size).toEqual([LABS.board.w, LABS.board.h - LABS.board.base, LABS.board.width]);
      expect(v.yaw).toBe(b.yaw + Math.PI / 2);
      expect(v.center).toEqual([b.center.x, (LABS.board.base + LABS.board.h) / 2, b.center.z]);
      const corners = [0, 1].flatMap((fx) => [0, 1].map((fz) => volumePoint(v, fx, 0, fz)));
      const expected = [-1, 1].flatMap((sn) =>
        [-1, 1].map((sa) => ({
          x: b.center.x + b.along.x * sa * (LABS.board.width / 2) + b.normal.x * sn * (LABS.board.w / 2),
          z: b.center.z + b.along.z * sa * (LABS.board.width / 2) + b.normal.z * sn * (LABS.board.w / 2),
        })),
      );
      for (const e of expected) {
        const hit = corners.find(([x, , z]) => Math.abs(x - e.x) < 1e-6 && Math.abs(z - e.z) < 1e-6);
        expect(hit, `${wing} corner ${e.x},${e.z}`).toBeDefined();
      }
      for (const [, y] of corners) expect(y).toBeCloseTo(LABS.board.base, 9);
    }
  });

  it("keeps every other target axis-aligned (no box, yaw 0)", () => {
    for (const floor of FLOOR_IDS) {
      for (const item of items[floor]) {
        if (item.kind === "board" && item.floor === "L3") continue;
        expect(item.box, item.id).toBeUndefined();
        expect(pickVolume(item).yaw, item.id).toBe(0);
      }
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

  it("adds the L4 Topic Constellation pedestal and the research monument", () => {
    const library = buildLibraryLayout(libraryLayoutInput(experience.library));
    const topics = find("L4", "L4:station:topics")!;
    expect(topics).toMatchObject({ kind: "station", label: "Topic Constellation", action: { type: "open-room", room: "L4:topics" } });
    expect(topics.at).toEqual(library.end!.ringStop);
    expect(topics.bounds).toEqual(library.end!.core);
    expect(roomTarget(undefined, "L4:topics", layouts, experience.years)).toEqual(library.end!.ringStop);
    const monument = find("L4", "L4:station:metrics")!;
    expect(monument).toMatchObject({ kind: "station", label: "Research metrics", action: { type: "command", command: "open:L4:research" } });
    expect(monument.at).toEqual(library.end!.monument!.stop);
    expect(setup("id").items.L4.find((i) => i.id === "L4:station:topics")?.label).toBe("Konstelasi Topik");
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
    expect(indonesian.items.L1.find((i) => i.id === "L1:kiosk:ask-rover")!.label).toBe(id.hud.launcher.roverMenu);
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
    expect(interactablesFor("L1", layouts, data).filter((i) => i.id === "L1:kiosk:ask-rover").map((i) => i.label)).toEqual([en.hud.launcher.roverMenu]);
    dispose();
  });

  it("refuses items that belong to another floor", () => {
    expect(() => registerExtraInteractables("L3", [hall])).toThrow(/L1:station:highlights-demo/);
  });
});

describe("Tech Reactor rings", () => {
  const rings = items.L3.filter((i) => i.id.startsWith("L3:station:reactor-"));
  const labs = buildLabsLayout(experience.labs.pods);

  it("stacks one target per ring over the core, from the floor up, each opening the drawer on its ring", () => {
    expect(rings.map((r) => r.id)).toEqual(["devops", "data", "backend", "frontend", "azure", "ai"].map((r) => `L3:station:reactor-${r}`));
    expect(rings[0].base).toBe(0);
    rings.forEach((r, i) => {
      expect(r.kind).toBe("station");
      expect(r.action).toEqual({ type: "command", command: `reactor:${r.id.slice("L3:station:reactor-".length)}` });
      expect(r.height!).toBeGreaterThan(r.base!);
      if (i > 0) expect(r.base).toBe(rings[i - 1].height);
      const c = labs.reactor.center;
      expect((r.bounds.minX + r.bounds.maxX) / 2).toBeCloseTo(c.x);
      expect((r.bounds.minZ + r.bounds.maxZ) / 2).toBeCloseTo(c.z);
      expect(r.at).toEqual(layouts.L3.stops?.["L3:reactor"]);
    });
    expect(rings.find((r) => r.id.endsWith("azure"))?.label).toBe("Tech Reactor: Azure");
  });

  it("drives to the reactor stop for the reactor room, on walkable floor", () => {
    const stop = roomTarget(undefined, "L3:reactor", layouts, experience.years);
    expect(stop).toEqual(layouts.L3.stops?.["L3:reactor"]);
    const grid = buildNavGrid(layouts.L3, ROVER.radius);
    const near = nearestWalkable(grid, stop);
    expect(Math.hypot(near!.x - stop.x, near!.z - stop.z)).toBeLessThan(0.5);
  });

  it("speaks Indonesian", () => {
    const idItems = setup("id").items.L3;
    expect(idItems.find((i) => i.id === "L3:station:reactor-ai")?.label).toBe("Reaktor Teknologi: AI dan LLM");
  });
});

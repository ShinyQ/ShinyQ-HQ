import { describe, expect, it, vi } from "vitest";
import type { MissionStep } from "@/content/schema";
import {
  canPoint,
  clickDecision,
  HIGHLIGHT_MARGIN,
  highlightOpacity,
  highlightVolume,
  isDragClick,
  LABEL_HEIGHT,
  LABEL_PAD_HEIGHT,
  labelAnchor,
  parseCommand,
  performInteract,
  PICK_HEIGHT,
  pickVolume,
  REACH,
  volumePoint,
  reach,
  type InteractDeps,
} from "@/experience/interact/pick";
import type { Interactable } from "@/experience/interact/registry";
import { PAD, type PickerRequest } from "@/experience/nav/pads";
import { wallSolids } from "@/experience/floors/labs/directory";
import { directoryBoard, LABS, LABS_WINGS } from "@/experience/floors/labs/layout";

const pod: Interactable = {
  id: "L3:door:demo",
  floor: "L3",
  kind: "door",
  label: "Demo",
  at: { x: 10, z: 2 },
  bounds: { minX: 6, maxX: 14, minZ: 3, maxZ: 10 },
  height: 2.6,
  action: { type: "open-room", room: "L3:demo" },
};
const lift: Interactable = {
  id: "L3:pad:elevator",
  floor: "L3",
  kind: "elevator-pad",
  label: "Take the elevator",
  at: { x: -21, z: 0 },
  bounds: { minX: -22.5, maxX: -19.5, minZ: -1.5, maxZ: 1.5 },
  action: { type: "elevator-picker" },
};
const teleporter: Interactable = {
  ...lift,
  id: "L2:teleporter:2021",
  floor: "L2",
  kind: "teleporter",
  label: "Teleporter 2021",
  at: { x: 40, z: 6.5 },
  bounds: { minX: 38.5, maxX: 41.5, minZ: 5, maxZ: 8 },
  action: { type: "teleport-picker", year: 2021 },
};
const back: Interactable = {
  ...lift,
  id: "L2:pad:return",
  floor: "L2",
  kind: "return-pad",
  label: "Back to elevator",
  at: { x: 336, z: 8 },
  bounds: { minX: 334.6, maxX: 337.4, minZ: 6.6, maxZ: 9.4 },
  action: { type: "return-beam" },
};
const board: Interactable = { ...pod, id: "L3:board:software", kind: "board", label: "Product Engineering directory", at: { x: -10.7, z: -9.5 }, action: { type: "command", command: "palette:pods" } };

function deps(over: Partial<InteractDeps> = {}): InteractDeps {
  return {
    rover: () => ({ x: 0, z: 0 }),
    goToRoom: vi.fn(),
    runSteps: vi.fn(async () => "done" as const),
    openPicker: vi.fn(),
    command: vi.fn(),
    beamHome: vi.fn(),
    ...over,
  };
}

describe("pick volumes", () => {
  it("stands a box on the footprint, as tall as the target", () => {
    expect(pickVolume(pod)).toEqual({ center: [10, 1.3, 6.5], size: [8, 2.6, 7], yaw: 0 });
  });

  it("lifts stacked targets off the floor from their base", () => {
    expect(pickVolume({ ...pod, base: 4, height: 6 })).toEqual({ center: [10, 5, 6.5], size: [8, 2, 7], yaw: 0 });
  });

  it("turns the box with an oriented footprint, which wins over the bounds", () => {
    const turned = { ...pod, box: { center: { x: 3, z: -2 }, w: 0.6, d: 9, yaw: 1.2 } };
    expect(pickVolume(turned)).toEqual({ center: [3, 1.3, -2], size: [0.6, 2.6, 9], yaw: 1.2 });
  });

  it("maps volume fractions through the yaw (three's rotation.y: local x to (cos, -sin), local z to (sin, cos))", () => {
    const flat = pickVolume(pod);
    expect(volumePoint(flat, 0, 0, 1)).toEqual([6, 0, 10]);
    const v = { center: [1, 2, 3] as [number, number, number], size: [2, 4, 6] as [number, number, number], yaw: Math.PI / 2 };
    const [x, y, z] = volumePoint(v, 1, 1, 0.5);
    expect(x).toBeCloseTo(1, 9);
    expect(y).toBeCloseTo(4, 9);
    expect(z).toBeCloseTo(2, 9);
    const [x2, , z2] = volumePoint(v, 0.5, 0, 1);
    expect(x2).toBeCloseTo(4, 9);
    expect(z2).toBeCloseTo(3, 9);
  });

  it("falls back to the kind's height", () => {
    expect(pickVolume(lift).size[1]).toBe(PICK_HEIGHT["elevator-pad"]);
  });

  it("floats the name tag over the approach point, above the icon on pads", () => {
    expect(labelAnchor(pod)).toEqual([pod.at.x, LABEL_HEIGHT, pod.at.z]);
    expect(labelAnchor(lift)).toEqual([lift.at.x, LABEL_PAD_HEIGHT, lift.at.z]);
    expect(labelAnchor(back)).toEqual([back.at.x, LABEL_PAD_HEIGHT, back.at.z]);
    expect(LABEL_PAD_HEIGHT).toBeGreaterThan(LABEL_HEIGHT);
  });
});

describe("isDragClick", () => {
  it("keeps a short press a click or a tap and turns a longer one into a drag", () => {
    expect(isDragClick(6, "mouse")).toBe(false);
    expect(isDragClick(6.5, "mouse")).toBe(true);
    expect(isDragClick(7, "pen")).toBe(true);
    expect(isDragClick(8, "touch")).toBe(false);
    expect(isDragClick(9, "touch")).toBe(true);
    expect(isDragClick(7, "")).toBe(true);
  });
});

describe("canPoint", () => {
  const base = { phase: "explore", ride: null, beam: null, picker: null };

  it("points while exploring or with a room open", () => {
    expect(canPoint(base)).toBe(true);
    expect(canPoint({ ...base, phase: "room" })).toBe(true);
  });

  it("never during the boot, the intro, a ride, a beam, a picker or another overlay", () => {
    for (const phase of ["boot", "intro", "elevator", "hologram", "terminal", "palette", "static"]) expect(canPoint({ ...base, phase }), phase).toBe(false);
    expect(canPoint({ ...base, ride: {} })).toBe(false);
    expect(canPoint({ ...base, beam: {} })).toBe(false);
    expect(canPoint({ ...base, picker: { kind: "floor" } })).toBe(false);
  });
});

describe("clickDecision", () => {
  it("goes at once with a mouse or a pen", () => {
    expect(clickDecision(null, pod, "mouse")).toBe("go");
    expect(clickDecision({ item: pod, via: "pointer" }, pod, "pen")).toBe("go");
  });

  it("selects on the first tap and goes on a second tap of the same target", () => {
    expect(clickDecision(null, pod, "touch")).toBe("select");
    expect(clickDecision({ item: pod, via: "tap" }, pod, "touch")).toBe("go");
  });

  it("moves the selection when another target is tapped, and never goes from a mouse hover", () => {
    expect(clickDecision({ item: lift, via: "tap" }, pod, "touch")).toBe("select");
    expect(clickDecision({ item: pod, via: "pointer" }, pod, "touch")).toBe("select");
  });
});

describe("highlightOpacity", () => {
  it("holds still under reduced motion", () => {
    expect(highlightOpacity(0, true)).toBe(0.9);
    expect(highlightOpacity(1.3, true)).toBe(0.9);
  });

  it("pulses gently otherwise", () => {
    const values = [0, 0.2, 0.4, 0.8].map((t) => highlightOpacity(t, false));
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(0.4);
      expect(v).toBeLessThanOrEqual(0.9);
    }
    expect(new Set(values).size).toBeGreaterThan(1);
  });
});

describe("parseCommand", () => {
  it("knows the Rover menu, the palettes and the CV viewer", () => {
    expect(parseCommand("terminal")).toEqual({ type: "terminal" });
    expect(parseCommand("cv")).toEqual({ type: "cv" });
    expect(parseCommand("palette:pods")).toEqual({ type: "palette", filter: "pods" });
    expect(parseCommand("palette:posts")).toEqual({ type: "palette", filter: "posts" });
    expect(parseCommand("palette:rooms")).toEqual({ type: "palette", filter: "rooms" });
  });

  it("opens the Tech Reactor on a ring", () => {
    expect(parseCommand("reactor:azure")).toEqual({ type: "reactor", ring: "azure" });
    expect(parseCommand("reactor:nope")).toBeNull();
  });

  it("opens a room's drawer in place", () => {
    expect(parseCommand("open:L4:research")).toEqual({ type: "open", room: "L4:research" });
    expect(parseCommand("open:L9:research")).toBeNull();
    expect(parseCommand("open:L4:")).toBeNull();
  });

  it("ignores anything else", () => {
    expect(parseCommand("palette:nope")).toBeNull();
    expect(parseCommand("launch")).toBeNull();
    expect(parseCommand("")).toBeNull();
  });
});

describe("reach", () => {
  it("counts the whole pad as arrived, and a short radius elsewhere", () => {
    expect(reach(lift)).toBe(PAD.radius);
    expect(reach(teleporter)).toBe(PAD.radius);
    expect(reach(back)).toBe(PAD.radius);
    expect(reach(board)).toBe(REACH.point);
  });
});

describe("performInteract", () => {
  it("sends rooms through goToRoom (elevator, drive along the road, open)", async () => {
    const d = deps();
    await expect(performInteract(pod, d)).resolves.toBe("done");
    expect(d.goToRoom).toHaveBeenCalledWith("L3:demo");
    expect(d.runSteps).not.toHaveBeenCalled();
  });

  it("drives to a pad before it opens the floor picker", async () => {
    const order: string[] = [];
    const d = deps({
      runSteps: vi.fn(async (id: string, steps: readonly MissionStep[]) => {
        order.push(`drive ${id} ${JSON.stringify(steps)}`);
        return "done" as const;
      }),
      openPicker: vi.fn((picker: PickerRequest) => void order.push(`picker ${JSON.stringify(picker)}`)),
    });
    await expect(performInteract(lift, d)).resolves.toBe("done");
    expect(order).toEqual([`drive interact:L3:pad:elevator ${JSON.stringify([{ kind: "drive", to: { x: -21, z: 0 } }])}`, `picker {"kind":"floor"}`]);
  });

  it("opens the year picker at once when the rover already stands on the teleporter", async () => {
    const d = deps({ rover: () => ({ x: 40.5, z: 7 }) });
    await expect(performInteract(teleporter, d)).resolves.toBe("done");
    expect(d.runSteps).not.toHaveBeenCalled();
    expect(d.openPicker).toHaveBeenCalledWith({ kind: "year", from: 2021 });
  });

  it("drives onto a Return pad, then beams home once", async () => {
    const order: string[] = [];
    const d = deps({
      runSteps: vi.fn(async (id: string) => {
        order.push(`drive ${id}`);
        return "done" as const;
      }),
      beamHome: vi.fn(() => void order.push("beam")),
    });
    await expect(performInteract(back, d)).resolves.toBe("done");
    expect(order).toEqual(["drive interact:L2:pad:return", "beam"]);
    expect(d.openPicker).not.toHaveBeenCalled();
  });

  it("beams home at once when the rover already stands on the Return pad", async () => {
    const d = deps({ rover: () => ({ x: 336.5, z: 8.5 }) });
    await performInteract(back, d);
    expect(d.runSteps).not.toHaveBeenCalled();
    expect(d.beamHome).toHaveBeenCalledTimes(1);
  });

  it("drives to the time console stop, then opens the console picker", async () => {
    const consoleItem: Interactable = { ...teleporter, id: "L2:station:time-console", kind: "station", at: { x: 350, z: -8 }, action: { type: "console-picker" } };
    const d = deps();
    await performInteract(consoleItem, d);
    expect(d.runSteps).toHaveBeenCalledWith("interact:L2:station:time-console", [{ kind: "drive", to: { x: 350, z: -8 } }]);
    expect(d.openPicker).toHaveBeenCalledWith({ kind: "console" });
  });

  it("does nothing more when the drive is cancelled by manual input", async () => {
    const d = deps({ runSteps: vi.fn(async () => "cancelled" as const) });
    await expect(performInteract(teleporter, d)).resolves.toBe("cancelled");
    expect(d.openPicker).not.toHaveBeenCalled();
  });

  it("drives to a board, then runs its command", async () => {
    const d = deps();
    await performInteract(board, d);
    expect(d.runSteps).toHaveBeenCalledWith("interact:L3:board:software", [{ kind: "drive", to: { x: -10.7, z: -9.5 } }]);
    expect(d.command).toHaveBeenCalledWith({ type: "palette", filter: "pods" });
  });

  it("only drives for an unknown command", async () => {
    const d = deps();
    await performInteract({ ...board, action: { type: "command", command: "launch" } }, d);
    expect(d.runSteps).toHaveBeenCalledTimes(1);
    expect(d.command).not.toHaveBeenCalled();
  });
});

describe("hover highlight volume", () => {
  it("grows the pick volume by the margin on every side, keeping its center and yaw", () => {
    const v = pickVolume(pod);
    const h = highlightVolume(v);
    expect(h.center).toEqual(v.center);
    expect(h.yaw).toBe(v.yaw);
    h.size.forEach((n, i) => expect(n).toBeCloseTo(v.size[i] + 2 * HIGHLIGHT_MARGIN));
  });

  it("never shares a face with an L3 directory board (its pick volume is the board solid), so it cannot z-fight", () => {
    const solids = wallSolids();
    LABS_WINGS.forEach((wing, i) => {
      const board = directoryBoard(wing);
      const v = pickVolume({
        kind: "board",
        bounds: board,
        box: { center: board.center, w: LABS.board.w, d: LABS.board.width, yaw: board.yaw + Math.PI / 2 },
        base: LABS.board.base,
        height: LABS.board.h,
      });
      const solid = solids[i];
      // The pick volume is the solid itself: that is why the highlight must stand outside it.
      expect(v.size[0]).toBeCloseTo(solid.w);
      expect(v.size[2]).toBeCloseTo(solid.d);
      const h = highlightVolume(v);
      expect(h.center[0]).toBeCloseTo(solid.x);
      expect(h.center[2]).toBeCloseTo(solid.z);
      expect(h.yaw).toBeCloseTo(solid.yaw ?? 0);
      expect((h.size[0] - solid.w) / 2).toBeGreaterThanOrEqual(HIGHLIGHT_MARGIN - 1e-9);
      expect((h.size[2] - solid.d) / 2).toBeGreaterThanOrEqual(HIGHLIGHT_MARGIN - 1e-9);
      expect(h.center[1] - h.size[1] / 2).toBeLessThanOrEqual(solid.y - HIGHLIGHT_MARGIN + 1e-9);
      expect(h.center[1] + h.size[1] / 2).toBeGreaterThanOrEqual(solid.y + solid.h + HIGHLIGHT_MARGIN - 1e-9);
    });
  });
});

import { describe, expect, it, vi } from "vitest";
import type { MissionStep } from "@/content/schema";
import {
  canPoint,
  clickDecision,
  highlightOpacity,
  isDragClick,
  LABEL_HEIGHT,
  LABEL_PAD_HEIGHT,
  labelAnchor,
  parseCommand,
  performInteract,
  PICK_HEIGHT,
  pickVolume,
  REACH,
  reach,
  type InteractDeps,
} from "@/experience/interact/pick";
import type { Interactable } from "@/experience/interact/registry";
import { PAD, type PickerRequest } from "@/experience/nav/pads";

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
    expect(pickVolume(pod)).toEqual({ center: [10, 1.3, 6.5], size: [8, 2.6, 7] });
  });

  it("lifts stacked targets off the floor from their base", () => {
    expect(pickVolume({ ...pod, base: 4, height: 6 })).toEqual({ center: [10, 5, 6.5], size: [8, 2, 7] });
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
  it("knows Ask Rover, the palettes and the CV viewer", () => {
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

import { describe, expect, it, vi } from "vitest";
import { labelAnchor } from "@/experience/interact/pick";
import type { Interactable } from "@/experience/hints/source";
import { GROUP_HINT_COMMAND, HINT, hintAnchor, hintTargets, nearestHint } from "@/experience/hints/select";
import { parseCommand } from "@/experience/interact/pick";
import { hintRuntime, setHintTarget, subscribeHintTarget } from "@/experience/hints/runtime";

const at = (id: string, x: number, z = 0) => ({ id, at: { x, z } });
const origin = { x: 0, z: 0 };

describe("nearestHint", () => {
  it("picks the nearest target within the radius", () => {
    expect(nearestHint([at("L1:pad:elevator", 4.5), at("L1:kiosk:ask-rover", 3)], origin)?.id).toBe("L1:kiosk:ask-rover");
    expect(nearestHint([at("L1:station:skills", HINT.radius + 0.1)], origin)).toBeNull();
    expect(nearestHint([], origin)).toBeNull();
  });

  it("keeps the current bubble until another target is clearly nearer or it leaves the keep radius", () => {
    const a = at("a", 3);
    const b = at("b", -2.8);
    expect(nearestHint([a, b], origin, a)?.id).toBe("a");
    const c = at("c", -1);
    expect(nearestHint([a, c], origin, a)?.id).toBe("c");
    const drifting = at("a", 5.5);
    expect(nearestHint([drifting], origin, drifting)?.id).toBe("a");
    expect(nearestHint([at("a", 6.5)], origin, a)).toBeNull();
  });
});

describe("hintTargets", () => {
  const target = (id: string, x: number, group?: Interactable["group"]): Interactable => ({
    id,
    floor: "L4",
    kind: "station",
    label: id,
    at: { x, z: 0 },
    bounds: { minX: x + 4, maxX: x + 6, minZ: -1, maxZ: 1 },
    action: { type: "command", command: `guide:${id}` },
    ...(group ? { group } : {}),
  });
  const vault = { id: "L4:vault", label: "Study Vault" };

  it("folds targets sharing an approach point into one bubble for their group, whose Go opens none of them", () => {
    const items = [target("L4:station:metrics", 20), target("gh-600", 2, vault), target("ai-103", 2, vault), target("ai-901", 2, vault)];
    const out = hintTargets(items);
    expect(out.map((i) => i.id)).toEqual(["L4:station:metrics", "L4:vault"]);
    const group = out[1];
    expect(group).toMatchObject({ label: "Study Vault", at: { x: 2, z: 0 }, kind: "station", action: { type: "command", command: GROUP_HINT_COMMAND } });
    expect(group.group).toBeUndefined();
    // Point-and-go drives to the stop and runs nothing (no study guide opens).
    expect(parseCommand(GROUP_HINT_COMMAND)).toBeNull();
    // So the nearest bubble at the stop is the vault's, never the first book's.
    expect(nearestHint(out, { x: 2, z: 1 })?.id).toBe("L4:vault");
  });

  it("keeps the room of a group whose first target opens one (an L4 bay door before its spines), so Go opens that drawer", () => {
    const bay = { id: "L4:track:craft", label: "Craft" };
    const door: Interactable = { ...target("L4:door:track:craft", 5, bay), kind: "door", action: { type: "open-room", room: "L4:track:craft" } };
    const out = hintTargets([door, target("L4:shelf:a", 5, bay), target("L4:shelf:b", 5, bay)]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "L4:track:craft", label: "Craft", kind: "door", at: { x: 5, z: 0 }, action: { type: "open-room", room: "L4:track:craft" } });
    expect(out[0].group).toBeUndefined();
  });

  it("keeps a list without groups as it is", () => {
    const items = [target("a", 0), target("b", 3)];
    expect(hintTargets(items)).toBe(items);
  });
});

describe("hintAnchor", () => {
  it("floats above point-and-go's hover label, so the two never overlap", () => {
    const pad = { kind: "elevator-pad" as const, at: { x: 3, z: 0 } };
    const [lx, ly, lz] = labelAnchor(pad);
    const anchor = hintAnchor(pad, 14);
    expect(anchor.x).toBe(lx);
    expect(anchor.z).toBe(lz);
    expect(anchor.y).toBeCloseTo(14 + ly + HINT.lift);
  });
});

describe("hint runtime", () => {
  it("notifies only when the picked target changes", () => {
    const item = { id: "L1:pad:elevator" } as Interactable;
    const listener = vi.fn();
    const off = subscribeHintTarget(listener);
    setHintTarget({ item, anchor: { x: 0, y: 0, z: 0 } });
    setHintTarget({ item, anchor: { x: 1, y: 0, z: 0 } });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(hintRuntime.target?.anchor.x).toBe(1);
    setHintTarget(null);
    expect(listener).toHaveBeenCalledTimes(2);
    off();
  });
});

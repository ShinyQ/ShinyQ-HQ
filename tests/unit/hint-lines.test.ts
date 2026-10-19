import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import id from "../../messages/id.json";
import type { Interactable } from "@/experience/hints/source";
import { HINT_KINDS, HINT_OBJECTS, hintGoKey, hintLine, hintObjectKey } from "@/hud/dialog/hintLines";

const item = (over: Partial<Interactable>): Interactable => ({
  id: "L1:station:profile",
  floor: "L1",
  kind: "station",
  label: "Profile",
  at: { x: 0, z: 0 },
  bounds: { minX: -1, maxX: 1, minZ: -1, maxZ: 1 },
  action: { type: "open-room", room: "L1:profile" },
  ...over,
});

describe("hint lines", () => {
  it("has a line for every kind, every special object and every Go label, in both languages", () => {
    for (const messages of [en, id]) {
      for (const kind of HINT_KINDS) expect(messages.dialog.hints.kind[kind], kind).toBeTruthy();
      for (const key of Object.values(HINT_OBJECTS)) expect(messages.dialog.hints.object[key as keyof typeof en.dialog.hints.object], key).toBeTruthy();
      for (const key of ["open", "pickFloor", "pickYear", "toElevator", "roverMenu", "browse", "viewCv", "go"] as const) expect(messages.dialog.hints.go[key], key).toBeTruthy();
    }
  });

  it("finds the special line by the exact registry id", () => {
    expect(HINT_OBJECTS).toEqual({
      "L1:station:highlights-about": "highlights",
      "L1:kiosk:ask-rover": "roverMenu",
      "RF:station:cv": "cv",
      "RF:station:contact": "contact",
      "L4:door:research": "research",
      "L2:station:workshop": "workshop",
      "L2:station:time-console": "timeConsole",
      "L3:door:ops": "ops",
      "L4:vault": "vault",
    });
    expect(hintObjectKey(item({ id: "RF:station:cv", floor: "RF", action: { type: "open-room", room: "RF:cv" } }))).toBe("cv");
    expect(hintObjectKey(item({ id: "L1:kiosk:ask-rover", kind: "kiosk", action: { type: "command", command: "terminal" } }))).toBe("roverMenu");
    expect(hintObjectKey(item({}))).toBeNull();
    // The Study Vault's one bubble (its books folded by `hintTargets`), whose Go only drives to the stop.
    expect(hintObjectKey(item({ id: "L4:vault", floor: "L4", action: { type: "command", command: "settle" } }))).toBe("vault");
    expect(hintGoKey(item({ id: "L4:vault", floor: "L4", action: { type: "command", command: "settle" } }))).toBe("go");
  });

  it("names the Go choice after the action", () => {
    expect(hintGoKey(item({}))).toBe("open");
    expect(hintGoKey(item({ id: "L1:pad:elevator", kind: "elevator-pad", action: { type: "elevator-picker" } }))).toBe("pickFloor");
    expect(hintGoKey(item({ id: "L2:teleporter:2021", kind: "teleporter", action: { type: "teleport-picker", year: 2021 } }))).toBe("pickYear");
    expect(hintGoKey(item({ id: "L2:pad:return", kind: "return-pad", action: { type: "return-beam" } }))).toBe("toElevator");
    expect(hintGoKey(item({ id: "L2:station:time-console", kind: "station", action: { type: "console-picker" } }))).toBe("pickYear");
    expect(hintGoKey(item({ kind: "kiosk", action: { type: "command", command: "terminal" } }))).toBe("roverMenu");
    expect(hintGoKey(item({ kind: "board", action: { type: "command", command: "palette:pods" } }))).toBe("browse");
    expect(hintGoKey(item({ kind: "board", action: { type: "command", command: "palette:posts" } }))).toBe("browse");
    expect(hintGoKey(item({ action: { type: "command", command: "cv" } }))).toBe("viewCv");
    expect(hintGoKey(item({ action: { type: "command", command: "guide:ai-103" } }))).toBe("open");
    expect(hintGoKey(item({ action: { type: "command", command: "unknown" } }))).toBe("go");
  });

  it("builds one line with Go and Not now", () => {
    const line = hintLine(item({ kind: "elevator-pad" }), { text: "Step on me to pick a floor.", go: "Pick a floor", notNow: "Not now" });
    expect(line).toMatchObject({ key: "hint:elevator-pad", text: "Step on me to pick a floor." });
    expect(line.choices).toEqual([
      { id: "go", label: "Pick a floor" },
      { id: "no", label: "Not now", cancel: true },
    ]);
  });
});

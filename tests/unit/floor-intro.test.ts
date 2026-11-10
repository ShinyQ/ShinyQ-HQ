import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import { FLOOR_LINES, floorIntroLine } from "@/hud/dialog/floorIntro";

describe("floor lines", () => {
  it("speak on L2, L3, L4 and RF only (L1 belongs to the onboarding), each with a line in messages", () => {
    expect(FLOOR_LINES).toEqual(["L2", "L3", "L4", "RF"]);
    expect(Object.keys(en.dialog.floor).sort()).toEqual([...FLOOR_LINES].sort());
  });
});

// Kept after mutation testing (2026-11-11): the only check of the line's key and Rover's face.
describe("floorIntroLine", () => {
  it("is one line about the floor with Rover's arrived face and no choices", () => {
    expect(floorIntroLine("x")).toEqual({ key: "floor", text: "x", face: "arrived" });
  });
});

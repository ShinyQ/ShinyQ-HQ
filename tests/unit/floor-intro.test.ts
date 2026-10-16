import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import { FLOOR_LINES, floorIntroLine } from "@/hud/dialog/floorIntro";

describe("floor lines", () => {
  it("speak on L2, L3, L4 and RF only (L1 belongs to the onboarding), each with a line in messages", () => {
    expect(FLOOR_LINES).toEqual(["L2", "L3", "L4", "RF"]);
    expect(Object.keys(en.dialog.floor).sort()).toEqual([...FLOOR_LINES].sort());
  });
});

describe("floorIntroLine", () => {
  it("is one line about the floor with no choices", () => {
    const line = floorIntroLine("x");
    expect(line).toEqual({ key: "floor", text: "x", face: "arrived" });
    expect(line.choices).toBeUndefined();
  });
});

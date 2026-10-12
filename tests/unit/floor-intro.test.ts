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
  it("ends the floor line with the walk choice and Explore freely as the Esc choice", () => {
    const line = floorIntroLine({ text: "This is the Career Road.", start: "Walk my journey", resume: null, explore: "Explore freely" });
    expect(line.key).toBe("floor");
    expect(line.text).toBe("This is the Career Road.");
    expect(line.choices).toEqual([
      { id: "start", label: "Walk my journey" },
      { id: "explore", label: "Explore freely", cancel: true },
    ]);
  });

  it("offers to resume a saved walk instead of starting over", () => {
    const line = floorIntroLine({ text: "Roof.", start: "Meet me", resume: "Resume at stop 3", explore: "Explore freely" });
    expect(line.choices?.map((c) => c.id)).toEqual(["resume", "explore"]);
    expect(line.choices?.[0].label).toBe("Resume at stop 3");
  });
});

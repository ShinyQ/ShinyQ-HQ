import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import id from "../../messages/id.json";
import { collectStrings } from "@/content/safety";
import { dialogPlacement, DIALOG_PLACE } from "@/hud/dialog/placement";

/** Three rows of the box on a 390 px phone (about 37 mono characters per row). */
const MAX_LINE = 110;

describe("Rover dialog copy", () => {
  it("keeps every spoken line short enough for three rows on a phone", () => {
    for (const messages of [en, id]) {
      const spoken = [messages.dialog.onboarding, messages.dialog.floor, messages.dialog.hints.kind, messages.dialog.hints.object];
      for (const group of spoken) {
        for (const { path, value } of collectStrings(group)) {
          expect(value.length, path).toBeLessThanOrEqual(MAX_LINE);
          expect(value, path).not.toContain("\n");
        }
      }
    }
  });

  it("has a line for every floor above the Lobby", () => {
    expect(Object.keys(en.dialog.floor).sort()).toEqual(["L2", "L3", "L4", "RF"]);
  });
});

describe("dialog placement", () => {
  it("sits above the bottom band and point-and-go's chip and hint: low on fine pointers, raised over the joystick on touch, clear of the elevator panel on phones", () => {
    expect(dialogPlacement("desktop", false)).toBe("bottom");
    expect(dialogPlacement("mobile", false)).toBe("bottom");
    expect(dialogPlacement("tablet", true)).toBe("raised");
    expect(dialogPlacement("mobile", true)).toBe("phone");
    expect(DIALOG_PLACE.bottom).toContain("bottom-[128px]");
    expect(DIALOG_PLACE.raised).toContain("bottom-[160px]");
    expect(DIALOG_PLACE.phone).toContain("right-[68px]");
  });
});

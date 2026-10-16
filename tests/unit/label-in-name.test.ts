import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import id from "../../messages/id.json";

// WCAG 2.5.3 Label in Name (axe label-content-name-mismatch): an accessible name starts with the
// control's visible text. The elevator buttons and the floor chip show "<code> <floor label>", the search launcher its
// shortcut chip and the palette close button "Esc" ("×" on phones); axe ignores parenthetical text, so the visible text must sit outside parentheses.
const fill = (template: string, values: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? `{${key}}`);

describe.each([
  ["en", en],
  ["id", id],
] as const)("label in name (%s)", (_locale, messages) => {
  it("elevator buttons start with the code and the floor label", () => {
    for (const [floor, label] of Object.entries(messages.hud.floorLabel)) {
      const name = fill(messages.hud.goToFloor, { floor, label, name: "Lobby" });
      expect(name.startsWith(`${floor} ${label}`), name).toBe(true);
    }
  });

  it("floor sheet rows start with the code, the floor label and the floor name", () => {
    for (const [floor, label] of Object.entries(messages.hud.floorLabel)) {
      const name = fill(messages.hud.goToFloorFull, { floor, label, name: "Lobby" });
      expect(name.startsWith(`${floor} ${label} Lobby`), name).toBe(true);
    }
  });

  it("the floor chip starts with the code and the floor label", () => {
    for (const [floor, label] of Object.entries(messages.hud.floorLabel)) {
      const name = fill(messages.hud.floorChip, { floor, label, name: "Lobby" });
      expect(name.startsWith(`${floor} ${label}`), name).toBe(true);
    }
  });

  it("the tablet floor chip starts with the code, the floor label and the floor name", () => {
    for (const [floor, label] of Object.entries(messages.hud.floorLabel)) {
      const name = fill(messages.hud.floorChipFull, { floor, label, name: "Lobby" });
      expect(name.startsWith(`${floor} ${label} Lobby`), name).toBe(true);
    }
  });

  it("the search launcher starts with its shortcut chip", () => {
    for (const shortcut of ["⌘K", "Ctrl K"]) {
      const name = fill(messages.hud.launcher.searchShortcut, { shortcut });
      expect(name.startsWith(shortcut), name).toBe(true);
    }
  });

  it("the palette close button starts with its Esc chip", () => {
    expect(messages.hud.palette.close.startsWith("Esc"), messages.hud.palette.close).toBe(true);
  });
});

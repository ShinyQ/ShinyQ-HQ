import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
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

  it("keeps interpolated name and object-label examples within the same phone limit", () => {
    for (const [locale, messages] of [["en", en], ["id", id]] as const) {
      const groups = [messages.dialog.onboarding, messages.dialog.floor, messages.dialog.hints.kind, messages.dialog.hints.object];
      for (const group of groups) {
        for (const { path, value } of collectStrings(group)) {
          const t = createTranslator({ locale, messages: { sample: value } });
          const expanded = t("sample", { name: "Kurniadi", label: messages.library.topics.title });
          expect(expanded.length, `${locale}.${path}`).toBeLessThanOrEqual(MAX_LINE);
        }
      }
    }
  });
});

describe("B1 unlock dialog copy (3D-only engine namespace)", () => {
  const lines = (m: typeof en) => ({ unlock: m.engine.unlock, go: m.engine.go, later: m.engine.later, lockedLine: m.engine.lockedLine });

  it("keeps each line within the phone limit, also with the progress numbers filled in", () => {
    for (const [locale, messages] of [["en", en], ["id", id]] as const) {
      for (const [key, value] of Object.entries(lines(messages))) {
        const t = createTranslator({ locale, messages: { sample: value } });
        const expanded = t("sample", { seen: 4, total: 5 });
        expect(value.length, `${locale}.${key}`).toBeLessThanOrEqual(MAX_LINE);
        expect(expanded.length, `${locale}.${key}`).toBeLessThanOrEqual(MAX_LINE);
        expect(value, `${locale}.${key}`).not.toContain("\n");
        expect(value, `${locale}.${key}`).not.toContain("\u2014");
      }
    }
  });

  it("follows the voice rules: no tours and no boost button", () => {
    for (const { path, value } of collectStrings(lines(en))) expect(value, `en${path}`).not.toMatch(/\btours?\b|boost button/i);
    for (const { path, value } of collectStrings(lines(id))) expect(value, `id${path}`).not.toMatch(/\btur\b|tombol (boost|turbo)/i);
  });
});

describe("removed tours", () => {
  it("no dialog line mentions the removed tours", () => {
    for (const { path, value } of collectStrings(en.dialog)) expect(value, `en${path}`).not.toMatch(/\btours?\b/i);
    for (const { path, value } of collectStrings(id.dialog)) expect(value, `id${path}`).not.toMatch(/\btur\b/i);
  });
});

describe("touch boost copy", () => {
  it("no dialog or HUD line mentions a boost button (touch boost is a joystick double tap)", () => {
    for (const { path, value } of collectStrings({ dialog: en.dialog, hud: en.hud })) expect(value, `en${path}`).not.toMatch(/boost button/i);
    for (const { path, value } of collectStrings({ dialog: id.dialog, hud: id.hud })) expect(value, `id${path}`).not.toMatch(/tombol (boost|turbo)/i);
  });

  it("teaches the joystick double tap in the touch onboarding line", () => {
    expect(en.dialog.onboarding.moveCoarse).toMatch(/double-tap the joystick/i);
    expect(id.dialog.onboarding.moveCoarse).toMatch(/ketuk dua kali joystick/i);
  });
});

describe("dialog placement", () => {
  it("sits above the bottom band and point-and-go's chip and hint: low on fine pointers, raised over the joystick on touch, a toast above the joystick on phones", () => {
    expect(dialogPlacement("desktop", false)).toBe("bottom");
    expect(dialogPlacement("mobile", false)).toBe("bottom");
    expect(dialogPlacement("tablet", true)).toBe("raised");
    expect(dialogPlacement("mobile", true)).toBe("phone");
    expect(DIALOG_PLACE.bottom).toContain("bottom-[128px]");
    expect(DIALOG_PLACE.raised).toContain("bottom-[160px]");
    expect(DIALOG_PLACE.phone).toContain("bottom-[calc(168px");
    expect(DIALOG_PLACE.phone).toContain("right-3");
    expect(DIALOG_PLACE.phone).not.toContain("right-[68px]");
  });
});

import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import en from "../../messages/en.json";
import id from "../../messages/id.json";
import { collectStrings } from "@/content/safety";
import { dialogPlacement, DIALOG_PLACE, docks, DOCK_PLACE, TOAST_ROWS, toastPlace } from "@/hud/dialog/placement";

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

  it("announces visited main floors and unlocked B1 rather than completed rooms", () => {
    expect(en.engine.unlock).toMatch(/all main floors visited/i);
    expect(en.engine.unlock).toMatch(/Engine Room is unlocked/);
    expect(id.engine.unlock).toMatch(/semua lantai utama sudah dikunjungi/i);
    expect(id.engine.unlock).toMatch(/Ruang Mesin terbuka/);
  });

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
  it("teaches the Boost button and the joystick double tap in the touch onboarding line and the controls hint", () => {
    expect(en.dialog.onboarding.moveCoarse).toMatch(/Boost button/);
    expect(en.dialog.onboarding.moveCoarse).toMatch(/double-tap the joystick/i);
    expect(id.dialog.onboarding.moveCoarse).toMatch(/tombol Turbo/);
    expect(id.dialog.onboarding.moveCoarse).toMatch(/ketuk dua kali joystick/i);
    expect(en.hud.hintCoarse).toMatch(/Boost: the bolt button or double-tap the joystick/);
    expect(id.hud.hintCoarse).toMatch(/Turbo: tombol petir atau ketuk dua kali joystick/);
  });

  it("teaches the phone's floating stick (spec 2026-10-29): the lower-left drag and the Boost button, never a joystick", () => {
    for (const [messages, zone] of [[en, /lower left/], [id, /kiri bawah/]] as const) {
      expect(messages.hud.hintPhone).toMatch(zone);
      expect(messages.dialog.onboarding.movedPhone).toMatch(zone);
      expect(messages.hud.hintPhone).not.toMatch(/joystick/i);
      expect(messages.dialog.onboarding.movedPhone).not.toMatch(/joystick/i);
    }
    expect(en.dialog.onboarding.movedPhone).toMatch(/Boost button/);
    expect(id.dialog.onboarding.movedPhone).toMatch(/tombol Turbo/);
  });

  it("explains that the next tap turns turbo off, not that it stops driving", () => {
    expect(en.dialog.onboarding.moveCoarse).toMatch(/tap again to turn boost off/i);
    expect(id.dialog.onboarding.moveCoarse).toMatch(/menyalakan atau mematikan turbo/i);
  });

  it("never teaches a swipe to change floors (owner decision 2026-10-24)", () => {
    for (const messages of [en, id]) {
      for (const { path, value } of collectStrings({ dialog: messages.dialog, hud: messages.hud })) expect(value, path).not.toMatch(/swipe up or down|geser ke atas atau bawah/i);
    }
  });
});

describe("dialog placement", () => {
  it("sits above the bottom band and point-and-go's chip and hint: low on fine pointers, raised over the joystick on touch tablets", () => {
    expect(dialogPlacement("desktop", false)).toBe("bottom");
    expect(dialogPlacement("mobile", false)).toBe("bottom");
    expect(dialogPlacement("tablet", true)).toBe("raised");
    expect(dialogPlacement("mobile", true)).toBe("phone");
    expect(DIALOG_PLACE.bottom).toContain("bottom-[128px]");
    expect(DIALOG_PLACE.raised).toContain("bottom-[160px]");
    expect(Object.keys(DIALOG_PLACE).sort()).toEqual(["bottom", "raised"]);
  });

  it("puts a phone line without choices at the top: below the minimap row in portrait, between the floor chip and the buttons in landscape", () => {
    expect(toastPlace(false)).toEqual({ top: "calc(144px + env(safe-area-inset-top))", left: 12, right: 12 });
    expect(toastPlace(true)).toEqual({ top: "calc(16px + env(safe-area-inset-top))", left: 188, right: 128 });
    expect(TOAST_ROWS).toBe(4);
  });

  it("docks a phone line that asks for a choice, at the bottom in thumb reach", () => {
    const choices = [{ id: "a", label: "A" }, { id: "b", label: "B" }];
    expect(docks({ line: { key: "a", text: "x", choices }, paused: false, fallback: false })).toBe(true);
    expect(docks({ line: { key: "a", text: "x" }, paused: false, fallback: false })).toBe(false);
    expect(docks({ line: { key: "a", text: "x" }, paused: false, fallback: true })).toBe(true);
    expect(docks({ line: { key: "a", text: "x", choices }, paused: true, fallback: false })).toBe(false);
    expect(docks({ line: null, paused: false, fallback: false })).toBe(false);
    expect(DOCK_PLACE).toContain("bottom-[calc(12px+env(safe-area-inset-bottom))]");
  });
});

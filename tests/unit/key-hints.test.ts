import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Touch wording (owner decision 2026-10-28): no text a touch visitor sees names a keyboard key. Keys show as a `Kbd`
 * chip hidden on coarse pointers, and key-only hint lines have a touch variant. These strings keep their keys because
 * a touch visitor never sees them: fine-pointer variants, footers hidden on coarse pointers, `title` tooltips and
 * screen-reader text.
 */
const KEEPS_KEYS = new Set([
  "home.hero.enter3d", // the verb "Enter", not the key
  "hud.canvasDescription", // screen readers
  "hud.back3dHint", // title tooltip
  "hud.hintFine",
  "hud.terminal.hint", // footer hidden on coarse pointers
  "hud.palette.hint", // footer hidden on coarse pointers
  "hud.palette.close", // accessible name of the close button
  "hud.pads.floorHint",
  "hud.pads.yearHint",
  "hud.pads.consoleHint",
  "drawer.readmeHint", // title tooltip
  "drawer.hologram.hint",
  "gallery.hint", // screen readers
  "dialog.onboarding.moveFine",
]);
const KEY = /\([A-Z0-9]\)|\b(?:key|tombol) [A-Z]\b|\bEsc\b|\bEnter\b|\barrows?\b|\bpanah\b|\bWASD\b|\bShift\b|\b[Pp]ress\b|\b[Tt]ekan\b/;

type Messages = Record<string, unknown>;
const load = (locale: string): Messages => JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"));

function strings(node: unknown, path: string[] = [], out: [string, string][] = []): [string, string][] {
  if (typeof node === "string") out.push([path.join("."), node]);
  else if (node && typeof node === "object") for (const [k, v] of Object.entries(node)) strings(v, [...path, k], out);
  return out;
}

const at = (messages: Messages, path: string): unknown => path.split(".").reduce<unknown>((n, k) => (n as Messages | undefined)?.[k], messages);

describe("touch wording", () => {
  for (const locale of ["en", "id"]) {
    const messages = load(locale);

    it(`${locale}: only fine-pointer, tooltip and screen-reader strings name a key`, () => {
      const offenders = strings(messages).filter(([key, value]) => !KEEPS_KEYS.has(key) && KEY.test(value));
      expect(offenders).toEqual([]);
    });

    it(`${locale}: every kept string still exists, and each key-only hint line has a touch variant without keys`, () => {
      for (const key of KEEPS_KEYS) expect(at(messages, key), key).toEqual(expect.any(String));
      for (const key of ["hud.pads.floorHintTouch", "hud.pads.yearHintTouch", "hud.pads.consoleHintTouch", "drawer.hologram.hintTouch"]) {
        const value = at(messages, key);
        expect(value, key).toEqual(expect.any(String));
        expect(KEY.test(value as string), key).toBe(false);
      }
    });
  }
});

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sources(full, out);
    else if (name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

describe("key caps", () => {
  it("every visible key cap in the HUD hides on a coarse pointer and is hidden from screen readers", () => {
    const caps = sources("src/hud").flatMap((file) => [...readFileSync(file, "utf8").matchAll(/<kbd\b[^>]*>/g)].map((m) => [file, m[0]] as const));
    expect(caps.length).toBeGreaterThan(0);
    for (const [file, tag] of caps) {
      expect(tag, file).toContain("pointer-coarse:hidden");
      expect(tag, file).toContain('aria-hidden="true"');
    }
  });
});

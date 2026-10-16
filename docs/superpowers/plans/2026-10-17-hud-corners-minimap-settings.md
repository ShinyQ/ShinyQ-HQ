# HUD Corners, Minimap and Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Status: in progress (Round 8, sub-project I). Spec: Round 8 design, sections 1, 2, 3 and 7 (owner-approved 2026-10-17, layout A "Corners").

**Goal:** Phones and tablets get the Corners HUD (floor chip, Ask plus menu, minimap, joystick with double-tap boost, one reset button), every HUD gets an SVG minimap with a full-screen overview, and one settings panel gathers every preference behind a small registry that sibling sub-projects K (day and night) and L (open links in) extend.

**Architecture:** The HUD picks a layout from the store's device (`hudLayout(viewport, coarse)`: `phone`, `tablet`, `desktop`). Settings are data (`SettingDef` in `src/hud/settings/registry.ts`) bound to existing external stores (zustand store, audio engine, small localStorage prefs) and rendered by one generic `SettingsPanel`. The minimap is a pure model (`src/hud/minimap/model.ts`) over the same `buildFloorLayouts` output and point-and-go registry items the scene uses, drawn as SVG in the HTML HUD at 10 Hz (zero draw calls).

**Tech Stack:** Next.js 16 static export, React 19, zustand 5, next-intl, Tailwind v4, Vitest + Testing Library, Playwright (SwiftShader).

## Global Constraints

- No em dashes (U+2014) anywhere (code, comments, copy, docs, commits, PR text).
- Every user-facing string in both `messages/en.json` and `messages/id.json` with identical keys; Indonesian natural and professional, technical terms in English.
- Client code imports locale values from `@/content/locales`, never values from `@/content/schema` or `@/content/load`.
- Touch targets at least 44 px (`min-h-11`, `size-11`); reduced motion respected (`@variant motion-reduce`, `motion-reduce:`); axe e2e green; label-in-name (an `aria-label` starts with the visible text).
- No colored edge stripes: use `AccentDot` and `hq-glow`. Panels over the world use `.glass .glass-solid`.
- Budgets: 3D first-frame gate 450 KB gzip; session totals full 470 KB and lite 446.4 KB; L1 at most 125 draw calls; every floor under 150 draw calls and 30k triangles; no new shader program; memory gates; Classic JS 240 KB; CSS 20,480 B; HTML 80 KB.
- The minimap adds zero draw calls (HTML SVG only, no three.js import in `src/hud/minimap/`).
- 3D: never start another rAF loop for game state (the minimap reads the store's 10 Hz rover mirror; the HUD is not the frame loop).
- Phone (390x844) at most 5 always-visible controls plus the minimap; tablet (834x1194, 1194x834 touch) at most 9; every former control reachable within 2 taps.
- Desktop (fine pointer, at least 1024 px) keeps today's layout plus the minimap (bottom right, above the view controls) and a settings button beside it; key `N` toggles the overview, key `,` the settings panel.
- Settings persist in localStorage and apply immediately; the existing stores stay the source of truth (store `motion`, audio engine `hq:sound`, `switchLocale`).
- Settings registry contract (already sent to siblings K and L, do not change names): module `src/hud/settings/registry.ts`, `defineSetting`, `SettingDef { id, group, order, labelKey, hintKey?, control, subscribe, available? }`, groups `general | display | sound`, labels under `hud.settings`, entries listed in `src/hud/settings/defs/index.ts` (`SETTINGS`), helper `createLocalPref` in `src/lib/local-pref.ts`. Reserved orders: general language 10, openLinks 20 (L); display motion 10, quality 20, dayNight 30 (K), minimap 40; sound sound 10, effects 20, music 30, musicVolume 40.
- Commits: conventional (`feat:`, `fix:`, `test:`, `docs:`), logical steps, prefer `rtk git`.

## File structure

| File | Responsibility |
|---|---|
| `src/lib/local-pref.ts` (new) | `createLocalPref`: a typed localStorage value with listeners (same tab and `storage` event) |
| `src/hud/settings/registry.ts` (new) | `SettingDef` types, `defineSetting`, `settingsByGroup` |
| `src/hud/settings/defs/*.ts` (new) | One definition per setting; `defs/index.ts` lists `SETTINGS` |
| `src/hud/settings/SettingsPanel.tsx` (new) | Generic renderer: groups, toggle (switch), choice (radio group), range (slider) |
| `src/lib/audio/engine.ts`, `types.ts`, `useAudio.ts`, `README.md` | Effects on/off, music on/off and music volume, persisted |
| `src/lib/quality-pref.ts` (new) | `qualityPref` (`hq:quality`: `auto`, `full`, `lite`) |
| `src/lib/gpu-tier.ts` | `applyQualityPref(detected, pref, overridden)` |
| `src/experience/gate-tier.ts`, `ExperienceGate.tsx` | Effective tier follows the preference; a change remounts the canvas |
| `src/hud/layout.ts` (new) | `hudLayout(viewport, coarse)` |
| `src/hud/FloorButtons.tsx` (new), `ElevatorPanel.tsx` | Floor buttons shared by the rail and the floor sheet |
| `src/hud/FloorChip.tsx` (new) | Top-left floor chip and its floor sheet |
| `src/hud/boost.ts` (new), `BoostButton.tsx`, `Joystick.tsx` | Shared boost toggle; joystick double-tap boost |
| `src/hud/ViewControls.tsx` | `ResetView` (single button for Corners) |
| `src/hud/menu/HudMenu.tsx` (new) | Menu button and sheet: profile, actions (Classic site, search, Ask Rover, rotate), settings |
| `src/hud/menu/SettingsSheet.tsx` (new) | Desktop settings panel (`,` key and the gear button) |
| `src/components/Modal.tsx` | `side` placement (right side panel from 640 px) |
| `src/hud/minimap/model.ts` (new) | Pure map model: projection, roads, plazas, rooms, elevator, rover arrow |
| `src/hud/minimap/pref.ts` (new) | `minimapPref` (`hq:minimap`) |
| `src/hud/minimap/Minimap.tsx`, `MapOverview.tsx` (new) | Round minimap and the full-screen overview dialog |
| `src/experience/input/intents.ts` | Keys `n` (map) and `,` (settings) as `toggle` intents |
| `src/hud/Hud.tsx`, `Controls.tsx` | Composition per layout |
| `src/hud/dialog/placement.ts`, `DialogBox.tsx` | Phone toast above the joystick: 2 lines, tap to expand, auto-advance |
| `src/hud/ask/AskDock.tsx` | Teaser never with a dialog; position under the minimap |
| `messages/en.json`, `messages/id.json` | New copy; stale "tour" lines fixed |
| `e2e/hud-corners.spec.ts` (new) + updated specs | Control counts, 2-tap reachability, minimap, settings |

---

### Task 1: Settings registry and local preferences

**Files:**
- Create: `src/lib/local-pref.ts`, `src/hud/settings/registry.ts`, `src/hud/settings/defs/index.ts`
- Test: `tests/unit/local-pref.test.ts`, `tests/unit/settings-registry.test.ts`

**Interfaces:**
- Produces:
  - `createLocalPref<T extends string>(key: string, fallback: T, isValid: (v: unknown) => v is T, storage?: () => Storage | null): LocalPref<T>` with `LocalPref<T> = { key: string; get(): T; set(value: T): void; subscribe(listener: () => void): () => void }`.
  - `SettingGroup`, `SettingControl`, `SettingDef`, `defineSetting(def)`, `SETTING_GROUPS: readonly SettingGroup[]` (`["general", "display", "sound"]`), `settingsByGroup(defs: readonly SettingDef[]): { group: SettingGroup; items: SettingDef[] }[]` (sorted by `order`, filtered by `available`, empty groups dropped).
  - `SETTINGS: readonly SettingDef[]` (empty in this task; Task 4 fills it).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/local-pref.test.ts
import { describe, expect, it, vi } from "vitest";
import { createLocalPref } from "@/lib/local-pref";

const isAB = (v: unknown): v is "a" | "b" => v === "a" || v === "b";
function memory() {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k), map } as unknown as Storage & { map: Map<string, string> };
}

describe("createLocalPref", () => {
  it("reads the fallback, then a stored valid value, and ignores invalid ones", () => {
    const store = memory();
    const pref = createLocalPref("k", "a", isAB, () => store);
    expect(pref.get()).toBe("a");
    store.setItem("k", "b");
    expect(pref.get()).toBe("b");
    store.setItem("k", "zzz");
    expect(pref.get()).toBe("a");
  });
  it("persists, notifies listeners and stops after unsubscribe", () => {
    const store = memory();
    const pref = createLocalPref("k", "a", isAB, () => store);
    const fn = vi.fn();
    const off = pref.subscribe(fn);
    pref.set("b");
    expect(store.getItem("k")).toBe("b");
    expect(fn).toHaveBeenCalledTimes(1);
    pref.set("b");
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    pref.set("a");
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it("survives a throwing storage", () => {
    const pref = createLocalPref("k", "a", isAB, () => {
      throw new Error("blocked");
    });
    pref.set("b");
    expect(pref.get()).toBe("b");
  });
});
```

```ts
// tests/unit/settings-registry.test.ts
import { describe, expect, it } from "vitest";
import { defineSetting, settingsByGroup, SETTING_GROUPS } from "@/hud/settings/registry";

const noop = () => () => {};
const toggle = (id: string, group: "general" | "display" | "sound", order: number, available?: () => boolean) =>
  defineSetting({ id, group, order, labelKey: `${id}.label`, control: { kind: "toggle", get: () => true, set: () => {} }, subscribe: noop, available });

describe("settings registry", () => {
  it("groups in a fixed order, sorts by order and drops unavailable rows and empty groups", () => {
    const out = settingsByGroup([toggle("b", "sound", 20), toggle("a", "sound", 10), toggle("x", "general", 10, () => false)]);
    expect(out.map((g) => g.group)).toEqual(["sound"]);
    expect(out[0].items.map((d) => d.id)).toEqual(["a", "b"]);
    expect(SETTING_GROUPS).toEqual(["general", "display", "sound"]);
  });
  it("rejects duplicate ids", () => {
    expect(() => settingsByGroup([toggle("a", "sound", 10), toggle("a", "display", 10)])).toThrow(/duplicate/i);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bunx vitest run tests/unit/local-pref.test.ts tests/unit/settings-registry.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/local-pref.ts
/**
 * A small persisted preference: one localStorage key, a fallback for missing or invalid values, and
 * listeners for `useSyncExternalStore` (same tab through `set`, other tabs through the `storage` event).
 * Storage can be unavailable (private mode, blocked): the in-memory value still applies.
 */
export interface LocalPref<T extends string> {
  key: string;
  get(): T;
  set(value: T): void;
  subscribe(listener: () => void): () => void;
}

const defaultStorage = () => (typeof window === "undefined" ? null : window.localStorage);

export function createLocalPref<T extends string>(
  key: string,
  fallback: T,
  isValid: (value: unknown) => value is T,
  storage: () => Storage | null = defaultStorage,
): LocalPref<T> {
  const listeners = new Set<() => void>();
  let memory: T | null = null;
  const read = (): T => {
    try {
      const raw = storage()?.getItem(key);
      if (isValid(raw)) return raw;
    } catch {
      // Unreadable storage: fall back to memory.
    }
    return memory ?? fallback;
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === key) listeners.forEach((l) => l());
  };
  return {
    key,
    get: read,
    set(value) {
      if (read() === value) return;
      memory = value;
      try {
        storage()?.setItem(key, value);
      } catch {
        // Ignore: memory keeps the choice for this page.
      }
      listeners.forEach((l) => l());
    },
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1 && typeof window !== "undefined") window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && typeof window !== "undefined") window.removeEventListener("storage", onStorage);
      };
    },
  };
}
```

```ts
// src/hud/settings/registry.ts
/**
 * Settings registry (Round 8 I). A setting is data bound to an external store (get, set, subscribe), so
 * the store stays the source of truth and the panel persists nothing itself. Sibling features add one
 * file in `defs/` and one entry in `defs/index.ts`. Labels are next-intl keys under `hud.settings`.
 * Client-safe: no React, no `@/content/schema` values.
 */
export type SettingGroup = "general" | "display" | "sound";

export const SETTING_GROUPS: readonly SettingGroup[] = ["general", "display", "sound"];

export type SettingControl =
  | { kind: "toggle"; get: () => boolean; set: (on: boolean) => void }
  | { kind: "choice"; options: readonly { value: string; labelKey: string }[]; get: () => string; set: (value: string) => void }
  | { kind: "range"; min: number; max: number; step: number; get: () => number; set: (value: number) => void };

export interface SettingDef {
  /** kebab-case; the row gets `data-testid="setting-<id>"`. */
  id: string;
  group: SettingGroup;
  /** Ascending within the group. */
  order: number;
  /** Key under `hud.settings`, e.g. "dayNight.label". */
  labelKey: string;
  /** Optional one-line note under the label (key under `hud.settings`). */
  hintKey?: string;
  control: SettingControl;
  subscribe: (listener: () => void) => () => void;
  /** Hides the row when it returns false. */
  available?: () => boolean;
}

export function defineSetting(def: SettingDef): SettingDef {
  return def;
}

export function settingsByGroup(defs: readonly SettingDef[]): { group: SettingGroup; items: SettingDef[] }[] {
  const seen = new Set<string>();
  for (const def of defs) {
    if (seen.has(def.id)) throw new Error(`Duplicate setting id: ${def.id}`);
    seen.add(def.id);
  }
  return SETTING_GROUPS.map((group) => ({
    group,
    items: defs.filter((d) => d.group === group && (d.available?.() ?? true)).sort((a, b) => a.order - b.order),
  })).filter((g) => g.items.length > 0);
}
```

```ts
// src/hud/settings/defs/index.ts
import type { SettingDef } from "../registry";

/** Every setting the panel shows. Sibling features append their definition here (one import, one entry). */
export const SETTINGS: readonly SettingDef[] = [];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run tests/unit/local-pref.test.ts tests/unit/settings-registry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add src/lib/local-pref.ts src/hud/settings tests/unit/local-pref.test.ts tests/unit/settings-registry.test.ts
rtk git commit -m "feat(hud): settings registry and local preference helper"
```

---

### Task 2: Audio engine: effects, music and music volume

**Files:**
- Modify: `src/lib/audio/types.ts`, `src/lib/audio/engine.ts`, `src/lib/audio/useAudio.ts`, `src/lib/audio/index.ts`, `src/lib/audio/README.md`
- Test: `tests/unit/audio.test.ts` (extend; reuse its `FakeStorage`, `FakeDoc`, `FakeAudioContext` setup)

**Interfaces:**
- Produces on `AudioEngine`:
  - `getSettings(): AudioSettings` (stable object between changes) with `AudioSettings = { effects: boolean; music: boolean; musicVolume: number }`.
  - `setEffects(on: boolean)`, `setMusic(on: boolean)`, `setMusicVolume(volume: number)` (clamped 0 to 1).
  - `subscribe` also fires on these changes.
- Storage keys: `hq:sfx` (`"off"` disables effects; missing means on), `hq:music` (`"off"` disables music), `hq:music-volume` (`"0"` to `"1"`, missing means 1). Exported consts `EFFECTS_STORAGE_KEY`, `MUSIC_STORAGE_KEY`, `MUSIC_VOLUME_STORAGE_KEY`.
- `useAudioSettings(engine = audio): AudioSettings` (server snapshot `{ effects: true, music: true, musicVolume: 1 }`).
- Behaviour: the master mute (`hq:sound`, key `m`) still silences everything. Effects off: `play` is a no-op and the rumble stays silent. Music off: no music voice (stopped at once if playing; started again when turned on while audible). Volume scales a new `musicBus` GainNode between the music voice output and the master (`createSpaceMusic(ctx, musicBus)`), applied with `setTargetAtTime` (time constant 0.05).

- [ ] **Step 1: Write the failing tests** (append to `tests/unit/audio.test.ts`, inside a new `describe("audio settings")`, using the file's existing `setup()` helper that returns `{ engine, storage, doc, contexts }`; check the helper's exact name and fields first and adapt only those identifiers)

```ts
describe("audio settings", () => {
  it("defaults to effects on, music on, full volume, and reads stored values", () => {
    const { engine } = setup();
    expect(engine.getSettings()).toEqual({ effects: true, music: true, musicVolume: 1 });
    const stored = setup({ storage: { "hq:sfx": "off", "hq:music": "off", "hq:music-volume": "0.4" } });
    expect(stored.engine.getSettings()).toEqual({ effects: false, music: false, musicVolume: 0.4 });
  });
  it("persists changes, clamps the volume and notifies once per change", () => {
    const { engine, storage } = setup();
    const fn = vi.fn();
    engine.subscribe(fn);
    engine.setEffects(false);
    engine.setMusic(false);
    engine.setMusicVolume(3);
    expect(storage.map.get("hq:sfx")).toBe("off");
    expect(storage.map.get("hq:music")).toBe("off");
    expect(engine.getSettings().musicVolume).toBe(1);
    engine.setMusicVolume(0.25);
    expect(storage.map.get("hq:music-volume")).toBe("0.25");
    expect(fn).toHaveBeenCalledTimes(3);
    const a = engine.getSettings();
    expect(engine.getSettings()).toBe(a);
  });
  it("effects off silences one-shots and the rumble but keeps the context for music", () => {
    const { engine, contexts, start } = setup();
    start(); // the file's helper that unpauses and fires the first gesture
    engine.setEffects(false);
    const before = contexts[0].oscillators.length;
    engine.play("beep");
    expect(contexts[0].oscillators.length).toBe(before);
  });
  it("music off stops the music voice, on starts a fresh one", () => {
    const { engine, start, musicVoices } = setup();
    start();
    expect(musicVoices()).toBe(1);
    engine.setMusic(false);
    expect(musicVoices()).toBe(0);
    engine.setMusic(true);
    expect(musicVoices()).toBe(1);
  });
});
```

Note for the implementer: `tests/helpers/fake-audio.ts` and the top of `tests/unit/audio.test.ts` define the fakes. If `setup` does not accept initial storage or lacks `start`/`musicVoices`, extend the helper minimally (initial storage map; `start()` = `engine.setPaused(false); doc.fire("pointerdown")`; `musicVoices()` counts the live music output gains the way the existing music tests do, e.g. by checking `FakeGain` instances connected to the master). Keep existing tests untouched.

- [ ] **Step 2: Run to verify they fail**

Run: `bunx vitest run tests/unit/audio.test.ts`
Expected: FAIL (`getSettings` is not a function).

- [ ] **Step 3: Implement**

`types.ts`: add

```ts
export interface AudioSettings {
  /** One-shots and the tread rumble. */
  effects: boolean;
  /** Background music ("Deep Space Ambient"). */
  music: boolean;
  /** Music level, 0 to 1 (scales the music bus; the master mute still wins). */
  musicVolume: number;
}
```

and on `AudioEngine`: `getSettings(): AudioSettings; setEffects(on: boolean): void; setMusic(on: boolean): void; setMusicVolume(volume: number): void;`.

`engine.ts`:

```ts
export const EFFECTS_STORAGE_KEY = "hq:sfx";
export const MUSIC_STORAGE_KEY = "hq:music";
export const MUSIC_VOLUME_STORAGE_KEY = "hq:music-volume";
const VOLUME_TIME_CONSTANT = 0.05;
const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1);
```

Inside `createAudioEngine`:

```ts
let settings: AudioSettings = readSettings();
let musicBus: GainNode | null = null;

function readSettings(): AudioSettings {
  const get = (key: string) => {
    try {
      return storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  };
  const volume = get(MUSIC_VOLUME_STORAGE_KEY);
  return {
    effects: get(EFFECTS_STORAGE_KEY) !== "off",
    music: get(MUSIC_STORAGE_KEY) !== "off",
    musicVolume: volume === null ? 1 : clamp01(Number(volume)),
  };
}

function write(key: string, value: string): void {
  try {
    storage?.setItem(key, value);
  } catch {
    // The in-memory setting still applies.
  }
}

function update(patch: Partial<AudioSettings>): boolean {
  const next = { ...settings, ...patch };
  if (next.effects === settings.effects && next.music === settings.music && next.musicVolume === settings.musicVolume) return false;
  settings = next;
  notify();
  return true;
}
```

- In `ensureContext`, after the master: `musicBus = ctx.createGain(); musicBus.gain.setValueAtTime(settings.musicVolume, ctx.currentTime); musicBus.connect(master);`
- `startMusic`: add `settings.music &&` to the guard and pass `musicBus` as the destination: `music = createSpaceMusic(ctx, musicBus)` (guard `musicBus` non-null).
- `play`: return early when `!settings.effects` (after the `silent()` check).
- `setRumble`: when `!settings.effects`, remember the speed, set `rumble?.setSpeed(0)` and return.
- New methods:

```ts
getSettings() {
  return settings;
},
setEffects(on: boolean) {
  if (!update({ effects: on })) return;
  write(EFFECTS_STORAGE_KEY, on ? "on" : "off");
  if (!on) rumble?.setSpeed(0);
  else if (!silent() && rumble) rumble.setSpeed(rumbleSpeed);
},
setMusic(on: boolean) {
  if (!update({ music: on })) return;
  write(MUSIC_STORAGE_KEY, on ? "on" : "off");
  if (on) startMusic();
  else stopMusic();
},
setMusicVolume(volume: number) {
  const v = clamp01(volume);
  if (!update({ musicVolume: v })) return;
  write(MUSIC_VOLUME_STORAGE_KEY, String(v));
  if (ctx && musicBus) {
    musicBus.gain.cancelScheduledValues(ctx.currentTime);
    musicBus.gain.setTargetAtTime(v, ctx.currentTime, VOLUME_TIME_CONSTANT);
  }
},
```

- `dispose`: also `musicBus = null`. `notify()` must be declared before `update` uses it (it already is a function declaration, hoisted).

`useAudio.ts`: add

```ts
const serverSettings: AudioSettings = { effects: true, music: true, musicVolume: 1 };
const serverSettingsSnapshot = () => serverSettings;

/** Effects, music and music volume (Settings panel). Server render reports the defaults. */
export function useAudioSettings(engine: AudioEngine = audio): AudioSettings {
  return useSyncExternalStore(engine.subscribe, engine.getSettings, serverSettingsSnapshot);
}
```

Export `useAudioSettings` and `AudioSettings` from `src/lib/audio/index.ts`. Check `src/lib/audio/singleton.ts`: the lazy proxy must forward the new methods (if it lists methods explicitly, add `getSettings`, `setEffects`, `setMusic`, `setMusicVolume`). README: add the four members to the API table and a "Settings" bullet under Behavior (keys, master mute wins, music bus).

- [ ] **Step 4: Run tests**

Run: `bunx vitest run tests/unit/audio.test.ts tests/unit/audio-music.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add src/lib/audio tests/unit/audio.test.ts tests/helpers/fake-audio.ts
rtk git commit -m "feat(audio): separate effects and music switches with a music volume"
```

---

### Task 3: Graphics quality preference

**Files:**
- Create: `src/lib/quality-pref.ts`
- Modify: `src/lib/gpu-tier.ts`, `src/experience/gate-tier.ts`, `src/experience/ExperienceGate.tsx`
- Test: `tests/unit/gpu-tier.test.ts` (extend or create if missing; check `ls tests/unit | grep gpu`), `tests/unit/quality-pref.test.ts`

**Interfaces:**
- Produces:
  - `type QualityPref = "auto" | "full" | "lite"`, `QUALITY_PREFS`, `isQualityPref`, `qualityPref: LocalPref<QualityPref>` (key `hq:quality`, fallback `auto`) in `src/lib/quality-pref.ts`.
  - `applyQualityPref(detected: GpuTier, pref: QualityPref, overridden: boolean): GpuTier` in `src/lib/gpu-tier.ts`: returns `detected` when `overridden` (a valid `?tier=` in the URL), when `detected === "static"` or when `pref === "auto"`; else `pref`.
  - `tierOverridden(): boolean` in `src/experience/gate-tier.ts` (true when the probe saw a valid `?tier=`).
  - `useQualityTier(detected: GpuTier | null): GpuTier | null` in `src/experience/gate-tier.ts` (subscribes to `qualityPref`).
- Behaviour: ExperienceGate uses `useQualityTier(detectedTier)` instead of `detectedTier` for the effective tier and keys `Experience` by `${mount}:${tier}`, so a change remounts the canvas on the same floor (the `!first` branch of `startSession` keeps the rover where it is; `startSession` calls `setTier`). Keep the gate change to these lines (sibling L edits the same file).

- [ ] **Step 1: Failing tests**

```ts
// tests/unit/quality-pref.test.ts
import { describe, expect, it } from "vitest";
import { applyQualityPref } from "@/lib/gpu-tier";
import { isQualityPref, QUALITY_PREFS } from "@/lib/quality-pref";

describe("graphics quality preference", () => {
  it("knows its values", () => {
    expect(QUALITY_PREFS).toEqual(["auto", "full", "lite"]);
    expect(isQualityPref("lite")).toBe(true);
    expect(isQualityPref("static")).toBe(false);
  });
  it("auto keeps the detected tier; a choice wins over detection", () => {
    expect(applyQualityPref("full", "auto", false)).toBe("full");
    expect(applyQualityPref("lite", "full", false)).toBe("full");
    expect(applyQualityPref("full", "lite", false)).toBe("lite");
  });
  it("never lifts a static device and never beats ?tier=", () => {
    expect(applyQualityPref("static", "full", false)).toBe("static");
    expect(applyQualityPref("lite", "full", true)).toBe("lite");
  });
});
```

- [ ] **Step 2: Run, expect FAIL.** `bunx vitest run tests/unit/quality-pref.test.ts`

- [ ] **Step 3: Implement**

```ts
// src/lib/quality-pref.ts
import { createLocalPref } from "./local-pref";

/** Graphics quality (Settings panel): Auto follows the device probe; Full and Lite override it. Lite saves battery. */
export const QUALITY_PREFS = ["auto", "full", "lite"] as const;
export type QualityPref = (typeof QUALITY_PREFS)[number];
export const isQualityPref = (v: unknown): v is QualityPref => typeof v === "string" && (QUALITY_PREFS as readonly string[]).includes(v);
export const qualityPref = createLocalPref<QualityPref>("hq:quality", "auto", isQualityPref);
```

```ts
// src/lib/gpu-tier.ts (append; import the type only)
import type { QualityPref } from "./quality-pref";

/**
 * The visitor's graphics quality over the probe's tier. A `?tier=` override (tests, debugging) and a
 * static device (no WebGL2, Save-Data, software renderer) always win.
 */
export function applyQualityPref(detected: GpuTier, pref: QualityPref, overridden: boolean): GpuTier {
  if (overridden || detected === "static" || pref === "auto") return detected;
  return pref;
}
```

`gate-tier.ts`: keep a module `let overridden = false;`, set `overridden = isTier(inputs.override)` where `decideTier(inputs)` runs (import `isTier` from `@/lib/gpu-tier`); export:

```ts
export const tierOverridden = () => overridden;

/** The effective tier: the probe's, adjusted by the Settings panel's graphics quality (applies at once). */
export function useQualityTier(detected: GpuTier | null): GpuTier | null {
  const pref = useSyncExternalStore(qualityPref.subscribe, qualityPref.get, () => "auto" as const);
  return detected === null ? null : applyQualityPref(detected, pref, overridden);
}
```

`ExperienceGate.tsx`:

```ts
const detectedTier = useQualityTier(useGateTier());
```

(rename the old `useGateTier()` result accordingly; the recovery effect keeps using `detectedTier`, now effective) and `key={`${mount}:${tier}`}` on `<Experience>`.

- [ ] **Step 4: Run** `bunx vitest run tests/unit/quality-pref.test.ts tests/unit/gpu*.test.ts` and `bunx tsc --noEmit -p .` Expected PASS.

- [ ] **Step 5: Commit** `rtk git commit -m "feat(3d): graphics quality preference (Auto, Full, Lite) that remounts the canvas"`

---

### Task 4: Settings definitions and the generic panel

**Files:**
- Create: `src/hud/settings/defs/language.ts`, `motion.ts`, `quality.ts`, `sound.ts`, `minimap.ts`; `src/hud/minimap/pref.ts`; `src/hud/settings/SettingsPanel.tsx`
- Modify: `src/hud/settings/defs/index.ts`, `messages/en.json`, `messages/id.json`
- Test: `tests/hud/SettingsPanel.test.tsx`

**Interfaces:**
- Consumes: Task 1 registry, Task 2 engine methods, Task 3 `qualityPref`, store `motion`/`setMotion`/`locale`, `switchLocale` (`src/hud/switchLocale.ts`).
- Produces:
  - `minimapPref: LocalPref<"on" | "off">` (key `hq:minimap`, fallback `on`) in `src/hud/minimap/pref.ts`.
  - `SettingsPanel({ defs = SETTINGS, headingLevel = 3 }: { defs?: readonly SettingDef[]; headingLevel?: 2 | 3 })`: `data-testid="settings-panel"`; per group a `<section aria-labelledby>` with heading `hud.settings.groups.<group>`; rows `data-testid="setting-<id>"`.
    - toggle: `<button role="switch" aria-checked>` whose visible text is the label (label-in-name), with an `AccentDot` (cyan glow on, `line` off).
    - choice: `<fieldset>` + `<legend>` (label) + native radios styled like `MotionChoices`.
    - range: `<label>` + `<input type="range">` with `aria-valuetext` (`hud.settings.percent` "{value} percent").
    - optional hint `<p>` under the row (`aria-describedby` on the control).
    - every control reads through `useSyncExternalStore(def.subscribe, def.control.get, def.control.get)`.
- Definitions (ids, groups, orders, keys):

| id | group | order | control | source |
|---|---|---|---|---|
| `language` | general | 10 | choice `en`/`id` (`language.en` "English", `language.id` "Bahasa Indonesia") | get `getHQStore().getState().locale`, set `switchLocale(v)` when different, subscribe store |
| `motion` | display | 10 | choice `system`/`full`/`reduced`, hint `motion.hint` | store `motion` / `setMotion` |
| `quality` | display | 20 | choice `auto`/`full`/`lite`, hint `quality.hint` "Lite saves battery." | `qualityPref` |
| `minimap` | display | 40 | toggle | `minimapPref` (`on`) |
| `sound` | sound | 10 | toggle (master, key M) | `audio.isMuted()` inverted, `audio.setMuted` |
| `effects` | sound | 20 | toggle | `audio.getSettings().effects`, `audio.setEffects` |
| `music` | sound | 30 | toggle | `audio.getSettings().music`, `audio.setMusic` |
| `music-volume` | sound | 40 | range 0 to 100 step 5 (UI percent; set divides by 100) | `audio.getSettings().musicVolume` |

`available` for `effects`, `music` and `music-volume`: always true (they show while the master is off too; the hint `sound.hint` says "Sound off mutes everything.").

- Messages (`hud.settings`, both locales; ID in natural Indonesian):

```json
"settings": {
  "title": "Settings",
  "open": "Settings",
  "close": "Close settings",
  "percent": "{value} percent",
  "groups": { "general": "General", "display": "Display", "sound": "Sound" },
  "language": { "label": "Language", "en": "English", "id": "Bahasa Indonesia" },
  "motion": { "label": "Motion", "hint": "System follows your device. Reduced cuts rides and glides.", "system": "System", "full": "Full", "reduced": "Reduced" },
  "quality": { "label": "Graphics quality", "hint": "Lite saves battery. A change reloads the 3D view.", "auto": "Auto", "full": "Full", "lite": "Lite" },
  "minimap": { "label": "Minimap" },
  "sound": { "label": "Sound", "hint": "Off mutes everything (key M)." },
  "effects": { "label": "Sound effects" },
  "music": { "label": "Music" },
  "musicVolume": { "label": "Music volume" }
}
```

ID: `"title": "Pengaturan"`, `"open": "Pengaturan"`, `"close": "Tutup pengaturan"`, `"percent": "{value} persen"`, groups `Umum`, `Tampilan`, `Suara`; language label `Bahasa`; motion `Gerakan`, hint "Sistem mengikuti perangkat Anda. Dikurangi memotong perjalanan dan transisi kamera.", `Sistem`, `Penuh`, `Dikurangi`; quality `Kualitas grafis`, hint "Lite menghemat baterai. Perubahan memuat ulang tampilan 3D.", `Otomatis`, `Penuh`, `Lite`; minimap `Peta mini`; sound `Suara`, hint "Mati membisukan semuanya (tombol M)."; effects `Efek suara`; music `Musik`; musicVolume `Volume musik`.

- [ ] **Step 1: Failing component test** (`tests/hud/SettingsPanel.test.tsx`, jsdom, `NextIntlClientProvider` with `messages/en.json` as in `tests/hud/Controls.test.tsx`; mock `@/lib/audio` with an in-memory fake engine object implementing `isMuted`, `setMuted`, `subscribe`, `getSettings`, `setEffects`, `setMusic`, `setMusicVolume`; mock `@/hud/switchLocale`):

```tsx
it("renders every group and setting from the registry", () => {
  render(<SettingsPanel />, { wrapper: Wrap });
  for (const name of ["General", "Display", "Sound"]) expect(screen.getByRole("heading", { name })).toBeInTheDocument();
  for (const id of ["language", "motion", "quality", "minimap", "sound", "effects", "music", "music-volume"]) expect(screen.getByTestId(`setting-${id}`)).toBeInTheDocument();
});
it("toggles write through to their store and re-render", async () => {
  render(<SettingsPanel />, { wrapper: Wrap });
  const music = screen.getByRole("switch", { name: "Music" });
  expect(music).toHaveAttribute("aria-checked", "true");
  await userEvent.click(music);
  expect(fakeAudio.setMusic).toHaveBeenCalledWith(false);
  expect(screen.getByRole("switch", { name: "Music" })).toHaveAttribute("aria-checked", "false");
});
it("choices apply at once (motion through the store, language through switchLocale)", async () => {
  render(<SettingsPanel />, { wrapper: Wrap });
  await userEvent.click(screen.getByRole("radio", { name: "Reduced" }));
  expect(getHQStore().getState().motion).toBe("reduced");
  await userEvent.click(screen.getByRole("radio", { name: "Bahasa Indonesia" }));
  expect(switchLocale).toHaveBeenCalledWith("id");
});
it("the music volume slider reports percent", () => {
  render(<SettingsPanel />, { wrapper: Wrap });
  const slider = screen.getByRole("slider", { name: "Music volume" });
  fireEvent.change(slider, { target: { value: "40" } });
  expect(fakeAudio.setMusicVolume).toHaveBeenCalledWith(0.4);
  expect(slider).toHaveAttribute("aria-valuetext", "40 percent");
});
it("accepts an extra registered setting (sibling extension point)", () => {
  const extra = defineSetting({ id: "day-night", group: "display", order: 30, labelKey: "minimap.label", control: { kind: "toggle", get: () => false, set: () => {} }, subscribe: () => () => {} });
  render(<SettingsPanel defs={[...SETTINGS, extra]} />, { wrapper: Wrap });
  expect(screen.getByTestId("setting-day-night")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run, expect FAIL.** `bunx vitest run tests/hud/SettingsPanel.test.tsx`

- [ ] **Step 3: Implement** the defs (each file `export const xSetting = defineSetting({...})`), list them in `defs/index.ts` in group order, and the panel:

```tsx
// src/hud/settings/SettingsPanel.tsx (core of the renderer)
"use client";
import { useTranslations } from "next-intl";
import { useId, useSyncExternalStore } from "react";
import { AccentDot } from "@/components/AccentDot";
import { SETTINGS } from "./defs";
import { settingsByGroup, type SettingDef } from "./registry";

function useValue<T>(def: SettingDef, get: () => T): T {
  return useSyncExternalStore(def.subscribe, get, get);
}

function ToggleRow({ def }: { def: SettingDef & { control: { kind: "toggle" } } }) {
  const t = useTranslations("hud.settings");
  const on = useValue(def, def.control.get);
  const hint = useId();
  return (
    <div data-testid={`setting-${def.id}`}>
      <button type="button" role="switch" aria-checked={on} aria-describedby={def.hintKey ? hint : undefined} onClick={() => def.control.set(!on)}
        className="hq-glow flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 text-left text-sm text-ink">
        {t(def.labelKey)}
        <span aria-hidden="true" className={`inline-flex h-6 w-10 items-center rounded-full border px-0.5 transition ${on ? "border-cyan/60 bg-cyan/20 justify-end" : "border-glass-border justify-start"}`}>
          <AccentDot tone={on ? "cyan" : "line"} glow={on} size="md" />
        </span>
      </button>
      {def.hintKey && <p id={hint} className="px-3 text-xs leading-4 text-ink-3">{t(def.hintKey)}</p>}
    </div>
  );
}
```

`ChoiceRow` mirrors `MotionChoices` (fieldset, legend, `grid-cols-<n>`, `has-[:checked]` styles); `RangeRow` uses `<input type="range" min max step value onChange={(e) => def.control.set(Number(e.target.value))}` where the `music-volume` definition maps 0 to 100 in its own get/set (get `Math.round(v * 100)`, set `v / 100`), plus `aria-valuetext={t("percent", { value })}` and `accent-[var(--color-cyan)]` styling. Narrow the union with `def.control.kind` in a small `Row` switch. Headings use `h${headingLevel}` with `label text-ink-3` styling.

- [ ] **Step 4: Run** `bunx vitest run tests/hud/SettingsPanel.test.tsx tests/unit/settings-registry.test.ts` and the messages parity tests (`bunx vitest run tests/content tests/unit/client-namespaces.test.ts`). Expected PASS.

- [ ] **Step 5: Commit** `rtk git commit -m "feat(hud): settings panel with language, motion, quality, minimap and sound settings"`

---

### Task 5: Corners primitives: layout, floor chip and sheet, reset view, joystick boost

**Files:**
- Create: `src/hud/layout.ts`, `src/hud/FloorButtons.tsx`, `src/hud/FloorChip.tsx`, `src/hud/boost.ts`
- Modify: `src/hud/ElevatorPanel.tsx`, `src/hud/BoostButton.tsx`, `src/hud/Joystick.tsx`, `src/hud/ViewControls.tsx`, `src/components/Modal.tsx`, `messages/*.json`
- Test: `tests/unit/hud-layout.test.ts`, `tests/hud/FloorChip.test.tsx`, `tests/hud/Joystick.test.tsx`, keep `tests/hud/BoostButton.test.tsx` green

**Interfaces:**
- Produces:
  - `type HudLayout = "phone" | "tablet" | "desktop"`; `hudLayout(viewport: ViewportClass, coarse: boolean): HudLayout` (`mobile` to phone; `tablet` to tablet; `desktop` and coarse to tablet; else desktop); `useHudLayout(): HudLayout` (store selector).
  - `FloorButtons({ data, variant, onPick? }: { data: ExperienceData; variant: "rail" | "rail-compact" | "rail-codes" | "sheet"; onPick?: () => void })`: the elevator buttons (same `aria-label` `hud.goToFloor`, `data-floor`, `aria-current`, prefetch on hover/focus, emits `{ type: "elevator", to }`); `sheet` renders full-width rows (code circle, nav label, floor name) at least 52 px tall.
  - `ElevatorPanel` keeps its markup and test ids but renders `FloorButtons`.
  - `FloorChip({ data, layout })`: `data-testid="floor-chip"`, `data-onboard="elevator"`, `aria-haspopup="dialog"`, visible text `{floor} {label}` (phone: code plus nav label when the chip fits, tablet: code, nav label and floor name) plus an aria-hidden chevron; `aria-label` from `hud.floorChip` "{floor} {label}: change floor ({name})". Opens a `Modal sheet` (`testId="floor-sheet"`, title `hud.elevator`) with `FloorButtons variant="sheet"`; picking a floor closes it and returns focus.
  - `useBoostToggle(): { on: boolean; toggle(): void; set(on: boolean): void }` in `src/hud/boost.ts` (moves the floor-change/ride reset and unmount reset out of `BoostButton`).
  - `Joystick({ boost = false }: { boost?: boolean })`: when `boost`, two pointer downs within `DOUBLE_TAP_MS = 300` ms toggle boost; `data-boost="on"` and a cyan ring while on; `aria-hidden` stays (keyboard boost is Shift). Export `DOUBLE_TAP_MS`.
  - `ResetView()`: a `role="group"` with `aria-label` `hud.view.label`, `data-testid="view-controls"`, `data-onboard="view"`, one round 48 px button `data-testid="view-reset"` named `hud.view.reset`.
  - `Modal` gains `side?: boolean`: from 640 px a right-side, full-height panel (`sm:justify-end sm:p-0`, panel `sm:h-dvh sm:max-w-[400px] sm:rounded-none`), phones keep the bottom sheet.
- Copy: `hud.floorChip` "{floor} {label}: change floor ({name})" / "{floor} {label}: ganti lantai ({name})"; `hud.hintCoarse` boost part becomes "Boost: double-tap the joystick" / ID equivalent; keep the rest.

- [ ] **Step 1: Failing tests**

```ts
// tests/unit/hud-layout.test.ts
import { describe, expect, it } from "vitest";
import { hudLayout } from "@/hud/layout";
describe("hudLayout", () => {
  it("maps viewport and pointer to the Corners or desktop HUD", () => {
    expect(hudLayout("mobile", true)).toBe("phone");
    expect(hudLayout("mobile", false)).toBe("phone");
    expect(hudLayout("tablet", true)).toBe("tablet");
    expect(hudLayout("tablet", false)).toBe("tablet");
    expect(hudLayout("desktop", true)).toBe("tablet");
    expect(hudLayout("desktop", false)).toBe("desktop");
  });
});
```

`tests/hud/FloorChip.test.tsx`: renders with a minimal `ExperienceData` stub (`floors` for all five ids, `profile`), asserts the chip's accessible name starts with "L1 Home", clicking opens a dialog with five `[data-floor]` buttons in RF..L1 order, clicking L3 emits `{ type: "elevator", to: "L3" }` (spy `intents.on`) and closes the dialog.

`tests/hud/Joystick.test.tsx`: with `boost`, two `pointerDown`s 100 ms apart (fake timers, `vi.setSystemTime`) set `data-boost="on"` and call `setBoost(true)` (mock `@/experience/input/joystick`); two 400 ms apart do not; without `boost` nothing toggles; a store floor change resets it to off.

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement** (move BoostButton's reset logic verbatim into `useBoostToggle`; `BoostButton` becomes a thin view over it; Joystick keeps `lastDown = useRef(0)` and calls `boost.toggle()` on a qualifying second down before `update(e)`).

- [ ] **Step 4: Run** `bunx vitest run tests/unit/hud-layout.test.ts tests/hud/FloorChip.test.tsx tests/hud/Joystick.test.tsx tests/hud/BoostButton.test.tsx tests/unit/label-in-name.test.ts` Expected PASS.

- [ ] **Step 5: Commit** `rtk git commit -m "feat(hud): floor chip and sheet, single reset button, joystick double-tap boost"`

---

### Task 6: Menu sheet and Corners composition

**Files:**
- Create: `src/hud/menu/HudMenu.tsx`, `src/hud/menu/SettingsSheet.tsx`, `src/hud/menu/useHudToggles.ts`
- Modify: `src/hud/Hud.tsx`, `src/hud/Controls.tsx`, `src/hud/ProfileCard.tsx` (export `ProfilePhoto`), `src/experience/input/intents.ts`, `src/experience/scene/Director.tsx` (ignore the new toggles), `messages/*.json`
- Test: `tests/hud/HudMenu.test.tsx`, `tests/unit/intents.test.ts` (or the existing key mapping test file; `grep -rl keyToIntent tests`), update `tests/hud/Controls.test.tsx`, `tests/hud/ProfileCard.test.tsx`

**Interfaces:**
- Consumes: Task 4 `SettingsPanel`, Task 5 `FloorChip`, `ResetView`, `Joystick boost`, `useHudLayout`.
- Produces:
  - Intent union: `{ type: "toggle"; what: "sound" | "lang" | "readme" | "map" | "settings" }`; `keyToIntent("n")` gives `map`, `keyToIntent(",")` gives `settings`. The Director's `toggle` case already ignores other values (verify; no behaviour change there).
  - `useHudToggle(what: "map" | "settings"): [open: boolean, setOpen: (v: boolean) => void]` in `useHudToggles.ts`: local state toggled by the intent (subscribe with `intents.on`).
  - `HudMenu({ data, layout, onExit, onToggleLang })`: menu button (`aria-label` `hud.menu`, `aria-haspopup="dialog"`, `data-testid="hud-menu"`, and on phones `data-onboard="ask-rover"` because Ask Rover lives inside) that opens `Modal side` (`testId="menu-sheet"`, title `hud.menuTitle` "Menu") containing, in order:
    1. Profile block (photo, name, headline, current floor), no buttons.
    2. Actions grid (`data-testid="menu-actions"`), each at least 44 px: Classic site (`data-testid="page-view"`, solid cyan primary, `PageViewIcon`, name `hud.pageView`), Search (`hud.launcher.search`, calls `openPalette()` after closing), Ask Rover (`hud.launcher.askRover`, `openTerminal()`), Rotate left and Rotate right (`hud.view.rotateLeft/Right`, emit the orbit intents of `ViewControls`, menu stays open), Map (`hud.map.open`, opens the overview, Task 7).
    3. `SettingsPanel headingLevel={3}`.
    Tablet hides Search in the actions (it is visible in the bar).
  - `SettingsSheet({ open, onClose })`: desktop `Modal side` (`testId="settings-sheet"`, title `hud.settings.title`) with `SettingsPanel`; opened by the `,` key on every layout and by the desktop gear button (`data-testid="settings-open"`, `aria-label` `hud.settings.open`). On phones and tablets `,` opens the menu sheet instead.
  - `Hud` composition:
    - desktop: unchanged (`ProfileCard`, `TopBar`, `ElevatorPanel`, bottom band with `ViewControls`), plus Task 7's minimap cluster at the bottom right.
    - phone and tablet ("Corners"): `FloorChip` top left (`top-3 left-3`, `md:top-4 md:left-4`); top right cluster `CornersTopBar` (`data-testid="hud-topbar"`): `AskPill compact={layout === "phone"}`, on tablet the search button (from `HudLaunchers`, search only; add a `parts?: ("askRover" | "search")[]` prop), then `HudMenu`; minimap under it (Task 7); no `ElevatorPanel`, no `ProfileCard`, no `BoostButton`; bottom band left `Joystick boost`, right `ResetView`.
    - `HintBar` and `InteractStatus` unchanged.
  - Remove `MobileMenu` (replaced); keep `TopBar` for desktop.
- Copy: `hud.menuTitle` "Menu" / "Menu"; `hud.map.open` "Map" / "Peta".

- [ ] **Step 1: Failing tests**: `tests/hud/HudMenu.test.tsx` renders `HudMenu` (phone), opens it, asserts the dialog contains buttons named "Classic site", "Search", "Ask Rover", "Rotate left", "Rotate right", "Map", the settings rows (`setting-language`, `setting-motion`, `setting-sound`, `setting-music`), that Classic site calls `onExit`, Esc closes and focus returns to the menu button; tablet variant has no Search action. Key mapping test: `expect(keyToIntent("n")).toEqual({ type: "toggle", what: "map" })`, `expect(keyToIntent(",")).toEqual({ type: "toggle", what: "settings" })`, and both null `inText`. Update `Controls.test.tsx` (drop `MobileMenu` cases) and `ProfileCard.test.tsx` (drop the collapsed phone pill case; `ProfileCard` keeps only the full card).

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement.** In `Hud.tsx` compute `const layout = useHudLayout();` and branch on `layout === "desktop"`. Set `document.documentElement.dataset.hqHud = layout` in an effect (removed on unmount) for the Ask teaser (Task 8). Keep `data-testid` values `hud`, `hud-topbar`, `hud-bottom`, `view-controls`, `joystick`, `page-view` (now inside the menu on Corners).

- [ ] **Step 4: Run** `bunx vitest run tests/hud tests/unit/intents*.test.ts tests/unit/label-in-name.test.ts` and `bunx tsc --noEmit`. Expected PASS.

- [ ] **Step 5: Commit** `rtk git commit -m "feat(hud): Corners layout for phones and tablets with a menu sheet and settings"`

---

### Task 7: Minimap and overview

**Files:**
- Create: `src/hud/minimap/model.ts`, `src/hud/minimap/Minimap.tsx`, `src/hud/minimap/MapOverview.tsx`
- Modify: `src/hud/Hud.tsx`, `src/experience/Experience.tsx` (pass `layouts` to `Hud`), `messages/*.json`
- Test: `tests/unit/minimap-model.test.ts`, `tests/hud/Minimap.test.tsx`

**Interfaces:**
- Consumes: `FloorLayout`, `RoadNetwork` (`src/experience/types.ts`, `src/experience/nav/road.ts`), `Interactable` (type only) and `interactRuntime.items` (current floor's point-and-go targets, labels already localized), store `floor`, `rover` (10 Hz mirror), `visited`, `phase`; `intents.emit({ type: "interact", item })` for drive-there; `minimapPref`.
- Produces (pure, no React, no three):

```ts
export interface MapView { minX: number; minZ: number; width: number; depth: number }
export interface MapRoom { id: string; label: string; x: number; z: number; kind: Interactable["kind"]; visited: boolean; room?: RoomId }
export interface FloorMap {
  floor: FloorId;
  view: MapView;            // layout bounds plus the shaft, padded 2 u
  roads: { d: string; width: number }[];   // SVG path data in world units (x right, z down: north-up)
  plazas: { x: number; z: number; w: number; d: number; round: boolean }[];
  elevator: { x: number; z: number; size: number };  // SHAFT
  rooms: MapRoom[];         // de-duplicated by id, sorted west to east
}
export function buildFloorMap(layout: FloorLayout, items: readonly Interactable[], visited: readonly RoomId[]): FloorMap;
/** SVG rotation (degrees) of an arrow drawn pointing to -z (map up) for a rover heading (0 faces +z). */
export function arrowRotation(heading: number): number; // = 180 - heading * 180 / Math.PI
/** viewBox of a square window centred on the rover (minimap) or the whole floor (overview). */
export function windowBox(center: { x: number; z: number }, radius: number): string;
export function floorBox(view: MapView): string;
export const MINIMAP_RADIUS = 22; // world units shown from the rover to the minimap edge
export const MAP_ROOM_KINDS: readonly Interactable["kind"][] = ["door", "station", "board", "kiosk", "elevator-pad", "return-pad", "teleporter"];
```

  - Rooms: items with kind in `MAP_ROOM_KINDS`; `visited` when `item.action.type === "open-room"` and `visited.includes(item.action.room)`.
  - Road path: `M x0 z0 L x1 z1 ...` (closed roads end with `Z`); spurs as two-point paths with their width (default 1.2).
  - Components:
    - `Minimap({ data, layouts, size })`: hidden when `minimapPref` is `off` or the phase is `boot`, `intro` or `hologram`; a round button (`data-testid="minimap"`, `aria-label` `hud.map.label` "Map of {floor} {name}: open overview", `aria-haspopup="dialog"`) containing an aria-hidden SVG (`viewBox` from `windowBox(rover, MINIMAP_RADIUS)`, `clipPath` circle): roads (stroke `var(--color-line-2)` at 60% opacity, width per road), plazas, the elevator square (cyan outline), room dots (`AccentDot`-like circles: floor accent; visited `opacity-40`), rover arrow (cyan) rotated `arrowRotation(heading)`. Updates through the store's 10 Hz `rover` mirror (no own loop). Sizes: phone 72 px, tablet 112 px, desktop 96 px. `data-floor` attribute for tests.
    - `MapOverview({ open, onClose, data, layouts })`: `Modal` (`testId="map-overview"`, title `hud.map.title` "{floor} {name}") with the full-floor SVG (`floorBox`, labels on rooms via `<text>` at 1.4 u, `aria-hidden`) and, as its text alternative, a list of room buttons (`data-testid="map-room"`, name = room label, visited ones also say `hud.map.visited` "visited" after the label). Clicking a room closes the overview and emits `intents.emit({ type: "interact", item })` (point-and-go: drives there and runs its action). Esc and the backdrop close it.
  - Placement: Corners: the minimap sits under the top-right cluster (`absolute top-[64px] right-3`, tablet `top-[76px] right-4`); desktop: a bottom-right cluster above `ViewControls` with the minimap and the settings gear (`flex flex-col items-end gap-2`). The `N` key (`useHudToggle("map")`) opens the overview on every layout; the menu's Map action too.
- Copy: `hud.map.label` "Map of {floor} {name}: open overview" / "Peta {floor} {name}: buka ikhtisar"; `hud.map.title` "{floor} {name}" (both); `hud.map.rooms` "Places on this floor" / "Tempat di lantai ini"; `hud.map.visited` "visited" / "sudah dikunjungi"; `hud.map.close` "Close map" / "Tutup peta"; `hud.map.open` (Task 6).

- [ ] **Step 1: Failing tests**

```ts
// tests/unit/minimap-model.test.ts
import { describe, expect, it } from "vitest";
import { buildFloorLayouts, SHAFT } from "@/experience/config";
import { arrowRotation, buildFloorMap, floorBox, windowBox } from "@/hud/minimap/model";
import type { Interactable } from "@/experience/interact/registry";

const layouts = buildFloorLayouts(8);
const door = (id: string, room: string, x: number, z: number): Interactable =>
  ({ id, floor: "L1", kind: "door", label: room, at: { x, z }, bounds: { minX: x - 1, maxX: x + 1, minZ: z - 1, maxZ: z + 1 }, action: { type: "open-room", room } }) as Interactable;

describe("minimap model", () => {
  it("covers the floor bounds and the elevator shaft", () => {
    const map = buildFloorMap(layouts.L1, [], []);
    expect(map.view.minX).toBeLessThanOrEqual(SHAFT.x - SHAFT.size / 2);
    expect(map.view.minX + map.view.width).toBeGreaterThanOrEqual(layouts.L1.bounds.maxX);
    expect(map.elevator).toEqual({ x: SHAFT.x, z: SHAFT.z, size: SHAFT.size });
    expect(map.roads.length + map.plazas.length).toBeGreaterThan(0);
    expect(map.roads.every((r) => r.d.startsWith("M "))).toBe(true);
  });
  it("lists point-and-go rooms once, west to east, and dims visited rooms", () => {
    const items = [door("L1:door:b", "L1:stats", 10, 0), door("L1:door:a", "L1:profile", 2, 0), door("L1:door:a", "L1:profile", 2, 0)];
    const map = buildFloorMap(layouts.L1, items, ["L1:stats"]);
    expect(map.rooms.map((r) => r.id)).toEqual(["L1:door:a", "L1:door:b"]);
    expect(map.rooms.find((r) => r.id === "L1:door:b")?.visited).toBe(true);
  });
  it("north-up arrow: +z (south) points down, +x (east) points right", () => {
    expect(arrowRotation(0)).toBeCloseTo(180);
    expect(arrowRotation(Math.PI / 2)).toBeCloseTo(90);
    expect(arrowRotation(Math.PI)).toBeCloseTo(0);
  });
  it("view boxes", () => {
    expect(windowBox({ x: 0, z: 0 }, 20)).toBe("-20 -20 40 40");
    expect(floorBox({ minX: -1, minZ: -2, width: 3, depth: 4 })).toBe("-1 -2 3 4");
  });
});
```

(Check `SHAFT` is exported from `src/experience/config.ts`; it is defined at line 21. If not exported, export it.)

`tests/hud/Minimap.test.tsx`: with `interactRuntime.items` set to two doors and `layouts` from `buildFloorLayouts(8)`, the minimap button has the name "Map of L1 Home: open overview"; clicking opens `map-overview` with two `map-room` buttons; clicking one closes it and emits an `interact` intent with that item; `minimapPref.set("off")` hides the minimap.

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** the model, the components, the `layouts` prop (`<Hud data={data} layouts={layouts} .../>` in `Experience.tsx`; `Hud` props gain `layouts: Record<FloorId, FloorLayout>`), placements and the `N` key.
- [ ] **Step 4: Run** `bunx vitest run tests/unit/minimap-model.test.ts tests/hud/Minimap.test.tsx tests/hud` Expected PASS.
- [ ] **Step 5: Commit** `rtk git commit -m "feat(hud): SVG minimap and full-screen floor overview with point-and-go rooms"`

---

### Task 8: Rover toast, Ask nudge and the stale tour copy

**Files:**
- Modify: `src/hud/dialog/placement.ts`, `src/hud/dialog/DialogBox.tsx`, `src/hud/ask/AskDock.tsx`, `messages/en.json`, `messages/id.json`
- Test: `tests/unit/dialog-copy.test.ts`, `tests/hud/DialogBox.test.tsx`, `tests/hud/AskDock.test.tsx`

**Interfaces:**
- `dialogPlacement(viewport, coarse)`: unchanged mapping (`phone` for mobile coarse, `raised` for other coarse, `bottom` for fine), but `DIALOG_PLACE.phone` becomes the toast above the joystick: `bottom-[calc(168px+env(safe-area-inset-bottom))] left-3 right-3` (joystick 120 px plus the 24 px band padding plus a 24 px gap).
- `DialogBox` with `placement === "phone"` ("toast"):
  - compact styles (`p-2.5 text-[13px] leading-5`, portrait 32 px).
  - the typed text is clamped to 2 lines (`line-clamp-2`) until expanded; `data-expanded="true|false"`.
  - a tap on the box expands it when the line is clamped and not expanded; otherwise it advances (unchanged).
  - auto-advance: a line without choices, without `until` and fully typed advances after `TOAST_HOLD_MS = 4500` (not while expanded, not under a pending `until`); export `TOAST_HOLD_MS`.
  - choices and Skip still render (onboarding needs them).
- `AskDock` teaser: `attempt` also defers while `document.querySelector("[data-testid='dialog-box']")` exists; while the teaser shows, a 500 ms interval hides it as soon as a dialog box appears (the teaser stays "seen"). Tower position: `top-[var(--hq-teaser-top,116px)]`; `Hud` sets `--hq-teaser-top` on `<html>` (phone `148px`, tablet `200px`, desktop unset so the existing `sm:top-[124px] lg:top-[76px]` classes apply; keep those classes on desktop only by reading `html[data-hq-hud]`). Simplest implementation: in the tower branch use `top-[var(--hq-teaser-top,116px)] right-3 sm:right-4` and have the HUD set `--hq-teaser-top` for every layout (phone 148 px, tablet 200 px, desktop 124 px below 1024 px wide and 76 px from 1024 px; desktop computes it from `window.innerWidth` on resize).
- Stale copy (dialog namespace, both locales):
  - `dialog.onboarding.welcome`: "Hi, I'm Rover! Welcome to {name}'s HQ. Want a quick look at how things work?" / "Hai, saya Rover! Selamat datang di HQ {name}. Mau lihat sekilas cara menjelajah di sini?"
  - `dialog.onboarding.skipped`: "No problem. Replay the tutorial from Ask Rover anytime." / "Tidak masalah. Tutorial bisa diputar ulang kapan saja dari Tanya Rover."
  - `dialog.onboarding.closingShort`: "That's the basics! Replay the full tutorial from Ask Rover anytime." / "Itu dasarnya! Tutorial lengkap bisa diputar ulang dari Tanya Rover kapan saja."
  - Search every `dialog.*` string for `tour` (EN) and `tur` as a word (ID) and fix any other hit the same way.

- [ ] **Step 1: Failing tests**
  - `dialog-copy.test.ts`: add `it("no dialog line mentions the removed tours")` scanning every string under `en.dialog` for `/\btours?\b/i` and `id.dialog` for `/\btur\b/i`; update the placement assertions to `DIALOG_PLACE.phone` containing `bottom-[calc(168px` and `right-3` (no `right-[68px]`).
  - `DialogBox.test.tsx`: phone placement renders `data-expanded="false"` with `line-clamp-2`; the first click on a long line sets `data-expanded="true"` (stub `scrollHeight > clientHeight`), the second advances; a choiceless short line auto-advances after `TOAST_HOLD_MS` with fake timers; the `bottom` placement never auto-advances.
  - `AskDock.test.tsx`: with a `[data-testid='dialog-box']` element in the document the teaser does not appear after its delay; removing it lets it appear on the next attempt; a dialog appearing while the teaser shows hides it.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `bunx vitest run tests/unit/dialog-copy.test.ts tests/hud/DialogBox.test.tsx tests/hud/AskDock.test.tsx tests/hud/OnboardingLayer.test.tsx` Expected PASS.
- [ ] **Step 5: Commit** `rtk git commit -m "feat(hud): slim Rover toast on phones, Ask nudge never with a dialog, tour copy fixed"`

---

### Task 9: End-to-end coverage and spec updates

**Files:**
- Create: `e2e/hud-corners.spec.ts`
- Modify: `e2e/hud.spec.ts`, `e2e/onboarding.spec.ts`, `e2e/boost.spec.ts`, `e2e/experience.spec.ts`, `e2e/camera.spec.ts`, `e2e/motion.spec.ts`, `e2e/screenshots.spec.ts`, `e2e/labs.spec.ts`, `e2e/drawer-solid.spec.ts` (re-check only), `scripts/e2e-plan.ts` (map `src/hud/menu/**`, `src/hud/minimap/**`, `src/hud/settings/**`, `src/hud/FloorChip.tsx`, `src/hud/layout.ts` to `hud-corners`, `hud`, `onboarding`)

**`e2e/hud-corners.spec.ts`** (every test: `asReturningVisitor`, `skipFloorLines`, `sessionStorage hq:ask-teaser=1` via `addInitScript`, `?tier=lite`, `waitForSceneLive`):

```ts
const VIEWPORTS = [
  { name: "phone", width: 390, height: 844, touch: true, max: 5 },
  { name: "tablet", width: 834, height: 1194, touch: true, max: 9 },
  { name: "tablet-landscape", width: 1194, height: 834, touch: true, max: 9 },
] as const;

/** Visible, enabled controls in the HUD (buttons, links, inputs, the joystick), minus the minimap and dialogs. */
async function visibleControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const hud = document.querySelector("[data-testid='hud']");
    if (!hud) return [];
    const nodes = [...hud.querySelectorAll<HTMLElement>("button, a[href], input, [data-testid='joystick']")];
    return nodes
      .filter((el) => !el.closest("[data-testid='minimap'], [role='dialog']"))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && r.bottom > 0 && r.top < innerHeight;
      })
      .map((el) => el.getAttribute("data-testid") ?? el.getAttribute("aria-label") ?? el.textContent?.trim() ?? el.tagName);
  });
}
```

Tests:
1. Per viewport: count `<= max`, list attached to the report (`test.info().attach`), `floor-chip`, `ask-pill`, `hud-menu`, `minimap`, `joystick`, `view-reset` visible; `elevator-panel`, `boost` and `page-view` not visible; screenshot attached.
2. Two-tap reachability (phone): menu then each of Classic site, Search, Ask Rover, Rotate left, Rotate right, Map visible in `menu-sheet`; settings rows language, motion, quality, minimap, sound, effects, music, music-volume visible (scroll into view); floor chip then five floor buttons in `floor-sheet`; clicking L2 closes the sheet and `waitForFloor(page, "L2")`.
3. Classic site from the menu opens the Page View (`back3d` button visible).
4. Minimap overview (phone): tap `minimap`, `map-overview` visible with at least 3 `map-room` buttons; tap the first door room, the overview closes and the rover moves (`waitForRoverMove`).
5. Settings persist and apply: turn Minimap off, the minimap disappears, reload, still off (`localStorage hq:minimap = off`); Motion Reduced sets `html[data-motion=reduced]`; Music off writes `hq:music=off`.
6. Joystick double tap toggles boost (`data-boost="on"`) and a floor change resets it.
7. Desktop 1440x900: today's top bar (`page-view` visible in `hud-topbar`, `elevator-panel` visible), `minimap` visible at the bottom right above `view-controls` (box check), `,` opens `settings-sheet`, `n` opens `map-overview`, Esc closes both; axe on the open settings sheet and overview (`AxeBuilder`, no serious or critical).
8. Axe on the phone menu sheet and floor sheet.

Updates (from the inventory):
- `hud.spec.ts`: the top-bar test runs on desktop only; add a Corners top-bar check (chip left, Ask and menu right, within 24 px of the edges); profile photo test: desktop only (Corners shows it in the menu sheet: assert there on phone); bottom band test: replace `boost` with `view-reset`, drop the joystick-boost overlap.
- `onboarding.spec.ts` phone layout: overlap list becomes `["joystick", "view-controls", "floor-chip", "hud-menu", "minimap"]`; assert the toast sits above the joystick (`dialog.y + dialog.height <= joystick.y`).
- `boost.spec.ts` touch cases: double-tap the joystick (two `page.touchscreen.tap` 120 ms apart on its center) and read `data-boost`.
- `experience.spec.ts` phone elevator label test: open `floor-chip`, check labels in `floor-sheet` are not clipped; drop the 56 px column check.
- `camera.spec.ts` phone: the `view-controls` group still exists (ResetView keeps the label).
- `motion.spec.ts` phone: open `hud-menu`, the Motion radios live in `setting-motion`.
- `screenshots.spec.ts`: on tablet and mobile open the menu before Classic site; P6 phone pose screenshots `floor-chip` and changes floors through the sheet.
- `labs.spec.ts` phone AI board share: re-measure with the panel gone and raise the threshold accordingly (keep a 20% margin under the measured value).

- [ ] **Step 1:** Write `e2e/hud-corners.spec.ts` and the updates.
- [ ] **Step 2:** `bun run build` then `bunx playwright test e2e/hud-corners.spec.ts e2e/hud.spec.ts e2e/onboarding.spec.ts e2e/boost.spec.ts` (fix failures in code or tests; never wait on time, wait on state).
- [ ] **Step 3:** `bun run e2e:changed` (covers the rest of the mapped specs). Expected all green.
- [ ] **Step 4: Commit** `rtk git commit -m "test(e2e): Corners HUD control counts, menu, minimap and settings"`

---

### Task 10: Docs, captures, budgets and the PR

**Files:**
- Modify: `docs/agents/hud-and-drawer.md` (new sections: Corners layout, Settings registry, Minimap; storage keys `hq:quality`, `hq:minimap`, `hq:sfx`, `hq:music`, `hq:music-volume`; dialog toast placement; Motion UI now also in the settings panel), `docs/agents/styling-and-i18n.md` ("3D HUD layout" section: Corners on phones and tablets, desktop unchanged plus the minimap and gear), `docs/agents/floors.md` (one bullet: the minimap reads `buildFloorLayouts` and `interactRuntime.items`; a floor change that alters roads or targets shows up there automatically), `docs/agents/3d-experience.md` (gate: quality preference over the probe), `src/lib/audio/README.md` (done in Task 2), `docs/features.md` (status log line and the HUD section), `docs/decisions.md` (dated row 2026-10-17: Corners HUD, minimap, settings panel, owner-approved layout A), `README.md` only if the overview mentions the phone HUD controls (check; update the line if so), this plan's status.
- Captures: before (from the baseline build `out-before/`) and after at 390x844, 834x1194, 1194x834 (touch) and 1440x900, L1 after arrival, returning visitor, teaser seen; plus phone menu sheet, floor sheet, minimap overview and desktop settings sheet. Save under the session artifacts folder (not the repo).

- [ ] **Step 1:** Update the docs (current state only, no history in `docs/agents/`).
- [ ] **Step 2:** `bun run verify:quick` (typecheck, lint, unit, build, og:check). Fix everything.
- [ ] **Step 3:** Bytes: `E2E_PORT=4180 bun run e2e:perf e2e/perf/<bytes spec>` (find the bytes spec: `ls e2e/perf`) or the bytes check in the e2e suite; record main path and session totals vs main. If the session total grows by more than 6 KB gzip, lazy-load `MapOverview` and the menu sheet body with `lazyFromChunk`-style dynamic imports and re-measure, then re-check the Page View JS budget (Lighthouse CI) did not grow.
- [ ] **Step 4:** Captures and control counts (from the `hud-corners` attachments).
- [ ] **Step 5:** Rebase on `origin/main`, check CI capacity (`gh run list -R ShinyQ/ShinyQ-HQ -s in_progress` and `-s queued`), push, open the PR (do not merge), report to the coordinator.

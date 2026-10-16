# Day and Night with a Moving Sun and Moon Implementation Plan

Status: in review (Round 8 K), 2026-10-17

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The 3D tower runs an 8 minute day and night cycle from clock time: neon night (today's look plus a moon and stars) to a deep twilight "day" (indigo to teal sky, a sun glow on the horizon), with a sun and a moon moving on a low arc around the tower, at no new shader program and at most 2 extra draw calls.

**Architecture:** A pure module (`src/experience/sky/dayNight.ts`) maps a phase in [0, 1) to a sky state (sun and moon directions, colors, light and bloom values, star amount); night (phase 0) reproduces today's `sceneSettings` values exactly. A scene-level `SkyController` draws a camera-centered sky dome and a two-instance sun and moon mesh, both as new `uMode` branches of the shared instanced holo program (`fx/holoFx.ts`), and per frame copies the sky state into the background, fog, the two scene lights and the full tier's bloom intensity. A small preference store (`src/lib/day-night.ts`) holds the visitor's on/off choice for the settings panel of sub-project I.

**Tech Stack:** Next.js 16 static export, React Three Fiber, three.js `ShaderMaterial`, postprocessing (full tier bloom), Zustand store, Vitest, Playwright.

## Global Constraints

- Spec: Round 8 design, section 5 (K), sections 2 and 7. Owner decisions (verbatim intent): neon night stays the base; "day" is a deep twilight (indigo to teal sky with a sun glow on the horizon); night is today's look with a moon and stars; neon glows brighter at night; a full cycle takes 8 minutes; the phase comes from clock time (`Date.now() % 8 min`) so every visitor sees the same phase; reduced motion holds night unless the visitor turns the cycle on; Classic site unchanged.
- No new shader program (programs per floor stay within `e2e/perf/baseline.json` and must not grow), at most +2 scene draw calls (sun and moon), L1 at most 125 and every floor under 150 draw calls, under 30k triangles, memory gates green, 3D byte budgets (`BYTES_3D_BUDGET`), perf lane unchanged.
- No em dashes (U+2014) anywhere. EN and ID for every user-facing string.
- Pure modules stay free of React and three side effects (Vitest runs them in node).
- `useDispose(value)` after every memoized geometry or material; animate with `useFrame` only.
- Do not touch HUD (`src/hud/**`) or camera (`src/experience/camera/**`) files: siblings I and J own them. The "Day and night" toggle goes into I's settings registry (`src/hud/settings/defs/day-night.ts`, id `day-night`, group `display`, order 30, labelKey `dayNight.label`) once I's registry is on `main`.
- Automation (`navigator.webdriver`: e2e, Lighthouse, visual gate) holds night unless `?sky=` says otherwise, so captures stay deterministic.

## Design notes

- **Dome horizon.** The follow cameras look about 38 degrees down (desktop offset [16, 18, 16], fov 40: the frame top is about -18.5 degrees), so the visible "sky" in default views is the void below the true horizon. The dome's own horizon sits at `SKY.horizon` (about -24 degrees) and the sun and moon ride a shallow arc around it (`SKY.arc`), rising slightly above it at their peak. In first person the whole dome shows; the tower floats, so a low horizon reads naturally.
- **Arc.** Angle `theta = 2 pi phase`. Sun height `h = -cos(theta)` (-1 at midnight, +1 at midday). Sun elevation `SKY.horizon + SKY.arc * h`, azimuth `theta + SKY.azimuth`; the moon is the same arc half a turn later (opposite). `SKY.azimuth` puts the night moon (phase 0) and the midday sun in front of the L1 default camera.
- **Mixing.** `day = smoothstep(-0.7, 0.7, h)` (exactly 0 through the night, 1 around midday), `warm = 4 day (1 - day)` (dawn and dusk warmth, 0 at night and midday), `stars = 1 - smoothstep(0, 0.5, day)`.
- **Night equals today.** At `day = 0` the sky colors, fog, background, hemisphere and directional light and bloom intensity equal `sceneSettings`. Only stars and the moon are added.
- **One program.** The dome (`HOLO_MODE.sky`) and the sun and moon (`HOLO_MODE.orb`) are instanced holo meshes with an instance color, like `HoloMesh`, so they compile to the existing instanced holo program. New uniforms `uSun` and `uGlow` are declared in `HOLO_FS` and carried by every holo material.
- **Draw order.** The dome is transparent, normal blending, depth write off, `renderOrder` -100, radius 400 (camera far 600) and centered on the camera each frame: opaque geometry occludes it through the depth test and every other transparent draws after it.
- **Neon.** The full tier's bloom intensity follows `bloom` (0.9 at night, today; 0.72 at twilight day). Lite has no bloom and keeps its neon as is.
- **Mode resolution.** `?sky=night|dawn|day|dusk|<0..1>` pins a phase; `?sky=cycle` runs the clock. Otherwise automation holds night, and a visitor runs the clock when `dayNightOn(pref, reducedMotion)` (the stored choice wins; with none, on unless reduced motion).

## File structure

| File | Responsibility |
|---|---|
| `src/experience/sky/dayNight.ts` (create) | Pure: cycle constants, `clockPhase`, `parseSkyParam`, `resolveSkyMode`, `skyState` |
| `src/lib/day-night.ts` (create) | Visitor preference store: `readDayNight`, `setDayNight`, `subscribeDayNight`, `dayNightOn` |
| `src/experience/fx/holoFx.ts` (modify) | `HOLO_MODE.sky` (12) and `HOLO_MODE.orb` (13), uniforms `uSun`, `uGlow` |
| `src/experience/sky/SkyController.tsx` (create) | Dome, sun and moon mesh, lights, per-frame background, fog, light and bloom updates, `skyRuntime` probe |
| `src/experience/sky/skyRuntime.ts` (create) | Mutable per-frame sky state shared with the RF stars and `window.__hq.sky` |
| `src/experience/scene/Scene.tsx` (modify) | Mount `SkyController` in place of the static lights |
| `src/experience/Experience.tsx` (modify) | `__hq.sky` |
| `src/experience/floors/roof/Sky.tsx` (modify) | RF star dome fades with `skyRuntime.stars` |
| `tests/unit/day-night.test.ts`, `tests/unit/day-night-pref.test.ts` (create) | Unit tests |
| `e2e/daynight.spec.ts` (create), `scripts/e2e-plan.ts` (modify) | E2E: phases, program count, draw calls, held night |
| `scripts/sky-shots.ts` (create) | Review captures at four phases on L1 and L3, desktop and phone |
| `docs/agents/3d-experience.md`, `docs/features.md`, `docs/decisions.md`, `docs/superpowers/README.md` | Docs |

---

### Task 1: Pure sky model

Depends on Task 2 (`dayNightOn`, `DayNightPref` from `src/lib/day-night.ts`): run Task 2 first.

**Files:**
- Create: `src/experience/sky/dayNight.ts`
- Test: `tests/unit/day-night.test.ts`

**Interfaces:**
- Produces: `CYCLE_MS`, `SKY_PHASES`, `SKY`, `clockPhase(nowMs): number`, `parseSkyParam(search): SkyParam`, `resolveSkyMode(input): SkyMode`, `skyState(phase, out?): SkyState`, `orbDirection(phase, out?)`.

- [x] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { Color } from "three";
import { sceneSettings } from "@/experience/scene/settings";
import { clockPhase, CYCLE_MS, parseSkyParam, resolveSkyMode, skyState, SKY, SKY_PHASES } from "@/experience/sky/dayNight";

describe("day and night model", () => {
  it("runs an 8 minute cycle from clock time", () => {
    expect(CYCLE_MS).toBe(480_000);
    expect(clockPhase(0)).toBe(0);
    expect(clockPhase(120_000)).toBeCloseTo(0.25);
    expect(clockPhase(480_000 * 3 + 240_000)).toBeCloseTo(0.5);
  });
  it("parses ?sky=", () => {
    expect(parseSkyParam("?sky=day")).toEqual({ kind: "phase", phase: 0.5 });
    expect(parseSkyParam("?sky=0.1")).toEqual({ kind: "phase", phase: 0.1 });
    expect(parseSkyParam("?sky=cycle")).toEqual({ kind: "cycle" });
    expect(parseSkyParam("?sky=noon")).toBeNull();
    expect(parseSkyParam("?sky=2")).toBeNull();
    expect(parseSkyParam("")).toBeNull();
  });
  it("resolves the mode: param, automation, preference, reduced motion", () => {
    const base = { param: null, pref: null, reducedMotion: false, automated: false } as const;
    expect(resolveSkyMode(base)).toEqual({ source: "clock", phase: null });
    expect(resolveSkyMode({ ...base, reducedMotion: true })).toEqual({ source: "held", phase: 0 });
    expect(resolveSkyMode({ ...base, reducedMotion: true, pref: "on" })).toEqual({ source: "clock", phase: null });
    expect(resolveSkyMode({ ...base, pref: "off" })).toEqual({ source: "held", phase: 0 });
    expect(resolveSkyMode({ ...base, automated: true })).toEqual({ source: "held", phase: 0 });
    expect(resolveSkyMode({ ...base, automated: true, param: { kind: "cycle" } })).toEqual({ source: "clock", phase: null });
    expect(resolveSkyMode({ ...base, pref: "off", param: { kind: "phase", phase: 0.5 } })).toEqual({ source: "param", phase: 0.5 });
  });
  it("night reproduces today's scene settings exactly", () => {
    const s = skyState(SKY_PHASES.night);
    const today = sceneSettings("full");
    expect(s.day).toBe(0);
    expect(s.warm).toBe(0);
    expect(s.stars).toBe(1);
    expect(s.fog.getHex()).toBe(new Color(today.fog.color).getHex());
    expect(s.zenith.getHex()).toBe(new Color(today.fog.color).getHex());
    expect(s.horizon.getHex()).toBe(new Color(today.fog.color).getHex());
    expect(s.hemisphere.sky.getHex()).toBe(new Color(today.hemisphere[0]).getHex());
    expect(s.hemisphere.intensity).toBe(today.hemisphere[2]);
    expect(s.directional.color.getHex()).toBe(new Color(today.directional.color).getHex());
    expect(s.directional.intensity).toBe(today.directional.intensity);
    expect(s.bloom).toBe(today.bloom!.intensity);
  });
  it("midday is a deep twilight: day 1, no stars, dimmer neon, warm sun glow", () => {
    const s = skyState(SKY_PHASES.day);
    expect(s.day).toBe(1);
    expect(s.stars).toBe(0);
    expect(s.bloom).toBeLessThan(0.9);
    expect(s.glow.r).toBeGreaterThan(s.glow.b);
    expect(s.horizon.getHex()).not.toBe(s.zenith.getHex());
  });
  it("dawn and dusk are warm and half lit", () => {
    for (const p of [SKY_PHASES.dawn, SKY_PHASES.dusk]) {
      const s = skyState(p);
      expect(s.day).toBeCloseTo(0.5);
      expect(s.warm).toBeCloseTo(1);
    }
  });
  it("sun and moon move on opposite sides of a low arc around the dome horizon", () => {
    const night = skyState(0);
    const day = skyState(0.5);
    expect(night.moon.elevation).toBeCloseTo(SKY.horizon + SKY.arc);
    expect(night.sun.elevation).toBeCloseTo(SKY.horizon - SKY.arc);
    expect(day.sun.elevation).toBeCloseTo(SKY.horizon + SKY.arc);
    expect(night.moon.dir.dot(night.sun.dir)).toBeLessThan(0);
    expect(night.moon.dir.length()).toBeCloseTo(1);
    // The night moon and the midday sun share one direction (in front of the L1 default camera).
    expect(night.moon.dir.distanceTo(day.sun.dir)).toBeLessThan(1e-6);
    expect(skyState(0.25).sun.elevation).toBeCloseTo(SKY.horizon);
  });
  it("is continuous across the cycle", () => {
    const a = skyState(0.999999);
    const b = skyState(0);
    expect(a.fog.getHex()).toBe(b.fog.getHex());
  });
});
```

- [x] **Step 2: Run** `bunx vitest run tests/unit/day-night.test.ts`. Expected: FAIL (module missing).

- [x] **Step 3: Implement** `src/experience/sky/dayNight.ts`:

```ts
import { Color, Vector3 } from "three";
import { dayNightOn, type DayNightPref } from "@/lib/day-night";
import { sceneSettings } from "../scene/settings";

/** One full day and night (owner decision, Round 8 K). */
export const CYCLE_MS = 8 * 60 * 1000;
export const SKY_PHASES = { night: 0, dawn: 0.25, day: 0.5, dusk: 0.75 } as const;
export type SkyPhaseName = keyof typeof SKY_PHASES;

/**
 * Sky geometry in radians. `horizon`: elevation of the dome's horizon (the follow cameras look about
 * 38 degrees down, so the void the visitor sees sits below the true horizon). `arc`: how far the sun
 * and moon rise above (and sink below) it. `azimuth`: puts the night moon and the midday sun in front
 * of the L1 default camera (it looks toward -x, -z).
 */
export const SKY = { horizon: -0.42, arc: 0.07, azimuth: Math.PI / 4 } as const;

export function clockPhase(nowMs: number): number {
  return (((nowMs % CYCLE_MS) + CYCLE_MS) % CYCLE_MS) / CYCLE_MS;
}

export type SkyParam = { kind: "phase"; phase: number } | { kind: "cycle" } | null;

/** `?sky=night|dawn|day|dusk|<0..1>` pins a phase, `?sky=cycle` runs the clock (tests, captures). */
export function parseSkyParam(search: string): SkyParam {
  const raw = new URLSearchParams(search).get("sky");
  if (!raw) return null;
  if (raw === "cycle") return { kind: "cycle" };
  if (Object.hasOwn(SKY_PHASES, raw)) return { kind: "phase", phase: SKY_PHASES[raw as SkyPhaseName] };
  if (!/^\d*\.?\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 0 && n <= 1 ? { kind: "phase", phase: n % 1 } : null;
}

export interface SkyMode {
  source: "param" | "clock" | "held";
  /** null: follow the clock. */
  phase: number | null;
}

const HELD: SkyMode = { source: "held", phase: SKY_PHASES.night };

export function resolveSkyMode(i: { param: SkyParam; pref: DayNightPref; reducedMotion: boolean; automated: boolean }): SkyMode {
  if (i.param?.kind === "phase") return { source: "param", phase: i.param.phase };
  if (i.param?.kind === "cycle") return { source: "clock", phase: null };
  if (i.automated) return HELD;
  return dayNightOn(i.pref, i.reducedMotion) ? { source: "clock", phase: null } : HELD;
}

export interface Orb {
  dir: Vector3;
  elevation: number;
}

export interface SkyState {
  phase: number;
  /** 0 through the night, 1 around midday. */
  day: number;
  /** Dawn and dusk warmth: 0 at night and midday, 1 at sunrise and sunset. */
  warm: number;
  stars: number;
  zenith: Color;
  horizon: Color;
  fog: Color;
  /** Sun glow color, premultiplied by its strength (black at night). */
  glow: Color;
  hemisphere: { sky: Color; ground: Color; intensity: number };
  directional: { color: Color; intensity: number };
  bloom: number;
  sun: Orb;
  moon: Orb;
}

const NIGHT = sceneSettings("full");
const C = {
  night: new Color(NIGHT.fog.color),
  dayZenith: new Color("#1a1547"),
  dayHorizon: new Color("#0e4a5a"),
  warmHorizon: new Color("#4a2350"),
  glow: new Color("#ff9a5c"),
  warmGlow: new Color("#ff7a45"),
  hemiNight: new Color(NIGHT.hemisphere[0]),
  hemiDay: new Color("#7cc8ff"),
  dirNight: new Color(NIGHT.directional.color),
  dirDay: new Color("#ffd9b8"),
};
const BLOOM_NIGHT = NIGHT.bloom!.intensity;
const BLOOM_DAY = 0.72;

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Unit direction of the sun (`offset` 0) or the moon (`offset` 0.5) at `phase`. */
export function orbDirection(phase: number, offset: number, out = new Vector3()): Orb {
  const theta = 2 * Math.PI * (phase + offset);
  const elevation = SKY.horizon - SKY.arc * Math.cos(theta);
  const az = theta + SKY.azimuth;
  out.set(Math.sin(az) * Math.cos(elevation), Math.sin(elevation), Math.cos(az) * Math.cos(elevation));
  return { dir: out, elevation };
}

export function createSkyState(): SkyState {
  return {
    phase: 0, day: 0, warm: 0, stars: 1,
    zenith: new Color(), horizon: new Color(), fog: new Color(), glow: new Color(),
    hemisphere: { sky: new Color(), ground: new Color(), intensity: 0 },
    directional: { color: new Color(), intensity: 0 },
    bloom: BLOOM_NIGHT,
    sun: { dir: new Vector3(), elevation: 0 },
    moon: { dir: new Vector3(), elevation: 0 },
  };
}

/** The sky at `phase` (writes into `out` so the frame loop allocates nothing). Phase 0 equals today's night. */
export function skyState(phase: number, out: SkyState = createSkyState()): SkyState {
  const h = -Math.cos(2 * Math.PI * phase);
  const day = smoothstep(-0.7, 0.7, h);
  const warm = 4 * day * (1 - day);
  out.phase = phase;
  out.day = day;
  out.warm = warm;
  out.stars = 1 - smoothstep(0, 0.5, day);
  out.zenith.copy(C.night).lerp(C.dayZenith, day);
  out.horizon.copy(C.night).lerp(C.dayHorizon, day).lerp(C.warmHorizon, warm * 0.55);
  out.fog.copy(out.horizon).lerp(out.zenith, 0.25);
  out.glow.copy(C.glow).lerp(C.warmGlow, warm).multiplyScalar(day);
  out.hemisphere.sky.copy(C.hemiNight).lerp(C.hemiDay, day);
  out.hemisphere.ground.copy(out.fog);
  out.hemisphere.intensity = NIGHT.hemisphere[2] + 0.1 * day;
  out.directional.color.copy(C.dirNight).lerp(C.dirDay, day);
  out.directional.intensity = NIGHT.directional.intensity + 0.1 * day;
  out.bloom = BLOOM_NIGHT + (BLOOM_DAY - BLOOM_NIGHT) * day;
  out.sun.elevation = orbDirection(phase, 0, out.sun.dir).elevation;
  out.moon.elevation = orbDirection(phase, 0.5, out.moon.dir).elevation;
  return out;
}
```

(At night the `lerp(_, 0)` calls leave the night color unchanged, so `getHex()` matches exactly. The palette values are the starting point; tune them with the Task 4 captures and keep the tests green.)

- [x] **Step 4: Run** `bunx vitest run tests/unit/day-night.test.ts`. Expected: PASS.
- [x] **Step 5: Commit** `feat(sky): pure day and night model (8 minute clock cycle)`.

### Task 2: Visitor preference store

**Files:**
- Create: `src/lib/day-night.ts`
- Test: `tests/unit/day-night-pref.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `DayNightPref`, `dayNightOn(pref, reducedMotion)`, `DAY_NIGHT_KEY = "hq:day-night"`, `readDayNight(): DayNightPref`, `setDayNight(on: boolean): void`, `subscribeDayNight(listener): () => void`, `dayNightOn`. Sub-project I's registry entry uses them: `get: () => dayNightOn(readDayNight(), getHQStore().getState().reducedMotion)`, `set: setDayNight`, `subscribe: subscribeDayNight` (plus a store subscription for `reducedMotion`).

- [x] **Step 1: Write the failing test** (happy-dom or a stubbed `localStorage`, as other `src/lib` tests do): unset reads null; `setDayNight(false)` stores `"off"`, notifies subscribers once, `readDayNight()` returns `"off"`; an invalid stored value reads as null; a `storage` event for the key notifies; unsubscribe stops notifications; storage that throws reads null and `setDayNight` does not throw.
- [x] **Step 2: Run** `bunx vitest run tests/unit/day-night-pref.test.ts`. Expected: FAIL.
- [x] **Step 3: Implement**

```ts
/** The visitor's Day and night choice (settings panel). Unset follows the Motion setting. */
export const DAY_NIGHT_KEY = "hq:day-night";
export type DayNightPref = "on" | "off" | null;

/** The stored choice wins; without one the cycle runs unless reduced motion is on. */
export function dayNightOn(pref: DayNightPref, reducedMotion: boolean): boolean {
  return pref === null ? !reducedMotion : pref === "on";
}
const listeners = new Set<() => void>();

export function readDayNight(): DayNightPref {
  try {
    const v = localStorage.getItem(DAY_NIGHT_KEY);
    return v === "on" || v === "off" ? v : null;
  } catch {
    return null;
  }
}

export function setDayNight(on: boolean): void {
  try {
    localStorage.setItem(DAY_NIGHT_KEY, on ? "on" : "off");
  } catch {
    // Private mode: the choice lasts until reload through the listeners below.
  }
  for (const l of listeners) l();
}

export function subscribeDayNight(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === DAY_NIGHT_KEY) listener();
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}
```

This module imports nothing (no three, no store), so the HUD registry entry keeps three out of the main bundle; `dayNight.ts` imports `dayNightOn` and `DayNightPref` from here.

- [x] **Step 4: Run** the test. Expected: PASS.
- [x] **Step 5: Commit** `feat(sky): day and night preference store`.

### Task 3: Holo shader modes `sky` and `orb`

**Files:**
- Modify: `src/experience/fx/holoFx.ts`
- Test: `tests/unit/holo-sky.test.ts`

**Interfaces:**
- Produces: `HOLO_MODE.sky = 12`, `HOLO_MODE.orb = 13`; uniforms `uSun` (vec3, sun direction) and `uGlow` (vec3, premultiplied glow color) on every holo material.
- Sky mode reads: `uColor * vTint` zenith, `uFill` horizon, `uGlow`, `uSun`, `uParams.x` = sin of the dome horizon, `uParams.y` = star amount, `uTime` (twinkle). Alpha 1.
- Orb mode reads: instance color (`vTint`), `vAlpha` (`aAlpha` per instance), `uParams.x` disc radius (quad units), `uParams.y` halo falloff, `uParams.z` moon shadow offset (instance 1 only).

- [x] **Step 1: Failing test:** `HOLO_MODE.sky === 12`, `HOLO_MODE.orb === 13`; `HOLO_FS` contains `uMode == 12` and `uMode == 13` and declares `uniform vec3 uSun` and `uniform vec3 uGlow`; `createHoloMaterial({ mode: HOLO_MODE.sky })` has `uSun` and `uGlow` uniforms; two materials of different modes share identical `vertexShader` and `fragmentShader` strings (one program).
- [x] **Step 2: Run** `bunx vitest run tests/unit/holo-sky.test.ts`. Expected: FAIL.
- [x] **Step 3: Implement.** Add to `HOLO_MODE` (with doc comments) `sky: 12` and `orb: 13`; add `uniform vec3 uSun; uniform vec3 uGlow;` to the `HOLO_FS` uniform line; insert before the final `else` (dot mode) branch:

```glsl
  } else if (uMode == 12) {
    vec3 d = normalize(vW - vC);
    float h = d.y - uParams.x;
    col = mix(uFill, c, smoothstep(0., h > 0. ? .55 : .7, abs(h)));
    float s = max(dot(d, uSun), 0.);
    float hug = exp(-h * h * 60.);
    col += uGlow * (pow(s, 4.) * (.18 + .5 * hug) + pow(s, 48.) * .5);
    vec2 sp = vec2(atan(d.z, d.x), asin(clamp(d.y, -1., 1.))) * 160.;
    vec2 cell = floor(sp);
    float r = hash(cell.x * 91.7 + cell.y * 13.3);
    vec2 at = vec2(hash(cell.x + cell.y * 7.1), hash(cell.y + cell.x * 3.9));
    float star = step(.985, r) * (1. - smoothstep(.06, .16, length(fract(sp) - at)));
    float tw = .65 + .35 * sin(uTime * (1. + 2. * r) + r * 40.);
    col += vec3(.85, .9, 1.) * star * tw * uParams.y * smoothstep(-.05, .2, h + .3);
    a = 1.;
  } else if (uMode == 13) {
    vec2 p = vUv * 2. - 1.;
    float r = length(p);
    float disc = 1. - smoothstep(uParams.x - .02, uParams.x, r);
    if (vSeed > .5) disc *= mix(1., .18, 1. - smoothstep(uParams.x - .02, uParams.x, length(p - vec2(uParams.z, uParams.z * .3))));
    float halo = exp(-r * r * uParams.y) * (1. - smoothstep(.7, 1., r));
    col = c * (disc * 1.4 + halo * .45);
    a = (disc + halo * .5) * vAlpha;
```

Add `uSun: { value: new Vector3(0, 1, 0) }` and `uGlow: { value: new Color(0, 0, 0) }` to the `createHoloMaterial` uniforms (import `Vector3`).

- [x] **Step 4: Run** the test plus `tests/unit/floating-sign.test.ts tests/unit/hall-stage.test.ts`. Expected: PASS.
- [x] **Step 5: Commit** `feat(fx): holo sky and orb modes (no new program)`.

### Task 4: SkyController, prototype captures, owner check

**Files:**
- Create: `src/experience/sky/skyRuntime.ts`, `src/experience/sky/SkyController.tsx`
- Modify: `src/experience/scene/Scene.tsx` (lights move into `SkyController`), `src/experience/Experience.tsx` (`__hq.sky`), `src/experience/floors/roof/Sky.tsx`
- Create: `scripts/sky-shots.ts`

**Interfaces:**
- Consumes: Task 1 (`skyState`, `resolveSkyMode`, `parseSkyParam`, `clockPhase`, `SKY`), Task 2 (`readDayNight`, `subscribeDayNight`), Task 3 modes, `postHandle`, `sceneSettings`, `useDispose`, `useUniformTime`.
- Produces: `skyRuntime: { phase, day, stars, source, enabled }` (read by RF `Sky` and `window.__hq.sky`); `<SkyController tier />` rendering the hemisphere and directional lights, the dome and the orbs.

- [x] **Step 1: `skyRuntime.ts`**

```ts
import type { SkyMode } from "./dayNight";

/** Live sky state, written once per frame by SkyController (probes, the RF star dome). */
export const skyRuntime = { phase: 0, day: 0, stars: 1, source: "held" as SkyMode["source"] };
```

- [x] **Step 2: `SkyController.tsx`** (client): lights with refs and the night values from `sceneSettings`; a dome `InstancedMesh` (`SphereGeometry(400, 24, 12)`, one instance, instance color white, `createHoloMaterial({ mode: HOLO_MODE.sky, additive: false })`, `renderOrder={-100}`, `frustumCulled={false}`, `raycast` none); an orb `InstancedMesh` (`PlaneGeometry(1, 1)`, two instances, instance colors sun `#ffb070` x 2.2 and moon `#dfe6ff` x 1.4 through `neonColor(_, _, tier)`, an `aAlpha` `InstancedBufferAttribute`, `createHoloMaterial({ mode: HOLO_MODE.orb, params: [0.32, 5, 0.22, 0] })`, `frustumCulled={false}`); `useDispose` on both geometries, material disposal on unmount; `useUniformTime([dome, orbs])`. The mode resolves once on mount and on preference or reduced-motion changes (`resolveSkyMode({ param: parseSkyParam(location.search), pref: readDayNight(), reducedMotion, automated: navigator.webdriver === true })`). Each frame: phase = mode.phase ?? `clockPhase(Date.now())`; when it moved by more than 1e-5 (or on first frame), `skyState(phase, state)` and copy into `scene.background`, `scene.fog.color`, the two lights, the dome uniforms (`uColor` zenith, `uFill` horizon, `uGlow`, `uSun`, `uParams.x = sin(SKY.horizon)`, `uParams.y = stars`), the orb instance matrices (position `dir * 380`, quad facing the center, scale `SUN_SIZE` / `MOON_SIZE`) and `aAlpha` (`smoothstep(SKY.horizon - 0.06, SKY.horizon + 0.03, elevation)`), and `postHandle.get()?.bloom()?.intensity`; always copy the camera position into the sky group. Write `skyRuntime`.
- [x] **Step 3: Scene.tsx:** replace the two light elements with `<SkyController tier={tier} />`. Experience.tsx: add `sky: skyRuntime` to `__hq`. RF `Sky.tsx`: in its existing `useFrame`, set the star material opacity to `0.85 * skyRuntime.stars` (material ref; no recompile).
- [x] **Step 4:** `bunx tsc --noEmit`, `bunx vitest run tests/unit/day-night.test.ts tests/unit/holo-sky.test.ts tests/unit/three-disposal.test.ts`.
- [x] **Step 5: Prototype captures:** dev server, `bun scripts/sky-shots.ts --base http://localhost:<port> --out <session files>/shots/proto` (L1 and L3, four phases, desktop and phone). Tune `SKY` and the palette until night matches today (plus moon and stars), the day sky reads indigo to teal with a warm glow, and the default L1 views show the moon at night and the sun at midday. Check `metrics.json`: programs equal the baseline captures, scene calls +2.
- [x] **Step 6:** Send the L1 capture set (night, dawn, day, dusk; desktop and phone) to the coordinator for owner approval. Continue with Tasks 5 and 6 meanwhile; apply feedback before the PR.
- [x] **Step 7: Commit** `feat(sky): sky dome, sun and moon, lights and bloom follow the phase`.

### Task 5: E2E and the e2e plan

**Files:**
- Create: `e2e/daynight.spec.ts`
- Modify: `scripts/e2e-plan.ts` (rule: `src/experience/sky/**`, `src/lib/day-night.ts` to `daynight` and `experience`), `tests/unit/e2e-plan.test.ts` if it lists rules.

- [x] **Step 1: Specs** (lite tier, `asReturningVisitor`, `enterHQ` helpers from `e2e/hq.ts`):
  1. Default under automation holds night: `__hq.sky.source === "held"`, `phase === 0`, `day === 0`.
  2. `?sky=day`: `__hq.sky.day === 1`, `stars === 0`, the scene fog color differs from night (read through `__hq.sky` or a canvas pixel at the top-left void is brighter than at night).
  3. Same program count and same settled scene calls at `?sky=night` and `?sky=day` on L1 (`__hq.render.programs()`, `expectRenderBudget`).
  4. `?sky=cycle`: `__hq.sky.source === "clock"` and `phase` within 0.01 of `(Date.now() % 480000) / 480000` read in the page.
  5. A stored `hq:day-night = "off"` with `?sky=cycle` absent and `navigator.webdriver` hidden (`asHumanBrowser`): held night; `"on"` under `prefers-reduced-motion: reduce` with Motion System: clock.
- [x] **Step 2: Run** `bun run build` then `E2E_PORT=<port> bunx playwright test e2e/daynight.spec.ts`. Expected: PASS.
- [x] **Step 3: Commit** `test(sky): day and night e2e`.

### Task 6: Docs, perf lane and PR

**Files:** `docs/agents/3d-experience.md` (new "Day and night" section: model, mode resolution, `?sky=`, dome and orbs on the holo program, draw order, probes `__hq.sky`, `hq:day-night`), `docs/agents/folder-layout.md` (`src/experience/sky/`), `docs/features.md` (feature and status log entry), `docs/decisions.md` (dated owner decision row), `docs/superpowers/README.md` (this plan, count), `README.md` (one highlight bullet if the overview lists the look).

- [x] **Step 1:** Write the docs.
- [ ] **Step 2:** `bun run verify:quick`, `bun run e2e:changed`, `E2E_PORT=<port> bun run e2e:perf` (floors, peaks, bytes, memory-full). Program counts must equal the baseline; scene calls +2; bytes within budget.
- [ ] **Step 3:** Final captures at four phases on L1 and L3, desktop and phone (`scripts/sky-shots.ts`).
- [ ] **Step 4:** Check the CI queue (`gh run list -R ShinyQ/ShinyQ-HQ -s in_progress` and `-s queued`), rebase on `origin/main` (add the `day-night` registry entry and its EN and ID copy if I's registry has landed), push, open the PR (do not merge).

import { Color, Vector3 } from "three";
import { dayNightOn, type DayNightPref } from "@/lib/day-night";
import { sceneSettings } from "../scene/settings";
import type { ViewportClass } from "../types";

/** One full day and night: 4 minutes, so a typical visit sees dawn, day, dusk and night (owner decision 2026-10-18; Round 8 K had 8). */
export const CYCLE_MS = 4 * 60 * 1000;
export const SKY_PHASES = { night: 0, dawn: 0.25, day: 0.5, dusk: 0.75 } as const;
export type SkyPhaseName = keyof typeof SKY_PHASES;

/**
 * Sky geometry in radians. `horizon`: elevation of the dome's horizon. The follow cameras look 44 to 47
 * degrees down (the frame top sits about 18 to 24 degrees below level), so the void around the
 * floating tower that a visitor sees lies well below the true horizon; the dome's horizon sits inside
 * it. The sun and the moon ride one tall, narrow ellipse on the sky sphere, opposite each other (owner
 * decision 2026-10-18: up to down, not right to left). It is centered on the horizon at `azimuth` (per
 * camera class) and faces a camera looking along that azimuth: `rise` is how far the orbs climb above
 * (and sink below) the horizon, `width` how far they swing sideways where they cross it (rising on the
 * left, setting on the right). Desktop: azimuth -0.2, the open sky on the left of the L1 view between the
 * profile card and the Visitor Observatory (the camera looks along about -0.38 rad there); tablet and
 * phone: the open sky at the top left of the L1 portrait view (the camera looks along about -1.0 rad).
 */
export const SKY = { horizon: -0.6, rise: 0.16, width: 0.06, azimuth: { desktop: -0.2, tablet: -0.85, mobile: -0.85 } } as const;

/** The sun and moon arc's azimuth for a camera class (`device.camera`). */
export function skyAzimuth(cls: ViewportClass): number {
  return SKY.azimuth[cls];
}

/** Rover heights below this are under the Lobby slab (B1): no dome, no sun or moon, and the night state holds. */
export const UNDERGROUND_BELOW = -0.5;

export function underground(roverY: number): boolean {
  return roverY < UNDERGROUND_BELOW;
}

export function clockPhase(nowMs: number): number {
  return (((nowMs % CYCLE_MS) + CYCLE_MS) % CYCLE_MS) / CYCLE_MS;
}

export type SkyParam = { kind: "phase"; phase: number } | { kind: "cycle" } | null;

/** `?sky=night|dawn|day|dusk|<0..1>` pins a phase, `?sky=cycle` runs the clock (tests, captures). */
export function parseSkyParam(search: string): SkyParam {
  return parseSkyValue(new URLSearchParams(search).get("sky"));
}

export function parseSkyValue(raw: string | null): SkyParam {
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
  /** True only for the automation hold: the night renders without stars, moon or sun so visual baselines keep today's exact look (the sky group is not drawn at all). */
  still: boolean;
}

const HELD: SkyMode = { source: "held", phase: SKY_PHASES.night, still: false };
const STILL: SkyMode = { ...HELD, still: true };

export function resolveSkyMode(i: { param: SkyParam; pref: DayNightPref; reducedMotion: boolean; automated: boolean }): SkyMode {
  if (i.param?.kind === "phase") return { source: "param", phase: i.param.phase, still: false };
  if (i.param?.kind === "cycle") return { source: "clock", phase: null, still: false };
  if (i.automated) return STILL;
  return dayNightOn(i.pref, i.reducedMotion) ? { source: "clock", phase: null, still: false } : HELD;
}

export interface Orb {
  dir: Vector3;
  elevation: number;
  /** Visibility 0 to 1: the horizon fade, and for the moon the handoff to the sun (see `orbAlphas`). */
  alpha: number;
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
  dayHorizon: new Color("#0a5868"),
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

/**
 * Unit direction of the sun (`offset` 0) or the moon (`offset` 0.5) at `phase`, on the ellipse centered
 * at C (elevation `SKY.horizon`, `azimuth`), with the local up U (the meridian) and the camera right R.
 * The orb sits `a` radians from C along the tangent (x R + y U) / a, so the top is exactly `rise` above
 * the horizon. Night (theta 0): the sun at the bottom; dawn: left; midday: top; dusk: right.
 */
function writeOrb(phase: number, offset: number, azimuth: number, out: Vector3): number {
  const theta = 2 * Math.PI * (phase + offset);
  const x = -SKY.width * Math.sin(theta);
  const y = -SKY.rise * Math.cos(theta);
  const a = Math.hypot(x, y);
  const k = a > 0 ? Math.sin(a) / a : 1;
  const c = Math.cos(a);
  const sh = Math.sin(SKY.horizon);
  const ch = Math.cos(SKY.horizon);
  const sa = Math.sin(azimuth);
  const ca = Math.cos(azimuth);
  // C = (sa ch, sh, ca ch), U = (-sa sh, ch, -ca sh), R = (-ca, 0, sa): orthonormal.
  out.set(c * sa * ch + k * (-x * ca - y * sa * sh), c * sh + k * y * ch, c * ca * ch + k * (x * sa - y * ca * sh));
  return Math.asin(Math.min(1, Math.max(-1, out.y)));
}

export function orbDirection(phase: number, offset: number, out = new Vector3(), azimuth: number = SKY.azimuth.desktop): Orb {
  const elevation = writeOrb(phase, offset, azimuth, out);
  return { dir: out, elevation, alpha: horizonFade(elevation) };
}

/** An orb starts to show `HANDOFF` below the horizon and is fully shown `HORIZON_FADE_UP` above it. */
const HANDOFF = 0.06;
const HORIZON_FADE_UP = 0.03;

/** An orb fades in from `HANDOFF` below the horizon to `HORIZON_FADE_UP` above it. */
function horizonFade(elevation: number): number {
  return smoothstep(SKY.horizon - HANDOFF, SKY.horizon + HORIZON_FADE_UP, elevation);
}

export function createSkyState(): SkyState {
  return {
    phase: 0,
    day: 0,
    warm: 0,
    stars: 1,
    zenith: new Color(),
    horizon: new Color(),
    fog: new Color(),
    glow: new Color(),
    hemisphere: { sky: new Color(), ground: new Color(), intensity: 0 },
    directional: { color: new Color(), intensity: 0 },
    bloom: BLOOM_NIGHT,
    sun: { dir: new Vector3(), elevation: 0, alpha: 0 },
    moon: { dir: new Vector3(), elevation: 0, alpha: 0 },
  };
}

/** The sky at `phase` (writes into `out` so the frame loop allocates nothing). Phase 0 equals today's night. `azimuth`: the sun and moon arc's azimuth (`skyAzimuth`). */
export function skyState(phase: number, out: SkyState = createSkyState(), azimuth: number = SKY.azimuth.desktop): SkyState {
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
  out.glow.copy(C.glow).lerp(C.warmGlow, warm).multiplyScalar(0.16 * day + 0.41 * warm);
  out.hemisphere.sky.copy(C.hemiNight).lerp(C.hemiDay, day);
  out.hemisphere.ground.copy(out.fog);
  out.hemisphere.intensity = NIGHT.hemisphere[2] + 0.1 * day;
  out.directional.color.copy(C.dirNight).lerp(C.dirDay, day);
  out.directional.intensity = NIGHT.directional.intensity + 0.1 * day;
  out.bloom = BLOOM_NIGHT + (BLOOM_DAY - BLOOM_NIGHT) * day;
  out.sun.elevation = writeOrb(phase, 0, azimuth, out.sun.dir);
  out.moon.elevation = writeOrb(phase, 0.5, azimuth, out.moon.dir);
  out.sun.alpha = horizonFade(out.sun.elevation);
  // One orb near the horizon at a time (owner review): the moon shows only while the sun is more than `HANDOFF` below
  // the horizon, so it fades out (still about `HANDOFF` up) before the sun starts to show and fades back in after the sun is gone.
  out.moon.alpha = horizonFade(out.moon.elevation) * (1 - smoothstep(SKY.horizon - 2 * HANDOFF, SKY.horizon - HANDOFF, out.sun.elevation));
  return out;
}

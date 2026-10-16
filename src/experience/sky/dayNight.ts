import { Color, Vector3 } from "three";
import { dayNightOn, type DayNightPref } from "@/lib/day-night";
import { sceneSettings } from "../scene/settings";

/** One full day and night (owner decision, Round 8 K). */
export const CYCLE_MS = 8 * 60 * 1000;
export const SKY_PHASES = { night: 0, dawn: 0.25, day: 0.5, dusk: 0.75 } as const;
export type SkyPhaseName = keyof typeof SKY_PHASES;

/**
 * Sky geometry in radians. `horizon`: elevation of the dome's horizon. The follow cameras look 44 to 47
 * degrees down (the frame top sits about 22 to 24 degrees below level), so the void around the
 * floating tower that a visitor sees lies well below the true horizon; the dome's horizon sits inside
 * it. `arc`: how far the sun and moon rise above (and sink below) it. `azimuth`: puts the night moon
 * and the midday sun at azimuth 0 (+z), in the open void on the left of the L1 desktop view (the camera
 * looks along about -0.34 rad there).
 */
export const SKY = { horizon: -0.6, arc: 0.09, azimuth: Math.PI } as const;

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

/** Unit direction of the sun (`offset` 0) or the moon (`offset` 0.5) at `phase`. */
function writeOrb(phase: number, offset: number, out: Vector3): number {
  const theta = 2 * Math.PI * (phase + offset);
  const elevation = SKY.horizon - SKY.arc * Math.cos(theta);
  const az = theta + SKY.azimuth;
  out.set(Math.sin(az) * Math.cos(elevation), Math.sin(elevation), Math.cos(az) * Math.cos(elevation));
  return elevation;
}

export function orbDirection(phase: number, offset: number, out = new Vector3()): Orb {
  return { dir: out, elevation: writeOrb(phase, offset, out) };
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
  out.glow.copy(C.glow).lerp(C.warmGlow, warm).multiplyScalar(0.16 * day + 0.41 * warm);
  out.hemisphere.sky.copy(C.hemiNight).lerp(C.hemiDay, day);
  out.hemisphere.ground.copy(out.fog);
  out.hemisphere.intensity = NIGHT.hemisphere[2] + 0.1 * day;
  out.directional.color.copy(C.dirNight).lerp(C.dirDay, day);
  out.directional.intensity = NIGHT.directional.intensity + 0.1 * day;
  out.bloom = BLOOM_NIGHT + (BLOOM_DAY - BLOOM_NIGHT) * day;
  out.sun.elevation = writeOrb(phase, 0, out.sun.dir);
  out.moon.elevation = writeOrb(phase, 0.5, out.moon.dir);
  return out;
}

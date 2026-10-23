import { ENGINE, type EngineBay, type EngineBayId } from "./layout";

/**
 * B1 WOW pass (spec 2026-10-23): pure look of the station holograms and the reactor's Stack Halo (no React or three).
 * Each bay gets a projector (a flat disc and a light cone) and a data-driven hologram floating inside the bay, under its
 * sign; the build stack's logos orbit above the reactor crown. Pieces go out through `Emit` (no allocation per write):
 * instanced boxes on the holo `strip` mode, dots (`dot`, camera-facing unless rotated flat), rings (`ring`) and cones
 * (`core`). Positions are floor-local, a box's `y` its center. `t` is the bay's own motion time (it runs while the bay is
 * awake), so an idle bay holds still and only shimmers in the shader.
 */
export const HOLO_KIND = { box: 0, dot: 1, ring: 2, cone: 3 } as const;

/** Tone 0 is the halo's (cyan toward white in a deploy flash, set per write); the rest are fixed. */
export const HOLO_TONES = ["#22d3ee", "#22d3ee", "#a78bfa", "#34d399", "#f59e0b", "#f87171", "#64748b", "#e0f2fe"] as const;
const [HALO, CYAN, VIOLET, GREEN, AMBER, RED, SLATE, WHITE] = [0, 1, 2, 3, 4, 5, 6, 7];

/** One piece: kind, tone index, gain, center, scale, rotation (Euler YXZ). A dot not tipped flat (`rx`) faces the camera. */
export type Emit = (k: number, tone: number, gain: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, rx?: number, ry?: number, rz?: number) => void;
/** A logo quad of the B1 atlas: cell, center, size (camera-facing, upright). */
export type EmitLogo = (cell: number, x: number, y: number, z: number, size: number) => void;

export const HOLO = {
  /** Hologram base over its projector's top (u) and half extents across and into the bay: it stays well under the station sign (5.3) seen from the door pad. */
  lift: 0.55,
  half: { w: 2.7, d: 0.9 },
  /** The Stack Halo over the reactor crown (6.6): height, radius, tile size and bob. */
  halo: { y: 7.4, r: 4.4, tile: 1.05, bob: 0.15 },
  /** A bay wakes when the rover is within `range` of its door pad; `rate` per second toward 1 (or 0); idle brightness. */
  wake: { range: 9, rate: 2, idle: 0.4 },
  /** Instance writes per second at most. */
  writeHz: 30,
  /** Motion time every bay and the halo hold under reduced motion: a still, readable pose. */
  still: 2.5,
} as const;

export interface HoloData {
  levels: number[];
  mark?: number;
}

const TAU = Math.PI * 2;
const FLAT = -Math.PI / 2;
const { box: BOX, dot: DOT, ring: RING, cone: CONE } = HOLO_KIND;
const frac = (x: number) => x - Math.floor(x);
/** Item `i` of `n` spread evenly across the hologram's width. */
const x0 = (i: number, n: number) => (HOLO.half.w - 0.1) * ((2 * (i + 0.5)) / n - 1);

/**
 * Where a bay's hologram stands: center x, z (`inset` from the bay's center toward its open front, clear of the
 * back-wall props), base y, the front direction along z and the projector's top: the Blueprint's table, the Dashboard's
 * console, else the bay floor.
 */
export function holoFrame(bay: EngineBay): { x: number; y: number; z: number; o: 1 | -1; floor: number } {
  const o = bay.side === "north" ? 1 : -1;
  const [floor, inset] = bay.id === "blueprint" ? [1.15, 1.1] : bay.id === "dashboard" ? [0.92, 0.8] : [0.14, 1.2];
  // The Blueprint's tower starts low over its table so its top stays under the sign.
  return { x: bay.center.x, y: floor + (bay.id === "blueprint" ? 0.25 : HOLO.lift), z: bay.center.z + o * inset, o, floor };
}

type Shape = (d: HoloData, t: number, at: (u: number, v: number, w: number) => void, put: Put, logo: (j: number, size: number) => void) => void;
/** Emits at the last `at` point. */
type Put = (k: number, tone: number, gain: number, sx: number, sy: number, sz: number, rx?: number, ry?: number, rz?: number) => void;

const SHAPES: Record<EngineBayId, Shape> = {
  // The tower itself, turning: one slab per public floor over an amber B1, a scan ring sweeping it.
  blueprint: ({ levels }, t, at, put) => {
    const spin = t * 0.5;
    at(0, 0.05, 0);
    put(BOX, AMBER, 1, 1.8, 0.08, 1.1, 0, spin);
    levels.forEach((_, i) => {
      at(0, 0.35 + i * 0.24, 0);
      put(BOX, i === levels.length - 1 ? VIOLET : CYAN, 0.55, 1.8 - i * 0.12, 0.08, 1.1 - i * 0.06, 0, spin);
    });
    at(0, 0.7 + 0.55 * Math.sin(t * 1.3), 0);
    put(RING, CYAN, 1, 1.5, 1.5, 1, FLAT);
  },
  // Rounds as bars on an axis, each sized by its pull requests, a wave running through them; the open round amber with "now" over it.
  timeline: ({ levels, mark }, t, at, put) => {
    at(0, 0, 0);
    put(BOX, CYAN, 1, 2 * HOLO.half.w, 0.03, 0.03);
    levels.forEach((level, i) => {
      const h = 0.2 + 2.2 * level * (0.8 + 0.2 * Math.sin(t * 2 - i * 0.5));
      at(x0(i, levels.length), h / 2, 0);
      put(BOX, i === mark ? AMBER : VIOLET, i === mark ? 1.5 : 1, 0.22, h, 0.22);
      if (i === mark) {
        at(x0(i, levels.length), h + 0.3, 0);
        const s = 0.34 + 0.06 * Math.sin(t * 4);
        put(DOT, AMBER, 1.6, s, s, 1);
      }
    });
  },
  // A coordinator core beaming to the coding agents' tiles (their logos), packets running along the beams.
  agents: ({ levels }, t, at, put, logo) => {
    const core = 0.6;
    at(0, core, 0);
    put(DOT, VIOLET, 1.6, 1, 1, 1);
    put(RING, VIOLET, 1, 0.6, 0.6, 1, t * 0.8, t * 0.5);
    levels.forEach((_, j) => {
      const u = (j - (levels.length - 1) / 2) * 2.1;
      const v = 1.65 + 0.08 * Math.sin(t * 1.5 + j);
      at(u / 2, (core + v) / 2, 0);
      put(BOX, CYAN, 1, Math.hypot(u, v - core), 0.035, 0.035, 0, 0, Math.atan2(v - core, u));
      at(u, v, 0);
      put(DOT, CYAN, 0.8, 1.3, 1.3, 1);
      logo(j, 1);
      const f = frac(t * 0.7 + j / 3);
      at(u * f, core + (v - core) * f, 0);
      put(DOT, WHITE, 1.6, 0.16, 0.16, 1);
    });
  },
  // One arch per gate in depth (CI green, nightly violet, local slate), lighting front to back as a build packet passes.
  gates: ({ levels }, t, at, put) => {
    const n = levels.length;
    const p = frac(t * 0.2) * (n + 2);
    levels.forEach((level, i) => {
      const k = n > 1 ? i / (n - 1) : 0;
      const w = 2 * HOLO.half.w - k * 3.2;
      const h = 1.9 - k * 1;
      const d = HOLO.half.d - k * 2 * HOLO.half.d;
      const tone = level >= 0.9 ? GREEN : level >= 0.6 ? VIOLET : SLATE;
      const g = i < p ? 1.5 : 0.45;
      for (const s of [-1, 1]) {
        at((s * w) / 2, h / 2, d);
        put(BOX, tone, g, 0.05, h, 0.05);
      }
      at(0, h, d);
      put(BOX, tone, g, w, 0.05, 0.05);
    });
    at(0, 0.5, HOLO.half.d - 2 * HOLO.half.d * Math.min(1, p / Math.max(1, n - 1)));
    put(DOT, WHITE, 1.8, 0.3, 0.3, 1);
  },
  // The snapshot numbers as a turning bar skyline on a base ring, a gauge ring over it.
  dashboard: ({ levels }, t, at, put) => {
    const spin = t * 0.3;
    const cols = Math.ceil(levels.length / 2);
    levels.forEach((level, i) => {
      const u0 = ((i % cols) - (cols - 1) / 2) * 0.7;
      const w0 = (Math.floor(i / cols) - 0.5) * 0.7;
      const h = 0.15 + 1.4 * level * (0.85 + 0.15 * Math.sin(t * 2.4 + i));
      at(u0 * Math.cos(spin) - w0 * Math.sin(spin), h / 2, u0 * Math.sin(spin) + w0 * Math.cos(spin));
      put(BOX, [CYAN, GREEN, VIOLET][i % 3], 1.1, 0.36, h, 0.36, 0, -spin);
    });
    at(0, 0.02, 0);
    put(RING, CYAN, 0.9, 2.1, 2.1, 1, FLAT);
    at(0, 1.85, 0);
    put(RING, AMBER, 1.3, 0.42, 0.42, 1, 0, 0, -t);
  },
  // A neural gyroscope: three turning rings around a violet answer core, one node per step orbiting, chunks streaming in.
  brain: ({ levels }, t, at, put) => {
    const c = 1;
    at(0, c, 0);
    put(DOT, VIOLET, 1.8, 0.9, 0.9, 1);
    for (let j = 0; j < 3; j++) put(RING, VIOLET, 1, 1.2, 1.2, 1, t * 0.6 + j * 1.05, j * 1.05 + t * 0.2);
    levels.forEach((_, i) => {
      const a = (i / levels.length) * TAU + t * 0.5;
      at(1.9 * Math.cos(a), c + 0.4 * Math.sin(a * 2), 0.8 * Math.sin(a));
      put(DOT, CYAN, 1.3, 0.22, 0.22, 1);
    });
    for (let j = 0; j < 5; j++) {
      const f = frac(t * 0.45 + j / 5);
      at(-2.6 * (1 - f), c + (1.8 - j * 0.35 - c) * (1 - f), 0.3 * (1 - f));
      const s = 0.2 * (1 - f * 0.6);
      put(DOT, CYAN, 1.3, s, s, 1);
    }
  },
  // The ideas set aside: crossed red panels tumbling up a slow vortex, the last one amber and kept.
  rejected: ({ levels }, t, at, put) => {
    const n = levels.length;
    at(0, 0.05, 0);
    put(RING, RED, 0.6, 2.3, 2.3, 1, FLAT);
    for (let i = 0; i < n; i++) {
      const k = i / n;
      const a = k * TAU * 1.5 + t * 0.4;
      const r = 0.6 + 1.7 * k;
      const yaw = -a;
      const roll = t * 0.9 + i * 1.3;
      const kept = i === n - 1;
      at(r * Math.cos(a), 0.2 + 1.6 * k, (r / 2.3) * HOLO.half.d * Math.sin(a));
      put(BOX, kept ? AMBER : RED, kept ? 1.5 : 0.9, 0.6, 0.4, 0.02, 0, yaw, roll);
      if (kept) continue;
      put(BOX, RED, 1.2, 0.46, 0.03, 0.03, 0, yaw, roll + 0.6);
      put(BOX, RED, 1.2, 0.46, 0.03, 0.03, 0, yaw, roll - 0.6);
    }
  },
};

/**
 * One bay: its projector (a flat disc on the table, console or floor, and a light cone up to the hologram) and its
 * station's hologram from `data` at motion time `t`. `logo(j, ...)` places agent tile `j` (Agents only).
 */
export function bayHolo(bay: EngineBay, data: HoloData, t: number, emit: Emit, logo: EmitLogo, agentCells: readonly number[]): void {
  const f = holoFrame(bay);
  emit(DOT, CYAN, 0.9, f.x, f.floor + 0.02, f.z, 2, 2, 1, FLAT);
  emit(CONE, CYAN, 0.25, f.x, (f.floor + f.y) / 2, f.z, 1.6, f.y - f.floor, 1.6);
  let x = 0;
  let y = 0;
  let z = 0;
  const at = (u: number, v: number, w: number) => {
    x = f.x + u;
    y = f.y + v;
    z = f.z + f.o * w;
  };
  const put: Put = (k, tone, gain, sx, sy, sz, rx, ry, rz) => emit(k, tone, gain, x, y, z, sx, sy, sz, rx, ry, rz);
  SHAPES[bay.id](data, t, at, put, (j, size) => {
    if (j < agentCells.length) logo(agentCells[j], x, y, z, size);
  });
}

/** The Stack Halo: one tile per logo cell orbiting the reactor's column at `spin` (a glow dot behind each logo) over an orbit ring. */
export function stackHalo(cells: number, spin: number, t: number, emit: Emit, logo: EmitLogo): void {
  const { y, r, tile, bob } = HOLO.halo;
  const R = ENGINE.reactor;
  for (let i = 0; i < cells; i++) {
    const a = spin + (i / cells) * TAU;
    const x = R.x + Math.cos(a) * r;
    const z = R.z + Math.sin(a) * r;
    const h = y + bob * Math.sin(t * 0.9 + i * 0.7);
    emit(DOT, HALO, 1, x, h, z, tile * 1.5, tile * 1.5, 1);
    logo(i, x, h, z, tile);
  }
  emit(RING, HALO, 0.8, R.x, y - 0.75, R.z, r, r, 1, FLAT);
}

/** Orbit speed (rad/s) from the reactor's pulse (`pulseHz`, 0.25 idle to 1.2). */
export const haloSpeed = (pulseHz: number) => 0.08 + 0.12 * pulseHz;

/** The bay the rover wakes: the nearest door pad within `HOLO.wake.range`, or -1. */
export function wakeTarget(bays: readonly EngineBay[], x: number, z: number): number {
  let best = -1;
  let dist: number = HOLO.wake.range;
  bays.forEach((b, i) => {
    const d = Math.hypot(b.pad.x - x, b.pad.z - z);
    if (d <= dist) {
      dist = d;
      best = i;
    }
  });
  return best;
}

/** Eases a bay's wake level toward 1 when it is the target, else toward 0, at `HOLO.wake.rate` per second. */
export function stepWake(level: number, target: boolean, dt: number): number {
  const step = HOLO.wake.rate * dt;
  return target ? Math.min(1, level + step) : Math.max(0, level - step);
}

/** Brightness of a bay at wake `level`: idle glow to full. */
export const wakeGain = (level: number) => HOLO.wake.idle + (1 - HOLO.wake.idle) * level;

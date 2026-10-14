import type { Rect, Vec2 } from "../../types";

/**
 * L3 Ops Control Room (owner approved 2026-10-14): "How I run AI in production" as a small control
 * room in the AI wing's inner pocket beside the Tech Reactor. Pure numbers; the scene is `OpsRoom.tsx`.
 */
export const OPS = {
  /** Footprint along x (the wing road) and z (toward the data spine). */
  w: 6,
  d: 6,
  /** Top of the screen wall: a tall camera column (`FloorLayout.tall`). */
  h: 5.6,
  /** Clear floor to the last inner pod of the AI wing (the space rules' 6 u). */
  gap: 6,
} as const;

/** Where `buildLabsLayout` puts the room. `facing` is the door's direction into the room along z. */
export interface OpsPlacement {
  rect: Rect;
  center: Vec2;
  door: Vec2;
  facing: -1 | 1;
}

/** Locale-resolved texts for the room (`ExperienceData.labs.ops`, built on the server from `production`). */
export interface OpsData {
  /** Floating sign above the room (`hud.rooms.ops`). */
  sign: string;
  /** Screen titles (`production.screens`). */
  screens: Record<OpsPanel, string>;
  /** Proof tiles, each on its screen. */
  tiles: { panel: OpsPanel; value: string; label: string }[];
  /** Alert rule families on the Alerts screen. */
  alerts: string[];
  /** Live panel labels (`production.live`) and the explore buckets (`production.explore`). */
  live: { title: string; visits: string; fps: string; explore: string; nightly: string; buckets: Record<string, string> };
}

export type OpsPanel = "metrics" | "traces" | "alerts";

/** Screen tints: Grafana orange, Application Insights blue, alert amber; the live panel and rims in monitoring green. */
export const OPS_TONE: Record<OpsPanel | "live", string> = { metrics: "#f59e0b", traces: "#60a5fa", alerts: "#fbbf24", live: "#34d399" };
const GRID = "#334155";
const INK = "#e2e8f0";
const DIM = "#94a3b8";

/** A screen on the back wall: center across the room (`u`, viewer's right is +), height `y`, size. */
export interface OpsScreen {
  id: OpsPanel | "live";
  u: number;
  y: number;
  w: number;
  h: number;
}

export const OPS_SCREENS: readonly OpsScreen[] = [
  { id: "metrics", u: -1.95, y: 3.05, w: 1.8, h: 1.7 },
  { id: "traces", u: 0, y: 3.05, w: 1.8, h: 1.7 },
  { id: "alerts", u: 1.95, y: 3.05, w: 1.8, h: 1.7 },
  { id: "live", u: 0, y: 4.72, w: 5.7, h: 1.2 },
];

const WALL = 0.4;
const SCREEN_DEPTH = 0.08;

/** Room frame: the screen normal (+1 faces +z), the back wall plane and a mapper from room coordinates to world x/z. */
export function opsFrame(p: OpsPlacement) {
  const n = -p.facing as -1 | 1;
  const back = n > 0 ? p.rect.minZ : p.rect.maxZ;
  const face = back + n * (WALL + SCREEN_DEPTH);
  const front = n > 0 ? p.rect.maxZ : p.rect.minZ;
  /** World x of a point `u` across the room (viewer's right is +). */
  const x = (u: number) => p.center.x + n * u;
  return { n, back, face, front, x, yaw: n > 0 ? 0 : Math.PI };
}

/** Solid boxes (one merged mesh): plinth, back wall, the screen bodies, the console desk. Box `y` is its bottom. */
export function opsSolids(p: OpsPlacement): { x: number; y: number; z: number; w: number; h: number; d: number }[] {
  const f = opsFrame(p);
  const w = p.rect.maxX - p.rect.minX;
  const boxes = [
    { x: p.center.x, y: 0, z: p.center.z, w, h: 0.15, d: p.rect.maxZ - p.rect.minZ },
    { x: p.center.x, y: 0, z: f.back + (f.n * WALL) / 2, w, h: OPS.h, d: WALL },
    ...OPS_SCREENS.map((s) => ({ x: f.x(s.u), y: s.y - s.h / 2, z: f.back + f.n * (WALL + SCREEN_DEPTH / 2), w: s.w, h: s.h, d: SCREEN_DEPTH })),
    { x: p.center.x, y: 0, z: f.front - f.n * 0.9, w: w - 1.2, h: 1, d: 1 },
  ];
  return boxes;
}

type Seg = [number, number, number, number, number, number];

/** Deterministic sparkline: smooth, never random, so captures and the visual gate stay stable. */
export function sparkline(count: number, phase: number): number[] {
  return Array.from({ length: count }, (_, i) => 0.5 + 0.28 * Math.sin(i * 0.9 + phase) + 0.14 * Math.sin(i * 2.3 + phase * 1.7));
}

/**
 * Neon lines in one batch: screen rims, title rules, the Grafana-style sparklines and grid (Metrics), the
 * Application Insights-style span waterfall (Traces), rule markers (Alerts), the desk rim and the floor
 * outline. Lite keeps rims and markers only.
 */
export function opsLines(p: OpsPlacement, detail: "full" | "lite"): { seg: Seg; color: string }[] {
  const f = opsFrame(p);
  const z = f.face + f.n * 0.01;
  const out: { seg: Seg; color: string }[] = [];
  const line = (u0: number, y0: number, u1: number, y1: number, color: string) => out.push({ seg: [f.x(u0), y0, z, f.x(u1), y1, z], color });
  const rect = (u: number, y: number, w: number, h: number, color: string) => {
    line(u - w / 2, y - h / 2, u + w / 2, y - h / 2, color);
    line(u + w / 2, y - h / 2, u + w / 2, y + h / 2, color);
    line(u + w / 2, y + h / 2, u - w / 2, y + h / 2, color);
    line(u - w / 2, y + h / 2, u - w / 2, y - h / 2, color);
  };
  for (const s of OPS_SCREENS) {
    if (s.id === "live") continue;
    const tone = OPS_TONE[s.id];
    rect(s.u, s.y, s.w, s.h, tone);
    line(s.u - s.w / 2 + 0.08, s.y + s.h / 2 - 0.24, s.u + s.w / 2 - 0.08, s.y + s.h / 2 - 0.24, tone);
    const left = s.u - s.w / 2 + 0.12;
    const right = s.u + s.w / 2 - 0.12;
    const bottom = s.y - s.h / 2 + 0.12;
    if (s.id === "alerts") {
      for (let i = 0; i < 5; i++) rect(left + 0.04, s.y + 0.05 - i * 0.15, 0.06, 0.06, tone);
      continue;
    }
    if (detail === "lite") continue;
    const top = s.y - 0.18;
    if (s.id === "metrics") {
      for (let g = 0; g <= 3; g++) line(left, bottom + ((top - bottom) * g) / 3, right, bottom + ((top - bottom) * g) / 3, GRID);
      for (const [phase, color] of [[0.3, OPS_TONE.metrics], [2.1, OPS_TONE.live]] as const) {
        const ys = sparkline(14, phase);
        for (let i = 0; i < ys.length - 1; i++) {
          const u0 = left + ((right - left) * i) / (ys.length - 1);
          const u1 = left + ((right - left) * (i + 1)) / (ys.length - 1);
          line(u0, bottom + (top - bottom) * ys[i], u1, bottom + (top - bottom) * ys[i + 1], color);
        }
      }
    } else {
      // A request and its dependency spans, as in an end-to-end transaction view.
      const spans: [number, number][] = [[0, 1], [0.04, 0.36], [0.42, 0.3], [0.46, 0.14], [0.76, 0.22]];
      spans.forEach(([start, length], i) => {
        const y = top - 0.06 - i * ((top - bottom - 0.06) / spans.length);
        const u0 = left + (right - left) * start;
        line(u0, y, u0 + (right - left) * length, y, i === 0 ? OPS_TONE.traces : "#a78bfa");
        line(u0, y - 0.04, u0, y + 0.04, GRID);
      });
    }
  }
  // Desk rim and the room's floor outline in monitoring green.
  const deskZ = f.front - f.n * 0.4;
  const w = p.rect.maxX - p.rect.minX;
  out.push({ seg: [f.x(-(w - 1.2) / 2), 1.01, deskZ, f.x((w - 1.2) / 2), 1.01, deskZ], color: OPS_TONE.live });
  const { minX, maxX, minZ, maxZ } = p.rect;
  for (const seg of [
    [minX, 0.17, minZ, maxX, 0.17, minZ],
    [maxX, 0.17, minZ, maxX, 0.17, maxZ],
    [maxX, 0.17, maxZ, minX, 0.17, maxZ],
    [minX, 0.17, maxZ, minX, 0.17, minZ],
  ] as Seg[])
    out.push({ seg, color: OPS_TONE.live });
  return out;
}

export interface OpsLabel {
  text: string;
  position: [number, number, number];
  yaw: number;
  fontSize: number;
  color: string;
  bold?: boolean;
  anchorX: "left" | "center" | "right";
  maxWidth?: number;
}

/** Screen texts (one `BatchedLabels`): titles, the proof tile values and labels, the alert rule families. */
export function opsLabels(p: OpsPlacement, data: OpsData): OpsLabel[] {
  const f = opsFrame(p);
  const z = f.face + f.n * 0.02;
  const at = (u: number, y: number): [number, number, number] => [f.x(u), y, z];
  const out: OpsLabel[] = [];
  for (const s of OPS_SCREENS) {
    if (s.id === "live") continue;
    const left = s.u - s.w / 2 + 0.12;
    out.push({ text: data.screens[s.id].toUpperCase(), position: at(left, s.y + s.h / 2 - 0.13), yaw: f.yaw, fontSize: 0.12, color: OPS_TONE[s.id], bold: true, anchorX: "left" });
    const tiles = data.tiles.filter((t) => t.panel === s.id).slice(0, 2);
    tiles.forEach((tile, i) => {
      const u = tiles.length === 1 ? left : left + i * (s.w / 2 - 0.06);
      out.push({ text: tile.value, position: at(u, s.y + 0.44), yaw: f.yaw, fontSize: 0.3, color: INK, bold: true, anchorX: "left" });
      out.push({ text: tile.label, position: at(u, s.y + 0.17), yaw: f.yaw, fontSize: 0.085, color: DIM, anchorX: "left", maxWidth: tiles.length === 1 ? s.w - 0.24 : s.w / 2 - 0.16 });
    });
    if (s.id === "alerts") {
      data.alerts.slice(0, 5).forEach((rule, i) => {
        out.push({ text: rule, position: at(left + 0.14, s.y + 0.05 - i * 0.15), yaw: f.yaw, fontSize: 0.08, color: INK, anchorX: "left", maxWidth: s.w - 0.4 });
      });
    }
  }
  return out;
}

/** One cell of the live panel (this site's own telemetry). */
export interface OpsLiveRow {
  label: string;
  value: string;
}

/** Live panel texts: the title, then up to four cells in two columns (label left, value right). */
export function opsLiveLabels(p: OpsPlacement, title: string, rows: readonly OpsLiveRow[]): OpsLabel[] {
  const f = opsFrame(p);
  const s = OPS_SCREENS.find((x) => x.id === "live")!;
  const z = f.face + f.n * 0.02;
  const at = (u: number, y: number): [number, number, number] => [f.x(u), y, z];
  const left = s.u - s.w / 2 + 0.15;
  const out: OpsLabel[] = [{ text: title.toUpperCase(), position: at(left, s.y + s.h / 2 - 0.16), yaw: f.yaw, fontSize: 0.13, color: OPS_TONE.live, bold: true, anchorX: "left" }];
  rows.slice(0, 4).forEach((row, i) => {
    const col = i < 2 ? 0 : 1;
    const y = s.y + 0.05 - (i % 2) * 0.36;
    const u0 = left + col * (s.w / 2);
    const u1 = u0 + s.w / 2 - 0.3;
    out.push({ text: row.label, position: at(u0, y), yaw: f.yaw, fontSize: 0.1, color: DIM, anchorX: "left", maxWidth: s.w / 2 - 1.2 });
    if (row.value) out.push({ text: row.value, position: at(u1, y), yaw: f.yaw, fontSize: 0.17, color: INK, bold: true, anchorX: "right" });
  });
  return out;
}

/** Live panel rim and title rule. */
export function opsLiveLines(p: OpsPlacement): { seg: Seg; color: string }[] {
  const f = opsFrame(p);
  const s = OPS_SCREENS.find((x) => x.id === "live")!;
  const z = f.face + f.n * 0.01;
  const pts: [number, number][] = [
    [s.u - s.w / 2, s.y - s.h / 2],
    [s.u + s.w / 2, s.y - s.h / 2],
    [s.u + s.w / 2, s.y + s.h / 2],
    [s.u - s.w / 2, s.y + s.h / 2],
  ];
  const out = pts.map((a, i) => {
    const b = pts[(i + 1) % pts.length];
    return { seg: [f.x(a[0]), a[1], z, f.x(b[0]), b[1], z] as Seg, color: OPS_TONE.live };
  });
  out.push({ seg: [f.x(s.u - s.w / 2 + 0.1), s.y + s.h / 2 - 0.3, z, f.x(s.u + s.w / 2 - 0.1), s.y + s.h / 2 - 0.3, z], color: OPS_TONE.live });
  return out;
}

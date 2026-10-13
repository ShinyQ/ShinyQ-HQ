import { Color, Matrix4, Quaternion, Vector3 } from "three";
import type { Locale } from "@/content/locales";
import type { StatsFloor } from "@/lib/visits/contract";
import { countryPoint, landCells, latLonToVec3 } from "@/lib/visits/geo";
import { formatCount, type Freshness, type VisitsView } from "@/lib/visits/model";
import type { BatchedLabel } from "../../fx/labelProps";
import { FONTS } from "../../tower/primitives";
import type { GpuTier } from "../../types";
import type { RoofLayout } from "./layout";
import type { Box } from "./solids";

/**
 * RF Visitor Observatory (public visit stats, owner plan 2026-10-14), pure parts: where the hologram
 * globe and the floating stats panel stand on the station, their solids, the globe's dot instances and
 * the panel's text rows. Countries are dots only, never numbers. Vitest runs it in node.
 */
export const OBSERVATORY = {
  globeRadius: 2.2,
  /** Globe center above the deck. */
  globeY: 4.6,
  /** Axial tilt toward the viewer (radians), so the northern hemisphere reads from the plaza. */
  tilt: 0.3,
  /** Spin (rad/s); faster while RF:visits is open. Still under reduced motion. */
  spin: 0.12,
  spinActive: 0.4,
  /** Longitude turned toward the plaza at rest and under reduced motion: Indonesia, home. */
  restLon: 118,
  panel: { w: 4.6, h: 4.2, bottom: 1.2, yaw: -Math.PI / 10 },
  land: { full: { step: 1, size: 0.115 }, lite: { step: 2, size: 0.15 } },
  countrySize: 0.34,
  colors: { land: "#818cf8", country: "#22d3ee", rim: "#a78bfa", bar3d: "#22d3ee", barClassic: "#a78bfa" },
} as const;

type V3 = [number, number, number];

export interface ObservatoryParts {
  globe: { x: number; y: number; z: number; r: number };
  panel: { x: number; z: number; bottom: number; w: number; h: number; yaw: number };
  solids: Box[];
}

/** The globe stands at the back right of the station, the panel floats front left, both inside its footprint. */
export function observatoryParts(layout: RoofLayout): ObservatoryParts {
  const v = layout.visits;
  const r = OBSERVATORY.globeRadius;
  const globe = { x: v.maxX - r - 0.1, y: OBSERVATORY.globeY, z: v.minZ + r + 0.2, r };
  const { w, h, bottom, yaw } = OBSERVATORY.panel;
  const panel = { x: v.minX + 2.6, z: v.maxZ - 1.3, bottom, w, h, yaw };
  const cx = (v.minX + v.maxX) / 2;
  const cz = (v.minZ + v.maxZ) / 2;
  const solids: Box[] = [
    { x: cx, y: 0, z: cz, w: v.maxX - v.minX - 0.4, h: 0.25, d: v.maxZ - v.minZ - 0.4 },
    { x: globe.x, y: 0.25, z: globe.z, w: 1.1, h: 1.7, d: 1.1 },
    { x: globe.x, y: 1.95, z: globe.z, w: 2.2, h: 0.18, d: 2.2 },
    { x: panel.x, y: 0.25, z: panel.z, w: 0.16, h: bottom - 0.25, d: 0.16, yaw },
  ];
  return { globe, panel, solids };
}

export interface DotInstances {
  count: number;
  matrices: Float32Array;
  colors: Float32Array;
}

const Z = new Vector3(0, 0, 1);
function dots(points: readonly V3[], r: number, size: number, color: string): DotInstances {
  const matrices = new Float32Array(points.length * 16);
  const colors = new Float32Array(points.length * 3);
  const m = new Matrix4();
  const q = new Quaternion();
  const n = new Vector3();
  const s = new Vector3(size, size, size);
  const c = new Color(color);
  points.forEach((p, i) => {
    n.set(...p).normalize();
    q.setFromUnitVectors(Z, n);
    m.compose(n.clone().multiplyScalar(r), q, s);
    m.toArray(matrices, i * 16);
    c.toArray(colors, i * 3);
  });
  return { count: points.length, matrices, colors };
}

/** Land dots (one per land cell, every other column on lite) and one dot per country with visits, in globe space. */
export function globeInstances(r: number, tier: GpuTier, countries: readonly string[]): { land: DotInstances; countries: DotInstances } {
  const spec = tier === "full" ? OBSERVATORY.land.full : OBSERVATORY.land.lite;
  const land = landCells(spec.step).map(({ lat, lon }) => latLonToVec3(lat, lon, 1));
  const known = countries.flatMap((code) => {
    const p = countryPoint(code);
    return p ? [latLonToVec3(p[0], p[1], 1)] : [];
  });
  return {
    land: dots(land, r * 1.005, spec.size, OBSERVATORY.colors.land),
    countries: dots(known, r * 1.02, OBSERVATORY.countrySize, OBSERVATORY.colors.country),
  };
}

/** Panel instances for the holo plate mesh: the backing, then the 3D and Classic bar segments (center, size, color). */
export function observatoryPlates(parts: ObservatoryParts, shares: { threeD: number; classic: number } | null): { at: V3; w: number; h: number; color: string }[] {
  const { panel } = parts;
  const place = panelPoint(parts);
  const backing = { at: place(0, panel.bottom + panel.h / 2, 0), w: panel.w, h: panel.h, color: OBSERVATORY.colors.rim };
  if (!shares || shares.threeD + shares.classic <= 0) return [backing];
  const full = panel.w - 0.6;
  const left = -panel.w / 2 + 0.3;
  const a = (full * shares.threeD) / 100;
  const b = full - a;
  const y = panel.bottom + BAR_Y;
  return [
    backing,
    ...(a > 0.02 ? [{ at: place(left + a / 2, y, 0.01), w: a, h: 0.1, color: OBSERVATORY.colors.bar3d }] : []),
    ...(b > 0.02 ? [{ at: place(left + a + b / 2, y, 0.01), w: b, h: 0.1, color: OBSERVATORY.colors.barClassic }] : []),
  ];
}

/** Floor-local point at panel-local (x right, y up from the deck, z toward the viewer). */
function panelPoint({ panel }: ObservatoryParts): (x: number, y: number, z: number) => V3 {
  const c = Math.cos(panel.yaw);
  const s = Math.sin(panel.yaw);
  return (x, y, z) => [panel.x + x * c + z * s, y, panel.z - x * s + z * c];
}

/** Text row heights above the panel bottom (top to bottom), and the bar between the split and the source. */
const ROWS = [3.85, 3.25, 2.72, 2.3, 1.9, 1.52, 1.12, 0.42, 0.2] as const;
const BAR_Y = 0.82;

export interface ObservatoryLabels {
  title: string;
  offline: string;
  approx: (n: string) => string;
  visits30: string;
  visitsAll: string;
  countries: string;
  questions: string;
  topFloor: (floor: string) => string;
  split: (threeD: number, classic: number) => string;
  source: string;
  updated: string;
  delayed: (date: string) => string;
  floors: Record<StatsFloor, string>;
}

export interface ObservatoryState {
  /** The last 30 days, every topic (the panel is not filtered; the drawer is). */
  view: VisitsView;
  /** Visits since launch. */
  allVisits: number;
  freshness: Freshness;
  /** The last complete day, formatted for the locale ("13 Oct 2026"). */
  lastDay: string;
}

/**
 * The panel's nine text rows (always nine, so the label batch keeps its members): title, the 30-day
 * visits in large type, its window, the since-launch total, countries and questions, the most explored
 * floor, the 3D vs Classic split, then the source and the cadence (or the "delayed" note). Without
 * data: the title and "Stats offline".
 */
export function observatoryText(parts: ObservatoryParts, state: ObservatoryState | null, labels: ObservatoryLabels, locale: Locale): BatchedLabel[] {
  const { panel } = parts;
  const place = panelPoint(parts);
  const x = -panel.w / 2 + 0.3;
  const n = (v: number) => formatCount(v, locale);
  const v = state?.view;
  const texts: string[] = v
    ? [
        labels.title.toUpperCase(),
        labels.approx(n(v.visits)),
        labels.visits30,
        `${labels.approx(n(state.allVisits))} ${labels.visitsAll}`,
        `${n(v.countries.length)} ${labels.countries} · ${n(v.asks.total)} ${labels.questions}`,
        v.topFloor ? labels.topFloor(labels.floors[v.topFloor]) : "",
        v.mode.threeD + v.mode.classic > 0 ? labels.split(v.mode.threeDShare, v.mode.classicShare) : "",
        labels.source,
        state.freshness === "delayed" ? labels.delayed(state.lastDay) : labels.updated,
      ]
    : [labels.title.toUpperCase(), labels.offline, "", "", "", "", "", "", ""];
  return texts.map((text, i): BatchedLabel => ({
    text,
    position: place(x, panel.bottom + ROWS[i], 0.03),
    yaw: panel.yaw,
    font: STYLE[i].font,
    fontSize: STYLE[i].size,
    color: i === 8 && state?.freshness === "delayed" ? "#fbbf24" : STYLE[i].color,
    letterSpacing: STYLE[i].spacing ?? 0,
    anchorX: "left",
    maxWidth: panel.w - 0.6,
  }));
}

const STYLE: readonly { font: string; size: number; color: string; spacing?: number }[] = [
  { font: FONTS.monoBold, size: 0.2, color: OBSERVATORY.colors.rim, spacing: 0.14 },
  { font: FONTS.sansBold, size: 0.56, color: "#f5f3ff" },
  { font: FONTS.sans, size: 0.21, color: "#ddd6fe" },
  { font: FONTS.sans, size: 0.22, color: "#e0e7ff" },
  { font: FONTS.sans, size: 0.21, color: "#e0e7ff" },
  { font: FONTS.sans, size: 0.21, color: "#e0e7ff" },
  { font: FONTS.mono, size: 0.17, color: "#cffafe" },
  { font: FONTS.mono, size: 0.135, color: "#a1a1aa" },
  { font: FONTS.mono, size: 0.135, color: "#a1a1aa" },
];

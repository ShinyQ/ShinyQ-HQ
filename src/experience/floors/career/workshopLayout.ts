import type { ViewZone } from "../../camera/orbit";
import { ROAD, type Plaza } from "../../nav/road";
import type { Rect, Vec2 } from "../../types";
import { SKYLINE, skylineBars, skylineShape, type SkylineBar, type WorkshopRepo } from "./skyline";

/**
 * L2 Workshop (F3, owner approved 2026-10-14: "layout for workshop annex and in front of it was weird").
 * Pure (no React or three). The Career Road ends in two plazas on its center line:
 *
 * - the forecourt: open floor with the time console docked on its north edge (screen facing the rail
 *   camera) and the Return pad beside it;
 * - the Workshop: a gateway arch over the road at its start, the repo skyline docked on its north edge
 *   (a backdrop, tallest bars behind), one workbench per side project docked on its south edge in two
 *   groups of touching benches (centered under the skyline), and the Horizon deck at the road's end in
 *   front of the window.
 *
 * Every piece keeps the space rules: obstacles touch or keep 6 u (the benches start at least 4 u past the gateway posts and 5 u further south;
 * the skyline starts well clear of them), stops lie on the plazas, and nothing stands on the road.
 */
export const WORKSHOP = {
  forecourt: { w: 18, d: 18 },
  plaza: { minW: 34, d: 18 },
  /** Gap between a plaza edge and what is docked on it (the console, the benches, the skyline plinth). */
  apron: 1.5,
  /** Stops lie this far inside a plaza edge (the rover's radius plus a margin from the docked piece). */
  stopInset: 1,
  console: { w: 5, d: 1.2, h: 1.1, screenW: 4.4, screenH: 1.7, screenTilt: 0.5 },
  /**
   * The Return pad (F1, `FloorLayout.returnPad`) sits this far west of the console, on the stop line: its
   * floating "Back to elevator" sign stays clear of the WORKSHOP sign over the gateway east of the console.
   */
  returnPad: { dx: -5.5, dz: -0.2 },
  gateway: { post: 0.6, height: 4.8, beam: 0.5 },
  bench: { w: 2.2, d: 1.2, h: 0.9, group: 5, gap: ROAD.minClear, inset: 4 },
  /** The road ends this far before the window (the Horizon deck). */
  deck: 4,
} as const;

export interface WorkshopInput {
  /** Side project ids, one bench each, in content order. */
  benches: readonly string[];
  repos: readonly WorkshopRepo[];
}

export interface WorkshopBench {
  /** Side project id (`L2:side-<id>`). */
  id: string;
  index: number;
  rect: Rect;
  center: Vec2;
  /** Where the rover stops in front of it (on the plaza). */
  stop: Vec2;
}

export interface WorkshopSkyline {
  plinth: Rect;
  /** Bars in world (floor-local) x and z. */
  bars: SkylineBar[];
  /** Where the rover stops in front of each bar (same order as `bars`), on the plaza. */
  stops: Vec2[];
  /** Tallest bar (u). */
  top: number;
}

export interface WorkshopLayout {
  forecourt: Plaza;
  plaza: Plaza;
  gateway: { x: number; posts: [Vec2, Vec2]; rects: [Rect, Rect]; stop: Vec2 };
  console: { rect: Rect; center: Vec2; stop: Vec2 };
  returnPad: Vec2;
  benches: WorkshopBench[];
  skyline: WorkshopSkyline;
  /** Where the road ends (the Horizon deck), and the window (slab end). */
  roadEnd: number;
  windowX: number;
  obstacles: Rect[];
  /** Camera collision columns (`FloorLayout.tall`). */
  tall: (Rect & { h: number })[];
  viewZones: ViewZone[];
  /** Scrub stops: the forecourt and the Workshop. */
  stops: number[];
}

const rectAt = (c: Vec2, w: number, d: number): Rect => ({ minX: c.x - w / 2, maxX: c.x + w / 2, minZ: c.z - d / 2, maxZ: c.z + d / 2 });

/** Benches in two groups of touching benches (the first takes the odd one), 6 u apart, from `x0`. */
function benchRow(ids: readonly string[], x0: number, z: number): WorkshopBench[] {
  const B = WORKSHOP.bench;
  const first = Math.ceil(ids.length / 2);
  return ids.map((id, index) => {
    const group = index < first ? 0 : 1;
    const x = x0 + index * B.w + group * B.gap + B.w / 2;
    const center = { x, z: z + B.d / 2 };
    return { id, index, rect: rectAt(center, B.w, B.d), center, stop: { x, z: z - WORKSHOP.apron - WORKSHOP.stopInset } };
  });
}

/** One obstacle per group of touching benches (the space rules see one long table, not five touching boxes). */
export function benchGroups(benches: readonly WorkshopBench[]): Rect[] {
  const groups: Rect[] = [];
  for (const b of benches) {
    const last = groups.at(-1);
    if (last && Math.abs(last.maxX - b.rect.minX) < 1e-6) last.maxX = b.rect.maxX;
    else groups.push({ ...b.rect });
  }
  return groups;
}

/** Length of the bench row (u), gap included. */
export function benchSpan(count: number): number {
  if (count === 0) return 0;
  return count * WORKSHOP.bench.w + (count > 1 ? WORKSHOP.bench.gap : 0);
}

/** Lays out the forecourt and the Workshop from `start` (the forecourt's west edge, on the road's center line z 0). */
export function buildWorkshop(start: number, input: WorkshopInput): WorkshopLayout {
  const W = WORKSHOP;
  const F = W.forecourt;
  const forecourt: Plaza = { id: "forecourt", center: { x: start + F.w / 2, z: 0 }, w: F.w, d: F.d };

  // The Workshop is long enough for the bench row plus 6 u to the window, and the skyline plus 6 u each side.
  const shape = skylineShape(input.repos.length);
  const x0 = start + F.w;
  const w = Math.max(W.plaza.minW, Math.ceil(W.bench.inset + benchSpan(input.benches.length) + ROAD.minClear + 1), Math.ceil(shape.w + 2 * ROAD.minClear));
  const plaza: Plaza = { id: "annex", center: { x: x0 + w / 2, z: 0 }, w, d: W.plaza.d };
  const windowX = x0 + w;
  const half = W.plaza.d / 2;

  // Gateway arch over the road where the Workshop starts; the stop is just inside it.
  const off = ROAD.minWidth / 2 + 1;
  const posts: [Vec2, Vec2] = [
    { x: x0, z: -off },
    { x: x0, z: off },
  ];
  const postRects = posts.map((p) => rectAt(p, W.gateway.post, W.gateway.post)) as [Rect, Rect];

  // Time console on the forecourt's north edge, its screen facing the rail camera (+z).
  const C = W.console;
  const consoleCenter = { x: forecourt.center.x, z: -(F.d / 2 + W.apron + C.d / 2) };
  const consoleStop = { x: consoleCenter.x, z: -F.d / 2 + W.stopInset };

  // The bench row sits centered under the skyline when the plaza is longer than the row needs, never closer than
  // `inset` to the gateway nor than 6 u (plus a margin) to the window, so fewer benches leave no empty end.
  const span = benchSpan(input.benches.length);
  const benchStart = Math.max(W.bench.inset, Math.min((w - span) / 2, w - ROAD.minClear - 1 - span));
  const benches = benchRow(input.benches, x0 + benchStart, half + W.apron);

  const front = -(half + W.apron);
  const bars = skylineBars(input.repos).map((b) => ({ ...b, x: plaza.center.x + b.x, z: front + b.z }));
  const plinth: Rect = { minX: plaza.center.x - shape.w / 2, maxX: plaza.center.x + shape.w / 2, minZ: front - shape.d, maxZ: front };
  const top = bars.reduce((m, b) => Math.max(m, b.h), 0);
  const skyline: WorkshopSkyline = { plinth, bars, stops: bars.map((b) => ({ x: b.x, z: -half + W.stopInset })), top };

  const roadEnd = windowX - W.deck;
  const obstacles: Rect[] = [rectAt(consoleCenter, C.w, C.d), ...postRects, ...benchGroups(benches), ...(bars.length ? [plinth] : [])];
  const tall: (Rect & { h: number })[] = [
    ...postRects.map((r) => ({ ...r, h: W.gateway.height + W.gateway.beam })),
    ...(bars.length ? [{ ...plinth, h: top + SKYLINE.plinth }] : []),
  ];
  const viewZones: ViewZone[] = [
    // At the console: square on, a little closer, so the year list on its screen reads.
    // A portrait phone comes closer still, so the console's sign reads (the phone reading rule).
    { id: "L2:time-console", area: { minX: consoleStop.x - 4, maxX: consoleStop.x + 4, minZ: consoleStop.z - 1, maxZ: consoleStop.z + 3 }, yaw: 0, zoom: 0.85, classView: { mobile: { zoom: 0.62 }, landscape: { zoom: 0.66 } } },
    // Landscape phones only, along the repo skyline: the rail aims higher, so the sign over the tallest bar stays under the
    // floor chip row of a short frame (the reading rule, spec 2026-10-29). Other screens drive through it as open floor.
    ...(bars.length
      ? [{ id: "L2:skyline", area: { minX: bars[0].x - 2, maxX: bars[bars.length - 1].x + 2, minZ: -half, maxZ: -half + W.stopInset + 2 }, yaw: 0, only: ["landscape"] as const, classView: { landscape: { lookOffset: { up: 4 } } } }]
      : []),
    // On the Horizon deck: turn to look east through the window at the bridge and the skyline beyond.
    { id: "L2:horizon-deck", area: { minX: roadEnd - 3, maxX: windowX, minZ: -6, maxZ: 6 }, yaw: -Math.PI / 2, zoom: 1.2 },
  ];

  return {
    forecourt,
    plaza,
    gateway: { x: x0, posts, rects: postRects, stop: { x: x0 + 3, z: 0 } },
    console: { rect: obstacles[0], center: consoleCenter, stop: consoleStop },
    returnPad: { x: consoleCenter.x + W.returnPad.dx, z: consoleStop.z + W.returnPad.dz },
    benches,
    skyline,
    roadEnd,
    windowX,
    obstacles,
    tall,
    viewZones,
    stops: [forecourt.center.x, plaza.center.x],
  };
}

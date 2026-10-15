/**
 * The L1 profile hologram as the rover brand mark (owner pick 2026-10-15, "Screen Rover"; the KAW
 * hexagon monogram is retired): the rover head with its one front screen, the `^_^` face (mirror
 * symmetric, so it also reads from behind through the glass head while the hologram turns), the antenna
 * right of center with the pink tip, and a tread on each side. Rover
 * proportions (`rover/Rover.tsx`: head 1.2 x 1.1 x 0.9, screen 0.9 x 0.7, antenna 0.35 right of center)
 * at `ROVER_MARK_3D.scale`. Pure (no three.js), so the fit tests run in node.
 */

type V3 = [number, number, number];

const S = 1.8;

export const ROVER_MARK_3D = {
  /** World units per rover unit. */
  scale: S,
  /** Head center height above the floor (the spin group's origin). */
  y: 3.4,
  head: { w: 1.2 * S, h: 1.1 * S, d: 0.9 * S, r: 0.2 * S },
  /** The screen sits a hair above the head's center, like the rover's. */
  screen: { w: 0.9 * S, h: 0.7 * S, y: 0.02 * S },
  /** Simplified treads (the brand mark's pills): outer edge past the head, like the rover's. */
  tread: { w: 0.58, h: 0.5, d: 1.98, x: 1.08, gap: 0.14 },
  antenna: { x: 0.35 * S, h: 0.95, tip: 0.15 },
  /** `^_^` like the rover's default face. */
  face: { text: "^_^", fontSize: 0.78 },
  colors: { head: "#22d3ee", tread: "#6366f1", screen: "#a78bfa", eyes: "#22d3ee", tip: "#f472b6", line: "#22d3ee" },
} as const;

/** Head bottom, relative to the head center. */
const HEAD_BOTTOM = -ROVER_MARK_3D.head.h / 2;

/** Tread centers and sizes, relative to the head center. */
export function treadBoxes(): { at: V3; size: V3 }[] {
  const t = ROVER_MARK_3D.tread;
  const y = HEAD_BOTTOM - t.gap - t.h / 2;
  return [-1, 1].map((side) => ({ at: [side * t.x, y, 0] as V3, size: [t.w, t.h, t.d] as V3 }));
}

/** The front screen plate, relative to the head center. */
export function screenPlate(): { at: V3; size: [number, number] } {
  const { head, screen } = ROVER_MARK_3D;
  return { at: [0, screen.y, head.d / 2 + 0.012], size: [screen.w, screen.h] };
}

/** The face twice on the screen: one label facing out, one facing in (labels are one-sided), so it reads from both sides. */
export function faceLabels(): { at: V3; yaw: number }[] {
  const { at } = screenPlate();
  return [
    { at: [at[0], at[1], at[2] + 0.01], yaw: 0 },
    { at: [at[0], at[1], at[2] - 0.01], yaw: Math.PI },
  ];
}

/** The antenna stick (bottom, top) and the tip center, relative to the head center. */
export function antenna(): { from: V3; to: V3; tip: V3 } {
  const { head, antenna: a } = ROVER_MARK_3D;
  const top = head.h / 2;
  return { from: [a.x, top, 0], to: [a.x, top + a.h, 0], tip: [a.x, top + a.h + a.tip * 0.6, 0] };
}

/** A rounded rectangle outline in the xy plane at depth z (`n` segments per corner). */
export function roundedOutline(w: number, h: number, r: number, z: number, n = 6): V3[] {
  const out: V3[] = [];
  const corners: [number, number, number][] = [
    [w / 2 - r, h / 2 - r, 0],
    [-w / 2 + r, h / 2 - r, Math.PI / 2],
    [-w / 2 + r, -h / 2 + r, Math.PI],
    [w / 2 - r, -h / 2 + r, (3 * Math.PI) / 2],
  ];
  for (const [cx, cy, a0] of corners) {
    for (let i = 0; i <= n; i++) {
      const a = a0 + (i / n) * (Math.PI / 2);
      out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, z]);
    }
  }
  return out;
}

/**
 * Line segment pairs for the neon edges (one `LineSegments`): the head's front and back outlines, the
 * four depth edges at the corners, the antenna stick and each tread's outer side profile.
 */
export function outlineSegments(): number[] {
  const { head } = ROVER_MARK_3D;
  const z = head.d / 2 + 0.005;
  const out: number[] = [];
  const loop = (pts: V3[]) => pts.forEach((p, i) => out.push(...p, ...pts[(i + 1) % pts.length]));
  const front = roundedOutline(head.w, head.h, head.r, z);
  const back = roundedOutline(head.w, head.h, head.r, -z);
  loop(front);
  loop(back);
  const perCorner = front.length / 4;
  for (let c = 0; c < 4; c++) {
    const i = c * perCorner + Math.floor(perCorner / 2);
    out.push(...front[i], ...back[i]);
  }
  const a = antenna();
  out.push(...a.from, ...a.to);
  for (const t of treadBoxes()) {
    const x = t.at[0] + Math.sign(t.at[0]) * (t.size[0] / 2 + 0.005);
    // The tread's side profile: a pill in the yz plane on its outer face.
    loop(roundedOutline(t.size[2], t.size[1], t.size[1] / 2 - 0.01, 0).map(([u, v]) => [x, t.at[1] + v, t.at[2] + u] as V3));
  }
  return out;
}

/** Horizontal radius the turning mark sweeps (treads included), and its top and bottom above the floor at rest. */
export function roverMarkExtent(): { radius: number; top: number; bottom: number } {
  const { head, y, antenna: a } = ROVER_MARK_3D;
  const corners = [
    [head.w / 2, head.d / 2],
    ...treadBoxes().map((t) => [Math.abs(t.at[0]) + t.size[0] / 2, t.size[2] / 2]),
  ];
  const radius = Math.max(...corners.map(([x, z]) => Math.hypot(x, z)));
  const tip = antenna().tip;
  const tread = treadBoxes()[0];
  return { radius, top: y + tip[1] + a.tip, bottom: y + tread.at[1] - tread.size[1] / 2 };
}

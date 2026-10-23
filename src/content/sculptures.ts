import type { HologramPart } from "@/experience/floors/labs/hologramParts";

/**
 * Build-time expander of the L3 pod sculpture recipes (`content/sculptures.json`): boxes and the `ring` and `bars`
 * macros become `HologramPart` lists, which `scripts/build-shapes.ts` writes into `public/shapes/L3.<hash>.json`.
 * Pure; never bundled.
 */

/** Most boxes one sculpture may use (39 pods x 16 boxes x 12 triangles stays far under the 30k frame budget). */
export const SCULPTURE_MAX_BOXES = 16;
/** Sculpture bounds in pod-local units before the hero scale (the old kinds span about the same). */
export const SCULPTURE_BOUNDS = { xz: 1.25, yMin: -0.8, yMax: 0.9 } as const;

type Extras = { r?: number; p?: number; k?: number };
type BoxSpec = [number, number, number, number, number, number] | [number, number, number, number, number, number, Extras];
interface RingSpec {
  ring: [number, number, number, number, number, number];
  plane: "xy" | "xz";
  arc?: [number, number];
  seg?: number;
}
interface BarsSpec {
  bars: [number, number, number, number, number, number];
  h: number[];
  pulse?: boolean;
}
export type SculptureSpec = BoxSpec | RingSpec | BarsSpec;
export interface SculptureFile {
  sculptures: Record<string, SculptureSpec[]>;
}

const DEG = Math.PI / 180;
const r3 = (v: number) => Math.round(v * 1000) / 1000 + 0;

function part(x: number, y: number, z: number, w: number, h: number, d: number, extras: Extras = {}): HologramPart {
  const out: HologramPart = { x: r3(x), y: r3(y), z: r3(z), w: r3(w), h: r3(h), d: r3(d) };
  if (extras.p !== undefined) out.pulse = r3(extras.p);
  if (extras.r) out.r = r3(extras.r * DEG);
  if (extras.k !== undefined && extras.k !== 1) out.k = r3(extras.k);
  return out;
}

/** One recipe to its boxes. */
export function expandSculpture(specs: readonly SculptureSpec[]): HologramPart[] {
  const out: HologramPart[] = [];
  for (const spec of specs) {
    if (Array.isArray(spec)) {
      const [x, y, z, w, h, d, extras] = spec;
      out.push(part(x, y, z, w, h, d, extras));
    } else if ("ring" in spec) {
      const [cx, cy, cz, radius, n, size] = spec.ring;
      const [from, to] = spec.arc ?? [0, 360 - 360 / n];
      for (let i = 0; i < n; i++) {
        const a = (from + ((to - from) * i) / Math.max(1, n - 1)) * DEG;
        const c = Math.cos(a) * radius;
        const s = Math.sin(a) * radius;
        if (spec.plane === "xy") out.push(part(cx + c, cy + s, cz, spec.seg ?? size, size, size, spec.seg ? { r: a / DEG + 90 } : {}));
        else out.push(part(cx + c, cy, cz + s, size, size, size));
      }
    } else {
      const [x0, y0, z, dx, w, d] = spec.bars;
      spec.h.forEach((h, i) => out.push(part(x0 + i * dx, y0 + h / 2, z, w, h, d, spec.pulse ? { p: i * 0.7 } : {})));
    }
  }
  return out;
}

/** Canonical text of a sculpture (part order ignored), to tell two sculptures apart. */
export function sculptureSignature(parts: readonly HologramPart[]): string {
  return parts
    .map((p) => JSON.stringify([p.x, p.y, p.z, p.w, p.h, p.d, p.r ?? 0]))
    .sort()
    .join("|");
}

/** Problems of one expanded sculpture: too many boxes or a box outside the bounds (its corners, roll included). */
export function sculptureIssues(id: string, parts: readonly HologramPart[]): string[] {
  const issues: string[] = [];
  if (parts.length === 0) issues.push(`sculpture "${id}" has no boxes`);
  if (parts.length > SCULPTURE_MAX_BOXES) issues.push(`sculpture "${id}" has ${parts.length} boxes (at most ${SCULPTURE_MAX_BOXES})`);
  const B = SCULPTURE_BOUNDS;
  parts.forEach((p, i) => {
    const c = Math.abs(Math.cos(p.r ?? 0));
    const s = Math.abs(Math.sin(p.r ?? 0));
    const hx = (p.w * c + p.h * s) / 2;
    const hy = (p.w * s + p.h * c) / 2;
    const e = 1e-6;
    if (Math.abs(p.x) + hx > B.xz + e || Math.abs(p.z) + p.d / 2 > B.xz + e || p.y - hy < B.yMin - e || p.y + hy > B.yMax + e) {
      issues.push(`sculpture "${id}" box ${i} leaves the bounds`);
    }
  });
  return issues;
}

/** Every recipe expanded, in file order. */
export function expandSculptures(file: SculptureFile): Record<string, HologramPart[]> {
  return Object.fromEntries(Object.entries(file.sculptures).map(([id, specs]) => [id, expandSculpture(specs)]));
}

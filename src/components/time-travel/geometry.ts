import type { Accent } from "@/content/schema";
import { TT_KINDS, type TtKind, type TtStop } from "@/content/time-travel";

/** Skyline units (SVG user space): one 100-wide slot per stop, buildings 60 wide on a base line at y 220. */
export const SKY = { slot: 100, building: 60, base: 220, maxHeight: 200, height: 224, gap: 1, outline: 3 } as const;

/** One hue per block kind, from the accent tokens (spec section 3.2). */
export const KIND_TONE: Record<TtKind, Accent> = { roles: "cyan", study: "amber", projects: "violet", awards: "pink", writing: "green", certs: "blue" };

export interface BlockRect {
  kind: TtKind;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BuildingLayout {
  x: number;
  top: number;
  height: number;
  centerX: number;
  blocks: BlockRect[];
}

const round = (n: number) => Math.round(n * 10) / 10;

/** One closed rectangle subpath per block, joined into a single path `d` (keeps the serialized markup small). */
export function blockPath(blocks: readonly BlockRect[]): string {
  return blocks.map((b) => `M${b.x} ${b.y}h${b.width}v${b.height}h-${b.width}z`).join("");
}

export function viewBoxOf(count: number): string {
  return `0 0 ${count * SKY.slot} ${SKY.height}`;
}

export function skylineLayout(stops: readonly Pick<TtStop, "counts" | "size" | "height">[]): BuildingLayout[] {
  return stops.map((stop, i) => {
    const x = i * SKY.slot + (SKY.slot - SKY.building) / 2;
    const height = stop.size > 0 ? round(stop.height * SKY.maxHeight) : 0;
    const step = stop.size > 0 ? height / stop.size : 0;
    const blocks: BlockRect[] = [];
    let n = 0;
    for (const kind of TT_KINDS) {
      for (let k = 0; k < stop.counts[kind]; k++, n++) {
        blocks.push({ kind, x, y: round(SKY.base - (n + 1) * step), width: SKY.building, height: round(Math.max(0.5, step - SKY.gap)) });
      }
    }
    return { x, top: round(SKY.base - height), height, centerX: i * SKY.slot + SKY.slot / 2, blocks };
  });
}

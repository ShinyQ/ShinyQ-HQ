import type { HologramKind } from "../../types";

/** One box of a pod hologram, in pod-local units (center, size). */
export interface HologramPart {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  /** Waveform bars pulse their height with this phase (radians); undefined parts are static. */
  pulse?: number;
}

const box = (x: number, y: number, z: number, w: number, h: number, d: number, pulse?: number): HologramPart => ({ x, y, z, w, h, d, pulse });

/**
 * Procedural hologram recipes per pod kind (appendix 01 section 4: "per-pod holograms by kind").
 * All parts are boxes so every pod hologram on the floor renders as one instanced mesh.
 * Pure: unit-tested in node.
 */
export function hologramParts(kind: HologramKind): HologramPart[] {
  switch (kind) {
    case "waveform":
      return Array.from({ length: 9 }, (_, i) => box((i - 4) * 0.28, 0, 0, 0.14, 0.4 + 0.9 * Math.abs(Math.sin(i * 0.9)), 0.14, i * 0.7));
    case "shield":
      return [box(0, 0.55, 0, 1.4, 0.22, 0.12), box(0, 0.28, 0, 1.2, 0.22, 0.12), box(0, 0.01, 0, 0.95, 0.22, 0.12), box(0, -0.26, 0, 0.62, 0.22, 0.12), box(0, -0.5, 0, 0.26, 0.2, 0.12)];
    case "documents":
      return [box(-0.35, 0, -0.25, 0.8, 1.05, 0.05), box(0, 0.06, 0, 0.8, 1.05, 0.05), box(0.35, 0.12, 0.25, 0.8, 1.05, 0.05), box(0.35, 0.3, 0.29, 0.5, 0.06, 0.02), box(0.35, 0.15, 0.29, 0.5, 0.06, 0.02)];
    case "graph":
      return [
        box(0, 0, 0, 0.32, 0.32, 0.32),
        ...Array.from({ length: 5 }, (_, i) => {
          const a = (i / 5) * Math.PI * 2;
          return box(Math.cos(a) * 0.75, Math.sin(a * 2) * 0.25, Math.sin(a) * 0.75, 0.2, 0.2, 0.2);
        }),
      ];
    case "chart":
      return [box(0, -0.55, 0, 1.5, 0.05, 0.4), ...[0.35, 0.6, 0.5, 0.85, 1.1].map((h, i) => box((i - 2) * 0.3, -0.52 + h / 2, 0, 0.18, h, 0.18))];
    case "template":
      return [0, 1, 2].flatMap((c) => [0, 1].map((r) => box((c - 1) * 0.5, (r - 0.5) * 0.55, 0, 0.42, 0.45, 0.04)));
    case "pipeline":
      return [...[0, 1, 2, 3].map((i) => box((i - 1.5) * 0.48, 0, 0, 0.26, 0.26, 0.26)), ...[0, 1, 2].map((i) => box((i - 1) * 0.48, 0, 0, 0.22, 0.04, 0.04))];
  }
}

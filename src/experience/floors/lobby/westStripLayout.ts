import type { LightInstance } from "./hallGallery";
import { OFFICE_WING } from "./officeLayout";
import { LOBBY_SLAB } from "./slab";

/**
 * The narrow strip west of the Agent Office wing (owner decision 2026-11-02: decoration only, no content): a row of
 * light columns with glow pools along the west slab edge. Light only, like the hall's fountain: no obstacle, so the rover
 * drives through and the space rules are untouched. Pure: the Lobby draws it (`WestStrip.tsx`), the tests read it.
 */
const S = LOBBY_SLAB.halfZ;

export const WEST_STRIP = {
  /** The strip: from the west slab edge to the office wing, the wing's depth. */
  rect: { minX: LOBBY_SLAB.minX, maxX: OFFICE_WING.minX, minZ: S, maxZ: S + OFFICE_WING.depth },
  /** The columns' line, 3.5 u in from the west edge, and their spacing along it from 4 u inside the strip's ends. */
  x: LOBBY_SLAB.minX + 3.5,
  inset: 4,
  step: 4,
  /** Column heights, alternating, and the beam's radius at its foot and top. */
  h: [5.2, 3.6],
  r0: 0.22,
  r1: 0.1,
  /** Alternating tones from the office wing's palette (cyan, violet). */
  tones: ["#22d3ee", "#a78bfa"],
} as const;

/** One light column and its floor pool per step along the strip (`StageLights`, one draw call). */
export function westStripLights(): LightInstance[] {
  const W = WEST_STRIP;
  const out: LightInstance[] = [];
  const count = Math.floor((W.rect.maxZ - W.rect.minZ - 2 * W.inset) / W.step) + 1;
  for (let i = 0; i < count; i++) {
    const z = W.rect.minZ + W.inset + i * W.step;
    const color = W.tones[i % W.tones.length];
    out.push(
      { kind: "beam", x: W.x, y: 0, z, h: W.h[i % W.h.length], r0: W.r0, r1: W.r1, color, alpha: 0.5, spin: 0, phase: 0 },
      { kind: "pool", x: W.x, y: 0.025, z, h: 0, r0: 1.3, r1: 0, color, alpha: 0.32, spin: 0, phase: 0 },
    );
  }
  return out;
}

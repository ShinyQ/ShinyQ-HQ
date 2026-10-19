"use client";

import { useOfficeModule } from "@/experience/floors/lobby/office/chunk";
import { useHQStore } from "@/store/useHQStore";

/**
 * The Agent Office chips' host (main path, a few lines): renders the lazy chunk's chips only once the chunk is
 * loaded and the rover is on L1 (not riding) while exploring or with a drawer open.
 */
export function OfficeLayer() {
  const mod = useOfficeModule();
  const show = useHQStore((s) => s.floor === "L1" && !s.ride && (s.phase === "explore" || s.phase === "room"));
  const Chips = mod?.OfficeChips;
  return show && Chips ? <Chips /> : null;
}

import type { FloorId, RoomId } from "@/content/schema";

/**
 * L3 Ops Control Room ("How I run AI in production", owner approved 2026-10-14). Type-only imports: the
 * gate (main bundle) reads the deep link through this file.
 */
export const OPS_ROOM: RoomId = "L3:ops";
/** The About page anchor of the section (`/{locale}/contact#production`). */
export const OPS_HASH = "production";

/** `/{locale}/contact#production` in 3D: ride to the Ops Control Room on L3 and open it (never on other routes). */
export function opsRoomFromHash(startFloor: FloorId | undefined, hash: string): RoomId | null {
  return startFloor === "RF" && hash.replace(/^#/, "").toLowerCase() === OPS_HASH ? OPS_ROOM : null;
}

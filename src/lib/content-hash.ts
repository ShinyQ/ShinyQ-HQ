import { createHash } from "node:crypto";

/**
 * Short content hash of a JSON payload (first 12 hex chars of the sha256 of `JSON.stringify(value)`): the `?v=` of
 * the build-time `/data/*` files (HUD index, 3D page data, room data per floor), so a cached copy never outlives a
 * deploy. Server and build only.
 */
export function shortHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 12);
}

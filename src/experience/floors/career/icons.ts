import { CAREER_ICONS, CAREER_TONE, type PlacedIcon, type Stroke } from "../../fx/holoIcons";
import type { CareerType } from "../../types";
import type { CareerRoom } from "./layout";

/**
 * Where the L2 room icons float (pure; no React or three): the client draws the type icons there (`CareerRooms`), and
 * `src/content/shapes.ts` places every room's own icon at build (`careerIcons`) on the same road the floor builds.
 */

/** Room icon width (world units). */
export const ICON_SIZE = 2.6;
/** Icon height above the floor (award icons float a little higher, above the placings count). */
export const iconY = (type: CareerType) => (type === "award" ? 2.9 : 2.7);

/** Every room's own icon in its type tone, facing the default rail camera (+z); a room without one keeps its type icon. */
export const careerIcons = (rooms: readonly CareerRoom[], items: Record<string, Stroke[]>): PlacedIcon[] =>
  rooms.map((r) => ({ key: r.slug, x: r.center.x, y: iconY(r.type), z: r.center.z, face: 0, color: CAREER_TONE[r.type], strokes: items[r.slug] ?? CAREER_ICONS[r.type] }));

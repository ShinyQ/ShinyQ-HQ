import type { FloorId } from "@/content/schema";

/** Floors with a Glass Drawer file: the five public floors, then the secret B1 (fetched only when unlocked). */
export const ROOM_DATA_FLOORS = ["L1", "L2", "L3", "L4", "RF", "B1"] as const satisfies readonly FloorId[];

/** The floor whose file holds a room: its id prefix (`L3:aria` lives in the L3 file). */
export const roomFloor = (room: string) => room.slice(0, 2) as FloorId;

/** Static room-data file per locale and floor (src/app/data), shared by the build route and the client loader. B1 keeps its own name. */
export const ROOMS_FILE = (locale: string, floor: FloorId) => (floor === "B1" ? `b1-${locale}.json` : `${locale}-${floor}.json`);

/** The file's URL; `version` (its content hash, `roomDataVersions`) busts caches when the file changes. */
export const roomsUrl = (locale: string, floor: FloorId, version?: string) => `/data/rooms/${ROOMS_FILE(locale, floor)}${version ? `?v=${version}` : ""}`;

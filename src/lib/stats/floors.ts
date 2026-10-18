import { isPublicFloor } from "../floors";
import { parseHQUrl } from "../url-sync";
import type { StatsFloor } from "./protocol";

/**
 * Floor of a Web Analytics page path (`requestPath`, no query), for the most-explored floor. Uses the
 * site's own route parser (`parseHQUrl`), so the stats and the 3D URL sync agree: `/{locale}` is L1,
 * `/journey` L2, `/labs` L3, `/library` and `/blog/*` L4, `/contact` RF. Pages that are not a floor
 * (`/quick`, `/cv`, `/`) have none.
 */
export function floorOfPath(path: string): StatsFloor | null {
  const floor = parseHQUrl(path)?.floor;
  return floor && isPublicFloor(floor) ? floor : null;
}

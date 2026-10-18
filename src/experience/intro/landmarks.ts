import { LOBBY, SHAFT } from "../config";
import { HALL } from "../floors/lobby/hallLayout";

export type IntroLandmarkId = "stats" | "skills" | "hall" | "observatory" | "elevator";

/** A beacon footprint on the Lobby floor (center and size); `y` is the height the orbit's pass check projects. */
export interface IntroLandmark {
  id: IntroLandmarkId;
  x: number;
  z: number;
  w: number;
  d: number;
  y: number;
}

interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const fromRect = (r: Bounds) => ({ x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2, w: r.maxX - r.minX, d: r.maxZ - r.minZ });

const statsSize = 2 * (LOBBY.statsRadius + LOBBY.statsTile.w / 2 + 1);

/** The five Lobby landmarks the intro orbit lights up as each passes the middle of the view. */
export const INTRO_LANDMARKS: readonly IntroLandmark[] = [
  { id: "stats", x: LOBBY.hologram.x, z: LOBBY.hologram.z, w: statsSize, d: statsSize, y: LOBBY.statsTile.y },
  {
    id: "skills",
    x: LOBBY.skillsWall.x,
    z: LOBBY.skillsWall.z + LOBBY.skillsWall.d / 2 + 1.5,
    w: LOBBY.skillsWall.w + 2,
    d: 3,
    y: LOBBY.skillsWall.h / 2,
  },
  { id: "hall", ...fromRect(HALL.entry), y: HALL.gate.h / 2 },
  { id: "observatory", ...fromRect(LOBBY.observatory), y: 4.6 },
  { id: "elevator", x: LOBBY.bounds.minX + 1.5, z: SHAFT.z, w: 3, d: 6, y: 1.8 },
];

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Beacon pulse alpha `sinceHit` seconds after its landmark passed the middle of the view: up over 0.3 s, held to 0.8 s, gone at 2 s. */
export function beaconAlpha(sinceHit: number): number {
  if (sinceHit < 0 || sinceHit >= 2) return 0;
  return smoothstep(0, 0.3, sinceHit) * (1 - smoothstep(0.8, 2, sinceHit));
}

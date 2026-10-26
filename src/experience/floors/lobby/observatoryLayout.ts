import { yawLooking } from "../../camera/look";
import type { ViewZone } from "../../camera/orbit";
import type { DoorTrigger, Rect, Vec2 } from "../../types";
import { VISITS_ROOM } from "./visitsRoom";

/**
 * L1 Visitor Observatory and the views around it (owner decision 2026-10-14: "South-west corner of the
 * lobby, between the elevator and the Rover menu kiosk: you see it right after stepping out of the
 * elevator"). Pure, import-light (config.ts reads it, and the store loads config.ts on every page).
 *
 * The follow camera keeps one default yaw that looks north-west, so the south-west corner is behind it
 * at the spawn. Two view zones turn it: the spawn (the kiosk stop) looks down the kiosk axis at the kiosk
 * with the observatory behind it, and the observatory door looks south at the panel and the globe. The
 * elevator arrival looks east at the profile hologram like every floor's arrival (`LOBBY.arrival`, config.ts).
 */
export const OBSERVATORY_VIEW = {
  /** Station front to door pad center (like every other station). */
  padInset: 1.1,
  /**
   * Spawn view (tuned on captures at 1440x900, 2560x1440 and 390x844): on wide screens the camera stands
   * `spawnTurn` off the kiosk axis, so the hologram's name reads at the lower left, the rover and the kiosk
   * in the middle and the observatory panel at the upper right; tablets and phones look straight down the
   * axis (hologram, rover, kiosk, observatory in one column), zoomed out a little more.
   */
  spawnTurn: 0.62,
  /**
   * Retuned for the wider plaza (more room 2026-10-19: 1.5, 1.6 and 1.75 before), same composition. Phones stay at
   * 1.85 or under, so the office wing sign is out of a portrait tablet's frame, never a sliver at its edge.
   */
  spawnZoom: 1.7,
  spawnZoomNarrow: { tablet: 1.8, mobile: 1.85 },
  /**
   * Phone landing view at the session start (owner decision 2026-10-25, primed only): a little steeper and aimed back
   * toward the camera, so Rover, the name over the hologram and the stats ring fill a portrait frame with no sky (tuned
   * on 390x844 and 375x667: `tests/unit/landing-view.test.ts`, and on captures). The zoom keeps the ring's tiles inside
   * the frame; 0.1 is about the smallest pitch that keeps the Agent Office wing sign whole or out of a portrait tablet's
   * frame (820x1180, `tests/unit/office-chip-placement.test.ts`). Leaving the spawn eases back to the follow view (its
   * `pitch` opts into the turn-back).
   */
  landingPhone: { zoom: 2.1, pitch: 0.1, lookOffset: { forward: -13.75, up: 0 } },
  /** Half size of the spawn zone around the kiosk stop. */
  spawnHalf: 2.5,
} as const;

export interface LobbyObservatoryInput {
  /** The observatory footprint (`LOBBY.observatory`). */
  rect: Rect;
  /** The kiosk stop (the session spawn) and the unit kiosk axis (hologram to observatory). */
  spawn: Vec2;
  axis: Vec2;
}

export interface LobbyObservatoryLayout {
  door: DoorTrigger;
  /** In zone order: the observatory door, the spawn (kiosk). */
  zones: ViewZone[];
}

const center = (r: Rect): Vec2 => ({ x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 });

export function lobbyObservatory({ rect, spawn, axis }: LobbyObservatoryInput): LobbyObservatoryLayout {
  const c = center(rect);
  // The door faces into the station from the north (the open floor between the elevator lane and it).
  const pad: Vec2 = { x: c.x, z: rect.minZ - OBSERVATORY_VIEW.padInset };
  const door: DoorTrigger = { room: VISITS_ROOM, at: pad, facing: { x: 0, z: 1 } };
  const s = OBSERVATORY_VIEW.spawnHalf;
  const zones: ViewZone[] = [
    { id: "L1:visits", area: { minX: rect.minX, maxX: rect.maxX, minZ: pad.z - 2, maxZ: rect.minZ }, yaw: yawLooking({ x: 0, z: 1 }) },
    {
      id: "L1:kiosk",
      area: { minX: spawn.x - s, maxX: spawn.x + s, minZ: spawn.z - s, maxZ: spawn.z + s },
      yaw: yawLooking(axis) + OBSERVATORY_VIEW.spawnTurn,
      zoom: OBSERVATORY_VIEW.spawnZoom,
      prime: true,
      classView: {
        tablet: { yaw: yawLooking(axis), zoom: OBSERVATORY_VIEW.spawnZoomNarrow.tablet },
        mobile: { yaw: yawLooking(axis), zoom: OBSERVATORY_VIEW.spawnZoomNarrow.mobile },
      },
      primeView: {
        mobile: {
          yaw: yawLooking(axis),
          zoom: OBSERVATORY_VIEW.landingPhone.zoom,
          pitch: OBSERVATORY_VIEW.landingPhone.pitch,
          lookOffset: OBSERVATORY_VIEW.landingPhone.lookOffset,
        },
      },
    },
  ];
  return { door, zones };
}

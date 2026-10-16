import type { Locale, RoomId } from "@/content/schema";
import type { MissionHost, PaletteFilter } from "./host";
import { FLOOR_PATHS, localize, roomPath, type RoomInfo } from "./rooms";

export interface StaticHostOptions {
  locale: Locale;
  rooms: readonly RoomInfo[];
  /** Client-side navigation, e.g. Next `router.push`. Receives a locale-prefixed href. */
  navigate: (href: string) => void;
  /** Rover line for the HUD toast (already localized). */
  onSay?: (text: string, ms: number) => void;
  onPalette?: (filter?: PaletteFilter) => void;
}

const DEFAULT_SAY_MS = 2400;

/**
 * MissionHost for the HTML-only tier (no WebGL). Steps map to locale routes from the appendix 06
 * URL scheme. Navigation is lazy: `elevator` and `drive` only remember where the rover is heading,
 * and the page loads once, when something must be shown (`open`, `say`, `palette`) or the mission
 * ends. A mission therefore never bounces through intermediate pages.
 */
export function createStaticHost({ locale, rooms, navigate, onSay, onPalette }: StaticHostOptions): MissionHost {
  const byId = new Map(rooms.map((room) => [room.id, room]));
  let pending: string | null = null;

  const room = (id: RoomId) => {
    const info = byId.get(id);
    if (!info) throw new Error(`Unknown room "${id}"`);
    return info;
  };
  const flush = () => {
    if (pending === null) return;
    const href = localize(locale, pending);
    pending = null;
    navigate(href);
  };

  return {
    isStatic: true,
    async elevator(floor) {
      pending = FLOOR_PATHS[floor];
    },
    async driveTo(target) {
      if (typeof target === "string") pending = room(target).floorPath;
    },
    async openRoom(id, tab) {
      const path = roomPath(room(id), tab);
      pending = null;
      navigate(localize(locale, path));
    },
    async say(text, ms) {
      flush();
      onSay?.(text[locale], ms ?? DEFAULT_SAY_MS);
    },
    async openPalette(filter) {
      flush();
      onPalette?.(filter);
    },
    finish(status) {
      if (status === "done") flush();
      else pending = null;
    },
  };
}

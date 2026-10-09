import { LOCALES, type FloorId, type Locale, type RoomId } from "@/content/schema";

export type HQView = "architecture" | null;

export interface HQUrlState {
  locale: Locale;
  floor: FloorId;
  activeRoom: RoomId | null;
  view: HQView;
}

/** Locale-relative route of each floor without a room (appendix 06 section 3). */
export const FLOOR_ROUTE: Record<FloorId, string> = {
  L1: "/",
  L2: "/journey",
  L3: "/labs",
  L4: "/library",
  RF: "/contact",
};

const ROOM_SEGMENT: Partial<Record<FloorId, string>> = {
  L2: "journey",
  L3: "labs",
  L4: "blog",
};

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function floorRoute(floor: FloorId): string {
  return FLOOR_ROUTE[floor];
}

/** Parses a pathname plus query into HQ state, or null when it is not an HQ route. */
export function parseHQUrl(pathname: string, search = ""): HQUrlState | null {
  const parts = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  const [locale, section, slug, ...rest] = parts;
  if (!locale || !(LOCALES as readonly string[]).includes(locale) || rest.length > 0) return null;
  const loc = locale as Locale;
  const view: HQView = new URLSearchParams(search).get("view") === "architecture" ? "architecture" : null;
  if (!section) return slug ? null : { locale: loc, floor: "L1", activeRoom: null, view: null };

  if (!slug) {
    const floor = (Object.keys(FLOOR_ROUTE) as FloorId[]).find((f) => FLOOR_ROUTE[f] === `/${section}`);
    return floor ? { locale: loc, floor, activeRoom: null, view: null } : null;
  }
  if (!SLUG.test(slug)) return null;
  const floor = (Object.keys(ROOM_SEGMENT) as FloorId[]).find((f) => ROOM_SEGMENT[f] === section);
  if (!floor) return null;
  return { locale: loc, floor, activeRoom: `${floor}:${slug}`, view: floor === "L3" ? view : null };
}

/** Builds the URL for a state. Rooms without a dedicated page fall back to their floor route. */
export function serializeHQUrl({ locale, floor, activeRoom, view }: HQUrlState): string {
  const base = `/${locale}`;
  if (activeRoom) {
    const [roomFloor, slug] = activeRoom.split(":") as [FloorId, string];
    const segment = ROOM_SEGMENT[roomFloor];
    if (segment && slug) {
      const query = roomFloor === "L3" && view === "architecture" ? "?view=architecture" : "";
      return `${base}/${segment}/${slug}${query}`;
    }
    floor = roomFloor;
  }
  const route = FLOOR_ROUTE[floor];
  return route === "/" ? base : `${base}${route}`;
}

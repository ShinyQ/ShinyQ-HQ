import { GUIDES_FILE, type GuidesData } from "@/components/guides/data-path";
import { guideViews } from "@/content/guide-views";
import { getContent } from "@/content/load";
import { buildFloorRoomViews } from "@/content/room-views";
import { LOCALES } from "@/content/schema";
import { EXPERIENCE_DATA_FILE } from "@/experience/data-client";
import { experienceDataFor } from "@/experience/gate-data";
import { ROOM_DATA_FLOORS, ROOMS_FILE } from "@/hud/drawer/data-path";
import { HUD_INDEX_FILE } from "@/hud/index-path";
import { buildHudIndex } from "@/hud/index-data";
import { buildRouteIndex, ROUTES_INDEX_FILE } from "@/lib/route-index";
import en from "../../../../messages/en.json";
import id from "../../../../messages/id.json";

export const dynamic = "force-static";
export const dynamicParams = false;

const MESSAGES = { en, id } as const;

/**
 * Pre-renders client data at build time: the Glass Drawer content, one file per floor
 * (out/data/rooms/{locale}-{floor}.json, fetched floor by floor with a `?v=` content hash), the B1 Engine Room
 * drawers (out/data/rooms/b1-{locale}.json, fetched only when B1 is unlocked), the HUD index
 * (out/data/hud/index.json, rooms and missions for the palette and terminal) and the 3D page data
 * (out/data/experience/{locale}.json, fetched by ExperienceGate with the 3D chunk),
 * which the pages fetch after hydration instead of inlining it into every HTML file, and the study guides
 * (out/data/guides/{locale}.json: the guide views plus the `guides` and `reader` strings, fetched by the guide dialog),
 * and the route index (out/data/routes/index.json: every page in both locales with its title, for the 404 "Did you mean").
 */
export function generateStaticParams() {
  return [
    ...LOCALES.flatMap((locale) => ROOM_DATA_FLOORS.map((floor) => ({ path: ["rooms", ROOMS_FILE(locale, floor)] }))),
    { path: ["hud", HUD_INDEX_FILE] },
    { path: ["routes", ROUTES_INDEX_FILE] },
    ...LOCALES.map((locale) => ({ path: ["guides", GUIDES_FILE(locale)] })),
    ...LOCALES.map((locale) => ({ path: ["experience", EXPERIENCE_DATA_FILE(locale)] })),
  ];
}

export async function GET(_request: Request, { params }: RouteContext<"/data/[...path]">) {
  const [kind, file] = (await params).path;
  if (kind === "hud" && file === HUD_INDEX_FILE) return Response.json(buildHudIndex(getContent()));
  if (kind === "routes" && file === ROUTES_INDEX_FILE) return Response.json(buildRouteIndex());
  if (kind === "guides") {
    const locale = LOCALES.find((l) => file === GUIDES_FILE(l));
    if (!locale) return new Response("Not found", { status: 404 });
    const data: GuidesData = { guides: guideViews(locale), messages: { guides: MESSAGES[locale].guides, reader: MESSAGES[locale].reader } };
    return Response.json(data);
  }
  if (kind === "experience") {
    const locale = LOCALES.find((l) => file === EXPERIENCE_DATA_FILE(l));
    return locale ? Response.json(await experienceDataFor(locale)) : new Response("Not found", { status: 404 });
  }
  if (kind !== "rooms") return new Response("Not found", { status: 404 });
  for (const locale of LOCALES) {
    const floor = ROOM_DATA_FLOORS.find((f) => file === ROOMS_FILE(locale, f));
    if (floor) return Response.json(buildFloorRoomViews(locale, floor));
  }
  return new Response("Not found", { status: 404 });
}

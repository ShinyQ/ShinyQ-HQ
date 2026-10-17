import { getContent } from "@/content/load";
import { buildEngineRoomViews, buildRoomViews } from "@/content/room-views";
import { LOCALES } from "@/content/schema";
import { ENGINE_ROOMS_FILE, ROOMS_FILE } from "@/hud/drawer/data-path";
import { HUD_INDEX_FILE } from "@/hud/index-path";
import { buildHudIndex } from "@/hud/index-data";

export const dynamic = "force-static";
export const dynamicParams = false;

/**
 * Pre-renders client data at build time: the Glass Drawer content (out/data/rooms/{locale}.json),
 * the B1 Engine Room drawers (out/data/rooms/b1-{locale}.json, fetched only when B1 is unlocked)
 * and the HUD index (out/data/hud/index.json, rooms and missions for the palette and terminal),
 * which the pages fetch after hydration instead of inlining it into every HTML file.
 */
export function generateStaticParams() {
  return [
    ...LOCALES.map((locale) => ({ path: ["rooms", ROOMS_FILE(locale)] })),
    ...LOCALES.map((locale) => ({ path: ["rooms", ENGINE_ROOMS_FILE(locale)] })),
    { path: ["hud", HUD_INDEX_FILE] },
  ];
}

export async function GET(_request: Request, { params }: RouteContext<"/data/[...path]">) {
  const [kind, file] = (await params).path;
  if (kind === "hud" && file === HUD_INDEX_FILE) return Response.json(buildHudIndex(getContent()));
  if (kind !== "rooms") return new Response("Not found", { status: 404 });
  for (const locale of LOCALES) {
    if (file === ROOMS_FILE(locale)) return Response.json(buildRoomViews(locale));
    if (file === ENGINE_ROOMS_FILE(locale)) return Response.json(buildEngineRoomViews(locale));
  }
  return new Response("Not found", { status: 404 });
}

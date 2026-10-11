import { getContent } from "@/content/load";
import { buildRoomViews } from "@/content/room-views";
import { LOCALES, type Locale } from "@/content/schema";
import { HUD_INDEX_FILE } from "@/hud/index-path";
import { buildHudIndex } from "@/hud/index-data";

export const dynamic = "force-static";
export const dynamicParams = false;

/**
 * Pre-renders client data at build time: the Glass Drawer content (out/data/rooms/{locale}.json)
 * and the HUD index (out/data/hud/index.json, rooms and missions for the palette and terminal),
 * which the pages fetch after hydration instead of inlining it into every HTML file.
 */
export function generateStaticParams() {
  return [...LOCALES.map((locale) => ({ path: ["rooms", `${locale}.json`] })), { path: ["hud", HUD_INDEX_FILE] }];
}

export async function GET(_request: Request, { params }: RouteContext<"/data/[...path]">) {
  const [kind, file] = (await params).path;
  if (kind === "hud" && file === HUD_INDEX_FILE) return Response.json(buildHudIndex(getContent()));
  const locale = file?.replace(/\.json$/, "") as Locale;
  if (kind !== "rooms" || !(LOCALES as readonly string[]).includes(locale)) return new Response("Not found", { status: 404 });
  return Response.json(buildRoomViews(locale));
}

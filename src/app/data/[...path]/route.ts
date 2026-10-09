import { buildRoomViews } from "@/content/room-views";
import { LOCALES, type Locale } from "@/content/schema";

export const dynamic = "force-static";
export const dynamicParams = false;

/** Pre-renders the Glass Drawer content to out/data/rooms/{locale}.json at build time. */
export function generateStaticParams() {
  return LOCALES.map((locale) => ({ path: ["rooms", `${locale}.json`] }));
}

export async function GET(_request: Request, { params }: RouteContext<"/data/[...path]">) {
  const [kind, file] = (await params).path;
  const locale = file?.replace(/\.json$/, "") as Locale;
  if (kind !== "rooms" || !(LOCALES as readonly string[]).includes(locale)) return new Response("Not found", { status: 404 });
  return Response.json(buildRoomViews(locale));
}

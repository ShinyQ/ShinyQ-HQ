import { LOCALES } from "@/content/locales";
import { assertLocale } from "@/i18n/locale";
import { atomFeed } from "@/lib/feed";
import { FEED_TYPE } from "@/lib/site";

export const dynamic = "force-static";
export const dynamicParams = false;

/** Pre-renders out/{locale}/feed.xml, the Atom feed of each locale's hosted posts (src/lib/feed.ts). */
export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function GET(_request: Request, { params }: RouteContext<"/[locale]/feed.xml">) {
  return new Response(atomFeed(assertLocale((await params).locale)), { headers: { "Content-Type": `${FEED_TYPE}; charset=utf-8` } });
}

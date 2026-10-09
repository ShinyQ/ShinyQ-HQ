import { allOgTargets, ogCard, ogSegments, parseOgSegments } from "@/lib/og-cards";
import { renderOgImage } from "@/lib/og";

export const dynamic = "force-static";
export const dynamicParams = false;

/** Pre-renders every share card to out/og/**.png at build time. */
export function generateStaticParams() {
  return allOgTargets().map((target) => ({ path: ogSegments(target) }));
}

export async function GET(_request: Request, { params }: RouteContext<"/og/[...path]">) {
  const target = parseOgSegments((await params).path);
  if (!target) return new Response("Not found", { status: 404 });
  return renderOgImage(await ogCard(target));
}

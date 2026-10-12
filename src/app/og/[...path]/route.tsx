import { renderOgImage } from "@/lib/og";
import { allOgTargets, ogCard, ogSegments, parseOgSegments } from "@/lib/og-cards";
import { encodeOgJpeg } from "@/lib/og-encode";

export const dynamic = "force-static";
export const dynamicParams = false;

/** Pre-renders every share card to out/og/**.jpg at build time (satori PNG, then JPEG). */
export function generateStaticParams() {
  return allOgTargets().map((target) => ({ path: ogSegments(target) }));
}

export async function GET(_request: Request, { params }: RouteContext<"/og/[...path]">) {
  const target = parseOgSegments((await params).path);
  if (!target) return new Response("Not found", { status: 404 });
  const png = Buffer.from(await (await renderOgImage(ogCard(target))).arrayBuffer());
  const jpeg = await encodeOgJpeg(png);
  return new Response(new Uint8Array(jpeg), { headers: { "Content-Type": "image/jpeg" } });
}

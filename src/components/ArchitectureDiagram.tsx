import { getTranslations } from "next-intl/server";
import type { Architecture, Locale } from "@/content/schema";
import { DiagramSvg } from "./diagram/DiagramSvg";
import { DIAGRAM_PRESETS, layoutArchitecture, type DiagramNode } from "./diagram/layout";

/**
 * Architecture diagram drawn at build time as inline SVG: boxes and arrows, left to right on wide screens and
 * top to bottom on phones (one SVG each, swapped by a media query). No client JS. The figure is one image to
 * assistive tech, named by a summary of its components and connections.
 */
export async function ArchitectureDiagram({ architecture, locale }: { architecture: Architecture; locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "labs" });
  const td = await getTranslations({ locale, namespace: "diagram" });
  const texts = (n: DiagramNode) => ({
    kind: t(`nodeKind.${n.kind}`).toLocaleUpperCase(locale),
    label: n.label,
    sublabel: n.sublabel?.[locale],
  });
  const wideOrColumn = process.env.HQ_DIAGRAM_DESKTOP === "wide" ? DIAGRAM_PRESETS.wide : DIAGRAM_PRESETS.column;
  const desktop = layoutArchitecture(architecture, texts, wideOrColumn);
  const phone = layoutArchitecture(architecture, texts, DIAGRAM_PRESETS.phone);

  const byId = new Map(architecture.nodes.map((n) => [n.id, n.label]));
  const flows = architecture.edges
    .map((e) =>
      [td("flow", { from: byId.get(e.from)!, to: byId.get(e.to)! }), e.label, e.async ? td("async") : undefined].filter(Boolean).join(", "),
    )
    .join("; ");
  const summary = td("summary", { count: architecture.nodes.length, flows: `${flows}.` });

  return (
    <div
      className="not-prose card p-4 sm:p-6"
      role="img"
      aria-label={summary}
      style={wideOrColumn === DIAGRAM_PRESETS.wide ? { width: "min(1120px, calc(100vw - 48px))", position: "relative", left: "50%", transform: "translateX(-50%)" } : undefined}
    >
      <DiagramSvg layout={desktop} className="hidden sm:block" />
      <DiagramSvg layout={phone} className="block sm:hidden" />
    </div>
  );
}

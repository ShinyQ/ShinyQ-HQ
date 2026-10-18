import type { CSSProperties } from "react";
import { getTranslations } from "next-intl/server";
import type { Architecture, Locale } from "@/content/schema";
import { DiagramSvg } from "./diagram/DiagramSvg";
import { DIAGRAM_PRESETS, layoutArchitecture } from "./diagram/layout";
import { diagramSummary, diagramTexts, resolveArchitecture } from "./diagram/text";

/**
 * Widest drawing (px) the left-to-right layout may have and still read at 85% scale or more from 1100 px:
 * posts break out of the text column (up to 1180 px wide), case studies stay in their 8-column content.
 */
export const WIDE_LIMIT = { breakout: 1180, column: 750 } as const;
/** Card padding and border around the drawing (sm:p-6 plus 1 px borders). */
const CARD_CHROME = 50;

/**
 * Architecture diagram drawn at build time as inline SVG (no client JS): left to right from 1100 px when it
 * fits, top to bottom below that and on phones, one SVG per layout swapped by media queries. The figure is
 * one image to assistive tech, named by a summary of its components and connections.
 */
export async function ArchitectureDiagram({
  architecture,
  locale,
  breakout = false,
}: {
  architecture: Architecture;
  locale: Locale;
  /** Posts: from 1100 px the wide drawing may extend past the text column. */
  breakout?: boolean;
}) {
  const t = await getTranslations({ locale, namespace: "labs" });
  const td = await getTranslations({ locale, namespace: "diagram" });
  const texts = diagramTexts(locale, (kind) => t(`nodeKind.${kind}`));
  const resolved = resolveArchitecture(architecture, locale);
  const wide = layoutArchitecture(resolved, texts, DIAGRAM_PRESETS.wide);
  const column = layoutArchitecture(resolved, texts, DIAGRAM_PRESETS.column);
  const phone = layoutArchitecture(resolved, texts, DIAGRAM_PRESETS.phone);
  const useWide = wide.width <= (breakout ? WIDE_LIMIT.breakout : WIDE_LIMIT.column);

  const summary = diagramSummary(resolved, { flow: (from, to) => td("flow", { from, to }), async: td("async"), summary: (count, flows) => td("summary", { count, flows }) });
  const breaks = useWide && breakout;

  return (
    <div
      className={`not-prose card p-4 sm:p-6${breaks ? " arch-break" : ""}`}
      style={breaks ? ({ "--arch-w": `${wide.width + CARD_CHROME}px` } as CSSProperties) : undefined}
      role="img"
      aria-label={summary}
    >
      {useWide && <DiagramSvg layout={wide} className="hidden min-[1100px]:block" />}
      <DiagramSvg layout={column} className={useWide ? "hidden sm:max-[1100px]:block" : "hidden sm:block"} />
      <DiagramSvg layout={phone} className="block sm:hidden" />
    </div>
  );
}

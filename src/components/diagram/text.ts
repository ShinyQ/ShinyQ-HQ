import type { Architecture, Locale } from "@/content/schema";
import type { DiagramNode, DiagramText } from "./layout";

/** Node texts for `layoutArchitecture`: the kind label upper-cased for the locale, the label and the localized sublabel. */
export function diagramTexts(locale: Locale, kindLabel: (kind: DiagramNode["kind"]) => string): (node: DiagramNode) => DiagramText {
  return (n) => ({ kind: kindLabel(n.kind).toLocaleUpperCase(locale), label: n.label, sublabel: n.sublabel?.[locale] });
}

/** The figure's text alternative: its node count and every connection with its label and "async". */
export function diagramSummary(
  architecture: Architecture,
  words: { flow: (from: string, to: string) => string; async: string; summary: (count: number, flows: string) => string },
): string {
  const byId = new Map(architecture.nodes.map((n) => [n.id, n.label]));
  const flows = architecture.edges.map((e) => [words.flow(byId.get(e.from)!, byId.get(e.to)!), e.label, e.async ? words.async : undefined].filter(Boolean).join(", ")).join("; ");
  return words.summary(architecture.nodes.length, `${flows}.`);
}

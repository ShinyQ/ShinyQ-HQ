import type { Architecture, Locale } from "@/content/schema";
import type { DiagramNode, DiagramText } from "./layout";

type AuthoredLabel = Architecture["nodes"][number]["label"];
export type ResolvedArchitecture = Omit<Architecture, "nodes" | "edges"> & {
  nodes: (Omit<Architecture["nodes"][number], "label"> & { label: string })[];
  edges: (Omit<Architecture["edges"][number], "label"> & { label?: string })[];
};

function labelFor(value: AuthoredLabel, locale: Locale): string {
  return typeof value === "string" ? value : value[locale];
}

export function resolveArchitecture(graph: Architecture, locale: Locale): ResolvedArchitecture {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => ({ ...node, label: labelFor(node.label, locale) })),
    edges: graph.edges.map(({ label, ...edge }) => label === undefined ? edge : { ...edge, label: labelFor(label, locale) }),
  };
}

/** Node texts for `layoutArchitecture`: the kind label upper-cased for the locale, the label and the localized sublabel. */
export function diagramTexts(locale: Locale, kindLabel: (kind: DiagramNode["kind"]) => string): (node: DiagramNode) => DiagramText {
  return (n) => ({ kind: kindLabel(n.kind).toLocaleUpperCase(locale), label: n.label, sublabel: n.sublabel?.[locale] });
}

/** The figure's text alternative: its node count and every connection with its label and "async". */
export function diagramSummary(
  architecture: ResolvedArchitecture,
  words: { flow: (from: string, to: string) => string; async: string; summary: (count: number, flows: string) => string },
): string {
  const byId = new Map(architecture.nodes.map((n) => [n.id, n.label]));
  const flows = architecture.edges.map((e) => [words.flow(byId.get(e.from)!, byId.get(e.to)!), e.label, e.async ? words.async : undefined].filter(Boolean).join(", ")).join("; ");
  return words.summary(architecture.nodes.length, `${flows}.`);
}

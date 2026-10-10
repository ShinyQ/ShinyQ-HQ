import { getPods, getTimelineEntryById } from "../load";
import type { Locale, Pod, Wing } from "../schema";
import { clientLabel } from "../selectors";
import { formatPeriod } from "@/lib/format";
import { chain, galleryOf, messages, roomId, stackItems } from "./shared";
import type { RoomArchitecture, RoomView } from "./types";

const WING_ACCENT: Record<Wing, "cyan" | "violet"> = { software: "cyan", ai: "violet" };

function architectureOf(pod: Pod, locale: Locale): RoomArchitecture | undefined {
  if (!pod.architecture) return undefined;
  return {
    nodes: pod.architecture.nodes.map((n) => ({ id: n.id, label: n.label, sublabel: n.sublabel?.[locale], layer: n.layer, row: n.row, kind: n.kind })),
    edges: pod.architecture.edges.map((e) => ({ from: e.from, to: e.to, label: e.label, async: e.async })),
  };
}

export function podView(pod: Pod, locale: Locale): RoomView {
  const m = messages(locale);
  const entry = pod.timelineRef ? getTimelineEntryById(pod.timelineRef) : undefined;
  const architecture = architectureOf(pod, locale);
  return {
    id: roomId("L3", pod.slug),
    floor: "L3",
    kind: "pod",
    code: `L3:${pod.slug}`,
    title: pod.title[locale],
    subtitle: pod.tagline[locale],
    meta: [pod.role[locale], formatPeriod(pod.period.start, pod.period.end, locale), ...(pod.client ? [clientLabel(pod.client, locale)!] : [])],
    badges: [
      { label: m.common.wing[pod.wing], accent: WING_ACCENT[pod.wing] },
      { label: m.common.tier[pod.tier], accent: pod.accent },
    ],
    accent: pod.accent,
    variant: "tabs",
    sections: [
      { title: m.labs.problem, body: pod.problem[locale] },
      { title: m.labs.approach, bullets: pod.approach.map((a) => a[locale]) },
    ],
    metrics: pod.results.map((r) => ({ value: r.value, label: r.label[locale], context: r.context[locale], confidence: r.confidence })),
    architecture,
    stack: stackItems(pod.stack),
    gallery: galleryOf(pod.assets, locale),
    page: `/labs/${pod.slug}`,
    link: entry ? { room: roomId("L2", entry.slug), label: m.drawer.seeOnL2 } : undefined,
    hologram: pod.tier === "hero" && (architecture?.nodes.length ?? 0) >= 3,
    tabs: architecture ? ["overview", "architecture", "results", "stack"] : ["overview", "results", "stack"],
  };
}

/** L3 Labs: one tabbed view per pod; prev/next walk the wing in its display order. */
export function buildLabsViews(locale: Locale): RoomView[] {
  return (["software", "ai"] as const).flatMap((wing) => chain(getPods(wing).map((pod) => podView(pod, locale))));
}

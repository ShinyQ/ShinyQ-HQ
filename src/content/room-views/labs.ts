import { buildLabsLayout } from "@/experience/floors/labs/layout";
import { REACTOR_ROOM, ringById } from "@/experience/floors/labs/techReactor";
import { labPods } from "../experience";
import { getPods, getTechIndex, getTimelineEntryById } from "../load";
import { getTechLogo } from "../tech";
import type { Locale, Pod, Wing } from "../schema";
import { clientLabel, podLiveLink } from "../selectors";
import { formatPeriod } from "@/lib/format";
import { chain, galleryOf, messages, roomId, single, stackItems } from "./shared";
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
    metrics: pod.results.map((r) => ({ value: r.value, label: r.label[locale], context: r.context?.[locale] })),
    architecture,
    stack: stackItems(pod.stack),
    gallery: galleryOf(pod.assets, locale),
    page: `/labs/${pod.slug}`,
    live: podLiveLink(pod)?.href,
    link: entry ? { room: roomId("L2", entry.slug), label: m.drawer.seeOnL2 } : undefined,
    hologram: pod.tier === "hero" && (architecture?.nodes.length ?? 0) >= 3,
    tabs: architecture ? ["overview", "architecture", "results", "stack"] : ["overview", "results", "stack"],
  };
}

/** L3 Tech Reactor: every ring with its techs (by project count), and the pods they point to. */
export function reactorView(locale: Locale): RoomView {
  const m = messages(locale);
  const index = getTechIndex();
  const docked = new Set(buildLabsLayout(labPods(locale)).placed.map((p) => p.pod.slug));
  const pods = Object.fromEntries(getPods().map((p) => [p.slug, { title: p.title[locale], wing: m.common.wing[p.wing], docked: docked.has(p.slug) }]));
  return single({
    id: REACTOR_ROOM,
    kind: "reactor",
    title: m.labs.reactor.title,
    subtitle: m.labs.reactor.subtitle,
    accent: "violet",
    page: "/labs#all-projects",
    reactor: {
      rings: index.rings.map((ring) => ({
        id: ring.id,
        label: m.labs.reactor.rings[ring.id],
        accent: ringById(ring.id).accent,
        techs: ring.techs.map((t) => {
          const logo = getTechLogo(t.name);
          return { slug: t.slug, name: t.name, ...(logo ? { logo: logo.src } : {}), pods: t.pods };
        }),
      })),
      pods,
    },
  });
}

/** L3 Labs: one tabbed view per pod; prev/next walk the wing in its display order; then the Tech Reactor. */
export function buildLabsViews(locale: Locale): RoomView[] {
  return [...(["software", "ai"] as const).flatMap((wing) => chain(getPods(wing).map((pod) => podView(pod, locale)))), reactorView(locale)];
}

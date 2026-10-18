import { buildLabsLayout, LABS_WINGS } from "@/experience/floors/labs/layout";
import { OPS_ROOM } from "@/experience/floors/labs/opsHash";
import { REACTOR_ROOM, ringById } from "@/experience/floors/labs/techReactor";
import { labPods } from "../experience";
import { getLibrary, getPod, getPods, getProduction, getTechIndex, getTimelineEntryById } from "../load";
import { getTechLogo } from "../tech";
import type { Locale, Pod } from "../schema";
import { clientLabel, headlineResults, podLiveLink, podPublications, publicationDate, repoName } from "../selectors";
import { WING_ACCENT } from "@/lib/accent";
import { formatPeriod } from "@/lib/format";
import { resolveArchitecture } from "@/components/diagram/text";
import { chain, galleryOf, linkLogo, messages, roomId, single, stackItems } from "./shared";
import type { RoomArchitecture, RoomLinkItem, RoomSection, RoomView } from "./types";


function architectureOf(pod: Pod, locale: Locale): RoomArchitecture | undefined {
  if (!pod.architecture) return undefined;
  const architecture = resolveArchitecture(pod.architecture, locale);
  return {
    nodes: architecture.nodes.map((n) => ({ id: n.id, label: n.label, sublabel: n.sublabel?.[locale], layer: n.layer, row: n.row, kind: n.kind })),
    edges: architecture.edges.map((e) => ({ from: e.from, to: e.to, label: e.label, async: e.async })),
  };
}

/** "Code and research": the pod's GitHub repositories, then the papers, thesis and models it produced (all open in a new tab). */
function codeResearch(pod: Pod, locale: Locale): RoomSection | null {
  const m = messages(locale);
  const items: RoomLinkItem[] = [
    ...(pod.repos ?? []).map((url) => ({ title: repoName(url), ...linkLogo("GitHub"), meta: "GitHub", href: url, external: true })),
    ...podPublications(pod, getLibrary().publications).map((pub) => ({
      title: pub.title,
      meta: [m.library.kind[pub.kind], pub.venue, publicationDate(pub, locale)].filter(Boolean).join(" · "),
      href: pub.doi ? `https://doi.org/${pub.doi}` : pub.url,
      external: true,
    })),
  ];
  return items.length ? { title: m.labs.codeResearch, items } : null;
}

export function podView(pod: Pod, locale: Locale): RoomView {
  const m = messages(locale);
  const entry = pod.timelineRef ? getTimelineEntryById(pod.timelineRef) : undefined;
  const architecture = architectureOf(pod, locale);
  const top = new Set(headlineResults(pod.results));
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
      ...[codeResearch(pod, locale)].filter((x): x is RoomSection => x !== null),
    ],
    metrics: pod.results.map((r) => ({
      value: r.value,
      label: r.label[locale],
      context: r.context?.[locale],
      ...(top.has(r) ? { headline: true as const } : {}),
    })),
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

/** L3 Ops Control Room: "How I run AI in production", its proof tiles, case studies, dashboard and alert excerpt. */
export function opsView(locale: Locale): RoomView {
  const m = messages(locale);
  const production = getProduction();
  return single({
    id: OPS_ROOM,
    kind: "ops",
    title: production.title[locale],
    meta: [m.hud.rooms.ops],
    accent: "green",
    page: "/contact#production",
    metrics: production.tiles.map((t) => ({ value: t.value[locale], label: t.label[locale], context: t.detail[locale] })),
    cards: production.caseStudies.flatMap((slug) => {
      const pod = getPod(slug);
      return pod ? [{ room: roomId("L3", slug), title: pod.title[locale], subtitle: pod.tagline[locale], group: m.common.wing[pod.wing] }] : [];
    }),
    gallery: production.dashboard ? galleryOf([production.dashboard], locale) : [],
    ops: {
      intro: production.intro[locale],
      points: production.points.map((p) => ({ lead: p.lead[locale], text: p.text[locale] })),
      outro: production.outro[locale],
      ...(production.alertExcerpt ? { excerpt: { caption: production.alertExcerpt.caption[locale], code: production.alertExcerpt.code } } : {}),
    },
  });
}

/** L3 Labs: one tabbed view per pod; prev/next walk the wing in its display order; then the Tech Reactor and the Ops Control Room. */
export function buildLabsViews(locale: Locale): RoomView[] {
  return [...LABS_WINGS.flatMap((wing) => chain(getPods(wing).map((pod) => podView(pod, locale)))), reactorView(locale), opsView(locale)];
}

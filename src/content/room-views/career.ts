import { getContent, getPod, getTimeline } from "../load";
import type { Locale } from "../schema";
import { formatPeriod } from "@/lib/format";
import { chain, messages, roomId, single, stackItems } from "./shared";
import type { RoomView } from "./types";

/** L2 Career Archive (baseline, owned by Phase 3): one single-pane view per entry plus the Workshop annex. */
export function buildCareerViews(locale: Locale): RoomView[] {
  const m = messages(locale);
  const content = getContent();
  const entries = getTimeline().map((entry) => {
    const pod = entry.podRef ? getPod(entry.podRef) : undefined;
    return single({
      id: roomId("L2", entry.slug),
      kind: "career",
      title: entry.role[locale],
      subtitle: entry.org,
      meta: [formatPeriod(entry.start, entry.end, locale), m.common.type[entry.type]],
      badges: [{ label: m.common.type[entry.type], accent: "amber" }],
      accent: "amber",
      sections: [
        { body: entry.summary[locale] },
        ...(entry.highlights.length ? [{ title: m.common.highlights, bullets: entry.highlights.map((h) => h[locale]) }] : []),
      ],
      stack: stackItems(entry.stack),
      page: `/journey/${entry.slug}`,
      link: pod ? { room: roomId("L3", pod.slug), label: m.drawer.seeOnL3 } : undefined,
    });
  });
  const workshop = single({
    id: roomId("L2", "workshop"),
    kind: "workshop",
    title: m.hud.rooms.workshop,
    subtitle: m.journey.workshopIntro,
    accent: "amber",
    sections: [
      {
        title: m.drawer.rooms.sideProjects,
        items: content.sideProjects.map((p) => ({
          title: p.title,
          meta: [p.summary[locale], p.year ? String(p.year) : ""].filter(Boolean).join(" · "),
          href: p.url ?? p.repo,
          external: Boolean(p.url ?? p.repo),
        })),
      },
      {
        title: m.drawer.rooms.repos,
        items: content.publicRepos.map((r) => ({ title: r.name, meta: `${r.description[locale]} · ${r.language}`, href: r.url, external: true })),
      },
    ],
    page: "/journey#workshop",
  });
  return [...chain(entries), workshop];
}

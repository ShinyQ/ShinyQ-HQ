import { getAwards, getContent, getLibrary, getPod, getPods, getTimeline } from "../load";
import type { Locale, Pod, TimelineEntry } from "../schema";
import { FIRST_CORRIDOR_YEAR } from "../selectors";
import { formatPeriod } from "@/lib/format";
import { repoRoom, repoSlug, sideProjectRoom } from "../workshop";
import { chain, fill, galleryOf, messages, roomId, single, stackItems } from "./shared";
import type { RoomImage, RoomView } from "./types";

const corridorYear = (date: string) => Math.max(FIRST_CORRIDOR_YEAR, Number(date.slice(0, 4)));
const CAREER_GALLERY_MAX = 12;

/** All images of the entry's only pod, or one cover per pod when several pods came from this entry. */
function careerGallery(entry: TimelineEntry, locale: Locale): RoomImage[] {
  const linked = entry.podRef ? getPod(entry.podRef) : undefined;
  const pods = [...new Set([linked, ...getPods().filter((p) => p.timelineRef === entry.id)])].filter((p) => p && p.assets.length > 0) as Pod[];
  const assets = pods.length === 1 ? pods[0].assets : pods.map((p) => p.assets[0]);
  return galleryOf(assets, locale).slice(0, CAREER_GALLERY_MAX);
}

const hostOf = (url: string) => new URL(url).host;

/**
 * L2 Career Archive (Phase 3): one single-pane view per entry (trophy cases list that year's placings),
 * the Workshop overview, and one view per Workshop bench (side project) and skyline bar (public repo).
 */
export function buildCareerViews(locale: Locale): RoomView[] {
  const m = messages(locale);
  const content = getContent();
  const awards = getAwards();
  const entries = getTimeline().map((entry) => {
    const pod = entry.podRef ? getPod(entry.podRef) : undefined;
    const year = corridorYear(entry.start);
    const placings =
      entry.type === "award"
        ? awards
            .filter((a) => corridorYear(a.date) === year)
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((a) => ({ title: a.title, meta: [a.placement[locale], a.organizer, formatPeriod(a.date, a.date, locale)].filter(Boolean).join(" · ") }))
        : [];
    return single({
      id: roomId("L2", entry.slug),
      kind: "career",
      title: entry.role[locale],
      subtitle: entry.org,
      logo: entry.logo ? { src: entry.logo.src, alt: entry.logo.alt[locale] } : undefined,
      meta: [formatPeriod(entry.start, entry.end, locale), m.common.type[entry.type], ...(year > Number(entry.start.slice(0, 4)) ? [m.journey.prologue] : [])],
      badges: [{ label: m.common.type[entry.type], accent: "amber", type: entry.type }],
      accent: "amber",
      sections: [
        { body: entry.summary[locale] },
        ...(entry.highlights.length ? [{ title: m.common.highlights, bullets: entry.highlights.map((h) => h[locale]) }] : []),
        ...(placings.length ? [{ title: m.drawer.rooms.placings, items: placings }] : []),
      ],
      stack: stackItems(entry.stack),
      gallery: careerGallery(entry, locale),
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
      {
        title: m.drawer.rooms.models,
        items: getLibrary()
          .publications.filter((p) => p.kind === "model")
          .map((p) => ({ title: p.title, meta: String(p.year), href: p.url, external: Boolean(p.url) })),
      },
    ],
    page: "/journey#workshop",
  });
  const benches = content.sideProjects.map((p) =>
    single({
      id: sideProjectRoom(p.id),
      kind: "workshop",
      title: p.title,
      subtitle: p.summary[locale],
      meta: [m.drawer.rooms.sideProject, ...(p.year ? [String(p.year)] : [])],
      badges: [{ label: m.drawer.rooms.sideProject, accent: "amber" }],
      accent: "amber",
      sections: [
        {
          items: [
            ...(p.url ? [{ title: m.drawer.rooms.liveDemo, meta: hostOf(p.url), href: p.url, external: true }] : []),
            ...(p.repo ? [{ title: m.drawer.rooms.repository, meta: hostOf(p.repo), href: p.repo, external: true }] : []),
          ],
        },
      ].filter((section) => section.items.length > 0),
      stack: stackItems(p.stack),
      page: "/journey#workshop",
      external: p.url ?? p.repo,
      externalLabel: p.url ? m.drawer.rooms.openProject : p.repo ? m.drawer.rooms.viewRepo : undefined,
    }),
  );
  const repos = content.publicRepos.map((r) =>
    single({
      id: repoRoom(repoSlug(r.name)),
      kind: "workshop",
      title: r.name,
      subtitle: r.description[locale],
      meta: [r.language, r.stars === 1 ? m.drawer.rooms.starOne : fill(m.drawer.rooms.stars, { count: String(r.stars) })],
      badges: [{ label: m.drawer.rooms.repository, accent: "cyan" }],
      accent: "cyan",
      page: "/journey#workshop",
      external: r.url,
      externalLabel: m.drawer.rooms.viewRepo,
    }),
  );
  return [...chain(entries), workshop, ...chain(benches), ...chain(repos)];
}

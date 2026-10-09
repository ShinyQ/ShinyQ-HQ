import { groupEntriesByYear, sortPods } from "@/content/selectors";
import type { DrawerTab, FloorId, LocalizedText, RoomId, SiteContent, Tier, Wing } from "@/content/schema";

export type RoomKind = "lobby" | "career" | "workshop" | "pod" | "post" | "shelf" | "roof";

/** One addressable room. Serializable: built on the server and passed to client HUD components. */
export interface RoomInfo {
  id: RoomId;
  floor: FloorId;
  slug: string;
  kind: RoomKind;
  title: LocalizedText;
  subtitle?: LocalizedText;
  /** Extra search terms: stack, org, client, tags, years. */
  keywords: string[];
  /** Locale-less route that shows the room itself ("open" on the static tier). */
  path: string;
  /** Locale-less route that shows the room in its floor context ("drive" on the static tier). */
  floorPath: string;
  /** Posts hosted elsewhere (Medium). */
  external?: string;
  tier?: Tier;
  wing?: Wing;
  year?: number;
  /** Relative chance in the `surprise` mission; 0 never picks it. */
  surpriseWeight: number;
}

export interface YearInfo {
  year: number;
  /** First career room of the year: where `drive` takes the rover. */
  room: RoomId;
  path: string;
  keywords: string[];
}

/** UI labels for structural rooms that have no content title (they come from `messages/*.json` `hud.rooms`). */
export type StructuralRoom = "profile" | "stats" | "skills" | "certifications" | "workshop" | "publications" | "talks" | "contact" | "cv";
export type StructuralLabels = Record<StructuralRoom, LocalizedText>;

export const FLOOR_PATHS: Record<FloorId, string> = {
  L1: "/",
  L2: "/journey",
  L3: "/labs",
  L4: "/library",
  RF: "/contact",
};

export const FLOOR_ORDER: readonly FloorId[] = ["RF", "L4", "L3", "L2", "L1"];

const SURPRISE_WEIGHT: Record<Tier, number> = { hero: 6, featured: 2, listed: 1 };

const TAB_ANCHOR: Partial<Record<DrawerTab, string>> = {
  architecture: "#architecture",
  results: "#results",
  stack: "#stack",
};

const both = (value: string): LocalizedText => ({ en: value, id: value });
const yearsOf = (start: string, end: string) => {
  const from = Number(start.slice(0, 4));
  const to = end === "present" ? new Date().getFullYear() : Number(end.slice(0, 4));
  return Array.from({ length: Math.max(1, to - from + 1) }, (_, i) => String(from + i));
};

export function floorOf(room: RoomId): FloorId {
  return room.slice(0, room.indexOf(":")) as FloorId;
}

export function buildRoomCatalog(content: SiteContent, labels: StructuralLabels): RoomInfo[] {
  const rooms: RoomInfo[] = [];
  const add = (room: Omit<RoomInfo, "id"> & { id?: RoomId }) =>
    rooms.push({ ...room, id: room.id ?? (`${room.floor}:${room.slug}` as RoomId) });

  // L1 Lobby
  add({ floor: "L1", slug: "profile", kind: "lobby", title: labels.profile, subtitle: content.profile.headline, keywords: [content.profile.name, content.profile.handle], path: "/", floorPath: "/", surpriseWeight: 0 });
  add({ floor: "L1", slug: "stats", kind: "lobby", title: labels.stats, keywords: content.stats.map((s) => s.label.en), path: "/#stats", floorPath: "/#stats", surpriseWeight: 0 });
  add({ floor: "L1", slug: "skills", kind: "lobby", title: labels.skills, keywords: content.skills.flatMap((g) => g.items), path: "/#skills", floorPath: "/#skills", surpriseWeight: 0 });
  add({ floor: "L1", slug: "certifications", kind: "lobby", title: labels.certifications, keywords: content.certifications.flatMap((c) => [c.name, c.issuer, c.code ?? ""]).filter(Boolean), path: "/#certifications", floorPath: "/#certifications", surpriseWeight: 0 });

  // L2 Career Archive
  for (const { year, entries } of groupEntriesByYear(content.floors.careerArchive.entries)) {
    for (const entry of entries) {
      add({
        floor: "L2",
        slug: entry.slug,
        kind: "career",
        title: entry.role,
        subtitle: both(entry.org),
        keywords: [entry.org, ...entry.stack, entry.type, entry.discipline, ...yearsOf(entry.start, entry.end)],
        path: `/journey/${entry.slug}`,
        floorPath: `/journey#y${year}`,
        year,
        surpriseWeight: entry.type === "job" || entry.type === "freelance" ? 1 : 0.5,
      });
    }
  }
  add({ floor: "L2", slug: "workshop", kind: "workshop", title: labels.workshop, keywords: [...content.sideProjects.map((p) => p.title), ...content.publicRepos.map((r) => r.name)], path: "/journey#workshop", floorPath: "/journey#workshop", surpriseWeight: 0.5 });

  // L3 Labs
  for (const pod of sortPods(content.floors.labs.pods)) {
    add({
      floor: "L3",
      slug: pod.slug,
      kind: "pod",
      title: pod.title,
      subtitle: pod.tagline,
      keywords: [...pod.stack, pod.client ?? "", pod.wing, ...yearsOf(pod.period.start, pod.period.end)].filter(Boolean),
      path: `/labs/${pod.slug}`,
      floorPath: "/labs",
      tier: pod.tier,
      wing: pod.wing,
      year: Number(pod.period.start.slice(0, 4)),
      surpriseWeight: SURPRISE_WEIGHT[pod.tier],
    });
  }

  // L4 Library
  const library = content.floors.library;
  for (const post of [...library.posts].sort((a, b) => b.date.localeCompare(a.date))) {
    add({
      floor: "L4",
      slug: post.slug,
      kind: "post",
      title: post.title,
      subtitle: post.excerpt,
      keywords: [...post.tags, post.date.slice(0, 4)],
      path: post.url ? "/library#posts" : `/blog/${post.slug}`,
      floorPath: "/library#posts",
      external: post.url,
      year: Number(post.date.slice(0, 4)),
      surpriseWeight: post.url ? 0 : 1,
    });
  }
  add({ floor: "L4", slug: "publications", kind: "shelf", title: labels.publications, keywords: library.publications.flatMap((p) => [p.title, p.kind, String(p.year)]), path: "/library#publications", floorPath: "/library#publications", surpriseWeight: 0 });
  add({ floor: "L4", slug: "talks", kind: "shelf", title: labels.talks, keywords: library.talks.flatMap((t) => [t.title.en, t.title.id, t.event]), path: "/library#talks", floorPath: "/library#talks", surpriseWeight: 0 });

  // RF Roof
  add({ floor: "RF", slug: "contact", kind: "roof", title: labels.contact, subtitle: content.floors.roof.availability, keywords: ["email", "linkedin", "github", "hire"], path: "/contact", floorPath: "/contact", surpriseWeight: 0.5 });
  add({ floor: "RF", slug: "cv", kind: "roof", title: labels.cv, keywords: ["cv", "resume", "pdf"], path: "/cv", floorPath: "/contact#cv", surpriseWeight: 0 });

  return rooms;
}

export function buildYears(content: SiteContent): YearInfo[] {
  return groupEntriesByYear(content.floors.careerArchive.entries).map(({ year, entries }) => ({
    year,
    room: `L2:${entries[0].slug}` as RoomId,
    path: `/journey#y${year}`,
    keywords: [...new Set(entries.map((e) => e.org))],
  }));
}

/** Locale-less route that opens a room on a tab (static tier). */
export function roomPath(room: RoomInfo, tab?: DrawerTab): string {
  const anchor = tab && room.kind === "pod" ? (TAB_ANCHOR[tab] ?? "") : "";
  return `${room.path}${anchor}`;
}

/** Adds the locale prefix to a locale-less route ("/" becomes "/en"). */
export function localize(locale: string, path: string): string {
  if (path === "/") return `/${locale}`;
  if (path.startsWith("/#")) return `/${locale}${path.slice(1)}`;
  return `/${locale}${path}`;
}

/** Finds the room whose own page is `pathname` (locale prefix and hash already removed). */
export function roomFromPath(pathname: string, rooms: readonly RoomInfo[]): RoomInfo | undefined {
  const clean = pathname.replace(/\/+$/, "") || "/";
  return rooms.find((room) => !room.path.includes("#") && room.path === clean);
}

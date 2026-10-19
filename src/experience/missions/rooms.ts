import { pickFeaturedPods } from "@/content/pageview";
import { clientKeywords, groupEntriesByYear, isResearch, orderPods } from "@/content/selectors";
import type { DrawerTab, FloorId, LocalizedText, RoomId, SiteContent, Tier, Wing } from "@/content/schema";
import { TOPICS } from "@/content/topic-map";

export type RoomKind = "lobby" | "highlights" | "career" | "workshop" | "pod" | "reactor" | "post" | "shelf" | "research" | "topics" | "roof" | "visits" | "ops" | "engine" | "office";

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
export type StructuralRoom =
  | "profile"
  | "stats"
  | "skills"
  | "certifications"
  | "workshop"
  | "publications"
  | "talks"
  | "contact"
  | "cv"
  | "research"
  | "highlightsAbout"
  | "highlightsProjects"
  | "highlightsExperience"
  | "highlightsContact"
  | "reactor"
  | "topics"
  | "visits"
  | "ops"
  | "office";
export type StructuralLabels = Record<StructuralRoom, LocalizedText>;

export const FLOOR_PATHS: Record<FloorId, string> = {
  B1: "/build",
  L1: "/",
  L2: "/journey",
  L3: "/labs",
  L4: "/library",
  RF: "/contact",
};

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
  // L1 Highlights Hall: four stations behind the certification wall. The static tier shows the landing's matching section.
  const featured = pickFeaturedPods(orderPods(content.floors.labs.pods));
  const hall = ["highlights", "sorotan", "summary", "ringkasan"];
  add({ floor: "L1", slug: "highlights-about", kind: "highlights", title: labels.highlightsAbout, subtitle: content.profile.headline, keywords: [...hall, "about", "tentang", content.profile.name], path: "/#intro", floorPath: "/#intro", surpriseWeight: 0 });
  add({ floor: "L1", slug: "highlights-projects", kind: "highlights", title: labels.highlightsProjects, keywords: [...hall, "top projects", "proyek", ...featured.map((p) => p.title.en)], path: "/#work", floorPath: "/#work", surpriseWeight: 0 });
  add({ floor: "L1", slug: "highlights-experience", kind: "highlights", title: labels.highlightsExperience, keywords: [...hall, "experience", "pengalaman", "employment", "pekerjaan", "freelance"], path: "/#journey", floorPath: "/#journey", surpriseWeight: 0 });
  add({ floor: "L1", slug: "highlights-contact", kind: "highlights", title: labels.highlightsContact, subtitle: content.floors.roof.availability, keywords: [...hall, "contact", "kontak", "email", "cv"], path: "/#contact", floorPath: "/#contact", surpriseWeight: 0 });

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
  for (const pod of orderPods(content.floors.labs.pods)) {
    add({
      floor: "L3",
      slug: pod.slug,
      kind: "pod",
      title: pod.title,
      subtitle: pod.tagline,
      keywords: [...pod.stack, ...clientKeywords(pod.client), pod.wing, ...yearsOf(pod.period.start, pod.period.end)].filter(Boolean),
      path: `/labs/${pod.slug}`,
      floorPath: "/labs",
      tier: pod.tier,
      wing: pod.wing,
      year: Number(pod.period.start.slice(0, 4)),
      surpriseWeight: SURPRISE_WEIGHT[pod.tier],
    });
  }

  // L3 Tech Reactor: the reactor core as a project filter (the static tier shows the Work page and its stack filter).
  add({ floor: "L3", slug: "reactor", kind: "reactor", title: labels.reactor, keywords: ["tech reactor", "reaktor", "stack", "tech", "teknologi", "filter", "AI and LLM", "Azure", "Backend", "Frontend", "Data", "DevOps"], path: "/labs#all-projects", floorPath: "/labs#all-projects", surpriseWeight: 0 });

  // L3 Ops Control Room (owner approved 2026-10-14): "How I run AI in production"; the Classic site shows it on the About page.
  add({
    floor: "L3",
    slug: "ops",
    kind: "ops",
    title: labels.ops,
    subtitle: content.production.title,
    keywords: ["observability", "observabilitas", "monitoring", "telemetry", "telemetri", "OpenTelemetry", "Grafana", "Prometheus", "Application Insights", "Azure Monitor", "alerts", "alert", "Bicep", "production", "ops", "SRE"],
    path: "/contact#production",
    floorPath: "/contact#production",
    surpriseWeight: 0,
  });

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
  const research = library.publications.filter((p) => isResearch(p.kind));
  add({
    floor: "L4",
    slug: "research",
    kind: "research",
    title: labels.research,
    keywords: ["research", "riset", "paper", "publication", "Google Scholar", "IEEE", ...research.flatMap((p) => [p.title, p.kind, String(p.year), p.venue ?? "", p.publisher ?? "", p.doi ?? ""])].filter(Boolean),
    path: "/library#research",
    floorPath: "/library#research",
    surpriseWeight: 0.5,
  });
  add({ floor: "L4", slug: "publications", kind: "shelf", title: labels.publications, keywords: library.publications.filter((p) => !isResearch(p.kind)).flatMap((p) => [p.title, p.kind, String(p.year), p.venue ?? ""]).filter(Boolean), path: "/library#publications", floorPath: "/library#publications", surpriseWeight: 0 });
  // L4 Topic Constellation: a topic filter over the writing (the static tier shows the Writing page and its topic filter).
  add({
    floor: "L4",
    slug: "topics",
    kind: "topics",
    title: labels.topics,
    keywords: ["topic constellation", "konstelasi topik", "topics", "topik", "tags", "tag", "filter", ...TOPICS.map((t) => t.replace(/-/g, " "))],
    path: "/library#topics",
    floorPath: "/library#topics",
    surpriseWeight: 0,
  });
  add({ floor: "L4", slug: "talks", kind: "shelf", title: labels.talks, keywords: library.talks.flatMap((t) => [t.title.en, t.title.id, t.event]), path: "/library#talks", floorPath: "/library#talks", surpriseWeight: 0 });

  // Visitor Observatory (public visit stats, owner decision 2026-10-14: the Lobby's south-west corner; it
  // was RF:visits before, see roomAliases.ts). The Classic site shows the stats in the Contact page's
  // "Visits" section, so both paths stay there; in 3D `/{locale}/contact#visits` opens this room on L1.
  add({
    floor: "L1",
    slug: "visits",
    kind: "visits",
    title: labels.visits,
    keywords: ["visits", "kunjungan", "stats", "statistics", "statistik", "analytics", "analitik", "traffic", "countries", "negara", "observatory", "observatorium", "globe", "lobby"],
    path: "/contact#visits",
    floorPath: "/contact#visits",
    surpriseWeight: 0,
  });

  // L1 Agent Office (owner design 2026-10-18): live AI coding agents and public GitHub activity on the south plaza.
  // Its drawers keep /{locale} (`isOfficeRoom`); the Classic home card is `#office` (Agent Office part 4).
  add({
    floor: "L1",
    slug: "office",
    kind: "office",
    title: labels.office,
    keywords: ["agent office", "kantor agen", "agents", "agen", "AI agents", "Copilot", "Claude Code", "Codex", "GitHub", "CI", "live", "mission control", "lobby"],
    path: "/#office",
    floorPath: "/#office",
    surpriseWeight: 0,
  });

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

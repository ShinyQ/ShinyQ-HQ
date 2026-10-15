import type { FloorId, RoomId, Wing } from "@/content/schema";
import { buildLabsLayout, LABS_WINGS, tourOrder } from "../floors/labs/layout";
import { experienceRows, highlightRoom, type HighlightStation } from "../floors/lobby/stations";
import { LIBRARY_ZONES, type LibraryLayout, type LibraryZone } from "../floors/library/model";
import { ROOF_STOPS } from "../floors/roof/layout";
import type { CareerData, CareerType, ExperienceData, LabPod, LibraryData } from "../types";
import type { WalkDefinition, WalkStop } from "./walk";

/**
 * Walk definitions built from the serializable 3D payload. L2 "Walk my journey" visits the career
 * rooms oldest first, then the Workshop annex; L3 "Tour my projects" visits the docked pods wing by
 * wing (`software`, then `ai`; in site order, gallery pods first, as they dock along each wing road
 * from the hub) and ends at the wing directory boards ("More projects here"); RF "Meet me" visits
 * the about board, the availability sign, the CV kiosk and the comms station.
 * Floors offer their walk only once their road ships (`WALK_FLOORS` in config.ts) or with `?walk=on`.
 */

export interface CareerWalkLabels {
  types: Record<CareerType, string>;
  workshop: string;
  workshopSub: string;
  /** Marks entries that started before 2019 and sit in the 2019 plaza, like the Page View timeline note. */
  prologue?: string;
}

export interface LabsWalkLabels {
  wings: Record<Wing, string>;
  more: string;
  moreSub: string;
}

/** Filter ids match the Page View journey chips (`?type=`). */
export const CAREER_FILTERS: readonly CareerType[] = ["job", "freelance", "education", "award", "milestone"];
export const LABS_FILTERS: readonly Wing[] = LABS_WINGS;

export function careerWalk(career: CareerData, labels: CareerWalkLabels): WalkDefinition {
  const stops: WalkStop[] = career.years.flatMap(({ year, entries }) =>
    entries.map((e) => {
      const room = `L2:${e.slug}` as RoomId;
      const subtitle = [e.prologue ? labels.prologue : null, e.org, e.period].filter(Boolean).join(" · ");
      return { id: room, to: room, room, title: e.role, subtitle, group: String(year), tags: [e.type] };
    }),
  );
  const workshop: RoomId = "L2:workshop";
  stops.push({ id: workshop, to: workshop, room: workshop, title: labels.workshop, subtitle: labels.workshopSub, tags: [...CAREER_FILTERS] });
  return { id: "journey", floor: "L2", stops, filters: CAREER_FILTERS.map((id) => ({ id, label: labels.types[id] })) };
}

/**
 * Road by road: each wing's hero and featured pods in docking order (`tourOrder`: gallery first, then
 * tier, then `order`), Product, AI, then the Data and ML spine; listed pods stay on the directory
 * boards, where the tour ends. Wings without pods are left out.
 */
export function labsWalk(pods: readonly LabPod[], labels: LabsWalkLabels, placed?: ReadonlySet<string>): WalkDefinition {
  const layout = buildLabsLayout(pods);
  const docked = placed ?? new Set(layout.placed.map((p) => p.pod.slug));
  const wings = LABS_FILTERS.filter((wing) => pods.some((p) => p.wing === wing));
  const tour = wings.flatMap((wing) => tourOrder(pods.filter((p) => p.wing === wing && docked.has(p.slug))));
  const stops: WalkStop[] = tour.map((p) => {
    const room = `L3:${p.slug}` as RoomId;
    return { id: room, to: room, room, title: p.title, group: labels.wings[p.wing], tags: [p.wing] };
  });
  for (const wing of wings) {
    stops.push({ id: `L3:directory:${wing}`, to: layout.boards[wing].stop, palette: "pods", title: labels.more, subtitle: labels.moreSub, group: labels.wings[wing], tags: [wing] });
  }
  return { id: "projects", floor: "L3", stops, filters: wings.map((id) => ({ id, label: labels.wings[id] })) };
}

export interface LibraryWalkLabels {
  /** Zone names from messages (`library.posts`, `library.research`, `library.publications`, `library.talks`). */
  zones: Record<LibraryZone, string>;
  onMedium: string;
  more: string;
  moreSub: string;
}

export const LIBRARY_FILTERS: readonly LibraryZone[] = LIBRARY_ZONES;

/**
 * L4 "Read my writing": every station in the layout's order (docked posts, then Research, Models and
 * Talks), then the archive board when older posts did not fit. Post titles come from the payload
 * (content), zone names from messages; filters list only zones that have a stop.
 */
export function libraryWalk(library: LibraryData, labels: LibraryWalkLabels, layout: Pick<LibraryLayout, "stations" | "board">): WalkDefinition {
  const posts = new Map(library.posts.map((p) => [`L4:${p.slug}`, p]));
  const stops: WalkStop[] = layout.stations.map((s) => {
    const post = posts.get(s.room);
    const badge = post ? [...post.languages].sort().map((l) => l.toUpperCase()).join("/") : "";
    const subtitle = post ? [post.date.slice(0, 4), post.url ? labels.onMedium : badge].join(" · ") : undefined;
    return { id: s.room, to: s.room, room: s.room, title: post?.title ?? labels.zones[s.zone], subtitle, group: labels.zones[s.zone], tags: [s.zone] };
  });
  if (layout.board) {
    stops.push({ id: "L4:archive", to: layout.board.stop, palette: "posts", title: labels.more, subtitle: labels.moreSub, group: labels.zones.blog, tags: ["blog"] });
  }
  const filters = LIBRARY_FILTERS.filter((zone) => stops.some((s) => s.tags?.includes(zone))).map((id) => ({ id, label: labels.zones[id] }));
  return { id: "writing", floor: "L4", stops, filters };
}

/** Query flag that turns walks on for every floor that has one (tests and owner previews). */
export const WALK_FLAG = "walk";

/** Floors with a walk offered: `ready` (config `WALK_FLOORS`), or all of them with `?walk=on`. */
export function walkFloorsEnabled(ready: readonly FloorId[], search: string): readonly FloorId[] {
  const flag = new URLSearchParams(search).get(WALK_FLAG);
  if (flag === "on") return ["L1", "L2", "L3", "L4", "RF"];
  if (flag === "off") return [];
  return ready;
}

export interface RoofWalkLabels {
  about: string;
  availability: string;
  cv: string;
  /** Subtitle of the CV stop (contact.cvIntro). */
  cvSub: string;
  contact: string;
}

/**
 * RF "Meet me": who I am (the about board), my availability (the sign on the mast), the CV kiosk,
 * then the comms station. The first two are points with nothing to open; the last two open their rooms.
 */
export function roofWalk({ roof, profile }: Pick<ExperienceData, "roof" | "profile">, labels: RoofWalkLabels): WalkDefinition {
  const stops: WalkStop[] = [
    { id: "RF:about", to: ROOF_STOPS.about, title: labels.about, subtitle: [profile.role, profile.location, roof.timezone].join(" · ") },
    { id: "RF:availability", to: ROOF_STOPS.availability, title: labels.availability, subtitle: roof.availability },
    { id: "RF:cv", to: "RF:cv", room: "RF:cv", title: labels.cv, subtitle: labels.cvSub },
    { id: "RF:contact", to: "RF:contact", room: "RF:contact", title: labels.contact, subtitle: roof.email },
  ];
  return { id: "meet", floor: "RF", stops };
}

export interface HighlightsWalkLabels {
  about: string;
  projects: string;
  experience: string;
  contact: string;
  /** Subtitle of the experience stop, e.g. "9 employment roles and 6 freelance projects, newest first". */
  counts: (employment: number, freelance: number) => string;
}

/**
 * L1 "Quick tour": the four Highlights Hall stations in order (about me, top projects, work
 * experience, contact), each opening its drawer on arrival. No filters. Started from the launcher
 * pill, Ask Rover or Cmd-K (mission `highlights`); L1 never shows the first-visit prompt.
 */
export function highlightsWalk(data: Pick<ExperienceData, "profile" | "roof" | "highlights" | "career">, labels: HighlightsWalkLabels): WalkDefinition {
  const { employment, freelance } = experienceRows(data.career);
  const stop = (station: HighlightStation, title: string, subtitle: string): WalkStop => {
    const room = highlightRoom(station);
    return { id: room, to: room, room, title, subtitle };
  };
  return {
    id: "highlights",
    floor: "L1",
    stops: [
      stop("about", labels.about, data.profile.headline),
      stop("projects", labels.projects, data.highlights.projects.map((p) => p.title).join(" · ")),
      stop("experience", labels.experience, labels.counts(employment.length, freelance.length)),
      stop("contact", labels.contact, data.roof.email),
    ],
  };
}

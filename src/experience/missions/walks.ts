import type { FloorId, RoomId, Wing } from "@/content/schema";
import { directoryStop } from "../floors/labs/layout";
import type { CareerData, CareerType, LabPod } from "../types";
import type { WalkDefinition, WalkStop } from "./walk";

/**
 * Walk definitions built from the serializable 3D payload. L2 "Walk my journey" visits the career
 * rooms oldest first, then the Workshop annex; L3 "Tour my projects" visits the placed pods in the
 * curated order (hero pods, then featured) and ends at a wing directory ("More projects here").
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
export const LABS_FILTERS: readonly Wing[] = ["software", "ai"];

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

/** Hero pods of both wings first (by `order`), then featured pods; listed pods stay in the directories. */
export function labsWalk(pods: readonly LabPod[], labels: LabsWalkLabels, placed?: ReadonlySet<string>): WalkDefinition {
  const rank = { hero: 0, featured: 1, listed: 2 } as const;
  const tour = pods
    .filter((p) => p.tier !== "listed" && (!placed || placed.has(p.slug)))
    .sort((a, b) => rank[a.tier] - rank[b.tier] || a.order - b.order || (a.wing === b.wing ? 0 : a.wing === "software" ? -1 : 1));
  const stops: WalkStop[] = tour.map((p) => {
    const room = `L3:${p.slug}` as RoomId;
    return { id: room, to: room, room, title: p.title, group: labels.wings[p.wing], tags: [p.wing] };
  });
  for (const wing of LABS_FILTERS) {
    stops.push({ id: `L3:directory:${wing}`, to: directoryStop(wing), palette: "pods", title: labels.more, subtitle: labels.moreSub, group: labels.wings[wing], tags: [wing] });
  }
  return { id: "projects", floor: "L3", stops, filters: LABS_FILTERS.map((id) => ({ id, label: labels.wings[id] })) };
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

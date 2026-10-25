import { getContent } from "./load";
import { PROLOGUE_STOP_ID, type LocalizedText, type SiteContent, type TimeTravelHighlightRef } from "./schema";
import { FIRST_CORRIDOR_YEAR, isResearch } from "./selectors";

/** Block kinds of a skyline building, bottom to top (spec section 3.2). */
export const TT_KINDS = ["roles", "study", "projects", "awards", "writing", "certs"] as const;
export type TtKind = (typeof TT_KINDS)[number];

/** The running tally under the skyline. */
export const TALLY_KEYS = ["roles", "projects", "awards", "papers", "certs"] as const;
export type TallyKey = (typeof TALLY_KEYS)[number];

export interface TtHighlight {
  kind: TimeTravelHighlightRef["kind"];
  label: LocalizedText;
  href: string;
}

export interface TtStop {
  id: string;
  year: number | null;
  anchor: string;
  caption: LocalizedText;
  counts: Record<TtKind, number>;
  size: number;
  height: number;
  tally: Record<TallyKey, { total: number; added: number }>;
  highlights: TtHighlight[];
}

interface DatedItem {
  year: number;
  kind: TtKind;
  tally?: TallyKey;
}

const yearOf = (value: string | number) => Number(String(value).slice(0, 4));

/** The stop a year belongs to: everything before the first corridor year is the prologue. */
export function stopIdOf(year: number): string {
  return year < FIRST_CORRIDOR_YEAR ? PROLOGUE_STOP_ID : String(year);
}

/** Every dated item of the dataset with its block kind and tally key. Award entries are skipped: `awards` counts them. */
function datedItems(content: SiteContent): DatedItem[] {
  const { careerArchive, labs, library } = content.floors;
  const items: DatedItem[] = [];
  for (const e of careerArchive.entries) {
    if (e.type === "job" || e.type === "freelance") items.push({ year: yearOf(e.start), kind: "roles", tally: "roles" });
    else if (e.type === "education" || e.type === "milestone") items.push({ year: yearOf(e.start), kind: "study" });
  }
  for (const p of labs.pods) items.push({ year: yearOf(p.period.start), kind: "projects", tally: "projects" });
  for (const s of content.sideProjects) if (s.year !== undefined) items.push({ year: s.year, kind: "projects", tally: "projects" });
  for (const a of content.awards) items.push({ year: yearOf(a.date), kind: "awards", tally: "awards" });
  for (const p of library.publications) items.push({ year: yearOf(p.year), kind: "writing", tally: isResearch(p.kind) ? "papers" : undefined });
  for (const t of library.talks) items.push({ year: yearOf(t.date), kind: "writing" });
  for (const p of library.posts) items.push({ year: yearOf(p.date), kind: "writing" });
  for (const c of content.certifications) items.push({ year: yearOf(c.issued), kind: "certs", tally: "certs" });
  return items;
}

/** The stop ids the dataset needs, in order: the prologue when it has items, then every year to the latest item. */
export function expectedStopIds(content: SiteContent): string[] {
  const years = datedItems(content).map((i) => i.year);
  const ids = years.some((y) => y < FIRST_CORRIDOR_YEAR) ? [PROLOGUE_STOP_ID] : [];
  for (let y = FIRST_CORRIDOR_YEAR; y <= Math.max(FIRST_CORRIDOR_YEAR, ...years); y++) ids.push(String(y));
  return ids;
}

function resolveHighlight(content: SiteContent, ref: TimeTravelHighlightRef): TtHighlight {
  const { careerArchive, labs, library } = content.floors;
  const fail = () => new Error(`Unknown time travel highlight ${ref.kind} "${ref.id}"`);
  switch (ref.kind) {
    case "entry": {
      const e = careerArchive.entries.find((x) => x.id === ref.id);
      if (!e) throw fail();
      return { kind: ref.kind, label: ref.label ?? { en: `${e.role.en}, ${e.org}`, id: `${e.role.id}, ${e.org}` }, href: `/journey/${e.slug}` };
    }
    case "pod": {
      const p = labs.pods.find((x) => x.id === ref.id);
      if (!p) throw fail();
      return { kind: ref.kind, label: ref.label ?? p.title, href: `/labs/${p.slug}` };
    }
    case "publication": {
      const p = library.publications.find((x) => x.id === ref.id);
      if (!p) throw fail();
      return { kind: ref.kind, label: ref.label ?? { en: p.title, id: p.title }, href: isResearch(p.kind) ? "/library#research" : "/library#publications" };
    }
    case "cert": {
      const c = content.certifications.find((x) => x.id === ref.id);
      if (!c) throw fail();
      return { kind: ref.kind, label: ref.label ?? { en: c.name, id: c.name }, href: "/contact#certifications" };
    }
  }
}

/** The Time Travel stops in order, with derived counts, heights and tally. Empty when the dataset has no stops. */
export function buildTimeTravel(content: SiteContent): TtStop[] {
  const records = content.floors.careerArchive.timeTravel?.stops ?? [];
  if (records.length === 0) return [];
  const items = datedItems(content);
  const inStop = (id: string) => items.filter((i) => stopIdOf(i.year) === id);
  const maxRoot = Math.sqrt(Math.max(1, ...records.map((r) => inStop(r.id).length)));
  const running = Object.fromEntries(TALLY_KEYS.map((k) => [k, 0])) as Record<TallyKey, number>;
  return records.map((record) => {
    const mine = inStop(record.id);
    const counts = Object.fromEntries(TT_KINDS.map((k) => [k, mine.filter((i) => i.kind === k).length])) as Record<TtKind, number>;
    const tally = Object.fromEntries(
      TALLY_KEYS.map((k) => {
        const added = mine.filter((i) => i.tally === k).length;
        running[k] += added;
        return [k, { total: running[k], added }];
      }),
    ) as TtStop["tally"];
    const year = record.id === PROLOGUE_STOP_ID ? null : Number(record.id);
    return {
      id: record.id,
      year,
      anchor: `y${year ?? FIRST_CORRIDOR_YEAR}`,
      caption: record.caption,
      counts,
      size: mine.length,
      height: Math.sqrt(mine.length) / maxRoot,
      tally,
      highlights: record.highlights.map((h) => resolveHighlight(content, h)),
    };
  });
}

let cached: TtStop[] | undefined;

/** The dataset's stops (server only: it reads the whole dataset). */
export function getTimeTravel(): TtStop[] {
  cached ??= buildTimeTravel(getContent());
  return cached;
}

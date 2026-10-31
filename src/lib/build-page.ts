/**
 * Pure helpers for the build story page (/[locale]/build) and the B1 Engine Room drawers
 * (`src/content/room-views/engine.ts`): they join the story text (`content/build-story.json`) with the measured
 * snapshot (`content/generated/build-facts.json`) and drop every number the snapshot does not carry. A pull request
 * in `unlinkedPrs` is shown without a link everywhere: on the timeline and on a Rejected Designs idea.
 */
import type { BuildFacts, BuildRound, BuildStory } from "@/content/build-story";
import type { Locale } from "@/content/schema";
import { formatDate } from "@/lib/format";
import { REPO_URL } from "@/lib/site";

export function prUrl(n: number): string {
  return `${REPO_URL}/pull/${n}`;
}

/** A file on the public repository's default branch. */
export function repoFileUrl(path: string): string {
  return `${REPO_URL}/blob/main/${path}`;
}

export interface TimelineRow {
  round: BuildRound;
  /** Merged pull request numbers measured for the round (empty when the snapshot has none). */
  prs: number[];
  first?: string;
  last?: string;
  /** Pull requests shown as plain text, still counted (`unlinkedPrs`: their diff shows text the site hides). */
  unlinked: number[];
  /** The open round (`prs.to` is null): still in progress. */
  open: boolean;
}

/** The story's rounds, oldest first, each with the merged pull requests and merge dates the snapshot measured. */
export function timelineRows(story: BuildStory, facts: BuildFacts): TimelineRow[] {
  const hidden = new Set(story.stations.timeline.unlinkedPrs ?? []);
  return story.stations.timeline.rounds.map((round) => {
    const measured = facts.rounds?.find((r) => r.id === round.id);
    const prs = measured?.prs ?? [];
    return { round, prs, unlinked: prs.filter((n) => hidden.has(n)), first: measured?.first, last: measured?.last, open: round.prs.to === null };
  });
}

/** "Oct 9, 2026 to Oct 10, 2026" (`join` is the translated "to"), one date when both match, undefined without dates. */
export function roundDates({ first, last }: { first?: string; last?: string }, locale: Locale, join: string): string | undefined {
  const from = first ?? last;
  const to = last ?? first;
  if (!from || !to) return undefined;
  if (from === to) return formatDate(from, locale);
  return `${formatDate(from, locale)} ${join} ${formatDate(to, locale)}`;
}

export type DashboardTileId = "mergedPrs" | "commits" | "unitFiles" | "e2eTests" | "specs" | "plans" | "floors";

export interface DashboardTile {
  id: DashboardTileId;
  value: number;
  /** The first commit date, for "commits since". */
  since?: string;
}

/**
 * Dashboard numbers in display order, only those the snapshot (and the content's floor count) carry. The budgets are
 * not here: the Gates state every one of them.
 */
export function dashboardTiles(facts: BuildFacts, floors?: number): DashboardTile[] {
  const tiles: (DashboardTile | false | undefined)[] = [
    facts.git && { id: "mergedPrs", value: facts.git.mergedPrs },
    facts.git && { id: "commits", value: facts.git.commits, since: facts.git.firstCommit },
    facts.tests && { id: "unitFiles", value: facts.tests.unitFiles },
    facts.tests?.e2e !== undefined && { id: "e2eTests", value: facts.tests.e2e },
    facts.docs && { id: "specs", value: facts.docs.specs },
    facts.docs && { id: "plans", value: facts.docs.plans },
    floors !== undefined && { id: "floors", value: floors },
  ];
  return tiles.filter((t): t is DashboardTile => Boolean(t));
}

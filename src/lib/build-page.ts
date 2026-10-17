/**
 * Pure helpers for the build story page (/[locale]/build) and, in PR 2, the B1 Engine Room drawers:
 * they join the story text (`content/build-story.json`) with the measured snapshot
 * (`content/generated/build-facts.json`) and drop every number the snapshot does not carry.
 */
import type { BuildFacts, BuildRound, BuildStory } from "@/content/build-story";
import type { Locale } from "@/content/schema";
import { formatDate } from "@/lib/format";
import { REPO_URL } from "@/lib/site";

const RANGE_JOIN: Record<Locale, string> = { en: "to", id: "hingga" };

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
  /** The open round (`prs.to` is null): still in progress. */
  open: boolean;
}

/** The story's rounds, oldest first, each with the merged pull requests and merge dates the snapshot measured. */
export function timelineRows(story: BuildStory, facts: BuildFacts): TimelineRow[] {
  return story.stations.timeline.rounds.map((round) => {
    const measured = facts.rounds?.find((r) => r.id === round.id);
    return { round, prs: measured?.prs ?? [], first: measured?.first, last: measured?.last, open: round.prs.to === null };
  });
}

/** "Oct 9, 2026 to Oct 10, 2026", one date when both match, undefined without dates. */
export function roundDates({ first, last }: { first?: string; last?: string }, locale: Locale): string | undefined {
  const from = first ?? last;
  const to = last ?? first;
  if (!from || !to) return undefined;
  if (from === to) return formatDate(from, locale);
  return `${formatDate(from, locale)} ${RANGE_JOIN[locale]} ${formatDate(to, locale)}`;
}

export type DashboardTileId = "mergedPrs" | "commits" | "unitTests" | "e2eTests" | "specs" | "plans" | "floors" | "js3dKb" | "sceneCalls" | "triangles";

export interface DashboardTile {
  id: DashboardTileId;
  value: number;
  unit?: "kb";
  /** The first commit date, for "commits since". */
  since?: string;
}

/** Dashboard numbers in display order, only those the snapshot (and the content's floor count) carry. */
export function dashboardTiles(facts: BuildFacts, floors?: number): DashboardTile[] {
  const tiles: (DashboardTile | false | undefined)[] = [
    facts.git && { id: "mergedPrs", value: facts.git.mergedPrs },
    facts.git && { id: "commits", value: facts.git.commits, since: facts.git.firstCommit },
    facts.tests?.unit !== undefined && { id: "unitTests", value: facts.tests.unit },
    facts.tests?.e2e !== undefined && { id: "e2eTests", value: facts.tests.e2e },
    facts.docs && { id: "specs", value: facts.docs.specs },
    facts.docs && { id: "plans", value: facts.docs.plans },
    floors !== undefined && { id: "floors", value: floors },
    facts.budgets && { id: "js3dKb", value: facts.budgets.js3dKb, unit: "kb" },
    facts.budgets && { id: "sceneCalls", value: facts.budgets.sceneCalls },
    facts.budgets && { id: "triangles", value: facts.budgets.triangles },
  ];
  return tiles.filter((t): t is DashboardTile => Boolean(t));
}

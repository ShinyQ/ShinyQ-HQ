import type { Locale } from "@/content/locales";
import type { OfficeActivity, OfficeAgent, OfficeGithubStatus, OfficeState } from "@/lib/office/protocol";

/** Every string the Classic office card renders, resolved on the server (no client namespace). */
export interface OfficeCardLabels {
  title: string;
  intro: string;
  loading: string;
  /** Under the loading line: what the card shows (static HTML, so a reader without JavaScript gets something). */
  loadingNote: string;
  live: string;
  /** A live snapshot older than the keep-last window (the poller stopped for idleness or the tab was hidden). */
  paused: string;
  semiLive: string;
  resting: string;
  offline: string;
  /** Offline before any snapshot: nothing to show. */
  offlineEmpty: string;
  /** The office is switched off, shown only until the section leaves the screen and hides. */
  disabled: string;
  updated: string;
  /** Offline with a kept snapshot: the time of that snapshot. */
  asOf: string;
  counts: Record<"active" | "thinking" | "waiting" | "asleep", string>;
  agents: string;
  /** The first desk row when no desk is active (every Rover asleep or no session). */
  noAgents: string;
  /** Sessions past the ten seats ("+{count, plural, ...}"), after the idle count on the summary line. */
  extra: string;
  /** The fifth desk row past five awake desks ("+{n, plural, ...}": every awake desk beyond the four shown), filled by `fill`. */
  moreDesks: string;
  /** The summary line under the desk rows: asleep and empty seats ("{n, plural, =0 ... one ... other ...}"). */
  idle: string;
  github: string;
  noGithub: string;
  today: string;
  /** `today` without the CI clause, for a day without CI runs. */
  todayNoCi: string;
  status: Record<OfficeGithubStatus, string>;
  clientProject: string;
  /** An awake desk's helpers ("{n, plural, one {# helper} other {# helpers}}"), filled by `fill`. */
  helpers: string;
  states: Record<OfficeState, string>;
  activities: Record<OfficeActivity, string>;
  agentNames: Record<OfficeAgent, string>;
}

/**
 * The card's one height in every state (five desk rows, four GitHub rows, the counts, the idle summary and today lines;
 * measured from 320 to 1440 px wide per locale: 881 px from 768, 1004 below, 1020 for an Indonesian semi-live line at
 * 320) plus about 8 px of headroom (889 px from 768, 1028 below), held from the loading line on, so neither the first
 * answer nor a later change of state moves the sections below (CLS).
 */
export const OFFICE_RESERVE: Record<Locale, string> = {
  en: "min-h-[1028px] md:min-h-[889px]",
  id: "min-h-[1028px] md:min-h-[889px]",
};

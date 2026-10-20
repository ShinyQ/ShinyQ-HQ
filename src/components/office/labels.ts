import type { OfficeActivity, OfficeAgent, OfficeGithubStatus, OfficeState } from "@/lib/office/protocol";

/** Every string the Classic office card renders, resolved on the server (no client namespace). */
export interface OfficeCardLabels {
  title: string;
  intro: string;
  loading: string;
  live: string;
  semiLive: string;
  resting: string;
  offline: string;
  /** Offline before any snapshot: nothing to show. */
  offlineEmpty: string;
  updated: string;
  counts: Record<"active" | "thinking" | "waiting" | "asleep", string>;
  agents: string;
  noAgents: string;
  extra: string;
  github: string;
  noGithub: string;
  today: string;
  /** `today` without the CI clause, for a day without CI runs. */
  todayNoCi: string;
  status: Record<OfficeGithubStatus, string>;
  clientProject: string;
  privacy: string;
  states: Record<OfficeState, string>;
  activities: Record<OfficeActivity, string>;
  agentNames: Record<OfficeAgent, string>;
}

/** `{name}` placeholders of a raw message (next-intl formatters cannot cross into a client component). */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}

/**
 * The height a busy card takes (five desks, four GitHub rows; measured at 360 to 1920 px, EN and ID), held while the
 * card loads so the first snapshot never pushes the sections below down (CLS). A quieter snapshot is shorter.
 */
export const OFFICE_RESERVE = "min-h-[1138px] md:min-h-[945px] lg:min-h-[965px] xl:min-h-[945px]";

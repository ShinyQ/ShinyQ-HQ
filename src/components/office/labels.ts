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
  updated: string;
  counts: Record<"active" | "thinking" | "waiting" | "asleep", string>;
  agents: string;
  noAgents: string;
  extra: string;
  github: string;
  noGithub: string;
  today: string;
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

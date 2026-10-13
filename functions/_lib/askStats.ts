import type { AskTag } from "../../src/ask/protocol";
import { matchSuggestion, suggestionById, type Suggestion } from "../../src/ask/suggestions";
import type { StatsTopic } from "../../src/lib/stats/protocol";

/**
 * Public visit stats: which topic a question was about (ask_events blob8) and which curated chip it was
 * (blob9). Deterministic, no model call, ids only: the question text never reaches these fields.
 */

/** Each allowlisted answer tag counts toward one stats topic (the Ask topic pills). */
export const TAG_TOPIC: Record<AskTag, StatsTopic> = {
  work: "work",
  software: "work",
  github: "work",
  security: "work",
  writing: "work",
  talks: "work",
  stats: "work",
  ai: "ai",
  voice: "ai",
  fraud: "ai",
  documents: "ai",
  agents: "ai",
  rag: "ai",
  data: "ai",
  research: "ai",
  career: "career",
  now: "career",
  education: "career",
  certifications: "career",
  awards: "career",
  skills: "career",
  contact: "contact",
  perspectives: "perspectives",
};

/** Tie order: the more specific topic wins over the broad "work". */
const PRECEDENCE: readonly StatsTopic[] = ["perspectives", "contact", "ai", "career", "work"];

/** The topic most of the answer's tags point to (ties by PRECEDENCE), or "" without tags. */
export function topicOfTags(tags: readonly AskTag[]): StatsTopic | "" {
  const votes = new Map<StatsTopic, number>();
  for (const tag of tags) {
    const topic = TAG_TOPIC[tag];
    if (topic) votes.set(topic, (votes.get(topic) ?? 0) + 1);
  }
  let best: StatsTopic | "" = "";
  let most = 0;
  for (const topic of PRECEDENCE) {
    const n = votes.get(topic) ?? 0;
    if (n > most) {
      best = topic;
      most = n;
    }
  }
  return best;
}

/**
 * The curated chip the client says it sent, only when the id exists in content/ask/suggestions.json and
 * the question is that chip's text (either language), so a forged id cannot inflate another chip.
 */
export function chipFor(question: string, chip: unknown): Suggestion | undefined {
  if (typeof chip !== "string") return undefined;
  const suggestion = suggestionById(chip);
  return suggestion && matchSuggestion(question)?.id === suggestion.id ? suggestion : undefined;
}

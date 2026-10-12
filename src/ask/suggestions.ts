/**
 * Curated Ask the HQ question pills (content/ask/suggestions.json) and the deterministic follow-up
 * picker. Pure and client-safe: no model call is ever made to suggest a question.
 */
import bank from "../../content/ask/suggestions.json";
import type { AskLocale, AskTag } from "./protocol";

export const ASK_TOPICS = ["work", "ai", "career", "contact", "perspectives"] as const;
export type AskTopic = (typeof ASK_TOPICS)[number];

export const isAskTopic = (value: unknown): value is AskTopic => typeof value === "string" && (ASK_TOPICS as readonly string[]).includes(value);

export interface Suggestion {
  id: string;
  topic: AskTopic;
  q: Record<AskLocale, string>;
  tags: AskTag[];
  followUps?: string[];
  /** Chunk ids (or `prefix*`) retrieval must return; checked in tests, not used at runtime. */
  expect?: string[];
  /** Nightly eval only: the real answer must contain one of these (live values as `{{facts.<path>}}`). */
  answer?: { any?: string[] };
}

export const SUGGESTIONS = bank.items as unknown as readonly Suggestion[];

/** Questions shown when a topic pill expands. */
export const TOPIC_SIZE = 4;
/** Follow-up pills after an answer. */
export const FOLLOW_UP_COUNT = 3;

const fold = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}%]+/gu, " ").trim();

export function suggestionById(id: string | undefined, list: readonly Suggestion[] = SUGGESTIONS): Suggestion | undefined {
  return id ? list.find((s) => s.id === id) : undefined;
}

/** The curated question with this exact text (either language), so a typed or palette question counts as asked. */
export function matchSuggestion(text: string, list: readonly Suggestion[] = SUGGESTIONS): Suggestion | undefined {
  const key = fold(text);
  if (!key) return undefined;
  return list.find((s) => fold(s.q.en) === key || fold(s.q.id) === key);
}

/** The first `size` questions of a topic that were not asked yet (bank order); all of them once every one was asked. */
export function topicQuestions(topic: AskTopic, asked: ReadonlySet<string> = new Set(), list: readonly Suggestion[] = SUGGESTIONS, size = TOPIC_SIZE): Suggestion[] {
  const inTopic = list.filter((s) => s.topic === topic);
  const fresh = inTopic.filter((s) => !asked.has(s.id));
  return (fresh.length ? fresh : inTopic).slice(0, size);
}

export interface FollowUpInput {
  /** Curated id of the question just answered, if it was one. */
  answered?: string;
  /** Tags of the answer's sources (the `done` frame). */
  tags?: readonly AskTag[];
  /** Curated ids already asked in this thread. */
  asked?: ReadonlySet<string>;
  list?: readonly Suggestion[];
  count?: number;
}

/**
 * Deterministic follow-ups, skipping questions already asked (and the one just answered):
 * 1. the answered question's own `followUps`, in order;
 * 2. questions sharing the most tags with the answer, bank order on ties;
 * 3. one question from each topic not covered yet (other than the answered one's), bank order.
 */
export function pickFollowUps({ answered, tags = [], asked = new Set(), list = SUGGESTIONS, count = FOLLOW_UP_COUNT }: FollowUpInput): Suggestion[] {
  const picked: Suggestion[] = [];
  const skip = new Set(asked);
  if (answered) skip.add(answered);
  const take = (s: Suggestion | undefined) => {
    if (!s || picked.length >= count || skip.has(s.id) || picked.includes(s)) return;
    picked.push(s);
  };

  const source = suggestionById(answered, list);
  for (const id of source?.followUps ?? []) take(suggestionById(id, list));

  if (picked.length < count && tags.length) {
    const wanted = new Set(tags);
    list
      .map((s, index) => ({ s, index, score: s.tags.filter((t) => wanted.has(t)).length }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .forEach((r) => take(r.s));
  }

  if (picked.length < count) {
    const topics = ASK_TOPICS.filter((t) => t !== source?.topic && !picked.some((p) => p.topic === t));
    for (const topic of topics) take(list.find((s) => s.topic === topic && !skip.has(s.id) && !picked.includes(s)));
  }
  return picked;
}

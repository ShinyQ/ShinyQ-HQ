/**
 * Curated Ask the HQ question pills (content/ask/suggestions.json), the seeded sampler for topic
 * expansions and the starter row, and the deterministic follow-up picker. Pure and client-safe: no
 * model call is ever made to suggest a question.
 */
import type { StatsTopic } from "@/lib/stats/protocol";
import bank from "../../content/ask/suggestions.json";
import type { AskLocale, AskTag } from "./protocol";

export const ASK_TOPICS = ["work", "ai", "career", "contact", "perspectives", "about", "site"] as const;
export type AskTopic = (typeof ASK_TOPICS)[number];

/** Public stats keep five topics: the two newer pill topics count under an existing one. */
export const STATS_TOPIC_OF: Record<AskTopic, StatsTopic> = {
  work: "work",
  ai: "ai",
  career: "career",
  contact: "contact",
  perspectives: "perspectives",
  about: "perspectives",
  site: "work",
};

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
  /** A hiring question (owner decision 2026-11-01): the Try asking row always leads with one. */
  recruiter?: boolean;
}

export const SUGGESTIONS = bank.items as unknown as readonly Suggestion[];

/** Questions shown when a topic pill expands. */
export const TOPIC_SIZE = 4;
/** Follow-up pills after an answer. */
export const FOLLOW_UP_COUNT = 3;
/** Mixed pills ("Try asking") above the topic grid. */
export const STARTER_SIZE = 3;
/** sessionStorage key of the pill sampling seed (one per page session). */
export const ASK_SEED_KEY = "hq:ask-seed";
/** Stored seed value that keeps bank order (tests inject it). */
const ORDER_SEED = "order";
const SEED_RANGE = 2 ** 32;

/** null = bank order (tests inject "order"). */
export type AskSeed = number | null;

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

/** mulberry32: a small, fast 32-bit PRNG returning floats in [0, 1). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / SEED_RANGE;
  };
}

/** FNV-1a 32-bit string hash, so each topic shuffles differently under one seed. */
function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** A copy of `items` in a permutation fixed by `seed` (Fisher-Yates). */
export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  const random = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A topic's pills: bank order without a seed, else the seed mixed with the topic's hash. */
function topicOrder(topic: AskTopic, list: readonly Suggestion[], seed: AskSeed): Suggestion[] {
  const inTopic = list.filter((s) => s.topic === topic);
  return seed === null ? inTopic : seededShuffle(inTopic, (seed ^ hashString(topic)) >>> 0);
}

/** The first `size` questions of a topic not asked yet (bank order, or sampled by `seed`); none once every one was asked. */
export function topicQuestions(topic: AskTopic, asked: ReadonlySet<string> = new Set(), list: readonly Suggestion[] = SUGGESTIONS, size = TOPIC_SIZE, seed: AskSeed = null): Suggestion[] {
  return topicOrder(topic, list, seed)
    .filter((s) => !asked.has(s.id))
    .slice(0, size);
}

/** Salt of the recruiter pill's shuffle, so it never mirrors a topic's order under the same seed. */
const RECRUITER_SALT = hashString("recruiter");

/**
 * At most `size` unasked questions from distinct topics. The row leads with an unasked `recruiter` pill (owner
 * decision 2026-11-01: a recruiter opening Ask always sees a hiring question), in seeded order; then topics in seeded
 * order, skipping the lead's topic, each topic's first pill in its seeded order.
 */
export function starterQuestions(asked: ReadonlySet<string> = new Set(), seed: AskSeed = null, list: readonly Suggestion[] = SUGGESTIONS, size = STARTER_SIZE): Suggestion[] {
  const topics = seed === null ? ASK_TOPICS : seededShuffle(ASK_TOPICS, seed);
  const recruiters = list.filter((s) => s.recruiter && !asked.has(s.id));
  const lead = (seed === null ? recruiters : seededShuffle(recruiters, (seed ^ RECRUITER_SALT) >>> 0))[0];
  const picked: Suggestion[] = lead && size > 0 ? [lead] : [];
  for (const topic of topics) {
    if (picked.length >= size) break;
    if (picked.some((s) => s.topic === topic)) continue;
    const first = topicOrder(topic, list, seed).find((s) => !asked.has(s.id));
    if (first) picked.push(first);
  }
  return picked;
}

/**
 * The page session's sampling seed from `storage` (sessionStorage): "order" keeps bank order, a stored
 * 32-bit unsigned integer is reused, anything else gets a new seed that is stored. Storage errors
 * (Safari private mode) fall back to an unstored seed.
 */
export function readAskSeed(storage?: Pick<Storage, "getItem" | "setItem"> | null, random: () => number = Math.random): AskSeed {
  let stored: string | null = null;
  try {
    stored = storage?.getItem(ASK_SEED_KEY) ?? null;
  } catch {
    stored = null;
  }
  if (stored === ORDER_SEED) return null;
  if (stored !== null && /^\d{1,10}$/.test(stored) && Number(stored) < SEED_RANGE) return Number(stored);
  const seed = Math.floor(random() * SEED_RANGE) >>> 0;
  try {
    storage?.setItem(ASK_SEED_KEY, String(seed));
  } catch {
    // Not stored: the next mount samples again.
  }
  return seed;
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

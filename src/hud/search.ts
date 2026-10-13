import type { LocalizedText, RoomId } from "@/content/schema";
import type { HudIndex } from "./index-data";
import type { PaletteActionId, PaletteEntry, PaletteGroup, PaletteSearchOptions } from "./palette-types";

const ACTION_KEYWORDS: Record<PaletteActionId, string[]> = {
  "view-cv": ["cv", "resume", "pdf", "view", "lihat", "curriculum vitae"],
  "copy-email": ["email", "contact", "mail", "copy", "salin", "kontak"],
  "toggle-language": ["language", "bahasa", "english", "indonesia", "inggris"],
  "toggle-sound": ["sound", "audio", "mute", "suara"],
  "quick-view": ["quick", "summary", "ringkas", "overview"],
  "replay-tutorial": ["tutorial", "tour", "onboarding", "help", "guide", "replay", "panduan", "bantuan", "ulang"],
  "toggle-hints": ["hints", "hint", "bubbles", "tips", "petunjuk"],
  "motion-system": ["motion", "animation", "reduced motion", "system", "default", "gerak", "animasi", "sistem"],
  "motion-full": ["motion", "animation", "full", "animate", "gerak", "animasi", "penuh"],
  "motion-reduced": ["motion", "animation", "reduce", "reduced motion", "accessibility", "gerak", "animasi", "kurangi", "dikurangi"],
};

const TECH_KEYWORDS = ["tech", "stack", "reactor", "teknologi", "reaktor"];

const RESULT_GROUPS = ["missions", "rooms", "years", "actions"] as const;
/** Same cap as the server (`ASK_MAX_QUESTION` in src/ask/protocol.ts). */
const ASK_MAX = 300;
const QUESTION_WORDS = new Set([
  "what", "who", "whom", "whose", "which", "where", "when", "why", "how", "can", "could", "does", "do", "did", "is", "are", "was", "has", "have",
  "apa", "apakah", "siapa", "mana", "dimana", "kapan", "mengapa", "kenapa", "bagaimana", "berapa", "bisakah",
]);
const DEFAULT_LIMIT = 8;
const MAX_RECENT = 3;

const FIELD_WEIGHT = { title: 3, keywords: 1.5, subtitle: 1 } as const;
/** Tiny tie breaker so projects outrank other rooms with the same match (e.g. a stack keyword). */
const KIND_BONUS: Partial<Record<NonNullable<PaletteEntry["roomKind"]>, number>> = { pod: 0.5, post: 0.25 };

export function buildPaletteEntries(
  index: Pick<HudIndex, "missions" | "rooms" | "years" | "actionLabels"> & Partial<Pick<HudIndex, "techs">>,
  actions: readonly PaletteActionId[],
): PaletteEntry[] {
  const entries: PaletteEntry[] = [];

  for (const mission of index.missions) {
    const elevator = mission.steps.find((step) => step.kind === "elevator");
    entries.push({
      key: `mission:${mission.id}`,
      group: "missions",
      title: mission.label,
      floor: elevator?.kind === "elevator" ? elevator.floor : undefined,
      keywords: [],
      target: { type: "mission", id: mission.id },
    });
  }

  for (const room of index.rooms) {
    entries.push({
      key: `room:${room.id}`,
      group: "rooms",
      title: room.title,
      subtitle: room.subtitle,
      floor: room.floor,
      keywords: room.keywords,
      roomKind: room.kind,
      target: { type: "room", id: room.id },
    });
  }

  for (const year of index.years) {
    const label = String(year.year);
    entries.push({
      key: `year:${year.year}`,
      group: "years",
      title: { en: label, id: label },
      floor: "L2",
      keywords: year.keywords,
      target: { type: "year", year: year.year, room: year.room, path: year.path },
    });
  }

  for (const id of actions) {
    entries.push({
      key: `action:${id}`,
      group: "actions",
      title: index.actionLabels[id],
      keywords: ACTION_KEYWORDS[id],
      target: { type: "action", id },
    });
  }

  // Tech Reactor rows ("Show projects using Azure OpenAI"): actions, so they only show for a query.
  for (const tech of index.techs ?? []) {
    entries.push({
      key: `tech:${tech.slug}`,
      group: "actions",
      title: tech.title,
      floor: "L3",
      keywords: [tech.name, ...TECH_KEYWORDS],
      target: { type: "tech", slug: tech.slug },
    });
  }

  return entries;
}

/** Lowercase, diacritics stripped, whitespace collapsed. */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const isWordChar = (char: string | undefined) => char !== undefined && /[\p{L}\p{N}]/u.test(char);
const isWordStart = (text: string, i: number) => i === 0 || (isWordChar(text[i]) && !isWordChar(text[i - 1]));

/** A normalized text and its word starts, computed once per palette entry instead of on every keystroke (perf report D 6.8). */
interface Prepared {
  text: string;
  starts: Uint8Array;
}

function prepare(text: string): Prepared {
  const t = normalize(text);
  const starts = new Uint8Array(t.length);
  for (let i = 0; i < t.length; i++) starts[i] = isWordStart(t, i) ? 1 : 0;
  return { text: t, starts };
}

interface PreparedEntry {
  title: Prepared[];
  keywords: Prepared[];
  subtitle: Prepared[];
}

const preparedEntries = new WeakMap<PaletteEntry, PreparedEntry>();

function prepared(entry: PaletteEntry): PreparedEntry {
  let p = preparedEntries.get(entry);
  if (!p) {
    p = { title: texts(entry.title).map(prepare), keywords: entry.keywords.map(prepare), subtitle: texts(entry.subtitle).map(prepare) };
    preparedEntries.set(entry, p);
  }
  return p;
}

/** Best in-order alignment of `query` inside `text`, or 0. Rewards word starts and runs; penalizes gaps. */
function subsequenceScore(query: string, { text, starts }: Prepared): number {
  const m = query.length;
  const n = text.length;
  if (m === 0 || m > n) return 0;
  // No in-order match at all: the alignment below would find none either.
  let k = 0;
  for (let j = 0; j < n && k < m; j++) if (text[j] === query[k]) k += 1;
  if (k < m) return 0;
  const NONE = Number.NEGATIVE_INFINITY;
  // prev[j]: best score with query[0..i-1] matched and query[i-1] at text[j].
  let prev = new Array<number>(n).fill(NONE);
  for (let j = 0; j < n; j++) {
    if (text[j] === query[0]) prev[j] = 1 + (starts[j] ? 2 : 0) - j * 0.05;
  }
  for (let i = 1; i < m; i++) {
    const next = new Array<number>(n).fill(NONE);
    let bestBefore = NONE;
    let bestBeforeAt = -1;
    for (let j = 0; j < n; j++) {
      if (j > 0 && prev[j - 1] !== NONE) {
        // Track the best predecessor adjusted for the gap it would leave before j.
        const candidate = prev[j - 1] + (j - 1) * 0.25;
        if (candidate > bestBefore) {
          bestBefore = candidate;
          bestBeforeAt = j - 1;
        }
      }
      if (text[j] !== query[i]) continue;
      const base = 1 + (starts[j] ? 2 : 0);
      let score = NONE;
      if (j > 0 && prev[j - 1] !== NONE) score = prev[j - 1] + base + 3;
      if (bestBeforeAt >= 0) {
        const gapped = bestBefore - (j - 1) * 0.25 + base - 0.5;
        if (gapped > score) score = gapped;
      }
      next[j] = score;
    }
    prev = next;
  }
  const raw = Math.max(...prev);
  if (raw === NONE || raw <= 0) return 0;
  const max = m * 6;
  return Math.max(1, Math.min(29, (raw / max) * 30));
}

/** `fuzzyScore` for a normalized query and a prepared text. */
function scoreText(q: string, prepared: Prepared): number {
  const t = prepared.text;
  if (!q || !t) return 0;
  if (q === t) return 100;
  const shortness = q.length / t.length;
  if (t.startsWith(q)) return 80 + shortness * 10;
  const firstAt = t.indexOf(q);
  let at = firstAt;
  while (at > 0 && !prepared.starts[at]) at = t.indexOf(q, at + 1);
  if (at > 0) return 60 + shortness * 10 - Math.min(at, 50) * 0.05;
  if (firstAt >= 0) return 40 + shortness * 10 - Math.min(firstAt, 50) * 0.05;
  return subsequenceScore(q, prepared);
}

/**
 * Match quality of one query token against a text. 0 means no match.
 * Tiers: exact 100, prefix 80+, word-start substring 60+, substring 40+, subsequence 1 to 29.
 */
export function fuzzyScore(query: string, text: string): number {
  return scoreText(normalize(query), prepare(text));
}

const texts = (value: LocalizedText | undefined) => (value ? [value.en, value.id] : []);

/** Best weighted field score of one normalized token. */
function tokenScore(entry: PaletteEntry, token: string): number {
  const p = prepared(entry);
  let best = 0;
  // Tech Reactor rows weigh their title like keywords, so a bare tech name still opens a project first.
  const titleWeight = entry.target.type === "tech" ? FIELD_WEIGHT.keywords : FIELD_WEIGHT.title;
  for (const text of p.title) best = Math.max(best, scoreText(token, text) * titleWeight);
  for (const text of p.keywords) best = Math.max(best, scoreText(token, text) * FIELD_WEIGHT.keywords);
  for (const text of p.subtitle) best = Math.max(best, scoreText(token, text) * FIELD_WEIGHT.subtitle);
  return best;
}

function scoreTokens(entry: PaletteEntry, tokens: readonly string[]): number {
  let total = 0;
  for (const token of tokens) {
    const score = tokenScore(entry, token);
    if (score <= 0) return 0;
    total += score;
  }
  return total > 0 ? total + (entry.roomKind ? (KIND_BONUS[entry.roomKind] ?? 0) : 0) : 0;
}

/** Sum of token scores; 0 unless every token matches some field (AND). */
export function scoreEntry(entry: PaletteEntry, tokens: string[]): number {
  return scoreTokens(entry, tokens.map(normalize));
}

/**
 * True when the query reads like a question for Ask the HQ: it ends with "?", starts with a question
 * word and has at least two words, or has at least three words.
 */
export function looksLikeQuestion(query: string): boolean {
  const words = normalize(query).replace(/[?!.,]+/g, " ").split(" ").filter(Boolean);
  if (words.length === 0) return false;
  if (/\?\s*$/.test(query) && normalize(query).length >= 4) return true;
  if (words.length >= 2 && QUESTION_WORDS.has(words[0])) return true;
  return words.length >= 3;
}

/** A clear question: ends with "?" or starts with a question word. Its Ask row goes first. */
function isClearQuestion(query: string): boolean {
  const words = normalize(query).replace(/[?!.,]+/g, " ").split(" ").filter(Boolean);
  return /\?\s*$/.test(query) || (words.length >= 2 && QUESTION_WORDS.has(words[0]));
}

export function askEntry(query: string): PaletteEntry {
  const q = query.replace(/\s+/g, " ").trim().slice(0, ASK_MAX);
  return { key: "ask", group: "ask", title: { en: q, id: q }, keywords: [], target: { type: "ask", q } };
}

function applyFilter(entries: readonly PaletteEntry[], filter: PaletteSearchOptions["filter"]): readonly PaletteEntry[] {
  if (!filter) return entries;
  return entries.filter((entry) => {
    if (entry.group !== "rooms") return false;
    if (filter === "pods") return entry.roomKind === "pod";
    if (filter === "posts") return entry.roomKind === "post";
    return true;
  });
}

function recentEntries(entries: readonly PaletteEntry[], recent: readonly RoomId[]): PaletteEntry[] {
  const byRoom = new Map<RoomId, PaletteEntry>();
  for (const entry of entries) if (entry.target.type === "room") byRoom.set(entry.target.id, entry);
  const result: PaletteEntry[] = [];
  for (const id of recent) {
    const entry = byRoom.get(id);
    if (entry && !result.includes(entry)) result.push(entry);
    if (result.length === MAX_RECENT) break;
  }
  return result;
}

export function searchPalette(entries: readonly PaletteEntry[], query: string, options: PaletteSearchOptions = {}): PaletteGroup[] {
  const { filter = null, recent = [], limitPerGroup = DEFAULT_LIMIT } = options;
  const pool = applyFilter(entries, filter);
  const tokens = normalize(query).split(" ").filter(Boolean);

  if (tokens.length === 0) {
    if (filter) return pool.length ? [{ id: "rooms", entries: [...pool] }] : [];
    const groups: PaletteGroup[] = [
      { id: "missions", entries: entries.filter((entry) => entry.group === "missions") },
      { id: "recent", entries: recentEntries(entries, recent) },
    ];
    return groups.filter((group) => group.entries.length > 0);
  }

  const normalized = tokens.map(normalize);
  const scored = pool
    .map((entry, order) => ({ entry, order, score: scoreTokens(entry, normalized) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order);

  // Groups keep their fixed order unless another group holds a clearly better match, so Enter
  // on the first row always runs the best result (e.g. "copy email" runs the action, not a room).
  const groups: PaletteGroup[] = RESULT_GROUPS.map((id, rank) => {
    const items = scored.filter((item) => item.entry.group === id).slice(0, limitPerGroup);
    return { id, rank, best: items[0]?.score ?? 0, entries: items.map((item) => item.entry) };
  })
    .filter((group) => group.entries.length > 0)
    .sort((a, b) => b.best - a.best || a.rank - b.rank)
    .map(({ id, entries: groupEntries }) => ({ id, entries: groupEntries }));

  // Ask row: first for a clear question or when nothing else matches; otherwise last, so a
  // three-word room search ("voice ai contact") still opens the room on Enter.
  if (!options.ask || filter || !looksLikeQuestion(query)) return groups;
  const ask: PaletteGroup = { id: "ask", entries: [askEntry(query)] };
  return groups.length === 0 || isClearQuestion(query) ? [ask, ...groups] : [...groups, ask];
}

import type { LocalizedText, RoomId } from "@/content/schema";
import type { HudIndex } from "./index-data";
import type { PaletteActionId, PaletteEntry, PaletteGroup, PaletteSearchOptions } from "./palette-types";

const ACTION_KEYWORDS: Record<PaletteActionId, string[]> = {
  "download-cv": ["cv", "resume", "pdf", "download", "unduh"],
  "copy-email": ["email", "contact", "mail", "copy", "salin", "kontak"],
  "toggle-language": ["language", "bahasa", "english", "indonesia", "inggris"],
  "toggle-sound": ["sound", "audio", "mute", "suara"],
  "quick-view": ["quick", "summary", "ringkas", "overview"],
};

const RESULT_GROUPS = ["missions", "rooms", "years", "actions"] as const;
const DEFAULT_LIMIT = 8;
const MAX_RECENT = 3;

const FIELD_WEIGHT = { title: 3, keywords: 1.5, subtitle: 1 } as const;
/** Tiny tie breaker so projects outrank other rooms with the same match (e.g. a stack keyword). */
const KIND_BONUS: Partial<Record<NonNullable<PaletteEntry["roomKind"]>, number>> = { pod: 0.5, post: 0.25 };

export function buildPaletteEntries(
  index: Pick<HudIndex, "missions" | "rooms" | "years" | "actionLabels">,
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

/** Best in-order alignment of `query` inside `text`, or 0. Rewards word starts and runs; penalizes gaps. */
function subsequenceScore(query: string, text: string): number {
  const m = query.length;
  const n = text.length;
  if (m === 0 || m > n) return 0;
  const NONE = Number.NEGATIVE_INFINITY;
  // prev[j]: best score with query[0..i-1] matched and query[i-1] at text[j].
  let prev = new Array<number>(n).fill(NONE);
  for (let j = 0; j < n; j++) {
    if (text[j] === query[0]) prev[j] = 1 + (isWordStart(text, j) ? 2 : 0) - j * 0.05;
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
      const base = 1 + (isWordStart(text, j) ? 2 : 0);
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

/**
 * Match quality of one normalized query token against a text. 0 means no match.
 * Tiers: exact 100, prefix 80+, word-start substring 60+, substring 40+, subsequence 1 to 29.
 */
export function fuzzyScore(query: string, text: string): number {
  const q = normalize(query);
  const t = normalize(text);
  if (!q || !t) return 0;
  if (q === t) return 100;
  const shortness = q.length / t.length;
  if (t.startsWith(q)) return 80 + shortness * 10;
  const firstAt = t.indexOf(q);
  let at = firstAt;
  while (at > 0 && !isWordStart(t, at)) at = t.indexOf(q, at + 1);
  if (at > 0) return 60 + shortness * 10 - Math.min(at, 50) * 0.05;
  if (firstAt >= 0) return 40 + shortness * 10 - Math.min(firstAt, 50) * 0.05;
  return subsequenceScore(q, t);
}

const texts = (value: LocalizedText | undefined) => (value ? [value.en, value.id] : []);

function tokenScore(entry: PaletteEntry, token: string): number {
  let best = 0;
  for (const text of texts(entry.title)) best = Math.max(best, fuzzyScore(token, text) * FIELD_WEIGHT.title);
  for (const text of entry.keywords) best = Math.max(best, fuzzyScore(token, text) * FIELD_WEIGHT.keywords);
  for (const text of texts(entry.subtitle)) best = Math.max(best, fuzzyScore(token, text) * FIELD_WEIGHT.subtitle);
  return best;
}

/** Sum of token scores; 0 unless every token matches some field (AND). */
export function scoreEntry(entry: PaletteEntry, tokens: string[]): number {
  let total = 0;
  for (const token of tokens) {
    const score = tokenScore(entry, token);
    if (score <= 0) return 0;
    total += score;
  }
  return total > 0 ? total + (entry.roomKind ? (KIND_BONUS[entry.roomKind] ?? 0) : 0) : 0;
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

  const scored = pool
    .map((entry, order) => ({ entry, order, score: scoreEntry(entry, tokens) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order);

  // Groups keep their fixed order unless another group holds a clearly better match, so Enter
  // on the first row always runs the best result (e.g. "copy email" runs the action, not a room).
  return RESULT_GROUPS.map((id, rank) => {
    const items = scored.filter((item) => item.entry.group === id).slice(0, limitPerGroup);
    return { id, rank, best: items[0]?.score ?? 0, entries: items.map((item) => item.entry) };
  })
    .filter((group) => group.entries.length > 0)
    .sort((a, b) => b.best - a.best || a.rank - b.rank)
    .map(({ id, entries: groupEntries }) => ({ id, entries: groupEntries }));
}

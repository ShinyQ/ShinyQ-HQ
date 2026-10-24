import { ASK_HISTORY_ANSWER_MAX, ASK_HISTORY_TURNS, ASK_MAX_QUESTION, isAskSig, type AskLocale, type AskTurn } from "../../src/ask/protocol";
import { scrubPII } from "./pii";
import { isSiteQuestion } from "./scope";
import { hmac, timingSafeEqual } from "./security";
import { cleanText } from "./text";

/**
 * Multi-turn memory (owner decision 2026-10-17). The server signs every model answer it streams and
 * the client sends up to `ASK_HISTORY_TURNS` signed turns back. A turn whose signature fails is
 * dropped, never an error, so a visitor cannot put words in the assistant's mouth.
 */

/** A verified earlier turn, in canonical form. */
export interface HistoryTurn {
  q: string;
  a: string;
}

/** What the signature binds a turn to: the panel language and the knowledge pack it was answered from. */
export interface TurnScope {
  locale: AskLocale;
  packVersion: string;
}

/** The handler's own question normalization (step 5), so a re-sent question canonicalizes the same. */
export const canonicalQuestion = (q: string) => scrubPII(cleanText(q));
export const canonicalAnswer = (a: string) => cleanText(a);

const message = (scope: TurnScope, turn: HistoryTurn) =>
  JSON.stringify(["ask-turn-v1", scope.locale, scope.packVersion, canonicalQuestion(turn.q), canonicalAnswer(turn.a)]);

export function signTurn(key: string, scope: TurnScope, turn: HistoryTurn): Promise<string> {
  return hmac(key, message(scope, turn));
}

/** Well-formed wire turns only, the last `ASK_HISTORY_TURNS`; anything else is ignored. */
export function parseHistory(raw: unknown): AskTurn[] {
  if (!Array.isArray(raw)) return [];
  const out: AskTurn[] = [];
  for (const item of raw.slice(-ASK_HISTORY_TURNS * 2)) {
    if (!item || typeof item !== "object") continue;
    const { q, a, sig } = item as Record<string, unknown>;
    if (typeof q !== "string" || typeof a !== "string" || !isAskSig(sig)) continue;
    if (!q.trim() || q.length > ASK_MAX_QUESTION || !a.trim() || a.length > ASK_HISTORY_ANSWER_MAX) continue;
    out.push({ q, a, sig });
  }
  return out.slice(-ASK_HISTORY_TURNS);
}

/** The canonical turns whose signature matches, oldest first. Without a key nothing verifies. */
export async function verifyHistory(turns: readonly AskTurn[], key: string | undefined, scope: TurnScope): Promise<HistoryTurn[]> {
  if (!key) return [];
  const out: HistoryTurn[] = [];
  for (const turn of turns.slice(-ASK_HISTORY_TURNS)) {
    const q = canonicalQuestion(turn.q);
    const a = canonicalAnswer(turn.a);
    if (!q || !a) continue;
    if (timingSafeEqual(turn.sig, await signTurn(key, scope, { q, a }))) out.push({ q, a });
  }
  return out;
}

/** Words that point back at the previous turn (EN and ID). "He" and "his" mean Kurniadi, so they do not count. */
const REFERENT = /\b(?:it|its|that|this|those|these|they|them|their|there|one|ones|same|ini|itu|tersebut|mereka|sana|tadi|\p{L}{3,}nya)\b/iu;
/** Lead-ins of a follow-up (EN/ID; owner decision 2026-10-24 added the spoken Indonesian ones: "trus", "gimana kalau", "yang tadi"). */
const LEAD_IN = /^(?:and|also|what about|how about|then|so|dan|lalu|terus|trus|kalau|kalo|bagaimana dengan|bagaimana kalau|gimana dengan|gimana kalau|selain itu|yang tadi|soal yang tadi|nah)\b/i;
/** A question this short with no name of its own reads as a follow-up ("Which year?", "Why?"). */
export const FOLLOW_UP_WORDS = 3;
/** A question this long stands alone even with a "that" or "there" in it. */
const STANDALONE_WORDS = 12;

/**
 * A question that only makes sense after the previous one: a lead-in ("and", "what about", "kalau"), a
 * referent ("it", "that one", "itu", a "-nya" word), or at most 3 words with no name of its own
 * ("Which year?", but not "What is Clearbox?"). Short standalone questions ("Where did he study?") and
 * site questions stand alone.
 */
export function isFollowUp(question: string): boolean {
  const text = cleanText(question);
  if (!text || isSiteQuestion(text)) return false;
  const words = text.match(/[\p{L}\p{N}]+/gu) ?? [];
  const named = words.slice(1).some((w) => /^\p{Lu}/u.test(w));
  return LEAD_IN.test(text) || (words.length < STANDALONE_WORDS && REFERENT.test(text)) || (words.length <= FOLLOW_UP_WORDS && !named);
}

/**
 * The earlier questions a follow-up refers to: the previous one and, when that was a follow-up too,
 * the ones before it back to the last standalone question ("And before that?" after "What does he do
 * there?" after "Where does he work now?"). Undefined for a standalone question or a first turn.
 */
export function followUpAnchor(question: string, history: readonly HistoryTurn[]): string | undefined {
  if (!history.length || !isFollowUp(question)) return undefined;
  const parts: string[] = [];
  for (let i = history.length - 1; i >= 0; i--) {
    parts.push(history[i].q);
    if (!isFollowUp(history[i].q)) break;
  }
  return parts.join(" ");
}

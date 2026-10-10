import type { AskOutcome } from "../../src/ask/protocol";
import type { CannedKind } from "./messages";
import { RULES } from "./prompt";
import type { KnowledgePack, SafetyData } from "./types";

/** Hard cap on the displayed answer (max_tokens 300 keeps real answers far below it). */
export const MAX_ANSWER_CHARS = 1000;

const UNKNOWN_PHRASES = [
  "don't have that information",
  "do not have that information",
  "don't have information",
  "do not have information",
  "don't have any information",
  "do not have any information",
  "not on this site",
  "isn't on this site",
  "not available on this site",
  "no information",
  "not mentioned",
  "tidak memiliki informasi",
  "tidak punya informasi",
  "tidak ada informasi",
  "belum ada informasi",
  "tidak tersedia di situs",
  "tidak ada di situs",
];
const DECLINE_PHRASES = [
  "can only answer",
  "only answer questions",
  "only help with questions",
  "can't help with that",
  "cannot help with that",
  "can't share",
  "cannot share",
  "hanya bisa menjawab",
  "hanya dapat menjawab",
  "tidak bisa membantu",
  "tidak dapat membantu",
  "tidak bisa menyebutkan",
  "cannot answer",
  "can't answer",
  "cannot fulfill",
  "can't fulfill",
  "unable to fulfill",
  "unable to help",
  "i decline",
  "politely decline",
  "must decline",
  "tidak dapat memenuhi",
  "tidak bisa memenuhi",
  "tidak dapat menjawab",
  "tidak bisa menjawab",
];

/** Secret-looking strings that must never be displayed (T11). */
const SECRET_PATTERNS = [
  /\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}/,
  /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{16,}/,
  /\bxox[abpr]-[A-Za-z0-9-]{10,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  // Long base64-like runs with digits and both cases (keys, tokens); plain URL paths have separators.
  /(?<![A-Za-z0-9+/])(?=[A-Za-z0-9+/]*\d)(?=[A-Za-z0-9+/]*[A-Z])(?=[A-Za-z0-9+/]*[a-z])[A-Za-z0-9+/]{40,}={0,2}/,
];

/** Patterns that never appear in public copy (src/content/safety.ts FORBIDDEN_PATTERNS, minus the em dash, which is rewritten). */
export const FORBIDDEN_OUTPUT = [
  /(?:\bRp\.?\s?\d|\bIDR\s?\d|\bUSD\s?\d|\$\s?\d|\d\s?(?:juta|miliar|million|billion)\s?(?:rupiah|IDR|USD))/i,
  /(?:\+62|\b08\d{2})[\s-]?\d{3,4}[\s-]?\d{3,5}/,
  /\.(?:azurewebsites\.net|azurecontainerapps\.io|cognitiveservices\.azure\.com|openai\.azure\.com|vault\.azure\.net|documents\.azure\.com|search\.windows\.net|blob\.core\.windows\.net|servicebus\.windows\.net)/i,
  /\b(?:master'?s|magister|MSc|M\.Sc|MMT)\b/i,
];

/** Capitalized words that are fine mid-sentence even when the site never uses them. */
const COMMON_CAPS = new Set(
  [
    "i i'm i've i'd yes no sorry maaf english indonesian indonesia bahasa ok okay cmd ctrl k kurniadi ahmad wijaya shinyq hq ai page view work journey writing about contact",
    // Dates in the pack are YYYY-MM, so answers spell out month and day names.
    "january february march april may june july august september october november december jan feb mar apr jun jul aug sep sept oct nov dec",
    "januari februari maret mei juni juli agustus oktober desember agu okt des",
    "monday tuesday wednesday thursday friday saturday sunday senin selasa rabu kamis jumat sabtu minggu",
  ]
    .join(" ")
    .split(" "),
);

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Same matching rules as `findBlockedTerms` in src/content/safety.ts (that module needs node:fs). */
export function findBlocked(text: string, terms: readonly string[]): string[] {
  return terms.filter((term) => {
    if (term.length > 2 && term.startsWith("/") && term.endsWith("/")) return new RegExp(term.slice(1, -1)).test(text);
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(term)}($|[^\\p{L}\\p{N}])`, "iu").test(text);
  });
}

/** Plain-text cleanup of model output (T6): invisible characters, markdown marks, em dashes. Length capped. */
export function sanitizeAnswer(raw: string): string {
  let text = raw
    .normalize("NFKC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u2028-\u202E\u2060-\u2069\uFEFF]/g, "")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?(<\/\1\s*>|$)/gi, " ")
    .replace(/<\/?[A-Za-z!][^>]*>?/g, " ")
    .replace(/\*\*|__|`+|^#+\s*/gm, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\s*\u2014\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length > MAX_ANSWER_CHARS) {
    const cut = text.slice(0, MAX_ANSWER_CHARS);
    const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
    text = end > 200 ? cut.slice(0, end + 1) : `${cut.replace(/\s+\S*$/, "")}...`;
  }
  return text;
}

export function classifyOutcome(text: string): Extract<AskOutcome, "answer" | "unknown" | "decline"> {
  const lower = text.toLowerCase().replace(/\u2019/g, "'");
  if (DECLINE_PHRASES.some((p) => lower.includes(p))) return "decline";
  if (UNKNOWN_PHRASES.some((p) => lower.includes(p))) return "unknown";
  return "answer";
}

/** "7,350" and "7.350" become "7350"; "90,9" becomes "90.9". */
export function canonicalNumber(raw: string): string {
  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(raw)) return raw.replace(/[.,]/g, "");
  return raw.replace(",", ".").replace(/^0+(?=\d)/, "");
}

export function numbersIn(text: string): string[] {
  return (text.match(/\d+(?:[.,]\d+)*/g) ?? []).map(canonicalNumber);
}

/** Every number in the answer must appear in the retrieved context (T3). Small integers (0 to 10) are allowed. */
export function ungroundedNumbers(answer: string, allowedText: string): string[] {
  const allowed = new Set(numbersIn(allowedText));
  for (const n of [...allowed]) {
    // A grouped context number ("2,000") also allows its plain parts, and decimals allow their integer part.
    if (n.includes(".")) allowed.add(n.split(".")[0]);
  }
  return [...new Set(numbersIn(answer))].filter((n) => !allowed.has(n) && !(/^\d+$/.test(n) && Number(n) <= 10));
}

/** Capitalized words that are not sentence-initial. */
export function properNouns(text: string): string[] {
  const out: string[] = [];
  for (const sentence of text.split(/(?<=[.!?:;])\s+|\n+/)) {
    const words = sentence.match(/[\p{L}\p{N}][\p{L}\p{N}'.+#-]*/gu) ?? [];
    words.slice(1).forEach((word) => {
      if (/^\p{Lu}/u.test(word)) out.push(word.replace(/[.']+$/, ""));
    });
  }
  return out;
}

const EMPLOYMENT = /\b(?:work(?:s|ed|ing)?|employed|joined|interned|bekerja|kerja|bergabung|magang)\s+(?:at|for|di|untuk|pada)\s+((?:\p{Lu}[\p{L}\p{N}&.'-]*)(?:\s+\p{Lu}[\p{L}\p{N}&.'-]*){0,4})/gu;

/** Employers or clients named in "worked at X" phrases that are not in the allowlist (T3). */
export function unknownEmployers(text: string, entities: readonly string[]): string[] {
  const known = entities.map((e) => e.toLowerCase());
  const out: string[] = [];
  for (const match of text.matchAll(EMPLOYMENT)) {
    const name = match[1].trim().toLowerCase();
    if (!known.some((k) => k.includes(name) || name.includes(k.split(" (")[0]))) out.push(match[1].trim());
  }
  return out;
}

/** Proper nouns that the pack never mentions (unknown people, companies, places) (T3). */
export function unknownNames(text: string, vocabulary: ReadonlySet<string>, extra: ReadonlySet<string> = new Set()): string[] {
  return properNouns(text).filter((word) => {
    const parts = word.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    return parts.some((part) => !vocabulary.has(part) && !COMMON_CAPS.has(part) && !extra.has(part) && !/^\d+$/.test(part));
  });
}

const LEAK_N = 7;
const shingles = (text: string): string[] => {
  const words = text.toLowerCase().replace(/n't\b/g, " not").match(/[\p{L}\p{N}]+/gu) ?? [];
  const out: string[] = [];
  for (let i = 0; i + LEAK_N <= words.length; i++) out.push(words.slice(i, i + LEAK_N).join(" "));
  return out;
};
/** Phrases a normal refusal may share with the rules; they never count as a leak. */
const BENIGN = [
  "I do not have that information on this site.",
  "Kurniadi: his work, projects, career, skills, education, writing and how to contact him.",
  "I can only answer questions about Kurniadi and his work.",
];
const ruleShingles = (() => {
  const benign = new Set(BENIGN.flatMap(shingles));
  // The numbered rules only; the scope line restates what a decline may say anyway.
  return new Set(RULES.slice(1).flatMap(shingles).filter((s) => !benign.has(s)));
})();

/** True when the answer quotes 7 or more consecutive words of the system rules (T5). */
export function leaksPrompt(text: string): boolean {
  if (shingles(text).some((s) => ruleShingles.has(s))) return true;
  return /\bCONTEXT:/.test(text);
}

/** Accusations the site never makes about the owner. Allowed only when the retrieved context uses the same word. */
const DEFAMATORY = /\b(fired|sacked|arrested|convicted|jailed|prison|stole|stolen|stealing|embezzl\w*|criminal|corrupt(?:ion)?|bribe\w*|faked|plagiari[sz]\w*|dipecat|mencuri|ditangkap|dipenjara|korupsi|suap|menipu|plagiat)\b/gi;

export function defamatoryWords(text: string, context: string): string[] {
  const allowed = context.toLowerCase();
  return [...new Set((text.match(DEFAMATORY) ?? []).map((w) => w.toLowerCase()))].filter((w) => !new RegExp(`\\b${w}\\b`).test(allowed));
}

export type CheckFailure = "blocklist" | "forbidden" | "secret" | "leak" | "defamation" | "numeric" | "entity" | "employer" | "empty";

export type CheckResult =
  | { ok: true; text: string; outcome: Extract<AskOutcome, "answer" | "unknown" | "decline"> }
  | { ok: false; reason: CheckFailure; detail: string[]; replacement: CannedKind };

export interface CheckInput {
  answer: string;
  question: string;
  context: string;
  packDate: string;
  pack: Pick<KnowledgePack, "entities">;
  vocabulary: ReadonlySet<string>;
  safety: SafetyData;
}

/** Output checks in spec order (7.4 step 8). The first failure decides the replacement message. */
export function checkAnswer({ answer, question, context, packDate, pack, vocabulary, safety }: CheckInput): CheckResult {
  const text = sanitizeAnswer(answer);
  if (!text) return { ok: false, reason: "empty", detail: [], replacement: "fallback" };
  const blocked = findBlocked(text, safety.blocklist);
  if (blocked.length) return { ok: false, reason: "blocklist", detail: blocked, replacement: "restricted" };
  if (FORBIDDEN_OUTPUT.some((re) => re.test(text))) return { ok: false, reason: "forbidden", detail: [], replacement: "restricted" };
  if (SECRET_PATTERNS.some((re) => re.test(text))) return { ok: false, reason: "secret", detail: [], replacement: "restricted" };
  if (leaksPrompt(text)) return { ok: false, reason: "leak", detail: [], replacement: "decline" };

  const accusations = defamatoryWords(text, context);
  if (accusations.length) return { ok: false, reason: "defamation", detail: accusations, replacement: "unknown" };

  const outcome = classifyOutcome(text);
  // A refusal may echo the question ("I have no information about Google"); an answer may not.
  const echo = outcome === "answer" ? "" : ` ${question}`;
  const numbers = ungroundedNumbers(text, `${context} ${packDate}${echo}`);
  if (numbers.length) return { ok: false, reason: "numeric", detail: numbers, replacement: "unknown" };
  if (outcome === "answer") {
    const employers = unknownEmployers(text, pack.entities);
    if (employers.length) return { ok: false, reason: "employer", detail: employers, replacement: "unknown" };
  }
  const questionWords = new Set(echo.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
  const names = unknownNames(text, vocabulary, questionWords);
  if (names.length) return { ok: false, reason: "entity", detail: names, replacement: "unknown" };
  return { ok: true, text, outcome };
}

import { isAskCite, type AskLocale, type AskOutcome } from "../../src/ask/protocol";
import type { CannedKind } from "./messages";
import { RULES } from "./prompt";
import type { RoutedTopic } from "./scope";
import { tokenize } from "./text";
import type { ChunkType, KnowledgeChunk, KnowledgePack, SafetyData } from "./types";

/** Hard cap on the displayed answer (max_tokens 300 keeps real answers far below it). */
export const MAX_ANSWER_CHARS = 1000;

const UNKNOWN_PHRASES = [
  "belum tersedia di situs",
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
  "hasn't shared a view",
  "has not shared a view",
  "hasn't shared a written view",
  "has not shared a written view",
  "no written view",
  "hasn't written about",
  "has not written about",
  "belum membagikan pandangan",
  "belum membagikan pendapat",
  "belum menulis tentang",
  "tidak ada pandangan tertulis",
];
const DECLINE_PHRASES = [
  "can only provide information",
  "only answers questions",
  "hanya menjawab pertanyaan",
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
  "only cover",
  "hanya membahas",
  "tidak bisa membagikan",
  "tidak dapat membagikan",
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
    "i i'm i've i'd anda kamu yes no sorry maaf english indonesian indonesia bahasa ok okay cmd ctrl k kurniadi ahmad wijaya shiny shinyq hq ai page view classic site situs klasik work journey writing about contact",
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
  "Kurniadi hasn't shared a view on that and the closest thing he wrote is",
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

/** First-person voice as Kurniadi (T18). Quoted text is his written words and does not count. */
const FIRST_PERSON: RegExp[] = [
  /\b(?:I|I'm|I've)\s+(?:think|believe|prefer|feel|always|never|like|love|hate|wrote|built|define|chose|learned|shipped|own)\b/,
  /\b[Mm]y\s+(?:principles?|views?|opinions?|approach|code|projects?|career|team|manager|boss|clients?|salary|family|work)\b/,
  /\bas Kurniadi\b(?!['\u2019]s)/i,
  /\b(?:menurut saya|prinsip saya|pendapat saya|pandangan saya)\b/i,
  /\bsaya\s+(?:pikir|rasa|percaya|lebih suka|lebih memilih|selalu|menulis|membangun|memakai|menggunakan|me-review|bekerja)\b/i,
];

export function firstPersonVoice(text: string): boolean {
  const unquoted = text.replace(/"[^"]*"|\u201C[^\u201D]*\u201D/g, " ");
  return FIRST_PERSON.some((re) => re.test(unquoted));
}

/** Wording that attributes an opinion to Kurniadi; such an answer needs a written source even for a factual question. */
const OPINION_CLAIM: RegExp[] = [
  /\b(?:he|kurniadi)\s+(?:believes|thinks|feels|prefers|would\s+(?:say|think|prefer|recommend|argue|probably|likely))\b/i,
  // "written" echoes the pack's perspective label ("Kurniadi's written view", "Pandangan tertulis Kurniadi").
  /\bin his (?:own )?(?:written )?(?:view|opinion)\b/i,
  /\b(?:his|kurniadi'?s) (?:written )?(?:view|opinion|stance|philosophy|belief)\b/i,
  /\bmenurut(?:nya| kurniadi| dia)\b/i,
  /\b(?:dia|kurniadi)\s+(?:percaya|berpendapat|lebih suka|lebih memilih|merasa)\b/i,
  /\bpandangan(?: tertulis)?(?:nya| kurniadi)\b/i,
];

export function claimsOpinion(text: string): boolean {
  return OPINION_CLAIM.some((re) => re.test(text));
}

/** Chunk types that hold Kurniadi's own written views. Posts tagged "personal" never count (spec section 13). */
export const SOURCE_TYPES: ReadonlySet<ChunkType> = new Set<ChunkType>(["perspective", "principle", "post", "talk"]);

const isSource = (chunk: KnowledgeChunk) => SOURCE_TYPES.has(chunk.type) && !chunk.keywords.includes("personal");

/** Quoted titles in a source's localized text (How I work and principle titles, a post or perspective title), else its title. */
export function sourceTitles(chunk: KnowledgeChunk, locale: AskLocale): string[] {
  const text = locale === "id" ? chunk.text_id : chunk.text_en;
  const quoted = [...text.matchAll(/"([^"]{4,120})"/g)].map((m) => m[1]);
  return quoted.length ? quoted : [chunk.title];
}

const fold = (text: string) => text.toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Runs of three content words (stopwords and his name removed): the unit of "follows his written words". */
function contentRuns(text: string): string[] {
  const words = tokenize(text).filter((w) => w !== "kurniadi");
  const out: string[] = [];
  for (let i = 0; i + 3 <= words.length; i++) out.push(words.slice(i, i + 3).join(" "));
  return out;
}

/**
 * The retrieved written source an answer cites (T16): it names one of the source's quoted titles,
 * or shares at least two distinct three-word runs with it. One shared run ("AI coding agents") is
 * not enough, so a made-up opinion that borrows one phrase does not pass.
 */
export function citedSource(answer: string, chunks: readonly KnowledgeChunk[], locale: AskLocale): KnowledgeChunk | undefined {
  const folded = ` ${fold(answer)} `;
  const runs = new Set(contentRuns(answer));
  return chunks.filter(isSource).find((chunk) => {
    if (sourceTitles(chunk, locale).some((title) => fold(title).length >= 8 && folded.includes(` ${fold(title)} `))) return true;
    const own = new Set(contentRuns(locale === "id" ? chunk.text_id : chunk.text_en));
    return [...runs].filter((run) => own.has(run)).length >= 2;
  });
}

/**
 * The first retrieved written source with a citable path, for the no-view answer. Perspectives are
 * skipped: they have no page of their own, so their question is not a title a visitor can find.
 */
export function closestSource(chunks: readonly KnowledgeChunk[], locale: AskLocale): { title: string; url: string } | undefined {
  const chunk = chunks.find((c) => isSource(c) && c.type !== "perspective" && isAskCite(c.url));
  return chunk?.url ? { title: sourceTitles(chunk, locale)[0], url: chunk.url } : undefined;
}

/** Code in an answer (T6, owner rule 2026-10-15: never a general coding assistant). Markdown fences are already stripped. */
const CODE: RegExp[] = [
  /\b(?:def|function|fn|func) \w+\s*\(|=>\s*[{(\w]|\b(?:const|let|var) \w+\s*=|\bimport \w+(?:,? ?\{[^}]*\})? from\b|\bfrom \w+ import\b|\bSELECT\b[\s\S]{0,60}\bFROM\b|\bconsole\.log\(|\bprint\(|\breturn [^.]{0,40};|\{\s*\}|;\s*\}/,
];

export function containsCode(text: string): boolean {
  return CODE.some((re) => re.test(text));
}

/** The assistant asking the visitor for personal data (owner rule 2026-10-15: offer his contact instead). */
const ASKS_PERSONAL_DATA =
  /\b(?:share|send|give|tell|provide|leave|drop)\b[^.?!]{0,20}\b(?:your|me your|us your)\b[^.?!]{0,20}\b(?:phone|number|email|e-mail|whatsapp|company name|company details|address|full name|contact details)\b|\bwhat(?:'s| is) your (?:phone|email|company|name|number|whatsapp)\b|\b(?:kirim(?:kan)?|bagikan|berikan|sebutkan|tinggalkan)\b[^.?!]{0,20}\b(?:nomor|email|alamat|nama perusahaan|whatsapp|kontak)\b[^.?!]{0,10}\b(?:anda|kamu|mu)\b|\b(?:nomor|email|whatsapp) (?:anda|kamu)\b/i;

export function asksForPersonalData(text: string): boolean {
  return ASKS_PERSONAL_DATA.test(text);
}

/** Free consulting in a lead answer: time or cost estimates and designing the visitor's system (owner rule 2026-10-15). */
const CONSULTING: RegExp[] = [
  /\b\d+\s*(?:-|to|or|sampai|hingga|atau)?\s*\d*\s*(?:hours?|days?|weeks?|months?|sprints?|jam|hari|minggu|bulan)\b/i,
  /\b(?:would|will|could|might|should) (?:cost|take)\b|\b(?:estimated|estimates?|budget|pricing|quote|biaya|anggaran|harga|estimasi|perkiraan)\b[^.]{0,30}\b(?:\d|weeks?|months?|days?|minggu|bulan|hari)\b/i,
  /\b(?:you (?:should|could|can|would|might) (?:use|build|start|deploy|choose|consider|set up|add)|i(?: would|'d)? (?:recommend|suggest)|the (?:architecture|design|stack) (?:would|should|could|will)|(?:recommended|suggested) (?:stack|architecture|approach|design)|step (?:1|one)\b|first,? (?:set up|create|build|define)|sebaiknya (?:anda |kamu )?(?:gunakan|memakai|menggunakan|pakai|membangun)|disarankan (?:untuk )?(?:menggunakan|memakai)|arsitekturnya (?:bisa|akan|sebaiknya))/i,
];

export function consulting(text: string): boolean {
  return CONSULTING.some((re) => re.test(text)) || text.split(/(?<=[.!?])\s+/).filter(Boolean).length > 5;
}

/** A lead answer that claims a fit (only allowed when retrieval found matching past projects). */
const FIT_CLAIM = /\b(?:strong|good|great|close|natural|solid|perfect|excellent|ideal) (?:fit|match)\b|\bwell[- ]suited\b|\bperfect for\b|\bgood chance\b|\b(?:very|highly) likely\b|\bcocok\b|\bsangat sesuai\b|\bkemungkinan besar\b|\bpeluang (?:yang )?(?:besar|bagus|baik)\b/i;

export function claimsFit(text: string): boolean {
  return FIT_CLAIM.test(text);
}

export type CheckFailure = "blocklist" | "forbidden" | "secret" | "leak" | "roleplay" | "defamation" | "numeric" | "entity" | "employer" | "unsourced" | "empty" | "code" | "personal-data" | "consulting" | "fit";

export type CheckResult =
  | { ok: true; text: string; outcome: Extract<AskOutcome, "answer" | "unknown" | "decline">; cite?: string }
  | { ok: false; reason: CheckFailure; detail: string[]; replacement: CannedKind };

export interface CheckInput {
  answer: string;
  question: string;
  context: string;
  packDate: string;
  pack: Pick<KnowledgePack, "entities">;
  vocabulary: ReadonlySet<string>;
  safety: SafetyData;
  /** Retrieved chunks (the perspective source check); empty means no written source is available. */
  chunks?: readonly KnowledgeChunk[];
  /** The question asks for Kurniadi's views (`isPerspectiveQuestion`). */
  perspective?: boolean;
  /** The question is about this site itself (`isSiteQuestion`): an answer cites the `site` chunk's repository. */
  site?: boolean;
  /** Routed perspective topic (`routedTopic`): the answer must follow one of that topic's perspectives. */
  topic?: RoutedTopic;
  /** Lead intent (`isLeadQuestion`): `fit` is true when retrieval found matching past projects (`leadMatches`). */
  lead?: { fit: boolean };
  locale?: AskLocale;
}

/** Output checks in spec order (7.4 step 8). The first failure decides the replacement message. */
export function checkAnswer({ answer, question, context, packDate, pack, vocabulary, safety, chunks = [], perspective = false, site = false, topic, lead, locale = "en" }: CheckInput): CheckResult {
  const text = sanitizeAnswer(answer);
  if (!text) return { ok: false, reason: "empty", detail: [], replacement: "fallback" };
  const blocked = findBlocked(text, safety.blocklist);
  if (blocked.length) return { ok: false, reason: "blocklist", detail: blocked, replacement: "restricted" };
  if (FORBIDDEN_OUTPUT.some((re) => re.test(text))) return { ok: false, reason: "forbidden", detail: [], replacement: "restricted" };
  if (SECRET_PATTERNS.some((re) => re.test(text))) return { ok: false, reason: "secret", detail: [], replacement: "restricted" };
  if (leaksPrompt(text)) return { ok: false, reason: "leak", detail: [], replacement: lead ? "lead" : "decline" };
  if (firstPersonVoice(text)) return { ok: false, reason: "roleplay", detail: [], replacement: lead ? "lead" : "decline" };
  if (containsCode(text)) return { ok: false, reason: "code", detail: [], replacement: lead ? "lead" : "decline" };
  if (asksForPersonalData(text)) return { ok: false, reason: "personal-data", detail: [], replacement: lead ? "lead" : "unknown" };
  if (lead && consulting(text)) return { ok: false, reason: "consulting", detail: [], replacement: "lead" };
  if (lead && !lead.fit && claimsFit(text)) return { ok: false, reason: "fit", detail: [], replacement: "lead" };

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
  // A lead answer is about his past work and availability, not his opinions: it is checked above instead.
  if (lead) return { ok: true, text, outcome };
  // Opinions need a written source (spec section 13): a perspective question, or any answer that claims one.
  // Lifestyle and policy (routed topics) must follow one of that topic's perspectives.
  if (outcome === "answer" && (perspective || topic || claimsOpinion(text))) {
    const source = citedSource(text, topic ? chunks.filter((c) => c.type === "perspective" && c.keywords.includes(topic)) : chunks, locale);
    if (!source) return { ok: false, reason: "unsourced", detail: [], replacement: "noView" };
    return isAskCite(source.url) ? { ok: true, text, outcome, cite: source.url } : { ok: true, text, outcome };
  }
  // How this site was built: the answer comes from the retrieved `site` chunk, so it cites its public repository.
  const siteSource = site && outcome === "answer" ? chunks.find((c) => c.type === "site" && isAskCite(c.url)) : undefined;
  if (siteSource?.url) return { ok: true, text, outcome, cite: siteSource.url };
  return { ok: true, text, outcome };
}

import { ASK_LINK_PAGES, askLinkTarget } from "../../src/ask/links";
import { markdownToPlain, parseMarkdown } from "../../src/ask/markdown";
import { ASK_MAX_CITES, ASK_REPO_CITE, citeKind, isAskCite, type AskLocale, type AskOutcome } from "../../src/ask/protocol";
import type { CannedKind } from "./messages";
import { RULES } from "./prompt";
import type { RoutedTopic } from "./scope";
import { indexPack } from "./pack-index";
import { expandTokens, INVISIBLE, tokenize } from "./text";
import type { ChunkType, KnowledgeChunk, KnowledgePack } from "./types";

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
    // Rover, the guide robot that answers (owner decision 2026-10-19), and its one personality touch.
    "rover beep",
    // Dates in the pack are YYYY-MM, so answers spell out month and day names.
    "january february march april may june july august september october november december jan feb mar apr jun jul aug sep sept oct nov dec",
    "januari februari maret mei juni juli agustus oktober desember agu okt des",
    "monday tuesday wednesday thursday friday saturday sunday senin selasa rabu kamis jumat sabtu minggu",
  ]
    .join(" ")
    .split(" "),
);

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Same matching rules as `findTerms` in src/content/safety.ts (that module needs node:fs). */
export function findTerms(text: string, terms: readonly string[]): string[] {
  return terms.filter((term) => {
    if (term.length > 2 && term.startsWith("/") && term.endsWith("/")) return new RegExp(term.slice(1, -1)).test(text);
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(term)}($|[^\\p{L}\\p{N}])`, "iu").test(text);
  });
}

const DEFAULT_LINKS: ReadonlySet<string> = new Set(ASK_LINK_PAGES);
/** Source tags the model adds after a sentence (owner decision 2026-10-24): "[S1]", "[S1, S3]", "[S1][S2]", "(S2)". */
const SOURCE_TAGS = /[ \t]*(?:\[\s*S\d{1,2}(?:\s*[,;]\s*S?\d{1,2})*\s*\]|\(\s*S\d{1,2}(?:\s*[,;]\s*S?\d{1,2})*\s*\))/g;
/** `[label](url)` with an url of no whitespace and at most one level of parentheses (a site path has none). */
const MD_LINK = /\[([^[\]\n]+)\]\(([^\s()]*(?:\([^\s()]*\)[^\s()]*)*)\)/g;

/** The link an answer may keep: a site path in `links` (locale-less), or the public repository when `links` holds it (older cached answers). */
function keptLink(url: string, links: ReadonlySet<string>): string | null {
  const target = askLinkTarget(url);
  if (target?.kind === "site") return links.has(target.path) ? target.path : null;
  if (target?.kind === "external" && target.href === ASK_REPO_CITE && links.has(ASK_REPO_CITE)) return ASK_REPO_CITE;
  return null;
}

/**
 * Cleanup of model output (T6) to the safe markdown subset the dock renders (owner request 2026-10-16):
 * newlines, list markers, bold, italic and single backticks stay; invisible characters, HTML, images,
 * heading marks, code fence markers and em dashes go. Every `[label](url)` keeps only an allowlisted
 * site path in `links` (default: the top pages) or the repository, normalized; any other link becomes
 * its label. Length capped at a sentence or line boundary.
 */
export function sanitizeAnswer(raw: string, links: ReadonlySet<string> = DEFAULT_LINKS): string {
  let text = raw
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(INVISIBLE, "")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?(<\/\1\s*>|$)/gi, " ")
    .replace(/<\/?[A-Za-z!][^>]*>?/g, " ")
    .replace(/!\[[^\]\n]*\]\([^)\n]*\)?/g, "")
    // An echoed CONTEXT annotation is not part of the answer, nor are source tags ([S1], [S2, S3]).
    .replace(/[ \t]*\[link:[^\]\n]*\]/gi, "")
    .replace(SOURCE_TAGS, "")
    .replace(/^[ \t]*(?:```|~~~)[^\n]*(?:\n|$)/gm, "")
    .replace(/`{2,}/g, "")
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, "")
    .replace(/[ \t]*\u2014[ \t]*/g, ", ")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (text.length > MAX_ANSWER_CHARS) {
    const cut = text.slice(0, MAX_ANSWER_CHARS);
    const sentence = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
    const line = cut.lastIndexOf("\n");
    if (Math.max(sentence, line) > 200) text = (sentence >= line ? cut.slice(0, sentence + 1) : cut.slice(0, line)).trimEnd();
    else text = `${cut.replace(/\s+\S*$/, "")}...`;
  }
  // Repeat until stable: dropping a link can expose a new one ("[[x](y)](z)").
  for (let previous = ""; previous !== text; ) {
    previous = text;
    text = text.replace(MD_LINK, (_, label: string, url: string) => {
      const kept = keptLink(url, links);
      return kept ? `[${label}](${kept})` : label;
    });
  }
  return text;
}

/** A stock interjection or Rover opener at the start of an answer ("Beep!", "Beep boop,", "Rolling over to his projects:"). */
const OPENER = /^\s*(?:\*{1,2}|_)?(?:(?:beep|boop|bleep|bloop|bzzt|whirr+|vroom|zap|ding)(?:[\s-]+(?:beep|boop|bleep|bloop))*(?:\*{1,2}|_)?\s*[!.,:]+|(?:rolling|zooming|scanning|beaming|whirring)\b[^.!?:\n]{0,40}[:!]+)(?:\*{1,2}|_)?\s*/i;

export function startsWithInterjection(text: string): boolean {
  return OPENER.test(text);
}

/**
 * Factual answers start with their content (owner decision 2026-10-19): a leading interjection is removed and the
 * next letter capitalized. Greetings and declines are canned, so they keep theirs.
 */
export function stripOpener(text: string): string {
  const rest = text.replace(OPENER, "");
  return rest === text || !rest ? text : rest.charAt(0).toUpperCase() + rest.slice(1);
}

/** Link targets an answer may keep: the top pages plus every retrieved chunk's page (site paths locale-less, the repository as itself). */
export function answerLinkPaths(chunks: readonly KnowledgeChunk[]): Set<string> {
  const out = new Set(ASK_LINK_PAGES);
  for (const chunk of chunks) {
    const target = chunk.url ? askLinkTarget(chunk.url) : null;
    if (target?.kind === "site") out.add(target.path);
    else if (target?.kind === "external" && target.href === ASK_REPO_CITE) out.add(ASK_REPO_CITE);
  }
  return out;
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
    // In a hyphenated compound only the capitalized parts name something ("OpenAI-powered": "OpenAI", not "powered").
    const parts = word.split("-").filter((part, i) => i === 0 || /^[\p{Lu}\p{N}]/u.test(part)).join(" ").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    // A plural of a known word ("LLMs" for "LLM") is known too.
    const known = (part: string) => vocabulary.has(part) || (part.length > 3 && part.endsWith("s") && vocabulary.has(part.slice(0, -1)));
    return parts.some((part) => !known(part) && !COMMON_CAPS.has(part) && !extra.has(part) && !/^\d+$/.test(part));
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
  "I'm Rover, the guide robot of ShinyQ HQ.",
  "I only answer questions about Kurniadi: his projects, skills, career, writing, availability, this site and his written views.",
  // Rule 18 allows the bridging sentence (each language), and rules 11 and 18 ask for the contact card invitation.
  "A similar problem would likely start the same way.",
  "Masalah serupa kemungkinan besar dimulai dengan cara yang sama.",
  "Feel free to get in touch: the site shows a contact card under the answer.",
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

/**
 * First-person voice as Kurniadi (T18). Rover, the answering guide robot, may say "I" for itself (owner decision
 * 2026-10-19), but only in its guide phrases; any other "I", "my", "aku" or "saya" clause counts as speaking as
 * Kurniadi (an allow-list, security review 2026-10-19: a list of forbidden verbs is always incomplete). Quoted text
 * is his written words and does not count; curly apostrophes are folded first.
 */
const ROVER_I =
  /^I(?:'m|\s+am)\s+(?:Rover|the (?:HQ's |small )?guide|a (?:small )?guide|only|not|just|sorry|afraid|unable|happy to)\b|^I(?:'ll|\s+will|'d|\s+would)\s+(?:point|show|take|guide|roll|answer|be happy)\b|^I(?:'ve|\s+have)\s+(?:found|checked|looked|searched|no)\b|^I(?:'d|\s+would)?\s+(?:suggest|recommend)\s+(?:asking|trying|checking|looking|reading|exploring|starting)\b|^I(?:'d|\s+would)?\s+(?:invite|encourage)\s+you\b|^I\s+(?:answer|found|find|can|could|can't|cannot|couldn't|don't|do not|didn't|did not|only|have no|haven't|see|checked|looked|searched|scanned|spotted)\b/;
const ROVER_MY = /^[Mm]y\s+(?:map|maps|sensors?|circuits?|scanner|wheels|tour|antenna|search|apologies|name is Rover)\b/;
/** "saya" as an object ("ke saya") or Rover's own guide verbs ("Saya Rover", "saya menemukan"). */
const SAYA_BEFORE = /(?:^|\s)(?:ke|kepada|dari|oleh|untuk|pada|bagi|dengan|jawaban|peta|sensor)\s+$/i;
const SAYA_AFTER = /^saya\s+(?:Rover|robot|menemukan|temukan|bisa|dapat|hanya|belum (?:menemukan|punya|memiliki)|cek|periksa|lihat|arahkan|tunjukkan|jawab|menjawab|akan (?:menunjukkan|mengarahkan|tunjukkan|jawab)|tidak (?:bisa|dapat|menemukan|membahas|menulis|punya informasi|memiliki informasi|tahu))\b/i;
const SELF_ID = /\bKurniadi here\b|\b(?:my name is|I'm|I am) Kurniadi\b|\bas Kurniadi\b(?!['\u2019]s)|\b(?:nama saya|saya(?: adalah)?) Kurniadi\b|\baku\b/i;

export function firstPersonVoice(text: string): boolean {
  const unquoted = text.replace(/[\u2018\u2019\u02BC]/g, "'").replace(/"[^"]*"|\u201C[^\u201D]*\u201D/g, " ");
  if (SELF_ID.test(unquoted)) return true;
  for (const m of unquoted.matchAll(/\bI(?=['\s])/g)) if (!ROVER_I.test(unquoted.slice(m.index, m.index + 60))) return true;
  for (const m of unquoted.matchAll(/\b[Mm]y\s/g)) if (!ROVER_MY.test(unquoted.slice(m.index, m.index + 40))) return true;
  for (const m of unquoted.matchAll(/\bsaya\b/gi)) {
    if (SAYA_BEFORE.test(unquoted.slice(Math.max(0, m.index - 20), m.index))) continue;
    if (!SAYA_AFTER.test(unquoted.slice(m.index, m.index + 60))) return true;
  }
  return false;
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

/**
 * Sources an adjacent answer may cite (owner decision 2026-10-19): his written views plus his case studies and
 * papers. A lesson from a project is "what his work shows", never his opinion (that still needs `SOURCE_TYPES`).
 */
export const ADJACENT_SOURCE_TYPES: ReadonlySet<ChunkType> = new Set<ChunkType>([...SOURCE_TYPES, "project", "publication"]);

const isSource = (chunk: KnowledgeChunk, types: ReadonlySet<ChunkType> = SOURCE_TYPES) => types.has(chunk.type) && !chunk.keywords.includes("personal");

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
  return citedSources(answer, chunks, locale)[0];
}

/** Every retrieved source of `types` the answer cites (same rule as `citedSource`; a project also by its title). */
export function citedSources(answer: string, chunks: readonly KnowledgeChunk[], locale: AskLocale, types: ReadonlySet<ChunkType> = SOURCE_TYPES): KnowledgeChunk[] {
  const folded = ` ${fold(answer)} `;
  const runs = new Set(contentRuns(answer));
  const named = (title: string) => fold(title).length >= 8 && folded.includes(` ${fold(title)} `);
  return chunks
    .filter((chunk) => isSource(chunk, types))
    .filter((chunk) => {
      if (sourceTitles(chunk, locale).some(named)) return true;
      if (chunk.type !== "perspective" && chunk.type !== "principle" && named(chunk.title)) return true;
      const own = new Set(contentRuns(locale === "id" ? chunk.text_id : chunk.text_en));
      return [...runs].filter((run) => own.has(run)).length >= 2;
    });
}

/** Least share of a tagged sentence's own words found in the chunk it tags: a tag on an invented claim cites nothing. */
export const MARKER_MIN_GROUNDED = 0.5;
/** Fewest own content words of a tagged sentence. */
export const MARKER_MIN_WORDS = 3;

/**
 * Retrieved chunks the answer tags with source markers (owner decision 2026-10-24): CONTEXT line n is `[Sn]` and is
 * `chunks[n - 1]`. A tag counts only when its sentence (markers, framing and the question's words aside) mostly uses
 * words of that chunk (`MARKER_MIN_GROUNDED`), so a correct paraphrase is cited and an invented opinion is not.
 */
export function markedSources(answer: string, chunks: readonly KnowledgeChunk[], question = ""): KnowledgeChunk[] {
  const out: KnowledgeChunk[] = [];
  const asked = new Set(tokenize(question));
  // Tags written after the full stop ("... oversight. [S2]") belong to the sentence before them.
  const moved = answer.replace(/([.!?])((?:\s*[[(]\s*S\d{1,2}(?:\s*[,;]\s*S?\d{1,2})*\s*[\])])+)/g, "$2$1");
  for (const sentence of moved.split(/(?<=[.!?])\s+|\n+/)) {
    const tags = [...sentence.matchAll(/[[(]\s*(S\d{1,2}(?:\s*[,;]\s*S?\d{1,2})*)\s*[\])]/g)].flatMap((g) => [...g[1].matchAll(/\d{1,2}/g)].map((n) => Number(n[0])));
    if (!tags.length) continue;
    const plain = sentence.replace(SOURCE_TAGS, " ");
    // A tag on a bare pointer ("His view is in [S3].") cites nothing: the sentence must say something itself.
    if (tokenize(plain).filter((t) => !FRAMING.has(t) && !asked.has(t)).length < MARKER_MIN_WORDS) continue;
    for (const n of tags) {
      const chunk = chunks[n - 1];
      if (!chunk || out.includes(chunk)) continue;
      if (groundedShare(plain, `${chunk.title} ${chunk.text_en} ${chunk.text_id}`, question) >= MARKER_MIN_GROUNDED) out.push(chunk);
    }
  }
  return out;
}

/** Most "Read on this site" links one answer shows (owner decision 2026-10-24). */
export const MAX_CITES = ASK_MAX_CITES;

/** Allowlisted pages of cited chunks, in order, one per kind (their links read "Read on this site: <kind>"), at most `MAX_CITES`. */
export function citePages(cited: readonly KnowledgeChunk[]): string[] {
  const out: string[] = [];
  for (const url of cited.map((c) => c.url)) {
    if (!isAskCite(url) || out.some((u) => citeKind(u) === citeKind(url))) continue;
    out.push(url);
  }
  return out.slice(0, MAX_CITES);
}

/** Words an adjacent answer may add around CONTEXT: Rover's voice, framing ("his work shows") and common function words. */
const FRAMING = new Set(
  (
    "rover beep kurniadi work works worked shows show showed project projects case study studies written view views post posts title lesson lessons from his he him according closest source sources read site say says said also but so like see keep keeps use uses used one ones both while rather instead because which when where what why how should would could can may might not no yes hasn hasn't has have had been being written wrote writes note notes found " +
    "karya menunjukkan proyek studi kasus pandangan tertulis tulisan pelajaran dari menurut sumber situs bahwa tetapi namun ia dia belum sudah juga karena saat ketika sebaiknya seharusnya bisa dapat tidak bukan menulis tulis ditulis"
  ).split(" "),
);
/** Least share of an adjacent answer's own words that must come from CONTEXT or the question (security review 2026-10-19: a named title alone is not grounding). */
export const ADJACENT_MIN_GROUNDED = 0.65;
/** Wording of general knowledge, which an adjacent answer must never use (rule 13). */
const GENERALITY = /(?:in general|generally(?: speaking)?|typically|in most cases|as a rule of thumb|industry best practice|secara umum|pada umumnya|umumnya)/i;

/**
 * Share of an answer's content words (framing and the question's own words aside) that appear in CONTEXT; a word
 * also counts when CONTEXT has a word with the same first five letters ("reviewers", "reviewer").
 */
export function groundedShare(answer: string, context: string, question = ""): number {
  const ctx = new Set(tokenize(context));
  const stems = new Set([...ctx].filter((t) => t.length >= 5).map((t) => t.slice(0, 5)));
  const asked = new Set(tokenize(question));
  const words = [...new Set(tokenize(answer.replace(/[\u2018\u2019]/g, "'")))].filter((t) => !FRAMING.has(t) && !asked.has(t) && !/^\d+$/.test(t));
  if (!words.length) return 1;
  return words.filter((t) => ctx.has(t) || (t.length >= 5 && stems.has(t.slice(0, 5)))).length / words.length;
}

/** Question words that frame a question rather than name its topic (EN/ID), on top of words in more than a fifth of the chunks. */
const FRAME_TERMS = new Set(
  (
    "kurniadi think thinks thought view views opinion opinions stance believe believes would what when where why which how ever bad good idea ideas better worse best worst versus vs should shouldn use used using work works written write wrote does do did is are " +
    "apa pendapat pandangan menurut tentang kapan mana mengapa kenapa bagaimana bukan pilihan tepat sebaiknya seharusnya tidak dipakai digunakan memakai menggunakan baik buruk lebih dibanding dibandingkan ide"
  ).split(" "),
);
/** Share of chunks above which a term is too common to name a question's topic ("ai", "data"). */
const TOPIC_COMMON_SHARE = 0.2;

/**
 * The closest written source only when it is about the question's topic (owner decision 2026-10-19): the question's
 * topic terms (frame words and terms in more than a fifth of the chunks aside) must all exist in the pack, and the
 * chosen source must contain one of them; the source with the most specific overlap wins. Otherwise undefined, and
 * the no-view reply suggests topics instead of a title. The blockchain question has no topic term in the pack.
 */
export function relevantClosest(pack: KnowledgePack, question: string, chunks: readonly KnowledgeChunk[], locale: AskLocale, options: { adjacent?: boolean } = {}): { title: string; url: string } | undefined {
  const index = indexPack(pack);
  const n = pack.chunks.length;
  // A plural the pack only has in the singular ("LLMs") counts as the singular.
  const df = (t: string) => index.df.get(t) ?? 0;
  const singular = (t: string) => (!df(t) && t.length > 3 && t.endsWith("s") && df(t.slice(0, -1)) ? t.slice(0, -1) : t);
  const terms = [...new Set(expandTokens(tokenize(question)).map(singular))].filter((t) => !FRAME_TERMS.has(t) && df(t) <= n * TOPIC_COMMON_SHARE);
  if (!terms.length || terms.some((t) => !df(t))) return undefined;
  const allowed = options.adjacent ? ["post", "talk", "project", "publication", "principle"] : ["post", "talk", "principle", "publication"];
  let best: { chunk: KnowledgeChunk; score: number } | undefined;
  for (const chunk of chunks) {
    if (!allowed.includes(chunk.type) || chunk.keywords.includes("personal") || !isAskCite(chunk.url)) continue;
    const i = pack.chunks.indexOf(chunk);
    if (i < 0) continue;
    const score = terms.reduce((sum, t) => sum + (index.tfOf(i, t) ? Math.log(1 + n / df(t)) : 0), 0);
    if (score > 0 && (!best || score > best.score)) best = { chunk, score };
  }
  if (!best?.chunk.url) return undefined;
  const chunk = best.chunk;
  return { title: chunk.type === "project" || chunk.type === "publication" ? chunk.title : sourceTitles(chunk, locale)[0], url: chunk.url as string };
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

/** His own words on which freelance or part-time engagements he takes (owner-endorsed perspective), when published. */
export const LEAD_ENGAGEMENTS = "perspective-freelance-engagements";

/** Free consulting in a lead answer: time or cost estimates and designing the visitor's system (owner rule 2026-10-15). */
const CONSULTING: RegExp[] = [
  /\b\d+\s*(?:-|to|or|sampai|hingga|atau)?\s*\d*\s*(?:hours?|days?|weeks?|months?|sprints?|jam|hari|minggu|bulan)\b/i,
  /\b(?:would|will|could|might|should) (?:cost|take)\b|\b(?:estimated|estimates?|budget|pricing|quote|biaya|anggaran|harga|estimasi|perkiraan)\b[^.]{0,30}\b(?:\d|weeks?|months?|days?|minggu|bulan|hari)\b/i,
  /\b(?:you (?:should|could|can|would|might) (?:use|build|start|deploy|choose|consider|set up|add)|i(?: would|'d)? (?:recommend|suggest)|the (?:architecture|design|stack) (?:would|should|could|will)|(?:recommended|suggested) (?:stack|architecture|approach|design)|step (?:1|one)\b|first,? (?:set up|create|build|define)|sebaiknya (?:anda |kamu )?(?:gunakan|memakai|menggunakan|pakai|membangun)|disarankan (?:untuk )?(?:menggunakan|memakai)|arsitekturnya (?:bisa|akan|sebaiknya))/i,
];

export function consulting(text: string): boolean {
  return CONSULTING.some((re) => re.test(text)) || text.split(/(?<=[.!?])\s+/).filter(Boolean).length > 5;
}

/**
 * Visitor or future framing: a duration in such a sentence is a timeline for the visitor, even when CONTEXT states it
 * ("Yours could be live in 2 days").
 */
const VISITOR_TIMELINE =
  /\b(?:you|your|yours|we|our|expect(?:s|ed)?|within|could|can|will|would be|akan|bisa|dalam waktu|kamu|anda|kalian|kami)\b/i;

/** Most sentences and list items of an approach answer (rule 18: 6 sentences or 4 items, plus the invitation). */
export const APPROACH_MAX_SENTENCES = 7;
export const APPROACH_MAX_ITEMS = 4;

/** A sentence that addresses the visitor ("your call center", "call center kalian"): an approach answer is about his past work. */
const ADDRESSES_VISITOR = /\b(?:you|your|yours|kamu|anda|kalian)\b/i;
/** A sentence that starts with an order ("Start with ...", "Gunakan ..."). */
const IMPERATIVE = /^[^\p{L}\p{N}]*(?:start|use|build|add|pick|choose|consider|try|deploy|set up|mulai|gunakan|pakai|bangun|tambahkan|pilih|coba)\b/iu;
/** Words that look ahead (folded: "he'll" is "he ll"). */
const PROSPECTIVE = new Set(["would", "will", "ll", "might", "should", "akan", "sebaiknya", "seharusnya"]);
/** The one forward-looking sentence rule 18 allows, in each language, exactly. */
export const APPROACH_BRIDGE = {
  en: "A similar problem would likely start the same way.",
  id: "Masalah serupa kemungkinan besar dimulai dengan cara yang sama.",
} as const;
const BRIDGES = new Set(Object.values(APPROACH_BRIDGE).map((b) => fold(b)));
/** Vague durations, always an estimate ("a few weeks", "beberapa minggu", "dalam hitungan hari"). */
const VAGUE_DURATION = /\b(?:a few|several|(?:a )?couple of)\s+(?:days?|weeks?|months?|sprints?)\b|\b(?:beberapa|dalam hitungan)\s+(?:hari|minggu|bulan)\b/i;
/** Spelled-out durations ("six weeks", "dua minggu"): checked like digits, so a case-study fact stays a fact. */
const WORD_DURATION = /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:days?|weeks?|months?|sprints?)\b|\b(?:satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|sebelas|dua belas)\s+(?:hari|minggu|bulan)\b/gi;

/**
 * A forward-looking word in a sentence that is not the exact bridge: allowed only inside words CONTEXT or his
 * retrieved written views state (the word and the next two, "the system will always work"), as a case-study duration is.
 */
function looksAhead(sentence: string, stated: string): boolean {
  const words = fold(sentence.replace(SOURCE_TAGS, " ")).split(" ");
  if (BRIDGES.has(words.join(" "))) return false;
  return words.some((w, i) => PROSPECTIVE.has(w) && !stated.includes(` ${words.slice(i, i + 3).join(" ")} `));
}

/**
 * Free consulting in an approach answer (owner decision 2026-10-25, final review F2): the lead patterns
 * (visitor-directed advice, cost and estimate words), any sentence that addresses the visitor, starts with an order or
 * looks ahead (only the exact bridge `APPROACH_BRIDGE` may), any vague duration and any duration CONTEXT does not
 * state, or more than `APPROACH_MAX_SENTENCES` sentences or `APPROACH_MAX_ITEMS` list items. A duration from a case
 * study ("from 3 days to 4 hours", "six weeks") is a fact, not an estimate. `views` is the full text of his retrieved
 * written views (CONTEXT may clip them), read only for the forward-looking words of his own sentences.
 */
export function prescribes(text: string, markdown: string, context: string, views = ""): boolean {
  const ctx = ` ${fold(context)} `;
  const stated = `${ctx}${fold(views)} `;
  for (const sentence of text.split(/(?<=[.!?])\s+|\n+/)) {
    if (ADDRESSES_VISITOR.test(sentence) || IMPERATIVE.test(sentence) || VAGUE_DURATION.test(sentence) || looksAhead(sentence, stated)) return true;
    const durations = [...sentence.matchAll(new RegExp(CONSULTING[0].source, "gi")), ...sentence.matchAll(WORD_DURATION)].map((m) => fold(m[0]));
    if (durations.length && (VISITOR_TIMELINE.test(sentence) || durations.some((d) => !ctx.includes(` ${d} `)))) return true;
  }
  if (CONSULTING.slice(1).some((re) => re.test(text))) return true;
  const items = parseMarkdown(markdown).reduce((n, b) => n + (b.type === "p" ? 0 : b.items.length), 0);
  return items > APPROACH_MAX_ITEMS || text.split(/(?<=[.!?])\s+/).filter(Boolean).length > APPROACH_MAX_SENTENCES;
}

/** Chunk types an approach answer outlines (the matches are past projects). */
const APPROACH_TYPES: ReadonlySet<ChunkType> = new Set<ChunkType>(["project", "side-project"]);

/** A lead answer that claims a fit (only allowed when retrieval found matching past projects). */
const FIT_CLAIM = /\b(?:strong|good|great|close|natural|solid|perfect|excellent|ideal) (?:fit|match)\b|\bwell[- ]suited\b|\bperfect for\b|\bgood chance\b|\b(?:very|highly) likely\b|\bcocok\b|\bsangat sesuai\b|\bkemungkinan besar\b|\bpeluang (?:yang )?(?:besar|bagus|baik)\b/i;

export function claimsFit(text: string): boolean {
  return FIT_CLAIM.test(text);
}

export type CheckFailure = "forbidden" | "secret" | "leak" | "roleplay" | "defamation" | "numeric" | "entity" | "employer" | "unsourced" | "empty" | "code" | "personal-data" | "consulting" | "fit";

export type CheckResult =
  | { ok: true; text: string; outcome: Extract<AskOutcome, "answer" | "unknown" | "decline">; cite?: string; cites?: string[] }
  | { ok: false; reason: CheckFailure; detail: string[]; replacement: CannedKind };

export interface CheckInput {
  answer: string;
  question: string;
  context: string;
  packDate: string;
  pack: Pick<KnowledgePack, "entities">;
  vocabulary: ReadonlySet<string>;
  /** Retrieved chunks (the perspective source check); empty means no written source is available. */
  chunks?: readonly KnowledgeChunk[];
  /** The question asks for Kurniadi's views (`isPerspectiveQuestion`). */
  perspective?: boolean;
  /** The question is about this site itself (`isSiteQuestion`): an answer cites the `site` chunk's page (`/build`). */
  site?: boolean;
  /** Routed perspective topic (`routedTopic`): the answer must follow one of that topic's perspectives. */
  topic?: RoutedTopic;
  /** Lead intent (`isLeadQuestion`): `fit` is true when retrieval found matching past projects (`leadMatches`). */
  lead?: { fit: boolean };
  /** Bring your problem (owner decision 2026-10-25, with `lead`): the matches the answer must outline and cite by title. */
  approach?: { matches: readonly KnowledgeChunk[] };
  /** A related professional question (`isAdjacentQuestion`): the answer must cite his work from CONTEXT (rule 13). */
  adjacent?: boolean;
  /** A learning or career question (`isMentoringQuestion`): his own path from CONTEXT, never general advice (rule 15). */
  mentoring?: boolean;
  locale?: AskLocale;
}

/**
 * Output checks in spec order (7.4 step 8). The first failure decides the replacement message.
 * Safety scans read the markdown answer with its links (URLs included) and its plain text; content checks read the plain text.
 */
export function checkAnswer({ answer, question, context, packDate, pack, vocabulary, chunks = [], perspective = false, site = false, topic, lead, approach, adjacent = false, mentoring = false, locale = "en" }: CheckInput): CheckResult {
  const markdown = stripOpener(sanitizeAnswer(answer, answerLinkPaths(chunks)));
  const text = markdown ? markdownToPlain(markdown).trim() : "";
  if (!text) return { ok: false, reason: "empty", detail: [], replacement: "fallback" };
  // Both forms: the markdown carries the link URLs, the plain text joins words that marks split.
  const scanned = [markdown, text];
  if (scanned.some((s) => FORBIDDEN_OUTPUT.some((re) => re.test(s)))) return { ok: false, reason: "forbidden", detail: [], replacement: "restricted" };
  if (scanned.some((s) => SECRET_PATTERNS.some((re) => re.test(s)))) return { ok: false, reason: "secret", detail: [], replacement: "restricted" };
  if (leaksPrompt(text)) return { ok: false, reason: "leak", detail: [], replacement: lead ? "lead" : "decline" };
  // Before the voice check: "I recommend ..." in an approach answer is consulting first (same lead replacement).
  if (lead && approach && prescribes(text, markdown, context, chunks.filter((c) => isSource(c)).map((c) => `${c.text_en} ${c.text_id}`).join(" "))) return { ok: false, reason: "consulting", detail: [], replacement: "lead" };
  if (firstPersonVoice(text)) return { ok: false, reason: "roleplay", detail: [], replacement: lead ? "lead" : "decline" };
  if (containsCode(text)) return { ok: false, reason: "code", detail: [], replacement: lead ? "lead" : "decline" };
  if (asksForPersonalData(text)) return { ok: false, reason: "personal-data", detail: [], replacement: lead ? "lead" : "unknown" };
  if (lead && !approach && consulting(text)) return { ok: false, reason: "consulting", detail: [], replacement: "lead" };
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
  // Source tags the model put after its sentences, kept only when the sentence really uses that line (rule 17).
  const marked = markedSources(answer, chunks, question);
  if (lead) {
    // A view told as his, on any lead answer, must cite his written view (rule 8, final review F1). A plain lead may
    // restate his engagement terms; in an approach answer the invitation echoes that view, so it never counts there.
    const views = [...citedSources(text, chunks, locale), ...marked.filter((c) => isSource(c))].filter((c, i, all) => all.indexOf(c) === i && (!approach || c.id !== LEAD_ENGAGEMENTS));
    if (claimsOpinion(text) && !views.length) return { ok: false, reason: "unsourced", detail: ["opinion"], replacement: "lead" };
    // Bring your problem: grounded in CONTEXT like an adjacent answer, outlining at least one matched project by title
    // (or a source tag on it).
    if (approach && outcome === "answer") {
      if (GENERALITY.test(text) || groundedShare(text, context, question) < ADJACENT_MIN_GROUNDED) return { ok: false, reason: "unsourced", detail: ["ungrounded"], replacement: "lead" };
      const projects = [...citedSources(text, approach.matches, locale, APPROACH_TYPES), ...marked.filter((c) => approach.matches.includes(c))].filter((c, i, all) => all.indexOf(c) === i);
      if (!projects.length) return { ok: false, reason: "unsourced", detail: [], replacement: "lead" };
      const pages = citePages([...projects, ...views]);
      return { ok: true, text: markdown, outcome, ...(pages.length ? { cite: pages[0] } : {}), ...(pages.length > 1 ? { cites: pages } : {}) };
    }
    // A plain lead answer is about his past work and availability: checked above, no cite.
    return { ok: true, text: markdown, outcome };
  }
  const withCites = (cited: readonly KnowledgeChunk[]): CheckResult => {
    const pages = citePages(cited);
    return { ok: true, text: markdown, outcome, ...(pages.length ? { cite: pages[0] } : {}), ...(pages.length > 1 ? { cites: pages } : {}) };
  };
  // A related professional question is answered only from his work (rule 13), and a learning question only from his
  // own path (rule 15): mostly CONTEXT words, no general-knowledge wording. An adjacent answer must cite a retrieved
  // case study, post, talk, paper or written view; a lesson told as his opinion must cite his written view (rule 8).
  if ((adjacent || mentoring) && outcome === "answer") {
    if (GENERALITY.test(text) || groundedShare(text, context, question) < ADJACENT_MIN_GROUNDED) return { ok: false, reason: "unsourced", detail: ["ungrounded"], replacement: "noView" };
    const opinion = claimsOpinion(text);
    const cited = [...citedSources(text, chunks, locale, ADJACENT_SOURCE_TYPES), ...marked.filter((c) => isSource(c, ADJACENT_SOURCE_TYPES))].filter((c, i, all) => all.indexOf(c) === i && (!opinion || SOURCE_TYPES.has(c.type)));
    if (adjacent && !cited.length) return { ok: false, reason: "unsourced", detail: [], replacement: "noView" };
    if (mentoring && opinion && !cited.length) return { ok: false, reason: "unsourced", detail: [], replacement: "noView" };
    return withCites(cited);
  }
  // Opinions need a written source (spec section 13): a perspective question, or any answer that claims one.
  // Lifestyle and policy (routed topics) must follow one of that topic's perspectives: a quoted title, two shared
  // three-word runs, or a source tag on a sentence that uses that view.
  if (outcome === "answer" && (perspective || topic || claimsOpinion(text))) {
    const pool = topic ? chunks.filter((c) => c.type === "perspective" && c.keywords.includes(topic)) : chunks;
    const cited = [...citedSources(text, pool, locale), ...marked.filter((c) => pool.includes(c) && isSource(c))].filter((c, i, all) => all.indexOf(c) === i);
    if (!cited.length) return { ok: false, reason: "unsourced", detail: [], replacement: "noView" };
    return withCites(cited);
  }
  // How this site was built: the answer comes from the retrieved `site` chunk, so it cites its page (`/build`).
  const siteSource = site && outcome === "answer" ? chunks.find((c) => c.type === "site" && isAskCite(c.url)) : undefined;
  if (siteSource?.url) return { ok: true, text: markdown, outcome, cite: siteSource.url };
  return { ok: true, text: markdown, outcome };
}

/**
 * Title Case for content titles (owner decision 2026-10-12): pod, post, publication, talk, side
 * project, award and principle titles are stored in Title Case in `content/site-content.json` and the
 * MDX frontmatter, never cased with CSS. `tests/content/title-case.test.ts` fails on a title that
 * `titleCase` would change, and `bun scripts/title-case.ts --write` fixes them.
 *
 * Rules: every word starts with a capital, except minor words (articles, short prepositions and
 * conjunctions, in English and Indonesian) that are not the first word, the last word or the first
 * word after a colon. Words that already carry a capital after their first letter (acronyms and
 * brands such as AI, SaaS, PoC, IndoBERT, iOS, .NET) are kept as written, and `BRAND_CASING` fixes
 * brands that would otherwise be lowercased or capitalized wrongly (e2e, iOS). Hyphenated and
 * slashed compounds case each part (E-Commerce, Chart-of-Accounts, Error-nya).
 */

/** English minor words (owner list). */
const MINOR_EN = ["a", "an", "and", "as", "at", "but", "by", "for", "in", "of", "on", "or", "the", "to", "vs", "via", "with"];
/**
 * Indonesian minor words: the owner list plus the other prepositions and conjunctions PUEBI keeps
 * lowercase in titles ("dalam", "bagi", "oleh", "serta", "tentang", "sebagai", "terhadap", "kepada").
 */
const MINOR_ID = ["dan", "di", "ke", "dari", "untuk", "yang", "dengan", "atau", "pada", "dalam", "bagi", "oleh", "serta", "tentang", "sebagai", "terhadap", "kepada"];
/** Both lists apply in both locales: titles mix English and Indonesian ("Asisten AI Chart of Accounts"). */
export const MINOR_WORDS: ReadonlySet<string> = new Set([...MINOR_EN, ...MINOR_ID]);

/** Indonesian enclitics that stay lowercase after a hyphen ("Error-nya"). */
const ENCLITICS: ReadonlySet<string> = new Set(["nya", "ku", "mu"]);

/**
 * Canonical casing for acronyms and brands, keyed by their lowercase form. Words written with an
 * inner capital are kept anyway; this list fixes lowercase or mis-cased input. Common words that
 * are also acronyms (it, line, go) are left out on purpose, so "it" never becomes "IT".
 */
export const BRAND_CASING: Readonly<Record<string, string>> = Object.fromEntries(
  [
    "AI", "API", "ARIA", "ATLAS", "CI", "CNN", "CRUD", "CTF", "CV", "FREDDY", "GenAI", "GitHub", "IndoBERT", "IndoBERTweet",
    "iOS", "Kafka", "LiveKit", "LLM", "LSTM", "macOS", "MFT", "MII", "MySQL", "Node.js", "NodeJS", "ExpressJS", "OpenAI",
    "PoC", "Pris.AI", "RAG", "Redis", "SaaS", "SFTP", "UI", "UX", "Azure", "Fabric", ".NET", "e2e", "npm",
  ].map((word) => [word.toLowerCase(), word]),
);

/** Exact titles kept as their author styled them (creative works). */
export const TITLE_CASE_KEEP: ReadonlySet<string> = new Set(["The Sun, The Moon, and The Dark Sea"]);

const LEADING = /^[("'\u201C\u2018[]+/;
const TRAILING = /[)"'\u201D\u2019\].,:;!?]+$/;

type Position = "force" | "normal" | "after-hyphen";

function casePart(part: string, position: Position): string {
  const lower = part.toLowerCase();
  const brand = BRAND_CASING[lower];
  if (brand) return brand;
  if (position === "after-hyphen" && ENCLITICS.has(lower)) return lower;
  if (position !== "force" && MINOR_WORDS.has(lower)) return lower;
  if (/\p{Lu}/u.test(part.slice(1))) return part;
  return /^\p{Ll}/u.test(part) ? part[0].toLocaleUpperCase("en") + part.slice(1) : part;
}

function caseWord(word: string, force: boolean): string {
  const lead = LEADING.exec(word)?.[0] ?? "";
  const rest = word.slice(lead.length);
  const trail = TRAILING.exec(rest)?.[0] ?? "";
  const core = rest.slice(0, rest.length - trail.length);
  if (!core) return word;
  const parts = core.split(/([-/])/);
  // The first part of a compound is never minor ("In-House"); later parts follow the normal rules.
  const cased = parts.map((part, i) => (i % 2 === 1 ? part : casePart(part, i === 0 ? (force || parts.length > 1 ? "force" : "normal") : "after-hyphen")));
  return lead + cased.join("") + trail;
}

/** Title Case for one title (idempotent: `titleCase(titleCase(s)) === titleCase(s)`). */
export function titleCase(input: string): string {
  if (TITLE_CASE_KEEP.has(input)) return input;
  const tokens = input.split(/(\s+)/);
  const words = tokens.map((t, i) => (t.trim() ? i : -1)).filter((i) => i >= 0);
  const first = words[0];
  const last = words.at(-1);
  let subtitle = false;
  return tokens
    .map((token, i) => {
      if (!token.trim()) return token;
      const out = caseWord(token, i === first || i === last || subtitle);
      subtitle = token.endsWith(":");
      return out;
    })
    .join("");
}

/** True when a title already follows the rules. */
export function isTitleCase(input: string): boolean {
  return titleCase(input) === input;
}

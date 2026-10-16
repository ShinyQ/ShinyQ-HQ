# R3-D: Title Case Titles and Gallery-First Project Order Implementation Plan

Status: shipped in #52 (2c013bc), 2026-10-12. Later removed in #167: the "Tour my projects" walk whose order Task 6 set (gallery-first order stays everywhere else)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store every heading-style title (projects, posts, publications, talks, side projects, awards, principles) in Title Case in EN and ID, guard it with a test, and list projects with a gallery first in every project list (Page View, Home, Cmd-K, L3 docking, wing boards, "Tour my projects", Ask question bank).

**Architecture:** A pure `titleCase` function (`src/content/title-case.ts`) defines the rules; `src/content/titles.ts` enumerates the title fields of the dataset and the MDX frontmatter title; a one-off script (`scripts/title-case.ts --write`) rewrites the content, and a content test plus `validate:content` fail on any title the function would change. One comparator, `comparePods` / `orderPods` in `src/content/selectors.ts` (gallery first, then tier, then `order`), replaces `sortPods` and the L3 `tourOrder` sort, so every list derives from it; the L3 layout docks pods in uniform 12 u slots so both wings stay mirror images when gallery pods of different tiers move to the front.

**Tech Stack:** TypeScript strict, Next.js 16 static export, zod content schema, Vitest, Playwright, Bun.

## Global Constraints

- Repo: `ShinyQ/ShinyQ-HQ`, planned against `main` @ `2f986ab`. Read `AGENTS.md` before starting.
- No em dashes (U+2014) anywhere: code, comments, copy, docs, commit messages, PR text (`tests/content/safety.test.ts` scans the repo). Use commas, colons, parentheses or "to".
- Title Case is applied in the content itself, never with CSS `text-transform`.
- Title fields: `floors.labs.pods[].title` (EN, ID), `floors.library.posts[].title` (EN, ID) and the MDX frontmatter `title`, `floors.library.publications[].title`, `floors.library.talks[].title` (EN, ID), `sideProjects[].title`, `awards[].title`, `profile.principles[].title` (EN, ID). Not titles: role titles, org names, certification names, skill group labels, mission labels, body text.
- EN minor words (owner list): a, an, and, as, at, but, by, for, in, of, on, or, the, to, vs, via, with. ID minor words (owner list): dan, di, ke, dari, untuk, yang, dengan, atau, pada; this plan adds the PUEBI prepositions dalam, bagi, oleh, serta, tentang, sebagai, terhadap, kepada (only "dalam" occurs today). Both lists apply in both locales because titles mix English and Indonesian.
- Acronym and brand casing is preserved (AI, RAG, LLM, API, SFTP, MFT, SaaS, ARIA, Pris.AI, FREDDY, ATLAS, MII, iOS, IndoBERT, Kafka, Redis, Azure, OpenAI, LiveKit, Fabric, .NET, CI, e2e, plus PoC, GenAI, CV, UI, UX, CNN, LSTM, CRUD, CTF, NodeJS, ExpressJS, MySQL, IndoBERTweet, GitHub, macOS, npm, Node.js).
- Slugs, ids, URLs and room ids never change (`L3:voice-ai-contact-center` stays).
- Gallery first: a pod "has a gallery" when `pod.assets.length > 0`. Order = gallery first, then `tier` (hero, featured, listed), then `order`. One shared selector, never hard-coded slugs.
- Mission labels `best-swe` / `best-ai` name the wings exactly as `common.wing`: "Product Engineering", "AI Engineering" (both locales).
- Content is data (`content/site-content.json`); every content string stays `{ en, id }` where the schema says so.
- Coordination: parallel sessions revamp the landing (`src/app/[locale]/page.tsx`), the HUD (`src/hud/**`), pads, L4 and RF, and read titles from content. Keep this diff to content, selectors, the L3 layout ordering, tests and docs. Do not touch components or messages.
- Bun is the package manager; prefix shell commands with `rtk` where the repo docs do (`rtk git ...`). Conventional commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`). One PR; do not merge without the owner.
- `site-content.json` is written as `JSON.stringify(data, null, 2) + "\n"` (verified byte-identical round trip), so scripted rewrites keep the formatting.

---

## Before you start

- [x] Clone or update your own checkout (never the read-only reference clone) and branch from the latest `main`:

```bash
rtk git fetch origin && rtk git switch -c feat/content-casing-ordering origin/main
bun install
```

- [x] If `main` moved past `2f986ab`, other sessions may have added titles or pods. That is fine: Task 3 lists and fixes whatever is there, and the ordering tasks derive from data. Re-check the counts in the "Expected" lines against `bun scripts/title-case.ts` output instead of the numbers below when they differ.

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/content/title-case.ts` | Create | `titleCase`, `isTitleCase`, `MINOR_WORDS`, `BRAND_CASING`, `TITLE_CASE_KEEP`: the casing rules, pure, no imports. |
| `src/content/titles.ts` | Create | `titleSlots(content)`, `titleCaseChanges`, `applyTitleCase`, `frontmatterTitle`, `withFrontmatterTitle`: which dataset fields and MDX lines are titles. |
| `scripts/title-case.ts` | Create | CLI: list titles not in Title Case (exit 1), `--write` rewrites `site-content.json` and MDX frontmatter. |
| `scripts/validate-fragment.ts` | Modify | `full` mode (used by `bun run validate:content`) also fails on titles not in Title Case. |
| `tests/unit/title-case.test.ts` | Create | Unit tests for the casing rules. |
| `tests/unit/titles.test.ts` | Create | Unit tests for title slots and MDX frontmatter helpers (fixture content). |
| `tests/content/title-case.test.ts` | Create | Content lint: every title in the real dataset and MDX is in Title Case; MDX title equals the dataset title. |
| `content/site-content.json` | Modify | 100 titles re-cased (Appendix A), 2 mission labels renamed (Task 4). |
| `content/blog/*.mdx` | Modify | 8 frontmatter `title:` lines re-cased. |
| `tests/content/dataset.test.ts` | Modify | Mission labels name the wings. |
| `src/content/selectors.ts` | Modify | `PodRank`, `podHasGallery`, `comparePods`, `orderPods` replace `sortPods`. |
| `src/content/load.ts`, `src/experience/missions/rooms.ts` | Modify | Use `orderPods` (Page View lists, drawer prev/next, Quick view, Cmd-K catalog). |
| `tests/unit/selectors.test.ts` | Modify | `orderPods` / `comparePods` tests replace the `sortPods` test. |
| `src/experience/types.ts`, `src/content/experience.ts` | Modify | `LabPod.hasGallery` in the 3D payload. |
| `src/experience/floors/labs/layout.ts` | Modify | `tourOrder` uses `comparePods`; uniform `LABS.slot` keeps the wings mirrored; directory listed pods sorted. |
| `src/experience/missions/walks.ts`, `src/experience/floors/labs/Hub.tsx` | Modify | Doc comments only (behavior flows from `tourOrder`). |
| `tests/unit/labs-layout.test.ts`, `tests/unit/walk.test.ts`, `tests/unit/missions-host3d.test.ts` | Modify | Gallery-first docking and tour, `hasGallery` in fixtures. |
| `e2e/walk.spec.ts` | Modify | First tour stop derived from `orderPods` instead of the hard-coded `digital-banking-integrations`. |
| `content/ask/suggestions.json` | Modify | Reorder `work` and `ai` topic questions so project questions follow site order. |
| `tests/ask/suggestions.test.ts` | Modify | Guard the question bank order. |
| `AGENTS.md`, `README.md`, `docs/superpowers/specs/agent-hq/01-world-and-layout.md` | Modify | New "Content style" section; ordering and L3 docking docs. |
| `docs/superpowers/plans/2026-10-12-content-casing-ordering.md` | Create | Copy of this plan (repo convention: phase plans live in `docs/superpowers/plans/`). |

Deliberately unchanged: `tests/ask/golden.json` (its facts are matched case-insensitively and quote no titles; verified), `src/ask/pack.ts` (the "Projects summary" chunk keeps its hero-first order because it answers "best project" questions; titles flow in from content when the pack is rebuilt), components and messages (titles are read from content), OG cards (built from content at build time), slugs.

---

### Task 1: Title Case function

**Files:**
- Create: `src/content/title-case.ts`
- Test: `tests/unit/title-case.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `titleCase(input: string): string`, `isTitleCase(input: string): boolean`, `MINOR_WORDS: ReadonlySet<string>`, `BRAND_CASING: Readonly<Record<string, string>>` (lowercase key to canonical casing), `TITLE_CASE_KEEP: ReadonlySet<string>`.

- [x] **Step 1: Write the failing test**

Create `tests/unit/title-case.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { BRAND_CASING, isTitleCase, titleCase } from "@/content/title-case";

describe("titleCase", () => {
  it.each([
    ["Realtime voice AI contact center", "Realtime Voice AI Contact Center"],
    ["Contact center voice AI realtime", "Contact Center Voice AI Realtime"],
    ["Explainable credit scoring in the browser", "Explainable Credit Scoring in the Browser"],
    ["Credit scoring di browser yang dapat dijelaskan", "Credit Scoring di Browser yang Dapat Dijelaskan"],
    ["From a request to a tool-using agent with tracing in Microsoft Agent Framework", "From a Request to a Tool-Using Agent with Tracing in Microsoft Agent Framework"],
    ["Mengapa fraud engine yang lebih baik dirilis dalam shadow mode", "Mengapa Fraud Engine yang Lebih Baik Dirilis dalam Shadow Mode"],
  ])("capitalizes major words and keeps minor words lowercase: %s", (input, expected) => {
    expect(titleCase(input)).toBe(expected);
  });

  it("capitalizes the first word, the last word and the first word after a colon", () => {
    expect(titleCase("the case for evals")).toBe("The Case for Evals");
    expect(titleCase("what to log for")).toBe("What to Log For");
    expect(titleCase("45% of our LLM calls failed: what the error strings told us")).toBe("45% of Our LLM Calls Failed: What the Error Strings Told Us");
    expect(titleCase("Gemastik 2022: data mining")).toBe("Gemastik 2022: Data Mining");
  });

  it("lowercases minor words written with a capital", () => {
    expect(titleCase("CRUD NodeJS Menggunakan Framework ExpressJS Dan MySQL")).toBe("CRUD NodeJS Menggunakan Framework ExpressJS dan MySQL");
    expect(titleCase("Capture The Flag Competition")).toBe("Capture the Flag Competition");
    expect(titleCase("Kafka Vs. Redis Streams")).toBe("Kafka vs. Redis Streams");
  });

  it("keeps acronyms and brand casing", () => {
    expect(titleCase("Bank GenAI portal governance")).toBe("Bank GenAI Portal Governance");
    expect(titleCase("Bank statement analysis PoC")).toBe("Bank Statement Analysis PoC");
    expect(titleCase("Multi-tenant SaaS and asset management")).toBe("Multi-Tenant SaaS and Asset Management");
    expect(titleCase("IndoBERTweet app-review sentiment model")).toBe("IndoBERTweet App-Review Sentiment Model");
    expect(titleCase("shipping ios and .NET apps with e2e tests")).toBe("Shipping iOS and .NET Apps with e2e Tests");
    expect(titleCase("pris.ai and openai on azure")).toBe("Pris.AI and OpenAI on Azure");
    expect(titleCase("S&P 500 portfolio optimizer")).toBe("S&P 500 Portfolio Optimizer");
    expect(BRAND_CASING.it).toBeUndefined();
    expect(titleCase("why it failed")).toBe("Why It Failed");
  });

  it("cases each part of hyphenated and slashed compounds", () => {
    expect(titleCase("Anime figure e-commerce backend")).toBe("Anime Figure E-Commerce Backend");
    expect(titleCase("Chart-of-accounts AI assistant")).toBe("Chart-of-Accounts AI Assistant");
    expect(titleCase("E-wallet sentiment analysis (CNN-LSTM)")).toBe("E-Wallet Sentiment Analysis (CNN-LSTM)");
    expect(titleCase("ui/ux design competition")).toBe("UI/UX Design Competition");
    expect(titleCase("apa kata pesan error-nya")).toBe("Apa Kata Pesan Error-nya");
  });

  it("keeps listed creative titles as written and is idempotent", () => {
    expect(titleCase("The Sun, The Moon, and The Dark Sea")).toBe("The Sun, The Moon, and The Dark Sea");
    for (const s of ["Realtime voice AI contact center", "Asisten AI chart of accounts", "Delegate implementation, own the review"]) {
      expect(titleCase(titleCase(s))).toBe(titleCase(s));
      expect(isTitleCase(titleCase(s))).toBe(true);
    }
    expect(isTitleCase("Realtime voice AI contact center")).toBe(false);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/unit/title-case.test.ts`
Expected: FAIL, `Failed to resolve import "@/content/title-case"` (the module does not exist yet).

- [x] **Step 3: Write the implementation**

Create `src/content/title-case.ts`:

```ts
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
```

- [x] **Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/unit/title-case.test.ts`
Expected: PASS, `Tests  11 passed (11)`.

- [x] **Step 5: Commit**

```bash
rtk git add src/content/title-case.ts tests/unit/title-case.test.ts
rtk git commit -m "feat(content): add titleCase rules for EN and ID titles"
```

---

### Task 2: Title fields, MDX frontmatter helpers and the fix script

**Files:**
- Create: `src/content/titles.ts`
- Create: `scripts/title-case.ts`
- Test: `tests/unit/titles.test.ts`

**Interfaces:**
- Consumes: `titleCase(input: string): string` from `src/content/title-case.ts` (Task 1).
- Produces:
  - `interface TitleSlot { path: string; get(): string; set(value: string): void }`
  - `interface TitleChange { path: string; before: string; after: string }`
  - `titleSlots(content: SiteContent): TitleSlot[]` (paths look like `floors.labs.pods[11](voice-ai-contact-center).title.en`)
  - `titleCaseChanges(content: SiteContent): TitleChange[]` (read only)
  - `applyTitleCase(content: SiteContent): TitleChange[]` (mutates in place)
  - `frontmatterTitle(source: string): string | undefined`
  - `withFrontmatterTitle(source: string, title: string): string`
  - CLI `bun scripts/title-case.ts [--write]`: prints one line per title, then `N title(s) not in Title Case` (exit 1 when N > 0) or `N title(s) rewritten`.

- [x] **Step 1: Write the failing test**

Create `tests/unit/titles.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applyTitleCase, frontmatterTitle, titleCaseChanges, titleSlots, withFrontmatterTitle } from "@/content/titles";
import { makeContent, makePod } from "../fixtures/minimal-content";

describe("title slots", () => {
  const content = () => {
    const c = makeContent();
    c.floors.labs.pods = [makePod({ slug: "voice", title: { en: "Realtime voice AI contact center", id: "Contact center voice AI realtime" } })];
    c.floors.library.publications = [{ id: "model", title: "IndoBERT app-review sentiment model", year: 2023, kind: "model" }];
    c.sideProjects = [{ id: "crypto", title: "Crypto portfolio tracker", summary: { en: "Tracks coins", id: "Melacak koin" }, stack: [] }];
    return c;
  };

  it("lists localized and plain title fields with readable paths", () => {
    const paths = titleSlots(content()).map((s) => s.path);
    expect(paths).toContain("floors.labs.pods[0](voice).title.en");
    expect(paths).toContain("floors.labs.pods[0](voice).title.id");
    expect(paths).toContain("floors.library.publications[0](model).title");
    expect(paths).toContain("sideProjects[0](crypto).title");
    expect(paths).toContain("profile.principles[0](spec-first).title.en");
  });

  it("reports and applies Title Case without touching other fields", () => {
    const c = content();
    expect(titleCaseChanges(c)).toContainEqual({ path: "floors.labs.pods[0](voice).title.en", before: "Realtime voice AI contact center", after: "Realtime Voice AI Contact Center" });
    const changes = applyTitleCase(c);
    expect(changes.length).toBeGreaterThan(0);
    expect(c.floors.labs.pods[0].title).toEqual({ en: "Realtime Voice AI Contact Center", id: "Contact Center Voice AI Realtime" });
    expect(c.floors.labs.pods[0].tagline).toEqual(makePod().tagline);
    expect(c.floors.library.publications[0].title).toBe("IndoBERT App-Review Sentiment Model");
    expect(c.sideProjects[0].title).toBe("Crypto Portfolio Tracker");
    expect(c.profile.principles[0].title.en).toBe("Spec First");
    expect(titleCaseChanges(c)).toEqual([]);
  });
});

describe("MDX frontmatter titles", () => {
  const source = '---\ntitle: "How we made a voice agent interruptible"\ndate: "2026-10-09"\n---\n\nBody with title: "not this".\n';

  it("reads and replaces only the frontmatter title", () => {
    expect(frontmatterTitle(source)).toBe("How we made a voice agent interruptible");
    const next = withFrontmatterTitle(source, "How We Made a Voice Agent Interruptible");
    expect(frontmatterTitle(next)).toBe("How We Made a Voice Agent Interruptible");
    expect(next).toBe(source.replace('title: "How we made a voice agent interruptible"', 'title: "How We Made a Voice Agent Interruptible"'));
  });

  it("returns undefined without a frontmatter title", () => {
    expect(frontmatterTitle('---\ndate: "2026-10-09"\n---\nBody')).toBeUndefined();
    expect(frontmatterTitle('Body\ntitle: "Not frontmatter"\n')).toBeUndefined();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/unit/titles.test.ts`
Expected: FAIL, `Failed to resolve import "@/content/titles"`.

- [x] **Step 3: Write the implementation**

Create `src/content/titles.ts`:

```ts
import type { LocalizedText, SiteContent } from "./schema";
import { titleCase } from "./title-case";

/** One Title Case field: where it lives in `site-content.json` and its current value. */
export interface TitleSlot {
  path: string;
  get: () => string;
  set: (value: string) => void;
}

export interface TitleChange {
  path: string;
  before: string;
  after: string;
}

const localized = (path: string, text: LocalizedText): TitleSlot[] =>
  (["en", "id"] as const).map((locale) => ({
    path: `${path}.${locale}`,
    get: () => text[locale],
    set: (value) => {
      text[locale] = value;
    },
  }));

const plain = <T extends { title: string }>(path: string, item: T): TitleSlot => ({
  path,
  get: () => item.title,
  set: (value) => {
    item.title = value;
  },
});

/**
 * Every title shown as a heading: pods, posts, publications (papers, thesis, models), talks, side
 * projects, awards and principles. Not titles: role titles, org and certification names, skill
 * group labels (rendered uppercase), mission labels (actions) and body text.
 */
export function titleSlots(content: SiteContent): TitleSlot[] {
  const { labs, library } = content.floors;
  return [
    ...labs.pods.flatMap((p, i) => localized(`floors.labs.pods[${i}](${p.slug}).title`, p.title)),
    ...library.posts.flatMap((p, i) => localized(`floors.library.posts[${i}](${p.slug}).title`, p.title)),
    ...library.publications.map((p, i) => plain(`floors.library.publications[${i}](${p.id}).title`, p)),
    ...library.talks.flatMap((t, i) => localized(`floors.library.talks[${i}](${t.id}).title`, t.title)),
    ...content.sideProjects.map((p, i) => plain(`sideProjects[${i}](${p.id}).title`, p)),
    ...content.awards.map((a, i) => plain(`awards[${i}](${a.id}).title`, a)),
    ...content.profile.principles.flatMap((p, i) => localized(`profile.principles[${i}](${p.id}).title`, p.title)),
  ];
}

/** Titles that `titleCase` would change (empty when the dataset is consistent). */
export function titleCaseChanges(content: SiteContent): TitleChange[] {
  return titleSlots(content).flatMap((slot) => {
    const before = slot.get();
    const after = titleCase(before);
    return before === after ? [] : [{ path: slot.path, before, after }];
  });
}

/** Rewrites every title in place and returns what changed. */
export function applyTitleCase(content: SiteContent): TitleChange[] {
  const changes = titleCaseChanges(content);
  const slots = new Map(titleSlots(content).map((slot) => [slot.path, slot]));
  for (const change of changes) slots.get(change.path)!.set(change.after);
  return changes;
}

const FRONTMATTER_TITLE = /^(---\r?\n(?:[^\n]*\n)*?)title: "((?:[^"\\]|\\.)*)"(\r?\n)/;

/** The `title: "..."` line of an MDX post's frontmatter. */
export function frontmatterTitle(source: string): string | undefined {
  const match = FRONTMATTER_TITLE.exec(source);
  return match ? JSON.parse(`"${match[2]}"`) : undefined;
}

/** The same MDX source with its frontmatter title replaced (nothing else changes). */
export function withFrontmatterTitle(source: string, title: string): string {
  return source.replace(FRONTMATTER_TITLE, (_all, head: string, _old: string, eol: string) => `${head}title: ${JSON.stringify(title)}${eol}`);
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/unit/titles.test.ts`
Expected: PASS, `Tests  4 passed (4)`.

- [x] **Step 5: Write the fix script**

Create `scripts/title-case.ts`:

```ts
/**
 * Title Case for content titles (src/content/title-case.ts).
 * Usage:
 *   bun scripts/title-case.ts           list titles that are not in Title Case (exit 1 if any)
 *   bun scripts/title-case.ts --write   rewrite them in content/site-content.json and the MDX frontmatter
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SiteContentSchema, type SiteContent } from "../src/content/schema";
import { titleCase } from "../src/content/title-case";
import { applyTitleCase, frontmatterTitle, titleCaseChanges, withFrontmatterTitle } from "../src/content/titles";

const write = process.argv.includes("--write");
const root = process.cwd();
const contentFile = path.join(root, "content", "site-content.json");
const blogDir = path.join(root, "content", "blog");

const raw = readFileSync(contentFile, "utf8");
const parsed = SiteContentSchema.safeParse(JSON.parse(raw));
if (!parsed.success) {
  console.error("content/site-content.json does not validate; run bun run validate:content first");
  process.exit(2);
}
// Edit the raw JSON (not the zod output) so nothing but the titles changes.
const content = JSON.parse(raw) as SiteContent;
const changes = write ? applyTitleCase(content) : titleCaseChanges(content);
const lines = changes.map((c) => `content/site-content.json ${c.path}: "${c.before}" -> "${c.after}"`);

for (const name of readdirSync(blogDir).filter((f) => f.endsWith(".mdx")).sort()) {
  const file = path.join(blogDir, name);
  const source = readFileSync(file, "utf8");
  const before = frontmatterTitle(source);
  if (before === undefined) {
    lines.push(`content/blog/${name}: no title in the frontmatter`);
    continue;
  }
  const after = titleCase(before);
  if (after === before) continue;
  lines.push(`content/blog/${name} title: "${before}" -> "${after}"`);
  if (write) writeFileSync(file, withFrontmatterTitle(source, after));
}

if (write && changes.length > 0) writeFileSync(contentFile, `${JSON.stringify(content, null, 2)}\n`);
for (const line of lines) console.log(line);
console.log(`${lines.length} title(s) ${write ? "rewritten" : "not in Title Case"}`);
if (!write && lines.length > 0) process.exit(1);
```

- [x] **Step 6: Dry-run the script (no writes yet)**

Run: `bun scripts/title-case.ts; echo "exit=$?"`
Expected: 108 lines such as `content/site-content.json floors.labs.pods[11](voice-ai-contact-center).title.en: "Realtime voice AI contact center" -> "Realtime Voice AI Contact Center"`, then `108 title(s) not in Title Case` and `exit=1`. Run `rtk git status --short` and confirm nothing under `content/` changed.

- [x] **Step 7: Commit**

```bash
rtk git add src/content/titles.ts scripts/title-case.ts tests/unit/titles.test.ts
rtk git commit -m "feat(content): add title slots, MDX title helpers and the title-case script"
```

---
### Task 3: Apply Title Case to the content and guard it

**Files:**
- Test: `tests/content/title-case.test.ts` (create)
- Modify: `content/site-content.json` (100 titles, Appendix A), `content/blog/*.mdx` (8 frontmatter lines)
- Modify: `scripts/validate-fragment.ts:3-11` (header, imports) and `:28-31` (after the zod check)

**Interfaces:**
- Consumes: `titleSlots`, `titleCaseChanges`, `frontmatterTitle` (Task 2), `isTitleCase` (Task 1).
- Produces: content in Title Case; a content test and `bun run validate:content` that fail on any future title not in Title Case. Later tasks and parallel sessions read titles from content unchanged.

- [x] **Step 1: Write the failing content test**

Create `tests/content/title-case.test.ts`:

```ts
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SiteContentSchema } from "@/content/schema";
import { isTitleCase } from "@/content/title-case";
import { frontmatterTitle, titleCaseChanges, titleSlots } from "@/content/titles";

const root = process.cwd();
const content = SiteContentSchema.parse(JSON.parse(readFileSync(path.join(root, "content", "site-content.json"), "utf8")));
const blogDir = path.join(root, "content", "blog");
const blogFiles = readdirSync(blogDir).filter((f) => f.endsWith(".mdx"));

describe("Title Case content titles (fix with: bun scripts/title-case.ts --write)", () => {
  it("covers pods, posts, publications, talks, side projects, awards and principles", () => {
    const paths = titleSlots(content).map((s) => s.path);
    for (const prefix of ["floors.labs.pods[", "floors.library.posts[", "floors.library.publications[", "floors.library.talks[", "sideProjects[", "awards[", "profile.principles["]) {
      expect(paths.some((p) => p.startsWith(prefix)), prefix).toBe(true);
    }
    expect(paths.filter((p) => p.startsWith("floors.labs.pods["))).toHaveLength(content.floors.labs.pods.length * 2);
  });

  it("has every title in site-content.json in Title Case", () => {
    expect(titleCaseChanges(content).map((c) => `${c.path}: "${c.before}" should be "${c.after}"`)).toEqual([]);
  });

  it.each(blogFiles)("has a Title Case frontmatter title that matches site-content.json in content/blog/%s", (file) => {
    const [slug, locale] = file.replace(/\.mdx$/, "").split(".") as [string, "en" | "id"];
    const title = frontmatterTitle(readFileSync(path.join(blogDir, file), "utf8"));
    expect(title, "frontmatter title").toBeDefined();
    expect(isTitleCase(title!), title).toBe(true);
    const post = content.floors.library.posts.find((p) => p.slug === slug);
    expect(post?.title[locale], `posts[${slug}].title.${locale}`).toBe(title);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/content/title-case.test.ts`
Expected: FAIL, `Tests  9 failed | 2 passed (11)`: "has every title in site-content.json in Title Case" lists 100 titles (for example `floors.labs.pods[11](voice-ai-contact-center).title.en: "Realtime voice AI contact center" should be "Realtime Voice AI Contact Center"`), and 8 MDX files fail (`the-sun-the-moon-and-the-dark-sea.id.mdx` passes because its title is in `TITLE_CASE_KEEP`).

- [x] **Step 3: Apply Title Case to the content**

Run: `bun scripts/title-case.ts --write`
Expected: last line `108 title(s) rewritten`.

Then run: `bun scripts/title-case.ts; echo "exit=$?"`
Expected: `0 title(s) not in Title Case` and `exit=0`.

Check the diff touches titles only:

```bash
rtk git diff --stat -- content
rtk git diff -U0 -- content/site-content.json | grep '^[-+] ' | grep -v '"en":\|"id":\|"title":' ; echo "non-title lines: $?"
```

Expected: `content/site-content.json | 200 +++---` (100 lines out, 100 in) plus 8 MDX files with `2 +-` each, and `non-title lines: 1` (grep found no other changed lines). Compare a few rows against Appendix A.

- [x] **Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/content/title-case.test.ts tests/content/dataset.test.ts tests/content/safety.test.ts tests/content/fonts.test.ts`
Expected: PASS, no failures (the dataset test "translates prose instead of copying English into id" still passes: no EN and ID title became equal).

- [x] **Step 5: Make `validate:content` check titles too**

In `scripts/validate-fragment.ts`, replace the usage line and the imports:

```ts
 *   bun scripts/validate-fragment.ts full <file.json>   (complete SiteContent, titles in Title Case too)
 */
import { readFileSync } from "node:fs";
import { z } from "zod";
import { PodSchema, SiteContentSchema, type SiteContent } from "../src/content/schema";
import { collectStrings, findBlockedTerms, findForbiddenPatterns, loadBlocklist } from "../src/content/safety";
import { titleCaseChanges } from "../src/content/titles";
```

(the old line was `*   bun scripts/validate-fragment.ts full <file.json>   (complete SiteContent)` and the schema import had no `type SiteContent`), and replace the zod failure block:

```ts
if (!parsed.success) {
  failed = true;
  console.error(z.prettifyError(parsed.error));
}
```

with:

```ts
if (!parsed.success) {
  failed = true;
  console.error(z.prettifyError(parsed.error));
} else if (kind === "full") {
  for (const change of titleCaseChanges(parsed.data as SiteContent)) {
    failed = true;
    console.error(`${change.path}: not in Title Case, expected "${change.after}" (bun scripts/title-case.ts --write)\n  ${change.before}`);
  }
}
```

- [x] **Step 6: Verify the validator both ways**

Run: `bun run validate:content`
Expected: `OK: content/site-content.json is a valid full fragment (N blocklist terms checked)`.

Then prove it fails on a bad title (temporary edit, reverted right after):

```bash
cp content/site-content.json content/site-content.json.bak
sed -i.tmp 's/"Realtime Voice AI Contact Center"/"Realtime voice AI contact center"/' content/site-content.json && rm content/site-content.json.tmp
bun run validate:content; echo "exit=$?"
mv content/site-content.json.bak content/site-content.json
```

Expected: `floors.labs.pods[11](voice-ai-contact-center).title.en: not in Title Case, expected "Realtime Voice AI Contact Center" (bun scripts/title-case.ts --write)` and a non-zero exit. After the `mv`, `rtk git diff --stat -- content/site-content.json` shows the same 200-line change as Step 3.

- [x] **Step 7: Commit**

```bash
rtk git add tests/content/title-case.test.ts scripts/validate-fragment.ts content/site-content.json content/blog
rtk git commit -m "feat(content): write project, post, talk and other titles in Title Case"
```

---

### Task 4: Mission labels use the wing names

**Files:**
- Modify: `content/site-content.json` (missions `best-swe` around line 8095, `best-ai` around line 8118)
- Test: `tests/content/dataset.test.ts:4` (imports) and before `:103` ("starts every mission ...")

**Interfaces:**
- Consumes: `messages/en.json` and `messages/id.json` `common.wing` (`software: "Product Engineering"`, `ai: "AI Engineering"`).
- Produces: mission labels "Explore my Product Engineering work" / "Lihat karya Product Engineering saya" and "Explore my AI Engineering work" / "Lihat karya AI Engineering saya". e2e specs read labels from content, so no spec changes.

- [x] **Step 1: Write the failing test**

In `tests/content/dataset.test.ts`, after `import { SiteContentSchema, type LocalizedText } from "@/content/schema";` add:

```ts
import en from "../../messages/en.json";
import idMessages from "../../messages/id.json";
```

and insert this test right before `it("starts every mission with a known step and targets existing rooms", () => {`:

```ts
  it("names the L3 wings in the best-swe and best-ai mission labels (common.wing)", () => {
    for (const [id, wing] of [["best-swe", "software"], ["best-ai", "ai"]] as const) {
      const label = content.missions.find((m) => m.id === id)!.label;
      expect(label.en, id).toContain(en.common.wing[wing]);
      expect(label.id, id).toContain(idMessages.common.wing[wing]);
    }
  });

```

- [x] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/content/dataset.test.ts -t "names the L3 wings"`
Expected: FAIL, `best-swe: expected 'Explore my software engineering work' to contain 'Product Engineering'`.

- [x] **Step 3: Update the four label strings**

In `content/site-content.json` replace exactly (each string occurs once):

| Before | After |
|---|---|
| `"en": "Explore my software engineering work",` | `"en": "Explore my Product Engineering work",` |
| `"id": "Lihat karya software engineering saya"` | `"id": "Lihat karya Product Engineering saya"` |
| `"en": "Explore my AI engineering work",` | `"en": "Explore my AI Engineering work",` |
| `"id": "Lihat karya AI engineering saya"` | `"id": "Lihat karya AI Engineering saya"` |

Mission steps stay as they are (see Open risks: `best-swe` still opens `digital-banking-integrations`).

- [x] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run tests/content tests/hud/MissionHud.test.tsx tests/hud/CommandPalette.test.tsx tests/unit/ui-copy.test.ts && bun run validate:content`
Expected: PASS, no failures; `OK: content/site-content.json is a valid full fragment ...`.

- [x] **Step 5: Commit**

```bash
rtk git add content/site-content.json tests/content/dataset.test.ts
rtk git commit -m "fix(content): name the Product Engineering and AI Engineering wings in mission labels"
```

---

### Task 5: Shared gallery-first selector (`orderPods`)

**Files:**
- Modify: `src/content/selectors.ts:16-21` (replace `sortPods`)
- Modify: `src/content/load.ts:5` and `:58-61`
- Modify: `src/experience/missions/rooms.ts:1` and `:104`
- Test: `tests/unit/selectors.test.ts:1-15`

**Interfaces:**
- Consumes: `Pod`, `Tier` from `@/content/schema`.
- Produces (all in `@/content/selectors`):
  - `interface PodRank { tier: Tier; order: number; hasGallery: boolean }`
  - `podHasGallery(pod: Pick<Pod, "assets">): boolean` (`assets.length > 0`)
  - `comparePods(a: PodRank, b: PodRank): number` (gallery first, then hero < featured < listed, then `order`)
  - `orderPods(pods: readonly Pod[]): Pod[]` (new array, stable)
  - `sortPods` is removed. `getPods(wing?)` now returns site order, so the Work page (`/labs` key projects and "All projects"), Home, Quick view, `/labs/[slug]` siblings, drawer prev/next (`buildLabsViews`) and the Cmd-K catalog (`buildRoomCatalog`) follow it without further edits.

- [x] **Step 1: Write the failing test**

In `tests/unit/selectors.test.ts`, replace lines 1 to 15 (the imports and the whole `describe("sortPods", ...)` block) with:

```ts
import { describe, expect, it } from "vitest";
import { getPods } from "@/content/load";
import { adjacent, comparePods, groupEntriesByYear, orderPods, podHasGallery, sortTimeline, type PodRank } from "@/content/selectors";
import type { Asset } from "@/content/schema";
import { makeEntry, makePod } from "../fixtures/minimal-content";

const shot: Asset[] = [{ src: "/media/sample-pod/01.webp", alt: { en: "Screen", id: "Layar" }, width: 1600, height: 900, redacted: true }];

describe("orderPods", () => {
  it("puts pods with a gallery first, then hero before featured before listed, then by order", () => {
    const pods = [
      makePod({ id: "l", tier: "listed", order: 0 }),
      makePod({ id: "f2", tier: "featured", order: 5 }),
      makePod({ id: "h", tier: "hero", order: 9 }),
      makePod({ id: "f1", tier: "featured", order: 1 }),
      makePod({ id: "lg", tier: "listed", order: 7, assets: shot }),
      makePod({ id: "fg", tier: "featured", order: 3, assets: shot }),
      makePod({ id: "hg", tier: "hero", order: 4, assets: shot }),
    ];
    expect(orderPods(pods).map((p) => p.id)).toEqual(["hg", "fg", "lg", "h", "f1", "f2", "l"]);
  });

  it("returns a new array, keeps ties in input order and leaves the input alone", () => {
    const pods = [makePod({ id: "b", order: 1 }), makePod({ id: "a", order: 1 })];
    const sorted = orderPods(pods);
    expect(sorted).not.toBe(pods);
    expect(sorted.map((p) => p.id)).toEqual(["b", "a"]);
    expect(pods.map((p) => p.id)).toEqual(["b", "a"]);
  });

  it("ranks the 3D payload shape with the same comparator", () => {
    const ranks: (PodRank & { id: string })[] = [
      { id: "hero", tier: "hero", order: 0, hasGallery: false },
      { id: "listed-gallery", tier: "listed", order: 9, hasGallery: true },
      { id: "featured-gallery", tier: "featured", order: 2, hasGallery: true },
    ];
    expect([...ranks].sort(comparePods).map((r) => r.id)).toEqual(["featured-gallery", "listed-gallery", "hero"]);
  });

  it("lists every wing of the real dataset gallery first", () => {
    expect(podHasGallery(makePod({ assets: shot }))).toBe(true);
    expect(podHasGallery(makePod())).toBe(false);
    for (const wing of ["software", "ai"] as const) {
      const flags = getPods(wing).map(podHasGallery);
      expect(flags, wing).toEqual([...flags].sort((a, b) => Number(b) - Number(a)));
      expect(flags.some(Boolean), `${wing} has gallery pods`).toBe(true);
    }
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/unit/selectors.test.ts`
Expected: FAIL, `TypeError: ... orderPods is not a function` (and `comparePods` / `podHasGallery` likewise).

- [x] **Step 3: Write the implementation**

In `src/content/selectors.ts` replace:

```ts
/** Spec appendix 01 section 4: hero first, then by `order`. */
export function sortPods(pods: readonly Pod[]): Pod[] {
  return [...pods].sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier] || a.order - b.order);
}
```

with:

```ts
/** What decides a pod's place in every project list (Page View, Cmd-K, L3 docking, the tour, Ask). */
export interface PodRank {
  tier: Tier;
  order: number;
  hasGallery: boolean;
}

/** A pod has a gallery when it ships at least one reviewed screenshot (`assets[0]` is its cover). */
export function podHasGallery(pod: Pick<Pod, "assets">): boolean {
  return pod.assets.length > 0;
}

/**
 * Site order for projects (owner decision 2026-10-12): pods with a gallery first, then hero before
 * featured before listed, then `order`. Ties keep their input order (Array.prototype.sort is stable).
 */
export function comparePods(a: PodRank, b: PodRank): number {
  return Number(b.hasGallery) - Number(a.hasGallery) || TIER_RANK[a.tier] - TIER_RANK[b.tier] || a.order - b.order;
}

const podRank = (pod: Pod): PodRank => ({ tier: pod.tier, order: pod.order, hasGallery: podHasGallery(pod) });

/** Pods in site order (`comparePods`); the one selector behind every project list. */
export function orderPods(pods: readonly Pod[]): Pod[] {
  return [...pods].sort((a, b) => comparePods(podRank(a), podRank(b)));
}
```

Keep `const TIER_RANK` above it as is.

In `src/content/load.ts` change the import to `import { groupEntriesByYear, orderPods, sortTimeline } from "./selectors";` and the body of `getPods` to `return orderPods(wing ? pods.filter((p) => p.wing === wing) : pods);`.

In `src/experience/missions/rooms.ts` change the import to `import { clientKeywords, groupEntriesByYear, isResearch, orderPods } from "@/content/selectors";` and the L3 loop to `for (const pod of orderPods(content.floors.labs.pods)) {`.

Confirm nothing else uses the old name: `grep -rn "sortPods" src tests e2e scripts functions` prints nothing.

- [x] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run tests/unit/selectors.test.ts tests/unit/room-views.test.ts tests/unit/missions-rooms.test.ts tests/unit/search.test.ts tests/hud/RoomDrawer.test.tsx tests/hud/WorkIndex.test.tsx tests/unit/pageview.test.ts`
Expected: PASS, no failures. `room-views` "chains prev/next within each wing" now follows site order through `getPods(wing)`.

- [x] **Step 5: Check the new order on the Work page data**

Run:

```bash
bun -e 'import("./src/content/load.ts").then(({ getPods }) => { for (const w of ["software", "ai"]) console.log(w, getPods(w).map((p) => p.slug).join(" > ")); })'
```

Expected (Appendix B): `software anime-figure-ecommerce > vulnerability-scanning-automation > university-alumni-platforms > digital-banking-integrations > ...` and `ai voice-ai-contact-center > ai-code-security-platform > fraud-review-platform > ai-cv-screening-platform > ...`.

- [x] **Step 6: Commit**

```bash
rtk git add src/content/selectors.ts src/content/load.ts src/experience/missions/rooms.ts tests/unit/selectors.test.ts
rtk git commit -m "feat(content): list projects with a gallery first (orderPods)"
```

---
### Task 6: L3 docking, wing boards and "Tour my projects" go gallery first

**Files:**
- Modify: `src/experience/types.ts:76-87` (`LabPod`) and `:112` (doc comment)
- Modify: `src/content/experience.ts:24` (import), `:27` (doc comment), `:38-39` (`labPods`)
- Modify: `src/experience/floors/labs/layout.ts:1` (import), `:6-14` (module doc), `:33-34` (`LABS.slot`), `:135-139` (`tourOrder`), `:141-145` (doc), `:160` (directory), `:167-168` (slot cursor)
- Modify: `src/experience/missions/walks.ts:6-10` and `:45-48` (doc comments only)
- Modify: `src/experience/floors/labs/Hub.tsx:63-67` (doc comment only)
- Test: `tests/unit/labs-layout.test.ts:21-31`, `:67-88`; `tests/unit/walk.test.ts:209-224`; `tests/unit/missions-host3d.test.ts:42`
- Test: `e2e/walk.spec.ts:1-3`, `:20-21`, `:76-79`, `:111`

**Interfaces:**
- Consumes: `comparePods(a: PodRank, b: PodRank): number`, `podHasGallery(pod: Pick<Pod, "assets">): boolean`, `orderPods(pods: readonly Pod[]): Pod[]` (Task 5).
- Produces:
  - `LabPod.hasGallery: boolean` (3D payload, built by `labPods(locale)`), so `LabPod` satisfies `PodRank`.
  - `tourOrder(pods: readonly LabPod[]): LabPod[]` = hero and featured pods sorted with `comparePods` (docking order, tour order, top board entries).
  - `LABS.slot = 12`: every docked pod reserves one 12 u slot, so slot `i` has the same x in both wings (equal billing) whatever the tiers. The L3 slab grows from x 127 to x 139 with today's pods.
  - `buildLabsLayout(pods).directory[wing]`: overflow, then listed pods sorted with `comparePods`.

- [x] **Step 1: Write the failing tests**

In `tests/unit/labs-layout.test.ts`, add `hasGallery: false,` to the `pod()` helper so it reads:

```ts
const pod = (slug: string, wing: LabPod["wing"], tier: LabPod["tier"], order: number): LabPod => ({
  id: slug,
  slug,
  title: slug,
  tier,
  wing,
  accent: "cyan",
  hologram: "pipeline",
  order,
  hasHologramView: tier === "hero",
  hasGallery: false,
});
```

and replace the two tests `it("docks hero pods nearest the hub, then featured pods, alternating sides of the wing road", ...)` and `it("gives both wings mirror-image placement (equal billing)", ...)` with:

```ts
  it("docks pods in site order (gallery pods nearest the hub), alternating sides of the wing road", () => {
    for (const wing of ["software", "ai"] as const) {
      const docked = layout.placed.filter((p) => p.pod.wing === wing);
      expect(docked.map((p) => p.pod.slug)).toEqual(tourOrder(pods.filter((p) => p.wing === wing)).map((p) => p.slug));
      docked.forEach((p, i) => expect(p.row).toBe(i % 2 === 0 ? "outer" : "inner"));
      for (const row of ["outer", "inner"] as const) {
        const inRow = docked.filter((p) => p.row === row);
        const xs = inRow.map((p) => p.center.x);
        expect(xs).toEqual([...xs].sort((a, b) => a - b));
        const gallery = inRow.map((p) => p.pod.hasGallery);
        expect(gallery, `${wing} ${row}`).toEqual([...gallery].sort((a, b) => Number(b) - Number(a)));
      }
    }
  });

  it("docks a featured pod with a gallery ahead of a hero pod without one", () => {
    const mixed = buildLabsLayout([pod("hero-plain", "software", "hero", 0), { ...pod("featured-shots", "software", "featured", 5), hasGallery: true }]);
    expect(mixed.placed.map((p) => p.pod.slug)).toEqual(["featured-shots", "hero-plain"]);
    expect(mixed.placed[0].center.x).toBeLessThan(mixed.placed[1].center.x);
  });

  it("gives both wings mirror-image placement (equal billing), whatever the tiers in each slot", () => {
    const slots = (wing: "software" | "ai") => layout.placed.filter((p) => p.pod.wing === wing).map((p) => `${p.row}@${p.center.x},${Math.abs(p.door.z)}`);
    const sw = slots("software");
    const ai = slots("ai");
    const shared = Math.min(sw.length, ai.length);
    expect(shared).toBeGreaterThan(0);
    expect(sw.slice(0, shared)).toEqual(ai.slice(0, shared));
  });
```

In `tests/unit/walk.test.ts`, replace the test `it("tours hero pods, then featured pods, then the directories", () => {` up to and including its `expect(walk.stops.map((s) => s.id)).toEqual([...]);` line with:

```ts
  it("tours gallery pods first, then hero before featured, wing by wing, then the directories", () => {
    const pod = (slug: string, tier: LabPod["tier"], wing: LabPod["wing"], order: number, hasGallery = false): LabPod => ({
      id: slug,
      slug,
      title: slug,
      tier,
      wing,
      order,
      accent: "cyan",
      hologram: "graph",
      hasHologramView: false,
      hasGallery,
    });
    const pods = [
      pod("f1", "featured", "ai", 3),
      pod("h2", "hero", "ai", 0),
      pod("h1", "hero", "software", 0),
      pod("l1", "listed", "ai", 9, true),
      pod("h3", "hero", "software", 1),
      pod("g1", "featured", "software", 5, true),
    ];
    const walk = labsWalk(pods, { wings: { software: "Product Engineering", ai: "AI Engineering" }, more: "More projects here", moreSub: "" });
    expect(walk.stops.map((s) => s.id)).toEqual(["L3:g1", "L3:h1", "L3:h3", "L3:h2", "L3:f1", "L3:directory:software", "L3:directory:ai"]);
```

(the remaining lines of that test, from `expect(walk.stops.at(-1)).toMatchObject({ palette: "pods" });` on, stay as they are; `placedOnly` still starts at `L3:h1`).

In `tests/unit/missions-host3d.test.ts:42`, change `order: 0, hasHologramView: true }],` to `order: 0, hasHologramView: true, hasGallery: true }],`.

- [x] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run tests/unit/labs-layout.test.ts tests/unit/walk.test.ts`
Expected: FAIL on "docks a featured pod with a gallery ahead of a hero pod without one" (`expected [ 'hero-plain', 'featured-shots' ] to deeply equal [ 'featured-shots', 'hero-plain' ]`) and on "tours gallery pods first, ..." (`L3:h1` comes before `L3:g1`).

- [x] **Step 3: Add `hasGallery` to the 3D payload**

In `src/experience/types.ts`, inside `interface LabPod`, after `hasHologramView: boolean;` add:

```ts
  /** At least one gallery image: gallery pods come first in every project list (`comparePods`). */
  hasGallery: boolean;
```

and change the `labs` doc comment in `ExperienceData` to:

```ts
  /** L3 Labs: pods in site order (`orderPods`: gallery first, then hero, featured, listed, then `order`) and wing labels. */
```

In `src/content/experience.ts` change `import { FIRST_CORRIDOR_YEAR } from "./selectors";` to `import { FIRST_CORRIDOR_YEAR, podHasGallery } from "./selectors";`, change the `labPods` doc comment to `/** L3 pods in site order (\`orderPods\`) with only what the 3D floor draws (the drawer loads full content separately). */`, and add the field after `hasHologramView`:

```ts
    hasHologramView: p.tier === "hero" && (p.architecture?.nodes.length ?? 0) >= 3,
    hasGallery: podHasGallery(p),
  }));
```

- [x] **Step 4: Dock in site order, one slot per pod**

In `src/experience/floors/labs/layout.ts`:

1. Add the import under the schema import:

```ts
import type { RoomId, Wing } from "@/content/schema";
import { comparePods } from "@/content/selectors";
```

2. In the module doc comment replace

```ts
 * and meet at the east plaza, so the floor is one loop without dead ends. Hero and featured pods
 * dock on both sides of their wing road (hero pods nearest the hub), each with a forecourt and a
 * spur to its door, at least 6 u apart. Listed pods stay on the directory boards.
```

with

```ts
 * and meet at the east plaza, so the floor is one loop without dead ends. Hero and featured pods
 * dock on both sides of their wing road in site order (`comparePods`: gallery pods nearest the hub),
 * one `slot` each, so both wings stay mirror images whatever their tiers; each pod has a forecourt
 * and a spur to its door, at least 6 u apart. Listed pods stay on the directory boards.
```

3. In `LABS`, after `featured: { w: 8, d: 7 },` add:

```ts
  /** Length of row each docked pod reserves (the hero width): slot i sits at the same x in both wings. */
  slot: 12,
```

4. Replace `tourOrder`:

```ts
/** Hero and featured pods in site order (`comparePods`: gallery first): the docking order along a wing road and the tour order. */
export function tourOrder(pods: readonly LabPod[]): LabPod[] {
  return pods.filter((p) => p.tier !== "listed").sort(comparePods);
}
```

5. Replace the `buildLabsLayout` doc comment with:

```ts
/**
 * Places pods from data (`ExperienceData.labs.pods`). Per wing, hero and featured pods dock in
 * `tourOrder` along the wing road from the hub eastward, one slot each, alternating the outer and the
 * inner side; the loop corner follows the farthest pod of either wing, so both wings share one east plaza.
 */
```

6. Sort the listed pods on the board:

```ts
    directory[wing] = [...tour.slice(L.maxPerWing), ...inWing.filter((p) => p.tier === "listed").sort(comparePods)];
```

7. Advance the row cursor by slot instead of pod width (the pod keeps its tier size `w x d`, centered in its slot):

```ts
      const x = cursor[row] + L.slot / 2;
      cursor[row] += L.slot + L.gap;
```

(replacing `const x = cursor[row] + w / 2;` and `cursor[row] += w + L.gap;`).

- [x] **Step 5: Update the doc comments that describe the old order**

`src/experience/missions/walks.ts` module doc, replace

```ts
 * rooms oldest first, then the Workshop annex; L3 "Tour my projects" visits the docked pods wing by
 * wing (`software`, then `ai`; hero pods, then featured, as they dock along each wing road from the hub)
 * and ends at the wing directory boards ("More projects here").
```

with

```ts
 * rooms oldest first, then the Workshop annex; L3 "Tour my projects" visits the docked pods wing by
 * wing (`software`, then `ai`; in site order, gallery pods first, as they dock along each wing road
 * from the hub) and ends at the wing directory boards ("More projects here").
```

and the `labsWalk` doc comment with

```ts
/**
 * Wing by wing (the wing roads are far apart): each wing's hero and featured pods in docking order
 * (`tourOrder`: gallery first, then tier, then `order`); listed pods stay on the directory boards,
 * where the tour ends.
 */
```

`src/experience/floors/labs/Hub.tsx` `BoardFace` doc: change `the top entries (hero, then featured) in large type` to `the top entries (docking order, gallery first) in large type`. If a parallel "pads" session changed `Hub.tsx`, keep their version and apply only this phrase.

- [x] **Step 6: Run the unit tests to verify they pass**

Run: `bunx vitest run tests/unit/labs-layout.test.ts tests/unit/walk.test.ts tests/unit/missions-host3d.test.ts tests/unit/experience-data.test.ts tests/unit/doors.test.ts tests/unit/proximity.test.ts`
Expected: PASS, no failures ("passes the space rules with the real pods" and "keeps pods inside the slab, on forecourts off the road, at least 6 u apart" still pass with the wider slots).

- [x] **Step 7: Derive the e2e tour start from data**

In `e2e/walk.spec.ts`, add after `import en from "../messages/en.json";`:

```ts
import { orderPods } from "../src/content/selectors";
import type { Pod } from "../src/content/schema";
```

after `const stopOf = ...;` add:

```ts

/** The tour's first stop: the first docked Product Engineering pod in site order (gallery first). */
const firstSoftwareStop = `L3:${orderPods((data.floors.labs.pods as unknown as Pod[]).filter((p) => p.wing === "software" && p.tier !== "listed"))[0].slug}`;
```

rename the test `"L3: the tour starts at the first software hero pod, filters by wing and Prev steps back"` to `"L3: the tour starts at the first software pod in site order, filters by wing and Prev steps back"`, and replace both `expect(await waitForArrival(page)).toBe("L3:digital-banking-integrations");` lines with `expect(await waitForArrival(page)).toBe(firstSoftwareStop);`. (`e2e/career.spec.ts` keeps `digital-banking-integrations`: that test follows the Jenius career room link, not the tour.)

- [x] **Step 8: Typecheck**

Run: `bun run typecheck`
Expected: exits 0 (`Knowledge pack <hash>: ... chunks`, `Types generated successfully`, no `tsc` errors). A missing `hasGallery` anywhere a `LabPod` literal is built would fail here.

- [x] **Step 9: Commit**

```bash
rtk git add src/experience/types.ts src/content/experience.ts src/experience/floors/labs/layout.ts src/experience/missions/walks.ts src/experience/floors/labs/Hub.tsx tests/unit/labs-layout.test.ts tests/unit/walk.test.ts tests/unit/missions-host3d.test.ts e2e/walk.spec.ts
rtk git commit -m "feat(l3): dock and tour projects gallery first, keeping the wings mirrored"
```

---

### Task 7: Ask question bank follows the site order

**Files:**
- Modify: `content/ask/suggestions.json` (item order only)
- Test: `tests/ask/suggestions.test.ts:6` (imports) and before `:49`

**Interfaces:**
- Consumes: `orderPods` (Task 5), `getContent` from `@/content/load`.
- Produces: within each topic, questions about one project (`expect` holds `project-<slug>`) appear in `orderPods` order by their first mention. `topicQuestions` shows the first four of a topic, so the `work` pills now lead with the vulnerability scanning project (gallery) and the `ai` pills with voice, code security, fraud review and CV screening (all with galleries).

- [x] **Step 1: Write the failing test**

In `tests/ask/suggestions.test.ts`, replace `import { findBlockedTerms, FORBIDDEN_PATTERNS } from "@/content/safety";` with:

```ts
import { getContent } from "@/content/load";
import { findBlockedTerms, FORBIDDEN_PATTERNS } from "@/content/safety";
import { orderPods } from "@/content/selectors";
```

and insert before `it("passes the public-safety lint (no client names, em dashes, money or personal data)", () => {`:

```ts
  it("asks about projects in site order within each topic (gallery first, orderPods)", () => {
    const rank = new Map(orderPods(getContent().floors.labs.pods).map((pod, i) => [`project-${pod.slug}`, i]));
    for (const topic of ASK_TOPICS) {
      const seen: string[] = [];
      for (const s of SUGGESTIONS.filter((q) => q.topic === topic)) {
        for (const chunk of s.expect ?? []) if (rank.has(chunk) && !seen.includes(chunk)) seen.push(chunk);
      }
      const ranks = seen.map((chunk) => rank.get(chunk)!);
      expect(ranks, `${topic}: ${seen.join(", ")}`).toEqual([...ranks].sort((a, b) => a - b));
    }
  });

```

- [x] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/ask/suggestions.test.ts -t "site order"`
Expected: FAIL, `work: project-digital-banking-integrations, project-ticket-marketplace-backend, project-vendor-management-portal, project-vulnerability-scanning-automation: expected [ 15, 16, 17, 7 ] to deeply equal [ 7, 15, 16, 17 ]`.

- [x] **Step 3: Reorder the bank (formatting preserved)**

The file uses a hand-formatted layout (inline `"q": { ... }` objects), so move whole item blocks instead of re-serializing. Run from the repo root:

```bash
bun -e '
const { readFileSync, writeFileSync } = require("node:fs");
const file = "content/ask/suggestions.json";
const text = readFileSync(file, "utf8");
const head = "  \"items\": [\n";
const start = text.indexOf(head) + head.length;
const end = text.lastIndexOf("\n  ]\n}");
const blocks = text.slice(start, end).match(/^    \{\n[\s\S]*?^    \}/gm);
const byId = new Map(blocks.map((b) => [/"id": "([^"]+)"/.exec(b)[1], b]));
const front = [
  "work-best", "work-security", "work-banking", "work-tickets", "work-vendor", "work-stack", "work-github", "work-side",
  "ai-voice", "ai-security", "ai-fraud", "ai-documents", "ai-voice-latency", "ai-shadow", "ai-llm-failures", "ai-voice-interrupt",
  "ai-forecasting", "ai-solutions-assistant", "ai-agents", "ai-research", "ai-models",
];
const ids = [...byId.keys()];
const order = [...front, ...ids.filter((id) => !front.includes(id))];
if (order.length !== ids.length || new Set(order).size !== ids.length || order.some((id) => !byId.has(id))) throw new Error("id mismatch: the bank changed, update the list");
writeFileSync(file, text.slice(0, start) + order.map((id) => byId.get(id)).join(",\n") + text.slice(end));
'
jq -r '.items[].id' content/ask/suggestions.json | tr '\n' ' '; echo
rtk git diff --stat -- content/ask/suggestions.json
```

Expected: the id list starts `work-best work-security work-banking work-tickets work-vendor work-stack work-github work-side ai-voice ai-security ai-fraud ai-documents ai-voice-latency ...` and ends with the unchanged `career-*` and `contact-*` ids; the diff is about `31 insertions(+), 31 deletions(-)` (moved blocks only, `followUps` untouched).

- [x] **Step 4: Run the Ask tests to verify they pass**

Run: `bunx vitest run tests/ask tests/hud/AskDock.test.tsx`
Expected: PASS, no failures (every pill still retrieves its expected chunks in EN and ID; the golden drift check still finds every fact, since facts are matched lowercase and none quotes a title).

- [x] **Step 5: Commit**

```bash
rtk git add content/ask/suggestions.json tests/ask/suggestions.test.ts
rtk git commit -m "feat(ask): order project questions gallery first in the question bank"
```

---
### Task 8: Docs (content style guide, ordering, L3 spec)

**Files:**
- Modify: `AGENTS.md` (line 122 `getPods`, line 164 L3 Project Roads, line 181 guided walks, new section before `## Missions and HUD` at line 134)
- Modify: `README.md` (Content list, after the "Blog posts are MDX files" bullet at line 74)
- Modify: `docs/superpowers/specs/agent-hq/01-world-and-layout.md` (section 4, lines 64, 70, 74, 81)
- Create: `docs/superpowers/plans/2026-10-12-content-casing-ordering.md` (copy of this plan)

**Interfaces:**
- Consumes: names from Tasks 1 to 7 (`titleCase`, `BRAND_CASING`, `TITLE_CASE_KEEP`, `scripts/title-case.ts`, `orderPods`, `comparePods`, `tourOrder`, `LABS.slot`).
- Produces: documentation only.

- [x] **Step 1: AGENTS.md, add the "Content style" section**

Insert this block directly before the line `## Missions and HUD`:

```markdown
## Content style

- **Title Case for titles** (owner decision 2026-10-12): pod, post (`site-content.json` and the MDX frontmatter `title`), publication, talk, side project, award and principle titles are stored in Title Case in both locales, never cased with CSS `text-transform`. The rules live in `titleCase` (`src/content/title-case.ts`): capitalize every word except minor words that are not first, last or right after a colon (English: a, an, and, as, at, but, by, for, in, of, on, or, the, to, vs, via, with; Indonesian: dan, di, ke, dari, untuk, yang, dengan, atau, pada, plus the PUEBI prepositions dalam, bagi, oleh, serta, tentang, sebagai, terhadap, kepada; both lists apply in both locales because titles mix languages), keep words with an inner capital as written (AI, SaaS, PoC, IndoBERT), fix brands through `BRAND_CASING` (iOS, e2e, .NET; common words such as "it" or "line" are never in it), and case each part of a compound (E-Commerce, Chart-of-Accounts, Error-nya). Creative titles the author styled on purpose go in `TITLE_CASE_KEEP`.
- Not titles: role titles, org and certification names, skill group labels (rendered uppercase), mission labels (sentence-case actions) and body text.
- `tests/content/title-case.test.ts` and `bun run validate:content` fail on a title that `titleCase` would change; `bun scripts/title-case.ts` lists them and `bun scripts/title-case.ts --write` fixes `site-content.json` and the MDX frontmatter. A post's frontmatter title must equal its `site-content.json` title. Slugs and URLs never change with a title.
- **Gallery first** (owner decision 2026-10-12): every project list (Page View Work, Home, Quick view, Cmd-K, drawer prev/next, the L3 docking order, the wing boards and "Tour my projects") uses one order: `orderPods` / `comparePods` in `@/content/selectors` (pods with at least one gallery image first, then hero, featured, listed, then `order`). Never hard-code slugs to reorder; add a gallery or change `tier`/`order` in content. Topic questions in `content/ask/suggestions.json` that ask about one project follow the same order (`tests/ask/suggestions.test.ts`). The Ask "Projects summary" chunk keeps its own hero-first order on purpose: it answers "best project" questions.
- Mission labels that name a wing use the wing names from `common.wing` ("Product Engineering", "AI Engineering"); `tests/content/dataset.test.ts` checks `best-swe` and `best-ai`.

```

- [x] **Step 2: AGENTS.md, update the three ordering descriptions**

Replace each exact fragment (each occurs once):

| Old fragment | New fragment |
|---|---|
| ``` `getPods(wing?)` (hero, featured, listed, then `order`) ``` | ``` `getPods(wing?)` (site order, `orderPods` in `@/content/selectors`: pods with a gallery first, then hero, featured, listed, then `order`) ``` |
| ``` the top `LABS.boardEntries` (hero, then featured) in large type ``` | ``` the top `LABS.boardEntries` (docking order, gallery first) in large type ``` |
| ``` Per wing, hero then featured pods (`tourOrder`, at most `LABS.maxPerWing`; the rest and every listed pod stay on the board) dock along the road from the hub, alternating the outer and the inner side, 7 u apart ``` | ``` Per wing, hero and featured pods in site order (`tourOrder`, which sorts with `comparePods`: gallery first; at most `LABS.maxPerWing`; the rest and every listed pod stay on the board) dock along the road from the hub, one `LABS.slot` (12 u) each so both wings stay mirror images whatever their tiers, alternating the outer and the inner side, 7 u apart ``` |
| ``` wing by wing in docking order, hero then featured pods, then both wing directory boards ``` | ``` wing by wing in docking order (gallery pods first), then both wing directory boards ``` |

- [x] **Step 3: README.md, Content section**

After the bullet `- Blog posts are MDX files in \`content/blog/<slug>.<locale>.mdx\`. A missing translation falls back to the original with a note.` add:

```markdown
- Titles (projects, posts, publications, talks, side projects, awards, principles) are written in Title Case in both languages; `bun scripts/title-case.ts` lists any that are not and `--write` fixes them (rules: "Content style" in `AGENTS.md`).
- Projects with a gallery come first in every project list (Work, Home, Cmd-K, the L3 wing roads and the project tour), then hero, featured and listed pods by `order` (`orderPods` in `src/content/selectors.ts`).
```

- [x] **Step 4: Spec appendix 01, section 4 (L3)**

In `docs/superpowers/specs/agent-hq/01-world-and-layout.md` replace each exact fragment:

| Old fragment | New fragment |
|---|---|
| `with today's 18 docked pods it is about 151 × 92 u, from x = -24 to about 127 and z = -46 to 46.` | `with today's 18 docked pods it is about 163 × 92 u, from x = -24 to about 139 and z = -46 to 46.` |
| `the top 5 projects (hero, then featured) in large type` | `the top 5 projects (docking order, gallery first) in large type` |
| ``| Docked pods (per wing) | Hero pods (12 × 9 u) by `order`, then featured pods (8 × 7 u) by `order`, alternating the outer side (away from the other wing) and the inner side (between the wing roads), starting at x = 14 (outer) and x = 20 (inner), 7 u apart along the road.`` | ``| Docked pods (per wing) | Hero (12 × 9 u) and featured (8 × 7 u) pods in site order (owner decision 2026-10-12, `comparePods`: pods with a gallery first, then hero before featured, then `order`), one 12 u slot each so both wings stay mirror images whatever the tier in each slot, alternating the outer side (away from the other wing) and the inner side (between the wing roads), starting at x = 14 (outer) and x = 20 (inner), 7 u between slots along the road.`` |
| `in docking order (hero first), then both directory boards` | `in docking order (gallery pods first), then both directory boards` |

- [x] **Step 5: Copy this plan into the repo**

```bash
cp /Users/shinyq/.copilot/session-state/d439b68f-b2e6-4b77-9feb-f9099e8cd824/files/plans/r3-d-content-casing-ordering.md docs/superpowers/plans/2026-10-12-content-casing-ordering.md
```

- [x] **Step 6: Verify docs pass the repo-wide lint**

Run: `bunx vitest run tests/content/safety.test.ts`
Expected: PASS (no em dash in any doc, including the copied plan). Also run `grep -c "titleCase.ts\|sortPods" AGENTS.md README.md docs/superpowers/specs/agent-hq/01-world-and-layout.md` and expect `0` for every file.

- [x] **Step 7: Commit**

```bash
rtk git add AGENTS.md README.md docs/superpowers/specs/agent-hq/01-world-and-layout.md docs/superpowers/plans/2026-10-12-content-casing-ordering.md
rtk git commit -m "docs: content style guide (Title Case, gallery-first order) and L3 docking"
```

---

### Task 9: Full verification, generated files, screenshots and PR

**Files:**
- Generated (gitignored, not committed): `functions/_generated/` (Ask knowledge pack), `out/` (static export, OG images), `screenshots/`.
- No source changes expected; fix forward in the task that owns a failure.

**Interfaces:**
- Consumes: everything above.
- Produces: a green branch, captures for the owner, an open PR.

- [x] **Step 1: Rebase on the latest main and re-run the title check**

```bash
rtk git fetch origin && rtk git rebase origin/main
bun scripts/title-case.ts; echo "exit=$?"
```

Expected: `0 title(s) not in Title Case`, `exit=0`. If parallel sessions added titles in the meantime, run `bun scripts/title-case.ts --write`, review the diff, and commit it as `fix(content): Title Case for new titles`. If a rebase conflict hits `content/site-content.json`, take `origin/main`'s file and re-run `--write` plus the four mission label edits from Task 4 instead of hand-merging.

- [x] **Step 2: Regenerate the Ask knowledge pack and check Ask**

```bash
bun scripts/build-knowledge.ts
bunx vitest run tests/ask
grep -n "Realtime voice AI contact center\|Digital banking integrations" tests/ask/golden.json tests/ask/redteam.json content/ask/suggestions.json; echo "quoted old titles: $?"
```

Expected: `Knowledge pack <hash>: <n> chunks, ... KB, as of <date>.` (the pack now carries the Title Case titles; it is gitignored and rebuilt by `typecheck` and `build`), Ask tests pass, and `quoted old titles: 1` (no golden, red-team or pill text quotes an old title, so `tests/ask/golden.json` needs no edit). No `PROMPT_VERSION` bump: the prompt did not change.

- [x] **Step 3: Quick verification**

Run: `rm -rf .next && bun run verify:quick`
Expected: typecheck, lint and every unit test pass, and the build ends with `defer-scripts: N of N HTML files now load Next.js chunks after first paint`.

- [x] **Step 4: Check the built pages**

```bash
grep -c "Realtime Voice AI Contact Center" out/en/labs.html out/en.html out/en/labs/voice-ai-contact-center.html
grep -c "Contact Center Voice AI Realtime" out/id/labs.html
grep -c "How We Made a Voice Agent Interruptible" out/en/library.html out/en/blog/making-a-voice-agent-interruptible.html
grep -c "Realtime voice AI contact center" out/en/labs.html; echo "old title gone: $?"
ls out/en/labs/voice-ai-contact-center.html out/og/en/labs/voice-ai-contact-center.png
```

Expected: every count is at least 1, `old title gone: 1`, and both files exist (slugs and OG paths unchanged). Open `out/og/en/labs/voice-ai-contact-center.png` and confirm the card title reads "Realtime Voice AI Contact Center". Then check the "All projects" order on the Work page:

```bash
bun -e 'const h = require("node:fs").readFileSync("out/en/labs.html", "utf8"); const i = h.indexOf("id=\"all-projects\""); console.log([...new Set([...h.slice(i).matchAll(/href="\/en\/labs\/([a-z0-9-]+)"/g)].map((m) => m[1]))].slice(0, 8).join(" > "))'
```

Expected: `ai-cv-screening-platform > bank-statement-analyzer > anime-figure-ecommerce > ai-app-accelerator > vulnerability-scanning-automation > fabric-forecasting-dashboard > ai-solutions-assistant > university-alumni-platforms`.

- [x] **Step 5: Run the e2e specs that cover the change**

Run: `bun run e2e:changed --dry` and then `bun run e2e:changed`
Expected: `e2e specs: ask, boot-first, deploy, experience, gallery, labs, library-roof, missions, pageview, seo, static-routes, walk` (plus `No e2e mapping for: scripts/title-case.ts (smoke specs added).`); all pass. Do not run two e2e suites at once on the machine (parallel sessions share it). If `walk` fails on the first stop, print `firstSoftwareStop` and compare with Appendix B before touching the test.

- [x] **Step 6: Screenshots for the owner**

```bash
bun run screenshots:pages -g "1440x900|390x844"
ls screenshots/pageview/work-1440x900*.png screenshots/pageview/work-390x844*.png screenshots/pageview/writing-1440x900*.png screenshots/pageview/writing-390x844*.png
```

Expected: the Work page (desktop and mobile, full page and fold) and the Writing page (blog list) captures exist. Look at them: project titles and post titles are in Title Case, "All projects" starts with gallery projects. Also open `/en/labs?tier=lite` with `bun run serve` and confirm the Product Engineering road now starts with the anime figure e-commerce and vulnerability scanning pods and the wing boards list them first.

- [x] **Step 7: Push and open the PR**

```bash
rtk git push -u origin feat/content-casing-ordering
gh pr create --title "feat(content): Title Case titles and gallery-first project order" --label screenshots --body "$(cat <<'EOF'
Owner requests: project, post and other titles in Title Case (for example "Realtime Voice AI Contact Center"), and Product Engineering and AI Engineering projects with a gallery listed first.

What changed
- `titleCase` rules (`src/content/title-case.ts`, EN and ID minor words, acronym and brand casing) applied to 100 titles in `content/site-content.json` and 8 MDX frontmatter titles; slugs and URLs unchanged. `tests/content/title-case.test.ts` and `bun run validate:content` keep future titles consistent; `bun scripts/title-case.ts --write` fixes them.
- One order for every project list: `orderPods` / `comparePods` (gallery first, then hero, featured, listed, then `order`). Work, Home, Quick view, Cmd-K, drawer prev/next, the L3 docking order, wing boards and "Tour my projects" follow it. L3 pods dock in uniform 12 u slots so both wings stay mirror images (the slab grows from x 127 to x 139).
- Mission labels name the wings: "Explore my Product Engineering work" / "Explore my AI Engineering work".
- Ask question bank: project pills follow the same order. Knowledge pack rebuilt from content; golden set unchanged (no fact quotes a title).
- Docs: "Content style" section in AGENTS.md, README, spec appendix 01.

Verification: `bun run verify:quick`, `bun run e2e:changed`, screenshots attached (Work desktop and mobile, Writing list).
EOF
)"
```

Expected: the PR URL. Attach the four Work and Writing PNGs from Step 6 to the PR description (drag and drop, or the `github-pr-media` skill); the `screenshots` label also makes CI capture the full set. Do not merge: the owner merges.

---
## Open risks and owner decisions to confirm

1. **Product Engineering heroes have no gallery.** The three software hero pods (`digital-banking-integrations`, `ticket-marketplace-backend`, `vendor-management-portal`) have no screenshots, so "Key projects" on `/labs` and the Home software rows (both filter `tier === "hero"`) look the same as before; gallery-first shows in "All projects", Quick view, Cmd-K, drawer prev/next, the L3 road (anime figure e-commerce and vulnerability scanning now dock first) and the tour. Promoting a gallery pod to `hero` is a content decision (heroes need an architecture with at least 3 nodes) and is out of scope.
2. **`best-swe` mission target.** "Explore my Product Engineering work" still drives to `L3:digital-banking-integrations` (no gallery). Pointing it at a gallery pod is a one-line content change if the owner wants it.
3. **L3 footprint.** Uniform 12 u slots keep the wings mirrored but stretch the slab east by 12 u (x 127 to 139). Render budgets (draw calls, triangles) do not depend on length; the camera and space-rule tests pass in a dry run. A parallel "pads" session may edit `src/experience/floors/labs/layout.ts`; resolve by keeping their changes and re-applying the `tourOrder`, `LABS.slot`, cursor and directory hunks from Task 6.
4. **Indonesian minor words.** The owner list is extended with PUEBI prepositions (`dalam`, `bagi`, `oleh`, `serta`, `tentang`, `sebagai`, `terhadap`, `kepada`); only "dalam" affects current content. "agar", "beserta", "bersama" stay capitalized ("Rancang Agar Bisa Pulih", "Laporkan Metrik Beserta Konteksnya", "Spec-Driven Development Bersama AI Coding Agent"). Change `MINOR_ID` if the owner prefers otherwise.
5. **Kept or changed proper titles.** "The Sun, The Moon, and The Dark Sea" (the owner's essay) is kept as styled via `TITLE_CASE_KEEP`; the Medium post title "CRUD NodeJS Menggunakan Framework ExpressJS Dan MySQL" becomes "... dan MySQL" and the award "Capture The Flag Competition" becomes "Capture the Flag Competition" (event names written in Title Case).
6. **Out of scope wording.** UI strings in `messages/*.json` that describe the wings in prose ("Selected software engineering work" in `quick`, `home.wingsIntro`) are not changed, to stay out of the HUD and landing sessions' files. Skill group labels stay sentence case (they render uppercase).
7. **Ask cache.** Cached answers in KV can quote old title casing until their TTL; harmless, no `PROMPT_VERSION` bump.
8. **Concurrent content edits.** Other sessions may add pods or titles before this merges; Task 9 Step 1 re-runs the script, and the content test blocks any title that slips through.

## Self-review

**Spec coverage**

| Requirement | Task |
|---|---|
| Title Case in content (not CSS) for pods EN and ID | Task 1 rules, Task 3 apply (Appendix A) |
| Blog post titles (dataset and MDX frontmatter) | Task 2 helpers, Task 3 apply and the frontmatter equals dataset test |
| Publication, research, talk and workshop titles, side projects, other heading titles (awards, principles) found via `schema.ts` | Task 2 `titleSlots`, Task 3 |
| Deterministic function: major words, EN and ID minor words except first or last, acronyms and brands allowlist, hyphenated words | Task 1 |
| Role titles, org names, body text untouched | Task 2 `titleSlots` scope, Task 3 Step 3 diff check |
| One-off script applies it; a test and the content check in verify fail on non Title Case | Task 2 script, Task 3 test plus `validate:content` (the test runs in `verify:quick`) |
| Ask knowledge pack and golden set, OG titles, slugs unchanged, e2e title matches | Task 9 Steps 2 and 4 (pack rebuilt, golden verified, OG checked, slugs unchanged); e2e specs read titles from content, the only hard-coded order (`walk.spec.ts`) is fixed in Task 6 |
| Gallery first within each wing everywhere: Work page, Home, Cmd-K, L3 placement, tour, Ask suggestion bank | Task 5 (`getPods`, catalog), Task 6 (layout, boards, tour), Task 7 (bank) |
| One shared selector with unit tests, no hard-coded slugs | Task 5 `orderPods` / `comparePods` |
| Mission labels align with wing names (EN and ID) | Task 4 |
| Keep diffs to content, selectors, tests | File Structure; components and messages untouched |
| Tests, regenerate, screenshots (Work desktop and mobile, blog list), docs (AGENTS content style), PR | Tasks 8 and 9 |

**Placeholder scan:** every code step shows the code; every command has an expected result. The only data-dependent values (`N` blocklist terms, pack hash, HTML count) are printed by the tools themselves.

**Type consistency:** `PodRank { tier; order; hasGallery }` (Task 5) is satisfied by `LabPod` once Task 6 adds `hasGallery: boolean`; `comparePods(a: PodRank, b: PodRank)` is used by `tourOrder` and the directory sort; `orderPods(pods: readonly Pod[]): Pod[]` is used by `getPods`, `buildRoomCatalog`, `tests/ask/suggestions.test.ts` and `e2e/walk.spec.ts`; `titleCase` / `isTitleCase` (Task 1) feed `titleCaseChanges` / `applyTitleCase` / `frontmatterTitle` / `withFrontmatterTitle` (Task 2), used by `scripts/title-case.ts`, `scripts/validate-fragment.ts` and `tests/content/title-case.test.ts` (Task 3). File names are kebab-case like the rest of `src/content/` (`title-case.ts`, `titles.ts`).

**Dry run:** the full change set was applied to a throwaway copy of `main` @ `2f986ab`: `bun run typecheck`, `bun run lint`, `bun run test` (87 files, 1013 tests) and `bun run build` passed, and the built `/en/labs` "All projects" order matched Appendix B. E2E was not run in the dry run (shared machine); Task 9 runs it.

---

## Appendix A: titles that change (before -> after)

100 fields in `content/site-content.json` plus 8 MDX frontmatter lines. Paths are the ones `bun scripts/title-case.ts` prints (pods and posts drop the `floors.labs.` / `floors.library.` prefix here). Unchanged on purpose: every paper and thesis title (already Title Case), all other award titles, the Medium post EN titles, the brand-named side projects (JagaRupa, CalorIQ, DevLens, AI Jury Council, Sentiboard), and "The Sun, The Moon, and The Dark Sea".

#### Pods (project titles)

| Field | Before | After |
|---|---|---|
| `pods[0](digital-banking-integrations).title.en` | Digital banking integrations | Digital Banking Integrations |
| `pods[0](digital-banking-integrations).title.id` | Integrasi perbankan digital | Integrasi Perbankan Digital |
| `pods[1](ticket-marketplace-backend).title.en` | Event ticket marketplace backend | Event Ticket Marketplace Backend |
| `pods[1](ticket-marketplace-backend).title.id` | Backend marketplace tiket acara | Backend Marketplace Tiket Acara |
| `pods[2](vendor-management-portal).title.en` | Vendor management portal | Vendor Management Portal |
| `pods[2](vendor-management-portal).title.id` | Portal manajemen vendor | Portal Manajemen Vendor |
| `pods[3](multi-tenant-saas-platform).title.en` | Multi-tenant SaaS and asset management | Multi-Tenant SaaS and Asset Management |
| `pods[3](multi-tenant-saas-platform).title.id` | SaaS multi-tenant dan manajemen aset | SaaS Multi-Tenant dan Manajemen Aset |
| `pods[4](payments-realtime-backend).title.en` | Travel payments and realtime backend | Travel Payments and Realtime Backend |
| `pods[4](payments-realtime-backend).title.id` | Backend pembayaran dan realtime untuk travel | Backend Pembayaran dan Realtime untuk Travel |
| `pods[5](anime-figure-ecommerce).title.en` | Anime figure e-commerce backend | Anime Figure E-Commerce Backend |
| `pods[5](anime-figure-ecommerce).title.id` | Backend e-commerce figure anime | Backend E-Commerce Figure Anime |
| `pods[6](vulnerability-scanning-automation).title.en` | Vulnerability scanning automation | Vulnerability Scanning Automation |
| `pods[6](vulnerability-scanning-automation).title.id` | Otomasi pemindaian kerentanan | Otomasi Pemindaian Kerentanan |
| `pods[7](limited-quota-event-ticketing).title.en` | Limited-quota event ticketing | Limited-Quota Event Ticketing |
| `pods[7](limited-quota-event-ticketing).title.id` | Ticketing acara berkuota terbatas | Ticketing Acara Berkuota Terbatas |
| `pods[8](event-tech-search-backend).title.en` | Event matchmaking and feedback analytics | Event Matchmaking and Feedback Analytics |
| `pods[8](event-tech-search-backend).title.id` | Matchmaking acara dan analitik feedback | Matchmaking Acara dan Analitik Feedback |
| `pods[9](digital-products-ecommerce).title.en` | E-commerce for digital products and training | E-Commerce for Digital Products and Training |
| `pods[9](digital-products-ecommerce).title.id` | E-commerce untuk produk digital dan pelatihan | E-Commerce untuk Produk Digital dan Pelatihan |
| `pods[10](university-alumni-platforms).title.en` | University alumni and counseling platforms | University Alumni and Counseling Platforms |
| `pods[10](university-alumni-platforms).title.id` | Platform alumni dan konseling universitas | Platform Alumni dan Konseling Universitas |
| `pods[11](voice-ai-contact-center).title.en` | Realtime voice AI contact center | Realtime Voice AI Contact Center |
| `pods[11](voice-ai-contact-center).title.id` | Contact center voice AI realtime | Contact Center Voice AI Realtime |
| `pods[12](ai-code-security-platform).title.en` | AI code security platform | AI Code Security Platform |
| `pods[12](ai-code-security-platform).title.id` | Platform keamanan kode berbasis AI | Platform Keamanan Kode Berbasis AI |
| `pods[13](fraud-review-platform).title.en` | AI fraud document review | AI Fraud Document Review |
| `pods[13](fraud-review-platform).title.id` | Review dokumen fraud berbasis AI | Review Dokumen Fraud Berbasis AI |
| `pods[14](ai-cv-screening-platform).title.en` | AI CV screening and evaluation | AI CV Screening and Evaluation |
| `pods[14](ai-cv-screening-platform).title.id` | AI CV screening dan evaluasi | AI CV Screening dan Evaluasi |
| `pods[15](bank-statement-analyzer).title.en` | Bank statement analysis PoC | Bank Statement Analysis PoC |
| `pods[15](bank-statement-analyzer).title.id` | PoC analisis rekening koran | PoC Analisis Rekening Koran |
| `pods[16](ai-app-accelerator).title.en` | Full-stack AI application template | Full-Stack AI Application Template |
| `pods[16](ai-app-accelerator).title.id` | Template aplikasi AI full-stack | Template Aplikasi AI Full-Stack |
| `pods[17](fabric-forecasting-dashboard).title.en` | Demand forecasting on Microsoft Fabric | Demand Forecasting on Microsoft Fabric |
| `pods[17](fabric-forecasting-dashboard).title.id` | Forecasting permintaan di Microsoft Fabric | Forecasting Permintaan di Microsoft Fabric |
| `pods[18](ai-solutions-assistant).title.en` | Bilingual RAG assistant with citations | Bilingual RAG Assistant with Citations |
| `pods[18](ai-solutions-assistant).title.id` | Asisten RAG dwibahasa dengan sitasi | Asisten RAG Dwibahasa dengan Sitasi |
| `pods[19](agent-orchestrated-delivery).title.en` | Spec-driven delivery with AI coding agents | Spec-Driven Delivery with AI Coding Agents |
| `pods[19](agent-orchestrated-delivery).title.id` | Delivery berbasis spec dengan AI coding agent | Delivery Berbasis Spec dengan AI Coding Agent |
| `pods[20](marketplace-productization).title.en` | Packaging AI apps for Azure | Packaging AI Apps for Azure |
| `pods[20](marketplace-productization).title.id` | Pengemasan aplikasi AI untuk Azure | Pengemasan Aplikasi AI untuk Azure |
| `pods[21](azure-ai-operations).title.en` | Shared Azure AI operations | Shared Azure AI Operations |
| `pods[21](azure-ai-operations).title.id` | Operasional Azure AI bersama | Operasional Azure AI Bersama |
| `pods[22](automotive-fraud-dashboard).title.en` | Fraud review dashboard and security remediation | Fraud Review Dashboard and Security Remediation |
| `pods[22](automotive-fraud-dashboard).title.id` | Dashboard review fraud dan remediasi keamanan | Dashboard Review Fraud dan Remediasi Keamanan |
| `pods[23](ticketing-assistant-replatform).title.en` | AI ticketing assistant migration | AI Ticketing Assistant Migration |
| `pods[23](ticketing-assistant-replatform).title.id` | Migrasi asisten ticketing AI | Migrasi Asisten Ticketing AI |
| `pods[24](mining-coa-assistant).title.en` | Chart-of-accounts AI assistant | Chart-of-Accounts AI Assistant |
| `pods[24](mining-coa-assistant).title.id` | Asisten AI chart of accounts | Asisten AI Chart of Accounts |
| `pods[25](credit-scoring-poc).title.en` | Explainable credit scoring in the browser | Explainable Credit Scoring in the Browser |
| `pods[25](credit-scoring-poc).title.id` | Credit scoring di browser yang dapat dijelaskan | Credit Scoring di Browser yang Dapat Dijelaskan |
| `pods[26](bank-genai-governance).title.en` | Bank GenAI portal governance | Bank GenAI Portal Governance |
| `pods[26](bank-genai-governance).title.id` | Governance portal GenAI bank | Governance Portal GenAI Bank |
| `pods[27](agent-deck-platform).title.en` | AI presentation authoring and hosting | AI Presentation Authoring and Hosting |
| `pods[27](agent-deck-platform).title.id` | Penyusunan dan hosting presentasi AI | Penyusunan dan Hosting Presentasi AI |
| `pods[28](solutions-marketing-site).title.en` | Bilingual AI solutions site | Bilingual AI Solutions Site |
| `pods[28](solutions-marketing-site).title.id` | Situs solusi AI dwibahasa | Situs Solusi AI Dwibahasa |
| `pods[29](insurer-contact-center-architecture).title.en` | Enterprise AI contact center architecture | Enterprise AI Contact Center Architecture |
| `pods[29](insurer-contact-center-architecture).title.id` | Arsitektur contact center AI enterprise | Arsitektur Contact Center AI Enterprise |

#### Posts (site-content.json)

| Field | Before | After |
|---|---|---|
| `posts[0](making-a-voice-agent-interruptible).title.en` | How we made a voice agent interruptible | How We Made a Voice Agent Interruptible |
| `posts[0](making-a-voice-agent-interruptible).title.id` | Cara kami membuat voice agent bisa diinterupsi | Cara Kami Membuat Voice Agent Bisa Diinterupsi |
| `posts[1](why-the-better-fraud-engine-shipped-in-shadow-mode).title.en` | Why the better fraud engine shipped in shadow mode | Why the Better Fraud Engine Shipped in Shadow Mode |
| `posts[1](why-the-better-fraud-engine-shipped-in-shadow-mode).title.id` | Mengapa fraud engine yang lebih baik dirilis dalam shadow mode | Mengapa Fraud Engine yang Lebih Baik Dirilis dalam Shadow Mode |
| `posts[2](45-percent-of-our-llm-calls-failed).title.en` | 45% of our LLM calls failed: what the error strings told us | 45% of Our LLM Calls Failed: What the Error Strings Told Us |
| `posts[2](45-percent-of-our-llm-calls-failed).title.id` | 45% panggilan LLM kami gagal: apa kata pesan error-nya | 45% Panggilan LLM Kami Gagal: Apa Kata Pesan Error-nya |
| `posts[3](spec-driven-development-with-ai-coding-agents).title.en` | Spec-driven development with AI coding agents | Spec-Driven Development with AI Coding Agents |
| `posts[3](spec-driven-development-with-ai-coding-agents).title.id` | Spec-driven development bersama AI coding agent | Spec-Driven Development Bersama AI Coding Agent |
| `posts[5](crud-nodejs-express-mysql).title.id` | CRUD NodeJS Menggunakan Framework ExpressJS Dan MySQL | CRUD NodeJS Menggunakan Framework ExpressJS dan MySQL |

#### Publications and models

| Field | Before | After |
|---|---|---|
| `publications[4](indobert-university-reviews-model).title` | IndoBERT sentiment model for Indonesian university reviews | IndoBERT Sentiment Model for Indonesian University Reviews |
| `publications[5](indobertweet-review-sentiment-model).title` | IndoBERTweet app-review sentiment model | IndoBERTweet App-Review Sentiment Model |
| `publications[6](indobert-review-sentiment-model).title` | IndoBERT app-review sentiment model | IndoBERT App-Review Sentiment Model |

#### Talks and workshops

| Field | Before | After |
|---|---|---|
| `talks[0](microsoft-ai-client-workshop).title.en` | Microsoft AI for business workflows | Microsoft AI for Business Workflows |
| `talks[0](microsoft-ai-client-workshop).title.id` | Microsoft AI untuk alur kerja bisnis | Microsoft AI untuk Alur Kerja Bisnis |
| `talks[1](agent-framework-walkthrough).title.en` | From a request to a tool-using agent with tracing in Microsoft Agent Framework | From a Request to a Tool-Using Agent with Tracing in Microsoft Agent Framework |
| `talks[1](agent-framework-walkthrough).title.id` | Dari satu request ke agent dengan tool dan tracing di Microsoft Agent Framework | Dari Satu Request ke Agent dengan Tool dan Tracing di Microsoft Agent Framework |
| `talks[2](basic-ai-study-groups).title.en` | Study groups for Basic Artificial Intelligence | Study Groups for Basic Artificial Intelligence |
| `talks[2](basic-ai-study-groups).title.id` | Pendampingan kelompok belajar Kecerdasan Buatan Dasar | Pendampingan Kelompok Belajar Kecerdasan Buatan Dasar |
| `talks[3](go-programming-practicum).title.en` | Go programming fundamentals practicum | Go Programming Fundamentals Practicum |
| `talks[3](go-programming-practicum).title.id` | Praktikum dasar pemrograman Go | Praktikum Dasar Pemrograman Go |
| `talks[4](programming-club-workshops).title.en` | Workshops and competitions for the programming club | Workshops and Competitions for the Programming Club |
| `talks[4](programming-club-workshops).title.id` | Workshop dan kompetisi untuk klub programming | Workshop dan Kompetisi untuk Klub Programming |
| `talks[5](hackathon-judge-2022).title.en` | Hackathon judging and team mentoring | Hackathon Judging and Team Mentoring |
| `talks[5](hackathon-judge-2022).title.id` | Penjurian hackathon dan pendampingan tim | Penjurian Hackathon dan Pendampingan Tim |

#### Side projects

| Field | Before | After |
|---|---|---|
| `sideProjects[4](certification-trainers).title` | Certification practice tools | Certification Practice Tools |
| `sideProjects[6](ewallet-sentiment).title` | E-wallet sentiment analysis (CNN-LSTM) | E-Wallet Sentiment Analysis (CNN-LSTM) |
| `sideProjects[7](sp500-portfolio-optimizer).title` | S&P 500 portfolio optimizer | S&P 500 Portfolio Optimizer |
| `sideProjects[8](crypto-portfolio-tracker).title` | Crypto portfolio tracker | Crypto Portfolio Tracker |
| `sideProjects[9](real-estate-cluster-map).title` | Real estate cluster map | Real Estate Cluster Map |

#### Awards

| Field | Before | After |
|---|---|---|
| `awards[13](capture-the-flag-2020).title` | Capture The Flag Competition | Capture the Flag Competition |

#### Principles

| Field | Before | After |
|---|---|---|
| `profile.principles[0](spec-first).title.en` | Define the spec first | Define the Spec First |
| `profile.principles[0](spec-first).title.id` | Tetapkan spec terlebih dahulu | Tetapkan Spec Terlebih Dahulu |
| `profile.principles[1](agents-parallel-human-gate).title.en` | Delegate implementation, own the review | Delegate Implementation, Own the Review |
| `profile.principles[1](agents-parallel-human-gate).title.id` | Delegasikan implementasi, tetap pegang review | Delegasikan Implementasi, Tetap Pegang Review |
| `profile.principles[2](evaluation-is-product).title.en` | Evaluate before release | Evaluate Before Release |
| `profile.principles[2](evaluation-is-product).title.id` | Evaluasi sebelum rilis | Evaluasi Sebelum Rilis |
| `profile.principles[3](fail-and-recover).title.en` | Design for recovery | Design for Recovery |
| `profile.principles[3](fail-and-recover).title.id` | Rancang agar bisa pulih | Rancang Agar Bisa Pulih |
| `profile.principles[4](numbers-carry-context).title.en` | Report metrics with context | Report Metrics with Context |
| `profile.principles[4](numbers-carry-context).title.id` | Laporkan metrik beserta konteksnya | Laporkan Metrik Beserta Konteksnya |

#### MDX frontmatter (`content/blog/*.mdx`, `title:` line)

| File | Before | After |
|---|---|---|
| `45-percent-of-our-llm-calls-failed.en.mdx` | 45% of our LLM calls failed: what the error strings told us | 45% of Our LLM Calls Failed: What the Error Strings Told Us |
| `45-percent-of-our-llm-calls-failed.id.mdx` | 45% panggilan LLM kami gagal: apa kata pesan error-nya | 45% Panggilan LLM Kami Gagal: Apa Kata Pesan Error-nya |
| `making-a-voice-agent-interruptible.en.mdx` | How we made a voice agent interruptible | How We Made a Voice Agent Interruptible |
| `making-a-voice-agent-interruptible.id.mdx` | Cara kami membuat voice agent bisa diinterupsi | Cara Kami Membuat Voice Agent Bisa Diinterupsi |
| `spec-driven-development-with-ai-coding-agents.en.mdx` | Spec-driven development with AI coding agents | Spec-Driven Development with AI Coding Agents |
| `spec-driven-development-with-ai-coding-agents.id.mdx` | Spec-driven development bersama AI coding agent | Spec-Driven Development Bersama AI Coding Agent |
| `why-the-better-fraud-engine-shipped-in-shadow-mode.en.mdx` | Why the better fraud engine shipped in shadow mode | Why the Better Fraud Engine Shipped in Shadow Mode |
| `why-the-better-fraud-engine-shipped-in-shadow-mode.id.mdx` | Mengapa fraud engine yang lebih baik dirilis dalam shadow mode | Mengapa Fraud Engine yang Lebih Baik Dirilis dalam Shadow Mode |

#### Mission labels (Task 4, wording, not casing)

| Mission | Before | After |
|---|---|---|
| `best-swe` EN | Explore my software engineering work | Explore my Product Engineering work |
| `best-swe` ID | Lihat karya software engineering saya | Lihat karya Product Engineering saya |
| `best-ai` EN | Explore my AI engineering work | Explore my AI Engineering work |
| `best-ai` ID | Lihat karya AI engineering saya | Lihat karya AI Engineering saya |

## Appendix B: project order (before -> after)

`g` = has a gallery, `h` / `f` / `l` = hero / featured / listed.

**`getPods("software")`** (Work list rows, Quick view, drawer prev/next, Cmd-K pods filter within the wing)

- Before: digital-banking-integrations (h) > ticket-marketplace-backend (h) > vendor-management-portal (h) > multi-tenant-saas-platform (f) > payments-realtime-backend (f) > anime-figure-ecommerce (f, g) > vulnerability-scanning-automation (f, g) > limited-quota-event-ticketing (f) > event-tech-search-backend (f) > digital-products-ecommerce (l) > university-alumni-platforms (l, g)
- After: anime-figure-ecommerce (f, g) > vulnerability-scanning-automation (f, g) > university-alumni-platforms (l, g) > digital-banking-integrations (h) > ticket-marketplace-backend (h) > vendor-management-portal (h) > multi-tenant-saas-platform (f) > payments-realtime-backend (f) > limited-quota-event-ticketing (f) > event-tech-search-backend (f) > digital-products-ecommerce (l)

**`getPods("ai")`**

- Before: voice-ai-contact-center (h, g) > ai-code-security-platform (h, g) > fraud-review-platform (h, g) > ai-cv-screening-platform (f, g) > bank-statement-analyzer (f, g) > ai-app-accelerator (f, g) > fabric-forecasting-dashboard (f, g) > ai-solutions-assistant (f, g) > agent-orchestrated-delivery (f) > marketplace-productization (l) > azure-ai-operations (l) > automotive-fraud-dashboard (l) > ticketing-assistant-replatform (l, g) > mining-coa-assistant (l) > credit-scoring-poc (l, g) > bank-genai-governance (l) > agent-deck-platform (l, g) > solutions-marketing-site (l, g) > insurer-contact-center-architecture (l)
- After: voice-ai-contact-center > ai-code-security-platform > fraud-review-platform > ai-cv-screening-platform > bank-statement-analyzer > ai-app-accelerator > fabric-forecasting-dashboard > ai-solutions-assistant > ticketing-assistant-replatform (l, g) > credit-scoring-poc (l, g) > agent-deck-platform (l, g) > solutions-marketing-site (l, g) > agent-orchestrated-delivery (f) > marketplace-productization > azure-ai-operations > automotive-fraud-dashboard > mining-coa-assistant > bank-genai-governance > insurer-contact-center-architecture

**Work page "All projects"** (`/labs`, both wings, non-hero), first 8 after: ai-cv-screening-platform > bank-statement-analyzer > anime-figure-ecommerce > ai-app-accelerator > vulnerability-scanning-automation > fabric-forecasting-dashboard > ai-solutions-assistant > university-alumni-platforms. "Key projects" and Home are unchanged (all AI heroes have galleries, no software hero has one).

**L3 docking and "Tour my projects"** (`tourOrder`, hero and featured only)

- Product Engineering before: digital-banking-integrations > ticket-marketplace-backend > vendor-management-portal > multi-tenant-saas-platform > payments-realtime-backend > anime-figure-ecommerce > vulnerability-scanning-automation > limited-quota-event-ticketing > event-tech-search-backend
- Product Engineering after: anime-figure-ecommerce > vulnerability-scanning-automation > digital-banking-integrations > ticket-marketplace-backend > vendor-management-portal > multi-tenant-saas-platform > payments-realtime-backend > limited-quota-event-ticketing > event-tech-search-backend (first tour stop: `L3:anime-figure-ecommerce`)
- AI Engineering: unchanged (voice-ai-contact-center > ai-code-security-platform > fraud-review-platform > ai-cv-screening-platform > bank-statement-analyzer > ai-app-accelerator > fabric-forecasting-dashboard > ai-solutions-assistant > agent-orchestrated-delivery)
- Wing boards (listed pods): software `university-alumni-platforms, digital-products-ecommerce` (was the reverse); AI `ticketing-assistant-replatform, credit-scoring-poc, agent-deck-platform, solutions-marketing-site, marketplace-productization, azure-ai-operations, automotive-fraud-dashboard, mining-coa-assistant, bank-genai-governance, insurer-contact-center-architecture`.
- Slab bounds: `{ minX: -24, maxX: 127, minZ: -46, maxZ: 46 }` -> `{ minX: -24, maxX: 139, minZ: -46, maxZ: 46 }`.

## Appendix C: Ask question bank order (`content/ask/suggestions.json`)

- `work` before: work-best, work-banking, work-tickets, work-vendor, work-stack, work-github, work-side, work-security
- `work` after: work-best, work-security, work-banking, work-tickets, work-vendor, work-stack, work-github, work-side (first four pills: best, vulnerability scanning, banking, tickets)
- `ai` before: ai-voice, ai-fraud, ai-agents, ai-security, ai-voice-latency, ai-shadow, ai-llm-failures, ai-voice-interrupt, ai-documents, ai-solutions-assistant, ai-forecasting, ai-research, ai-models
- `ai` after: ai-voice, ai-security, ai-fraud, ai-documents, ai-voice-latency, ai-shadow, ai-llm-failures, ai-voice-interrupt, ai-forecasting, ai-solutions-assistant, ai-agents, ai-research, ai-models (first four pills: voice, code security, fraud review, CV screening)
- `career`, `contact`: unchanged. `followUps` lists are unchanged.

---

## Execution handoff

Plan complete. Two execution options:

1. **Subagent-Driven (recommended):** a fresh subagent per task, review between tasks (superpowers:subagent-driven-development).
2. **Inline Execution:** execute tasks in one session with checkpoints (superpowers:executing-plans).

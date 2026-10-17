# Content style and safety

The hard rules in full, the editorial voice and title rules for content, and the public-safety lint that keeps private data and client names out of the repo and the export. Index: [AGENTS.md](../../AGENTS.md).

## Hard rules

### No em dashes

- No em dashes (U+2014) anywhere: code, comments, copy, docs, commits, PR text.
- A unit test scans the repo.
- Use commas, colons, parentheses or "to" instead.

### No first person in mottos, taglines or titles (owner decision)

- No "I", "my", "me" (EN) or "saya", "aku" (ID) in:
  - `profile.headline` and `profile.subheadline` (the motto)
  - pod titles and taglines, post titles
  - page titles and OG card text
- Body text and stories keep the first person.
- Guards:

  | What | Check |
  |---|---|
  | Headline and titles | `hasFirstPerson` (`src/lib/first-person.ts`) in `tests/content/first-person.test.ts` |
  | Page titles | `tests/unit/seo-copy.test.ts` |
  | Share card text | `tests/unit/og-cards.test.ts` |
  | The motto and every pod tagline | `tests/content/taglines.test.ts` |

### Public repo

- Never commit:
  - private evidence, private repository names, cloud resource names
  - phone numbers, addresses, ID numbers
  - money amounts, salary or review text
  - the Master's degree
  - 2026 hackathon entries (see below)
  - any photo (see the exception below)
- 2026 hackathon entries are excluded by default.
  - An entry the owner approves explicitly may appear, and is named openly as a hackathon entry.
  - Approved today: Sewise Fashion Labs, allowlisted in `tests/content/dataset.test.ts`.
- Photo exception (owner decision): the owner's own portrait only:
  - `public/og-assets/kurniadi-photo.png` for share cards and JSON-LD
  - the web sizes under `public/brand/`

### No client company names (C3)

- Clients of the owner's employers (for example the bank, automotive, bakery, mining, lender and insurer clients) never appear on the site.
  - Not in text, alt text, slugs, metadata, OG cards, JSON-LD, search, room views or 3D labels.
  - Use a sector label instead: `Pod.client` as `{ en, id }`, e.g. "National digital bank" / "Bank digital nasional".
- Employers stay named: Metrodata / PT Mitra Integrasi Informatika, Jenius (SMBC Indonesia) for the 2024 to 2025 job only, Jatis, MNC, internships.
- The freelance clients in C8 stay named too.
- Product names are allowed, including MII / Metrodata products:
  - ARIA, Pris.AI, MII Fraud Detection, MII E-Recruitment, eVendor, MII Deck, MII AI Ticketing.
  - ATLAS and FREDDY are client work, so they get a sector label.
  - Never claim a product the owner did not build (Deck Studio inside MII Cowork, not all of Cowork).
- Sole exception: the owner's CV PDF in `public/cv/`, committed byte for byte at the owner's request.
  - It may list items the site text hides. Never edit or regenerate it.
  - Its page images in `public/cv/pages/` (rendered by `bun run cv:pages` for the CV viewer) share that exception.
  - Never OCR them into site text or alt text (alt text is "CV page N of M").

### Content is data

- Pages, rooms, pods and missions are generated from `content/site-content.json`.
- Never hardcode career facts in components.

### Bilingual

- Every user-facing content string is `{ en, id }`.
- Indonesian is natural and professional ("saya"); technical terms stay in English.
- UI strings live in `messages/en.json` and `messages/id.json` with identical keys.

### Static export

- `output: "export"`: no server runtime, no middleware/proxy, no API routes, no `next/image` optimization.
- Every route must pre-render through `generateStaticParams` and set `dynamicParams = false` on dynamic segments.

### Every route works without WebGL

- 3D mounts client-side on top of the HTML pages and must never replace their content.

## Content style

### Bilingual editorial voice

- Review copy in context, with Indonesian as the priority.
- Prefer warm, direct, professional sentences without unnecessary `Anda` or `kamu`.
- Keep strong existing passages rather than rewriting every line.
- Preserve facts, measurement caveats, negative results, team credit, official names, citations, code, URLs and identifiers.
- Never use promotional hype or AI-detector scores as editorial evidence.

| Context | Voice |
|---|---|
| Navigation and actions | Short, literal, action-led, usually pronoun-free |
| Rover guidance | Friendly host, explicit controls and useful next steps; Rover is not the owner |
| Owner stories and technical writing | Natural `saya` / `I`, concrete decisions, outcomes and limitations |
| Titles, mottos, taglines and share cards | No first person; existing Title Case rules apply |
| Personal essays and poetry | Preserve `aku`, imagery, rhythm, quotations and attribution; literary changes need author approval |
| Ask AI | Site assistant, not the owner speaking; third-person attribution, grounded and short: at most three short sentences, or one sentence and a bullet list of at most five items, with bold titles and site links only |
| Errors and refusals | State the real boundary or failure and an available next action |
| Privacy and stats | Neutral, implementation-backed wording; distinguish anonymous analytics from the 30-minute anti-bot cookie |

### Contextual glossary

- The boost control is `Boost` / `Turbo`.
- Use navigation's localized page names.
- Keep `Rover menu` / `Menu Rover`, `Ask Rover Assistant` / `Asisten Rover`, `Classic site` / `Situs klasik` and all three wing names unchanged.
- Use `makalah` for reader-facing paper controls, `repositori` for public code links, and `situs aktif` for a live-site action when appropriate.
- Keep `paper`, `repo`, `live`, `production`, RAG, backend, guardrail, observability and shadow mode where technical prose needs them.
- Never apply global term replacements.

### Copy compatibility

- Preserve dictionary keys, interpolation variables and ICU semantics.
- Preserve the existing limits: 40-character mission, 110-character dialog, 120/640-character perspective (question/answer, `PerspectivesFileSchema`) and 140 to 160-character SEO.
- Edit authoritative sources, and align hosted-post frontmatter with the registry.
- Keep sample limits in the registry excerpt plus first paragraph used by Ask.
- Do not change retrieval compression, scope, safety checks, routes or behavior to accommodate wording.
- Bump `PROMPT_VERSION` for prompt changes.

### Title Case for titles (owner decision)

- Stored in Title Case in both locales, never cased with CSS `text-transform`:
  - pod, post (`site-content.json` and the MDX frontmatter `title`), publication, talk, side project, award and principle titles.
- Not titles: role titles, org and certification names, skill group labels (rendered uppercase), mission labels (sentence-case actions) and body text.
- The rules live in `titleCase` (`src/content/title-case.ts`):
  - Capitalize every word except minor words that are not first, last or right after a colon.
  - English minor words: a, an, and, as, at, but, by, for, in, of, on, or, the, to, vs, via, with.
  - Indonesian minor words: dan, di, ke, dari, untuk, yang, dengan, atau, pada, plus the PUEBI prepositions dalam, bagi, oleh, serta, tentang, sebagai, terhadap, kepada.
  - Both lists apply in both locales, because titles mix languages.
  - Keep words with an inner capital as written (AI, SaaS, PoC, IndoBERT).
  - Fix brands through `BRAND_CASING` (iOS, e2e, .NET); common words such as "it" or "line" are never in it.
  - Case each part of a compound (E-Commerce, Chart-of-Accounts, Error-nya).
  - Creative titles the author styled on purpose go in `TITLE_CASE_KEEP`.
- Checks and fixes:
  - `tests/content/title-case.test.ts` and `bun run validate:content` fail on a title that `titleCase` would change.
  - `bun scripts/title-case.ts` lists them; `bun scripts/title-case.ts --write` fixes `site-content.json` and the MDX frontmatter.
- A post's frontmatter title must equal its `site-content.json` title.
- Slugs and URLs never change with a title.

### Gallery first (owner decision)

- Every project list uses one order: `orderPods` / `comparePods` in `@/content/selectors`.
  - Order: pods with at least one gallery image first, then hero, featured, listed, then `order`.
  - Lists: Page View Work, Home, Quick view, Cmd-K, drawer prev/next, the L3 docking order, the wing boards and the "Browse my projects" palette.
- Never hard-code slugs to reorder; add a gallery or change `tier`/`order` in content.
- Topic questions in `content/ask/suggestions.json` that ask about one project follow the same order (`tests/ask/suggestions.test.ts`).
- Exception: the Ask "Projects summary" chunk keeps its own hero-first order on purpose; it answers "best project" questions.

### Wing names in mission labels

- The `work` mission's Rover line names every wing exactly as `common.wing` ("Product Engineering", "AI Engineering", "Data and ML" / "Data dan ML").
- `tests/content/dataset.test.ts` checks the `work` mission.

## Public-safety lint

### Content scan

- `tests/content/safety.test.ts` scans `site-content.json`, MDX and messages.
- It uses the merged blocklist:
  - the committed default list
  - `content/.safety-blocklist.local.txt`
  - the `SAFETY_BLOCKLIST` env var, which CI reads from the required repository secret
- And the forbidden patterns: em dash, money, phone numbers, Azure hostnames, Master's degree.
- Validate content edits quickly with `bun run validate:content`.

### Blocklist sources and format

- The committed default list names the client companies (C3); they are public companies, not secrets.
- SMBC Indonesia was also an employer, so its term is a regex that only allows the exact employer label "Jenius (SMBC Indonesia)".
- Add any new client of an employer there.
- Format: one term per line or comma separated, `#` comments.
  - Plain terms match case-insensitively on word boundaries.
  - `/regex/` terms are case-sensitive.

### Allowlist

- `content/safety-allowlist.txt` lists the allowed product names.
- `loadBlocklist` drops matching terms from every source (a plain term equal to one, or a `/regex/` that names one), so an older private list never flags them.
- Never add a client name (a unit test checks).

### Build output scan

- `scanBuildOutput(out, loadBlocklist())` covers every `.html`, `.txt`, `.json`, `.xml`, `.webmanifest`, `.js`, `.mjs`, `.css`, `.svg` and `.md` file of the export (`BUILD_TEXT_FILE`).
- Why: client chunks do carry content strings (Ask pills, TS constants), so a client name cannot reach a page, RSC payload, script, sitemap or room data file.
- Blocklist terms only: forbidden patterns would flag RSC references such as `"$1c"`.
- `scripts/scan-export.ts` runs it:
  - right after the CI build (`site` job)
  - after the production build in `deploy.yml`, the artifact that ships
- `e2e/deploy.spec.ts` repeats it.

### Private blocklist gate (owner decision)

- `scripts/scan-export.ts` fails `push`, `workflow_dispatch` and `schedule` runs (main, deploy) when the merged list has no term beyond the committed default list.
- On `pull_request` it warns with a job summary line instead (forks and Dependabot get no secrets), so a skip is never silent.
- It never prints the terms or their number.
- The repository variable `SAFETY_BLOCKLIST_GRACE_UNTIL` (`YYYY-MM-DD`) turns the failure into a warning until that day while the owner sets the secret.

### Never print a private term

- Anything that can print a match (tests, `scanBuildOutput` hits, scripts, ask-eval logs and reports) uses:
  - `findBlockedLabels` / `formatBlockedTerms`: committed default terms stay readable; every other term shows as `private term #n`.
    - `n` is its position among the private terms: `.safety-blocklist.local.txt` order, then the secret.
  - `redactBlockedText` for free text.
- ask-eval shows a blocklist replacement as a count.
- `tests/unit/safety-redaction.test.ts` is the canary.

### Live links

- The Azure hostname pattern stays forbidden in all copy, except a pod's `liveUrl` leaf whose URL passes `isPublicLiveUrl`.
  - `leafForbiddenPatterns(leaf)` in `src/content/safety.ts`, used by the content test and `validate:content`.
- `loadBlocklist` also drops a private term equal to a public host or its App Service name (`PUBLIC_LIVE_NAMES`: `mii-microsoft`, `mii-microsoft-ai`).
  - So a private list naming them cannot flag the public URLs.
  - Every other resource name stays private and blocked.
- They stay out of `content/safety-allowlist.txt` on purpose: that file also feeds the Ask entity allowlist, where `mii-microsoft` would let "worked at Microsoft" pass the employer check.

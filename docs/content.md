# Content guide

How the site's content is stored, checked and published. The authoritative rules (owner decisions, schema additions, style) are in [`agents/content.md`](agents/content.md) and [`agents/content-style-and-safety.md`](agents/content-style-and-safety.md) (indexed from [`AGENTS.md`](../AGENTS.md)); this page is the practical summary.

## Contents

- [Dataset and posts](#dataset-and-posts)
- [Build story](#build-story)
- [Security page](#security-page)
- [Perspectives](#perspectives)
- [Titles and ordering](#titles-and-ordering)
- [Project galleries and live sites](#project-galleries-and-live-sites)
- [Writing a story case study](#writing-a-story-case-study)
- [Impact and scale results](#impact-and-scale-results)
- [Skills](#skills)
- [Certifications](#certifications)
- [CV](#cv)
- [Research papers](#research-papers)
- [Paper PDFs](#paper-pdfs)
- [Study guides](#study-guides)
- [Public safety](#public-safety)

## Dataset and posts

- `content/site-content.json` is the single public dataset. It is validated by the zod schemas in `src/content/schema.ts` at build time and by the tests. All text is `{ en, id }`.
- Blog posts are MDX files in `content/blog/<slug>.<locale>.mdx`. A missing translation falls back to the original with a note; that copy's canonical names the original, with no hreflang, sitemap or feed entry (`PostRef.languages` decides).
- Optional frontmatter `updated: "YYYY-MM-DD"` marks a significant revision of that translation: the post then shows "Updated" next to its date and emits `dateModified`, `article:modified_time`, the feed entry's `<updated>` and the sitemap `lastmod`. Set it only on a real revision, never a typo fix, and never invent a day; a value before the post's `date` or a malformed one fails the build. Without it the post carries only its `date`.
- Posts are GitHub Flavored Markdown (`remark-gfm`, at build time): pipe tables render as real tables (ruled rows, tabular figures) inside a focusable scroll region labelled `blog.tableLabel`, so a wide table scrolls sideways on a phone while the page does not. Strikethrough, autolinks, footnotes and task lists also follow GFM. `tests/content/blog-mdx.test.tsx` fails when a post's pipe table does not compile to a `<table>`.
- Review EN and ID independently in context, including unchanged passages. Keep sample sizes, evaluation scope and unresolved results in compact excerpts too. The entire Sun/Moon essay family is protected, including frontmatter, registry text and essay-specific accessible copy; do not add an EN translation.
- Every hosted post also carries `PostRef.summary`, the AI Summary block above its first paragraph: exactly one continuous short paragraph (about 100 to 160 words, with no line breaks) that gives the article's point, its own numbers and its limits. Draft it from what that post says, never from new numbers or claims; use a neutral synopsis voice in both EN and ID, not the author's voice addressing the reader. Write both locales independently; use professional, natural Indonesian without "Anda"/"kamu"; use capability names, keep the quotation marks of the post's own terms, and never copy the excerpt. The label ("AI Summary" / "Ringkasan AI") discloses that the text is generated, so the owner reviews every summary in the PR. The protected Sun/Moon essay gets an Indonesian paragraph only. `bun run validate:content` and `tests/content/post-summary.test.ts` enforce count, length and voice.
- For Indonesian revisions, use the draft, audit, final-revision method from [humanizer-indonesia](https://github.com/adhiprib/humanizer-indonesia): check calques, diction, personification, repetitive openings and fragmented prose. Use a neutral semiformal voice, retain good copy and technical English, and preserve quotations. Review supporting knowledge and runtime copy before `messages/id.json`; keep keys, ICU arguments and layout-message bytes unchanged or smaller, then check rendered HTML and 3D text limits.
- Diagram node and optional edge labels accept either a shared string or strict `{ en, id }` text. Labels resolve once per locale before measurement, SVG drawing, accessible summaries and room DTOs. Use capability names for editable project labels; technical resource identifiers, node IDs, edge endpoints, group names and topology remain unchanged.
- A technical post can show an architecture figure: `<Architecture pod="<pod-slug>" caption="..." />` reuses a case study's diagram, and `<Architecture diagram="<id>" caption="..." />` draws a post-local one from `content/blog/diagrams.json` (keyed by post slug, then diagram id; each value has the pod `architecture` shape: nodes with layer, row and kind, plus edges). Props are strings only, and the tag is self-closing with double-quoted props, so `tests/content/post-diagrams.test.ts` can read it. Follow each figure with a numbered walkthrough of the flow, put the same tags in both locales (only the caption is translated), and note that an unknown pod or diagram fails the build and that test (which also flags unused diagrams). Diagrams are drawn at build time as inline SVG (boxes and arrows; dashed for `async` edges): left to right from 1100 px when the drawing fits (a post figure may extend past the text column), top to bottom below that and on phones. An optional node `group` (for example "Cloudflare") draws a frame around its nodes; keep a group on neighbouring layers and rows so the frame holds only its members. The group name sits above the frame's top-left corner, or further along the top when an edge runs through that corner. `tests/unit/diagram-layout.test.ts` fails when a post diagram has crossing edges in any layout, or when any edge, node or edge label touches a group name.
- Check an edit quickly with `bun run validate:content`.

### English-only editorial passes

The [approved English rewrite](superpowers/specs/2026-11-03-english-editorial-rewrite-design.md)
covers the dataset, hosted English articles, approved perspectives, build story,
guide metadata, diagram labels, interface and accessibility copy, Rover guidance
and visible Ask copy. Retain clear passages and official names. Explain the
problem, decisions and limits using existing public evidence, without adding
unmeasured outcomes.

Keep Indonesian values, shared fallbacks, document assets and the complete
Sun/Moon essay family unchanged. Align article frontmatter with registry metadata
before testing. Rebuild the knowledge pack, refresh changed embeddings using
`bun scripts/ask-embed.ts --cli`, and check retrieval and existing pack budgets.
Use a coverage ledger and compare Indonesian source and generated output against
the recorded base. Screenshots support reading review; they do not replace
source, metadata, evidence or preservation checks.

### Minimal capability naming and owner accountability

Public website copy names projects by capability, including employer-built, freelance, personal and
hackathon work. Preserve employers, site identity, relevant technologies and official publication titles.
Original screenshots, PDFs, quotations, URL destinations, technical identifiers and historical records
are accepted exceptions, not evidence that all visible branding has been removed. The complete Sun/Moon
essay family remains protected.

Keep the pass minimal: replace project brands and explicit passive-agent framing, not clear surrounding
prose. Owner stories state the owner's decisions, spec/plan reading, review and accountability while
retaining factual AI implementation, colleague leadership, role boundaries and measurement caveats.
Ask and Rover remain assistants; legitimate Continue/Lanjut controls stay.

Side project `title` accepts `{ en, id }` for descriptive names and a shared string for existing titles.
Resolve it through `sideProjectTitle` for Classic headings, search, Workshop views, 3D labels and Ask.
Project `shortTitle` stays under 32 characters and strictly shorter than the full title in each locale.
Renaming a blog heading must preserve existing fragments: a content-local empty inline span can retain
the old ID inside the real heading without creating a second contents row.

The bilingual `aria-acs-to-livekit` case study belongs to **AI in Production**. Its
post-local migration figure compares the old and new media paths. Results retain
the reduced-PoC scope, sample sizes and failed setup gate; the ACS harness reference
bypasses the ACS media plane and is not a controlled migration-speedup comparison.

The bilingual `ten-very-hard-benchmark-tasks-in-ten-days` post belongs to **Engineering
with AI Agents**. It teaches the method, never a task: no client or benchmark-vendor
name beyond the public Terminal-Bench, no task names, data, mechanisms or per-task
scores. Its only outcome numbers are aggregates (ten tasks, half merged at publication
and most in the hardest band; in the end sixteen pull requests, ten merged, five of
them after a redesign); its process numbers come from the owner's workspace. Its two
post-local figures show the idea funnel and the agent organisation.

The bilingual personal essay `before-it-looked-like-talent` ("Before It Looked Like Talent" /
"Sebelum Terlihat Seperti Bakat") is the only post on the **Personal** track, under the Personal topic
(tags `personal`, `growth`). The owner wrote the English body and approved the Indonesian one, which
keeps `aku`: edits need his approval. Its only link points "AI Benchmark Engineer" to the benchmark
post in the same locale. The Sun/Moon essay stays on Earlier Writing.

### Reader tracks

The L4 Writing floor shelves the posts by reader track, one bookshelf bay per track (owner decision [2026-10-25](decisions/2026-10-25-l4-reader-tracks.md); the floor in [`agents/floor-l4-library.md`](agents/floor-l4-library.md)).

- Publishing a post: give its `floors.library.posts[]` entry a `track`, the slug of one entry in `floors.library.tracks`. Every post sits on exactly one track.
- Optionally make it the track's `lead` (the post that stands face-out first on the shelf and heads the track drawer). Without a `lead` the newest post of the track leads, so a new post leads its track until the owner picks another.
- Tracks (`floors.library.tracks`): 1 to 6 entries in bay order, each `{ slug, title: { en, id }, lead? }`, slugs unique. Titles are bilingual, Title Case like every title (minor words stay lowercase: "Engineering with AI Agents", "Rekayasa dengan AI Agent"), no first person, no client names (C3).
- A track with no posts gets no bay and no drawer; keep each track at least one post (`tests/content/dataset.test.ts`).
- `bun run validate:content` fails on a post without a `track` or with an unknown one, a `lead` that is not a post of that track, a duplicate track slug, fewer than 1 or more than 6 tracks, and a track title that is not Title Case (also `tests/content/title-case.test.ts`). `tests/content/first-person.test.ts` keeps track titles out of the first person.

## Build story

The "How this site was built" page (`/{locale}/build`) renders `content/build-story.json`; its numbers come from a snapshot, never from the text.

- Edit `content/build-story.json` (title, lead, the seven stations: rounds as contiguous pull request ranges, the quality gates with `where`, the Brain pipeline and steps, the Rejected Designs ideas). Text is `{ en, id }`, neutral or third person, no client names (C3), no cloud resource ids or hostnames. `tests/content/build-story.test.ts` (schema) and `tests/content/safety.test.ts` (forbidden patterns) check it; client names are kept out by review.
- Build rounds: each round lists its merged pull request range (`prs.from` to `prs.to`, `to: null` while the round is open). Add a round with its range when a round ships; the page counts pull requests and dates per round from the snapshot.
- Never type a snapshot count in the text (commits, pull requests, tests, files, documents): put it in the snapshot or leave it out. Budgets may be written in a gate's copy (`budget`) because `tests/content/build-story.test.ts` pins each one to its source (`e2e/budgets.ts`, `lighthouserc.json`); change the number in both places.
- Pull requests whose diff exposes text the site hides (client names, C3) go into the timeline's `unlinkedPrs`: they are still counted and listed, as plain text without a link. Round summaries never mention what was hidden.
- `published` is the page's first public date (JSON-LD `datePublished`); the snapshot date is `dateModified`.
- The dashboard shows unit test files (a count of `tests/**/*.test.{ts,tsx}`), not unit tests: Vitest lists an `it.each` template once, so a test count would be wrong. The end-to-end count comes from `playwright test --list`. "Spec documents" counts the design spec files under `docs/superpowers/specs/` (appendices included).
- One home per topic: deploy and rollback are told only in the main-run gate (`main-complement`), the budgets only in the Gates, the Agents loop ends at "Gates and Release"; `tests/content/build-story.test.ts` checks that the Blueprint and Agents steps never explain rollback.
- B1-only layer: the snapshot also carries `log` (the owner decision log from `docs/decisions/` and the plan ledger from each plan's `Status:` line, parsed by `scripts/docs-index.ts`), `ask` (the golden set and pass mark, the prompt revision, the pack cap, the turns and rate limits from Ask's code) and `activity` (merges in the last 7 days and the busiest day). Only the B1 drawers show them (`content/room-views/engine.ts`); the `/build` page never does (a unit test scans its sources). Decision and plan text is the repository's own English, one sentence without asides (the owner's chat quotes, docs paths), under a note that says so in both languages.
- Refresh the snapshot with `bun scripts/build-facts.ts --write` (needs a full git history; CI and deploy builds do this themselves, and local builds use the committed `content/generated/build-facts.json`).
- Before and after captures live in `public/build-story/` (WebP, named `r<round>-before.webp` and `r<round>-after.webp`) and are referenced from the round's `shots` with alt text in both languages.
- The Blueprint's `stack` lists the tools the site is built with (tech registry names, 4 to 14). The B1 Stack Halo orbits their logos with the agents' `tools`: after changing either list (or one of their logos in `public/tech/`), run `bun run engine:atlas` and commit `public/atlas/engine.*.webp`, `src/experience/floors/engine/engine-atlas.ts` and `scripts/engine-atlas.lock.json` (`bun run build` and `tests/unit/engine-holo.test.ts` fail until then). A name without a logo is drawn as a text cell. The B1 bay holograms read their numbers from the story and the snapshot (`RoomEngine.holo`), so they follow content changes by themselves.
- Ask the HQ keeps its own short note about the site in `content/ask/site-build.json`; it points visitors to this page.
- Ask post chunks derive the latest-post discovery label from registry publication dates. Keep frontmatter and registry excerpts aligned, including sample limits that must survive the single-lead-paragraph knowledge window.

## Security page

The Security in Practice page (`/{locale}/security`) renders `content/security.json` (`SecurityPageSchema`, `src/content/security.ts`).

- Impact first (owner decision 2026-11-13): proof, AI and incident rows lead with a before and after (`delta`; `value` must read "<before> to <after>"); counts stay small supporting context. A value with words is `{ en, id }`.
- Public-safe facts only: never a client, service, host, resource or repository name, never code or a secret, and incidents dated by month (`YYYY-MM`). Numbers come from the owner's git history and IaC and are re-checked against the commit that recorded them before they go in.
- `ai.results[].pod` and `products.items[].pod` name case studies, `background.awards` names `awards` ids; `bun run validate:content` and the build fail on an unknown one. The keyless diagram has at most 12 nodes.
- The Ask `security` chunk is built from it: after an edit run `bun scripts/ask-embed.ts --cli` and commit the cache.

## Perspectives

- `content/perspectives.json` holds Kurniadi's own answers to common professional questions (EN and ID).
- They are Ask AI knowledge only: no page shows them (owner decision 2026-10-14).
- An entry enters the knowledge pack only after the owner approves it (`"approved": true` per entry, or `"status": "approved"`).
- How to edit and approve: [`ask-runbook.md`](ask-runbook.md) section 15.

## Titles and ordering

- Titles (projects, posts, L4 reader tracks, publications, talks, side projects, awards, principles) are written in Title Case in both languages.
- `bun scripts/title-case.ts` lists any that are not and `--write` fixes them (rules: "Title Case" in [`agents/content-style-and-safety.md`](agents/content-style-and-safety.md)).
- A project whose title does not fit one line on its L3 directory board can set `shortTitle` (`{ en, id }`): at most 32 characters, shorter than the title in both languages, Title Case, no first person. Only the L3 boards use it; every other page, card and drawer keeps `title`.
- Projects with a gallery come first in every project list (Work, Home, Cmd-K and the L3 wing roads), then hero, featured and listed pods by `order` (`orderPods` in `src/content/selectors.ts`).
- The home page "Selected work" (and the L1 Highlights Hall projects) shows the pods with `selected: 1`, `2` and `3` in that order. Each needs a gallery and the ranks must be unique; the tier stays free, so a hero can remain a key project on `/labs` without a landing slot.
- The rest of the Highlights Hall follows the dataset with no extra field (`src/content/highlights.ts`): Wins counts every entry in `awards` by its English placement, Now lists the timeline's jobs and freelance roles with `end: "present"`, and Results shows only case study results with `confidence: "verified"` whose value reads as a before and after (`→` or ` to `). Mark a result verified only once its number is confirmed; it then appears there with a link to its case study.

## Project galleries and live sites

- Project galleries are screenshots of the live apps (`public/media/<slug>/`; the vendor portal's come from a local demo instance with demo data).
- Private data is blurred: company and people names, contact details, amounts, tax and bank identifiers, document numbers and hostnames.
- Two client projects stay text only by the owner's choice: the coal mining chart-of-accounts assistant and the automotive fraud review dashboard.
- Projects with a public live site (`liveUrl`, allowlisted hosts in `src/content/live-links.ts`; today the Microsoft Solutions Website and the AI Solutions Portfolio and Assistant) show a "Visit live site" button on their case study, in the project rows and in the Glass Drawer footer.
- It opens a new tab with `rel="noopener noreferrer"`; internal apps never get a link.

## Writing a story case study

The six featured case studies and the AI app template (`STORY_SLUGS` in `src/content/schema.ts`) read as a story on the Classic site: Situation, Role and key decisions, Results, Lesson. The text lives in the pod's `story` in `content/site-content.json` (rules: [`agents/content.md`](agents/content.md#pod)).

- **Situation**: two or three sentences on where things stood and what was at stake, grounded in the pod's own problem text. Body text, so the first person is fine.
- **Decisions**: 2 to 4, each a short title in sentence case that starts with the action (a heading: no first person, at most 90 characters) and the why in one or two sentences. Each reason must be true to the pod's own text; do not invent motives.
- **No new numbers**: every number in the situation and the decisions must already appear in the pod's tagline, problem, approach, results or role. `tests/content/recruiter-pass.test.ts` fails otherwise. Results stay in `results`.
- **Lesson** (optional): the owner's own words only. Draft it from what the owner already wrote (posts, perspectives, the CV, commit messages), show it to the owner, and add it only after the owner approves it. Never write a lesson for the owner.
- Keep `problem` and `approach`: the 3D drawer, the missions and Ask still use them.
- EN and ID are written independently, like every other text; no client names (C3).
- **Engineering detail** (optional `engineering`, any pod): 1 to 4 topics for a technical reviewer (the voice AI case study has Latency Budget, Failover Design, Evaluation Method, Security and Identity). Each has a Title Case heading, a one-line summary, 2 to 5 points, the known limits and optionally a related post slug. Every number must trace to the project's own docs or measurements (measured results over intent); leave out what cannot be sourced, keep security at the pattern level (no resource names, hosts or ids), and write EN and ID independently.
- The four AI product case studies separate current capabilities from historical results: seven current code scanners versus earlier usage totals, synthetic offline shadow-isolation runs versus production traffic, and automated installation checks versus interactive validation or Marketplace approval. Source-main features that remain disabled are labelled as such. Later framework evaluations do not clear a different engine's release gate.
- The landing hero's three proof numbers are `profile.heroProof` (exactly three stat ids, never a scale stat); each needs a `short` label of at most 28 characters.
- Every key project (hero with screenshots) needs all 8 chapters: a story with a lesson, an architecture and 1 to 4 engineering topics; the build fails naming what is missing.

## Impact and scale results

Owner decision 2026-11-13: show the improvement, not the volume.

- Mark each result `kind: "scale"` when it counts output or speed of building (PRs, commits, share of commits, tests, specs, files, repos, "N weeks to production"); leave the kind off for impact (a before and after, quality, latency, cost, accuracy, reliability, a placing, adoption by others, a sourced capability).
- A before and after gets `delta: { before, after }`, and `value` must read the before then the after ("~2 s to ~0.2 s" or "11.7 MB → 156 KB").
- Flag the strongest impact results `headline` (at most 3; never scale). Every pod needs one impact result.
- New numbers come from the project's own sources (PR descriptions, eval reports, CI and perf artifacts, telemetry, git history). Only the number, its unit and a public-safe measurement boundary go into the dataset; the private pointer stays in the owner's notes. With no traceable number, use a sourced qualitative outcome ("Resumable"), never an estimate.
- Put the essential boundary (offline, n, window, who wrote it) in the label: strips and share cards drop the context.
- After a results change, run `bun scripts/ask-embed.ts --cli` and keep the Ask knowledge pack under its cap (`tests/ask/hybrid.test.ts`).

## Skills

- `skills[]` holds the skill groups (`id`, `label` as `{ en, id }`, `items`). The seven CV groups follow the CV's taxonomy and order (`tests/content/cv-facts.test.ts`); the site-only Data science and ML group (`ds`, owner decision 2026-10-17) comes right after AI and LLM.
- Every group shows everywhere: the L1 skills wall (4 across by 2 down in `SKILLS_WALL_ORDER`; a new group is appended), its drawer, the Page View skills sections (home, About, Quick view), Cmd-K and Ask (dataset order). A group that grows the wall past `LOBBY.skillsWall.h` fails `tests/unit/lobby-layout.test.ts`.
- Each item gets a logo through `src/content/tech.ts` (`public/tech/`) or is listed in `TEXT_ONLY_TECH` (`tests/unit/tech.test.ts`); never add a logo file without a source in `public/tech/README.md`. Search for a real logo before listing a name as text-only. Text chips render after every logo chip.
- The 3D walls read their logos from a prebuilt atlas: after adding, removing or replacing a skill or issuer logo, run `bun run logo:atlas` and commit `public/atlas/`, `src/experience/logo-atlas.ts` and `scripts/logo-atlas.lock.json` (`bun run build` and `tests/unit/logo-atlas.test.ts` fail until then).

## Certifications

- Certifications live in `certifications[]`: `status` is `earned`, `in-progress` or `expired`; optional `credentialUrl`, `credentialId`, `expires` (YYYY-MM) and `featured` (pin to the 3 featured cards).
- They sort themselves (earned newest first) and any number fits:
  - Page View shows featured cards plus a dense list (issuer chips, status filter and search from 10 certifications on).
  - The 3D Lobby shows a curved wall with issuer tabs and paging.
- Clicking one opens an in-site preview card with an "Open credential" link (new tab); credential sites are never framed. A certification with a study guide (`certId` in `content/study-guides.json`) also gets "Read study guide", which opens the in-site reader ([Study guides](#study-guides)).
- New issuers get a logo through `src/content/tech.ts` (`public/tech/`), then `bun run logo:atlas` (the wall logo atlas, see [Skills](#skills)).
- A certification without an exam code (Google's Generative AI Leader) leaves `code` out and may set `shortLabel` (at most 16 characters, for example "Gen AI Leader"), which fills the featured card's big title slot on the Classic site and is never shown as a code; featured cards prefer certifications with a code, so pin a new code-less one with `featured: true`.
- An exam not passed yet may be listed as `in-progress` (owner approval): `issued` holds the planned month (shown as "Planned", and Ask says "in progress, planned YYYY-MM"), with no `credentialUrl`, `credentialId`, `expires` or `featured`. It never counts as earned: it stays out of the `microsoft-certifications` fact and the `certification-desk-2026` entry. When it is earned, set `status: "earned"`, the real `issued` month and the credential, then update those as below.
- When a certification is added, also update the `microsoft-certifications` fact (count and codes), the `certification-desk-2026` journey entry and the Ask golden set (`tests/ask/golden.json`). The weekly live-facts job checks every `credentialUrl` (Microsoft Learn, Credly) for reachability.

## CV

- The CV is the owner's own PDF, committed as-is at `public/cv/kurniadi-ahmad-wijaya-cv.pdf` and served for both languages.
- CV buttons open the CV in the shared PDF reader (the study guide reader: pdf.js, loaded on the click), with page 1's image as the loading cover. `/{locale}/cv` shows page 1 with View CV and Download PDF.
- The page images (`public/cv/pages/`) ship as near-lossless WebP at 800, 1200 and 1600 px (visually identical to lossless, about 25% smaller). Only page 1 shows (the `/cv` cover, its LCP; the RF kiosk; the reader's loading cover); the rest stay rendered with the manifest.
- To update the CV, replace that file (same name) and run `bun run cv:pages` (needs `pdftoppm` and `cwebp`: `brew install poppler webp`). A unit test fails until the images match the PDF.

## Research papers

- Research papers open a preview modal with the abstract (English), copyable APA, IEEE and BibTeX citations, and DOI and Google Scholar links in a new tab.
- Third-party pages are never framed.

## Paper PDFs

A paper or thesis with `document` in `site-content.json` gets "Read the paper" (Page View research list, the paper modal, the L4 Research drawer), which opens the PDF in the paper modal's shared PDF reader (the study guide reader) with Back to the abstract, Download PDF, and the version line and publisher notice under the pages; page 1 of `bun run paper:pages` is its loading cover and the page count comes from the page images. To add one:

1. **Check the publisher's posting rule.** IEEE allows the authors' accepted manuscript with IEEE's notice, never the publisher's final PDF, so IEEE papers must use `version: "manuscript"` and `notice: "ieee"` (the schema enforces both; the notice and the DOI link render next to the reader). Today the ICAIBDA 2021 e-wallet paper is the authors' manuscript; the ICICyTA 2021 COVID-19 paper has no hosted PDF because only the IEEE final version exists. Its accepted manuscript can be added later the same way.
2. **Redact personal data first**: student or staff IDs, home addresses, phone numbers, signatures and QR codes that link to them. Rasterize the affected pages with the regions blacked out (so no text is left to extract) and keep the other pages as they are; never commit the unredacted original. Use `version: "redacted"`. The thesis PDF (`sentiboard-bsc-thesis`) was redacted this way on pages 1 to 4.
3. **Render the pages.** Save it as `public/papers/{file}.pdf` (`file` = the publication id), add `"document": { "file", "version", "notice"? }` and run `bun run paper:pages` (needs `pdftoppm`, `pdftotext` and `cwebp`). It refuses a PDF whose text still holds personal data patterns (NIM, NIP, NIK/NPWP, RT/RW address, phone), then writes `public/papers/{file}/` (1400 px webp per page) and `content/generated/paper-pages.json`; `tests/content/papers.test.ts` fails until the images match the PDF.

## Study guides

The owner's certification study guides (today GH-600, GH-300, Google Generative AI Leader, AB-100, AI-103 and AI-901; at most 10) are read in the site's own pdf.js reader: from the Study guides shelf on the Writing page (`/library#guides`), from "Read study guide" in a certification's preview card and from the books of the L4 Study Vault in the 3D tower. Step by step: [`study-guides-runbook.md`](study-guides-runbook.md).

- **Dataset**: `content/study-guides.json`, a separate file (zod `StudyGuidesFileSchema`), one entry per guide in shelf order (also the Study Vault's book order).
  - Written by hand: `slug`, `certId` (a `certifications[].id`; it links the guide to its certification card), `code` (or `null`), `spine` (at most 14 characters, for the L4 Study Vault's book spines), `issuer`, `title` and `summary` (`{ en, id }`; titles in Title Case with no first person), `edition` (`YYYY-MM`), `file` (the download file name) and 1 to 8 exam `domains` (`weight` `[min, max]` percent and a `{ en, id }` label).
  - Written by the script: `pages`, `bytes`, `version` (12 hex characters of the prepared file's sha256) and `cover`.
- **Prepare and upload**: `bun scripts/study-guides.ts prepare <slug>=<file.pdf> ...` checks the text for phone numbers, rewrites the PDF metadata, packs it into object streams (range friendly for pdf.js), records the machine fields and renders the cover; `bun scripts/study-guides.ts upload [<slug> ...]` puts the prepared files into the private R2 bucket `hq-study-guides` as `<slug>/<version>.pdf`; `check [<slug> ...]` compares the prepared files with the JSON (both look only at the slugs given, or every guide with none). Needs `qpdf`, poppler and `cwebp` (`brew install qpdf poppler webp`) and `bunx wrangler login`.
- **Covers**: page 1 of each prepared PDF, 480 px wide webp in `public/study-guides/<slug>.webp`, committed.
- **Never commit a PDF.** The source and prepared PDFs stay out of the repository (prepared copies go to the gitignored `.study-guides/`); the site serves them only through `/api/guides/<slug>`.
- **Replacing a guide** gives it a new version and key; keep the old object in the bucket at least a day after the new deploy, then delete it (runbook).
- **Safety**: `prepare` refuses text with an Indonesian phone number; review the guide yourself for client names (C3) before preparing it.

## Public safety

- Private evidence never enters the repo.
- The content lint (`tests/content/safety.test.ts`, `bun run validate:content`) blocks the forbidden patterns (em dashes, money amounts, phone numbers, Azure resource hostnames and the Master's degree) in the dataset, the perspectives, the Ask site-build note, the post diagrams, the build story, the study guides and the messages; MDX posts are checked for em dashes. A pod's `liveUrl` on a public live host (`PUBLIC_LIVE_HOSTS`) is exempt from the hostname rule.
- 2026 hackathon entries stay out unless the owner approves one (today the made-to-measure sewing pattern generator, allowlisted by stable ID in `tests/content/dataset.test.ts`).
- PDFs: `paper:pages` refuses personal data patterns ([Paper PDFs](#paper-pdfs)) and the study guide `prepare` step refuses phone numbers ([Study guides](#study-guides)); the CV is exempt.
- Client company names (C3) and private repository or cloud resource names have no automated list (owner decision 2026-10-22): review keeps them out, and Ask prompt rule 6 names clients only by sector.
- Product names in `content/safety-allowlist.txt` feed the Ask entity allowlist; never add a client name there.
- `scripts/scan-export.ts` checks the built `out/` after the CI and production builds for the per-page script policy only (one `data-hq-csp` meta, a sha256 for every inline script, no `'unsafe-inline'`).

# Content guide

How the site's content is stored, checked and published. The authoritative rules (owner decisions, schema additions, style) are in [`agents/content.md`](agents/content.md) and [`agents/content-style-and-safety.md`](agents/content-style-and-safety.md) (indexed from [`AGENTS.md`](../AGENTS.md)); this page is the practical summary.

## Contents

- [Dataset and posts](#dataset-and-posts)
- [Build story](#build-story)
- [Perspectives](#perspectives)
- [Titles and ordering](#titles-and-ordering)
- [Project galleries and live sites](#project-galleries-and-live-sites)
- [Skills](#skills)
- [Certifications](#certifications)
- [CV](#cv)
- [Research papers](#research-papers)
- [Paper PDFs](#paper-pdfs)
- [Study guides](#study-guides)
- [Public safety](#public-safety)

## Dataset and posts

- `content/site-content.json` is the single public dataset. It is validated by the zod schemas in `src/content/schema.ts` at build time and by the tests. All text is `{ en, id }`.
- Blog posts are MDX files in `content/blog/<slug>.<locale>.mdx`. A missing translation falls back to the original with a note.
- Review EN and ID independently in context, including unchanged passages. Keep sample sizes, evaluation scope and unresolved results in compact excerpts too. The entire Sun/Moon essay family is protected, including frontmatter, registry text and essay-specific accessible copy; do not add an EN translation.
- Diagram node and optional edge labels accept either a shared string or strict `{ en, id }` text. Labels resolve once per locale before measurement, SVG drawing, accessible summaries and room DTOs. Keep product names shared where appropriate; node IDs, edge endpoints, group names and topology never change by locale.
- A technical post can show an architecture figure: `<Architecture pod="<pod-slug>" caption="..." />` reuses a case study's diagram, and `<Architecture diagram="<id>" caption="..." />` draws a post-local one from `content/blog/diagrams.json` (keyed by post slug, then diagram id; each value has the pod `architecture` shape: nodes with layer, row and kind, plus edges). Props are strings only, and the tag is self-closing with double-quoted props, so `tests/content/post-diagrams.test.ts` can read it. Follow each figure with a numbered walkthrough of the flow, put the same tags in both locales (only the caption is translated), and note that an unknown pod or diagram fails the build and that test (which also flags unused diagrams). Diagrams are drawn at build time as inline SVG (boxes and arrows; dashed for `async` edges): left to right from 1100 px when the drawing fits (a post figure may extend past the text column), top to bottom below that and on phones. An optional node `group` (for example "Cloudflare") draws a frame around its nodes; keep a group on neighbouring layers and rows so the frame holds only its members. The group name sits above the frame's top-left corner, or further along the top when an edge runs through that corner. `tests/unit/diagram-layout.test.ts` fails when a post diagram has crossing edges in any layout, or when any edge, node or edge label touches a group name.
- Check an edit quickly with `bun run validate:content`.

## Build story

The "How this site was built" page (`/{locale}/build`) renders `content/build-story.json`; its numbers come from a snapshot, never from the text.

- Edit `content/build-story.json` (title, lead, the five stations, the quality gates, the "coming soon" notes). Text is `{ en, id }`, neutral or third person, no client names (C3), no cloud resource ids or hostnames. `tests/content/build-story.test.ts` (schema) and `tests/content/safety.test.ts` (public-safety lint) check it.
- Build rounds: each round lists its merged pull request range (`prs.from` to `prs.to`, `to: null` while the round is open). Add a round with its range when a round ships; the page counts pull requests and dates per round from the snapshot.
- Never type a snapshot count in the text (commits, pull requests, tests, files, documents): put it in the snapshot or leave it out. Budgets may be written in a gate's copy (`budget`) because `tests/content/build-story.test.ts` pins each one to its source (`e2e/budgets.ts`, `lighthouserc.json`); change the number in both places.
- Pull requests whose diff exposes text the site hides (client names, C3) go into the timeline's `unlinkedPrs`: they are still counted and listed, as plain text without a link. Round summaries never mention what was hidden.
- `published` is the page's first public date (JSON-LD `datePublished`); the snapshot date is `dateModified`.
- The dashboard shows unit test files (a count of `tests/**/*.test.{ts,tsx}`), not unit tests: Vitest lists an `it.each` template once, so a test count would be wrong. The end-to-end count comes from `playwright test --list`. "Spec documents" counts the design spec files under `docs/superpowers/specs/` (appendices included).
- Refresh the snapshot with `bun scripts/build-facts.ts --write` (needs a full git history; CI and deploy builds do this themselves, and local builds use the committed `content/generated/build-facts.json`).
- Before and after captures live in `public/build-story/` (WebP, named `r<round>-before.webp` and `r<round>-after.webp`) and are referenced from the round's `shots` with alt text in both languages.
- Ask the HQ keeps its own short note about the site in `content/ask/site-build.json`; it points visitors to this page.
- Ask post chunks derive the latest-post discovery label from registry publication dates. Keep frontmatter and registry excerpts aligned, including sample limits that must survive the single-lead-paragraph knowledge window.

## Perspectives

- `content/perspectives.json` holds Kurniadi's own answers to common professional questions (EN and ID).
- They are Ask AI knowledge only: no page shows them (owner decision 2026-10-14).
- An entry enters the knowledge pack only after the owner approves it (`"approved": true` per entry, or `"status": "approved"`).
- How to edit and approve: [`ask-runbook.md`](ask-runbook.md) section 15.

## Titles and ordering

- Titles (projects, posts, publications, talks, side projects, awards, principles) are written in Title Case in both languages.
- `bun scripts/title-case.ts` lists any that are not and `--write` fixes them (rules: "Title Case" in [`agents/content-style-and-safety.md`](agents/content-style-and-safety.md)).
- A project whose title does not fit one line on its L3 directory board can set `shortTitle` (`{ en, id }`): at most 32 characters, shorter than the title in both languages, Title Case, no first person. Only the L3 boards use it; every other page, card and drawer keeps `title`.
- Projects with a gallery come first in every project list (Work, Home, Cmd-K and the L3 wing roads), then hero, featured and listed pods by `order` (`orderPods` in `src/content/selectors.ts`).
- The home page "Selected work" (and the L1 Highlights Hall projects) shows the pods with `selected: 1`, `2` and `3` in that order. Each needs a gallery and the ranks must be unique; the tier stays free, so a hero can remain a key project on `/labs` without a landing slot.

## Project galleries and live sites

- Project galleries are screenshots of the live apps (`public/media/<slug>/`; the vendor portal's come from a local demo instance with demo data).
- Private data is blurred: company and people names, contact details, amounts, tax and bank identifiers, document numbers and hostnames.
- Two client projects stay text only by the owner's choice: the coal mining chart-of-accounts assistant and the automotive fraud review dashboard.
- Projects with a public live site (`liveUrl`, allowlisted hosts in `src/content/live-links.ts`; today the MII Microsoft Solutions Website and the MII Microsoft AI Portfolio and Assistant) show a "Visit live site" button on their case study, in the project rows and in the Glass Drawer footer.
- It opens a new tab with `rel="noopener noreferrer"`; internal apps never get a link.

## Skills

- `skills[]` holds the skill groups (`id`, `label` as `{ en, id }`, `items`). The seven CV groups follow the CV's taxonomy and order (`tests/content/cv-facts.test.ts`); the site-only Data science and ML group (`ds`, owner decision 2026-10-17) comes right after AI and LLM.
- Every group shows everywhere: the L1 skills wall (4 across by 2 down in `SKILLS_WALL_ORDER`; a new group is appended), its drawer, the Page View skills sections (home, About, Quick view), Cmd-K and Ask (dataset order). A group that grows the wall past `LOBBY.skillsWall.h` fails `tests/unit/lobby-layout.test.ts`.
- Each item gets a logo through `src/content/tech.ts` (`public/tech/`) or is listed in `TEXT_ONLY_TECH` (`tests/unit/tech.test.ts`); never add a logo file without a source in `public/tech/README.md`.
- The 3D walls read their logos from a prebuilt atlas: after adding, removing or replacing a skill or issuer logo, run `bun run logo:atlas` and commit `public/atlas/`, `src/experience/logo-atlas.json` and `scripts/logo-atlas.lock.json` (`bun run build` and `tests/unit/logo-atlas.test.ts` fail until then).

## Certifications

- Certifications live in `certifications[]`: `status` is `earned`, `in-progress` or `expired`; optional `credentialUrl`, `credentialId`, `expires` (YYYY-MM) and `featured` (pin to the 3 featured cards).
- They sort themselves (earned newest first) and any number fits:
  - Page View shows featured cards plus a dense list (issuer chips, status filter and search from 10 certifications on).
  - The 3D Lobby shows a curved wall with issuer tabs and paging.
- Clicking one opens an in-site preview card with an "Open credential" link (new tab); credential sites are never framed. A certification with a study guide (`certId` in `content/study-guides.json`) also gets "Read study guide", which opens the in-site reader ([Study guides](#study-guides)).
- New issuers get a logo through `src/content/tech.ts` (`public/tech/`), then `bun run logo:atlas` (the wall logo atlas, see [Skills](#skills)).
- A certification without an exam code (Google's Generative AI Leader) leaves `code` out and may set `shortLabel` (at most 16 characters, for example "Gen AI Leader"), which fills the featured card's big title slot on the Classic site and is never shown as a code; featured cards prefer certifications with a code, so pin a new code-less one with `featured: true`.
- When a certification is added, also update the `microsoft-certifications` fact (count and codes), the `certification-desk-2026` journey entry and the Ask golden set (`tests/ask/golden.json`). The weekly live-facts job checks every `credentialUrl` (Microsoft Learn, Credly) for reachability.

## CV

- The CV is the owner's own PDF, committed as-is at `public/cv/kurniadi-ahmad-wijaya-cv.pdf` and served for both languages.
- CV buttons open an in-site viewer modal that shows pre-rendered page images (`public/cv/pages/`), so no PDF renderer ships to the browser.
- Each page ships as near-lossless WebP at 800, 1200 and 1600 px (visually identical to lossless, about 25% smaller). Page 1 loads eagerly (high priority on `/{locale}/cv`, where it is the LCP); later pages load lazily.
- To update the CV, replace that file (same name) and run `bun run cv:pages` (needs `pdftoppm` and `cwebp`: `brew install poppler webp`). A unit test fails until the images match the PDF.

## Research papers

- Research papers open a preview modal with the abstract (English), copyable APA, IEEE and BibTeX citations, and DOI and Google Scholar links in a new tab.
- Third-party pages are never framed.

## Paper PDFs

A paper or thesis with `document` in `site-content.json` gets "Read the paper" (Page View research list, the paper modal, the L4 Research drawer), which opens the paper reader in the paper modal: pre-rendered page images with zoom, the page count, "Download PDF" and "Open in new tab". To add one:

1. **Check the publisher's posting rule.** IEEE allows the authors' accepted manuscript with IEEE's notice, never the publisher's final PDF, so IEEE papers must use `version: "manuscript"` and `notice: "ieee"` (the schema enforces both; the notice and the DOI link render next to the reader). Today the ICAIBDA 2021 e-wallet paper is the authors' manuscript; the ICICyTA 2021 COVID-19 paper has no hosted PDF because only the IEEE final version exists. Its accepted manuscript can be added later the same way.
2. **Redact personal data first**: student or staff IDs, home addresses, phone numbers, signatures and QR codes that link to them. Rasterize the affected pages with the regions blacked out (so no text is left to extract) and keep the other pages as they are; never commit the unredacted original. Use `version: "redacted"`. The thesis PDF (`sentiboard-bsc-thesis`) was redacted this way on pages 1 to 4.
3. **Render the pages.** Save it as `public/papers/{file}.pdf` (`file` = the publication id), add `"document": { "file", "version", "notice"? }` and run `bun run paper:pages` (needs `pdftoppm`, `pdftotext` and `cwebp`). It refuses a PDF whose text still holds personal data patterns or blocklisted names, then writes `public/papers/{file}/` (1400 px webp per page) and `content/generated/paper-pages.json`; `tests/content/papers.test.ts` fails until the images match the PDF.

## Study guides

The owner's certification study guides (today AI-103, AI-901, GH-600 and Google Generative AI Leader) are read in the site's own pdf.js reader: from the Study guides shelf on the Writing page (`/library#guides`) and from "Read study guide" in a certification's preview card. Step by step: [`study-guides-runbook.md`](study-guides-runbook.md).

- **Dataset**: `content/study-guides.json`, a separate file (zod `StudyGuidesFileSchema`), one entry per guide in shelf order.
  - Written by hand: `slug`, `certId` (a `certifications[].id`; it links the guide to its certification card), `code` (or `null`), `spine` (at most 14 characters, for the L4 Study Vault's book spines), `issuer`, `title` and `summary` (`{ en, id }`; titles in Title Case with no first person), `edition` (`YYYY-MM`), `file` (the download file name) and 1 to 8 exam `domains` (`weight` `[min, max]` percent and a `{ en, id }` label).
  - Written by the script: `pages`, `bytes`, `version` (12 hex characters of the prepared file's sha256) and `cover`.
- **Prepare and upload**: `bun scripts/study-guides.ts prepare <slug>=<file.pdf> ...` scans the text, rewrites the PDF metadata, packs it into object streams (range friendly for pdf.js), records the machine fields and renders the cover; `bun scripts/study-guides.ts upload [<slug> ...]` puts the prepared files into the private R2 bucket `hq-study-guides` as `<slug>/<version>.pdf`; `check` compares the prepared files with the JSON. Needs `qpdf`, poppler and `cwebp` (`brew install qpdf poppler webp`) and `bunx wrangler login`.
- **Covers**: page 1 of each prepared PDF, 480 px wide webp in `public/study-guides/<slug>.webp`, committed.
- **Never commit a PDF.** The source and prepared PDFs stay out of the repository (prepared copies go to the gitignored `.study-guides/`); the site serves them only through `/api/guides/<slug>`.
- **Replacing a guide** gives it a new version and key; delete the old object only after the new deploy is live (runbook).
- **Safety**: `prepare` refuses text with a blocklisted term or a phone number; reviewed textbook phrases that trip the list sit in `BENIGN_PHRASES` in the script.

## Public safety

- Private evidence never enters the repo.
- The public-safety lint blocks client company names (committed in `content/safety-blocklist.default.txt`) and private repository names (`content/.safety-blocklist.local.txt`, gitignored, and the `SAFETY_BLOCKLIST` env var / CI secret).
- Product names in `content/safety-allowlist.txt` are never flagged.
- `scripts/scan-export.ts` scans every text file of the built `out/` (JS, CSS, SVG and MD included) after the CI and production builds, and fails `main` and deploys when the private list is missing; an e2e check repeats the scan.

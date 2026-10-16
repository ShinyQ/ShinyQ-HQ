# Content guide

How the site's content is stored, checked and published. The authoritative rules (owner decisions, schema additions, style) are in [`AGENTS.md`](../AGENTS.md) under "Content access", "Content style" and "Public-safety lint"; this page is the practical summary.

## Contents

- [Dataset and posts](#dataset-and-posts)
- [Perspectives](#perspectives)
- [Titles and ordering](#titles-and-ordering)
- [Project galleries and live sites](#project-galleries-and-live-sites)
- [Certifications](#certifications)
- [CV](#cv)
- [Research papers](#research-papers)
- [Paper PDFs](#paper-pdfs)
- [Public safety](#public-safety)

## Dataset and posts

- `content/site-content.json` is the single public dataset. It is validated by the zod schemas in `src/content/schema.ts` at build time and by the tests. All text is `{ en, id }`.
- Blog posts are MDX files in `content/blog/<slug>.<locale>.mdx`. A missing translation falls back to the original with a note.
- A technical post can show an architecture figure: `<Architecture pod="<pod-slug>" caption="..." />` reuses a case study's diagram, and `<Architecture diagram="<id>" caption="..." />` draws a post-local one from `content/blog/diagrams.json` (keyed by post slug, then diagram id; each value has the pod `architecture` shape: nodes with layer, row and kind, plus edges). Props are strings only, and the tag is self-closing with double-quoted props, so `tests/content/post-diagrams.test.ts` can read it. Follow each figure with a numbered walkthrough of the flow, put the same tags in both locales (only the caption is translated), and note that an unknown pod or diagram fails the build and that test (which also flags unused diagrams). Diagrams are drawn at build time as inline SVG (boxes and arrows; dashed for `async` edges): left to right from 1100 px when the drawing fits (a post figure may extend past the text column), top to bottom below that and on phones. An optional node `group` (for example "Cloudflare") draws a frame around its nodes; keep a group on neighbouring layers and rows so the frame holds only its members. `tests/unit/diagram-layout.test.ts` fails when a post diagram has crossing edges in any layout.
- Check an edit quickly with `bun run validate:content`.

## Perspectives

- `content/perspectives.json` holds Kurniadi's own answers to common professional questions (EN and ID).
- They are Ask AI knowledge only: no page shows them (owner decision 2026-10-14).
- An entry enters the knowledge pack only after the owner approves it (`"approved": true` per entry, or `"status": "approved"`).
- How to edit and approve: [`ask-runbook.md`](ask-runbook.md) section 15.

## Titles and ordering

- Titles (projects, posts, publications, talks, side projects, awards, principles) are written in Title Case in both languages.
- `bun scripts/title-case.ts` lists any that are not and `--write` fixes them (rules: "Content style" in `AGENTS.md`).
- A project whose title does not fit one line on its L3 directory board can set `shortTitle` (`{ en, id }`): at most 32 characters, shorter than the title in both languages, Title Case, no first person. Only the L3 boards use it; every other page, card and drawer keeps `title`.
- Projects with a gallery come first in every project list (Work, Home, Cmd-K and the L3 wing roads), then hero, featured and listed pods by `order` (`orderPods` in `src/content/selectors.ts`).
- The home page "Selected work" (and the L1 Highlights Hall projects) shows the pods with `selected: 1`, `2` and `3` in that order. Each needs a gallery and the ranks must be unique; the tier stays free, so a hero can remain a key project on `/labs` without a landing slot.

## Project galleries and live sites

- Project galleries are screenshots of the live apps (`public/media/<slug>/`; the vendor portal's come from a local demo instance with demo data).
- Private data is blurred: company and people names, contact details, amounts, tax and bank identifiers, document numbers and hostnames.
- Two client projects stay text only by the owner's choice: the coal mining chart-of-accounts assistant and the automotive fraud review dashboard.
- Projects with a public live site (`liveUrl`, allowlisted hosts in `src/content/live-links.ts`; today the MII Microsoft Solutions Website and the MII Microsoft AI Portfolio and Assistant) show a "Visit live site" button on their case study, in the project rows and in the Glass Drawer footer.
- It opens a new tab with `rel="noopener noreferrer"`; internal apps never get a link.

## Certifications

- Certifications live in `certifications[]`: `status` is `earned`, `in-progress` or `expired`; optional `credentialUrl`, `credentialId`, `expires` (YYYY-MM) and `featured` (pin to the 3 featured cards).
- They sort themselves (earned newest first) and any number fits:
  - Page View shows featured cards plus a dense list (issuer chips, status filter and search from 10 certifications on).
  - The 3D Lobby shows a curved wall with issuer tabs and paging.
- Clicking one opens an in-site preview card with an "Open credential" link (new tab); credential sites are never framed.
- New issuers get a logo through `src/content/tech.ts` (`public/tech/`).

## CV

- The CV is the owner's own PDF, committed as-is at `public/cv/kurniadi-ahmad-wijaya-cv.pdf` and served for both languages.
- CV buttons open an in-site viewer modal that shows pre-rendered page images (`public/cv/pages/`), so no PDF renderer ships to the browser.
- To update the CV, replace that file (same name) and run `bun run cv:pages` (needs `pdftoppm` and `cwebp`: `brew install poppler webp`). A unit test fails until the images match the PDF.

## Research papers

- Research papers open a preview modal with the abstract (English), copyable APA, IEEE and BibTeX citations, and DOI and Google Scholar links in a new tab.
- Third-party pages are never framed.

## Paper PDFs

A paper or thesis with `document` in `site-content.json` gets "Read the paper" (Page View research list, the paper modal, the L4 Research drawer), which opens the paper reader in the paper modal: pre-rendered page images with zoom, the page count, "Download PDF" and "Open in new tab". To add one:

1. **Check the publisher's posting rule.** IEEE allows the authors' accepted manuscript with IEEE's notice, never the publisher's final PDF, so IEEE papers must use `version: "manuscript"` and `notice: "ieee"` (the schema enforces both; the notice and the DOI link render next to the reader). Today the ICAIBDA 2021 e-wallet paper is the authors' manuscript; the ICICyTA 2021 COVID-19 paper has no hosted PDF because only the IEEE final version exists. Its accepted manuscript can be added later the same way.
2. **Redact personal data first**: student or staff IDs, home addresses, phone numbers, signatures and QR codes that link to them. Rasterize the affected pages with the regions blacked out (so no text is left to extract) and keep the other pages as they are; never commit the unredacted original. Use `version: "redacted"`. The thesis PDF (`sentiboard-bsc-thesis`) was redacted this way on pages 1 to 4.
3. **Render the pages.** Save it as `public/papers/{file}.pdf` (`file` = the publication id), add `"document": { "file", "version", "notice"? }` and run `bun run paper:pages` (needs `pdftoppm`, `pdftotext` and `cwebp`). It refuses a PDF whose text still holds personal data patterns or blocklisted names, then writes `public/papers/{file}/` (1400 px webp per page) and `content/generated/paper-pages.json`; `tests/content/papers.test.ts` fails until the images match the PDF.

## Public safety

- Private evidence never enters the repo.
- The public-safety lint blocks client company names (committed in `content/safety-blocklist.default.txt`) and private repository names (`content/.safety-blocklist.local.txt`, gitignored, and the `SAFETY_BLOCKLIST` env var / CI secret).
- Product names in `content/safety-allowlist.txt` are never flagged.
- `scripts/scan-export.ts` scans every text file of the built `out/` (JS, CSS, SVG and MD included) after the CI and production builds, and fails `main` and deploys when the private list is missing; an e2e check repeats the scan.

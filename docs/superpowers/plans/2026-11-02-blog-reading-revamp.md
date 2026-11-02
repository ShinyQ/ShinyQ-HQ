# Blog Reading Revamp Implementation Plan

Status: in review

Owner request: posts felt hard to read (text that felt wide, the phone navigation taking reading space). Owner
decision: [2026-11-02](../../decisions/2026-11-02-blog-reading-revamp.md), approved on a local preview; body text stays
16 px (owner correction). CSS room came first from CL-1 ([2026-11-02-classic-css-split.md](2026-11-02-classic-css-split.md)).

**Goal:** a post reads on one centred measure with brighter text, a lighter head, contents and progress; on phones and
tablets the header and the Ask pill step out of the way while reading, on every Classic page.

**Architecture:** server-rendered layout and CSS only, plus two tiny islands: `HeaderAutoHide` (one passive scroll
listener setting `html[data-scroll]`) and the existing `CaseToc` scroll-spy (now position based, with an `avoid`
observer for wide figures). Heading ids come from a remark plugin at build (`remarkPostHeadings`); the progress line is
a CSS scroll timeline.

## Tasks

- [x] **1. Headings and reading time** (`src/components/blog/headings.ts`, `compile.ts`): h2 slug ids, the heading
  list, `readingMinutes`; tests in `tests/content/blog-mdx.test.tsx`.
- [x] **2. Post layout** (`blog/[slug]/page.tsx`, `pageview.css`, `globals.css`): `.pv-read` measure, head meta line,
  body rhythm, display h2, framed code, figures at 45rem, contents from 1280 px, progress line, end block with Topics,
  the `row` share variant and Back to Writing; the grid stops at 520 px.
- [x] **3. Phone header** (`HeaderAutoHide`, `SiteHeader`, `AskDock`): hide on scroll down below 64rem, show on scroll
  up, at the top and on focus; the Ask pill compacts to its icon with no layout shift; reduced motion is instant.
- [x] **4. Tests and docs**: e2e "reading a post" in `e2e/pageview.spec.ts` (column, contents with and without JS,
  figure step-aside, phone header with zero layout shift, reduced motion); `page-view.md`, `ask.md`, `DESIGN.md`,
  `features.md`, the decision file.
- [x] **5. Gates**: `verify:quick`, `e2e:changed`, the strict visual gate, Lighthouse, the bytes gate; CI green.

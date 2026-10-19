# AGENTS.md: conventions for ShinyQ HQ

Read this before changing anything. It applies to humans and AI agents. This file is the index: the hard rules,
the workflow, the key commands and budgets live here; everything else lives in [`docs/agents/`](docs/agents/)
(one file per area, see the [index](#detail-docs)). A unit test keeps this file under 25 KB with no line over
400 characters (`tests/unit/agents-md.test.ts`).

## Purpose

ShinyQ HQ is Kurniadi's bilingual (EN/ID) portfolio: a static Next.js export whose pages are the "Classic site",
with an optional walkable 3D tower (five floors and a secret B1 Engine Room unlocked by visiting all five, a rover, an elevator) mounted client-side on top, plus Ask the HQ
(shown as Ask Rover Assistant; a grounded chat assistant on Cloudflare Pages Functions) and public visit stats (a
Cloudflare Cron Worker).

## Source of truth

- Design: `docs/superpowers/specs/2026-10-09-agent-hq-design.md` plus appendices
  `docs/superpowers/specs/agent-hq/01..08`. An appendix wins over the main spec for its topic.
- Owner content decisions C1 to C9 (appendix 07 section 7) override everything else about content.
- Current rules: this file plus [`docs/agents/`](docs/agents/). Dated owner decisions and their history:
  [`docs/decisions.md`](docs/decisions.md). Plans and specs (history, with status):
  [`docs/superpowers/README.md`](docs/superpowers/README.md). Write a plan in `docs/superpowers/plans/` before
  starting a large change.
- Keep docs current in the same PR: a changed rule updates its `docs/agents/<area>.md` (current state only, no
  history).
- Conflict-free history (parallel PRs never edit the same lines; `tests/unit/docs-index.test.ts`):
  - A new owner decision is a new file `docs/decisions/YYYY-MM-DD-slug.md` (format in `docs/decisions.md`);
    never add rows to `docs/decisions.md`.
  - A plan's state lives only in its own `Status:` line (`in review`, then `shipped in #N (sha), date`); there is
    no plans table or count to edit in `docs/superpowers/README.md`.
  - `bun scripts/docs-index.ts` prints both tables at read time; never commit its output.
- Documentation split (owner decision):
  - `README.md` is a short, scannable overview (centered header with badges, the hero GIF, highlights, the floor
    guide, architecture, stack, quick start, routes, structure, CI budgets, docs index). Keep it under about 300
    lines with no prose line over about 300 characters; put anything long in `<details>`.
  - Never document a feature or a phase in the README: feature detail goes into `docs/features.md` (by floor,
    headings and bullets, plus the status log) and content workflows into `docs/content.md` (dataset, galleries,
    certifications, CV, paper PDFs, safety).
  - A PR that changes a feature, a route, a budget or a content rule updates those files (and the README table
    or bullet only when the overview itself changes).
  - README media live in `docs/readme/` (`hero.gif` under 6 MB, `hero.jpg`, `floor-*.jpg`), captured by
    `bun scripts/readme-hero.ts`; re-run it after a large visual change to the Lobby, the elevator, L3 or the HUD.

## Hard rules

Full text and the tests that enforce them: [content-style-and-safety.md](docs/agents/content-style-and-safety.md).

- **No em dashes** (U+2014) anywhere: code, comments, copy, docs, commits, PR text. A unit test scans the repo.
  Use commas, colons, parentheses or "to".
- **No first person in mottos, taglines or titles** (owner rule). No "I", "my", "me" (EN) or "saya", "aku" (ID)
  in `profile.headline`, `profile.subheadline` (the motto), pod titles and taglines, post titles, page titles or
  OG card text. Body text and stories keep the first person. Enforced by `hasFirstPerson`
  (`src/lib/first-person.ts`) and the content, SEO, OG and tagline tests.
- **Public repo.** Never commit private evidence, private repository names, cloud resource names, phone numbers,
  addresses, ID numbers, money amounts, salary or review text, the Master's degree, or any photo.
  - 2026 hackathon entries are excluded by default. An entry the owner approves explicitly may appear and is
    named openly as a hackathon entry: Sewise Fashion Labs (approved), allowlisted in `tests/content/dataset.test.ts`.
  - Photo exception: the owner's own portrait (`public/og-assets/kurniadi-photo.png` for share cards and JSON-LD,
    and the web sizes under `public/brand/`).
- **No client company names** (C3). Clients of the owner's employers (the bank, automotive, bakery, mining,
  lender and insurer clients, for example) never appear: not in text, alt text, slugs, metadata, OG cards,
  JSON-LD, search, room views or 3D labels. Use a sector label (`Pod.client` as `{ en, id }`, e.g.
  "National digital bank" / "Bank digital nasional").
  - Employers stay named (Metrodata / PT Mitra Integrasi Informatika, Jenius (SMBC Indonesia) for the 2024 to
    2025 job only, Jatis, MNC, internships), and so do the freelance clients in C8.
  - Product names are allowed, including MII / Metrodata products (ARIA, Pris.AI, MII Fraud Detection,
    MII E-Recruitment, eVendor, MII Deck, MII AI Ticketing). ATLAS and FREDDY are client work: sector label.
  - Never claim a product the owner did not build (Deck Studio inside MII Cowork, not all of Cowork).
  - Sole exception: the owner's CV PDF in `public/cv/`, committed byte for byte (never edit or regenerate it),
    and its page images in `public/cv/pages/` (`bun run cv:pages`). Never OCR them into site text or alt text
    (alt text is "CV page N of M").
- **Content is data.** Pages, rooms, pods and missions are generated from `content/site-content.json`. Never
  hardcode career facts in components.
- **Bilingual.** Every user-facing content string is `{ en, id }`. Indonesian is natural and professional
  ("saya"); technical terms stay in English. UI strings live in `messages/en.json` and `messages/id.json` with
  identical keys.
- **Static export.** `output: "export"`: no server runtime, no middleware/proxy, no API routes, no `next/image`
  optimization. Every route pre-renders through `generateStaticParams` and sets `dynamicParams = false` on
  dynamic segments.
- **Every route works without WebGL.** 3D mounts client-side on top of the HTML pages and never replaces their
  content.

## Rules that bite most often

| Area | Rule | Detail |
|---|---|---|
| Client bundles | Client code imports locale values from `@/content/locales`, never values from `@/content/schema` or `@/content/load`; `bun run build` fails otherwise | [content.md](docs/agents/content.md) |
| Stats | Read stats through `getStats()`, never `getContent().stats` | [ask.md](docs/agents/ask.md) |
| Projects | One project order everywhere: `orderPods` / `comparePods`; never hard-code slugs | [content-style-and-safety.md](docs/agents/content-style-and-safety.md) |
| Titles | Title Case in content (`titleCase`), never CSS `text-transform` | [content-style-and-safety.md](docs/agents/content-style-and-safety.md) |
| Styling | No colored edge stripes; use `AccentDot` and `hq-glow` | [styling-and-i18n.md](docs/agents/styling-and-i18n.md) |
| Motion | Write reduce rules as `@variant motion-reduce`, never a bare `prefers-reduced-motion` query | [hud-and-drawer.md](docs/agents/hud-and-drawer.md) |
| 3D memory | `useDispose(value)` after every memoized geometry, texture or material | [3d-experience.md](docs/agents/3d-experience.md) |
| 3D loop | Animate with `useFrame` deltas; never start another rAF loop | [3d-experience.md](docs/agents/3d-experience.md) |
| Floor chunks | Never import `Labs`, `Library`, `Roof`, `EngineRoom` or their HUD pieces statically from the `Experience.tsx` closure | [floors.md](docs/agents/floors.md) |
| Floor text | No words painted on a floor: use `FloatingSigns` | [floors.md](docs/agents/floors.md) |
| Interaction | In-world targets go through the point-and-go registry; no navigation `onClick` on scene objects | [floors.md](docs/agents/floors.md) |
| Audio | Use `audio` / `useAudio` from `@/lib/audio`; never create another `AudioContext` | [ci-and-deploy.md](docs/agents/ci-and-deploy.md) |
| 3D-only strings | B1 Engine Room strings live in the `engine` namespace (in `CLIENT_NAMESPACES`, never `LAYOUT_NAMESPACES`): `/en/quick` is at its HTML budget | [styling-and-i18n.md](docs/agents/styling-and-i18n.md#client-messages) |
| Metadata | Every `generateMetadata` returns `seoMetadata(locale, path)`; new routes go into `src/lib/routes.ts` | [styling-and-i18n.md](docs/agents/styling-and-i18n.md) |
| CSP | No inline event handlers, `javascript:` URLs or runtime inline scripts | [ask.md](docs/agents/ask.md) |
| Ask | Bump `PROMPT_VERSION` with any prompt change; update `tests/ask/golden.json` with content changes | [ask.md](docs/agents/ask.md) |
| Secrets | Cloudflare secrets only in the `production` environment, passed in step-level `env` | [ask.md](docs/agents/ask.md) |
| E2E | Wait on state, never on time; use the `e2e/hq.ts` helpers | [performance.md](docs/agents/performance.md) |

## Workflow

- Package manager: Bun. Commits: conventional messages (`feat:`, `fix:`, `test:`, `docs:`, `ci:`, `chore:`),
  in logical steps. Prefer the `rtk` git wrapper.
- One PR per change. Do not merge without the owner; PRs land as squash merges.
- At most 2 CI runs in flight, both pull request runs and at most one of them a full run; a `main` run stays alone
  (Free plan cap 20 jobs: full PR 12, selective PR 5 to 7, `main` 14 plus Deploy). Before pushing, check
  `gh run list -R ShinyQ/ShinyQ-HQ -s in_progress` and `-s queued` ([ci-and-deploy.md](docs/agents/ci-and-deploy.md#before-pushing-and-committing)).
- `main` is protected by a ruleset: changes land only through a PR whose head has the required checks
  (`Typecheck, lint, unit tests`, `Build, CV and e2e`, `Lighthouse CI`, `3D perf gates 1/2` and `2/2`). Force
  pushes, deletion and direct pushes are rejected. In-progress runs on `main` are never cancelled; check main's CI after a merge.
- Production deploys only through `.github/workflows/deploy.yml`: on a merge to `main` (fast path when the merged PR
  was green on the same tree, else after the complete `main` CI), by hand, or from the weekly live-facts PR. A red
  `main` CI auto-rolls production back (`rollback.yml`) and blocks the fast path until `main` is green again.
- Smart CI: every PR runs typecheck, lint, unit tests, the secret scan and the build, then only the e2e specs, perf
  tests and Lighthouse URLs its changed paths affect, plus a smoke set (`scripts/ci-plan.ts`; label `full-ci` for
  everything). A push to `main` runs only what its merged PR's green same-tree run did not (else everything);
  dispatches and the nightly run everything on 8 e2e and 4 perf shards. Tests titled `@nightly` run only in the
  nightly (PRs and `main` pass `--grep-invert @nightly`). Detail:
  [ci-and-deploy.md](docs/agents/ci-and-deploy.md#ci).
- Before pushing: `bun run verify:quick`, then `bun run e2e:changed`. Add the perf lane when you touch the
  render path, materials, floor mounting, the elevator or what the 3D chunk imports.
- Details: [ci-and-deploy.md](docs/agents/ci-and-deploy.md), [performance.md](docs/agents/performance.md),
  `docs/deploy.md`.

## Key commands

| Command | What it does |
|---|---|
| `bun run dev` | Dev server (dev-only routes such as `/{locale}/dev/floors` exist only here) |
| `bun run verify:quick` | Typecheck, lint, unit tests, `next build`, `og:check` (about 1 to 2 minutes) |
| `bun run e2e:changed` | Only the e2e specs that cover your changed paths (`--dry` prints the plan) |
| `bun run e2e:smoke` / `e2e:full` | Smoke specs / the whole suite |
| `E2E_PORT=<port> bun run e2e:perf` | Perf lane: 3D bytes, floors, peaks, full-tier memory gate (about 10 to 12 minutes) |
| `bun run e2e:look` | Local look check of the canvas against a main build |
| `bun scripts/visual-gate.ts --base HEAD --profile strict` | Look-preserving gate across 3 devices x 8 poses |
| `bun run validate:content` | Schema, safety and Title Case check of the dataset |
| `bun scripts/docs-index.ts` | Print the owner decisions log and the plans table (status, PRs, counts) from the files |
| `bun run og:stills` | Regenerate the share card floor stills after a large floor change |
| `bun run floor:thumbs` | Regenerate the elevator picker thumbnails (after `bun run build`; needs `cwebp`) |
| `bun scripts/readme-hero.ts` | Regenerate the README hero GIF and stills |
| `bun run e2e:durations` | Refresh `e2e/durations.json` for the CI shard split (needs `gh`) |
| `bun run cv:pages` / `paper:pages` | Render CV / paper PDF page images (needs poppler and webp) |
| `bunx wrangler ...` | Cloudflare CLI from the lockfile (Pages deploy, the `workers/stats` Worker); never `bunx wrangler@<range>` |

## Budgets

Authoritative budgets: appendix 08 section 2 (CI numbers win; change one only with an owner note in the PR).
Numbers live in `e2e/budgets.ts` (3D) and `lighthouserc.json` (Classic site). Detail: [performance.md](docs/agents/performance.md).

| Budget | Limit |
|---|---|
| 3D JS on the first-frame path (`?prefetch=off`, per tier) | under 450 KB gzip |
| 3D session total (main path plus the public floor chunks) | full 471 KB, lite 447.3 KB gzip |
| Floor chunks (incremental) | L3 20 KB, L4 16 KB, RF 8 KB, B1 16 KB gzip |
| Scene draw calls per frame, any floor | under 150 (L1 125, RF 79, B1 100); at most 20 post passes |
| Triangles per frame | under 30k |
| Shader programs per floor | `e2e/perf/baseline.json` plus 2 |
| Memory gates | zero growth in geometries, textures and programs; under 2 MB JS heap growth |
| Classic site (Lighthouse CI) | LCP 2 s, CLS 0.01, TBT 200 ms; JS 240 KB, CSS 20,480 B, fonts 60 KB, HTML 82 KB |
| Study guide reader (on the Read click) | chunk 160 KB, worker 400 KB gzip |
| Ask knowledge pack | `PACK_MAX_BYTES` 256 KiB |
| README hero GIF | under 6 MB |

## Folder map

Path by path: [folder-layout.md](docs/agents/folder-layout.md).

| Folder | Contents |
|---|---|
| `content/` | Public dataset `site-content.json`, blog MDX, Ask knowledge files, safety lists, generated facts |
| `docs/` | Feature and content guides, deploy and Ask runbooks, `agents/` rules, `decisions/` (one file per owner decision), `superpowers/` plans and specs, design mockups, README media |
| `e2e/` | Playwright specs, helpers (`hq.ts`), budgets, the perf lane (`e2e/perf/`) |
| `functions/` | Cloudflare Pages Functions: `/api/ask`, `/api/rum`, `/api/visit`, `/api/stats`, `/api/guides` |
| `messages/` | UI strings, `en.json` and `id.json` |
| `public/` | Static assets: brand, fonts, tech and company logos, media, CV, papers, floor thumbnails, OG inputs, `_headers`, `_redirects` |
| `scripts/` | Build steps, content and media tools, e2e planning, CI and deploy helpers |
| `tools/` | `tools/office-relay`: the local Agent Office relay and hook installer (runs on the owner's Mac) |
| `src/` | Next.js app (`app/`), components, content loaders, i18n, lib, the 3D experience (`experience/`), HUD (`hud/`), store |
| `tests/` | Vitest: unit, HUD, content, Ask, stats, benches, helpers |
| `workers/` | `workers/stats`: the `hq-stats` Cron Worker; `workers/office`: the `hq-office` Agent Office Worker |

Root config: `next.config.ts`, `wrangler.toml` (Pages bindings), `lighthouserc.json`, `playwright.config.ts`,
`vitest.config.mts`, `eslint.config.mjs`, `tsconfig.json`.

## Detail docs

| File | Covers |
|---|---|
| [content.md](docs/agents/content.md) | Content access, loaders, CV, papers, galleries, certifications, perspectives, indexes, schema additions |
| [content-style-and-safety.md](docs/agents/content-style-and-safety.md) | Hard rules in full, editorial voice, glossary, Title Case, public-safety lint |
| [styling-and-i18n.md](docs/agents/styling-and-i18n.md) | Tokens, classes, edge-stripe rule, fonts, HUD layout, i18n, metadata and SEO |
| [page-view.md](docs/agents/page-view.md) | The Classic site: layout, filters, landing |
| [hud-and-drawer.md](docs/agents/hud-and-drawer.md) | Missions, HUD index, overlays, storage keys, Motion setting, Rover dialog, onboarding, hints, Glass Drawer |
| [3d-experience.md](docs/agents/3d-experience.md) | Gate, boot and intro, boost, data flow, elevator, camera, frame loop, render budget, recovery, quality, precompile, ride cull, store, `window.__hq` |
| [floors.md](docs/agents/floors.md) | Shared floor systems: layouts, doors, pads, floor chunks, fast return, road kit, floating signs, point-and-go |
| [floor-l1-lobby.md](docs/agents/floor-l1-lobby.md) | L1 Lobby: certification wall, Highlights Hall, kiosk, views |
| [floor-l2-career.md](docs/agents/floor-l2-career.md) | L2 Career Road, Workshop, rail floors |
| [floor-l3-labs.md](docs/agents/floor-l3-labs.md) | L3 Project Roads, Data and ML spine, Ops Control Room, Tech Reactor |
| [floor-l4-library.md](docs/agents/floor-l4-library.md) | L4 Writing: newsroom, timeline, end plaza, Topic Constellation, Study Vault |
| [floor-rf-roof.md](docs/agents/floor-rf-roof.md) | RF roof deck |
| [floor-b1-engine-room.md](docs/agents/floor-b1-engine-room.md) | B1 Engine Room: layout, scenery, station drawers, access, budget |
| [ask.md](docs/agents/ask.md) | Ask the HQ: pipeline, scope routing, UI, pack, CSP, credentials, CI around it |
| [stats.md](docs/agents/stats.md) | Public visit stats: pipeline, beacon, opt-out, display |
| [office.md](docs/agents/office.md) | Agent Office: contract, privacy, hq-office Worker and Durable Object, relay, 3D office, Classic card |
| [performance.md](docs/agents/performance.md) | Perf gates, measurement, RUM, fast verification, writing 3D tests |
| [ci-and-deploy.md](docs/agents/ci-and-deploy.md) | Scripts, dependencies, CI, deploy, build env, audio, Next.js notes |
| [folder-layout.md](docs/agents/folder-layout.md) | Annotated folder layout |
| [decisions.md](docs/decisions.md) | Dated owner decisions log: one file per decision in `docs/decisions/` |

Other docs: [`docs/features.md`](docs/features.md), [`docs/content.md`](docs/content.md),
[`docs/deploy.md`](docs/deploy.md), [`docs/ask-runbook.md`](docs/ask-runbook.md), [`docs/study-guides-runbook.md`](docs/study-guides-runbook.md).

## Next.js version notes

This repo uses Next.js 16, which differs from older training data (async `params`, global `PageProps` /
`LayoutProps` types from `next typegen`, `proxy` instead of `middleware`, `global-not-found`). Read the bundled
docs in `node_modules/next/dist/docs/` before using an unfamiliar API. `agentRules: false` in `next.config.ts`
stops `next dev` from injecting its own block into this file.

# ShinyQ HQ

The portfolio of **Kurniadi Ahmad Wijaya**, Software Engineer and AI Engineer.

ShinyQ HQ is an explorable 3D neon tower ("Agent HQ"): pilot a small Screen Rover through five floors, ride the elevator, drive the 2019 to 2026 Career Road (or take the guided "Walk my journey") and open case-study pods in the Product Engineering and AI Engineering wings. Every piece of content is also a normal, accessible, bilingual (EN / ID) HTML page, and those pages are the permanent no-WebGL fallback.

Live: https://kurniadi.pages.dev

| Doc | What it covers |
|---|---|
| [`AGENTS.md`](AGENTS.md) | Repo conventions for contributors and agents (hard rules, folder layout, content style, Fast verification) |
| [`docs/superpowers/specs/2026-10-09-agent-hq-design.md`](docs/superpowers/specs/2026-10-09-agent-hq-design.md) | Design spec and appendices |
| [`docs/superpowers/specs/2026-10-11-ask-hq-design.md`](docs/superpowers/specs/2026-10-11-ask-hq-design.md) | Ask the HQ design (models, security threat model, data freshness) |
| [`docs/superpowers/plans/`](docs/superpowers/plans/) | Implementation plans, one per feature PR |
| [`docs/deploy.md`](docs/deploy.md) | Deploys, secrets and variables, analytics, Cloudflare resources, Lighthouse budgets, headers |
| [`docs/ask-runbook.md`](docs/ask-runbook.md) | Ask the HQ operations: provisioning, kill switch, cache purge, secret rotation, evals |

## Status

| Phase | Scope | State |
|---|---|---|
| 0 | Scaffold, content schema, public-safe dataset, static pages, CV PDF, CI | Done |
| 1 | Tower shell: five floors, glass elevator, camera rigs, input intents, store, GPU tiers | Done |
| 2 | Screen Rover (keyboard, click/tap-to-move, joystick) and the L1 Lobby | Done |
| 3 to 5 | Career Archive, Labs and the Glass Drawer, Library and Roof, missions | Done |
| 6 | Launch on Cloudflare Pages (`kurniadi.pages.dev`), SEO, Lighthouse CI | Done |
| Ask | Ask the HQ: grounded AI Q&A (Gemma 4 with Mistral fallback), chat dock, weekly live facts | Done |
| Walkable floors | Road kit, guided walks, L2 Career Road, L3 Project Roads, Neon line type icons | Done |
| Content and UI | Galleries from the live apps, certifications at scale, CV viewer and paper previews, roomier drawer, named elevator, Title Case titles, gallery-first ordering, cinematic Page View landing, elevator call pads and L2 teleporters | Done |
| Walkable floors 2 | L4 Writing as the walkable Newsroom with the "Read my writing" walk | Done |
| In progress | HUD polish (Shift boost, Ask Rover, unskippable intro, top bar, drawer footer, centered Lobby), RF Signal Garden | Open PRs |

Try it: open `/en`, press **Boot rover**, drive with WASD or the arrow keys (or click the floor), and change floors with the elevator panel (every button is named after its page: L1 Home, L2 Journey, L3 Work, L4 Writing, RF About), the mouse wheel or PageUp/PageDown. Every floor also has a glowing call pad in front of the elevator door: stop on it (or click it) and pick a floor from a list with previews. Add `?tier=lite` or `?tier=static` to force a tier, and use **Page view** to read the page without 3D.

The Page View home opens on a cinematic first screen: the name over an animated Neon Grid (CSS only, still under reduced motion, with a Pause motion switch), **Enter the 3D HQ** (shown wherever WebGL2 is available), the **Ask AI** bar and a live stats ticker, followed by three featured projects with their screenshots. The Rover Terminal never opens on its own over the Page View; it greets first-time visitors in the 3D Lobby after the intro, and the **Missions** button opens it anywhere.

Driving into a room door (or picking it from Cmd-K) opens the Glass Drawer: a side panel on desktop (480 to 600 px wide, growing with the screen) or a bottom sheet on phones and portrait tablets. Its bar keeps the room code, prev/next, the "..." menu (README view, also on `t`) and close; the title and tabs scroll with the content, and the tabs stick under the bar, so the room body gets most of the height.

On L2 (`/en/journey`) one road runs forward in time: a plaza per year, rooms docked on both edges of each plaza with a road branch to every door, and the Workshop annex at the end. Every year plaza has a teleporter pad beside the road: stop on it (or click it) and pick a year to beam straight to that plaza. The first visit offers **Walk my journey**, a guided drive through every room oldest first (Prev / Open / Next, `[` and `]`, a type filter); skip it to roam freely, or start it later from the launcher or the "Follow my career" mission. Career types use one Neon line icon and hue each (employment, freelance, education, award, milestone) in 3D and on the HTML pages. Add `?walk=on` or `?walk=off` to force guided walks on or off.

On L1 (Lobby) the stats ring, the skills wall and the certifications wall (a curved holo-wall with issuer tabs and paging) surround the plaza in front of the elevator. RF (Roof) holds the contact channels, the CV kiosk and the availability beacon; it is being redesigned (see Status).

On L3 (Labs) the floor is **Project Roads**: a hub plaza in front of the elevator with both wing directory boards, and two wing roads that run east and meet in a loop, with every key and featured project docked along them. The first visit offers **Tour my projects**, a guided drive pod by pod (Prev / Open / Next, `[` and `]`, a wing filter, swipe on phones); skip it to roam, start it later from the launcher or the "Tour my projects" mission; the boards list each wing's top projects and open the full list on click.

On L4 (Writing) the floor is the **Newsroom**: a press plaza with a headline wall (the newest title in large type over a ticker of every title) and the featured post on a lit stage under a turning open book, then one timeline lane east with the other posts newest first, year marks on the road, and the Research (its paper plates open the paper preview), Models and datasets and Talks and workshops desks. The first visit offers **Read my writing**, a guided drive station by station (posts newest first, then Research, Models and datasets, Talks and workshops; a zone filter); skip it to roam freely, or start it later from the launcher or the "Read my writing" mission. Posts beyond the first 12 wait on the archive board, which opens the posts palette.

## Ask the HQ (AI Q&A)

Visitors can ask questions about Kurniadi's work, projects, career and contact details and get short answers grounded only in this site's content (EN and ID).

- Where: the floating **Ask AI** button on every page and in 3D (side panel on desktop, bottom sheet on phones), the Ask bar in the Page View hero, the Rover Terminal (`a`) and the Cmd-K "Ask AI" row. Topic pills (Work, AI, Career, Contact) expand into curated questions (`content/ask/suggestions.json`), and each answer suggests related follow-ups with no extra AI call. The thread is kept in `sessionStorage` only.
- How: a Cloudflare Pages Function (`functions/api/ask.ts`, pipeline in `functions/_lib/`) retrieves from a knowledge pack built at build time from the public content (`src/ask/pack.ts`), then calls Workers AI through AI Gateway `shinyq-hq`: **Gemma 4 26B** (`@cf/google/gemma-4-26b-a4b-it`, thinking off), falling back once to **Mistral Small 3.1** on error, timeout or an empty answer. Answers stream over SSE, are cached in KV for 7 days and are rendered as plain text.
- Safety: invisible Turnstile, Origin checks, per-visitor and global rate limits, PII scrubbing, prompt-injection handling, output checks (client-name blocklist, numeric grounding, entity and prompt-leak checks), a circuit breaker and an `ASK_ENABLED` kill switch. Full threat model: the Ask design spec section 7.
- Freshness: `refresh-facts.yml` refreshes live numbers weekly (`content/generated/dynamic-facts.json`), merges after CI and deploys. `ask-eval.yml` runs the golden set (30 questions) and the red-team set (40 attacks) against the real models nightly; `content-gap.yml` reports unanswered questions weekly.
- Operations (provisioning, kill switch, cache purge, secret rotation, token expiry): [`docs/ask-runbook.md`](docs/ask-runbook.md).

## Stack

Next.js 16 (App Router, static export) · React 19 · TypeScript strict · three.js with React Three Fiber, drei and postprocessing · zustand · Tailwind CSS 4 · next-intl · zod · MDX (next-mdx-remote) · Vitest · Playwright · Bun · Cloudflare Pages.

## Getting started

```bash
bun install
bunx playwright install chromium   # needed for the e2e tests
bun run dev                        # http://localhost:3000/en
```

## Scripts

| Script | What it does |
|---|---|
| `bun run dev` | Next.js dev server |
| `bun run build` | Static export to `out/` (`build:web` is the same, kept as an alias) |
| `bun run serve` | Serve `out/` on http://127.0.0.1:4173 with Cloudflare Pages style resolution |
| `bun run typecheck` | Generate route types and run `tsc` |
| `bun run lint` | ESLint |
| `bun run test` | Vitest: content, safety lint, store, intents, navgrid A*, rover movement, camera rigs, URL sync, GPU tier |
| `bun run verify:quick` | Typecheck, lint, unit tests and `next build`: the pre-push check |
| `bun run e2e:changed` | Playwright specs that cover your changed paths (`scripts/e2e-plan.ts`); `--dry` prints the plan |
| `bun run e2e` / `e2e:full` | Playwright against `out/` (run a build first): static routes plus the 3D experience on SwiftShader WebGL (tests force `?tier=`, since software WebGL alone maps to static) |
| `bun run e2e:smoke` | Fast subset: static routes, SEO, deploy rules, game-first load, Page View |
| `bun run screenshots` | HTML pages and 3D captures (boot, Lobby, L2 rail) at 1440x900, 1024x1366 and 390x844 into `screenshots/` |
| `bun run screenshots:pages` | Page View captures at 1440x900, 1024x1366 and 390x844, plus the landing at 1440x900, 834x1112 and 390x844 (`screenshots/landing/`) |
| `bun run validate:content` | Schema and safety check for `content/site-content.json` |
| `bun run floor:thumbs` | Captures every floor from its start spot (after a build) and writes the elevator picker thumbnails `public/floors/*.webp` (needs `cwebp`) |

## Routes

All routes are locale-prefixed (`/en/...`, `/id/...`). `/` redirects by the remembered or browser language.

| Route | Content |
|---|---|
| `/{locale}` | Lobby: cinematic hero (name over a CSS-only animated Neon Grid, Enter the 3D HQ, Ask AI), live stats ticker (`#stats`), three featured projects with screenshots and the other key projects (`#work`), a short intro with the current role (`#intro`), latest journey, writing, skills, certifications (3 featured cards and the newest rows; the full, filterable list is on `/{locale}/contact`). Mounts the 3D tower on top when WebGL is available. |
| `/{locale}/quick` | Quick view: everything on one page |
| `/{locale}/journey`, `/{locale}/journey/{slug}` | Career Archive 2019 to 2026 and the Workshop annex; in 3D, the L2 Career Road (a slug deep link opens that room at its door) |
| `/{locale}/labs`, `/{locale}/labs/{slug}` | Product Engineering and AI Engineering case studies; in 3D, L3 Project Roads (a slug deep link opens that pod at its door) |
| `/{locale}/library`, `/{locale}/blog/{slug}` | Blog, publications, models, talks; in 3D, L4 Writing with the "Read my writing" walk (a post's drawer mirrors its `/blog/{slug}` URL, which is the article page) |
| `/{locale}/contact` | Roof: about, contact channels, availability, CV, full certifications list |
| `/api/ask` | Ask the HQ endpoint (Pages Function): `GET` status, `POST` question, SSE answer |
| `/{locale}/cv` | CV viewer: page images of the owner's PDF (`/cv/kurniadi-ahmad-wijaya-cv.pdf`, one file for both languages) with zoom, a PDF download and open in new tab. Every CV button on the site opens the same viewer as a modal. |

## Content

- `content/site-content.json` is the single public dataset. It is validated by the zod schemas in `src/content/schema.ts` at build time and by the tests. All text is `{ en, id }`.
- Blog posts are MDX files in `content/blog/<slug>.<locale>.mdx`. A missing translation falls back to the original with a note.
- Titles (projects, posts, publications, talks, side projects, awards, principles) are written in Title Case in both languages; `bun scripts/title-case.ts` lists any that are not and `--write` fixes them (rules: "Content style" in `AGENTS.md`).
- Projects with a gallery come first in every project list (Work, Home, Cmd-K, the L3 wing roads and the project tour), then hero, featured and listed pods by `order` (`orderPods` in `src/content/selectors.ts`).
- Certifications live in `certifications[]`: `status` is `earned`, `in-progress` or `expired`; optional `credentialUrl`, `credentialId`, `expires` (YYYY-MM) and `featured` (pin to the 3 featured cards). They sort themselves (earned newest first) and any number fits: Page View shows featured cards plus a dense list (issuer chips, status filter and search from 10 certifications on), the 3D Lobby a curved wall with issuer tabs and paging. Clicking one opens an in-site preview card with an "Open credential" link (new tab); credential sites are never framed. New issuers get a logo through `src/content/tech.ts` (`public/tech/`).
- The CV is the owner's own PDF, committed as-is at `public/cv/kurniadi-ahmad-wijaya-cv.pdf` and served for both languages. CV buttons open an in-site viewer modal that shows pre-rendered page images (`public/cv/pages/`), so no PDF renderer ships to the browser. To update the CV, replace that file (same name) and run `bun run cv:pages` (needs `pdftoppm` and `cwebp`: `brew install poppler webp`); a unit test fails until the images match the PDF.
- Research papers open a preview modal with the abstract (English), copyable APA, IEEE and BibTeX citations, and DOI and Google Scholar links in a new tab. Third-party pages are never framed.
- Private evidence never enters the repo. The public-safety lint blocks client company names (committed in `content/safety-blocklist.default.txt`) and private repository names (`content/.safety-blocklist.local.txt`, gitignored, and the `SAFETY_BLOCKLIST` env var / CI secret). Product names in `content/safety-allowlist.txt` are never flagged. An e2e check scans the built `out/` for the same terms.

## Structure

```
content/      dataset, blog MDX, blocklists
messages/     UI strings (en, id)
scripts/      static server, e2e planning, content validator, title case, CV page renderer (cv:pages), floor thumbnails (floor:thumbs), Ask pack, evals, provisioning, deploy smoke check
functions/    Cloudflare Pages Function for Ask the HQ (api/ask.ts, _lib/ pipeline)
src/app/      routes ([locale] pages, "/" redirect, 404)
src/components/  static-page UI, shared modal, CV viewer and paper previews
src/content/  schema, accessors, selectors (orderPods), title case, blog loader, safety lint
src/ask/      Ask client, protocol, knowledge pack, suggestions, chat thread
src/i18n/     next-intl routing and helpers
src/lib/      formatting, accents, metadata, GPU tier, URL sync, viewport
src/experience/  3D tower: canvas, scene, tower, floors (L3 Project Roads in floors/labs, L4 Writing in floors/library), rover, camera rigs, input intents, navgrid, road kit, missions and guided walks
src/hud/      HTML HUD over the canvas
src/store/    zustand store
tests/        Vitest unit and content tests
e2e/          Playwright tests
docs/         design spec, plans, deploy guide, Ask runbook, design mockups
.github/workflows/  ci, deploy, screenshots, refresh-facts, ask-eval, content-gap
```

## CI and deploys

GitHub Actions runs typecheck, lint and unit tests next to the static build, then the Playwright suite in 4 parallel shards against that build; `Build, CV and e2e` is the aggregate required check (the name predates the CV becoming a committed PDF), and `Lighthouse CI` enforces the performance budgets. Screenshots run nightly on `main`, on demand and on PRs labelled `screenshots` (`.github/workflows/screenshots.yml`).

Production is the Cloudflare Pages project `kurniadi` at https://kurniadi.pages.dev. `deploy.yml` deploys a commit on `main` when dispatched (Actions > Deploy, or `gh workflow run deploy.yml -f sha=<commit>`) and after each weekly facts merge: it builds, runs the e2e shards, deploys with `wrangler pages deploy`, then smoke-checks `/api/ask`, `/en` and the analytics beacon, opening a `deploy-failed` issue on any failure. Ordinary merges to `main` do not deploy by themselves. PR previews (project `shinyq-hq`) are off unless `CF_PREVIEWS=true`. Cloudflare Web Analytics runs on production builds only. Details, secrets, variables and the Cloudflare resource inventory: [`docs/deploy.md`](docs/deploy.md).

## Performance

The HTML pages paint their text before any JavaScript runs, so Lighthouse's simulated LCP is set by the bytes of the HTML, the CSS and the three preloaded fonts. Budgets are enforced in CI (`lighthouserc.json`, `Lighthouse CI` job): LCP under 2 s, CLS under 0.01, TBT under 200 ms, and per page at most 60 KB of fonts, 80 KB of HTML, 20 KB of CSS and 240 KB of JavaScript. What keeps them there (subset fonts, deferred Next.js chunks, large client data in `/data/*.json` instead of layout props, small always-loaded islands): [`docs/deploy.md`](docs/deploy.md) section 8.

In 3D every floor stays under 150 draw calls and 30k triangles (`expectRenderBudget` in the e2e suite). Touch devices render fewer pixels (DPR 1.5 on full, 1.25 on lite, no composer MSAA; `renderBudget` in `src/experience/scene/settings.ts`), neighbouring floors mount on idle after the first frames, and the nav grids build in about a millisecond.

# ShinyQ HQ

The portfolio of **Kurniadi Ahmad Wijaya**, AI and Software Engineer.

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
| HUD polish | Shift boost (touch toggle; trails, lean, camera kick, streaks, sparks), Ask Rover, unskippable intro, top bar without Quick view, bottom band, drawer footer, centered Lobby | Done |
| Walkable floors 3 | RF as a walkable roof deck: Signal Garden with the courier drone and the "Meet me" walk | Done |
| Highlights Hall | L1 summary behind the certifications wall: about me, top 3 projects, work experience (employment and freelance), contact; the "Quick tour" walk | Done |
| Onboarding | Rover's dialog (handheld RPG text box), first-session tour, "!" hint bubbles, first-visit floor lines with the walk choice | Done |
| Point-and-go | Hover or tap a glowing object (room doors, elevator pads, teleporters, stations, the Ask Rover kiosk, boards) to see its name and drive there; no free click-to-move | Done |

Try it: open `/en`, press **Boot rover** (the boot log and the intro play in full on the first 3D load of every browser session, on any route; nothing skips them, and a deep link such as `/en/labs/<slug>` then rides on to its floor or room), drive with WASD or the arrow keys (hold **Shift** to boost to about twice the speed: twin light trails follow the path, the rover squats and leans, the view widens, and speed streaks and wheel sparks rush past; on touch screens use the joystick and tap the boost button next to it to toggle boost on or off), point at a glowing object (a room, a pad, a board, the kiosk) to see its name and click it to drive there and open it (on touch screens tap it, then tap again or press **Go**; empty floor never moves the rover), and change floors with the elevator panel (every button is named after its page: L1 Home, L2 Journey, L3 Work, L4 Writing, RF About) or PageUp/PageDown. Drag, Q/E or the rotate buttons turn the view all the way around on every floor and R/F tilt it (from just above the floor to almost straight down); scroll, pinch or +/- zoom, and zooming all the way in switches to a first-person view through Rover's eyes (WASD drives where you look; zoom out, 0 or the reset button return; autopilot drives and elevator rides show the rover from behind meanwhile). Signs on L2 turn to face you from either side, and no words are painted on any floor: wing, zone and year names float as signs that always face the camera. Every floor also has a glowing call pad in front of the elevator door: stop on it (or click it) and pick a floor from a list with previews. Right after the boot and intro of your first session, Rover runs a short tour in a classic text box at the bottom of the screen (typewriter text, its face as the portrait; press Enter, Space, the round A button, click or tap to continue, or "Skip tutorial"): driving and boost, point-and-go, the camera (look around, zoom, first person), the Highlights Hall, the elevator and its call pads, then Ask Rover and Ask AI, each ringed while Rover talks about it. A deep link rides on to its floor first and gets a shorter tour there. Near anything you can use, a "!" bubble floats over it: press Enter or tap it for a one-line tip with a Go choice. The first time you reach L2, L3, L4 or RF, Rover introduces the floor and offers its guided walk. The **Motion** button right of Sound (in the menu on phones, and in Cmd-K) picks System, Full or Reduced: System follows the device's reduced motion setting, Full turns every animation back on (Windows reports reduced motion whenever its animation effects are off), Reduced keeps rides as a short cut and the intro still; if the device asks for reduced motion, Rover offers Full once. **Ask Rover** (top bar, or click the rover) offers guided trips, "replay the tutorial" and "hints: on/off" (also in Cmd-K); **Classic site** (highlighted, with **Ask AI** on its right; ID **Situs klasik**) shows the same content as a regular website without 3D, and **Back to 3D** returns. Add `?tier=lite` or `?tier=static` to force a tier.

The Classic site (internally the Page View) home opens on a cinematic first screen: the name over an animated Neon Grid (CSS only, still under reduced motion, with a Pause motion switch), **Enter the 3D HQ** (shown wherever WebGL2 is available), the **Ask AI** bar and a live stats ticker, followed by three featured projects with their screenshots. The Rover Terminal never opens on its own; the **Ask Rover** button opens it anywhere, and first-time visitors in 3D get Rover's tour instead.

Driving into a room door (or picking it from Cmd-K) opens the Glass Drawer: a side panel on desktop (480 to 600 px wide, growing with the screen) or a bottom sheet on phones and portrait tablets. Its bar keeps the room code, prev/next, the "..." menu (README view, also on `t`) and close; the title and tabs scroll with the content, and the tabs stick under the bar, so the room body gets most of the height.

On L2 (`/en/journey`) one road runs forward in time: a plaza per year, rooms docked on both edges of each plaza with a road branch to every door, and the Workshop annex at the end. Every year plaza has a teleporter pad beside the road: stop on it (or click it) and pick a year to beam straight to that plaza. The first visit offers **Walk my journey**, a guided drive through every room oldest first (Prev / Open / Next, `[` and `]`, a type filter); skip it to roam freely, or start it later from the launcher or the "Follow my career" pick in Ask Rover. Career types use one Neon line icon and hue each (employment, freelance, education, award, milestone) in 3D and on the HTML pages. Each year floats as a big sign behind its plaza's north rooms. Past the Workshop annex window a light bridge runs off the floor toward a holographic skyline far below with a sunrise glow (the **Horizon**), and a light pillar rises at the start of the road (the **Origin**). Add `?walk=on` or `?walk=off` to force guided walks on or off.

On L1 (Lobby) the stats ring, the skills wall (four of the CV's skill groups: Backend, AI and LLM, Azure and DevOps; its drawer and the Page View list all seven) and the certifications wall (a curved holo-wall with issuer tabs and paging) surround the plaza in front of the elevator. RF (Roof, `/en/contact`) is a walkable deck: a road from the elevator into a round plaza around a lattice comms mast that carries the availability as a large neon sign, the comms station (all contact channels and the email, an antenna per channel ringing in its own hue) to the north, the CV kiosk to the east and an about board with location and timezone to the south-west. A courier drone patrols the mast and flies over the comms station or the CV kiosk while that room is open. The first visit offers **Meet me**, a four-stop guided drive (about, availability, CV, contact).

Behind the certifications wall, a road past its south end leads under a gateway arch (a floating **Highlights Hall** sign, and a light curtain that sweeps once per session as you drive through) into the **Highlights Hall**, a gallery that sums up the tower around a light fountain, each station on its own stage under fake spotlights: about me on a holo pedestal (the portrait as a hologram, name, headline, four big numbers in an arc, the one-line intro), the top 3 projects on three monolith screens (the same three as the landing), work experience on a lit arch split into Employment and Freelance (newest first; a card rides to the role on L2) and contact beside a signal beacon (email with copy, channels, the CV viewer, availability). Point at a station and click (or tap twice) to drive there and open its drawer; a project with a public site shows **Visit live site**. **Quick tour** (Ask Rover, Cmd-K or the launcher pill) drives through all four. `/{locale}#highlights` or `/{locale}#highlights-<about|projects|experience|contact>` opens a station directly. The Ask Rover kiosk on the plaza is one straight unit (body, stand and screen square to the floor) whose lines never wrap.

On L3 (Labs) the floor is **Project Roads**: a hub plaza in front of the elevator, a wing directory wall where the two wing roads fork (the first thing you see on arrival: each wing's name, project count and top projects; click a panel for the full list), and two wing roads that run east and meet in a loop right after their last pods, with every key and featured project docked along them. The loop closes in the east plaza around the spinning **Reactor core**, fed by the packet lanes (routes drive around it), and data waterfalls pour off the four slab corners. The first visit offers **Tour my projects**, a guided drive pod by pod (Prev / Open / Next, `[` and `]`, a wing filter, swipe on phones); skip it to roam, start it later from the launcher or the "Tour my projects" pick in Ask Rover; the boards list each wing's top projects and open the full list on click.

On L4 (Writing) the floor is the **Newsroom**: a press plaza with a headline wall (the newest title in large type over a ticker of every title) and the featured post on a lit stage under a turning open book, then one timeline lane east with the other posts newest first, year marks floating over the lane, and the Research (its paper plates open the paper preview), Models and datasets and Talks and workshops desks. The first visit offers **Read my writing**, a guided drive station by station (posts newest first, then Research, Models and datasets, Talks and workshops; a zone filter); skip it to roam freely, or start it later from the launcher or the "Read my writing" pick in Ask Rover. Posts beyond the first 12 wait on the archive board, which opens the posts palette.


## Ask the HQ (AI Q&A)

Visitors can ask questions about Kurniadi's work, projects, career, contact details and the professional views he has written down (principles, engineering and AI practice, tools, career advice) and get short answers grounded only in this site's content (EN and ID).

- Where: the floating **Ask AI** button on every page and in 3D (side panel on desktop, bottom sheet on phones), the Ask bar in the Page View hero, the Rover Terminal (`a`) and the Cmd-K "Ask AI" row. Topic pills (Work, AI, Career, Contact, Perspectives) expand into curated questions (`content/ask/suggestions.json`), and each answer suggests related follow-ups with no extra AI call. The thread is kept in `sessionStorage` only.
- How: a Cloudflare Pages Function (`functions/api/ask.ts`, pipeline in `functions/_lib/`) retrieves from a knowledge pack built at build time from the public content (`src/ask/pack.ts`), then calls Workers AI through AI Gateway `shinyq-hq`: **Gemma 4 26B** (`@cf/google/gemma-4-26b-a4b-it`, thinking off), falling back once to **Mistral Small 3.1** on error, timeout or an empty answer. Answers stream over SSE, are cached in KV for 7 days and are rendered as plain text.
- Safety: invisible Turnstile, Origin checks, per-visitor and global rate limits, PII scrubbing, prompt-injection handling, output checks (client-name blocklist, numeric grounding, entity and prompt-leak checks), a circuit breaker and an `ASK_ENABLED` kill switch, professional-only scope (personal topics and opinions about people, employers or clients are declined before any model call), a first-person check and a source check that turns any opinion he never wrote down into "Kurniadi hasn't shared a written view on that". Full threat model: the Ask design spec sections 7 and 13.
- Freshness: `refresh-facts.yml` refreshes live numbers weekly (`content/generated/dynamic-facts.json`), merges after CI and deploys. `ask-eval.yml` runs the golden set (41 questions) and the red-team set (52 attacks) against the real models nightly; `content-gap.yml` reports unanswered questions weekly.
- Operations (provisioning, kill switch, cache purge, secret rotation, token expiry): [`docs/ask-runbook.md`](docs/ask-runbook.md).

## Stack

Next.js 16 (App Router, static export) · React 19 · TypeScript strict · three.js with React Three Fiber, drei and postprocessing · zustand · Tailwind CSS 4 · next-intl · zod · MDX (next-mdx-remote) · Vitest · Playwright · Bun · Cloudflare Pages.

Visual language: the Neon Grid tokens of spec appendix 05. Color marks state and category with a dot or icon chip next to the label and a full-outline glow on hover or selection, never with a colored left or top edge (see AGENTS.md, "Styling").

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
| `bun run test` | Vitest: content, safety lint, store, intents, navgrid A*, rover movement, camera rigs, orbit, collision and first person, URL sync, GPU tier |
| `bun run bench` | Vitest benches (`tests/bench/`): `findPath` on the real floor layouts and palette typing, each against the pre-round-5 implementation; numbers for PR bodies, never a CI gate |
| `bun run verify:quick` | Typecheck, lint, unit tests and `next build`: the pre-push check |
| `bun run e2e:changed` | Playwright specs that cover your changed paths (`scripts/e2e-plan.ts`); `--dry` prints the plan |
| `bun run e2e` / `e2e:full` | Playwright against `out/` (run a build first): static routes plus the 3D experience on SwiftShader WebGL (tests force `?tier=`, since software WebGL alone maps to static) |
| `bun run e2e:smoke` | Fast subset: static routes, SEO, deploy rules, game-first load, Page View |
| `bun run screenshots` | HTML pages and 3D captures (boot, Lobby, L2 rail) at 1440x900, 1024x1366 and 390x844 into `screenshots/` |
| `bun run screenshots:pages` | Page View captures at 1440x900, 1024x1366 and 390x844, plus the landing at 1440x900, 834x1112 and 390x844 (`screenshots/landing/`) |
| `bun run validate:content` | Schema and safety check for `content/site-content.json` |
| `bun run floor:thumbs` | Captures every floor from its start spot (after a build) and writes the elevator picker thumbnails `public/floors/*.webp` (needs `cwebp`) |
| `bun run og:stills` | Captures every floor at 1200x630 (after a build, WebGL on SwiftShader) and writes the share card backgrounds `public/og-assets/floor-*.jpg`; `--photo <png>` refreshes the owner's photo |
| `bun run og:check` | Social-card check over `out/`: every page's title, 140 to 160 character description, canonical, hreflang, Open Graph and Twitter tags, and every share image (1200x630 JPEG, at most 300 KB); writes 300 px previews to `screenshots/og-preview/` |

## Routes

All routes are locale-prefixed (`/en/...`, `/id/...`). `/` redirects by the remembered or browser language.

| Route | Content |
|---|---|
| `/{locale}` | Lobby: cinematic hero (name over a CSS-only animated Neon Grid, Enter the 3D HQ, Ask AI), live stats ticker (`#stats`), three featured projects with screenshots and the other key projects (`#work`), a short intro with the current role (`#intro`), latest journey, writing, skills, certifications (3 featured cards and the newest rows; the full, filterable list is on `/{locale}/contact`). Mounts the 3D tower on top when WebGL is available. In 3D, the Lobby and the Highlights Hall (`#highlights-<station>` opens a station). |
| `/{locale}/quick` | Quick view: everything on one page |
| `/{locale}/journey`, `/{locale}/journey/{slug}` | Career Archive 2019 to 2026 and the Workshop annex; in 3D, the L2 Career Road (a slug deep link opens that room at its door) |
| `/{locale}/labs`, `/{locale}/labs/{slug}` | Product Engineering and AI Engineering case studies; in 3D, L3 Project Roads (a slug deep link opens that pod at its door) |
| `/{locale}/library`, `/{locale}/blog/{slug}` | Blog, publications, models, talks; in 3D, L4 Writing with the "Read my writing" walk (a post's drawer mirrors its `/blog/{slug}` URL, which is the article page) |
| `/{locale}/contact` | Roof: about, contact channels, availability, CV, full certifications list; in 3D, the RF roof deck (comms station, CV kiosk, availability sign, about board) with the "Meet me" walk |
| `/api/ask` | Ask the HQ endpoint (Pages Function): `GET` status, `POST` question, SSE answer |
| `/{locale}/cv` | CV viewer: page images of the owner's PDF (`/cv/kurniadi-ahmad-wijaya-cv.pdf`, one file for both languages) with zoom, a PDF download and open in new tab. Every CV button on the site opens the same viewer as a modal. |

## Content

- `content/site-content.json` is the single public dataset. It is validated by the zod schemas in `src/content/schema.ts` at build time and by the tests. All text is `{ en, id }`.
- Blog posts are MDX files in `content/blog/<slug>.<locale>.mdx`. A missing translation falls back to the original with a note.
- Perspectives: `content/perspectives.json` holds Kurniadi's own answers to common professional questions (EN and ID). Entries publish on About, Quick view and in Ask only after the owner approves them (`"approved": true` per entry, or `"status": "approved"`); how to edit and approve: `docs/ask-runbook.md` section 15.
- Titles (projects, posts, publications, talks, side projects, awards, principles) are written in Title Case in both languages; `bun scripts/title-case.ts` lists any that are not and `--write` fixes them (rules: "Content style" in `AGENTS.md`).
- Projects with a gallery come first in every project list (Work, Home, Cmd-K, the L3 wing roads and the project tour), then hero, featured and listed pods by `order` (`orderPods` in `src/content/selectors.ts`).
- Project galleries are screenshots of the live apps (`public/media/<slug>/`) with private data blurred: company and people names, contact details, amounts, tax and bank identifiers, document numbers and hostnames. Two client projects stay text only by the owner's choice: the coal mining chart-of-accounts assistant and the automotive fraud review dashboard.
- Projects with a public live site (`liveUrl`, allowlisted hosts in `src/content/live-links.ts`; today the MII Microsoft Solutions Website and the MII Microsoft AI Portfolio and Assistant) show a "Visit live site" button on their case study, in the project rows and in the Glass Drawer footer. It opens a new tab with `rel="noopener noreferrer"`; internal apps never get a link.
- Certifications live in `certifications[]`: `status` is `earned`, `in-progress` or `expired`; optional `credentialUrl`, `credentialId`, `expires` (YYYY-MM) and `featured` (pin to the 3 featured cards). They sort themselves (earned newest first) and any number fits: Page View shows featured cards plus a dense list (issuer chips, status filter and search from 10 certifications on), the 3D Lobby a curved wall with issuer tabs and paging. Clicking one opens an in-site preview card with an "Open credential" link (new tab); credential sites are never framed. New issuers get a logo through `src/content/tech.ts` (`public/tech/`).
- The CV is the owner's own PDF, committed as-is at `public/cv/kurniadi-ahmad-wijaya-cv.pdf` and served for both languages. CV buttons open an in-site viewer modal that shows pre-rendered page images (`public/cv/pages/`), so no PDF renderer ships to the browser. To update the CV, replace that file (same name) and run `bun run cv:pages` (needs `pdftoppm` and `cwebp`: `brew install poppler webp`); a unit test fails until the images match the PDF.
- Research papers open a preview modal with the abstract (English), copyable APA, IEEE and BibTeX citations, and DOI and Google Scholar links in a new tab. Third-party pages are never framed.
- Paper PDFs: a paper or thesis with `document` in `site-content.json` gets "Read the paper" (Page View research list, the paper modal, the L4 Research drawer), which opens the paper reader in the paper modal: pre-rendered page images with zoom, the page count, "Download PDF" and "Open in new tab". To add one:
  1. Check the publisher's posting rule. IEEE allows the authors' accepted manuscript with IEEE's notice, never the publisher's final PDF, so IEEE papers must use `version: "manuscript"` and `notice: "ieee"` (the schema enforces both; the notice and the DOI link render next to the reader). Today the ICAIBDA 2021 e-wallet paper is the authors' manuscript; the ICICyTA 2021 COVID-19 paper has no hosted PDF because only the IEEE final version exists. Its accepted manuscript can be added later the same way.
  2. Redact personal data first: student or staff IDs, home addresses, phone numbers, signatures and QR codes that link to them. Rasterize the affected pages with the regions blacked out (so no text is left to extract) and keep the other pages as they are; never commit the unredacted original. Use `version: "redacted"`. The thesis PDF (`sentiboard-bsc-thesis`) was redacted this way on pages 1 to 4.
  3. Save it as `public/papers/{file}.pdf` (`file` = the publication id), add `"document": { "file", "version", "notice"? }` and run `bun run paper:pages` (needs `pdftoppm`, `pdftotext` and `cwebp`). It refuses a PDF whose text still holds personal data patterns or blocklisted names, then writes `public/papers/{file}/` (1400 px webp per page) and `content/generated/paper-pages.json`; `tests/content/papers.test.ts` fails until the images match the PDF.
- Private evidence never enters the repo. The public-safety lint blocks client company names (committed in `content/safety-blocklist.default.txt`) and private repository names (`content/.safety-blocklist.local.txt`, gitignored, and the `SAFETY_BLOCKLIST` env var / CI secret). Product names in `content/safety-allowlist.txt` are never flagged. An e2e check scans the built `out/` for the same terms.

## Structure

```
content/      dataset, blog MDX, blocklists
messages/     UI strings (en, id)
scripts/      static server, e2e planning, content validator, title case, CV and paper page renderers (cv:pages, paper:pages), floor thumbnails (floor:thumbs), share card stills and checks (og:stills, og:check, og-before-after), Ask pack, evals, provisioning, deploy smoke check
functions/    Cloudflare Pages Functions: Ask the HQ (api/ask.ts, _lib/ pipeline), performance beacon (api/rum.ts), visit stats (api/visit.ts, api/stats.ts)
workers/stats/  hq-stats Cron Worker: daily public visit stats rollup into KV (own wrangler.toml)
src/app/      routes ([locale] pages, "/" redirect, 404)
src/components/  static-page UI, shared modal, page image viewer (CV and paper PDFs) and paper previews
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

GitHub Actions runs typecheck, lint and unit tests next to the static build, then the Playwright suite in 4 parallel shards and the 3D perf gates in 2 shards against that build; `Build, CV and e2e` is the aggregate required check (the name predates the CV becoming a committed PDF), `Lighthouse CI` enforces the Page View budgets and the `3D perf gates` job the 3D ones. Both publish per-chunk JS and gate tables against the last green `main` run in the job summary. Screenshots run nightly on `main`, on demand and on PRs labelled `screenshots` (`.github/workflows/screenshots.yml`); the game-first timeline runs nightly as a trend (`.github/workflows/perf-nightly.yml`).

Production is the Cloudflare Pages project `kurniadi` at https://kurniadi.pages.dev. `deploy.yml` deploys a commit on `main` when dispatched (Actions > Deploy, or `gh workflow run deploy.yml -f sha=<commit>`) and after each weekly facts merge: it reuses CI's green result for that commit instead of rerunning e2e (it runs the e2e shards only when no CI result exists or with `-f rerun_e2e=true`), builds, deploys with `wrangler pages deploy`, then smoke-checks `/api/ask`, `/api/rum`, `/en` and the analytics beacon, opening a `deploy-failed` issue on any failure. Ordinary merges to `main` do not deploy by themselves. PR previews (project `shinyq-hq`) are off unless `CF_PREVIEWS=true`. Cloudflare Web Analytics runs on production builds only; an anonymous, sampled performance beacon (appendix 06 section 4) writes coarse tier, FPS and load-time buckets to Analytics Engine. Public visit stats (appendix 06 section 4.1): a first-party beacon records whether a page lifetime used the 3D view or the Classic site, the `hq-stats` Cron Worker (`workers/stats/`) rolls Web Analytics and Analytics Engine up once a day into KV, and `GET /api/stats` serves the snapshot; "Don't count my visits" (`localStorage["hq:stats-optout"]`) turns every beacon off. `deploy.yml` also deploys the Worker after checking its tokens. Details, secrets, variables and the Cloudflare resource inventory: [`docs/deploy.md`](docs/deploy.md).

## Performance

The HTML pages paint their text before any JavaScript runs, so Lighthouse's simulated LCP is set by the bytes of the HTML, the CSS and the three preloaded fonts. Budgets are enforced in CI and are authoritative over the spec (appendix 08 section 2; `lighthouserc.json`, `Lighthouse CI` job): LCP under 2 s, CLS under 0.01, TBT under 200 ms, and per page at most 60 KB of fonts, 80 KB of HTML, 20 KB of CSS and 240 KB of JavaScript. What keeps them there (subset fonts, deferred Next.js chunks, large client data in `/data/*.json` instead of layout props, small always-loaded islands): [`docs/deploy.md`](docs/deploy.md) section 8.

Delivery (round 5): zod stays on the server (`src/content/locales.ts`; the build fails when `_zod`, `readFileSync` or `site-content` reaches a client chunk); Lighthouse CI warms up on a throwaway URL first; unhashed files have explicit cache rules (`public/_headers`, troika fonts are content-hashed and immutable); the game-first boot downloads only what the first 3D frame needs (the hidden page is skipped with `content-visibility`, header links do not prefetch, room data waits for the first frame and idle); the boot card names the owner and offers the Classic site; the Page View never starts audio. Numbers (against the round 5 starting point): initial JS 235.2 to 203.8 KB, bytes before the first 3D frame 1082.1 to 680.7 KB, troika fonts 139 to 58 KB.

In 3D every floor stays under 150 scene draw calls (L1 at most 125), at most 20 post-processing passes and 30k triangles, including the peaks of the intro, every elevator ride and hover (`e2e/gpu.spec.ts`, `e2e/perf/peaks.spec.ts`; during a ride, meshes hidden under a solid slab are skipped, `src/experience/tower/rideCull.ts`); shader programs stay at their committed baseline and the JavaScript after the 3D gate stays under 450 KB gzip per tier (`e2e/budgets.ts`, `bun run e2e:perf`). Real-device frame rate is checked with `?perf=1`. The pixel budget (`renderBudget` in `src/experience/scene/settings.ts`) keeps desktops at DPR up to 2 within 8.3 MP and skips composer MSAA from DPR 1.5 up; touch devices render fewer pixels (DPR 1.5 on full, 1.25 on lite). A runtime safety net lowers DPR, then MSAA, then bloom only on sustained frame drops, at most twice a minute. Shader programs compile before they are needed (every other floor during the boot on the full tier, each floor as it mounts), neighbouring floors mount on idle after the first frames, and the nav grids build in about a millisecond. Floor content is disposed when it unmounts: `e2e/memory.spec.ts` drives 10 Lobby to Roof round trips and 5 Page View toggles and expects the renderer's geometries, textures and shader programs back at their baseline. The canvas renders at most 60 frames per second (`scene/framePacer.ts`), so 90 to 144 Hz screens do not do twice the work. Measurements: [`docs/perf/r5-gpu.md`](docs/perf/r5-gpu.md).

The elevator never skips its ride: each frame adds at most 1/30 s of ride time (1/20 s on steadily slow devices), and on a first visit the car waits with closed doors (at most 1.5 s) until the new floor's shaders are compiled and its text is set. To check a device, open any 3D route with `?perf=1` (for example `/en?perf=1`), open the browser console (F12) and ride: every ride prints one `[hq ride]` line with the dolly frames, car heights, biggest jump, longest frame, wait and shaders compiled while moving. Good: at least 12 car heights, biggest jump at most 25% of the trip, "0 shaders compiled while moving". The same flag shows a small overlay with FPS p50/p10, frame p95, scene and post draw calls, GPU objects, tier, DPR and pixels, and after the first ride a sixth line with that ride's summary (nothing of it runs without the flag).

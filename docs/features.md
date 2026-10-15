# Feature reference

What every part of ShinyQ HQ does, floor by floor. The [README](../README.md) is the short overview; implementation rules live in [`AGENTS.md`](../AGENTS.md), content rules in [`content.md`](content.md).

## Contents

- [Status](#status)
- [Controls and first visit](#controls-and-first-visit)
- [Classic site](#classic-site)
- [Glass Drawer](#glass-drawer)
- [L1 Lobby](#l1-lobby)
- [L1 Highlights Hall](#l1-highlights-hall)
- [L2 Career Road](#l2-career-road)
- [L3 Project Roads](#l3-project-roads)
- [L4 Newsroom](#l4-newsroom)
- [RF Roof deck](#rf-roof-deck)
- [Routes](#routes)
- [Search and link previews](#search-and-link-previews)
- [Ask the HQ (AI Q&A)](#ask-the-hq-ai-qa)
- [Visual language](#visual-language)
- [CI and deploys](#ci-and-deploys)
- [Performance](#performance)

## Status

| Phase | Scope | State |
|---|---|---|
| 0 | Scaffold, content schema, public-safe dataset, static pages, CV PDF, CI | Done |
| 1 | Tower shell: five floors, glass elevator, camera rigs, input intents, store, GPU tiers | Done |
| 2 | Screen Rover (keyboard, click/tap-to-move, joystick) and the L1 Lobby | Done |
| 3 to 5 | Career Archive, Labs and the Glass Drawer, Library and Roof, missions | Done |
| 6 | Launch on Cloudflare Pages (`kurniadi.pages.dev`), SEO, Lighthouse CI | Done |
| Ask | Ask the HQ: grounded AI Q&A (Gemma 4 with Mistral fallback), chat dock, weekly live facts | Done |
| Ask: leads and lifestyle | "What can you do?", project inquiries with a contact card, 30 endorsed lifestyle, industry and policy answers, deterministic scope routing | Done |
| Walkable floors | Road kit, guided walks, L2 Career Road, L3 Project Roads, Neon line type icons | Done |
| Content and UI | Galleries from the live apps, certifications at scale, CV viewer and paper previews, roomier drawer, named elevator, Title Case titles, gallery-first ordering, cinematic Page View landing, elevator call pads and L2 teleporters | Done |
| Walkable floors 2 | L4 Writing as the walkable Newsroom with the "Read my writing" walk | Done |
| HUD polish | Shift boost (touch toggle; trails, lean, camera kick, streaks, sparks), Ask Rover, unskippable intro, top bar without Quick view, bottom band, drawer footer, centered Lobby | Done |
| Walkable floors 3 | RF as a walkable roof deck: Signal Garden with the courier drone and the "Meet me" walk | Done |
| Highlights Hall | L1 summary behind the certifications wall: about me, top 3 projects, work experience (employment and freelance), contact; the "Quick tour" walk | Done |
| Onboarding | Rover's dialog (handheld RPG text box), first-session tour, "!" hint bubbles, first-visit floor lines with the walk choice | Done |
| Point-and-go | Hover or tap a glowing object (room doors, elevator pads, Return pads, teleporters, stations, the Ask Rover kiosk, boards) to see its name and drive there; no free click-to-move | Done |
| SEO and link previews | Search titles within 60 characters, unique titles, `/` canonical to `/en`, baseline JFIF share cards with `og:image:secure_url`, Person, ProfilePage and SoftwareSourceCode structured data, content-dated sitemap, Search Console and Bing verification, LinkedInBot checks in e2e and the deploy smoke | Done |
| Fast return | Any floor change more than 40 u from the elevator call pad beams the rover into the car; green "Back to elevator" pads at the far ends of L2 and L3 beam it to the call pad | Done |

## Controls and first visit

Open `/en` and press **Boot rover**.

### Boot and intro

- The boot log and the intro play in full on the first 3D load of every browser session, on any route. Nothing skips them.
- A deep link such as `/en/labs/<slug>` then rides on to its floor or room.
- Add `?tier=lite` or `?tier=static` to force a tier.

### Driving

- Drive with WASD or the arrow keys.
- Hold **Shift** to boost to about twice the speed: twin light trails follow the path, the rover squats and leans, the view widens, and speed streaks and wheel sparks rush past.
- On touch screens use the joystick and tap the boost button next to it to toggle boost on or off.

### Point-and-go

- Point at a glowing object (a room, a pad, a board, the kiosk) to see its name, and click it to drive there and open it.
- On touch screens tap it, then tap again or press **Go**.
- Empty floor never moves the rover.

### Camera

- Drag, Q/E or the rotate buttons turn the view all the way around on every floor; R/F tilt it (from just above the floor to almost straight down).
- Scroll, pinch or +/- zoom. Zooming all the way in switches to a first-person view through Rover's eyes (WASD drives where you look; zoom out, 0 or the reset button return).
- Autopilot drives and elevator rides show the rover from behind meanwhile.
- Signs on L2 turn to face you from either side. No words are painted on any floor: wing, zone and year names float as signs that always face the camera.

### Elevator and fast return

- Change floors with the elevator panel (every button is named after its page: L1 Home, L2 Journey, L3 Work, L4 Writing, RF About) or PageUp/PageDown.
- Every floor has a glowing call pad in front of the elevator door: stop on it (or click it) and pick a floor from a list with previews.
- Far from the elevator (more than 40 u: the L2 Workshop, the L3 east plaza, the deep L4 desks), any floor change beams the rover into the car instead of driving all the way back (a fade cut under reduced motion).
- The far ends of L2, L3 and L4 have a green **Back to elevator** pad that beams you to the call pad.

### Rover's tour, hints and floor lines

- Right after the boot and intro of your first session, Rover runs a short tour in a classic text box at the bottom of the screen (typewriter text, its face as the portrait).
- Press Enter, Space, the round A button, click or tap to continue, or "Skip tutorial".
- The tour covers driving and boost, point-and-go, the camera (look around, zoom, first person), the Highlights Hall, the elevator and its call pads, then Ask Rover and Ask AI, each ringed while Rover talks about it.
- A deep link rides on to its floor first and gets a shorter tour there.
- Near anything you can use, a "!" bubble floats over it: press Enter or tap it for a one-line tip with a Go choice.
- The first time you reach L2, L3, L4 or RF, Rover introduces the floor and offers its guided walk.

### Motion setting

- The **Motion** button right of Sound (in the menu on phones, and in Cmd-K) picks System, Full or Reduced.
- Full is the default on every device (owner decision 2026-10-14; Windows reports reduced motion whenever its animation effects are off), so the device's reduced motion setting no longer applies by default.
- Pick System to follow it again, or Reduced to keep rides as a short cut and the intro still.

### Ask Rover and the Classic site

- **Ask Rover** (top bar, or click the rover) offers guided trips, "replay the tutorial" and "hints: on/off" (also in Cmd-K).
- **Classic site** (highlighted, with **Ask AI** on its right; ID **Situs klasik**) shows the same content as a regular website without 3D, and **Back to 3D** returns.

## Classic site

The Classic site (internally the Page View) is the permanent no-WebGL fallback and the version crawlers see.

- The home opens on a cinematic first screen: the name over an animated Neon Grid (CSS only, still under reduced motion).
- **Enter the 3D HQ** shows wherever WebGL2 is available.
- Then the **Ask AI** bar and a live stats marquee, followed by the three projects the owner selected (`Pod.selected`), with their screenshots.
- On `/labs`, Key projects are the hero projects with screenshots, and every project row with a gallery shows its cover thumbnail.
- The Rover Terminal never opens on its own; the **Ask Rover** button opens it anywhere, and first-time visitors in 3D get Rover's tour instead.

## Glass Drawer

Driving into a room door (or picking it from Cmd-K) opens the Glass Drawer.

- A side panel on desktop (480 to 600 px wide, growing with the screen) or a bottom sheet on phones and portrait tablets.
- Its bar keeps the room code, prev/next, the "..." menu (README view, also on `t`) and close.
- The title and tabs scroll with the content, and the tabs stick under the bar, so the room body gets most of the height.

## L1 Lobby

Route `/en`. The stats ring, the skills wall and the certifications wall surround the plaza in front of the elevator.

- **Skills wall**: four of the CV's skill groups (Backend, AI and LLM, Azure and DevOps); its drawer and the Page View list all seven.
- **Certifications wall**: a curved holo-wall with issuer tabs and paging.
- **Ask Rover kiosk**: the session starts with the rover in front of it. The kiosk stands on a straight spoke from the lane ring and faces the hologram. It is one straight unit (body, stand and screen turned together to face the hologram, its lane spoke one straight line into its front) whose lines never wrap.
- The camera looks past the kiosk at the hologram's name and at the Visitor Observatory in the south-west corner.

### Visitor Observatory

`L1:visits`, `/en#visits` or the old `/en/contact#visits`, also in Cmd-K. It is also the first thing in view when you step out of the elevator.

- A hologram globe with a dot for every country visits came from (dots only, never a number per country).
- A panel with visits in the last 30 complete days and since launch, questions asked to the site AI, the most explored floor and the 3D vs Classic split.
- Its drawer filters by Topic (All, Work, AI, Career) and Period (Last 30 days, Since launch).
- The numbers come from the daily snapshot at `GET /api/stats` (Cloudflare Web Analytics, sampled estimates, updated daily). A snapshot older than 48 hours shows a "delayed" note; one older than 7 days hides every stats surface.
- The observatory drawer carries a **Don't count my visits** switch, stored only in this browser.

## L1 Highlights Hall

Behind the certifications wall, a road past its south end leads under a gateway arch into the hall.

- **Gateway**: a floating **Highlights Hall** sign, and a light curtain that sweeps once per session as you drive through.
- **The hall**: a gallery that sums up the tower around a light fountain, each station on its own stage under fake spotlights.
  - **About me** on a holo pedestal: the portrait as a hologram, name, headline, four big numbers in an arc, the one-line intro.
  - **Top 3 projects** on three monolith screens (the same three as the landing).
  - **Work experience** on a lit arch split into Employment and Freelance (newest first; a card rides to the role on L2).
  - **Contact** beside a signal beacon: email with copy, channels, the CV viewer, availability.
- Point at a station and click (or tap twice) to drive there and open its drawer. A project with a public site shows **Visit live site**.
- **Quick tour** (Ask Rover, Cmd-K or the launcher pill) drives through all four.
- `/{locale}#highlights` or `/{locale}#highlights-<about|projects|experience|contact>` opens a station directly.

## L2 Career Road

Route `/en/journey`. One road runs forward in time.

- **Year plazas**: a plaza per year, rooms docked on both edges of each plaza with a road branch to every door. Each year floats as a big sign behind its plaza's north rooms.
- **Teleporters**: every year plaza has a teleporter pad beside the road. Stop on it (or click it) and pick a year to beam straight to that plaza.
- **Career types**: one Neon line icon and hue each (employment, freelance, education, award, milestone) in 3D and on the HTML pages.
- **Walk my journey**: offered on the first visit, a guided drive through every room oldest first (Prev / Open / Next, `[` and `]`, a type filter). Skip it to roam freely, or start it later from the launcher or the "Follow my career" pick in Ask Rover.
- **Workshop** at the end of the road:
  - A forecourt with the **time console**: click it and pick any year to beam there, or Back to elevator.
  - Beside the time console a green **Back to elevator** pad beams you straight back to the elevator call pad.
  - A gateway into the Workshop proper with one workbench per side project that has no L3 pod (click its hologram for the project drawer).
  - The public repos as a neon skyline (height by stars on a log scale, color by language; click a bar for the repo drawer and its GitHub link).
- **Horizon**: past the Workshop window a light bridge runs off the floor toward a holographic skyline far below with a sunrise glow.
- **Origin**: a light pillar rises at the start of the road.
- Add `?walk=on` or `?walk=off` to force guided walks on or off.

## L3 Project Roads

Route `/en/labs`.

- **Hub and directory wall**: a hub plaza in front of the elevator, and a wing directory wall where the two wing roads fork. It is the first thing you see on arrival: each wing's name, project count and top projects; click a panel for the full list.
- **Wing roads**: Product Engineering and AI Engineering run east and meet in a loop right after their last pods, with every key and featured project docked along them.
- **Data and ML annex**: past the reactor, the Data and ML road runs east to its own plaza and directory panel, with the data science, NLP, forecasting and data collection projects from the public GitHub repositories docked along it.
- **Packet lanes and waterfalls**: the loop closes in the east plaza around the Tech Reactor, fed by the packet lanes (routes drive around it), and data waterfalls pour off the four slab corners.
- **Tour my projects**: offered on the first visit, a guided drive pod by pod (Prev / Open / Next, `[` and `]`, a wing filter, swipe on phones). Skip it to roam, or start it later from the launcher or the "Tour my projects" pick in Ask Rover. The boards list each wing's top projects and open the full list on click.

### Tech Reactor

- Its six rings are the CV skill groups (AI and LLM, Azure, Backend, Frontend, Data, DevOps).
- Click one to open the Tech Reactor drawer with every tech in that group and its project count.
- Pick a tech to light the pods that use it and the roads to them, or press **Surprise me** for a random project.
- A pick lives in the URL (`/en/labs#labs-tech=azure-openai`), and Cmd-K finds it too ("Show projects using Azure OpenAI").

### Ops Control Room

`L3:ops`, also in Cmd-K. It stands in the AI wing's inner pocket beside the reactor.

- Three screens styled like Grafana and Application Insights panels (Metrics, Traces, Alerts) built from the proof tiles of "How I run AI in production".
- A live panel of this site's own telemetry from the daily stats snapshot: visits, the share of sampled 3D sessions at 55+ FPS, the median time to explore. Hidden when the snapshot is missing or stale.
- Its drawer shows the section with the case studies that prove it.

## L4 Newsroom

Route `/en/library`.

- **Press plaza**: a headline wall (the newest title in large type over a ticker of every title) and the featured post on a lit stage under a turning open book.
- **Timeline lane**: one lane east with the other posts newest first, year marks floating over the lane, then the Research desk (its paper plates open the paper preview), Models and datasets, and Talks and workshops.
- **Archive board**: posts beyond the first 12 wait on it; it opens the posts palette.
- **Read my writing**: offered on the first visit, a guided drive station by station (posts newest first, then Research, Models and datasets, Talks and workshops; a zone filter). Skip it to roam freely, or start it later from the launcher or the "Read my writing" pick in Ask Rover.

### Topic Constellation

- The timeline ends in a round plaza where every topic of the writing (from post tags, papers, models and talks) glows as an orb slowly orbiting a pedestal.
- Click an orb (or pick a topic in its drawer, or Cmd-K "Show writing about X"): every matching station and desk lights up with a beacon, the road to them glows and "N pieces on X" floats above.
- The pick lives in the URL (`#library-topic=<slug>`). The Classic Writing page has the same topics as a filter (`/library?topic=<slug>`).
- The research metrics stand on a monument on the plaza's north rim (citations, h-index, the source and its date; a click opens the Research desk), and a **Back to elevator** pad waits south of it.

## RF Roof deck

Route `/en/contact`. A walkable deck: a road from the elevator into a round plaza.

- **Comms mast**: a lattice mast in the middle carries the availability as a large neon sign.
- **Comms station** (north): all contact channels and the email, an antenna per channel ringing in its own hue.
- **CV kiosk** (east) and an **about board** with location and timezone (south-west).
- **Courier drone**: patrols the mast and flies over the comms station or the CV kiosk while that room is open.
- **Meet me**: offered on the first visit, a four-stop guided drive (about, availability, CV, contact).

## Routes

All routes are locale-prefixed (`/en/...`, `/id/...`); `/` redirects by the remembered or browser language. The [README](../README.md#routes) has the overview table.

- `/{locale}`: cinematic hero (name over a CSS-only animated Neon Grid, Enter the 3D HQ, Ask AI) and a live stats ticker (`#stats`, with a visits item from the public stats).
  - Three featured projects with screenshots and the other key projects (`#work`), a short intro with the current role (`#intro`), latest journey, writing and skills.
  - Certifications: 3 featured cards and the newest rows; the full, filterable list is on `/{locale}/contact`.
  - Mounts the 3D tower on top when WebGL is available: the Lobby and the Highlights Hall (`#highlights-<station>` opens a station).
- `/{locale}/quick`: Quick view, everything on one page.
- `/{locale}/journey`, `/{locale}/journey/{slug}`: Career Archive 2019 to 2026 and the Workshop annex; in 3D, the L2 Career Road (a slug deep link opens that room at its door).
- `/{locale}/labs`, `/{locale}/labs/{slug}`: Product Engineering, AI Engineering and Data and ML case studies (`?wing=software|ai|data` filters the list); in 3D, L3 Project Roads (a slug deep link opens that pod at its door).
- `/{locale}/library`, `/{locale}/blog/{slug}`: blog, publications, models, talks; in 3D, L4 Writing with the "Read my writing" walk. A post's drawer mirrors its `/blog/{slug}` URL, which is the article page.
- `/{locale}/contact`: Roof. About, contact channels, availability, "How I work" and the CV.
  - "How I run AI in production" (`#production`): the owner-approved observability approach, proof tiles, a masked Grafana probe dashboard and alert rule, and the five case studies; in 3D the hash rides to the L3 Ops Control Room.
  - "Visits" (`#visits`): counters, a dot map, the 3D vs Classic split, topic shares and curated question counts, with the Topic and Period filters and "View as table"; lazy loaded.
  - The full certifications list.
  - In 3D, the RF roof deck (comms station, CV kiosk, availability sign, about board) with the "Meet me" walk.
- `/{locale}/cv`: CV viewer, page images of the owner's PDF (`/cv/kurniadi-ahmad-wijaya-cv.pdf`, one file for both languages) with zoom, a PDF download and open in new tab. Every CV button on the site opens the same viewer as a modal.
- `/api/ask`: Ask the HQ endpoint (Pages Function): `GET` status, `POST` question, SSE answer.
- `/api/stats`: the daily public visit stats snapshot (200, or 204 before the first run). `/api/rum` and `/api/visit` take the anonymous performance and visit beacons (`POST` only).

## Search and link previews

Every page is a static HTML page with its own search and share tags, so crawlers and link unfurlers (LinkedIn, Slack, WhatsApp, X) never need the 3D view or JavaScript.

- Titles (`src/lib/seo.ts`): Open Graph and Twitter keep the share title (`seoFor().title`, owner wording); `<title>` uses `searchTitle`, which fits 60 characters by dropping the attribution step by step (full name, first name, none; journey entries keep the organization first), unique in each locale. Entries that share a role and organization (trophy cases, side projects) add their period. Descriptions stay 140 to 160 characters.
- Canonical: every page points at itself (`og:url` equals the canonical, checked by `og:check`); `/` (the script language redirect) points at `/en`, its x-default, with the same share card. hreflang `en`, `id` and `x-default` on every page and in the sitemap.
- Share cards: 1200x630 baseline JPEGs with a JFIF header (`src/lib/og-encode.ts`), under 300 KB, with `og:image:secure_url`, type, size and alt. The tags sit in the first 8 KB of every page (`lateShareTags` in `scripts/og-meta.ts`).
- Structured data (`src/lib/jsonld.ts`): `Person` (employer, Jakarta address, university, skills, LinkedIn, GitHub, Google Scholar, IEEE Xplore, Hugging Face and Medium) and `WebSite` on every page; `ProfilePage` on About (`/contact`); `CreativeWork` with `SoftwareSourceCode` parts (public repositories) on case studies; `BlogPosting` on posts; `BreadcrumbList` everywhere but home.
- `robots.txt` allows everything and names the sitemap. The sitemap dates posts, Writing, Journey, Home and Quick view from content (`lastModified` in `src/lib/routes.ts`) and leaves other pages undated. The 404 page is `noindex`.
- Search engine verification: `GOOGLE_SITE_VERIFICATION` and `BING_SITE_VERIFICATION` repository variables render the tags on `/`, `/en` and `/id` in production builds ([deploy guide](deploy.md#15-search-engines-and-link-previews)).
- Checks: `bun run og:check` (every page), `e2e/seo.spec.ts` (fetches every entry point as LinkedInBot), and the post-deploy smoke (`/`, `/en`, `/id` as LinkedInBot against production).

## Ask the HQ (AI Q&A)

Visitors ask questions about Kurniadi's work, projects, career, contact details, the views he has written down (principles, engineering and AI practice, tools, career advice, working style, AI and the industry, the Indonesian tech scene, technology policy and life outside work) and how this site itself was built (stack, 3D engine, hosting, the assistant, testing and process; `content/ask/site-build.json`, answers cite this repository), and get short answers grounded only in this site's content (EN and ID).

### Where

- The floating **Ask AI** button on every page and in 3D (side panel on desktop, bottom sheet on phones), the Ask bar in the Page View hero, the Rover Terminal (`a`) and the Cmd-K "Ask AI" row.
- Topic pills (Work, AI, Career, Contact, Perspectives) expand into curated questions (`content/ask/suggestions.json`), and each answer suggests related follow-ups with no extra AI call.
- The thread is kept in `sessionStorage` only.
- **What can you do?** (also a Contact pill, ID "Apa saja yang bisa ditanyakan di sini?") lists what the assistant covers, the two languages, sources, and what it will not discuss.
- **Project inquiries**: when a visitor describes their own need ("I need an AI chatbot for my clinic", "Kami butuh sistem deteksi fraud dokumen"), the answer names related skills and up to three matching past projects, says whether that work suggests a fit, notes freelance or part-time availability and invites contact; a **contact card** (Email, LinkedIn, Contact page) from the dataset appears under it. No prices, timelines, designs or code.

### How

- A Cloudflare Pages Function (`functions/api/ask.ts`, pipeline in `functions/_lib/`) retrieves from a knowledge pack built at build time from the public content (`src/ask/pack.ts`).
- It then calls Workers AI through AI Gateway `shinyq-hq`: **Gemma 4 26B** (`@cf/google/gemma-4-26b-a4b-it`, thinking off), falling back once to **Mistral Small 3.1** on error, timeout or an empty answer.
- Answers stream over SSE, are cached in KV for 7 days and are rendered as plain text.

### Safety

- Invisible Turnstile, Origin checks, per-visitor and global rate limits, PII scrubbing, prompt-injection handling.
- Output checks: client-name blocklist, numeric grounding, entity and prompt-leak checks.
- A circuit breaker and an `ASK_ENABLED` kill switch.
- Kurniadi-only scope, routed deterministically before any model call: family, relationships, health, religion, partisan politics, pay and opinions about people, employers or clients are declined; so are general-assistant requests (code, essays, homework, tutorials, translations, recommendations, "be a general chatbot" jailbreaks), with a decline that points back to what it covers. Lifestyle and tech-policy questions are answered only from his written perspectives on that topic.
- Lead answers are checked for estimates, system designs, code, unsupported fit claims and requests for the visitor's personal data.
- A first-person check, and a source check that turns any opinion he never wrote down into "Kurniadi hasn't shared a written view on that".
- Full threat model: the Ask design spec sections 7 and 13.

### Freshness and operations

- `refresh-facts.yml` refreshes live numbers weekly (`content/generated/dynamic-facts.json`), merges after CI and deploys.
- `ask-eval.yml` runs the golden set (47 questions) and the red-team set (52 attacks) against the real models nightly.
- `content-gap.yml` reports unanswered questions weekly.
- `uptime.yml` checks production every hour (pages, Ask status, stats freshness, the last deploy) and keeps one `uptime` issue open while something fails (docs/deploy.md section 16).
- Provisioning, kill switch, cache purge, secret rotation, token expiry: [`ask-runbook.md`](ask-runbook.md).

## Visual language

- The Neon Grid tokens of spec appendix 05.
- Color marks state and category with a dot or icon chip next to the label and a full-outline glow on hover or selection, never with a colored left or top edge (see `AGENTS.md`, "Styling").

## CI and deploys

### CI

- GitHub Actions runs typecheck, lint and unit tests next to the static build, then the Playwright suite in 4 parallel shards and the 3D perf gates in 2 shards against that build.
- `Build, CV and e2e` is the aggregate required check (the name predates the CV becoming a committed PDF). `Lighthouse CI` enforces the Page View budgets and the `3D perf gates` job the 3D ones. Both publish per-chunk JS and gate tables against the last green `main` run in the job summary.
- Screenshots run nightly on `main`, on demand and on PRs labelled `screenshots` (`.github/workflows/screenshots.yml`).
- The game-first timeline runs nightly as a trend (`.github/workflows/perf-nightly.yml`).
- Every HTML page carries its own script policy: the last build step (`scripts/csp-hashes.ts`) adds the sha256 of each inline script, so the effective `script-src` has no `'unsafe-inline'`. The build, the export scan, the deploy smoke check and `e2e/csp.spec.ts` (zero CSP violations) guard it; details in [`deploy.md`](deploy.md) section 9.

### Production

- The Cloudflare Pages project `kurniadi` at https://kurniadi.pages.dev.
- `deploy.yml` deploys a commit on `main` when dispatched (Actions > Deploy, or `gh workflow run deploy.yml -f sha=<commit>`) and after each weekly facts merge.
- It reuses CI's green result for that commit instead of rerunning e2e (it runs the e2e shards only when no CI result exists or with `-f rerun_e2e=true`), builds, deploys with `wrangler pages deploy`, then smoke-checks `/api/ask`, `/api/rum`, `/en` and the analytics beacon, opening a `deploy-failed` issue on any failure.
- Ordinary merges to `main` do not deploy by themselves. PR previews (project `shinyq-hq`) are off unless `CF_PREVIEWS=true`.

### Analytics and public visit stats

- Cloudflare Web Analytics runs on production builds only.
- An anonymous, sampled performance beacon (appendix 06 section 4) writes coarse tier, FPS and load-time buckets to Analytics Engine.
- Public visit stats (appendix 06 section 4.1): a first-party beacon records whether a page lifetime used the 3D view or the Classic site, the `hq-stats` Cron Worker (`workers/stats/`) rolls Web Analytics and Analytics Engine up once a day into KV, and `GET /api/stats` serves the snapshot.
- "Don't count my visits" (`localStorage["hq:stats-optout"]`) turns every beacon off.
- `deploy.yml` also deploys the Worker after checking its tokens.
- Details, secrets, variables and the Cloudflare resource inventory: [`deploy.md`](deploy.md).

### Dependencies

- Dependabot opens one weekly PR with every minor and patch update, and one PR per major.
- A major ships in its own PR with every gate green; 3D library majors also need the strict visual gate, the perf lane and the memory gates.
- A major that cannot pass is pinned with a dated reason in `.github/dependabot.yml` and listed in [`deploy.md`](deploy.md) section 17.

## Performance

### Page View budgets

The HTML pages paint their text before any JavaScript runs, so Lighthouse's simulated LCP is set by the bytes of the HTML, the CSS and the three preloaded fonts. Budgets are enforced in CI and are authoritative over the spec (appendix 08 section 2; `lighthouserc.json`, `Lighthouse CI` job):

| Metric | Budget |
|---|---|
| LCP | under 2 s |
| CLS | under 0.01 |
| TBT | under 200 ms |
| Fonts per page | at most 60 KB |
| HTML per page | at most 80 KB |
| CSS per page | at most 20 KB |
| JavaScript per page | at most 240 KB |

What keeps them there (subset fonts, deferred Next.js chunks, large client data in `/data/*.json` instead of layout props, small always-loaded islands): [`deploy.md`](deploy.md) section 8.

### Delivery (round 5)

- zod stays on the server (`src/content/locales.ts`); the build fails when `_zod`, `readFileSync` or `site-content` reaches a client chunk.
- Lighthouse CI warms up on a throwaway URL first.
- Unhashed files have explicit cache rules (`public/_headers`); troika fonts are content-hashed and immutable.
- The game-first boot downloads only what the first 3D frame needs: the hidden page is skipped with `content-visibility`, header links do not prefetch, room data waits for the first frame and idle.
- The boot card names the owner and offers the Classic site. The Page View never starts audio.
- Numbers against the round 5 starting point: initial JS 235.2 to 203.8 KB, bytes before the first 3D frame 1082.1 to 680.7 KB, troika fonts 139 to 58 KB.

### 3D budgets

| Gate | Budget | Where |
|---|---|---|
| Scene draw calls per floor | under 150 (L1 at most 125) | `e2e/budgets.ts` |
| Post-processing passes | at most 20 | `e2e/budgets.ts` |
| Triangles | under 30k | `e2e/budgets.ts` |
| Worst whole frame, every render pass | under 150 calls | `e2e/perf/peaks.spec.ts` |
| Shader programs | committed baseline | `e2e/perf/baseline.json` |
| JS after the 3D gate | under 450 KB gzip per tier | `bun run e2e:perf` |

- The peaks of the intro, every elevator ride and hover count too. During a ride, meshes hidden under a solid slab are skipped (`src/experience/tower/rideCull.ts`).
- Real-device frame rate is checked with `?perf=1`.
- The pixel budget (`renderBudget` in `src/experience/scene/settings.ts`) keeps desktops at DPR up to 2 within 8.3 MP and skips composer MSAA from DPR 1.5 up; touch devices render fewer pixels (DPR 1.5 on full, 1.25 on lite).
- A runtime safety net lowers DPR, then MSAA, then bloom only on sustained frame drops, at most twice a minute.
- Shader programs compile before they are needed (every other floor during the boot on the full tier, each floor as it mounts), neighbouring floors mount on idle after the first frames, and the nav grids build in about a millisecond.
- Floor content is disposed when it unmounts: `e2e/memory.spec.ts` drives 10 Lobby to Roof round trips and 5 Page View toggles (lite, reduced motion), `e2e/perf/memory-full.spec.ts` 3 round trips on the full tier with Motion Full (perf lane), and both expect the renderer's geometries, textures and shader programs back at their baseline.
- The canvas renders at most 60 frames per second (`scene/framePacer.ts`), so 90 to 144 Hz screens do not do twice the work.
- Measurements: [`perf/r5-gpu.md`](perf/r5-gpu.md).

### Elevator smoothness

- The elevator never skips its ride: each frame adds at most 1/30 s of ride time (1/20 s on steadily slow devices).
- On a first visit the car waits with closed doors (at most 1.5 s) until the new floor's shaders are compiled and its text is set.
- To check a device, open any 3D route with `?perf=1` (for example `/en?perf=1`), open the browser console (F12) and ride. Every ride prints one `[hq ride]` line with the dolly frames, car heights, biggest jump, longest frame, wait and shaders compiled while moving.
- Good: at least 12 car heights, biggest jump at most 25% of the trip, "0 shaders compiled while moving".
- The same flag shows a small overlay with FPS p50/p10, frame p95, scene and post draw calls, GPU objects, tier, DPR and pixels, and after the first ride a sixth line with that ride's summary (nothing of it runs without the flag).

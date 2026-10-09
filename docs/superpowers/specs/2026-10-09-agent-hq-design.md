# ShinyQ HQ: Agent HQ Portfolio Design

- **Date:** 2026-10-09
- **Owner:** Kurniadi Ahmad Wijaya (GitHub `ShinyQ`)
- **Status:** Approved design, pending implementation plan
- **Replaces:** the current portfolio at `kurniadi.pages.dev` (Astro) and the older `ShinyQ-Dev/ShinyQ` Next.js site

## 1. Goal

Replace a conventional, outdated portfolio with an explorable 3D world that feels like a game while still letting any visitor get the facts quickly. The site positions the owner as a **Software Engineer and AI Engineer (Azure)**: a backend and full-stack foundation (2019 to 2025: e-commerce, payments, fintech, SaaS) and enterprise AI platforms on Azure (2026), presented as one continuous craft with equal billing.

### Success criteria

1. A first-time visitor understands who the owner is and what he builds in under 10 seconds, without playing.
2. A recruiter can reach any project, the CV or contact details in under 30 seconds (through missions, ⌘K or Quick view).
3. It plays smoothly on desktop, tablet and mobile (target 60 fps on desktop and 30+ fps on mid-range phones), with a graceful fallback on weak devices.
4. Every piece of content is also reachable as a normal, indexable HTML page.
5. Content is generated from one validated data file, so adding a project needs no 3D code.

### Audience

A balanced mix of recruiters and hiring managers, consulting clients and leads, and the developer community.

### Non-goals

- No AI or LLM backend: the "guide" is deterministic selection, not chat.
- No user accounts, CMS, comments or analytics dashboards in v1.
- No external 3D models or textures in v1: all geometry is procedural.
- Story quests and a quest log are designed but deferred to v1.1 (see appendix 02).

## 2. Concept: Agent HQ

A dark, neon **AI operations tower**. The visitor pilots a small **Screen Rover** through the HQ. Each floor is a chapter of the owner's career, and each room is a piece of content. Information appears when the rover arrives at a room, not through navigation links.

### 2.1 Art direction: Neon Grid

- Near-black void (`#05050c`) with a faint indigo grid (`#6366f1` at low opacity) and a subtle radial violet vignette.
- Rooms are glowing wireframe glass boxes with very low fill opacity and neon edges. Each room has a rotating hologram that hints at its content (waveform bars for voice, a shield for security, a document stack for fraud, racks for career).
- Accent palette per zone: violet `#a78bfa`, pink `#f472b6`, green `#34d399`, amber `#fbbf24`, white `#e5e7eb`, blue `#60a5fa`, cyan `#22d3ee` (rover, elevator, highlights).
- Type: Inter for UI and body, JetBrains Mono for labels, terminal and metadata.
- Bloom postprocessing on desktop only. Animated data packets travel along floor lanes.

### 2.2 World structure: HQ Tower with a Timeline Corridor

A vertical tower of five floors connected by a glass elevator shaft. Every floor is a distinct mini-level.

| Floor | Name | Layout | Content |
|---|---|---|---|
| RF | Roof · Comms | Open deck with a beacon antenna | Contact links, CV download, socials, "hire me" beacon |
| L4 | Library | Rows of holographic shelves | Blog posts, publications and theses, Hugging Face models, talks and workshops |
| L3 | Labs | An atrium at the elevator with a **Software Wing** and an **AI Wing** running side by side as mirror halls (appendix 01 section 4), each with hero and featured pods | Case studies: software engineering projects (2019 to 2026) and AI projects (2026) |
| L2 | Career Archive | **Timeline corridor** from 2019 to 2026 with year rooms alternating left and right | Jobs, freelance, education, competitions and awards, ordered by time |
| L1 | Lobby (spawn) | Hub plaza | Profile hologram, headline stats, skills wall, certifications, mission board |

Side projects and public repos live as a "Workshop" annex at the end of the L2 corridor.

### 2.3 Pilot: Screen Rover

A small tracked rover with a terminal screen for a face, built from primitives.

- **Faces** (ASCII on the screen): idle `-_-` blinking, driving `>>>`, thinking `...`, arrived `^_^`, error or blocked `o_o`.
- **Motion:** treads roll proportionally to speed, the body tilts into turns, it kicks up dust particles when accelerating, and the antenna light blinks. On arrival it plants a small flag.
- The rover screen can show short status text such as `deploying...` or `entering L3`.

### 2.4 Navigation and controls

| Action | Desktop | Tablet | Mobile |
|---|---|---|---|
| Change floor | Mouse wheel, PageUp/PageDown, or click the elevator panel | Vertical swipe or elevator panel | Vertical swipe or elevator panel |
| Move within a floor | WASD/arrows or click to move | Tap to move, optional joystick | Tap to move. On L2 the camera is on a rail and horizontal swipe travels through time. |
| Open a room | Drive into the doorway or click the room label | Same, by tap | Same, by tap |
| Missions | Rover Terminal, ⌘K / `/` | Rover Terminal, search button | Rover Terminal, search button |
| Skip the game | Quick view button (top right) | Same | Same (menu icon) |

Any manual input cancels a running autopilot and returns control to the visitor.

### 2.5 Missions (deterministic, no AI)

Missions are data: `{ id, label, floor, targetRoomId, path? }`. Running a mission triggers a scripted sequence:

`rover drives to elevator -> elevator moves to target floor (about 0.8 s camera dolly) -> rover drives the lane path to the room -> room hologram powers up -> room panel opens -> URL updates`.

**Entry points:**

1. **Rover Terminal (primary).** Clicking the rover, or pressing Enter near it, expands its screen into a small terminal dialogue: `rover@hq:~$ ./missions`, "where should we go? ^_^", followed by numbered options (best AI work, my journey 2019 to 2026, hire / contact, read the blog, surprise me). Choose by number keys, arrow keys plus Enter, or tap. It auto-opens once on the first visit (remembered in `localStorage`), and Esc means "drive myself".
2. **Command palette (⌘K, `/`, or a search button).** A fuzzy search over every mission, room, year and action (download CV, copy email), with result type and floor badges.
3. **Elevator panel.** Always visible, for manual floor jumps.

### 2.6 Room experience

- **Glass Drawer (default for every room).** A right side panel on desktop (≥ 900 px) and a bottom sheet on tablet portrait and mobile. Tabs: Overview, Architecture, Results, Stack. It shows big metric tiles, a short "what I did" list, prev/next room navigation and a link to the full case-study page. The 3D pod stays visible and animated behind it.
- **Hologram view (hero pods only, 3 per wing).** A "View architecture" button flies the camera into the pod and dims the world. The architecture diagram assembles as an in-world hologram (nodes and edges from data) with animated packets, and metric cards float alongside. Arrow keys or swipe move between hero pods.
- **Rover README (easter egg).** Pressing `t` in any room shows the same content as a terminal `cat README.md` view: an ASCII architecture diagram, bar-chart results and keyboard shortcuts.

### 2.7 HUD (HTML overlay, not WebGL)

- Top left: profile card (name, title, current floor, rooms visited `n/N`).
- Top right: Quick view and the ⌘K search button.
- Side: elevator panel (RF, L4, L3, L2, L1) with the current floor highlighted.
- Bottom: context hint for the detected input type (pointer coarse vs fine).
- Room drawer, rover terminal and command palette are all HTML: accessible, selectable and translatable.

### 2.8 First-run flow

1. Boot overlay: short terminal-style boot lines and a **Boot rover** button (skippable, and skipped automatically on return visits).
2. The camera reveals the tower from outside, then drops into the L1 Lobby.
3. The rover powers on (face `^_^`) and the Rover Terminal auto-opens with missions.
4. Choosing a mission or pressing Esc starts the experience.

## 3. Content

### 3.1 Sources and evidence

All content comes from the consolidated evidence dossier compiled from local sources (career-intelligence knowledge base, work repositories, CVs, LinkedIn export and dump, certifications page, GitHub, and the current live site). The dossier lives outside this repo in the owner's session folder. Only the **public-safe** dataset is committed.

### 3.2 Public-safety rules (binding)

Owner decisions of 2026-10-09 (see appendix 07, section 7):

- **Allowed:** client names (e.g. the bank, automotive, mining and food clients), freelance client names, former and current employer names, and pre-2026 metrics as stated in the newest CV (conservative values, labelled "self-reported" where no artifact exists).
- **Never publish:** internal product codenames and private repository names (use descriptive public titles), cloud resource names, phone numbers, addresses, ID numbers, money amounts, salary or review text, and the Master's degree.
- 2026 metrics must be VERIFIED or STRONGLY INFERRED and phrased honestly ("in a controlled A/B test", "offline evaluation", "modeled").
- Work is framed as "designed, directed, reviewed and shipped" (agent-assisted delivery), never as hand-written line counts.
- No em dashes in any copy.

### 3.3 Content model

One file, `content/site-content.json` (all user-facing text localized as `{ en, id }`), validated at build time by zod schemas in `src/content/schema.ts`. Top-level shape:

```ts
{
  profile, stats[], skills[], certifications[],
  floors: {
    careerArchive: { entries[] },        // grouped into year rooms at runtime
    labs: { pods[] },                    // Pod.wing = "software" | "ai"
    library: { posts[], publications[], talks[] },
    roof: { contact, availability, cv }
  },
  sideProjects[], publicRepos[], missions[]
}
```

The full type definitions are in [appendix 06](agent-hq/06-data-contracts.md), and the floor-by-floor content is in [appendix 07](agent-hq/07-content-map.md).

Rooms, pods, year rooms, missions and ⌘K entries are all **generated from this data**. Blog posts are MDX files in `content/blog/` (`slug.en.mdx`, `slug.id.mdx`).

### 3.4 Open content decisions

All nine owner decisions were resolved on 2026-10-09 and are recorded in [appendix 07, section 7](agent-hq/07-content-map.md#7-owner-decisions-resolved-2026-10-09).

## 4. Architecture

### 4.1 Stack

| Concern | Choice |
|---|---|
| Framework | Next.js (App Router), TypeScript strict, `output: "export"` (fully static) |
| 3D | three.js via React Three Fiber, `@react-three/drei`, `@react-three/postprocessing` (bloom, desktop only) |
| State | zustand store |
| Styling | Tailwind CSS for the HUD and all HTML pages |
| Content | JSON plus MDX, zod validation at build time |
| i18n | `next-intl`, locales `en` and `id`, locale-prefixed static routes |
| Audio | Web Audio API wrapper, lazy-loaded, muted by default |
| Analytics | Cloudflare Web Analytics (cookieless) |
| CV PDF | Rendered from the `/cv` route with Playwright at build time, one per locale |
| Testing | Vitest (unit), Playwright (e2e and visual at 3 viewports) |
| Package manager | Bun |
| Hosting | Cloudflare Pages (`kurniadi.pages.dev`), deployed by GitHub Actions |

### 4.2 Routes

All routes are prefixed with the locale (`/en/...`, `/id/...`); `/` redirects by browser language. Every route renders meaningful HTML without WebGL, then mounts the 3D experience client-side when supported. Full URL scheme: appendix 06.

| Route | Purpose |
|---|---|
| `/` | Tower experience (spawn in L1) plus a server-rendered summary for SEO |
| `/labs` and `/labs/[slug]` | Labs overview and pod case studies (both wings); with 3D it opens L3 at that pod with the drawer open |
| `/journey` and `/journey/[slug]` | Career timeline and entries (L2) |
| `/library` and `/blog/[slug]` | Blog and publications (L4) |
| `/contact` | Roof content |
| `/cv` | Printable CV page plus PDF download |
| `/quick` | Quick view: all content on one page |

### 4.3 Module boundaries

```
src/
  app/                  routes (static pages, SEO, Quick view)
  content/              schema.ts (zod), load.ts (typed accessors), selectors
  experience/
    Experience.tsx      canvas root, GPU tier gate, suspense
    tower/              Tower.tsx, Elevator.tsx, floors/{Lobby,CareerArchive,Labs,Library,Roof}.tsx
    rooms/              Room.tsx, Pod.tsx, YearRoom.tsx, holograms/*
    rover/              Rover.tsx (mesh + face screen), useRoverController.ts
    camera/             rigs: follow, rail (L2), elevator dolly, hologram fly-in
    input/              intents.ts, keyboard, pointer, touch, joystick, wheel/swipe
    missions/           runner.ts (scripted sequences), paths.ts
    fx/                 packets, grid, bloom, particles
  hud/                  ProfileCard, ElevatorPanel, RoverTerminal, CommandPalette, RoomDrawer, QuickView, Hints
  store/                useHQStore.ts (floor, rover, activeRoom, mission, visited, ui)
  lib/                  url-sync, gpu-tier, reduced-motion, analytics stub
```

Rules:

- Floors never read raw DOM events. They consume **intents** (`move`, `goto`, `elevator`, `open`, `cancel`) from the input layer.
- The HUD and the 3D scene communicate only through the store.
- The mission runner is a pure, testable sequence of steps driven by the store.
- The URL is synchronized with `{ floor, activeRoom }`, so deep links restore the state.

### 4.4 Performance and fallbacks

- **GPU tier check** on load: `full` (bloom, all effects), `lite` (no bloom, fewer lights and particles, DPR ≤ 1.5), `static` (no WebGL; HTML-only experience with the same content and navigation).
- Only the current floor and its neighbours render in full detail; other floors are low-cost silhouettes.
- Instanced meshes for repeated geometry; procedural geometry only; lazy-loaded 3D chunks.
- `prefers-reduced-motion`: no camera sway, instant elevator cuts, no particles.
- Budgets: LCP < 2.5 s on 4G mid-range mobile, initial JS < 350 KB gzipped before 3D chunks, 3D chunk < 600 KB gzipped.

### 4.5 Accessibility

- Quick view and all routes are fully navigable with keyboard and screen readers.
- The 3D canvas has an accessible description, and focusable HUD controls mirror every in-world action.
- Color contrast is AA for all HUD text over glass panels.

### 4.6 Error handling

- A WebGL context loss or crash falls back to the `static` tier with a small notice.
- Content validation failures fail the build, not runtime.
- Missing optional assets render placeholders, never broken images. All images are committed or served from stable URLs; no expiring links, which is the failure mode of the current site.

## 5. Testing

- **Unit (Vitest):** content schema and public-safety lint (blocklist of private names and codenames), selectors, mission runner sequences, URL sync, input intent mapping.
- **E2E (Playwright):** boot flow, each mission end to end, ⌘K search, elevator, Quick view, deep links, static-tier fallback. Screenshots at 1440×900, 1024×1366 and 390×844.
- **Performance:** Lighthouse CI on `/` and `/quick` against the budgets.
- CI runs typecheck, lint, unit and e2e on every PR, and deploys a preview to Cloudflare Pages.

## 6. Delivery workflow

- Public repo `ShinyQ/ShinyQ-HQ`, local clone at `~/Workspace/Personal/ShinyQ-HQ`.
- Each working session ends with a commit and push to GitHub.
- `main` deploys to production on Cloudflare Pages. PRs get preview deployments.

### Build phases

| # | Phase | Visible outcome |
|---|---|---|
| 0 | Scaffold, CI, content schema, public-safe dataset, Quick view and static routes | The site is live with real content as plain pages |
| 1 | Tower shell, elevator, camera rigs, input layer, store | Ride the elevator through five neon floors |
| 2 | Screen Rover and L1 Lobby (profile hologram, stats, mission board) | Drive around the Lobby |
| 3 | L2 Career Archive corridor (rail camera, year rooms) | Time-travel from 2019 to 2026 |
| 4 | L3 Labs (Software Wing and AI Wing), Glass Drawer, hologram view for hero pods | Software and AI work as explorable pods |
| 5 | L4 Library, Roof, Rover Terminal, ⌘K, mission runner | Every mission works end to end |
| 6 | Polish: GPU tiers, a11y, SEO, performance budgets, README easter egg | Launch-ready on all devices |

## 7. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Visitors find navigation slow | Rover Terminal auto-opens, ⌘K, Quick view, deep links |
| Poor performance on phones | GPU tiers, neighbour-only rendering, no external models, budgets in CI |
| Private client information leaks | Public-safety lint in tests plus a curated public-only dataset |
| Content goes stale again | Single data file, rooms generated from data, no expiring asset URLs |
| The neon look feels generic | A distinctive tower structure, the Screen Rover character and terminal personality |

## 8. Product decisions

| Topic | Decision |
|---|---|
| Positioning | Software Engineer and AI Engineer (Azure), equal billing |
| Language | Bilingual EN / ID with a HUD toggle; English default |
| Sound | Ambient sound and UI blips, muted by default, toggle persists |
| Analytics | Cloudflare Web Analytics, cookieless, no consent banner |
| Domain | Launch on `kurniadi.pages.dev`; repoint `kurniadi.dev` DNS later |
| CV | Generated from site data at build time (EN and ID), so it is always in sync and public-safe |
| Availability | Roof beacon: "Open to interesting software and AI engineering conversations" |
| Guide | Deterministic missions only, no AI backend |

## 9. Appendices

Detailed, implementation-level specs. Where an appendix and this document disagree, the appendix wins for its topic.

| # | Appendix | Covers |
|---|---|---|
| 01 | [World and layout](agent-hq/01-world-and-layout.md) | Tower constants, floor-by-floor geometry, room placement, intro |
| 02 | [Interaction and states](agent-hq/02-interaction-and-states.md) | State machine, transitions, mission runner and catalog, Rover Terminal, palette, drawer, hologram, README |
| 03 | [Rover, camera and input](agent-hq/03-rover-camera-input.md) | Rover geometry, faces, movement tuning, camera rigs per breakpoint, input intents |
| 04 | [HUD, responsive and i18n](agent-hq/04-hud-responsive-i18n.md) | Breakpoints, HUD layout per device, Quick view, EN/ID, copy guidelines |
| 05 | [Visual and audio tokens](agent-hq/05-visual-audio-tokens.md) | Colors, materials, lighting, bloom, typography, motion, sound list |
| 06 | [Data contracts](agent-hq/06-data-contracts.md) | Content types, store shape, room IDs, URL scheme, analytics |
| 07 | [Content map](agent-hq/07-content-map.md) | What goes on every floor and in every room, pre-launch decisions |
| 08 | [Quality and acceptance](agent-hq/08-quality-acceptance.md) | GPU tiers, browser support, performance budgets, test strategy, acceptance per phase |

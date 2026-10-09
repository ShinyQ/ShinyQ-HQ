# Missions HUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the mission system HUD (mission runner, Rover Terminal, command palette) so every mission in the catalog works today on the static HTML pages, and the 3D phases can plug in later through one interface.

**Architecture:** A pure, framework-free runner executes `MissionStep`s against an injected `MissionHost`. A static host maps steps to locale routes (appendix 06 URL scheme) and navigates with the Next router; the 3D session will implement the same interface on top of its store and scene. A serializable HUD index (missions, room catalog, years) is built on the server from `content/site-content.json` and passed to client HUD components, so neither zod nor the full dataset ship to the browser.

**Tech Stack:** Next.js 16 (static export), React 19, next-intl 4, Tailwind 4, Vitest 5 + Testing Library + jsdom, Playwright + `@axe-core/playwright`. No fuzzy-search dependency: a small scorer in `src/hud/search.ts`.

## Global Constraints

- No em dashes (U+2014) anywhere. Ranges are written "X to Y".
- Public repo: no private names, codenames, money, phone numbers. Keep `tests/content/safety.test.ts` green.
- Content is data: rooms, years and missions come from `content/site-content.json`; nothing hardcoded in components.
- Bilingual: every UI string in `messages/en.json` and `messages/id.json` with identical keys; content strings are `{ en, id }`.
- Static export: no server runtime, no API routes. HUD code is client-only and must never replace page content.
- Do not touch `src/store`, `src/experience/input` or 3D scene code (owned by the Phase 1-2 session).
- Do not use port 4310. E2E uses `E2E_PORT` (default 4173).
- Touch targets at least 44 px (`min-h-11`). Glass tokens from `globals.css`. Terminal colors from appendix 05 (`#03140e`, `#34d399`, `#ecfdf5`).

---

## File map

| File | Responsibility |
|---|---|
| `src/experience/missions/host.ts` | `MissionHost` interface, `StepContext`, `PaletteFilter`, `MissionStatus` types |
| `src/experience/missions/rooms.ts` | Pure room catalog from `SiteContent`: room ids, floors, static paths, search keywords, surprise weights; `floorPath`, `roomFromPath` |
| `src/experience/missions/surprise.ts` | `pickSurprise(candidates, visited, random)` weighted to hero pods |
| `src/experience/missions/runner.ts` | `createMissionRunner({ host, missions, rooms, visited, random })`: `start`, `goTo`, `cancel`, `state`, `subscribe` |
| `src/experience/missions/staticHost.ts` | `createStaticHost({ locale, rooms, navigate, onSay, onPalette })` |
| `src/hud/index-data.ts` | Server-side `buildHudIndex(content)` producing the serializable `HudIndex` |
| `src/hud/events.ts` | DOM custom events `hq:palette` / `hq:terminal` so any button (header, 3D scene) can open the HUD |
| `src/hud/recent.ts` | Recent rooms in `localStorage["hq:recent"]` (static tier stand-in for the store's `visited`) |
| `src/hud/greeting.ts` | Time-of-day greeting key |
| `src/hud/search.ts` | Fuzzy scorer and grouped palette search |
| `src/hud/RoverTerminal.tsx` | Terminal dialogue (client) |
| `src/hud/CommandPalette.tsx` | Command palette (client) |
| `src/hud/MissionHud.tsx` | Client wiring for static pages: static host, runner, terminal, palette, rover toast, recent tracking |
| `src/hud/HudLaunchers.tsx` | Header buttons: Missions and search (`⌘K`) |
| `src/app/[locale]/layout.tsx`, `src/components/SiteHeader.tsx` | Mount `MissionHud` and launchers |
| `messages/{en,id}.json` | `hud` namespace |
| `tests/unit/missions-*.test.ts`, `tests/unit/search.test.ts` | Runner, surprise, static host, rooms, search |
| `tests/hud/*.test.tsx` | Terminal and palette keyboard flows and focus |
| `e2e/missions.spec.ts` | ⌘K to a pod, terminal mission, axe |

## Interfaces (shared by all tasks)

```ts
// host.ts
export type PaletteFilter = "pods" | "rooms" | "posts";
export type MissionStatus = "idle" | "running" | "done" | "cancelled";
export interface StepContext { signal: AbortSignal; missionId: string }
export interface MissionHost {
  readonly isStatic: boolean;
  elevator(floor: FloorId, ctx: StepContext): Promise<void>;
  driveTo(target: RoomId | Vec2, ctx: StepContext): Promise<void>;
  openRoom(room: RoomId, tab: DrawerTab | undefined, ctx: StepContext): Promise<void>;
  say(text: LocalizedText, ms: number | undefined, ctx: StepContext): Promise<void>;
  openPalette(filter: PaletteFilter | undefined, ctx: StepContext): Promise<void>;
  finish?(status: Exclude<MissionStatus, "idle" | "running">, missionId: string): void;
}

// rooms.ts
export interface RoomInfo {
  id: RoomId; floor: FloorId; slug: string;
  kind: "lobby" | "career" | "workshop" | "pod" | "post" | "shelf" | "roof";
  title: LocalizedText; subtitle?: LocalizedText; keywords: string[];
  path: string;        // locale-less route for "open", e.g. "/labs/voice-ai-contact-center"
  floorPath: string;   // locale-less route for "drive" (floor context), e.g. "/journey#y2019"
  external?: string;   // posts hosted elsewhere
  tier?: Tier; wing?: Wing; year?: number;
  surpriseWeight: number; // 0 = never picked
}

// runner.ts
export interface MissionState { missionId: string | null; step: number; status: MissionStatus }
export interface MissionRunner {
  readonly state: MissionState;
  start(missionId: string): Promise<MissionStatus>;
  goTo(room: RoomId, tab?: DrawerTab): Promise<MissionStatus>;
  cancel(): void;
  subscribe(listener: (s: MissionState) => void): () => void;
}
```

## Tasks

### Task 1: Foundations (types, catalog, test setup, messages)
- [ ] Add `host.ts`, `rooms.ts` (`buildRoomCatalog`, `floorPath(floor)`, `roomHref(room, tab)`, `roomFromPath(path, rooms)`), `surprise.ts`.
- [ ] Vitest: include `tests/**/*.test.{ts,tsx}`, React plugin-free JSX via esbuild/oxc `react-jsx`, jsdom per file (`// @vitest-environment jsdom`).
- [ ] Unit tests: every mission step room id exists in the catalog; route mapping per floor; `roomFromPath` round trip; surprise prefers unvisited and hero pods (seeded random), falls back to all when everything is visited.
- [ ] Add the `hud` namespace to both message files.
- [ ] Commit `feat: mission host interface and room catalog`.

### Task 2: Mission runner
- [ ] Tests first (`tests/unit/missions-runner.test.ts`) with a recording fake host: each catalog mission produces the exact host call sequence; `surprise` expands to elevator, drive, open of the picked room; `cancel()` mid-step resolves `start` with `cancelled`, aborts the signal, stops further steps; starting a second mission cancels the first; `subscribe` sees `running` then `done`; unknown id rejects; `goTo` runs elevator, drive, open; host errors resolve `cancelled` with state reset.
- [ ] Implement `runner.ts`: each step races the host promise against the abort signal.
- [ ] Commit `feat: deterministic mission runner`.

### Task 3: Static host
- [ ] Tests: `best-ai` navigates once to `/en/labs/voice-ai-contact-center`; `journey` navigates to `/en/journey#y2019` before `say` fires `onSay`; `projects` navigates to `/en/labs` then calls `onPalette("pods")`; `hire` goes to `/id/contact` for locale `id`; `cv` goes to `/en/cv`; architecture tab maps to `#architecture`; external posts map to `/library#posts`; cancelled missions do not navigate.
- [ ] Implement lazy navigation: `elevator`/`driveTo` set a pending path, `openRoom` navigates immediately, `say`/`openPalette`/`finish("done")` flush the pending path first.
- [ ] Commit `feat: static mission host`.

### Task 4: Command palette (parallel with Task 5)
- [ ] `search.ts`: normalized (lowercase, diacritics stripped) subsequence scorer with prefix, word-start and contiguity bonuses; multi-token AND; fields weighted title 3, keywords 1.5, subtitle 1; both languages searched.
- [ ] Tests: "voice" ranks the voice AI pod first; "2024" returns the 2024 year first; "unduh" (ID) finds Download CV; "fastapi" returns pods using FastAPI; typo-tolerant subsequence "vcai" finds the voice pod; empty query returns missions then recent.
- [ ] `CommandPalette.tsx`: modal dialog (`role="dialog"`, `aria-modal`), combobox input with `aria-activedescendant`, listbox groups (Missions, Rooms, Years, Actions) with floor badges, Up/Down, Enter, Esc, Tab/Shift+Tab between groups, filter chip (Backspace on empty query clears it), focus restore on close, full-screen sheet below 640 px, centered 640 px modal above.
- [ ] Testing Library tests for open, typing, keyboard navigation, Enter runs the item, Esc restores focus.
- [ ] Commit `feat: command palette`.

### Task 5: Rover Terminal (parallel with Task 4)
- [ ] `greeting.ts`: hour to `morning | afternoon | evening | night` (EN) and the same keys in ID copy.
- [ ] `RoverTerminal.tsx`: dialog with prompt `rover@hq:~$ ./missions`, greeting, "where should we go? ^_^", options 1 to 8 (best-swe and best-ai first, order alternating per visit), "drive myself" last; keys 1 to 8, arrows plus Enter, tap, Esc; 12 ms per character typing effect, full text on second open or reduced motion; screen-reader copy is the full text; bottom sheet on mobile; auto-open once (`localStorage["hq:terminal-seen"]`) when `autoOpen` is set.
- [ ] Testing Library tests: number key runs mission, arrows plus Enter, Esc closes and restores focus, reduced motion shows full text immediately, auto-open only once.
- [ ] Commit `feat: rover terminal`.

### Task 6: Mount on static pages
- [ ] `buildHudIndex(content)` on the server in the locale layout; `MissionHud` client component creates the static host with `useRouter().push`, the runner, recent tracking, the rover toast (`aria-live="polite"`), and global shortcuts (⌘K/Ctrl+K, `/` outside inputs).
- [ ] `HudLaunchers` in `SiteHeader`: Missions button (opens terminal) and search button with `⌘K` hint.
- [ ] Terminal auto-opens on the Lobby route only, on the first visit.
- [ ] Commit `feat: mount missions HUD on static pages`.

### Task 7: E2E, axe, docs, PR
- [ ] `e2e/missions.spec.ts`: Ctrl+K, type "voice", Enter lands on the pod page; Missions button, press `5` (hire) lands on `/en/contact`; journey mission shows the rover toast on `/en/journey`; axe on the Lobby with terminal open and with palette open (no serious or critical violations); existing static route tests stay green with the auto-open terminal (seed `hq:terminal-seen`).
- [ ] Update AGENTS.md (HUD folder, Lobby room ids, `MissionHost`, `hq:recent`, `hq:terminal-seen`).
- [ ] Run `bun run typecheck && bun run lint && bun run test && bun run build && bun run e2e`, push, open the PR "Missions: runner, Rover Terminal and command palette".

## Decisions and assumptions

- **Lobby and shelf room ids** (not in appendix 06): `L1:profile`, `L1:stats`, `L1:skills`, `L1:certifications`, `L2:workshop`, `L4:publications`, `L4:talks`. They map to existing page anchors.
- **`RF:cv`** opens `/{locale}/cv` (URL scheme row "CV"). **External posts** open `/{locale}/library#posts` on the static tier (no popups from scripted steps).
- **Static navigation is lazy**: only the final destination (or the page a `say`/`palette` step needs) is loaded, so a mission never bounces through intermediate pages.
- **Recent rooms** on static pages use `hq:recent` because the store (with persisted `visited`) belongs to the Phase 1-2 session. `MissionHud` takes `visited` as an input so the 3D host can pass store state later.
- **Toggle sound** is only listed in the palette when a sound handler is provided (the static tier has no audio yet).

# B1 Living Machine, PR B1-1: The Detailed Story Implementation Plan

Status: shipped in #290 (d05f859), 2026-10-22

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The B1 build story is detailed and current (rounds to today, a full blueprint, the multi-agent workflow, the
current CI, refreshed numbers) and the two dark bays open as real stations: Rover's Brain and Rejected Designs.

**Architecture:** Content first (`content/build-story.json` validated by `BuildStorySchema`), then the three surfaces
that read it: the B1 drawers (`content/room-views/engine.ts` to `RoomEngine` to `EngineBody`), the Classic
`/{locale}/build` sections, and the 3D floor (`floors/engine/layout.ts`, `scenery.ts`). Seven stations everywhere;
`comingSoon` disappears. Spec: `docs/superpowers/specs/2026-10-22-b1-living-machine-design.md` section 2.

**Tech Stack:** Next.js 16 static export, zod, next-intl, React Three Fiber, Vitest, Playwright, Bun.

## Global Constraints

- No em dash (U+2014) anywhere. No first person in titles. Titles in Title Case (`isTitleCase`).
- Never name a client company (C3); the blocklist is gone (#288), so check new text by hand against the list kept
  outside the repo. No hostname, resource id or gateway id.
- Every user-facing string is `{ en, id }`; UI strings in `messages/en.json` and `messages/id.json` with identical keys.
- `EngineBody` uses only utility classes the site already ships (CSS budget 20,480 B).
- B1 chunk cap 16 KB gzip (4.8 KB now); B1 under 100 scene calls; no new draw call, material or shader program.
- B1 stays hidden for locked visitors (no chunk, no drawer data, no DOM).
- Commits: conventional, `rtk git`.

## File map

| File | Change |
|---|---|
| `content/generated/build-facts.json` | regenerated |
| `content/build-story.json` | rounds r9 to r13, `unlinkedPrs` 288, blueprint, agents, gates, brain, rejected; `comingSoon` removed |
| `src/content/build-story.ts` | seven `STATION_IDS`, no `COMING_SOON_IDS`, gate `where`, brain and rejected schemas, agents steps max 10 |
| `tests/content/build-story.test.ts` | 13 rounds, gate `where`, ideas, brain diagram, no `comingSoon` |
| `src/content/room-views/{engine,types}.ts`, `src/hud/drawer/EngineBody.tsx` | brain diagram and steps, rejected ideas |
| `src/components/build/BuildSections.tsx`, `src/app/[locale]/build/page.tsx` | `BrainSection`, `RejectedSection`, no `ComingSoonSection` |
| `messages/{en,id}.json` | `build.steps`, `build.tried`, `build.whyDropped`, `build.prLink`; no `build.comingSoon*`, no `engine.soon`; `engine.desc` seven stations |
| `src/experience/floors/engine/{layout,scenery}.ts`, `src/content/experience-floors.ts`, `src/experience/Experience.tsx` | all seven bays are stations; Brain and Rejected props |
| `content/ask/site-build.json` | seven stations, Codex |
| tests: `engine-layout`, `engine-scenery`, `engine-views`, `build-page`, `diagram-layout`, `tests/ask/pack.test.ts`; e2e `engine-room.spec.ts`; `scripts/b1-shots.ts` | seven stations |
| docs: `docs/agents/floor-b1-engine-room.md`, `docs/features.md`, `docs/decisions/2026-10-22-b1-living-machine-story.md` | current state |

### Task 1: Content and schema (controller)

**Files:** `content/build-story.json`, `content/generated/build-facts.json`, `src/content/build-story.ts`, `tests/content/build-story.test.ts`

**Produces:**
- `STATION_IDS = ["blueprint","timeline","agents","gates","dashboard","brain","rejected"] as const`; `StationId`.
- `BuildGate.where: "ci" | "nightly" | "local"`; `local` gates have `jobs: []` and `required: false`.
- `story.stations.brain: { title, summary, architecture: Architecture, steps: { title, text }[] (5 to 10) }`.
- `story.stations.rejected: { title, summary, ideas: { id, title, tried, reason, pr?: number }[] (8 to 14, unique ids) }`.

- [ ] Write the failing tests: 13 rounds; every gate's `where` agrees with its jobs (local: none, else at least one
  real `ci.yml` job); the brain diagram lays out on the phone and drawer presets within `maxWidth`; 8 to 14 ideas with
  unique ids and Title Case titles; titles list covers brain steps and ideas.
- [ ] Run `bunx vitest run tests/content/build-story.test.ts`: fails.
- [ ] Update the schema, write the content (spec 2.1 and 2.2), `bun scripts/build-facts.ts --write`.
- [ ] Run the test file and `bun run typecheck`: the test passes; type errors remain only in the consumers (Tasks 2, 3).
- [ ] Commit `feat(build): detailed build story, Rover's Brain and Rejected Designs content (B1-1)`.

### Task 2: Drawers and the Classic page

**Files:** `src/content/room-views/types.ts`, `src/content/room-views/engine.ts`, `src/hud/drawer/EngineBody.tsx`,
`src/components/build/BuildSections.tsx`, `src/app/[locale]/build/page.tsx`, `src/lib/build-page.ts` (doc comment only),
`messages/en.json`, `messages/id.json`, `tests/unit/engine-views.test.ts`, `tests/unit/build-page.test.ts`,
`tests/unit/diagram-layout.test.ts`, e2e for `/build` if one exists (`grep -rl "/build" e2e`).

**Interfaces:**
- Consumes Task 1's schema.
- Produces `RoomEngine.station: EngineStationId` (seven ids), `RoomEngine.diagram` for blueprint and brain,
  `RoomEngine.ideas?: { id: string; title: string; tried: string; reason: string; pr?: { n: number; href: string } }[]`,
  `RoomEngine.labels` gains `tried`, `whyDropped`.

- [ ] Tests first: `engine-views` expects seven views in bay order, brain has `engine.diagram` (both layouts) and a
  `steps` section, rejected has `engine.ideas` with 8 to 14 items and links for those with a PR; `diagram-layout`
  adds `["build-story:brain", story.stations.brain.architecture]`.
- [ ] `engine.ts`: `content.brain = { engine: { diagram: ... same three-part build as blueprint ... }, sections: [{ title: t("steps"), bullets: steps.map(s => `${s.title}: ${s.text}`) }] }`;
  `content.rejected = { engine: { ideas }, sections: [] }`.
- [ ] `EngineBody`: render `e.ideas` as an `<ol className="space-y-4">` of items (`h3` title, `p.text-sm.text-ink-2`
  tried, `p.text-sm.text-ink` with `span.label.text-ink-3` "Why dropped" and the reason, an optional PR link styled
  like the timeline's `PR` class). Reuse `Blueprint` for any `e.diagram`.
- [ ] Classic: `BrainBody` (`ArchitectureDiagram` plus a numbered steps list like `AgentsBody`), `RejectedBody` (a
  `pv-rows` list: title, tried, reason, PR link with `ExternalLink`), sections `brain` and `rejected`; delete
  `ComingSoonSection`; the table of contents is just `STATION_IDS`.
- [ ] Messages: add `build.steps` ("How it answers" / "Cara menjawab"), `build.tried` ("Tried" / "Dicoba"),
  `build.whyDropped` ("Why it was dropped" / "Alasan dibatalkan"), `build.prLink` ("Pull request #{n}" / "Pull request #{n}");
  delete `build.comingSoon`, `build.comingSoonTitle`, `build.comingSoonIntro`.
- [ ] Run `bunx vitest run tests/unit/engine-views.test.ts tests/unit/build-page.test.ts tests/unit/diagram-layout.test.ts tests/content tests/unit/messages*`, then `bun run typecheck`.
- [ ] Commit `feat(build): Rover's Brain and Rejected Designs drawers and Classic sections (B1-1)`.

### Task 3: The 3D floor

**Files:** `src/experience/floors/engine/layout.ts`, `src/experience/floors/engine/scenery.ts`,
`src/content/experience-floors.ts`, `src/experience/types.ts` (EngineData comment), `src/experience/Experience.tsx`
(labels), `messages/{en,id}.json` (`engine.soon` removed, `engine.desc`), `tests/unit/engine-layout.test.ts`,
`tests/unit/engine-scenery.test.ts`, `e2e/engine-room.spec.ts`, `scripts/b1-shots.ts`.

**Interfaces:**
- `ENGINE_STATIONS = ENGINE_BAYS` (seven); `isEngineStation` stays (always true for a bay id) or is removed with its callers;
  every `EngineBay` has `lit: true`, a `room` and a `pad`. `EngineLabels = { title, subtitle }`.

- [ ] Tests first: seven doors, spurs and zones; every bay has a pad; scenery gives brain and rejected screens and a
  front strip; no "Coming soon" sign; draw-call structure unchanged (same four instanced or merged draws).
- [ ] Brain props: a server column (two 1.2 x 4 x 1.2 boxes) beside a back-wall `PanelInstance` grid of six small
  cyan "chunk" screens and one violet answer screen. Rejected props: a scrap rack (a low box) with four tilted, dim
  (`ENGINE_TONES.dim`) panels and one amber panel.
- [ ] Remove the dark-bay branches (`labels.soon`, dim signs). Signs: every bay amber.
- [ ] e2e: `engine-room.spec.ts` iterates `ENGINE_STATIONS` (seven drawers); update any count of five.
- [ ] Run the unit tests, `bun run typecheck`, then `bun run e2e:changed` locally.
- [ ] Commit `feat(b1): Rover's Brain and Rejected Designs bays open as stations (B1-1)`.

### Task 4: Ask note, docs, verification (controller)

- [ ] `content/ask/site-build.json`: "Its seven stations complement the public /build page (architecture, build
  rounds, AI-agent workflow, quality gates, figures, how Rover answers, rejected designs)"; agents "GitHub Copilot,
  Claude Code and Codex". `tests/ask/pack.test.ts` passes; `tests/ask/golden.json` unchanged unless a golden cites it.
- [ ] Docs: `docs/agents/floor-b1-engine-room.md` (seven stations, no dark bays), `docs/features.md` B1 section,
  decision file `docs/decisions/2026-10-22-b1-living-machine-story.md`.
- [ ] `bun run verify:quick`, `bun run e2e:changed`, B1 chunk bytes (`E2E_PORT=<port> bunx playwright test e2e/perf/bytes-3d.spec.ts` with `PERF=1`) under 16 KB.
- [ ] Hand check: no client name in the diff (`git diff main | grep -E -f <list>`), no em dash.
- [ ] Send the Rejected list to the owner's coordinator; push; open a ready-for-review PR; merge after approval and green CI.

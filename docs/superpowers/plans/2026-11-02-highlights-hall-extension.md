# L1 Highlights Hall Extension Implementation Plan

Status: in review

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Owner decision: [2026-11-02](../../decisions/2026-11-02-highlights-hall-extension.md) (Proof Park cancelled: "lets just extend the highlight hall"). Builds on #390 (L1 as one 93 x 86 u rectangle). Replaces the Proof Park PRs 3 and 4 of [`2026-11-02-l1-proof-park-design.md`](../specs/2026-11-02-l1-proof-park-design.md).

**Goal:** The Highlights Hall runs the slab's full depth with three new stations in the gallery's existing shapes, Wins, Now and Results; the strip west of the Agent Office is lit floor; every park name, room and link goes.

**Architecture:** `HIGHLIGHT_STATIONS` gains `wins`, `now` and `results`, so rooms, doors, spurs, deep links, point-and-go and camera zones follow from the station list. Shapes generalize in `hallGallery.ts` (a pedestal face per pedestal station, monoliths and lit arches per station) and join the hall's merged meshes, stage instances and text batch. Data comes from `src/content/highlights.ts` (pure, from `awards`, the case studies and the timeline) into `ExperienceData.highlights` and the room views.

**Tech Stack:** TypeScript, React Three Fiber, next-intl, Vitest, Playwright, Bun.

## Global Constraints

- No em dashes; no first person in titles or signs; every user-facing string a message key in `messages/en.json` and `messages/id.json`.
- Every number from the data: awards, verified case study results, timeline entries.
- No new chunk or shader program; L1 under 125 scene calls (the hall in three culled parts); ride peaks at or under main; memory flat; reduced motion still.

---

### Task 1: Layout
- [x] `hallLayout.ts`: the hall to the floor's south edge, the plaza to z 50, the seven station footprints, the office road (`hallOfficeRoad`), the routing spine and approach roads (`network`) and the drawn network (`drawn`); `parkLayout.ts` removed; config wiring (`HALL.link` in `roadZone`).
- [x] Tests: `l1-outline-layout`, `highlights-layout` (space rules, routes along the spine, the loop from the office).

### Task 2: Data and drawers
- [x] `src/content/highlights.ts`: `winTiers`, `winCounts`, `beforeAfterResults`, `currentRoles`; `ExperienceData.highlights` (`wins`, `results`, `now`).
- [x] Room views (wins sections, now and results cards), catalog entries, message keys (EN and ID).

### Task 3: Scenery
- [x] `hallGallery.ts`: `winsFace`, `winsTiles`, `monoliths(n, "results")`, `nowArch`, the south fountain, lights and camera columns; `hallSolids.ts`, `hallStage.ts` (tile tones, both portals), `hallContent.ts` (texts), `HighlightsHall.tsx`.
- [x] West strip (`westStripLayout.ts`, `WestStrip.tsx`).

### Task 4: Gates and docs
- [x] Unit tests (`highlights-stations`, hall content, gallery, room views, catalog).
- [x] e2e (`highlights.spec` deep links and drawers for the new stations), perf poses, visual gate.
- [x] Decision, `floor-l1-lobby.md`, `features.md`, folder layout.

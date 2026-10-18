# L4 Timeline Label Sweep as a Unit Test Implementation Plan

Status: shipped in #219.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the L4 timeline label overlap sweep (`e2e/library-labels.spec.ts`, 354 s desktop plus 72 s phone per CI run) as a Vitest that computes the label layout without rendering, so it runs on every PR in about a second with the same assertions.

**Architecture:** The per-frame work of `useLibrarySignPlacement` and `useEndSignPlacement` (project every plate, add the rover's and the end plaza's boxes, run the placement rule) moves into pure functions in `src/experience/floors/library/decor/signFrame.ts`; the hooks call them, so the test and the scene run the same code. The test builds the real L4 layout and signs from the dataset, replays the e2e drive (`roadRoute` per hop, view zones through `zoneAt`, `updateZone` and `stepOrbit`), poses a `PerspectiveCamera` with `followPose` and `clampCamera` like `CameraDirector`, and audits each pose with the e2e's checks at several orbit angles of the end plaza.

**Tech Stack:** Vitest (node), three.js math only, Bun.

## Global Constraints

- No em dashes anywhere (code, docs, commits, PR text).
- Behavior of the scene does not change: the hooks keep their scratch buffers, constants and probe output.
- The rendered spec stays in the suite unchanged in this PR (a later PR moves it to the nightly only, after this one lands).
- One PR; conventional commits; `bun run verify:quick` and `bun run e2e:changed` before pushing.

## Tasks

### Task 1: Pure sign frames

**Files:**
- Create: `src/experience/floors/library/decor/signFrame.ts`
- Modify: `src/experience/floors/library/decor/useLibrarySignPlacement.ts`, `src/experience/floors/library/decor/useEndSignPlacement.ts`

**Interfaces:**
- Produces: `LIBRARY_SIGN` (`near`, `boxPad`, `roverHalf`), `libraryPlateHalves(signs)`, `roverScreenBox(camera, rover, floorY, size, v, out)`, `createLibraryFrame()`, `libraryLabelFrame(work, input)` returning `{ shown, rover }`; `END_SIGN_NEAR`, `END_LABEL_MAX`, `endPlazaFrame(input)` returning `{ candidates, quads, shown, boxes }`.

- [x] Move the loop bodies unchanged (same constants, same order, same scratch reuse) into the two pure functions.
- [x] The hooks keep the fades, `endPlazaScreen` and the probes.
- [x] `bunx vitest run tests/unit/library-sign-placement.test.ts tests/unit/library-topics.test.ts` passes.
- [x] Commit `refactor(l4): pure per-frame sign placement for the timeline and the end plaza`.

### Task 2: The sweep as a Vitest

**Files:**
- Create: `tests/unit/library-label-sweep.test.ts`

- [x] Build `data`, the L4 floor layout and the library layout as `tests/unit/library-layout.test.ts` does; build the timeline signs as `NewsroomDecor` does (featured stage out) and the end plaza signs with the English labels.
- [x] Devices: desktop 1440 x 900 (title cap 6), phone 390 x 844 (title cap 4); camera class from `cameraClass`.
- [x] Replay the e2e poses: approach (spawn, arrival view primed), posts (8, 0), mid (24, 0), then per zone (research, models, talks) the approach 6 u before the spur, the spur start and the door pose 2 u short of the pad, stopping once the zone's sign shows.
- [x] Per pose and per end plaza orbit angle (8 angles): no two shown plates overlap by more than 2 % of the smaller quad, no timeline plate over the rover, titles within the cap, no text twice. A title shows at posts or mid; each zone's sign shows on one of its poses.
- [x] A negative check: shrinking the gap to a forced overlap makes the audit report it (the audit is not vacuous).
- [x] Commit `test(l4): label overlap sweep as a unit test`.

### Task 3: Docs

- [x] `docs/agents/floor-l4-library.md`: the label rule's guards (unit sweep on every PR, the rendered spec).
- [x] `docs/agents/performance.md` if it lists the L4 label spec; `docs/superpowers/README.md` row for this plan.
- [x] Commit `docs: L4 label sweep unit test`.

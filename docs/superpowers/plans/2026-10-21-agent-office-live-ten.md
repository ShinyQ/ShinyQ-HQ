# Agent Office revamp A2: always-live office and ten desks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Status: in progress (2026-10-21); follows part A (#274, bcb1080).

**Goal:** The office's live layer runs whenever the office is in view from anywhere in the Lobby (no drive needed), and
the office seats up to ten sessions (two rows of five) with helpers still drawn as drones.

**Architecture:** The office scene chunk loads on every L1 visit at idle after the first frame and counts in the session
totals; a far level of detail (about 4 fps updates) and the existing in-view gate keep the runtime cost low; the scene
polls fast only when near (or a drawer is open) and slowly otherwise, replacing the watch's stream. Ten seats come
with snapshot v3 (`?v=3`, up to ten desks, polled by the scene, the Classic card and the office watch); v1 and v2 keep
five desks plus `extra`, so old clients never see more. A
second, raised console row stands behind the first; the wing grows deeper from S if needed.

**Tech Stack:** Next.js 16 static export, react-three-fiber, three.js, Cloudflare Workers and Durable Objects, Vitest, Playwright, Bun.

Design: [`2026-10-20-agent-office-revamp-design.md`](../specs/2026-10-20-agent-office-revamp-design.md) (section 5.9
and 5.10 added by Task 1); owner decisions relayed 2026-10-21 (always-live office; ten desks).

## Global Constraints

- No em dashes (U+2014) anywhere. Bun; `rtk` for git; conventional commits.
- First-frame cap unchanged; session caps raised by the measured office bytes at measured plus about 0.6 KB (owner
  approved about +27 KB); the office chunks keep their own 40 KB `officeTotal`.
- L1 under 125 scene draw calls in every view on both tiers (spawn views with the wing visible included); no new
  shader programs; memory gates flat; lite fps healthy.
- Requests: no per-visitor fast poll from afar; fast only near or with a drawer; the 10 min idle stop and back-off kept.
- Contract: v1 and v2 byte for byte for up to five sessions, the same shape and rules beyond (five desks plus `extra`);
  ten desks only in v3; the watch polls v3 at the same 30 s cadence; every side in one PR.
- Every Rover and its screen readable from the office stop; none hides another; 6 u space rules.
- Reduced motion, bilingual strings, chips never over the HUD or each other, zero layout shift on the Classic card.

---

### Task 1: Design and decision docs

- [ ] Add spec sections 5.9 (always-live office: idle load, far LOD, poll near/far, budgets) and 5.10 (ten desks:
  contract v3, two rows, chips, Classic card proposal) and two decision files
  (`docs/decisions/2026-10-21-office-always-live.md` with the Workers request estimate, `docs/decisions/2026-10-21-office-ten-desks.md`);
  stage B moves to v4 (`docs/superpowers/plans/2026-10-20-agent-office-pipeline.md` note), stage C's log slot range 0 to 9.
- [ ] Commit `docs(office): always-live office and ten desks (design, decisions)`.

### Task 2: Always-live loading and far level of detail

**Files:** `office/chunk.ts` (`officeLoadWanted`), `OfficeMount.tsx`, `OfficeScene.tsx` (`OfficeWatch`, crew frame), `office/crewFrame.ts`, `office/live.ts`, `src/lib/office/poll.ts`, `e2e/office.spec.ts`, `e2e/perf/*`, `e2e/budgets.ts`.

**Interfaces:** `officeLoadWanted` returns true on L1 (or riding there) once the first frame went idle with speculative
prefetch on, regardless of distance (`OFFICE.loadRadius` removed or kept only for the ride case); `OFFICE_LOD = { farDistance: 40, farHz: 4 }`;
`lodStep(distance, dt, acc): { step: boolean; dt: number; acc: number }` (pure); poll reasons `"near"` (fast,
`pollInterval`) and `"far"` (30 s) in `officeLive`, `"drawer"` fast.

- [ ] Tests first: `officeLoadWanted` true at the spawn after idle (prefetch on), false with `?prefetch=off`, false off L1;
  `lodStep` accumulates frame deltas and steps at 4 Hz past `farDistance`, every frame inside it; the crew frame in far
  LOD writes at most 4 times a second and still writes nothing while still; poll cadence: in view and near is fast, in
  view and far is 30 s, out of view stops (the watch takes over at 30 s; it moves to `?v=3` in Task 3), drawer fast.
- [ ] Implement: the scene mounts on L1 after idle; `OfficeWatch` computes the camera's distance to the office bounds
  each 0.5 s and sets `officeRuntime.far`; the crew, drones, sparks, atlas faces and the tower step through `lodStep`
  (desk screens and faces at most 2 fps far); `officeLive.want("near"|"far", ...)` replaces `"view"`; the watch keeps
  running only while the scene is not feeding (one request stream; its `?v=3` switch and the ten-desk signal guard land
  in Task 3 with the contract).
- [ ] E2E: a new test loads L1, waits for the idle frame, and asserts `__hq.probes.office.loaded` and `inView`-independent
  mounting without moving the rover; a ring-south spot (the rover on the lane ring's south point, view turned toward
  the wing) sees Rovers animating (`bob > 0` in full motion) at the far rate.
- [ ] Perf: L1 settled calls at the spawn (wing visible or not) and the ring-south spot on both tiers under 125; bytes:
  the office scene chunk moves into the session total (`bytes-3d.spec.ts`), session caps re-set by measured plus 0.6 KB,
  first frame unchanged. Record before and after bytes for the coordinator.
- [ ] Commit `feat(office): the office lives whenever it is in view (idle load, far LOD, near and far polls)`.

### Task 3: Contract v3 with ten seats

**Files:** `src/lib/office/protocol.ts` (`OFFICE_SEATS = 10`, `OfficeSnapshotV3`, `parseOfficeResponseV3`), `workers/office/src/state.ts` (`assignSlots` over ten seats; `view`/`viewV2` keep slots 0 to 4 as desks and the rest as `extra`; `viewV3` all ten), `office.ts`, `worker.ts`, `functions/_lib/office.ts` (`?v=3`), `office/live.ts` and `components/office/OfficePanel.tsx` (poll v3), `office/officeWatch.ts` (poll `?v=3`, same 30 s cadence), `office/officeSignal.ts` (`signalFromBody` accepts v1 to v3 bodies with up to ten desks and slots 0 to 9), fixtures (`OFFICE_FIXTURES_V3` with ten mixed desks and drones), tests `office-signal`, `office-watch`.

- [ ] Tests first: the v1 golden stays byte for byte for documents with at most five sessions; with seven sessions v1
  and v2 carry five desks (slots 0 to 4) and `extra: 2`, never a slot above 4; v3 carries seven desks; the front row
  (slots 0 to 4) fills first; a v3 request to a rolled-back Worker falls back to v2 or v1 bodies; the edge cache has one
  entry per version; old v2 parsers (part A) reject nothing they used to accept; `signalFromBody` accepts v1, v2 and v3
  bodies with up to ten desks and slots 0 to 9 and still rejects eleven desks, a slot of 10 and v4; the watch fetches
  `/api/office?v=3` once per 30 s (the same request count as before); a seat-7 asker (slot 7 in a v3 fixture, the
  scene not feeding) lights the beacon via the watch (`needsKurniadi` true, `asking` holds 7).
- [ ] Implement and commit `feat(office): snapshot v3 with ten seats (v1 and v2 keep five)`.

### Task 4: The second console row

**Files:** `officeLayout.ts` (`OFFICE.rows`, back-row angles, radius and riser height; `officeSlots` for ten; obstacles; wing depth from S if needed), `officeShell.ts` (shell boxes, riser), `content/room-views/lobby.ts` and rooms (`L1:office-desk-6` to `-10`), `office/interact.ts`, tests `lobby-office`, `office-rooms`, `office-interact`, a new `office-rows-visibility` projection test.

- [ ] Tests first: ten slots, the front row unchanged in place; every back-row Rover's face quad and desk screen at least
  80% unoccluded from the office stop on the desktop and tablet camera classes, and on portrait every Rover in frame with
  the back row at least 60% unoccluded (projected against the front row's boxes);
  the space rules hold (touch or 6 u), the stop reachable, no pocket; the tower and dock still touch the end boxes.
- [ ] Implement (back arc behind the front, raised on a riser, angles chosen by the visibility test) and commit
  `feat(office): a second, raised console row`.

### Task 5: Scene for ten Rovers

**Files:** `OfficeScene.tsx`, `officeRig.ts`, `crewFx.ts`, `officeAtlas.ts` (ten faces, ten desk screens, the flag cell: grow the atlas to 1024 x 1024 or shrink the back-row screen cells; one upload then partial copies as now), `officeModel.ts` (ten `OfficeRoverView`s), `runtime.ts` (ten chips), probes.

- [ ] Tests first: instance counts derive from the slot count; atlas cells never overlap and fit the atlas; a still
  office of ten writes nothing per frame; ten drones sets cap at four per Rover.
- [ ] Implement and commit `feat(office): ten Rovers in the live scene`.

### Task 6: Chips for ten, stop view for two rows

**Files:** `officeShell.ts` (`layoutChipRow` for ten, phone two-row layout), `OfficeChips.tsx`, `OfficeScene.tsx` (`OfficeWatch`), `officeLayout.ts` (`OFFICE.view`), tests `office-chip-placement`, `office-view`, `camera-look-offset`.

- [ ] Tests first: desktop one row of ten compact chips (dot plus agent; activity only near) clear of the HUD and each
  other in desk order; phones dot-only in at most two rows clear of the minimap and the top bar; the stop view frames
  both rows and the wall with the wall top about 12 to 15% on desktop (portrait keeps the top-band fill); other zones
  bit-identical.
- [ ] Implement and commit `feat(office): chips and the stop view for two rows`.

### Task 7: Classic card for ten desks

Proposal (default unless the owner says otherwise): the card keeps its fixed height with five desk rows. Active desks
(any state but asleep, front row first) fill the rows; when more than five are active, the fifth row becomes
"+N more active desks"; asleep and off-duty desks collapse into the existing summary line ("3 desks idle"). Zero layout
shift in every state (`OFFICE_RESERVE` re-measured only if a line changes height).

- [ ] Tests first (jsdom and `e2e/office-classic.spec.ts` with a ten-desk fixture at 1440x900 and 390x844 in both
  locales: no layout shift, the right rows and lines).
- [ ] Implement and commit `feat(office): the Classic card for ten desks`.

### Task 8: Budgets, captures, docs and the PR

- [ ] Perf lane: calls in every view under 125 both tiers, programs at baseline, memory flat; byte caps re-set by the
  owner rule with a decision file.
- [ ] Captures: the ten-desk state (mixed states plus drones) at 1440x900, 820x1180 and 390x844 (full and lite), the
  Classic card at 1440 and 390, and the ring-south view on desktop and phone showing the live office from afar.
- [ ] Docs: office.md, floor-l1-lobby.md, features.md, performance.md, AGENTS.md budget rows; plan status; PR.

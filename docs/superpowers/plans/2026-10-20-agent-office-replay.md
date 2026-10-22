# Agent Office revamp C: day replay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Status: shipped in #284 (d2a0d31), 2026-10-22; follows B (#279)

Built on what shipped: part A ([#274](https://github.com/ShinyQ/ShinyQ-HQ/pull/274): snapshot v2 with desk `helpers`,
the crew, the watch and beacon chunks), part A2 ([#276](https://github.com/ShinyQ/ShinyQ-HQ/pull/276),
[plan](2026-10-21-agent-office-live-ten.md): snapshot v3 with ten seats, the always-live scene chunk with its far level
of detail, two console rows, the chip row for ten) and part B ([#279](https://github.com/ShinyQ/ShinyQ-HQ/pull/279),
[plan](2026-10-20-agent-office-pipeline.md), open when this plan was refreshed: snapshot v4 with the CI `pipeline`, the
per-job tower lanes, packets, bursts, packages, the dock ring, the production deploy beam in the beacon chunk, the CI
drawer). Every name below is the code on the B branch (`feat/agent-office-revamp`, ba7bb3f0); re-check them after B
merges and before Task 1.

Code facts this plan relies on:

- Worker (`workers/office/src/state.ts`): `SessionRecord` keeps the front-row seat in `slot` (0 to 4 or null) and a
  back-row seat in `seat` (5 to 9); the effective seat is `seatOf(s)` (`slot ?? seat`); `migrateDoc` moves old back-row
  slots on load; `effective(s, now)` applies `TIMING` (thinking after 20 s quiet while working or reviewing, asleep
  after 3 min or 15 min while testing, on CI or waiting for input, done for 20 s, removed after 30 min);
  `effectiveHelpers` shows `helpers` (1 to 9) only while awake and within `TIMING.helpersTtl` (10 min) of the last beat.
  `applyBeat` re-runs `assignSlots` over every session, so one beat can move another session's seat. `RunRecord` has
  `order`, `names` and `started`; `pipelineOf(doc, now)` serves runs and ships (merged PRs and production deploys:
  `isProductionDeploy`); runs and merges link to a desk through the private `seatFor(doc, repo, branch, now)`;
  `viewV4` = `viewV3` plus `pipeline`. Feed keys: `pr:<repo>#<n>`, `run:<id>`, `deploy:<id>`; a PR feed title is
  `#<n> <title>`.
- Durable Object (`workers/office/src/office.ts`): one `doc` row, `storage.get` and `storage.put(key, value)` only
  (`types.ts` declares just those two); `/snapshot` answers `view`, `viewV2`, `viewV3` or `viewV4`.
- Function (`functions/_lib/office.ts`): `VERSIONS` maps a version to `{ key, worker, parse, off }`, where `key` is the
  canonical edge cache key, so junk queries share an entry; `jsonAnswer` adds `nosniff`, `Cache-Control` and an ETag
  (`etagOf`), `conditional` answers 304 and HEAD, `noStore` the errors.
- Client: `src/lib/office/protocol.ts` (types, shared validator helpers `isObj`, `isInt`, `onlyKeys`, `optional`,
  `matches`, `REPO`, `isText`, `wibDay`), `protocolV4.ts` (the v4 validators, scene chunk only), `poll.ts`
  (`OfficeFeed`, `OfficeFeedSnapshot` with an optional `pipeline`), `model.ts`, `fixtures.ts`
  (`OFFICE_FIXTURES_V4`). Scene chunk (`office/scene.ts`): `live.ts` (the one v4 poller, reasons `near`, `far`,
  `drawer`, a skewable test clock), `OfficeScene.tsx` (`officeView(feed)`, `PipeQueue.see` on every feed with the skew
  from `updatedAt`, the frame gated on `officeRuntime.inView` and stepped through `lodStep`), `pipeline.ts`
  (`diffPipeline`, `PipeQueue`, `runningDeployAt`, `deployRunning`), `officeWall.ts` (`wallModel`), `OfficeChips.tsx`
  (its own `officeView(useOfficeFeed())`), `chipRows.ts` (`chipRowBounds`, `layoutChipRow`), `crewFrame.ts`
  (`lodStep`, `OFFICE_LOD`). Drawer body chunk (`office/body.ts`): `OfficeBody.tsx`, which reads the scene chunk's
  poller through the loaded module. Main path: `chunk.ts` (`loadOffice`, `loadOfficeBody`, `officeHandle`, also in the
  Classic drawer host), `watchLoader.ts`. The beam and the beacon read `officeSignal` (fed only by the live feed).
- Bytes (`e2e/budgets.ts`, B measured): scene chunk 26,586 B (`office` cap 27,200 B), drawer body 6,483 B (`officeBody`
  7,097 B), watch chunk 1,555 B (`officeWatch` 2,075 B), beacon chunk 2,043 B (`officeBeacon` 2,657 B). The
  `officeTotal` gate (40 KB, 40,960 B) sums scene + body + replay (`e2e/perf/bytes-3d.spec.ts` already calls
  `__hq.office.loadReplay` when it exists): 33,069 B today. All four office chunks: 36,667 B (B's decision used a 38 KB
  stop rule over the four). Session totals: full 534,358 B (cap 534,972 B, 522.4 KB), lite 518,224 B (cap 518,838 B,
  506.7 KB). First frame full 476,592 B under `failAt` 477,594 B (466.4 KB, fixed): 1,002 B of room.

**Goal:** Today, or any of the last 7 days, plays back in the office as a 30 to 60 s time-lapse on all ten desks (helper
drones included) with the day's merges, CI runs and production deploys as pipeline effects and floor tiles lit per
merged PR; an idle office in view loops the latest day, always labelled as a replay, so it never looks dead.

**Architecture:** The Durable Object writes one bounded, privacy-safe log row per WIB day beside its doc (`log:YYYY-MM-DD`,
in the same `put`) by diffing the doc before and after each accepted beat or webhook: seats 0 to 9 through `seatOf`,
helper counts, merges, finished runs and production deploy results. A public `GET /api/office/history` (an 8-day index,
or one day with `?day=`) is served by a Pages Function on the `VERSIONS` pattern (canonical cache keys, ETag, edge
cache). A lazy replay chunk rebuilds each desk with the live time rules and publishes synthetic v4 snapshots (desks,
helpers, pipeline runs and ships, today's counters) that the scene renders through the same `officeView`, crew, drones,
pipeline effects and a new tile mesh, with no other render path.

**Tech Stack:** Cloudflare Workers and Durable Objects (SQLite-backed storage API), Pages Functions, Next.js 16 static
export, react-three-fiber, three.js, Vitest, Playwright, Bun.

Design: [`2026-10-20-agent-office-revamp-design.md`](../specs/2026-10-20-agent-office-revamp-design.md) sections 7 to
11. Where section 7 predates A2 and B (per-session logging, branches in the log, the beam in replay, a tag on every
chip, the byte estimates), this plan wins and Task 10 brings the design up to date.

## Global Constraints

- No em dashes (U+2014) anywhere: code, comments, copy, docs, commits, PR text. Bun only; `rtk` for git; conventional
  commits.
- Privacy (R3, office D3, unchanged): the log keeps only agent, state, activity, seat, helper count and times, plus repo
  and title for public allowlisted repositories (everything else shows "Client project"); merges keep repo, number and
  title; runs and deploys keep times, a seat and a result only. Never prompts, code, paths, branches, client names or
  session hashes in served output: the hashes stay in the stored row's private `keys` (per-day ordinals, which do not
  link across days); branches are not stored at all (nothing in replay reads them). At read time every repository must
  still be in `doc.publicRepos` (the Durable Object) and pass the allowlist (the Worker), and every title passes
  `cleanTitle` with the current blocklist again (the Worker), so a later blocklist or privatize applies retroactively.
  `privatized` scrubs every stored row.
- Storage bounds (per row): 200 sessions (ordinals), 3,000 events, 200 merges, 500 runs, 50 deploys and 120 KB
  serialized; past any cap the day is marked `truncated` and that list stops growing. At most 8 log rows (today plus
  7); the first write of a new WIB day closes yesterday's row, starts today's with the sessions still live at midnight
  and deletes rows older than 7 days. Free limits: see the table under Task 3.
- Endpoint: GET and HEAD; the only queries are none (the index) or exactly one `day` in the 8-day window; anything else
  a fixed `404 {"v":1,"error":"day"}` with no echo and `no-store`; canonical cache keys only; `nosniff`; ETag and 304;
  the Worker's body validated again; `OFFICE_ENABLED` answers `{ v: 1, enabled: false }`.
- Seats and contract: snapshot versions v1 to v4 and their bodies stay byte for byte (the state goldens and view tests
  untouched); the history is its own contract (`OfficeHistoryV1`), validated by `parseOfficeHistory` and
  `parseOfficeHistoryIndex` in `src/lib/office/protocolHistory.ts`, a module only the Function, the Worker and the
  replay chunk import (never re-exported from `protocol.ts`, so the Classic card, the watch, the scene chunk and the
  drawer body never carry it).
- Chunks: the replay chunk (`office/replayChunk.ts`) holds the engine, the feed, the history validators and the replay
  controls; it loads only on the idle-loop condition or the drawer's replay control, through one `import()` in the scene
  chunk (`replayLink.ts`); never on the first-frame path, never with the first idle load. The scene chunk gains only the
  link (store, source switch, idle-loop rule, labels), the tiles and the label plumbing; the drawer body only a mount
  point. Budget section below.
- Rendering: one new draw call in the wing (the tiles: a second `HOLO_MODE.stage` mesh, `STAGE_KIND.tile` instances,
  the material from `createStageMaterial`, no new shader program); L1 under 125 scene calls in every view on both
  tiers; `useDispose` after every memoized geometry and material; no new rAF loop (the playback clock steps from the
  scene's `useFrame`, through `lodStep`, only while `officeRuntime.inView`); a still replay writes nothing per frame.
- Replay is labelled and local: the wall banner, a "Replay" pill in the chip row, a replay mark on every chip and in its
  accessible name, a badge and "Back to live" in every office drawer. A replay never writes `officeSignal`: the beacon,
  the minimap cue and the deploy beam stay live only (they read across the Lobby with no label); a replayed production
  deploy shows on the dock ring (the running shimmer, then the failure pulse when it failed). Point-and-go targets and
  desk drawers keep the live office.
- Reduced motion: no auto loop; a replay starts paused and steps by whole hours on demand ("Next hour"); tiles show end
  states at once; the crew and the pipeline keep their reduced-motion rules.
- Strings: `office.3d.replay.*` in both locales (`office` is in `CLIENT_NAMESPACES`, not a layout namespace); short,
  since they ride in the HTML of pages that wrap `ClientMessages`.
- E2E waits on state (`__hq.probes.office.replay`, `__hq.probes.office.tiles`, the poller's skewable clock), never on
  time. Security review (the `security-review` agent) of the storage, the endpoint and the replay parsing before merge.

## Budget for C (estimate, the open question, cap rule)

Bytes are gzip; "KB" is 1,024 B as in `e2e/budgets.ts` (so `officeTotal` 40 KB is 40,960 B).

| Chunk | C adds (estimate) | After C (estimate) |
|---|---|---|
| Office scene (in the session totals) | `replayLink.ts` (store, `useOfficeSource`, `idleLoopWanted`, the loader, day and clock labels), the source switch in `OfficeScene` and `OfficeChips`, `PipeQueue.reset`, `tiles.ts` and the tile mesh, the wall banner, the chip pill and replay mark, probes: +1,000 to +1,400 B | 27,586 to 27,986 B (over its 27,200 B cap: re-set by the rule) |
| Drawer body | the replay section (open button, badge, "Back to live", the controls mount): +200 to +300 B | 6,683 to 6,783 B (its 7,097 B cap holds) |
| Replay (new; outside the session totals, see Q2) | `protocolHistory.ts` validators on `protocol.ts`'s helpers (500 to 600 B), `replay.ts` (1,200 to 1,400 B), `replayFeed.ts` (600 to 700 B), `ReplayControls.tsx` (600 to 800 B), chunk overhead (about 100 B) | 3,000 to 3,600 B (new `officeReplay` cap) |
| Main path | `officeHandle.loadReplay` (the e2e and perf hook): about 40 B | first frame inside `failAt` (1,002 B of room) |
| `officeTotal` as coded (scene + body + replay) | +4,200 to +5,300 B over 33,069 B | 37,269 to 38,369 B of 40,960 B: fits, 2,591 to 3,691 B left |
| All five office chunks (scene, body, watch, beacon, replay) | +4,200 to +5,300 B over 36,667 B | 40,867 to 41,967 B: against 40,960 B (4,293 B left today) from 93 B under to 1,007 B over; against the "about 3.3 KB left" reading (40,000 B, 3,333 B left) 867 to 1,967 B over |
| Session totals (lite and full) | the scene chunk's growth | +1,000 to +1,400 B each, past the 614 B of room: caps re-set by the rule |

Already applied to fit: the engine, feed, validators and controls live in the replay chunk only (the drawer body mounts
the controls from the loaded replay module), the validators reuse `protocol.ts`'s helpers already in the scene chunk,
the tiles reuse the hall's stage program and the scene's existing writers. Further trims, in order, if the owner keeps
an all-chunks reading without a raise: (1) drop the tiles (scene -400 to -500 B, one call fewer, design 7.4 loses its
floor tiles); (2) controls without the scrubber (day buttons, play or pause, "Back to live"; replay about -200 B); (3)
one replay mark (the pill and the accessible-name prefix, no per-chip ring; scene about -100 B). With all three the five
chunks land at about 40,100 to 41,300 B: inside 40,960 B only at the low end, still up to about 1,300 B over 40,000 B.
So the plan asks (open question Q1) and does not start Task 7 without the answer.

Cap rule (owner rule, appendix 08 section 2): `office`, `session.lite` and `session.full` (and `officeBody` if it passes
7,097 B) move to their measured values plus 0.6 KB (614 B), with the measured bytes in each comment of `e2e/budgets.ts`,
an owner note in the PR and a decision file `docs/decisions/YYYY-MM-DD-office-replay-budgets.md` (dated the day it is
measured); the new `officeReplay` cap is its measured value plus 614 B; `officeTotal` stays 40 KB unless Q1 raises it;
`failAt` does not move. Stop rule: if the replay chunk measures over 4,300 B or the scene chunk grows by more than
1,600 B, trim before re-setting and flag it to the owner.

## Open questions (owner, before Task 7)

- **Q1 Office budget reading.** C is estimated at +4,200 to +5,300 B. Under the gate as coded (`officeTotal` = scene +
  body + replay) the office reaches 37,269 to 38,369 B of 40,960 B and fits. Counting all five office chunks (36,667 B
  used today, about 3.3 KB left on a 40,000 B reading) it does not fit, and even the three trims above leave it up to
  about 1,300 B over. Options: (a) keep the coded gate (recommended; the watch and beacon keep their own caps), (b) raise
  `officeTotal` to the measured all-chunks total plus 614 B (about 42,600 B, 41.6 KB) and sum all five in the gate,
  (c) cut the tiles and the scrubber and accept the five chunks up to about 1,300 B over 40,000 B.
- **Q2 Replay chunk and the session totals.** The idle loop loads the replay chunk on most quiet L1 visits with the
  office in view. Default (design 5.9): it keeps its trigger and stays outside the session totals with its own
  `officeReplay` cap; the alternative counts it like the scene chunk (session caps +3,000 to +3,600 B).
- **Q3 Chip label.** Ten chips (dot-only on phones and in dot rows) leave no room for a text tag each. Default: one
  "Replay · 14:05" pill leading the chip row, a ring mark on every chip's dot and "Replay of Mon 19 Oct:" at the start
  of every chip's accessible name, instead of design 7.4's per-chip tag.
- **Q4 Live-only signals.** Default: a replay never lights the beacon, the minimap cue or the deploy beam (they read
  from the whole Lobby without a label); replayed deploys show on the dock ring only. The alternative fires the beam
  from replay through a separate flag (beacon chunk about +100 B, and replays load the beacon chunk).

## File structure

| File | Responsibility |
|---|---|
| `src/lib/office/protocolHistory.ts` (new) | `OFFICE_HISTORY_PATH`, `OFFICE_HISTORY`, `dayStart`, `historyWindow`, the history types, `parseOfficeHistoryIndex`, `parseOfficeHistory` |
| `src/lib/office/fixtures.ts` | `OFFICE_HISTORY_FIXTURES` (an index and a day: three sessions over both rows, helpers, three merges, two runs, one production deploy) |
| `workers/office/src/state.ts` | exports `seatFor`, `laneOrder`, `isProductionDeploy` (no behaviour change) |
| `workers/office/src/history.ts` (new) | `DayLog`, `HISTORY`, `logKey`, `emptyLog`, `secondsOf`, `logDoc`, `startLog`, `closeLog`, `scrubRepo`, `historyIndex`, `historyDay`, `cleanHistory` (pure) |
| `workers/office/src/types.ts` | storage `get(keys)`, `put(entries)`, `delete(keys)`, `list({ prefix, end })` |
| `workers/office/src/office.ts` | today's row with the doc in one `put`, rollover, prune, privatize scrub, `GET /history` |
| `workers/office/src/worker.ts` | `GET /history` (forwards a valid `day` only; cleans titles and repositories) |
| `functions/_lib/office.ts` | `historyRoute` (the `VERSIONS` pattern for history), `createOfficeHistoryHandler` |
| `functions/api/office/history.ts` (new) | `onRequest` for `GET /api/office/history` |
| `src/experience/floors/lobby/office/replay.ts` (new) | `REPLAY`, `RULES`, `planReplay`, `dayTime`, `playTime`, `snapshotAt` (pure) |
| `src/experience/floors/lobby/office/replayFeed.ts` (new) | `createReplayFeed`: fetch, parse, cache, playback clock, loop, publish |
| `src/experience/floors/lobby/office/ReplayControls.tsx` (new) | the drawer's day buttons, play or pause (or "Next hour"), scrubber, "Back to live", notes |
| `src/experience/floors/lobby/office/replayChunk.ts` (new) | the replay chunk entry: `replayController`, `ReplayControls` |
| `src/experience/floors/lobby/office/replayLink.ts` (new, scene chunk) | `officeReplay` store, `publishReplay`, `useReplay`, `useOfficeSource`, `idleLoopWanted`, `loadOfficeReplay`, `replayDayLabel`, `replayClock` |
| `src/experience/floors/lobby/office/tiles.ts` (new, scene chunk) | `TILES`, `TILE_COUNT`, `tileCenters`, `tileLevels`, `stepTileAlpha` (pure) |
| `src/experience/floors/lobby/office/scene.ts` | also exports `loadOfficeReplay`, `useReplay` (read by the drawer body) |
| `src/experience/floors/lobby/office/chunk.ts` | `officeHandle.loadReplay` |
| `src/experience/floors/lobby/office/live.ts` | `officeLive.now()` (the skewable clock) |
| `src/experience/floors/lobby/office/officeModel.ts` | `OfficeView.replay`; `officeView(feed, replay)` |
| `src/experience/floors/lobby/office/pipeline.ts` | `PipeQueue.reset()` |
| `OfficeScene.tsx`, `officeWall.ts`, `OfficeChips.tsx`, `OfficeBody.tsx` | source switch, idle loop, replay step, `OfficeTiles`, banner, pill and mark, drawer section |
| `src/experience/fx/probes.ts` | `office.replay`, `office.tiles` |
| `messages/en.json`, `messages/id.json` | `office.3d.replay.*` |
| tests | `tests/office/protocol-history.test.ts`, `tests/office/history.test.ts`, `tests/office/worker.test.ts`, `tests/office/history-endpoint.test.ts`, `tests/helpers/office-history.ts`, `tests/unit/office-replay.test.ts`, `tests/unit/office-replay-feed.test.ts`, `tests/unit/office-replay-link.test.ts`, `tests/unit/office-tiles.test.ts`, `tests/unit/office-wall.test.ts`, `tests/unit/office-pipeline.test.ts`, `tests/unit/office-chunk-graph.test.ts`, `tests/hud/OfficeBody.test.tsx`, `tests/hud/OfficeChips.test.tsx`, `tests/hud/ReplayControls.test.tsx`, `e2e/office.spec.ts`, `e2e/office-fixtures.ts`, `e2e/perf/floors.spec.ts`, `e2e/perf/bytes-3d.spec.ts` |

---

### Task 1: The history contract

**Files:**
- Create: `src/lib/office/protocolHistory.ts`
- Modify: `src/lib/office/fixtures.ts` (`OFFICE_HISTORY_FIXTURES`)
- Test: `tests/office/protocol-history.test.ts`

**Interfaces:**
- Produces:

```ts
export const OFFICE_HISTORY_PATH = "/api/office/history";
export const OFFICE_HISTORY = { days: 8, sessions: 200, events: 3000, prs: 200, runs: 500, deploys: 50, jobs: 24, carryS: 1800, daySeconds: 86_400 } as const;
/** Seconds since the WIB midnight; `seat` -1 for a session past the ten seats; `state` and `activity` index OFFICE_STATES and OFFICE_ACTIVITIES; `until` the session's last beat before its next event (down to -1800 for a session carried over midnight). */
export type OfficeHistoryEvent = [t: number, n: number, seat: number, state: number, activity: number, until: number, helpers: number];
/** A merge: repo and title "" when not public (shown as "Client project"). */
export type OfficeHistoryPr = [t: number, seat: number, repo: string, number: number, title: string];
/** A finished run: start, end (when it finished), the desk, the result and its lane count (0 to 24). */
export type OfficeHistoryRun = [t: number, end: number, seat: number, ok: 0 | 1, jobs: number];
/** A production deploy result. */
export type OfficeHistoryDeploy = [t: number, ok: 0 | 1];
export interface OfficeHistoryDay { day: string; events: number; prs: number; runs: number; deploys: number }
export interface OfficeHistoryIndexV1 { v: 1; days: OfficeHistoryDay[] }
export interface OfficeHistoryV1 {
  v: 1; day: string; start: number; agents: OfficeAgent[];
  tasks: Record<string, { repo: string; title?: string }>;
  events: OfficeHistoryEvent[]; prs: OfficeHistoryPr[]; runs: OfficeHistoryRun[]; deploys: OfficeHistoryDeploy[];
  truncated: boolean;
}
export type OfficeHistoryIndexResponse = OfficeHistoryIndexV1 | OfficeDisabledV1;
export type OfficeHistoryResponse = OfficeHistoryV1 | OfficeDisabledV1;
export const dayStart: (day: string) => number;          // epoch ms of the WIB midnight
export const historyWindow: (now: number) => string[];   // today and the 7 days before, newest first
export function parseOfficeHistoryIndex(raw: unknown): OfficeHistoryIndexResponse | null;
export function parseOfficeHistory(raw: unknown): OfficeHistoryResponse | null;
```

- [ ] **Step 1: Tests first** `tests/office/protocol-history.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { OFFICE_HISTORY_FIXTURES } from "../../src/lib/office/fixtures";
import { dayStart, historyWindow, OFFICE_HISTORY, parseOfficeHistory, parseOfficeHistoryIndex } from "../../src/lib/office/protocolHistory";

const { index, day } = OFFICE_HISTORY_FIXTURES;
const withDay = (patch: Record<string, unknown>) => ({ ...day, ...patch });
const event = (e: unknown[]) => withDay({ events: [e] });

describe("history contract", () => {
  it("knows the WIB midnight and the 8-day window", () => {
    expect(dayStart("2026-10-20")).toBe(Date.UTC(2026, 9, 19, 17));
    const w = historyWindow(Date.UTC(2026, 9, 19, 17, 0, 1));
    expect(w).toHaveLength(8);
    expect(w[0]).toBe("2026-10-20");
    expect(w[7]).toBe("2026-10-13");
  });
  it("accepts the fixtures and the disabled body", () => {
    expect(parseOfficeHistoryIndex(index)).toEqual(index);
    expect(parseOfficeHistory(day)).toEqual(day);
    expect(parseOfficeHistory({ v: 1, enabled: false })).toEqual({ v: 1, enabled: false });
  });
  it("rejects hostile or out-of-range bodies", () => {
    const bad = [
      withDay({ keys: ["a".repeat(64)] }),
      withDay({ start: day.start + 1 }),
      event([0, 0, 10, 0, 0, 5, 0]),
      event([0, 0, -2, 0, 0, 5, 0]),
      event([0, 0, 0, 9, 0, 5, 0]),
      event([0, 0, 0, 0, 12, 5, 0]),
      event([0, 0, 0, 0, 0, 5, 10]),
      event([86_401, 0, 0, 0, 0, 5, 0]),
      event([0, 0, 0, 0, 0, -1801, 0]),
      event([0, 99, 0, 0, 0, 5, 0]),
      withDay({ events: [[5, 0, 0, 0, 0, 5, 0], [4, 0, 0, 0, 0, 5, 0]] }),
      withDay({ events: Array.from({ length: OFFICE_HISTORY.events + 1 }, () => [0, 0, 0, 0, 0, 0, 0]) }),
      withDay({ tasks: { "0": { repo: "ShinyQ/ShinyQ-HQ", title: "<img src=x>" } } }),
      withDay({ tasks: { "0": { repo: "ShinyQ/ShinyQ-HQ", branch: "feat/x" } } }),
      withDay({ tasks: JSON.parse('{"__proto__":{"repo":"ShinyQ/ShinyQ-HQ"}}') }),
      withDay({ prs: [[5, 0, "", 7, "Thing"]] }),
      withDay({ runs: [[50, 40, 0, 1, 3]] }),
      withDay({ runs: [[0, 40, 0, 1, 25]] }),
      withDay({ deploys: [[5, 2]] }),
    ];
    for (const raw of bad) expect(parseOfficeHistory(raw), JSON.stringify(raw).slice(0, 120)).toBeNull();
    expect(parseOfficeHistoryIndex({ ...index, days: index.days.slice(1) })).toBeNull();
    expect(parseOfficeHistoryIndex({ ...index, days: [...index.days].reverse() })).toBeNull();
    expect(parseOfficeHistoryIndex({ ...index, extra: 1 })).toBeNull();
  });
});
```

- [ ] **Step 2:** `bun run test tests/office/protocol-history.test.ts`; expect FAIL.
- [ ] **Step 3: Implement** `protocolHistory.ts`:

```ts
import { OFFICE_ACTIVITIES, OFFICE_AGENTS, OFFICE_HELPERS_MAX, OFFICE_SEATS, OFFICE_STATES, REPO, isInt, isObj, isText, matches, oneOf, onlyKeys, optional, wibDay, type OfficeAgent, type OfficeDisabledV1 } from "./protocol";

/**
 * The Agent Office history (design 7.2, stage C): GET /api/office/history (the 8-day index) and
 * GET /api/office/history?day=YYYY-MM-DD (one WIB day). Imported by the Pages Function, the hq-office Worker and the
 * replay chunk only; never re-exported from ./protocol.ts, so the Classic card, the watch, the scene chunk and the
 * drawer body never carry these validators (tests/unit/office-chunk-graph.test.ts).
 */
export const OFFICE_HISTORY_PATH = "/api/office/history";
export const OFFICE_HISTORY = { days: 8, sessions: 200, events: 3000, prs: 200, runs: 500, deploys: 50, jobs: 24, carryS: 1800, daySeconds: 86_400 } as const;
// (the types from the Interfaces block)

const H = OFFICE_HISTORY;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ORDINAL = /^\d{1,3}$/;
export const dayStart = (day: string): number => Date.parse(`${day}T00:00:00Z`) - 7 * 3_600_000;
export const historyWindow = (now: number): string[] => Array.from({ length: H.days }, (_, i) => wibDay(now - i * 86_400_000));

const disabled = (raw: Record<string, unknown>) => raw.enabled === false && onlyKeys(raw, ["v", "enabled"]);
const tuple = (x: unknown, n: number): x is unknown[] => Array.isArray(x) && x.length === n;
const isT = (x: unknown) => isInt(x, 0, H.daySeconds);
const isSeat = (x: unknown) => isInt(x, -1, OFFICE_SEATS - 1);
const isOk = (x: unknown) => x === 0 || x === 1;
/** Bounded, every item valid, sorted by the time at `at` (events, merges and deploys by start, runs by end). */
const list = (x: unknown, max: number, ok: (e: unknown) => boolean, at = 0) =>
  Array.isArray(x) && x.length <= max && x.every(ok) && x.every((e, i) => i === 0 || e[at] >= x[i - 1][at]);

export function parseOfficeHistoryIndex(raw: unknown): OfficeHistoryIndexResponse | null {
  if (!isObj(raw) || raw.v !== 1) return null;
  if (raw.enabled === false) return disabled(raw) ? { v: 1, enabled: false } : null;
  const days = raw.days;
  if (!onlyKeys(raw, ["v", "days"]) || !Array.isArray(days) || days.length !== H.days) return null;
  const ok = days.every(
    (d, i) =>
      isObj(d) && onlyKeys(d, ["day", "events", "prs", "runs", "deploys"]) && matches(DAY)(d.day) && (i === 0 || (d.day as string) < days[i - 1].day) &&
      isInt(d.events, 0, H.events) && isInt(d.prs, 0, H.prs) && isInt(d.runs, 0, H.runs) && isInt(d.deploys, 0, H.deploys),
  );
  return ok ? (raw as unknown as OfficeHistoryIndexV1) : null;
}

export function parseOfficeHistory(raw: unknown): OfficeHistoryResponse | null {
  if (!isObj(raw) || raw.v !== 1) return null;
  if (raw.enabled === false) return disabled(raw) ? { v: 1, enabled: false } : null;
  if (!onlyKeys(raw, ["v", "day", "start", "agents", "tasks", "events", "prs", "runs", "deploys", "truncated"])) return null;
  if (!matches(DAY)(raw.day) || raw.start !== dayStart(raw.day as string) || typeof raw.truncated !== "boolean") return null;
  const agents = raw.agents;
  if (!Array.isArray(agents) || agents.length > H.sessions || !agents.every((a) => oneOf(OFFICE_AGENTS, a))) return null;
  const n = agents.length;
  const tasks = raw.tasks;
  if (!isObj(tasks) || !Object.entries(tasks).every(([k, v]) => ORDINAL.test(k) && Number(k) < n && isObj(v) && onlyKeys(v, ["repo", "title"]) && matches(REPO)(v.repo) && optional(v, "title", isText))) return null;
  const event = (e: unknown) =>
    tuple(e, 7) && isT(e[0]) && isInt(e[1], 0, n - 1) && isSeat(e[2]) && isInt(e[3], 0, OFFICE_STATES.length - 1) &&
    isInt(e[4], 0, OFFICE_ACTIVITIES.length - 1) && isInt(e[5], -H.carryS, H.daySeconds) && isInt(e[6], 0, OFFICE_HELPERS_MAX);
  const pr = (e: unknown) => tuple(e, 5) && isT(e[0]) && isSeat(e[1]) && isInt(e[3], 1, 1e9) && ((e[2] === "" && e[4] === "") || (matches(REPO)(e[2]) && isText(e[4])));
  const run = (e: unknown) => tuple(e, 5) && isT(e[0]) && isT(e[1]) && (e[0] as number) <= (e[1] as number) && isSeat(e[2]) && isOk(e[3]) && isInt(e[4], 0, H.jobs);
  const deploy = (e: unknown) => tuple(e, 2) && isT(e[0]) && isOk(e[1]);
  if (!list(raw.events, H.events, event) || !list(raw.prs, H.prs, pr) || !list(raw.runs, H.runs, run, 1) || !list(raw.deploys, H.deploys, deploy)) return null;
  return raw as unknown as OfficeHistoryV1;
}
```

  `OFFICE_HISTORY_FIXTURES` in `fixtures.ts`: `day` is the WIB day of `OFFICE_FIXTURE_NOW` with three ordinals (Copilot on
  seat 0 with 3 helpers on `ShinyQ/ShinyQ-HQ` and a title, Claude on seat 6 without a public repo, Codex on seat 2 that
  sleeps), about 40 events between 09:00 and 15:00 WIB with a quiet gap over 10 min, three merges (one with an empty
  repo and title), two runs (one failed, 12 lanes), one production deploy; `index` is `historyWindow(OFFICE_FIXTURE_NOW)`
  with that day's counts first and zeros for the other seven.
- [ ] **Step 4:** Run; expected PASS.
- [ ] **Step 5:** Commit `feat(office): the history contract`.

### Task 2: The day log (pure)

**Files:**
- Create: `workers/office/src/history.ts`
- Modify: `workers/office/src/state.ts` (export `seatFor`, `laneOrder`, `isProductionDeploy`)
- Test: `tests/office/history.test.ts`

**Interfaces:**
- Consumes: `seatOf`, `effective`, `seatFor`, `laneOrder`, `isProductionDeploy`, `applyBeat`, `applyGithub` (`state.ts`);
  `cleanTitle`, `repoAllowed` (`ingest.ts`); `OFFICE_HISTORY`, `dayStart`, `historyWindow` (Task 1).
- Produces:

```ts
export const HISTORY = { ...OFFICE_HISTORY, maxBytes: 120 * 1024 } as const;
/** Stored events: `until` is null while the event is open (its session has not changed since). */
export type LogEvent = [t: number, n: number, seat: number, state: number, activity: number, until: number | null, helpers: number];
export interface DayLog {
  v: 1; day: string;
  keys: string[];                                   // private: the session hash per ordinal, never served
  agents: OfficeAgent[];
  tasks: Record<string, { repo: string; title?: string }>;
  events: LogEvent[]; prs: OfficeHistoryPr[]; runs: OfficeHistoryRun[]; deploys: OfficeHistoryDeploy[];
  truncated: boolean;
}
export const logKey: (day: string) => string;                       // "log:YYYY-MM-DD"
export const emptyLog: (day: string) => DayLog;
export const secondsOf: (day: string, ms: number) => number;        // clamped to -1800 .. 86,400
export function logDoc(log: DayLog, before: OfficeDoc, after: OfficeDoc, now: number): DayLog; // the same object when nothing loggable changed
export function startLog(day: string, doc: OfficeDoc): DayLog;      // carry-ins at t 0 for sessions live at the WIB midnight
export function closeLog(log: DayLog, doc: OfficeDoc): DayLog;      // every open event closed from the doc's lastBeat (else its own t)
export function scrubRepo(log: DayLog, repo: string): DayLog;
export function historyIndex(window: readonly string[], rows: ReadonlyMap<string, DayLog>): OfficeHistoryIndexV1;
export function historyDay(log: DayLog, doc: OfficeDoc): OfficeHistoryV1;        // no keys; public repos only
export function cleanHistory(h: OfficeHistoryV1, allow: readonly string[], blocklist: readonly string[]): OfficeHistoryV1; // the Worker's read-time pass
```

- [ ] **Step 1: Tests first** `tests/office/history.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cleanHistory, closeLog, emptyLog, HISTORY, historyDay, historyIndex, logDoc, logKey, scrubRepo, secondsOf, startLog } from "../../workers/office/src/history";
import { applyBeat, applyGithub, emptyDoc, type OfficeDoc } from "../../workers/office/src/state";
import { historyWindow, parseOfficeHistory, parseOfficeHistoryIndex } from "../../src/lib/office/protocolHistory";
import type { OfficeBeatV1 } from "../../src/lib/office/protocol";

const DAY = "2026-10-20";
const T0 = Date.UTC(2026, 9, 19, 17, 0, 0); // 00:00 WIB on 20 Oct
const id = (c: string) => c.repeat(64);
const beat = (session: string, over: Partial<OfficeBeatV1> = {}): OfficeBeatV1 => ({ v: 1, agent: "copilot", session, state: "working", activity: "editing", ts: 0, ...over });
const publicDoc = (): OfficeDoc => ({ ...emptyDoc(T0), publicRepos: ["ShinyQ/ShinyQ-HQ"] });
/** Applies beats in order, logging each step like the Durable Object does. */
function play(steps: [number, OfficeBeatV1][], doc = publicDoc()) {
  let log = emptyLog(DAY);
  for (const [at, b] of steps) {
    const next = applyBeat(doc, b, T0 + at);
    log = logDoc(log, doc, next, T0 + at);
    doc = next;
  }
  return { log, doc };
}

describe("day log", () => {
  it("logs a change with an ordinal, closes the previous event at the last beat, never serves the hash", () => {
    const { log, doc } = play([[1_000, beat(id("a"))], [50_000, beat(id("a"))], [60_000, beat(id("a"), { state: "ci", activity: "ci" })]]);
    expect(log.events).toEqual([[1, 0, 0, 0, 0, 50, 0], [60, 0, 0, 4, 6, null, 0]]);
    expect(log.keys).toEqual([id("a")]);
    const served = historyDay(log, doc);
    expect(JSON.stringify(served)).not.toMatch(/[0-9a-f]{64}/);
    expect(served.events.at(-1)?.[5]).toBe(60);
    expect(parseOfficeHistory(served)).not.toBeNull();
  });
  it("ignores keepalives and logs helper count changes", () => {
    const { log } = play([[0, beat(id("a"))], [15_000, beat(id("a"))], [20_000, beat(id("a"), { helpers: 3 })]]);
    expect(log.events.map((e) => e[6])).toEqual([0, 3]);
  });
  it("logs ten seats through seatOf, and a seat that moves without a beat of its own", () => {
    const ten: [number, OfficeBeatV1][] = Array.from({ length: 10 }, (_, i) => [i * 1000, beat(id(String.fromCharCode(97 + i)))]);
    expect(play(ten).log.events.map((e) => e[2])).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    // a (seat 0) goes quiet past 30 min; at b's next beat a is removed and f, the oldest back-row session, moves to seat 0.
    const six: [number, OfficeBeatV1][] = [..."abcdef"].map((c, i) => [i * 1000, beat(id(c))]);
    const keep: [number, OfficeBeatV1][] = [..."bcdef"].map((c) => [20 * 60_000, beat(id(c))]);
    const { log } = play([...six, ...keep, [31 * 60_000, beat(id("b"))]]);
    expect(log.events.at(-1)).toEqual([1860, 5, 0, 0, 0, null, 0]);
    expect(log.events.find((e) => e[1] === 0)?.[5]).toBe(0);
    expect(log.events.find((e) => e[1] === 5 && e[2] === 5)?.[5]).toBe(1200);
  });
  it("logs -1 for a session past the ten seats", () => {
    const steps: [number, OfficeBeatV1][] = Array.from({ length: 11 }, (_, i) => [i * 1000, beat(id(String.fromCharCode(97 + i)))]);
    expect(play(steps).log.events.at(-1)?.[2]).toBe(-1);
  });
  it("keeps a task only for a public repository, never a branch", () => {
    const { log } = play([[0, beat(id("a"), { repo: "ShinyQ/ShinyQ-HQ", branch: "feat/x", title: "Thing" })], [0, beat(id("b"), { repo: "ShinyQ/private-thing", title: "Secret" })]]);
    expect(log.tasks).toEqual({ "0": { repo: "ShinyQ/ShinyQ-HQ", title: "Thing" } });
  });
  it("logs merges, finished runs and production deploys only", () => {
    const { doc } = play([[0, beat(id("a"), { repo: "ShinyQ/ShinyQ-HQ", branch: "feat/x" })]]);
    const changes = [
      { type: "run", id: 9, attempt: 1, branch: "feat/x", title: "CI", url: "https://github.com/ShinyQ/ShinyQ-HQ/actions/runs/9", status: "running" },
      { type: "run", id: 9, attempt: 1, branch: "feat/x", title: "CI", url: "https://github.com/ShinyQ/ShinyQ-HQ/actions/runs/9", status: "failure" },
      { type: "pr", number: 7, branch: "feat/x", title: "Thing", url: "https://github.com/ShinyQ/ShinyQ-HQ/pull/7", action: "merged" },
      { type: "deploy", id: 3, title: "Deploy · preview", url: "https://github.com/ShinyQ/ShinyQ-HQ/deployments", status: "success", production: false },
      { type: "deploy", id: 4, title: "Deploy · production", url: "https://github.com/ShinyQ/ShinyQ-HQ/deployments", status: "success", production: true },
    ] as const;
    let log = emptyLog(DAY);
    let d = doc;
    changes.forEach((c, i) => {
      const next = applyGithub(d, { repo: "ShinyQ/ShinyQ-HQ", changes: [c] }, `d${i}`, T0 + (i + 1) * 10_000);
      log = logDoc(log, d, next, T0 + (i + 1) * 10_000);
      d = next;
    });
    expect(log.runs).toEqual([[10, 20, 0, 0, 0]]);
    expect(log.prs).toEqual([[30, 0, "ShinyQ/ShinyQ-HQ", 7, "Thing"]]);
    expect(log.deploys).toEqual([[50, 1]]);
    expect(scrubRepo(log, "ShinyQ/ShinyQ-HQ").prs).toEqual([[30, 0, "", 7, ""]]);
  });
  it("caps every list, marks the day truncated and stays under the byte cap", () => {
    const states = ["working", "thinking"] as const;
    const steps: [number, OfficeBeatV1][] = Array.from({ length: HISTORY.events + 20 }, (_, i) => [i * 1000, beat(id("a"), { state: states[i % 2], repo: "ShinyQ/ShinyQ-HQ", title: "T".repeat(80) })]);
    const { log } = play(steps);
    expect(log.events.length).toBeLessThanOrEqual(HISTORY.events);
    expect(log.truncated).toBe(true);
    expect(new TextEncoder().encode(JSON.stringify(log)).length).toBeLessThanOrEqual(HISTORY.maxBytes);
  });
  it("rolls over: closes yesterday from the doc and carries live sessions into today at t 0", () => {
    const { log, doc } = play([[86_000_000, beat(id("a"))]]);
    const closed = closeLog(log, doc);
    expect(closed.events[0][5]).toBe(86_000);
    const today = startLog("2026-10-21", doc);
    expect(today.events).toEqual([[0, 0, 0, 0, 0, null, 0]]);
    expect(secondsOf("2026-10-21", T0 + 86_000_000)).toBe(-400);
  });
  it("serves an index of 8 days, newest first, empty days as zeros", () => {
    const now = T0 + 3_600_000;
    const w = historyWindow(now);
    const idx = historyIndex(w, new Map([[logKey(DAY), play([[0, beat(id("a"))]]).log]]));
    expect(idx.days.map((d) => d.day)).toEqual(w);
    expect(idx.days[0]).toEqual({ day: DAY, events: 1, prs: 0, runs: 0, deploys: 0 });
    expect(idx.days[1]).toEqual({ day: w[1], events: 0, prs: 0, runs: 0, deploys: 0 });
    expect(parseOfficeHistoryIndex(idx)).not.toBeNull();
  });
  it("drops a repository no longer public and cleans titles at read time", () => {
    const { log, doc } = play([[0, beat(id("a"), { repo: "ShinyQ/ShinyQ-HQ", title: "Ship the secretword fix" })]]);
    expect(historyDay(log, { ...doc, publicRepos: [] }).tasks).toEqual({});
    const h = cleanHistory(historyDay(log, doc), ["ShinyQ/*"], ["secretword"]);
    expect(h.tasks["0"]).toEqual({ repo: "ShinyQ/ShinyQ-HQ" });
    expect(cleanHistory(historyDay(log, doc), ["Other/*"], []).tasks).toEqual({});
  });
});
```

- [ ] **Step 2:** `bun run test tests/office/history.test.ts`; expect FAIL.
- [ ] **Step 3: Implement.** In `state.ts`, add `export` to `seatFor`, `laneOrder` and `isProductionDeploy` (nothing else
  changes; `tests/office/state.test.ts` stays green untouched). Then `history.ts`:

```ts
import { OFFICE_ACTIVITIES, OFFICE_STATES, type OfficeAgent } from "../../../src/lib/office/protocol";
import { dayStart, OFFICE_HISTORY, type OfficeHistoryDeploy, type OfficeHistoryEvent, type OfficeHistoryIndexV1, type OfficeHistoryPr, type OfficeHistoryRun, type OfficeHistoryV1 } from "../../../src/lib/office/protocolHistory";
import { cleanTitle, repoAllowed } from "./ingest";
import { effective, isProductionDeploy, laneOrder, seatFor, seatOf, type OfficeDoc, type SessionRecord } from "./state";

/**
 * The replay log (design 7.1): one row per WIB day beside the doc, bounded. Built by diffing the doc before and after
 * every accepted beat or webhook, so a seat that moves because another session left is logged too. `keys` (the session
 * hashes) never leave the Durable Object; branches are never stored.
 */
export const HISTORY = { ...OFFICE_HISTORY, maxBytes: 120 * 1024 } as const;
// (LogEvent and DayLog from the Interfaces block)

export const logKey = (day: string) => `log:${day}`;
export const emptyLog = (day: string): DayLog => ({ v: 1, day, keys: [], agents: [], tasks: {}, events: [], prs: [], runs: [], deploys: [], truncated: false });
export const secondsOf = (day: string, ms: number) => Math.max(-HISTORY.carryS, Math.min(HISTORY.daySeconds, Math.floor((ms - dayStart(day)) / 1000)));
const fits = (log: DayLog) => new TextEncoder().encode(JSON.stringify(log)).length <= HISTORY.maxBytes;
const seatNo = (s: SessionRecord) => seatOf(s) ?? -1;
const same = (a: SessionRecord, b: SessionRecord) => a.state === b.state && a.activity === b.activity && seatNo(a) === seatNo(b) && (a.helpers ?? 0) === (b.helpers ?? 0);
const taskOf = (s: SessionRecord) => (s.repo ? { repo: s.repo, ...(s.title ? { title: s.title } : {}) } : null);
const eventOf = (t: number, n: number, s: SessionRecord): LogEvent => [t, n, seatNo(s), OFFICE_STATES.indexOf(s.state), OFFICE_ACTIVITIES.indexOf(s.activity), null, s.helpers ?? 0];

/** Closes ordinal `n`'s open event (if any) at `until`, in the caller's copy. */
function close(events: LogEvent[], n: number, until: number): void {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e[1] !== n) continue;
    if (e[5] === null) events[i] = [e[0], e[1], e[2], e[3], e[4], until, e[6]];
    return;
  }
}

export function logDoc(log: DayLog, before: OfficeDoc, after: OfficeDoc, now: number): DayLog {
  const t = Math.max(0, secondsOf(log.day, now));
  const events = log.events.slice();
  let { keys, agents, tasks, truncated } = log;
  let changed = false;
  const gone = new Map(before.sessions.map((s) => [s.id, s]));
  const added: LogEvent[] = [];
  for (const s of after.sessions) {
    const p = gone.get(s.id);
    gone.delete(s.id);
    let n = keys.indexOf(s.id);
    const task = taskOf(s);
    if (n >= 0 && task && JSON.stringify(tasks[n]) !== JSON.stringify(task)) ((tasks = { ...tasks, [n]: task }), (changed = true));
    if (p && same(p, s)) continue;
    if (n < 0) {
      if (keys.length >= HISTORY.sessions) {
        truncated = changed = true;
        continue;
      }
      n = keys.length;
      keys = [...keys, s.id];
      agents = [...agents, s.agent];
      if (task) tasks = { ...tasks, [n]: task };
    }
    if (p) close(events, n, secondsOf(log.day, p.lastBeat));
    added.push(eventOf(t, n, s));
    changed = true;
  }
  for (const [sid, p] of gone) {
    const n = keys.indexOf(sid);
    if (n >= 0) ((changed = true), close(events, n, secondsOf(log.day, p.lastBeat)));
  }
  const room = Math.max(0, HISTORY.events - events.length);
  if (added.length > room) truncated = true;
  events.push(...added.slice(0, room));
  const g = logGithub(log, before, after, now, t);
  if (g.changed) changed = true;
  if (!changed) return log;
  const out: DayLog = { ...log, keys, agents, tasks, events, prs: g.prs, runs: g.runs, deploys: g.deploys, truncated: truncated || g.truncated };
  if (fits(out)) return out;
  // Over the byte cap: keep the closes (they never grow the row), drop what this change added.
  return { ...log, events: log.events.map((e, i) => events[i] ?? e), truncated: true };
}

/** Merges (new `merged` feed items), finished runs (left running, or a new finished attempt) and production deploy results. */
function logGithub(log: DayLog, before: OfficeDoc, after: OfficeDoc, now: number, t: number) {
  const seen = new Set(before.feed.map((f) => `${f.key}:${f.status}`));
  const prs = log.prs.slice();
  const runs = log.runs.slice();
  const deploys = log.deploys.slice();
  let truncated = false;
  const push = <T>(list: T[], max: number, item: T) => (list.length < max ? list.push(item) : (truncated = true));
  for (const f of after.feed) {
    if (seen.has(`${f.key}:${f.status}`)) continue;
    if (f.kind === "pr" && f.status === "merged") {
      const pr = after.prs.find((p) => f.key === `pr:${p.repo}#${p.number}`);
      if (pr) push(prs, HISTORY.prs, [t, seatFor(after, pr.repo, pr.branch, now) ?? -1, pr.repo, pr.number, pr.title] as OfficeHistoryPr);
    } else if (isProductionDeploy(f) && (f.status === "success" || f.status === "failure")) push(deploys, HISTORY.deploys, [t, f.status === "success" ? 1 : 0] as OfficeHistoryDeploy);
  }
  for (const r of after.runs) {
    if (r.status === "running") continue;
    const b = before.runs.find((x) => x.id === r.id);
    if (b && b.status !== "running" && b.attempt === r.attempt) continue;
    const start = Math.min(t, Math.max(0, secondsOf(log.day, r.started ?? r.updated)));
    push(runs, HISTORY.runs, [start, t, seatFor(after, r.repo, r.branch, now) ?? -1, r.status === "success" ? 1 : 0, Math.min(HISTORY.jobs, laneOrder(r).length)] as OfficeHistoryRun);
  }
  const changed = prs.length !== log.prs.length || runs.length !== log.runs.length || deploys.length !== log.deploys.length || truncated;
  return { prs, runs, deploys, truncated, changed };
}

/** A new day's row: one carry-in event at t 0 for each session still live at the WIB midnight (its open `until` closes from its last beat, down to -1800). */
export function startLog(day: string, doc: OfficeDoc): DayLog {
  const midnight = dayStart(day);
  const live = doc.sessions.filter((s) => effective(s, midnight) !== null).slice(0, HISTORY.sessions);
  return {
    ...emptyLog(day),
    keys: live.map((s) => s.id),
    agents: live.map((s) => s.agent),
    tasks: Object.fromEntries(live.flatMap((s, n) => (taskOf(s) ? [[String(n), taskOf(s)!]] : []))),
    events: live.map((s, n) => eventOf(0, n, s)),
  };
}

/** Every open event closed from its session's `lastBeat` in `doc`, else at its own start. The same row when none is open. */
export function closeLog(log: DayLog, doc: OfficeDoc): DayLog {
  if (!log.events.some((e) => e[5] === null)) return log;
  const beats = new Map(doc.sessions.map((s) => [s.id, s.lastBeat]));
  return {
    ...log,
    events: log.events.map((e) => {
      if (e[5] !== null) return e;
      const last = beats.get(log.keys[e[1]]);
      return [e[0], e[1], e[2], e[3], e[4], last === undefined ? e[0] : secondsOf(log.day, last), e[6]];
    }),
  };
}

export function scrubRepo(log: DayLog, repo: string): DayLog {
  const tasks = Object.fromEntries(Object.entries(log.tasks).filter(([, v]) => v.repo !== repo));
  return { ...log, tasks, prs: log.prs.map((p) => (p[2] === repo ? [p[0], p[1], "", p[3], ""] : p)) };
}

export function historyIndex(window: readonly string[], rows: ReadonlyMap<string, DayLog>): OfficeHistoryIndexV1 {
  return {
    v: 1,
    days: window.map((day) => {
      const r = rows.get(logKey(day));
      return { day, events: r?.events.length ?? 0, prs: r?.prs.length ?? 0, runs: r?.runs.length ?? 0, deploys: r?.deploys.length ?? 0 };
    }),
  };
}

/** The served day: no `keys`, open events closed, tasks and merges only for repositories still in `doc.publicRepos`. */
export function historyDay(log: DayLog, doc: OfficeDoc): OfficeHistoryV1 {
  const c = closeLog(log, doc);
  const pub = new Set(doc.publicRepos);
  return {
    v: 1,
    day: c.day,
    start: dayStart(c.day),
    agents: c.agents,
    tasks: Object.fromEntries(Object.entries(c.tasks).filter(([, v]) => pub.has(v.repo))),
    events: c.events as OfficeHistoryEvent[],
    prs: c.prs.map((p) => (pub.has(p[2]) ? p : [p[0], p[1], "", p[3], ""])),
    runs: c.runs,
    deploys: c.deploys,
    truncated: c.truncated,
  };
}

/** The Worker's read-time pass: the allowlist on every repository and `cleanTitle` (the current blocklist) on every title. */
export function cleanHistory(h: OfficeHistoryV1, allow: readonly string[], blocklist: readonly string[]): OfficeHistoryV1 {
  const ok = (repo: string) => repo !== "" && repoAllowed(repo, allow);
  const tasks = Object.fromEntries(
    Object.entries(h.tasks).flatMap(([n, v]) => {
      if (!ok(v.repo)) return [];
      const title = v.title ? cleanTitle(v.title, blocklist) : null;
      return [[n, title ? { repo: v.repo, title } : { repo: v.repo }]];
    }),
  );
  const prs = h.prs.map((p): OfficeHistoryPr => {
    const title = ok(p[2]) ? cleanTitle(p[4], blocklist) : null;
    return title ? [p[0], p[1], p[2], p[3], title] : [p[0], p[1], "", p[3], ""];
  });
  return { ...h, tasks, prs };
}
```

- [ ] **Step 4:** Run `bun run test tests/office/`; expected PASS (the state goldens untouched).
- [ ] **Step 5:** Commit `feat(office): the bounded day log for replay`.

### Task 3: The Durable Object writes, rolls over, prunes and serves history

**Files:**
- Modify: `workers/office/src/types.ts`, `workers/office/src/office.ts`
- Test: `tests/office/worker.test.ts`

**Interfaces:**
- Produces (`types.ts`, the SQLite-backed storage API members this Worker now uses):

```ts
export interface DurableObjectStateLike {
  storage: {
    get<T>(key: string): Promise<T | undefined>;
    get<T>(keys: string[]): Promise<Map<string, T>>;
    put<T>(key: string, value: T): Promise<void>;
    put(entries: Record<string, unknown>): Promise<void>;
    delete(keys: string[]): Promise<number>;
    list<T>(options: { prefix: string; end?: string }): Promise<Map<string, T>>;
  };
}
```

- Produces (Durable Object routes): `GET /history` (the index over `historyWindow(now)`), `GET /history?day=YYYY-MM-DD`
  (`historyDay` of a day in the window, `404` otherwise); both read-only.

- [ ] **Step 1: Tests first.** `memoryStorage()` in `tests/office/worker.test.ts` gains the four members (a `Map`, `list`
  filtered by prefix and `end`, sorted keys) and counts rows written per call (`writes`); the test at the old
  `{ get, put }` stub (counting puts) builds on `memoryStorage()` instead. New cases:
  - a beat that changes state writes `doc` and `log:<today>` in one `put`; a keepalive writes `doc` alone; a webhook
    that merges a PR adds a `prs` entry to today's row in the same `put` as the doc;
  - a beat that removes a quiet session and moves a back-row one forward logs the moved seat (seat 0) for a session
    that did not beat;
  - the first write on a new WIB day writes three rows (the doc, yesterday's row with its open events closed, today's
    row starting with the carry-ins), and with rows for 10 days stored only 8 `log:` keys remain afterwards;
  - a cold start mid-day (a new `Office` over the same storage) appends to the stored row, never replaces it;
  - a `privatized` delivery rewrites every stored row with `scrubRepo` (no title or repo of that repository left in any
    `log:` value);
  - `GET /history` answers `historyIndex` (8 days, counts); `GET /history?day=` answers a valid `OfficeHistoryV1` for
    today and for a stored past day, an empty day for a day in the window without a row, `404` for a day outside the
    window or a malformed one; neither writes a row; no response contains a 64-hex string.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3: Implement** in `office.ts` (keep `load`, `save` and `migrateDoc` as they are; `/beat` and `/github` save
  through `commit`):

```ts
  private log: DayLog | null = null;

  /** Today's row, and on the first write of a new WIB day yesterday's row closed (null when it has nothing open). */
  private async logs(doc: OfficeDoc, now: number): Promise<{ log: DayLog; closed: DayLog | null; fresh: boolean }> {
    const day = wibDay(now);
    if (this.log?.day === day) return { log: this.log, closed: null, fresh: false };
    const stored = await this.ctx.storage.get<DayLog>(logKey(day));
    if (stored) return { log: stored, closed: null, fresh: false };
    const prev = this.log ?? (await this.ctx.storage.get<DayLog>(logKey(wibDay(now - 86_400_000)))) ?? null;
    const closed = prev ? closeLog(prev, doc) : null;
    return { log: startLog(day, doc), closed: closed !== prev ? closed : null, fresh: true };
  }

  /** Saves `next` with the log rows it changes in one put (one transaction); a keepalive writes the doc row alone. */
  private async commit(before: OfficeDoc, next: OfficeDoc, now: number): Promise<void> {
    const { log, closed, fresh } = await this.logs(before, now);
    const logged = logDoc(log, before, next, now);
    const rows: Record<string, unknown> = {};
    if (logged !== log || fresh) rows[logKey(logged.day)] = logged;
    if (closed) rows[logKey(closed.day)] = closed;
    if (Object.keys(rows).length) await this.ctx.storage.put({ [DOC_KEY]: next, ...rows });
    else await this.ctx.storage.put(DOC_KEY, next);
    this.doc = next;
    this.log = logged;
    if (fresh) await this.prune(now);
  }

  /** Deletes log rows older than the 8-day window (normally one, on the first write of a day). */
  private async prune(now: number): Promise<void> {
    const oldest = historyWindow(now).at(-1)!;
    const stale = await this.ctx.storage.list<DayLog>({ prefix: "log:", end: logKey(oldest) });
    if (stale.size) await this.ctx.storage.delete([...stale.keys()]);
  }

  /** A privatized repository leaves no name or title in any stored row (at most 8). */
  private async scrub(repo: string): Promise<void> {
    const rows = await this.ctx.storage.list<DayLog>({ prefix: "log:" });
    const changed: Record<string, DayLog> = {};
    for (const [key, row] of rows) {
      const next = scrubRepo(row, repo);
      if (JSON.stringify(next) !== JSON.stringify(row)) changed[key] = next;
    }
    if (Object.keys(changed).length) await this.ctx.storage.put(changed);
    if (this.log) this.log = scrubRepo(this.log, repo);
  }
```

  In `fetch`: `/beat` becomes `await this.commit(doc, applyBeat(doc, beat, now), now)`; `/github` computes `next`, returns
  204 when `next === doc`, calls `this.scrub(body.update.repo)` first when a change is `privatized`, then
  `this.commit(doc, next, now)`. The history route (before the POST routes):

```ts
    if (pathname === "/history") {
      if (request.method !== "GET") return status(405);
      const doc = await this.load();
      const now = this.now();
      const window = historyWindow(now);
      const day = searchParams.get("day");
      const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json; charset=utf-8" } });
      if (day === null) return json(historyIndex(window, await this.ctx.storage.get<DayLog>(window.map(logKey))));
      if (!window.includes(day)) return status(404);
      const log = this.log?.day === day ? this.log : ((await this.ctx.storage.get<DayLog>(logKey(day))) ?? emptyLog(day));
      return json(historyDay(log, doc));
    }
```

- [ ] **Step 4:** Run `bun run test tests/office/`; expected PASS.
- [ ] **Step 5:** Commit `feat(office): the Durable Object keeps 8 days of logs and serves them`.

**Free limits** (Workers free plan; the SQLite-backed Durable Object's 100,000 rows written and 5,000,000 rows read a
day, 5 GB stored, 100,000 Durable Object requests a day, the 2 MB value limit):

| Item | Busy day (all ten seats used: 10 sessions, about 2,800 state, seat or helper changes, 60 merges, 200 runs, 10 deploys) | Limit |
|---|---|---|
| Today's row | about 95 KB (events about 78 KB, merges about 10 KB, runs about 4 KB, keys and tasks about 2 KB); a busier day stops at 3,000 events or 120 KB and says `truncated` | 120 KB cap (2 MB value limit) |
| Rows written | the doc row on every accepted beat or webhook as today (about 3,000 to 7,000), plus a log row on each loggable change (about 3,100), plus 3 at the rollover: under about 10,000 | 100,000 a day |
| Rows read | the doc and today's row once per cold start; the index reads 8 rows and a day 1 per edge cache miss (30 s per data center for the index and today, 1 h for past days) | 5,000,000 a day |
| Stored | at most 8 log rows (under 1 MB) plus the doc | 5 GB |
| Durable Object requests | history only on edge cache misses: at most about 5,900 a day per data center under continuous load (index and today every 30 s, 7 past days every hour), far fewer in practice (a visitor's replay asks the index once and a day once per loop start) | 100,000 a day, shared with beats, webhooks and snapshot reads |
| Pages Function requests | about 2 per replay start (index and day), about 1,000 on a day of 500 L1 sessions | 100,000 a day, shared |
| CPU | `logDoc` serializes the row once per loggable change to check its size (at most 120 KB, about 1 ms) | free plan CPU per request |

### Task 4: The Worker's history route

**Files:**
- Modify: `workers/office/src/worker.ts`
- Test: `tests/office/worker.test.ts`

- [ ] **Step 1: Tests first:** `GET /history` forwards to the Durable Object's `/history` without a query (any query
  but a valid `day` is dropped, so `?day=x` and `?foo=1` are a 404 and never reach the Durable Object with that query);
  `GET /history?day=<valid>` forwards that day only and returns the body after `cleanHistory` (a title with a
  blocklisted term from the fixture blocklist gone, a repository outside `OFFICE_REPO_ALLOWLIST` emptied); a non-GET is
  405; a Durable Object 404 passes through; `Cache-Control: no-store` on errors as for the other routes.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3: Implement** (before the `/beat` branch):

```ts
      if (pathname === "/history") {
        if (request.method !== "GET") return status(405);
        const day = searchParams.get("day");
        if (day !== null && !/^\d{4}-\d{2}-\d{2}$/.test(day)) return status(404);
        const res = await office.fetch(`${DO_BASE}/history${day === null ? "" : `?day=${day}`}`);
        // The index carries counts only; a day's titles and repositories pass the allowlist and the current blocklist again.
        if (!res.ok || day === null) return res;
        const clean = cleanHistory((await res.json()) as OfficeHistoryV1, parseAllowlist(env.OFFICE_REPO_ALLOWLIST), deps.blocklist);
        return new Response(JSON.stringify(clean), { headers: { "Content-Type": "application/json; charset=utf-8" } });
      }
```

  Update the route comment at `createOfficeWorker` (GET /history, GET /history?day=).
- [ ] **Step 4:** Run `bun run test tests/office/`; expected PASS.
- [ ] **Step 5:** Commit `feat(office): the Worker serves cleaned history`.

### Task 5: The public endpoint

**Files:**
- Modify: `functions/_lib/office.ts`
- Create: `functions/api/office/history.ts`
- Test: `tests/office/history-endpoint.test.ts`

**Interfaces:**
- Produces:

```ts
/** One history route, on the VERSIONS pattern: its canonical edge cache key, the Worker URL, the validator and its Cache-Control. */
export interface HistoryRoute {
  key: string;
  worker: string;
  parse: (raw: unknown) => OfficeHistoryIndexResponse | OfficeHistoryResponse | null;
  cache: string;
}
export function historyRoute(url: URL, now: number): HistoryRoute | null; // null: any other query (the fixed 404)
export function createOfficeHistoryHandler(opts?: { cache?: () => EdgeCache | null; now?: () => number }): (ctx: PagesContext<OfficeEnv>) => Promise<Response>;
```

- [ ] **Step 1: Tests first** `tests/office/history-endpoint.test.ts` (the fake cache, `ctx` and `officeEnv` helpers of
  `tests/office/office-endpoint.test.ts`, moved to `tests/helpers/office-endpoint.ts` if they are local there):

```ts
it("serves the index and a day with ETag and caching; junk is a 404 without echo", async () => {
  const h = createOfficeHistoryHandler({ cache: () => cache, now: () => NOW });
  const index = await h(ctx("https://x/api/office/history", env));
  expect(index.status).toBe(200);
  expect(index.headers.get("X-Content-Type-Options")).toBe("nosniff");
  expect(index.headers.get("Cache-Control")).toBe("public, max-age=30, stale-while-revalidate=60");
  const today = await h(ctx(`https://x/api/office/history?day=${wibDay(NOW)}`, env));
  expect(today.headers.get("Cache-Control")).toBe("public, max-age=30, stale-while-revalidate=60");
  const pastDay = wibDay(NOW - 2 * 86_400_000);
  const past = await h(ctx(`https://x/api/office/history?day=${pastDay}`, env));
  expect(past.headers.get("Cache-Control")).toBe("public, max-age=3600, stale-while-revalidate=86400");
  const etag = past.headers.get("ETag")!;
  expect((await h(ctx(`https://x/api/office/history?day=${pastDay}`, env, { "If-None-Match": etag }))).status).toBe(304);
  for (const q of ["?day=2020-01-01", "?day=%3Cscript%3E", `?day=${wibDay(NOW)}&x=1`, `?day=${wibDay(NOW)}&day=${pastDay}`, "?foo=bar", `?DAY=${wibDay(NOW)}`]) {
    const r = await h(ctx(`https://x/api/office/history${q}`, env));
    expect(r.status).toBe(404);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    expect(await r.text()).toBe('{"v":1,"error":"day"}');
  }
  expect(cache.keys().every((k) => /\/api\/office\/history(\?day=\d{4}-\d{2}-\d{2})?$/.test(k))).toBe(true);
  expect(worker.calls()).toBe(3);
});
it("answers disabled when the office is off, and 503 when the Worker is missing, down or invalid", async () => {
  const h = createOfficeHistoryHandler({ cache: () => null, now: () => NOW });
  expect(await (await h(ctx("https://x/api/office/history", { ...env, OFFICE_ENABLED: "false" }))).json()).toEqual({ v: 1, enabled: false });
  expect((await h(ctx("https://x/api/office/history", { ...env, OFFICE: undefined }))).status).toBe(503);
  const bad = officeEnv({ history: () => ({ v: 1, day: "x" }) });
  const r = await h(ctx(`https://x/api/office/history?day=${wibDay(NOW)}`, bad));
  expect(r.status).toBe(503);
  expect(r.headers.get("Cache-Control")).toBe("no-store");
  const gone = officeEnv({ historyStatus: 404 });
  expect((await h(ctx(`https://x/api/office/history?day=${wibDay(NOW)}`, gone))).status).toBe(404);
  expect((await h(ctx("https://x/api/office/history", gone))).status).toBe(503);
});
it("answers HEAD with headers only and rejects other methods", async () => {
  const h = createOfficeHistoryHandler({ cache: () => null, now: () => NOW });
  const head = await h(ctx("https://x/api/office/history", env, {}, "HEAD"));
  expect(head.status).toBe(200);
  expect(await head.text()).toBe("");
  expect((await h(ctx("https://x/api/office/history", env, {}, "POST"))).status).toBe(405);
});
```

- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3: Implement** in `functions/_lib/office.ts`, next to `VERSIONS` and reusing `jsonAnswer` (its value type
  widened to the history responses), `conditional`, `noStore` and `defaultCache`:

```ts
const HISTORY_RECENT = "public, max-age=30, stale-while-revalidate=60";
const HISTORY_PAST = "public, max-age=3600, stale-while-revalidate=86400";
const HISTORY_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The history routes, like VERSIONS: no query is the index; exactly one `day` inside the 8-day WIB window is that day
 * (today cached like the index, past days for an hour: not immutable, a privatize can scrub them); anything else null.
 * The key is built from the validated values, never the raw URL, so junk queries cannot fill the cache.
 */
export function historyRoute(url: URL, now: number): HistoryRoute | null {
  const names = [...url.searchParams.keys()];
  if (names.length === 0) return { key: OFFICE_HISTORY_PATH, worker: `${WORKER}/history`, parse: parseOfficeHistoryIndex, cache: HISTORY_RECENT };
  const day = url.searchParams.get("day");
  if (names.length !== 1 || names[0] !== "day" || day === null || !HISTORY_DAY.test(day) || !historyWindow(now).includes(day)) return null;
  return { key: `${OFFICE_HISTORY_PATH}?day=${day}`, worker: `${WORKER}/history?day=${day}`, parse: parseOfficeHistory, cache: day === wibDay(now) ? HISTORY_RECENT : HISTORY_PAST };
}

const notFoundDay = () => new Response('{"v":1,"error":"day"}', { status: 404, headers: { "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" } });

/**
 * `GET /api/office/history` (the 8-day index) and `GET /api/office/history?day=YYYY-MM-DD` (one WIB day) from the
 * hq-office Worker, validated again, edge-cached per canonical key, with an ETag (304 on a matching If-None-Match).
 * A Worker 404 for a day (the window turned over between the edge and the Durable Object) is the fixed 404; any other
 * failure a 503 with no-store (the client shows "Replay unavailable").
 */
export function createOfficeHistoryHandler(opts: { cache?: () => EdgeCache | null; now?: () => number } = {}) {
  const cacheOf = opts.cache ?? defaultCache;
  const now = opts.now ?? Date.now;
  return async function handle({ request, env, waitUntil }: PagesContext<OfficeEnv>): Promise<Response> {
    const method = request.method;
    if (method !== "GET" && method !== "HEAD") return noStore(405, { Allow: "GET, HEAD" });
    if (env.OFFICE_ENABLED !== "true") return conditional(request, await jsonAnswer({ v: 1, enabled: false }, DISABLED_CACHE));
    const route = historyRoute(new URL(request.url), now());
    if (!route) return notFoundDay();
    if (!env.OFFICE) return noStore(503);
    const cache = cacheOf();
    const key = new Request(new URL(route.key, request.url).toString(), { method: "GET" });
    const hit = await cache?.match(key);
    if (hit) return conditional(request, hit);
    let value: ReturnType<HistoryRoute["parse"]> = null;
    try {
      const res = await env.OFFICE.fetch(route.worker);
      if (res.status === 404 && route.key !== OFFICE_HISTORY_PATH) return notFoundDay();
      value = res.ok ? route.parse(await res.json()) : null;
    } catch {
      value = null;
    }
    if (!value) return noStore(503);
    const out = await jsonAnswer(value, route.cache);
    if (cache) waitUntil(cache.put(key, out.clone()));
    return conditional(request, out);
  };
}
```

  `functions/api/office/history.ts`:

```ts
import { createOfficeHistoryHandler } from "../../_lib/office";
import type { OfficeEnv, PagesContext } from "../../_lib/types";

/** Agent Office: `GET /api/office/history` and `?day=YYYY-MM-DD` serve the replay history from the hq-office Worker (docs/agents/office.md). */
const handler = createOfficeHistoryHandler();
export const onRequest = (context: PagesContext<OfficeEnv>) => handler(context);
```

  Check that `public/_headers` and the CSP tests need no change (same origin, `connect-src 'self'`).
- [ ] **Step 4:** Run `bun run test tests/office/ tests/unit/csp.test.ts`; expected PASS.
- [ ] **Step 5:** Commit `feat(office): GET /api/office/history`.

### Task 6: The replay engine (pure)

**Files:**
- Create: `src/experience/floors/lobby/office/replay.ts`, `tests/helpers/office-history.ts`
- Test: `tests/unit/office-replay.test.ts`

**Interfaces:**
- Produces:

```ts
/** Playback (design 7.3). */
export const REPLAY = { minS: 30, maxS: 60, gapS: 600, gapPlayS: 1.5, activePerS: 600, tailS: 30, shipS: 120, deployRunS: 3, restS: 6, idleS: 30, tickS: 0.25, stepS: 3600, retryS: 300 } as const;
/** The live time rules in seconds, mirrored from TIMING in workers/office/src/state.ts (a test pins them equal). */
export const RULES = { thinkingAfter: 20, asleepAfter: 180, longWaitAsleepAfter: 900, removeAfter: 1800, doneFor: 20, helpersTtl: 600 } as const;
/** Day seconds `from` to `to` play from `play0` to `play1` playback seconds. */
export interface Span { from: number; to: number; play0: number; play1: number }
export interface ReplayPlan { day: string; spans: Span[]; duration: number; byN: number[][]; doneAt: number[] }
export function planReplay(h: OfficeHistoryV1): ReplayPlan | null;          // null: nothing to play
export function dayTime(plan: ReplayPlan, playS: number): number;            // playback seconds to day seconds
export function playTime(plan: ReplayPlan, dayS: number): number;            // the inverse, clamped to the plan
/** The v4-shaped snapshot at `playS`, its times on a playback clock that started at epoch ms `epoch`. */
export function snapshotAt(h: OfficeHistoryV1, plan: ReplayPlan, playS: number, epoch: number): OfficeFeedSnapshot;
```

- Consumes: `OfficeHistoryV1` (Task 1), `OfficeFeedSnapshot` (`poll.ts`), the protocol enums.

- [ ] **Step 1: Tests first** `tests/unit/office-replay.test.ts` (`makeHistory` generates valid `OfficeHistoryV1` days from
  a seeded sequence over up to ten seats with helpers, quiet gaps, merges, runs and deploys; `expectedState(h, n, T)`
  rebuilds ordinal `n`'s record at day second `T` (state and activity of its latest event, `since` its first event of
  the same state and activity, `lastBeat` `min(T, until)`) and returns `effective` from
  `workers/office/src/state.ts` at `T` with `effectiveHelpers`, or null; `ordinalAt(h, slot, T)` is the ordinal whose
  latest event at or before `T` sits on `slot`):

```ts
import { describe, expect, it } from "vitest";
import { parseOfficeResponseV4 } from "@/lib/office/protocolV4";
import { dayTime, planReplay, playTime, REPLAY, RULES, snapshotAt } from "@/experience/floors/lobby/office/replay";
import { TIMING } from "../../workers/office/src/state";
import { expectedState, makeHistory, ordinalAt } from "../helpers/office-history";

const EPOCH = Date.UTC(2026, 9, 21, 3, 0, 0);

describe("replay engine", () => {
  it("mirrors the Worker's time rules", () => {
    expect(RULES).toEqual({ thinkingAfter: TIMING.thinkingAfter / 1000, asleepAfter: TIMING.asleepAfter / 1000, longWaitAsleepAfter: TIMING.longWaitAsleepAfter / 1000, removeAfter: TIMING.removeAfter / 1000, doneFor: TIMING.doneFor / 1000, helpersTtl: TIMING.helpersTtl / 1000 });
  });
  it("compresses quiet gaps and clamps every day to 30 to 60 s; nothing to play is null", () => {
    for (const h of [makeHistory({ seats: 10, hours: 12, changesPerHour: 240 }), makeHistory({ seats: 1, hours: 1, changesPerHour: 2 }), makeHistory({ seats: 3, hours: 8, changesPerHour: 30, quietGaps: 6 })]) {
      const p = planReplay(h)!;
      expect(p.duration).toBeGreaterThanOrEqual(REPLAY.minS - 1e-9);
      expect(p.duration).toBeLessThanOrEqual(REPLAY.maxS + 1e-9);
      for (let s = 0; s <= p.duration; s += 0.5) expect(playTime(p, dayTime(p, s))).toBeCloseTo(s, 6);
    }
    expect(planReplay(makeHistory({ seats: 0, hours: 0, changesPerHour: 0 }))).toBeNull();
  });
  it("matches the live rules (effective) for every desk at every sampled moment, both rows, helpers included", () => {
    const h = makeHistory({ seats: 10, hours: 3, changesPerHour: 60, quietGaps: 2, helpers: true });
    const p = planReplay(h)!;
    for (let s = 0; s < p.duration; s += 0.25) {
      const snap = snapshotAt(h, p, s, EPOCH);
      const T = dayTime(p, s);
      for (const d of snap.desks) {
        const want = expectedState(h, ordinalAt(h, d.slot, T), T);
        expect(d.state).toBe(want?.state);
        expect(d.helpers ?? 0).toBe(want?.helpers ?? 0);
      }
      expect(snap.desks.every((d) => d.slot >= 0 && d.slot < 10)).toBe(true);
      expect(new Set(snap.desks.map((d) => d.slot)).size).toBe(snap.desks.length);
    }
  });
  it("is a valid v4 snapshot apart from the replay-only run fields, and never shows a hash or a non-public title", () => {
    const h = makeHistory({ seats: 4, hours: 2, changesPerHour: 20, prs: 5, privatePrs: 2, runs: 3, deploys: 1 });
    const p = planReplay(h)!;
    const snap = snapshotAt(h, p, p.duration / 2, EPOCH);
    const plain = { ...snap, pipeline: { runs: [], ships: snap.pipeline!.ships } };
    expect(parseOfficeResponseV4(plain)).not.toBeNull();
    expect(JSON.stringify(snap)).not.toMatch(/[0-9a-f]{64}/);
    expect(snap.github.every((g) => g.repo !== "" && g.title !== "")).toBe(true);
  });
  it("counts merges for the tiles and the dock in merge order, runs and deploys as pipeline state", () => {
    const h = makeHistory({ seats: 1, hours: 2, changesPerHour: 10, prs: 5, runs: 2, deploys: 1 });
    const p = planReplay(h)!;
    expect(snapshotAt(h, p, 0, EPOCH).today.prsMerged).toBe(0);
    expect(snapshotAt(h, p, p.duration, EPOCH).today.prsMerged).toBe(5);
    const [run] = h.runs;
    const mid = snapshotAt(h, p, playTime(p, (run[0] + run[1]) / 2), EPOCH).pipeline!.runs.find((r) => r.status === "running")!;
    expect(mid.jobs.filter((j) => j.status === "done").length).toBeGreaterThan(0);
    expect(mid.jobs.some((j) => j.status === "queued" || j.status === "running")).toBe(true);
    const [deploy] = h.deploys;
    const before = snapshotAt(h, p, playTime(p, deploy[0]) - 1, EPOCH).pipeline!.ships.find((s) => s.kind === "deploy");
    expect(before?.status).toBe("running");
    const after = snapshotAt(h, p, playTime(p, deploy[0]) + 0.1, EPOCH).pipeline!.ships.find((s) => s.kind === "deploy");
    expect(after?.status).toBe(deploy[1] ? "success" : "failure");
  });
  it("times every snapshot on the playback clock", () => {
    const h = makeHistory({ seats: 2, hours: 1, changesPerHour: 10 });
    const p = planReplay(h)!;
    expect(snapshotAt(h, p, 12, EPOCH).updatedAt).toBe(EPOCH + 12_000);
  });
});
```

- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3: Implement** `replay.ts`:

```ts
import type { OfficeFeedSnapshot } from "@/lib/office/poll";
import { OFFICE_ACTIVITIES, OFFICE_FEED, OFFICE_FEED_TITLE_MAX, OFFICE_PIPELINE, OFFICE_SEATS, OFFICE_STATES, type OfficeDeskV2, type OfficeGithubItem, type OfficePipelineRun, type OfficeShip, type OfficeState } from "@/lib/office/protocol";
import type { OfficeHistoryRun, OfficeHistoryV1 } from "@/lib/office/protocolHistory";

// (REPLAY, RULES, Span, ReplayPlan from the Interfaces block)
const LONG: readonly OfficeState[] = ["testing", "ci", "input"];
const DAY_S = 86_400;

/** Day seconds where something happens: an awake event until its session would sleep, a merge or deploy plus 30 s, a run from start to end plus 30 s. */
function busy(h: OfficeHistoryV1): [number, number][] {
  const out: [number, number][] = [];
  for (const [t, , , s, , until] of h.events) {
    const state = OFFICE_STATES[s];
    if (state !== "asleep") out.push([t, Math.max(t, until) + (LONG.includes(state) ? RULES.longWaitAsleepAfter : RULES.asleepAfter)]);
  }
  for (const [t] of h.prs) out.push([t, t + REPLAY.tailS]);
  for (const [t] of h.deploys) out.push([t, t + REPLAY.tailS]);
  for (const [t, end] of h.runs) out.push([t, end + REPLAY.tailS]);
  return out.sort((a, b) => a[0] - b[0]);
}

export function planReplay(h: OfficeHistoryV1): ReplayPlan | null {
  const raw = busy(h);
  if (!raw.length) return null;
  // Active stretches: a quiet gap of at most gapS joins its neighbours; longer gaps play in gapPlayS each (less when there are many).
  const runs: [number, number][] = [];
  for (const [a, b] of raw) {
    const last = runs.at(-1);
    if (last && a - last[1] <= REPLAY.gapS) last[1] = Math.max(last[1], Math.min(b, DAY_S));
    else runs.push([a, Math.min(b, DAY_S)]);
  }
  const active = runs.reduce((s, [a, b]) => s + (b - a), 0);
  const gaps = runs.length - 1;
  const gapPlay = gaps ? Math.min(REPLAY.gapPlayS, REPLAY.maxS / 2 / gaps) : 0;
  const total = Math.min(REPLAY.maxS, Math.max(REPLAY.minS, gaps * gapPlay + active / REPLAY.activePerS));
  const rate = (total - gaps * gapPlay) / Math.max(1, active);
  const spans: Span[] = [];
  let p = 0;
  runs.forEach(([a, b], i) => {
    if (i > 0) spans.push({ from: runs[i - 1][1], to: a, play0: p, play1: (p += gapPlay) });
    spans.push({ from: a, to: b, play0: p, play1: (p += (b - a) * rate) });
  });
  const byN: number[][] = h.agents.map(() => []);
  const doneAt: number[] = [];
  h.events.forEach((e, i) => {
    const prev = byN[e[1]].at(-1);
    if (OFFICE_STATES[e[3]] === "done" && (prev === undefined || h.events[prev][3] !== e[3])) doneAt.push(e[0]);
    byN[e[1]].push(i);
  });
  return { day: h.day, spans, duration: p, byN, doneAt };
}

const lerp = (x: number, a: number, b: number, c: number, d: number) => (b === a ? c : c + ((x - a) * (d - c)) / (b - a));

export function dayTime(plan: ReplayPlan, playS: number): number {
  const s = plan.spans.find((x) => playS <= x.play1) ?? plan.spans.at(-1)!;
  return lerp(Math.max(s.play0, Math.min(s.play1, playS)), s.play0, s.play1, s.from, s.to);
}

export function playTime(plan: ReplayPlan, dayS: number): number {
  const s = plan.spans.find((x) => dayS <= x.to) ?? plan.spans.at(-1)!;
  return lerp(Math.max(s.from, Math.min(s.to, dayS)), s.from, s.to, s.play0, s.play1);
}

interface DeskAt { n: number; t: number; seat: number; state: OfficeState; activity: (typeof OFFICE_ACTIVITIES)[number]; since: number; helpers: number }

/** Ordinal `n` at day second `T` under the live rules (`effective`, `effectiveHelpers`) with `min(T, until)` as its last beat; null before its first event or once removed. */
function deskAt(h: OfficeHistoryV1, plan: ReplayPlan, n: number, T: number): DeskAt | null {
  const idx = plan.byN[n];
  let k = -1;
  while (k + 1 < idx.length && h.events[idx[k + 1]][0] <= T) k++;
  if (k < 0) return null;
  const e = h.events[idx[k]];
  let first = k;
  while (first > 0 && h.events[idx[first - 1]][3] === e[3] && h.events[idx[first - 1]][4] === e[4]) first--;
  const beat = Math.min(T, e[5]);
  const quiet = T - beat;
  if (quiet >= RULES.removeAfter) return null;
  let state = OFFICE_STATES[e[3]];
  let activity = OFFICE_ACTIVITIES[e[4]];
  let since = h.events[idx[first]][0];
  if (state === "done") {
    if (T - since >= RULES.doneFor) [state, activity, since] = ["asleep", "resting", since + RULES.doneFor];
  } else if (state !== "asleep" && state !== "failed") {
    const sleep = LONG.includes(state) ? RULES.longWaitAsleepAfter : RULES.asleepAfter;
    if (quiet >= sleep) [state, activity, since] = ["asleep", "resting", beat + sleep];
    else if ((state === "working" || state === "reviewing") && quiet >= RULES.thinkingAfter) [state, activity, since] = ["thinking", "planning", beat + RULES.thinkingAfter];
  }
  const helpers = state !== "asleep" && quiet < RULES.helpersTtl ? e[6] : 0;
  return { n, t: e[0], seat: e[2], state, activity, since, helpers };
}

/** A finished or running run's lanes: done in order over its span, the last lane failed when it failed. */
function runAt(r: OfficeHistoryRun, i: number, T: number, at: (s: number) => number): OfficePipelineRun {
  const [t, end, seat, ok, jobs] = r;
  const n = Math.max(1, jobs);
  const running = T < end;
  const k = running ? Math.floor((n * (T - t)) / Math.max(1, end - t)) : n;
  return {
    id: -(i + 1),
    repo: "",
    title: "",
    url: "",
    status: running ? "running" : ok ? "success" : "failure",
    ...(seat >= 0 ? { slot: seat } : {}),
    at: at(t),
    jobs: Array.from({ length: n }, (_, j) => ({ name: "Job", status: j < k ? (!running && !ok && j === n - 1 ? "failed" : "done") : j === k ? "running" : "queued" })),
  };
}

export function snapshotAt(h: OfficeHistoryV1, plan: ReplayPlan, playS: number, epoch: number): OfficeFeedSnapshot {
  const T = dayTime(plan, playS);
  const at = (dayS: number) => Math.round(epoch + playTime(plan, dayS) * 1000);
  const all = h.agents.map((_, n) => deskAt(h, plan, n, T)).filter((d): d is DeskAt => d !== null);
  // One desk per seat: the latest event wins (seats are unique in the live office; this guards a truncated day).
  const taken = new Set<number>();
  const desks: OfficeDeskV2[] = [];
  let extra = 0;
  for (const d of [...all].sort((a, b) => b.t - a.t)) {
    if (d.seat < 0 || d.seat >= OFFICE_SEATS || taken.has(d.seat)) {
      extra++;
      continue;
    }
    taken.add(d.seat);
    const task = h.tasks[d.n];
    desks.push({ slot: d.seat, agent: h.agents[d.n], state: d.state, activity: d.activity, since: at(d.since), ...(task ? { repo: task.repo, ...(task.title ? { title: task.title } : {}) } : {}), recent: [], ...(d.helpers ? { helpers: d.helpers } : {}) });
  }
  const merged = h.prs.filter((p) => p[0] <= T);
  const finished = h.runs.filter((r) => r[1] <= T);
  const github: OfficeGithubItem[] = merged
    .filter((p) => p[2] !== "")
    .slice(-OFFICE_FEED)
    .reverse()
    .map(([t, , repo, number, title]) => ({ kind: "pr", status: "merged", repo, title: `#${number} ${title}`.slice(0, OFFICE_FEED_TITLE_MAX), at: at(t), url: `https://github.com/${repo}/pull/${number}` }));
  const runs = h.runs
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r[0] <= T && T - r[1] <= REPLAY.shipS)
    .sort((a, b) => b.r[0] - a.r[0])
    .slice(0, OFFICE_PIPELINE.runs)
    .map(({ r, i }) => runAt(r, i, T, at));
  const ships: OfficeShip[] = [];
  h.prs.forEach((p, i) => {
    if (p[0] <= T && T - p[0] <= REPLAY.shipS) ships.push({ key: `pr:${i}`, kind: "merge", status: "merged", at: at(p[0]), ...(p[1] >= 0 ? { slot: p[1] } : {}) });
  });
  h.deploys.forEach((d, i) => {
    const lead = playTime(plan, d[0]) - playS;
    if (lead <= REPLAY.deployRunS && T - d[0] <= REPLAY.shipS) ships.push({ key: `deploy:${i}`, kind: "deploy", status: lead > 0 ? "running" : d[1] ? "success" : "failure", at: at(d[0]) });
  });
  ships.sort((a, b) => b.at - a.at);
  return {
    v: 4,
    enabled: true,
    mode: all.length ? "live" : "semi-live",
    updatedAt: Math.round(epoch + playS * 1000),
    desks: desks.sort((a, b) => a.slot - b.slot),
    extra,
    github,
    today: { day: h.day, tasksDone: plan.doneAt.filter((t) => t <= T).length, prsMerged: merged.length, ciRuns: finished.length, ciGreen: finished.filter((r) => r[3] === 1).length },
    pipeline: { runs, ships: ships.slice(0, OFFICE_PIPELINE.ships) },
  };
}
```

  Notes: the synthetic runs carry empty `repo`, `title` and `url` and negative ids: the scene reads only their ids,
  slots, times, statuses and lanes (`lanesOf`, `diffPipeline`), the CI drawer reads the live feed, and a synthetic
  snapshot is never parsed, cached or served. Merges keep their order key `pr:<index>` (no repository in the key).
  The playback clock (`epoch` plus playback seconds) keeps the scene's pipeline rules meaningful: `PipeQueue` drops
  events over 60 s old on that clock, and the dock ring's running shimmer (`deployRunning`) lasts the 3 s lead.
- [ ] **Step 4:** Run; expected PASS.
- [ ] **Step 5:** Commit `feat(office): the replay engine`.

### Task 7: Replay feed, chunk, link and the idle loop

Starts only once Q1 (and Q2) are answered: from here on every change counts in the office chunks.

**Files:**
- Create: `src/experience/floors/lobby/office/replayFeed.ts`, `replayChunk.ts`, `replayLink.ts`
- Modify: `scene.ts` (exports), `chunk.ts` (`officeHandle.loadReplay`), `live.ts` (`officeLive.now`),
  `officeModel.ts` (`OfficeView.replay`), `pipeline.ts` (`PipeQueue.reset`), `OfficeScene.tsx` (source switch, idle
  loop, playback step), `OfficeChips.tsx` (source), `src/experience/fx/probes.ts` (`office.replay`)
- Test: `tests/unit/office-replay-feed.test.ts`, `tests/unit/office-replay-link.test.ts`, `tests/unit/office-pipeline.test.ts`,
  `tests/unit/office-chunk-graph.test.ts`, the `officeView` tests

**Interfaces:**
- Produces (`replayFeed.ts`, replay chunk):

```ts
export type ReplayStatus = "off" | "loading" | "playing" | "resting" | "paused" | "unavailable";
export interface ReplayState {
  status: ReplayStatus;
  day: string | null;
  /** The 8-day index once fetched (newest first), for the drawer's day buttons. */
  days: OfficeHistoryDay[];
  playS: number;
  duration: number;
  /** Day seconds at `playS` (the banner's and the scrubber's time). */
  dayS: number;
  /** The idle loop (true) or a visitor's choice in the drawer (false, held until "Back to live"). */
  auto: boolean;
  truncated: boolean;
  /** No day in the window has anything to play. */
  empty: boolean;
  /** Bumped on every play, seek and loop restart: the scene's pipeline queue takes a silent baseline. */
  seq: number;
}
export interface ReplayController {
  auto(): Promise<void>;                 // the idle loop: the latest day with anything to play, looping, no-op while loading or playing
  play(day: string): Promise<void>;      // a visitor's day (auto false); starts paused under reduced motion
  pause(): void;
  resume(): void;
  seek(playS: number): void;
  nextHour(): void;                      // to the next whole hour of day time (reduced motion's step)
  stop(): void;                          // back to live
  step(dt: number, reduced: boolean): void; // from the scene's frame (scaled, LOD-stepped seconds)
  state(): ReplayState;
}
export function createReplayFeed(deps: { fetch: (url: string) => Promise<Response>; now: () => number; reduced: () => boolean; publish: (state: ReplayState, snapshot: OfficeFeedSnapshot | null) => void }): ReplayController;
```

- Produces (`replayLink.ts`, scene chunk; type-only imports from the replay chunk):

```ts
export const REPLAY_OFF: ReplayState;
/** Shared with the replay chunk: its state and snapshot, its controller once loaded, whether the 3D scene is mounted, and the idle bookkeeping. */
export const officeReplay: { state: ReplayState; snapshot: OfficeFeedSnapshot | null; controller: ReplayController | null; mounted: boolean; quietSince: number; failedAt: number };
export function publishReplay(state: ReplayState, snapshot: OfficeFeedSnapshot | null): void;
export function useReplay(): { state: ReplayState; snapshot: OfficeFeedSnapshot | null; mounted: boolean };
/** The scene's view: the replay's while one plays, else the live feed's; `live` is always the live view (signal, targets). */
export function useOfficeSource(): { view: OfficeView; live: OfficeView; feed: OfficeFeed };
export function idleLoopWanted(i: { feed: OfficeFeedStatus; awake: boolean; quietMs: number; inView: boolean; reduced: boolean; status: ReplayStatus; sinceFailMs: number }): boolean;
export function loadOfficeReplay(): Promise<typeof import("./replayChunk")>;
export function replayDayLabel(day: string, locale: "en" | "id"): string; // "Mon 19 Oct" / "Sen 19 Okt"
export function replayClock(dayS: number): string;                        // "14:05"
```

- [ ] **Step 1: Tests first.**
  - `office-replay-link.test.ts`: `idleLoopWanted` is true only with a feed that is not idle, loading or disabled
    (offline counts: the loop may play a cached day), no awake desk for at least `REPLAY.idleS` (30 s), the office in
    view, motion not reduced, the replay `off` (never while loading, playing, resting or paused) and at least
    `REPLAY.retryS` (5 min) since a failed or empty attempt; `replayDayLabel("2026-10-19", "en")` is "Mon 19 Oct" and
    `"id"` "Sen 19 Okt"; `replayClock(50_700)` is "14:05"; `useOfficeSource` returns the replay view (with
    `replay.day` and `replay.seq`) while a snapshot is published and the live view otherwise, and `live` is always
    the live feed's.
  - `office-replay-feed.test.ts` (a stub `fetch` over `OFFICE_HISTORY_FIXTURES`, a counter of calls, a fake clock):
    `auto()` fetches the index once, picks today when it has anything, else the newest of the last 7, fetches that day
    once and reaches `playing` with a snapshot published; stepping past `duration` rests `REPLAY.restS` (6 s, status
    `resting`, the last snapshot held) and loops from 0 with `seq` bumped, without another fetch (a second loop of today
    refetches only when its copy is over 60 s old; the browser's HTTP cache revalidates with the ETag); `play(day)`
    is `auto: false` and ends `paused` at the end instead of looping; `stop()` publishes `off` and a null snapshot; a
    non-200 answer, a thrown fetch, a body that `parseOfficeHistory` or `parseOfficeHistoryIndex` rejects, or the
    disabled body give `unavailable` (no snapshot); an index with no day to play gives `off` with `empty`; publishes
    happen at most once per `REPLAY.tickS` (0.25 s) of playback and only when the snapshot changed (a key over desks,
    helpers, pipeline statuses and today's counts), while `dayS` updates every tick; under reduced motion `step`
    never advances, `play` starts `paused` at the day's first activity, and `nextHour` moves `dayS` to the next whole
    hour.
  - `office-pipeline.test.ts`: `PipeQueue.reset()` makes the next `see` a silent baseline and drops queued events.
  - `office-chunk-graph.test.ts`: `REPLAY_ONLY = [replayChunk.ts, replay.ts, replayFeed.ts, ReplayControls.tsx,
    src/lib/office/protocolHistory.ts]` is reached from `replayChunk.ts` and never from the main entries, the scene
    entry, the body entry, the watch, the beacon or the Classic card (`src/components/office/OfficePanel.tsx`,
    `src/hud/drawer/DrawerHost.tsx`); `replayLink.ts` is in the scene closure; `import("./replayChunk")` appears only
    in `replayLink.ts`; `protocolHistory.ts` is never re-exported from `protocol.ts`.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3: Implement.**

  `replayFeed.ts` (the clock steps only from the scene's frame; no timer, no rAF):

```ts
export function createReplayFeed(deps: { fetch: (url: string) => Promise<Response>; now: () => number; reduced: () => boolean; publish: (state: ReplayState, snapshot: OfficeFeedSnapshot | null) => void }): ReplayController {
  let s: ReplayState = { ...REPLAY_OFF };
  let h: OfficeHistoryV1 | null = null;
  let plan: ReplayPlan | null = null;
  let epoch = 0;
  let tick = -1;
  let key = "";
  let rest = 0;
  let snap: OfficeFeedSnapshot | null = null;
  const days = new Map<string, { h: OfficeHistoryV1; at: number }>();
  let index: { days: OfficeHistoryDay[]; at: number } | null = null;

  const set = (patch: Partial<ReplayState>, next: OfficeFeedSnapshot | null = snap) => {
    s = { ...s, ...patch };
    snap = next;
    deps.publish(s, snap);
  };
  async function get<T>(url: string, parse: (raw: unknown) => T | null): Promise<T | null> {
    try {
      const res = await deps.fetch(url);
      return res.status === 200 ? parse(await res.json()) : null;
    } catch {
      return null;
    }
  }
  /** The snapshot at the current playback time, published when its content changed (or `force`). */
  function render(force = false): void {
    if (!h || !plan) return;
    const next = snapshotAt(h, plan, s.playS, epoch);
    const k = snapKey(next);
    const dayS = Math.round(dayTime(plan, s.playS));
    if (force || k !== key) ((key = k), set({ dayS }, next));
    else if (dayS !== s.dayS) set({ dayS });
  }
  async function load(day: string | null, auto: boolean): Promise<void> {
    set({ status: "loading", auto });
    const now = deps.now();
    if (!index || now - index.at > 60_000) {
      const got = await get(OFFICE_HISTORY_PATH, parseOfficeHistoryIndex);
      if (!got || !got.enabled) return set({ status: "unavailable" }, null);
      index = { days: got.days, at: now };
    }
    const pick = day ?? index.days.find((d) => d.events + d.prs + d.runs + d.deploys > 0)?.day ?? null;
    if (!pick) return set({ status: "off", days: index.days, empty: true }, null);
    let cached = days.get(pick);
    if (!cached || (pick === index.days[0].day && now - cached.at > 60_000)) {
      const got = await get(`${OFFICE_HISTORY_PATH}?day=${pick}`, parseOfficeHistory);
      if (!got || !got.enabled) return set({ status: "unavailable", days: index.days }, null);
      days.set(pick, (cached = { h: got, at: now }));
    }
    h = cached.h;
    plan = planReplay(h);
    if (!plan) return set({ status: "off", days: index.days, empty: true }, null);
    const reduced = deps.reduced();
    const start = reduced ? playTime(plan, plan.spans[0].from) : 0;
    epoch = deps.now() - start * 1000;
    tick = -1;
    set({ status: reduced ? "paused" : "playing", day: pick, days: index.days, playS: start, duration: plan.duration, truncated: h.truncated, empty: false, seq: s.seq + 1 });
    render(true);
  }
  return {
    auto: () => (s.status === "off" || s.status === "unavailable" ? load(null, true) : Promise.resolve()),
    play: (day) => load(day, false),
    pause: () => s.status === "playing" && set({ status: "paused" }),
    resume: () => s.status === "paused" && !deps.reduced() && ((epoch = deps.now() - s.playS * 1000), set({ status: "playing", seq: s.seq + 1 })),
    seek(playS) {
      if (!plan) return;
      const p = Math.max(0, Math.min(plan.duration, playS));
      epoch = deps.now() - p * 1000;
      set({ playS: p, seq: s.seq + 1 });
      render(true);
    },
    nextHour() {
      if (!plan) return;
      this.seek(playTime(plan, (Math.floor(dayTime(plan, s.playS) / REPLAY.stepS) + 1) * REPLAY.stepS));
    },
    stop: () => ((h = plan = null), (key = ""), set({ ...REPLAY_OFF, days: s.days, seq: s.seq + 1 }, null)),
    step(dt, reduced) {
      if (reduced || !plan) return;
      if (s.status === "resting") {
        if ((rest -= dt) > 0) return;
        epoch = deps.now();
        set({ status: "playing", playS: 0, seq: s.seq + 1 });
        return render(true);
      }
      if (s.status !== "playing") return;
      const playS = Math.min(plan.duration, s.playS + dt);
      s = { ...s, playS };
      if (playS >= plan.duration) {
        if (s.auto) ((rest = REPLAY.restS), set({ status: "resting" }));
        else set({ status: "paused" });
        return render();
      }
      const t = Math.floor(playS / REPLAY.tickS);
      if (t !== tick) ((tick = t), render());
    },
    state: () => s,
  };
}
```

  `snapKey(snapshot)` (same file) joins each desk's slot, state, activity and helpers, each run's id, status and done
  count, each ship's key and status, and today's four counters. `REPLAY_OFF` (the off state, `seq: 0`) is declared in
  `replayLink.ts` and imported here: the replay chunk may import from the scene chunk, never the other way but for
  types.

  `replayChunk.ts` (the entry; one controller per page):

```ts
import { officeLive } from "./live";
import { officeReplay, publishReplay } from "./replayLink";
import { createReplayFeed } from "./replayFeed";
import { getHQStore } from "@/store/useHQStore";

/** The replay chunk (loaded by `loadOfficeReplay` in ./replayLink.ts on the idle-loop condition or the drawer's control). */
export const replayController = createReplayFeed({ fetch: (url) => fetch(url), now: officeLive.now, reduced: () => getHQStore().getState().reducedMotion, publish: publishReplay });
officeReplay.controller = replayController;
export { ReplayControls } from "./ReplayControls";
```

  (`ReplayControls` lands in Task 9; until then the entry exports only the controller.)

  `replayLink.ts`: the store (`officeReplay`, listeners, `publishReplay` notifies and writes
  `sceneProbes.office.replay = { status, day, playS, dayS, auto, seq }`); `useReplay` through `useSyncExternalStore`;
  `useOfficeSource` (`useOfficeFeed()` from `./live`, `officeView(feed)` as `live`, and while `snapshot` is set
  `officeView({ status: "ready", snapshot }, { day: state.day!, seq: state.seq, truncated: state.truncated })` as
  `view`); `idleLoopWanted` (the rule above); the labels (`Intl.DateTimeFormat` with `en-GB` or `id-ID`,
  `{ weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }` over `Date.UTC` of the day, its non-literal
  parts joined with spaces; the clock with two-digit hours and minutes); and the one loader:

```ts
let pending: Promise<typeof import("./replayChunk")> | null = null;

/** The replay chunk, once per page; a failed import is forgotten so the drawer's control can retry. This import() is the only reference to it. */
export function loadOfficeReplay(): Promise<typeof import("./replayChunk")> {
  pending ??= import("./replayChunk").catch((error: unknown) => {
    pending = null;
    throw error;
  });
  return pending;
}
```

  `scene.ts` also exports `loadOfficeReplay` and `useReplay` (the drawer body reads them from the loaded scene module, as
  it reads the poller). `chunk.ts`: `officeHandle.loadReplay: () => loadOffice().then((m) => m.loadOfficeReplay()).then(() => undefined)`
  (the bytes spec already measures it). `live.ts`: `officeLive.now = () => Date.now() + clock.skew` (the idle timer
  and the replay clock follow `__hq.office.test().advance`). `officeModel.ts`: `OfficeView.replay: { day: string;
  seq: number; truncated: boolean } | null` and `officeView(feed, replay = null)`. `pipeline.ts`:

```ts
  /** Forgets the last pipeline and the queue: the next `see` is a silent baseline (the live and replay feeds switched, or a replay seeked). */
  reset(): void {
    this.prev = null;
    this.items.length = 0;
  }
```

  `OfficeScene.tsx`:
  - `const { view, live, feed } = useOfficeSource();` replaces `useOfficeFeed()` and `officeView(feed)`; the signal
    effect keeps reading `feed` (the live feed only, so a replay never lights the beacon, the minimap cue or the beam);
    the interactables register from `live.rovers` (desk targets name the live session their drawer shows).
  - `OfficeRovers`: an effect on `view.replay?.seq ?? -1` calls `queue.reset()` before the effect that calls
    `queue.see(...)` (declared first, so it runs first); in the frame, after `if (!step.step) return;`, call
    `officeReplay.controller?.step(step.dt, reduced)` (so a replay advances only in view, at the far rate past
    `OFFICE_LOD.farDistance`, and never without a frame).
  - `OfficeWatch` (its 0.5 s check, after the in-view test): `const awake = live.rovers.some((r) => r.agent && r.state !== "asleep")`;
    when `awake`, `officeReplay.quietSince = officeLive.now()` and an `auto` replay stops; when reduced motion turns on
    during an `auto` replay it stops; when `idleLoopWanted(...)` holds, `loadOfficeReplay().then((m) => m.replayController.auto())`,
    and a rejected import or an `unavailable` or `empty` result sets `officeReplay.failedAt` (the 5 min retry rule).
  - Mount: `officeReplay.mounted = true` and `quietSince = officeLive.now()` on mount; on unmount (riding off L1)
    `officeReplay.controller?.stop()` and `mounted = false`.
  - `OfficeChips.tsx`: `const { view } = useOfficeSource();` replaces its own `officeView(useOfficeFeed())`.
  - `probes.ts`: `office.replay: { status: "off", day: null, playS: 0, dayS: 0, auto: false, seq: 0 }`; the unmount reset
    in `OfficeScene` resets it too.
- [ ] **Step 4:** Run the five test files plus `tests/unit/office-live.test.ts`, `office-signal.test.ts` and
  `office-chip-placement.test.ts`; expected PASS.
- [ ] **Step 5:** Commit `feat(office): replay feed, chunk and the idle loop`.

### Task 8: Floor tiles

**Files:**
- Create: `src/experience/floors/lobby/office/tiles.ts`
- Modify: `OfficeScene.tsx` (`OfficeTiles`, one stage mesh inside `OfficeReady`), `src/experience/fx/probes.ts` (`office.tiles`)
- Test: `tests/unit/office-tiles.test.ts`

**Interfaces:**
- Produces:

```ts
/** Merged-PR floor tiles (design 7.4): a 6 x 4 grid of 1.6 u tiles with 0.4 u gaps on the wing plaza, `z0` u past the slab edge S, on the wing's axis. */
export const TILES = { cols: 6, rows: 4, size: 1.6, gap: 0.4, z0: 3, y: 0.02, lit: 0.7, full: 1, dim: 0.08, fadeS: 0.6, gapS: 0.4 } as const;
export const TILE_COUNT = 24;
export function tileCenters(w: OfficeWing): Vec2[];
/** Target alpha per tile for `merged` PRs (writes `out`): the first 24 at `lit` in merge order, the next 24 brighten to `full`, the rest `dim`. */
export function tileLevels(merged: number, out: Float32Array): Float32Array;
/** One step of the fades toward `target` (writes `alpha`): at most one tile starts brightening per `gapS`, each over `fadeS`; reduced motion jumps. Returns whether anything changed. */
export function stepTileAlpha(alpha: Float32Array, target: Float32Array, clock: { next: number }, t: number, dt: number, reduced: boolean): boolean;
```

- [ ] **Step 1: Tests first:** 24 centres, all inside the wing plaza rect (`officeRoad(w).plaza`), none inside
  `officeZone(w).area`, none inside an `officeObstacles(w)` rect, none under a desk (`officeSlots(w)` rects), for
  `LOBBY.officeWing`; `tileLevels(0)` all 0.08, `tileLevels(5)` five at 0.7 (the first five) and the rest 0.08,
  `tileLevels(30)` six at 1 and 18 at 0.7; `stepTileAlpha` lights a newly lit tile over 0.6 s, starts at most one new
  tile per 0.4 s (so at most 2.5 a second, under the 3 flashes per second rule), returns false once settled (a still
  office writes nothing), and under reduced motion reaches every target in one step; dimming (a new WIB day, a replay
  back to live) is never staggered.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3: Implement** `tiles.ts`:

```ts
export function tileCenters(w: OfficeWing): Vec2[] {
  const pitch = TILES.size + TILES.gap;
  const x0 = w.lead.x - ((TILES.cols - 1) * pitch) / 2;
  const z0 = w.rect.minZ + TILES.z0 + TILES.size / 2;
  return Array.from({ length: TILE_COUNT }, (_, i) => ({ x: x0 + (i % TILES.cols) * pitch, z: z0 + Math.floor(i / TILES.cols) * pitch }));
}

export function tileLevels(merged: number, out: Float32Array): Float32Array {
  for (let i = 0; i < TILE_COUNT; i++) out[i] = merged > TILE_COUNT + i ? TILES.full : merged > i ? TILES.lit : TILES.dim;
  return out;
}

export function stepTileAlpha(alpha: Float32Array, target: Float32Array, clock: { next: number }, t: number, dt: number, reduced: boolean): boolean {
  let changed = false;
  for (let i = 0; i < TILE_COUNT; i++) {
    const a = alpha[i];
    const goal = target[i];
    if (a === goal) continue;
    let next = goal;
    if (!reduced && goal > a) {
      // A tile not yet moving waits for its turn; one that is moving keeps going.
      const moving = a > TILES.dim && a < TILES.full && a !== TILES.lit;
      if (!moving && t < clock.next) continue;
      if (!moving) clock.next = t + TILES.gapS;
      next = Math.min(goal, a + (dt * (TILES.full - TILES.dim)) / TILES.fadeS);
    }
    alpha[i] = next;
    changed = true;
  }
  return changed;
}
```

  The grid spans x -2.8 to 8.8 and S + 3 to S + 10.6 on `LOBBY.officeWing` (the plaza is x -6 to 12 and S + 1.5 to S +
  17.5, the stop's view zone S + 15.1 to S + 17.9, the front row's desks start past S + 11): the tests hold it there if
  the wing moves.

  `OfficeTiles` in `OfficeScene.tsx` (mounted in `OfficeReady` beside `OfficeRovers`, both tiers, so it draws only after
  the office precompile like the other office meshes):
  - geometry: `new PlaneGeometry(1, 1)` with `aStage` (`[STAGE_KIND.tile, TILES.size, TILES.size, 0]` per instance) and
    `aStage2` (`[0, 0, phase, alpha]`) instanced attributes, `useDispose`; fixed bounds: the grid's bounding sphere
    (like `officeSphere`), so the mesh is frustum culled out of view (no call when the wing is off screen);
  - material: `createStageMaterial({ additive: true })` (the hall's `HOLO_MODE.stage` program, also used by the beacon
    chunk; no new program), its drift uniform left at the default (the tile kind's lift stays 0), `uTime` never written
    by the tiles, `useDispose`;
  - instance matrices: each tile laid flat (pitch -90 degrees, the tile kind draws in its local xy plane) at
    `tileCenters(LOBBY.officeWing)` and `TILES.y`, written once; instance colour `STATUS_COLOR.merged` (the package's
    violet) through `neonColor` for the tier;
  - frame: inside the office's in-view gate, `tileLevels(view.today?.prsMerged ?? 0, target)` when the count changed,
    then `stepTileAlpha` with the frame's scaled delta; only when it returns true, write `aStage2.w` and set
    `needsUpdate` (through `whenDrawn`, like the Rovers); `sceneProbes.office.tiles` = lit count (alpha at or over
    `TILES.lit`).
  - Live, the tiles show today's merges (`view.today.prsMerged`, which also sizes the dock's stack); in a replay they
    light as the replayed merges come (the synthetic `today.prsMerged`); back to live they dim at once to today's count.
  - Tiles carry no text (the floor text rule) and no point-and-go target.
- [ ] **Step 4:** Run `tests/unit/office-tiles.test.ts` and `tests/unit/lobby-office.test.ts`; expected PASS.
- [ ] **Step 5:** Commit `feat(office): merged PR floor tiles`.

### Task 9: Replay label, chip mark and pill, drawer controls

**Files:**
- Create: `src/experience/floors/lobby/office/ReplayControls.tsx` (replay chunk)
- Modify: `officeWall.ts` (banner), `OfficeScene.tsx` (`OfficeWall` passes the replay time), `OfficeChips.tsx` (mark and
  pill), `OfficeScene.tsx` `OfficeWatch` (the pill's place in the chip row), `OfficeBody.tsx` (replay section and
  badge), `runtime.ts` (`officeRuntime.replayPill`), `replayChunk.ts` (exports `ReplayControls`), `messages/en.json`,
  `messages/id.json`
- Test: `tests/unit/office-wall.test.ts`, `tests/hud/OfficeChips.test.tsx`, `tests/hud/OfficeBody.test.tsx`,
  `tests/hud/ReplayControls.test.tsx`

**Interfaces:**
- Produces: `WallModel.replay: boolean`; `wallModel(view, t, locale, now, replay: { day: string; dayS: number } | null = null)`
  (in a replay, `status` is "Replay · Mon 19 Oct · 14:05" and `statusColor` `COLORS.violet`); `ReplayControls({ locale })`.
- Strings (`office.3d.replay.*`, EN then ID):

| Key | EN | ID |
|---|---|---|
| `banner` | `Replay · {day} · {time}` | `Putar ulang · {day} · {time}` |
| `pill` | `Replay` | `Putar ulang` |
| `chip` | `Replay of {day}` | `Putar ulang {day}` |
| `title` | `Day replay` | `Putar ulang harian` |
| `open` | `Show day replay` | `Tampilkan putar ulang harian` |
| `play` | `Play replay` | `Putar` |
| `pause` | `Pause replay` | `Jeda` |
| `nextHour` | `Next hour` | `Jam berikutnya` |
| `time` | `Replay time` | `Waktu putar ulang` |
| `timeValue` | `{time} WIB` | `{time} WIB` |
| `live` | `Back to live` | `Kembali ke live` |
| `playing` | `Replaying {day}` | `Memutar ulang {day}` |
| `unavailable` | `Replay unavailable` | `Putar ulang tidak tersedia` |
| `partial` | `Partial day` | `Sebagian hari` |
| `empty` | `No activity` | `Tidak ada aktivitas` |

- [ ] **Step 1: Tests first:**
  - wall: the model's `status` is the banner only while a replay is passed (both locales: "Replay · Mon 19 Oct · 14:05",
    "Putar ulang · Sen 19 Okt · 14:05"), the wall's key changes when the replay's minute changes (the 2 Hz check
    redraws it), and without a replay the model is unchanged (the existing wall tests stay green);
  - chips: while a replay plays every chip has `data-replay="true"`, its dot drawn as a ring (a shape cue, not only
    colour) and an `aria-label` starting "Replay of Mon 19 Oct: " (the day only, so the label does not change every
    tick); one `office-replay-pill` with the visible text "Replay · 14:05" leads the row; live, neither shows; the chip
    placement tests (no overlap, HUD boxes clear) hold with the pill: `OfficeWatch` places the pill at the row's left
    bound and moves the bound right by the pill's width plus `CHIP_ROW.gap` before `layoutChipRow` / `layoutChipRows`
    (`chipRowBounds` already keeps the HUD boxes clear), and hides it with the chips;
  - drawer (`OfficeBody`, `ReplayControls`): the summary drawer shows a "Show day replay" button only while the 3D
    office is mounted (`useReplay().mounted`), which loads the replay chunk and renders `ReplayControls`; while a replay
    plays (idle loop or not) every office drawer panel shows a "Replay" badge with "Replaying Mon 19 Oct" in a polite
    status region and a "Back to live" button (focus stays on the activated control), while the panels' content stays
    the live office; the controls show 8 day buttons (`replayDayLabel`, `aria-pressed` on the playing day, disabled
    with `title` "No activity" when the index has nothing for that day), one play or pause button whose `aria-label`
    toggles, a range (`input type="range"`, `aria-label` "Replay time", `aria-valuetext` "14:05 WIB", keyboard Home and
    End jump to the ends), the "Partial day" note for a truncated day and "Replay unavailable" when the history cannot
    load; under reduced motion the play button is "Next hour" and a replay starts paused; both locales.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3: Implement.**
  - `officeWall.ts`: the banner replaces the status line (`status`, `statusColor`) and sets `replay: true`; everything
    else in a replay comes from the replay view (counts, the now rows, today's line, merges in the GitHub half).
    `OfficeWall` reads `officeReplay.state` on its 2 Hz check (no React render per tick) and passes
    `{ day, dayS }` while `view.replay` is set.
  - `OfficeChips.tsx`: `const { state } = useReplay();` while `state.status` is `playing`, `resting` or `paused` with a
    snapshot: each `Chip` gets `replay` (the ring dot: the existing `hq-dot` with a transparent background and a 1.5 px
    border, as the helpers mark already draws, and the label prefix `t("3d.replay.chip", { day })`); the pill is a
    `glass glass-solid` span with `data-testid="office-replay-pill"` whose time text is written through a ref by
    `OfficeWatch` (2 Hz, no React render), registered in `officeRuntime.replayPill`.
  - `ReplayControls.tsx` (replay chunk): reads `useReplay()` from `./replayLink` and calls `replayController`; existing
    classes only (no new Tailwind utilities: the CSS budget rides on every page); real buttons and a labelled range; no
    inline handlers beyond React's; no `role="slider"` reimplementation.
  - `OfficeBody.tsx`: a `ReplaySection` in `SummaryPanel` and a `ReplayBadge` in `LiveBody` (both from `live.useReplay()`
    and `live.loadOfficeReplay()` on the loaded scene module; no static import of the replay chunk); a failed chunk
    load shows "Replay unavailable" and the next press retries.
- [ ] **Step 4:** Run the four test files plus `tests/unit/client-namespaces.test.ts` and the en and id message key
  parity check; expected PASS.
- [ ] **Step 5:** Commit `feat(office): replay label, chip mark and drawer controls`.

### Task 10: E2E, budgets, perf, captures, security review, docs, PR

**Files:**
- Modify: `e2e/office.spec.ts`, `e2e/office-fixtures.ts`, `e2e/perf/floors.spec.ts`, `e2e/perf/bytes-3d.spec.ts`,
  `e2e/budgets.ts`, `scripts/perf-report.ts`, `tests/unit/perf-report.test.ts`, `scripts/office-shots.ts`, the docs
  listed in Step 5
- Create: `docs/decisions/YYYY-MM-DD-office-replay-budgets.md` (the decisions file format, dated the measurement day)

- [ ] **Step 1: E2E** (`e2e/office.spec.ts`, waits on state only). `e2e/office-fixtures.ts` gains
  `HISTORY_API = /\/api\/office\/history(\?day=\d{4}-\d{2}-\d{2})?$/` and `historyIndexFor(now)`, `historyDayFor(now)`
  (the `OFFICE_HISTORY_FIXTURES` shape on the window of `now`: ten seats used over the day, helpers on two desks, three
  merges, two runs, one production deploy), answered through `page.route` with a request log. Cases:
  - idle loop: an all-asleep v4 fixture, the office in view at the stop; `__hq.office.test().advance(31_000)` crosses
    the 30 s quiet rule on the poller's clock; wait for `probes.office.replay.status === "playing"` and `auto`; the
    chip row shows `office-replay-pill` with "Replay", every chip `data-replay="true"` and its accessible name starts
    with "Replay of"; `probes.office.desks` counts the replayed desks (back row included) and `probes.office.drones`
    shows the helpers; the history was asked once for the index and once for the day;
  - tiles: open the summary drawer, "Show day replay", press End on the range; wait for `probes.office.tiles === 3` and
    `probes.office.pipe.packages` to grow; "Back to live" brings `probes.office.replay.status` to `off` and the tiles to
    the live fixture's `today.prsMerged`;
  - a live awake snapshot (the next poll answers `CREW_A`) stops the idle loop (`status` `off`, the chips lose the
    mark, the beacon still follows the live feed only: `probes.office.beacon` false during a replayed `input` desk);
  - the drawer plays another day (its day button `aria-pressed`), pause toggles the button's `aria-label`, the range's
    `aria-valuetext` reads "HH:MM WIB";
  - reduced motion: after `advance(31_000)` no auto loop (`status` stays `off`); the drawer's replay starts `paused`
    and "Next hour" moves `probes.office.replay.dayS` to the next multiple of 3,600; tiles reach their end state at once;
  - `/api/office/history` answering 503 (then 404 for the day): the live office as before, the drawer says "Replay
    unavailable", no console error, and the idle loop does not refetch inside 5 min (`advance` 31 s again: still one
    index request);
  - `?prefetch=off`: the replay chunk never loads before an office drawer opens (`__hq.office.asks()` unchanged, no
    request to the replay chunk).
  Run `bun run e2e:changed` (it picks the office specs).
- [ ] **Step 2: Budgets and perf.**
  - `e2e/perf/bytes-3d.spec.ts`: measure `loadReplay` (already summed into `officeTotal`) against a new
    `BYTES_3D_BUDGET.officeReplay` cap, log it like the other office chunks, and, if Q1 chose the all-chunks reading,
    sum the watch and beacon chunks into the `officeTotal` check; `scripts/perf-report.ts` and its test gain
    `officeReplay`.
  - `e2e/budgets.ts`: `officeReplay` (measured plus 0.6 KB), `office`, `session.lite`, `session.full` (and `officeBody` if
    needed) re-set by the cap rule with the measured bytes in each comment; `officeTotal` per Q1; `failAt` unchanged (the main
    path adds only `officeHandle.loadReplay`).
  - `e2e/perf/floors.spec.ts`: the office stop and the lane ring's south point measured with the replay looping (a
    `settled-L1-replay` peak each): L1 under 125 scene calls on both tiers (the tiles add at most 1 where the wing is in
    view), shader programs at the baseline (`e2e/perf/baseline.json`, no new program), and the live-switch GPU check
    extended by three replay loops and a seek: geometries, textures and programs unchanged on both tiers; the lite fps
    at the stop with the replay looping within the still office's band.
  - Run `E2E_PORT=<port> bun run e2e:perf` on a local build; write the decision file with before and after for every
    cap, the render gates and the answer to Q1 and Q2.
- [ ] **Step 3: Captures.** `scripts/office-shots.ts` gains `replay` (the stop view during an idle-loop replay: banner,
  pill, chips, tiles lit, a packet or package in flight), `replay-drawer` (the summary drawer with the controls) and
  `tiles` (the spawn turned toward the wing with today's tiles), plus a short video of one loop, at 1440x900, 820x1180
  and 390x844 on the full and lite tiers, with `/api/office/history` answered from the fixtures; send them to the
  coordinator before merge.
- [ ] **Step 4: Security review** with the `security-review` agent: the storage bounds and their truncation paths, the
  privacy of the stored row (hashes in `keys` only, no branches) and of the served day (no hash, public repositories
  only, titles cleaned at read time, privatize scrub of every row), the endpoint's query validation, canonical cache
  keys, no reflected input, 404 and 503 paths, HEAD and ETag handling, the strict client and Function parsing, and the
  replay chunk's rendering (React text nodes and canvas `fillText` only, `safeGithubUrl` for merge links). Fix every
  finding and summarise them in the PR.
- [ ] **Step 5: Docs** (current state only, no history, no em dashes):
  - `docs/agents/office.md`: the log rows (`log:YYYY-MM-DD`, written with the doc in one `put`, built by `logDoc` over
    every session, seats 0 to 9 through `seatOf` and -1 past ten, helper counts, merges, finished runs, production
    deploys; caps, truncation, rollover with carry-ins, prune, privatize scrub), the Durable Object's and the Worker's
    `/history`, `GET /api/office/history` (`historyRoute`, cache keys and headers, 404 and 503), the free-tier table, the
    rollback notes (a Worker rolled back to before C answers 404 to `/history`, so the Function answers 503 and the
    drawer says "Replay unavailable"; stored rows wait untouched until the roll forward prunes them), tests.
  - `docs/agents/floor-l1-lobby.md` (Agent Office): the replay chunk and its triggers, `replayLink.ts`, the source
    switch, the idle loop rule, the playback clock and the pipeline queue's reset, the tiles, the banner, the pill and
    chip mark, the drawer controls, reduced motion, the probes (`office.replay`, `office.tiles`), the chunk list.
  - `docs/agents/performance.md`: the `officeReplay` cap, `officeTotal` per Q1, the session caps.
  - `AGENTS.md`: the Budgets table's Agent Office row names the replay cap (and `officeTotal` per Q1); stays under
    25 KB.
  - `docs/features.md` (L1: day replay, tiles; status log), `workers/office/README.md` (the history routes and the log
    rows), `docs/deploy.md` section 18 only if a step changes (no new secret, binding or route config is expected).
  - The design (`2026-10-20-agent-office-revamp-design.md`): sections 7.1 to 7.5, 8, 10 and 11 brought to what shipped
    (the diff-based log over all sessions, the tuple shapes with runs as start, end, seat, result and lanes, no
    branches stored, the Worker's read-time cleaning, the playback clock, the pill and chip mark, live-only signals, the
    measured bytes); Status `implemented` with the four PRs (A #274, A2 #276, B #279, C).
  - This plan: `Status: in review` with the PR date, then `shipped in #N (sha), date` after the merge (the plans rule).
- [ ] **Step 6:** `bun run verify:quick && bun run e2e:changed`; check the CI in flight (`gh run list -R ShinyQ/ShinyQ-HQ
  -s in_progress` and `-s queued`: at most 2 PR runs, one full), push, open a ready-for-review PR
  `feat(office): day replay (revamp part C)` with the owner note for the budgets, the answers to Q1 to Q4, the captures
  and the security review summary.

## Self-review notes

- Spec map: 7.1 to Tasks 2 and 3; 7.2 to Tasks 1, 4 and 5; 7.3 to Task 6; 7.4 to Tasks 7 to 9; 7.5, 8, 9, 10, 11 and
  13 to Task 10 (and the Global Constraints).
- Removed from the 2026-10-20 version: per-session `logBeat` (a seat moved by another session's beat went unlogged);
  `slot` from the stored `slot` field (null on the back row); branches in the log; runs as `[t, ok]` (no lanes or desk
  to replay); `mergedBy` (the tiles read `today.prsMerged` both ways); the blocklist inside the Durable Object (the
  Worker cleans); `functions/_lib/officeHistory.ts` (the route lives beside `VERSIONS`); the parsers in `protocol.ts`
  (they would ride in the Classic card and the scene chunk); `OfficeSnapshotV3 & { pipeline }` (the scene reads
  `OfficeFeedSnapshot` v4); tiles on the full tier only; a 0.4 s crossfade (the crew's own transitions cover the switch).
- Shared names: `OFFICE_HISTORY_PATH`, `OFFICE_HISTORY`, `dayStart`, `historyWindow`, `OfficeHistoryV1`,
  `OfficeHistoryIndexV1`, `parseOfficeHistory`, `parseOfficeHistoryIndex`, `HISTORY`, `DayLog`, `LogEvent`, `logKey`,
  `emptyLog`, `secondsOf`, `logDoc`, `startLog`, `closeLog`, `scrubRepo`, `historyIndex`, `historyDay`,
  `cleanHistory`, `historyRoute`, `createOfficeHistoryHandler`, `REPLAY`, `RULES`, `planReplay`, `dayTime`, `playTime`,
  `snapshotAt`, `createReplayFeed`, `ReplayState`, `ReplayController`, `replayController`, `officeReplay`,
  `publishReplay`, `useReplay`, `useOfficeSource`, `idleLoopWanted`, `loadOfficeReplay`, `replayDayLabel`,
  `replayClock`, `PipeQueue.reset`, `TILES`, `tileCenters`, `tileLevels`, `stepTileAlpha`, `ReplayControls`,
  `officeReplay` (budget key `officeReplay` in `BYTES_3D_BUDGET`).
- Type check of the plan's own code: `OfficeFeedSnapshot` takes `v: 4` with `pipeline`; `OfficeHistoryPr` and the
  stored `DayLog.prs` are the same tuple; `LogEvent.until` is `number | null` only in storage (served events are always
  closed); the synthetic runs' empty `repo`, `title` and `url` never reach a validator.

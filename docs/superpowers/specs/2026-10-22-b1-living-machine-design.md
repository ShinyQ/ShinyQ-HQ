# B1 Living Machine: Detailed Story, Reactor Hall and Power-Up Tour

Status: approved by the owner (coordinator chat, 2026-10-22); three PRs in order.

Owner request (verbatim): "i need you to update our B1 information to be detailed and the game to be looks more WOW
since its hidden floor".

Builds on the B1 Engine Room (plans `2026-10-17-b1-build-story-page.md`, `2026-10-17-b1-engine-room-floor.md`,
`2026-10-17-b1-unlock.md`) and its current rules in `docs/agents/floor-b1-engine-room.md`.

## 1. Goals

1. The B1 story is detailed and current: rounds up to today, a blueprint that shows every running piece, the real
   multi-agent workflow, the CI as it is now, refreshed numbers, and the two dark bays opened as real stations.
2. B1 looks like a living machine: a reactor hall at the aisle end whose core reacts to live CI, deploys, agent
   desks, visits and Ask questions.
3. The first visit after the unlock is a moment: the bays power up one by one while Rover drives the aisle, ending
   at the reactor as it spins up.

Non-goals: no new route, no new Pages Function, no new Worker, no change to how B1 unlocks, no change to public floors.

## 2. PR B1-1: the detailed story

### 2.1 Facts and rounds

- `content/generated/build-facts.json` is regenerated on the branch (`bun scripts/build-facts.ts --write`).
- Rounds stay contiguous PR ranges (`BuildStorySchema` requires it; only the last round is open). The owner's themes
  overlap in PR numbers, so each round is a contiguous slice and its summary names the themes merged inside it:

| Round | PRs | Theme |
|---|---|---|
| r9 | 187 to 213 | Ask pills, Rover menu, floor ambience, deploy on merge with rollback, the intro fly-in, the B1 Engine Room (PRs 1 to 3), Groq backup tiers |
| r10 | 214 to 232 | CI speed-up series (main complement, import-aware perf gates, nightly-only sweeps, Lighthouse on affected URLs, shard packing), the sky cycle, the intro reveal, conflict-free decision files |
| r11 | 233 to 251 | Agent Office backend and relay, stats every 2 hours, study guides on R2 and the Study Vault, perf A and B, the Classic design refinement, the Rover voice and the KV knowledge pack |
| r12 | 252 to 273 | L1 more room, perf C to E, the 3D Agent Office wing and its Classic card, nightly evals on Groq |
| r13 | 274 to open | The office revamp (living crew, ten desks, the ship-it pipeline, day replay), accurate visit stats, Node, Bun and dependency upgrades, the safety blocklist removed |

- `unlinkedPrs` adds 288: its diff shows the removed blocklist, which names client companies (C3), like 26.
- Every claim in a summary is checked against the commit subjects and the repository.

### 2.2 Stations

Seven stations, in bay order: blueprint, timeline, agents, gates, dashboard, brain, rejected. `comingSoon`,
`COMING_SOON_IDS`, the "Coming soon" bay plate and the Classic "Coming Soon" section are removed.

- Blueprint: the diagram gains the hq-office Worker with its Durable Object, the office relay on the owner's Mac
  (hooks from Copilot, Claude Code and Codex), R2 study guides, the Workers KV knowledge pack, Groq backup tiers and
  the GitHub webhook into the office Worker. Steps gain the office, study guides and the pack (at most 10).
- Timeline: the rounds above.
- Agents: the multi-agent workflow as it runs now: a coordinator chat that splits work and starts one project
  session per feature (its own worktree and branch), GitHub Copilot, Claude Code and Codex as the coding agents,
  sub-agents inside a session (explore, task, review), the owner's review gates (spec, Rejected lists, captures,
  merge). Tools list: GitHub Copilot, Claude Code, Codex. Step cap rises to 10.
- Gates: the current CI. Selective PR runs (`scripts/ci-plan.ts`), main runs the complement of its PR's green run,
  worker-aware shard packing, Lighthouse on affected URLs plus the home page, the bytes caps rule (measured plus
  0.6 KB), the 3D perf lane and memory gates, the local visual gate, the nightly full run. The public-safety scan is
  gone (#288). A gate now has `where: "ci" | "nightly" | "local"`; only `ci` and `nightly` gates name jobs, and
  those names must exist in the facts' `ci.jobs` (or the nightly workflow).
- Dashboard: the refreshed snapshot (same tiles).
- Rover's Brain (new): how Ask answers, as a pipeline diagram (same `ArchitectureSchema` and the same renderer as
  the Blueprint, in both the drawer and the Classic page) plus 6 to 10 titled steps: scope routing, BM25 retrieval
  over the KV pack (bundled fallback), Gemma on Workers AI through AI Gateway, Mistral then the Groq tiers as
  fallbacks, output checks, the Rover voice, multi-turn memory, the nightly evals. Every fact is verified in
  `functions/_lib` and `docs/agents/ask.md`.
- Rejected Designs (new): 8 to 14 ideas (13 approved by the owner's reviewer on 2026-10-22) tried or proposed and dropped, each with a title, what was tried, a one-line
  reason and an optional PR or decision link. No client company names (checked by hand: the blocklist is gone).
  The final list goes to the owner before the merge.

### 2.3 Surfaces

- Schema (`src/content/build-story.ts`): `stations.brain` (`architecture`, `steps` of `{ title, text }`),
  `stations.rejected` (`ideas` of `{ id, title, tried, reason, pr?, decision? }`), gate `where`, agents step cap 10.
- Room views (`content/room-views/engine.ts`): seven drawers. `RoomEngine.diagram` serves both Blueprint and Brain;
  `RoomEngine.ideas` is new. `EngineBody` renders the ideas list with existing utility classes only (CSS budget).
- Classic `/{locale}/build`: `BrainSection` and `RejectedSection` replace `ComingSoonSection`; the table of
  contents lists seven stations.
- 3D (`floors/engine/*`): `ENGINE_STATIONS` equals `ENGINE_BAYS` (all seven lit), with doors, pads, spurs, zones,
  pipe drops, front strips and point-and-go targets for brain and rejected. New props in the existing instanced
  draws: Brain gets a server column with a panel of retrieval "chunks"; Rejected gets a scrap rack of dimmed,
  crossed panels. No new draw call, material or shader program.
- Ask note (`content/ask/site-build.json`): "seven stations", Codex among the agents.
- Messages: `engine.desc` says seven stations; `engine.soon`, `build.comingSoon*` go; new `build` keys for the two
  stations' labels (tried, why dropped, steps).
- Docs: `docs/agents/floor-b1-engine-room.md`, `docs/features.md` (B1 section), a decision file.

### 2.4 Tests

Unit: `build-story.test.ts` (seven stations, gate `where`, ideas count 8 to 14, round ranges), `engine-layout`,
`engine-scenery`, `engine-views`, `build-page`, `diagram-layout` (the Brain diagram fits the phone and drawer
presets), Ask `pack.test.ts` (site-build wording). E2E: `engine-room.spec.ts` opens all seven drawers; the Classic
build page test sees seven sections. B1 stays hidden for locked visitors (existing tests unchanged).

## 3. PR B1-2: the reactor hall

### 3.1 Layout

- The slab grows east (`bounds.maxX` 48 to about 68). A reactor hall opens at the aisle end: the aisle extends to the
  hall, the reactor stands on the aisle axis (z 0) so the arrival view down the aisle shows it, and the workbench
  moves beside it (north or south of the hall, still flush with a wall). The Express Return pad moves with the hall.
- Space rules hold: every obstacle at least 6 u from its neighbours on the drive line, the arrival zone, the call pad
  and the Express Return pad stay clear. The reactor is an obstacle with a ring road around it; a `B1:reactor` zone
  looks at the core, and a reactor station has a door pad, a stop and a drawer.

### 3.2 The core

- A tall core (a stack of merged boxes in the existing merged mesh), 3 to 4 rotating rings (one instanced holo draw:
  ring segments are instances, rotation in the shader through `uTime` or a per-frame group rotation), a coolant glow
  (holo `fall` panels or an emissive strip column). Reuse holo `strip` and `fall` programs: no new shader program.
- Lite tier: half the ring segments, no sparks.

### 3.3 Live data

- One B1 poller, the office's `createOfficePoller` pattern: runs only while the rover is on B1, back-off on errors,
  stops after 10 minutes without input, the tab turning visible counts as input.
- `/api/office?v=4`: CI pipeline lanes map to ring segments (running pulses cyan, failed red, done green); a
  production deploy event flashes the core once; active agent desks become orbiting sparks (one instance each, at
  most ten).
- `/api/stats`: today's visits and Ask questions set the pulse rate (bounded) and fill a counter plate (troika text
  via `FloatingSigns`, the numbers only).
- Offline, stale (older than the keep-last window) or reduced motion: a calm idle pulse; the plate keeps the last
  numbers or dashes.
- The reactor drawer (en and id) shows the live numbers and explains each mapping.
- Audio: the B1 hum gains with distance to the core (`AMBIENCE_LAYERS.B1` gain multiplied by a clamped falloff).

### 3.4 Request estimate

Written into the decision file: polls happen only on B1 at the office cadence (10 s active, 30 s resting) and stop
after 10 minutes idle. A B1 visit is short, so the estimate is visits per day to B1 times the polls per visit.

## 4. PR B1-3: bay power-up and tour

- Each bay has a powered state; unpowered bays are dark (sign dim, panels off, front strip off). Powered bays are
  stored per visitor in `hq:v1` (`b1Powered: EngineBayId[]` or a `b1Toured` flag plus visited bays); all light after
  the tour or after each bay is visited.
- First B1 visit after the unlock only: Rover auto-drives the aisle on the shared autopilot (road route); each bay
  powers up in turn (light cascade, the sign flickers on, a short spark); Rover parks at the reactor, which spins up.
  Any input skips: everything powers at once.
- Rover menu (on B1 only): "Replay the power-up tour".
- Reduced motion: no drive; the bays fade on in place and Rover says a short line.

## 5. Budgets and gates

- The B1 chunk keeps its 16 KB cap (4.8 KB now). Asking the owner before raising it.
- Main-path additions follow measured plus 0.6 KB; the first-frame cap does not move.
- B1 under `FLOOR_SCENE_CAPS.B1` = 100 scene calls on both tiers, 150 whole-frame calls on rides, memory flat.
- B1-2 and B1-3: captures (arrival, aisle, each powered bay, the reactor with live data; 1440x900, 820x1180,
  390x844; full and lite) plus the tour video go to the owner's reviewer before the merge.

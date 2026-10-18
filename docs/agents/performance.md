# Performance

Performance gates and budgets, measurement on real devices, fast local verification and how to write 3D tests.
Index: [AGENTS.md](../../AGENTS.md).

## Performance gates and measurement

### Where budgets live

- Authoritative budgets: appendix 08 section 2 ([08-quality-acceptance.md](../superpowers/specs/agent-hq/08-quality-acceptance.md)).
  - CI numbers win. Change one only with an owner note in the PR.
  - Page View numbers: `lighthouserc.json`. 3D numbers: `e2e/budgets.ts`.

### Budgets

| Budget | Value | Source |
|---|---|---|
| 3D JS after the gate, main path (`?prefetch=off`), per tier | under 450 KB gzip | `e2e/budgets.ts` (`BYTES_3D_BUDGET`) |
| L3 floor chunk (`BYTES_3D_BUDGET.floors`) | L3 20 KB gzip | `e2e/budgets.ts` |
| L4 floor chunk | L4 16 KB gzip | `e2e/budgets.ts` |
| RF floor chunk | RF 8 KB gzip | `e2e/budgets.ts` |
| B1 floor chunk (unlocked session only) | B1 16 KB gzip (measured 4.8 KB) | `e2e/budgets.ts` |
| B1 settled scene calls | under 100 (`FLOOR_SCENE_CAPS.B1`; measured 45 lite, 48 full) | `e2e/budgets.ts` |
| Session total, full tier (`BYTES_3D_BUDGET.session`) | full 470 KB (measured 466.2 KB, about 3.8 KB headroom) | `e2e/budgets.ts` |
| Session total, lite tier | lite 446.4 KB (measured 442.6 KB, about 3.8 KB headroom) | `e2e/budgets.ts` |
| Shader programs per floor and tier | within `e2e/perf/baseline.json` + 2 | `e2e/perf/baseline.json`, headroom in `e2e/budgets.ts` (`PROGRAM_HEADROOM`) |
| Full-tier memory round trips (`GPU_MEMORY_BUDGET.fullTierRoundTrips`) | (3) Lobby to Roof round trips, geometries, textures and programs at baseline, heap within the budget | `e2e/budgets.ts` (`GPU_MEMORY_BUDGET`) |
| Look check (`e2e:look`) | at most 0.1% of pixels may differ | `e2e/perf/look.spec.ts` |
| Visual gate, strict profile | per-pixel 0.1, at most 0.1% of pixels | `e2e/visual-gate.spec.ts` |
| Page View LCP | 2 s | `lighthouserc.json` |
| Page View CLS | 0.01 | `lighthouserc.json` |
| Page View TBT | 200 ms | `lighthouserc.json` |
| Page View transfer budgets for fonts, HTML, CSS and JS | see the file (HTML 83,968 B, 82 KB since 2026-10-18; keep at least 4 KB of headroom on every page: the layout sends only `LAYOUT_NAMESPACES`, see [styling-and-i18n.md](styling-and-i18n.md#client-messages)) | `lighthouserc.json` |
| RUM sampling (`RUM_RATE`) | 25% of 3D sessions | `src/experience/perf/rumDecision.ts` |

Lighthouse CI is described in [ci-and-deploy.md](ci-and-deploy.md#ci).

### Perf lane (`e2e/perf/`)

- Runs only with `PERF=1`: `bun run e2e:perf`.
  - CI job `3D perf gates`: `bun run e2e:perf:shard i/N`, duration-balanced shards: the whole lane on 4 shards on `main`, dispatches and the nightly; on a PR, 2 shards running only the perf tests the changed paths affect (`scripts/perf-plan.ts`: a floor's gate and its rides for a floor change, the bytes gate for the HUD, a shared `src/` module the gates of the 3D files that import it (the Ask client `boot` and `bytes`, the certifications the Lobby), `memory-full` only for memory-sensitive paths such as the renderer, `Effects`, the floor chunk loader and shared geometry or materials; [ci-and-deploy.md](ci-and-deploy.md#what-a-pull-request-runs)).
  - Run one perf key locally with the same grep, for example `PERF=1 bunx playwright test --grep "L3 (full|lite): settled"`.
  - Run it when you touch the render path, materials, floor mounting or the 3D chunk's imports.
  - One spec: `E2E_PORT=<port> bun run e2e:perf e2e/perf/<file>` (with `PERF=1` the test dir is `e2e/perf`).
- `floors`, `peaks` and `memory-full` set `sessionStorage["hq:sky"] = "night"` in a `beforeEach`: automation's still night draws no sky, so the gates opt in to measure it as visitors see it at night (`look`, `bytes-3d` and `timeline` do not).
- The same `beforeEach` sets `localStorage["hq:ambience"] = "off"`: synthesizing the floor ambience (the L3 and L4 layers cost about as much as the music) competes with SwiftShader for the CI CPU and skews ride timing, so the render gates carry only the music; `tests/unit/audio-ambience.test.ts`, `tests/unit/audio.test.ts` and `e2e/ambience.spec.ts` cover the ambience.
- Each test writes `perf-report/<id>.json`; `bun scripts/perf-summary.ts gates --head perf-report` prints the tables.

| Spec | What it gates |
|---|---|
| `bytes-3d` | 3D JS after the gate (see below) |
| `floors` | every floor and tier (B1 too, ridden from the Lobby when unlocked): settled scene calls, post passes, triangles, shader programs within `e2e/perf/baseline.json` + 2 |
| `peaks` | boot plus intro, elevator rides through the panel, hover, boosting; every frame |
| `memory-full` | full-tier memory gate (owner decision, see below); it writes the `memory-full` entry of the summary |

#### `bytes-3d`

- Main path: 3D JS after the gate under 450 KB gzip per tier, measured with `?prefetch=off` so it is the main path only.
  - 450 KB gates the critical path before the first frame (`?prefetch=off`).
- Floor chunks: each is loaded through `__hq.floorChunks.load` and capped on its own: `BYTES_3D_BUDGET.floors`, L3 20 KB, L4 16 KB, RF 8 KB, B1 16 KB gzip.
  - Incremental: a module shared by two floors counts toward the first one loaded, L3.
- Session total: idle prefetch loads every floor in a normal session, so the session total (main + the public floor chunks, `BYTES_3D_BUDGET.sessionFloors`) has its own cap, `BYTES_3D_BUDGET.session` (owner decision). B1 loads only in an unlocked session, so it is measured in a separate unlocked session and held to `BYTES_3D_BUDGET.floors.B1`. That cap counts B1 plus any modules it shares with the public floors (`?prefetch=off` never loads L3, L4 or RF first), a safe over-count.
  - full 470 KB: measured 466.2 KB, so about 3.8 KB of headroom catches creep early.
  - lite 446.4 KB: measured 442.6 KB, about 3.8 KB of headroom.
  - Asserted and logged; `scripts/perf-report.ts` prints them as "Floor chunks (loaded on demand)".

#### Memory gates

- `memory-full` (owner decision): `GPU_MEMORY_BUDGET.fullTierRoundTrips` (3) Lobby to Roof round trips on the full tier with Motion Full leave geometries, textures and programs at their baseline and the heap within the budget.
  - Its warm-up tour rides with Motion Full as well: a Motion Reduced warm-up left 2 geometries and a program for the first measured trips to build (a false failure in PR #201's CI).
- The lite, reduced-motion memory gate is `e2e/memory.spec.ts` in the regular suite.
- B1 memory: `e2e/memory.spec.ts` rides Lobby to B1 round trips in an unlocked session (`e2e/b1.ts`). The perf lane covers B1 in `floors.spec.ts` (settled, after a ride from the Lobby) and `peaks.spec.ts` (rides L1 to B1 and RF to B1, both tiers).
- Both use the `e2e/hq.ts` memory helpers and the one budget. The baseline and the final read are settled (`readSettledGpuCounters`); the per-trip numbers are for the failure message only and read unsettled (`readGpuCounters`), so each trip still calls the elevator the moment the rover arrives.

#### Program baseline and known peaks

- After an intended material or precompile change, regenerate the program baseline and say why in the PR:
  1. `PERF=1 E2E_PORT=<port> bunx playwright test e2e/perf/floors.spec.ts`
  2. `bun scripts/perf-summary.ts baseline --head perf-report --write e2e/perf/baseline.json`
- `KNOWN_OVER` in `e2e/perf/peaks.spec.ts` lists peaks over budget waiting for a fix (expected failures). Remove an id as soon as it passes.

### Look check

- Before and after any render-path change:
  1. On a main build in `out-main/`: `E2E_DIR=out-main E2E_PORT=<port> bun run e2e:look --update-snapshots`
  2. On yours: `E2E_PORT=<port> bun run e2e:look`
- Canvas at desktop full 1440x900 and 2560x1440 and phone lite 390x844; at most 0.1% of pixels may differ.

### Per-frame work

- Per-frame work (`useFrame`) should do nothing it does not need.
  - Skip when its inputs are unchanged (as `FloatingSigns` does for a parked rover under a still camera).
  - Wrap work that only changes how an object on a floor looks when drawn in `whenDrawn(object, work)` (`src/experience/scene/drawnWork.ts`, as the L3 pod holograms do).
  - That work then skips while FloorLevel hides the floor and catches up in the scene's `onBeforeRender` before a render that shows it, so no frame draws stale data.
- Do not move test-probe writes off the frame (e2e reads several probes as one frame's snapshot).
- Check with CDP `Performance.getMetrics` TaskDuration per rendered frame before and after, and with `scripts/visual-gate.ts --profile strict`.

### Frame rate and timeline

- Never gate time: SwiftShader FPS and timings are noise.
- Frame rate is checked on real devices with `?perf=1` and in the field with the RUM beacon.
  - The `?perf=1` overlay shows FPS p50/p10, frame p95, scene and post calls, GPU objects, tier and renderer, DPR and pixels, and a sixth line with the last elevator ride from `window.__hq.ridePrep.lastRide`.
  - It mounts only with the flag (about 1 KB inside the 3D chunk, never on the Page View).
  - `perfOverlayOn` in `experience/perf/lines.ts` is the one parser of the flag.
- The nightly `perf-nightly.yml` (`bun run e2e:timeline`, `e2e/perf/timeline.spec.ts`, tagged `@nightly`) records the game-first timeline (marks in `src/lib/perf-marks.ts`) as a trend artifact.

### RUM beacon

- Contract: appendix 06 section 4 ([06-data-contracts.md](../superpowers/specs/agent-hq/06-data-contracts.md)). Related: [stats.md](stats.md).
- 25% of 3D sessions (`RUM_RATE`), once per browser session (`sessionStorage["hq:rum"]`), coarse buckets only.
- `POST /api/rum` to Analytics Engine `perf_events`.
- Never under automation: `?rum=1` forces it in a test or on a preview, `?rum=0` opts out.
- Never with Do Not Track or GPC (they win over `?rum=1` too).
- Do not add fields without amending appendix 06 and `src/lib/rum/protocol.ts` together.
- Never send a URL, user agent, renderer string or free text.

## Fast verification

The full local suite takes 20 to 40 minutes on SwiftShader; most of it covers code you did not touch. Verify what you changed locally. PR CI runs only the tests your change affects plus a small smoke set (smart CI, [ci-and-deploy.md](ci-and-deploy.md#what-a-pull-request-runs)); a push to `main` runs what its merged PR's green same-tree run did not (the complement, [ci-and-deploy.md](ci-and-deploy.md#complement-runs-on-main), or everything when there is no such run) and merges that PR run's perf and Lighthouse reports into its own, so `main` keeps complete baselines; the nightly runs the full suite (8 e2e shards, the [nightly-only tests](#nightly-only-e2e-tests) included), the whole perf lane (4 shards) and Lighthouse. A test the map does not tie to your paths runs only after the merge, so keep the `RULES` in `scripts/e2e-plan.ts` current when you add a spec or move code, and add the `full-ci` label for a risky cross-cutting change.

### Which command when

| When | Command | Time |
|---|---|---|
| Before every push | `bun run verify:quick` (typecheck, lint, unit tests, `next build`, then `og:check` over the export) | about 1 to 2 minutes |
| Before every push, after it | `bun run e2e:changed` (only the specs that cover your changed paths) | usually 1 to 4 minutes |
| Render path, materials, floor mounting, the elevator or what the 3D chunk imports changed | `E2E_PORT=<port> bun run e2e:perf` (3D bytes, floors, peaks, the full-tier memory gate) | about 10 to 12 minutes on 2 workers |
| CPU changes | `bun run bench` | |
| Unsure | `bun run e2e:smoke` (static routes, SEO, deploy rules, game-first load, Page View) | about 1 to 2 minutes |
| Shared test infrastructure changed, before a phase PR, or to reproduce a CI failure | `bun run e2e:full` (whole suite) | about 6 to 10 minutes locally |
| Look-preserving changes | `bun scripts/visual-gate.ts` (see below) | about 20 minutes plus builds |

- `verify:quick` plus `e2e:changed`: together about 5 minutes.
- `e2e:changed` never runs the perf lane. The lite memory gate `e2e/memory.spec.ts` runs in the default suite, so `e2e:changed` picks it for memory-related paths.
- Reproduce one CI failure: `bun run e2e:full e2e/career.spec.ts -g "swipe"`.

### `e2e:changed`

- Diffs against the merge base with `origin/main` plus staged, unstaged and untracked files.
- Maps paths to specs in `scripts/e2e-plan.ts`. Examples:

| Changed paths | Specs |
|---|---|
| `src/experience/floors/labs/**` | `labs`, `labs-data`, `labs-paths`, `gallery` and more |
| `src/experience/interact/**` | `interact`, `experience`, `pads` and `career` |
| `src/experience/floors/{floorChunks,floorPrefetch,lazyFloors,FloorChunkPrefetch}` and `floors/chunks/**` | `floor-chunks`, `ride`, `experience`, `labs` and `library-roof` |
| `src/experience/tower/**`, `scene/Director.tsx`, `scene/precompile.ts` and `text-config.ts` | `ride` and `experience` |
| `src/app/**` and `src/components/**` | `pageview`, `static-routes` and `gallery` |
| `src/hud/drawer/**` | the drawer specs, `drawer-solid` included |
| `src/hud/dialog/**` and `src/experience/hints/**` | `onboarding`, `experience` and `camera` |
| `src/hud/dialog/{EngineUnlockLayer,engineRoomAction}`, `hud/{floorRows,FloorButtons}` and `hud/pads/**` | `b1-unlock`, `hud-corners`, `hud` and `pads` (the specs they matched before stay through `ALSO_RULES`) |
| `src/hud/{menu,minimap,settings}/**`, `FloorChip`, `FloorButtons`, `ChunkFailed`, `layout.ts`, `src/lib/{local-pref,quality-pref}.ts` | `hud-corners`, `hud` and `onboarding` (`Joystick` and `boost.ts` add `boost`) |
| `src/hud/Hud.tsx`, `ViewControls`, `src/components/Modal.tsx`, `dialog/DialogBox` and `dialog/placement`, `ask/AskDock` | their own specs plus `hud-corners` |
| `src/hud/FloorButtons.tsx`, `src/hud/Hud.tsx` and `src/experience/Experience.tsx` (the elevator panel, the unbuilt-floor link, the route each floor writes) | their own specs plus `arrivals` (its desktop tour rides the panel to every floor) |
| `src/experience/camera/**` | `camera`, `experience`, `career`, `ride` and `arrivals` |
| `src/experience/config.ts`, `floors/career/**`, `floors/library/**`, `floors/labs/layout.ts`, `floors/roof/layout.ts` and `floors/lobby/observatoryLayout.ts` (arrival points and zones) | `arrivals` plus the floor's own specs |
| `src/experience/input/**`, the rover fade and the rover mesh and runtime | `camera` and `experience` (the mesh and runtime add `rover-idle`) |
| `src/experience/rover/{idle,activity}.ts` | `rover-idle` |
| `Readable`, `HoloIcon`, the scene probes and `tower/FloorLevel.tsx` | `camera`, `career`, `experience` and `ride` |
| `src/experience/scene/{FrameLoop,framePacer,cover,coverWatch}`, `CanvasBoundary`, `recovery` and `tower/rideClock` | `lifecycle`, `experience` and `pads` |
| `fx/useDispose`, `scene/memoryProbe`, `scene/sharedResources` and floor mounting (`tower/{Tower,near,FloorLevel}`) | `memory` and `experience` |
| `src/experience/sky/**` and `src/lib/day-night.ts` | `daynight` and `experience` |
| `src/experience/floors/{engine/**,EngineRoom.tsx,chunks/engine.ts}`, `hud/drawer/EngineBody.tsx`, `content/room-views/engine.ts`, `experience/b1.ts`, `hud/floorRows.ts`, `e2e/b1.ts` | `engine-room`, `b1-unlock`, `floor-chunks`, `memory` and more (`floors/engine/layout.ts` adds `arrivals` and `memory`) |
| `e2e/hq.ts`, `playwright.config.ts`, `package.json`, `bun.lock` or `next.config.ts` | the full suite |
| unmapped paths | adds the smoke specs |
| docs and unit tests | nothing |

- `ALSO_RULES` in `scripts/e2e-plan.ts` add specs on top of the first matching rule: shared files that the B1 Engine Room touched (floor rows and picker, drawer data and host, audio, the sky controller, the tower and shaft, chunk loading and prefetch, the data route) keep their own specs and add `engine-room`; the Cmd-K files (`hudActions`, `search`, `palette-types`, `MissionHud`) add `b1-unlock`; so do the unlock's producers (`src/store/`, `Experience.tsx`, `ExperienceGate.tsx`, `src/lib/audio/engine.ts`).
- `scripts/b1-shots.ts` (like the other capture scripts) is offline tooling: it runs no spec.
- The perf planner (`scripts/perf-plan.ts`, PR CI only) maps the lazy B1 files (`floors/engine/**`, `EngineRoom.tsx`, `chunks/engine.ts`, `EngineBody`, `room-views/engine.ts`) to `bytes`, `floor:B1` and `ride:B1`. `floors/engine/layout.ts` and `src/experience/b1.ts` are on the main 3D path (the tower, the registry and the store read them), so they keep the full lane.
- Options: `--dry` prints the plan, `--base <ref>` changes the base, extra args go to Playwright (`bun run e2e:changed --headed`).
- When you add a spec or a folder, add its rule (a unit test checks every spec is known).

### Benches

- `bun run bench` runs the Vitest benches in `tests/bench/` (path finding on the real layouts, palette typing) against frozen copies of the old code in `tests/helpers/*-legacy.ts`.
- Use it for CPU changes and paste the table into the PR.

### Screenshots

- `bun run screenshots`, `screenshots:pages` (15 minutes or more) run only when visuals change and the owner asks for captures, or in CI:
  - nightly on `main`;
  - on demand (Actions > Screenshots > Run workflow);
  - on a PR labelled `screenshots` (also automatic for changes under `docs/design/**`).
- Artifacts: `screenshots`.

### Visual gate

- For look-preserving changes (render budget, batching, visibility, anything that may move pixels):
  `E2E_PORT=<port> bun scripts/visual-gate.ts --base HEAD --profile strict|msaa|batching|release`
  - Builds the base ref in a sibling worktree.
  - `--head <ref>` compares another commit instead of the working tree (builds are cached per commit in sibling worktrees).
  - Captures 3 devices (full 1440x900@2, full 2560x1440@1, lite 390x844) x 8 poses at fixed frame counts with a virtual frame clock (`e2e/vclock.ts`).
  - Runs on the real GPU on macOS (ANGLE Metal; `VISUAL_GATE_GPU=swiftshader` for the CI renderer).
  - Compares the working tree build within the profile's thresholds (strict: per-pixel 0.1, at most 0.1% of pixels).
  - About 20 minutes on an M-series Mac plus builds; one run at a time.
  - `--self` measures the harness noise.
- GPU timings on a real GPU: `bun scripts/perf-gpu.ts sp4|sp9` (results in `docs/perf/r5-gpu.md`).

### Workers and stale builds

- Playwright uses 2 workers locally and on each CI shard (4 vCPU runners).
  - Every worker renders WebGL on the CPU, so more workers starve each other and make 3D tests time out; do not raise it.
  - Do not run two e2e suites at once on one machine.
- Turbopack can serve stale CSS after large style or dependency changes: `rm -rf .next` before `verify:quick` if the export looks wrong.
- Tailwind scans every file in the repo, docs included: a utility class written in a plan or a doc snippet ships in the stylesheet (budget 20,480 B). Use utilities the stylesheet already has.
- B1 UI strings live in the 3D-only `engine` message namespace (`CLIENT_NAMESPACES`, not `LAYOUT_NAMESPACES`), so they never ride in the Classic pages' HTML (budget 80 KB). Read floor labels through `useFloorLabel`.
- `e2e:*` serves `out/` from the last build, so rebuild after code changes (`verify:quick` does).

### CI shards

- CI shards with `scripts/e2e-shard.ts` (both lanes):
  - `playwright test --list`, then the longest test first onto the least-loaded shard by the CI medians in `e2e/durations.json`.
  - Unknown tests count as the median; without the file it falls back to round-robin.
  - Playwright's own `--shard` cuts contiguous blocks.
- Refresh the timings with `bun run e2e:durations` (the last 5 green nightly runs) when the `E2E shard n/8` job times drift apart; PR shard counts are sized from the same file, without the nightly-only tests.
- `bun run e2e:shard 1/8 --dry` prints the plan.
- Shards upload blob reports that `Build, CV and e2e` merges into the `playwright-report` artifact.
- Reproduce a shard locally: `bun run e2e:shard 2/8`.

## Writing 3D tests

- Wait on state, never on time. Use the helpers in `e2e/hq.ts`:
  - `enterHQ`.
  - `enterFloorRoute`: deep link, waits for the scene loop.
  - `waitForSceneLive`: the phase is `explore` before the first frame on deep links, and input sent earlier is dropped.
  - `waitForCameraSettle`: counts rendered frames, so a stalled main thread does not look settled.
  - `waitForFrames`, `waitForFloor`, `waitForRoom`, `waitForRoverMove`.
  - `waitForFloor` follows the ride, not the clock: rides are frame-bound (`RIDE_CAP`, `MAX_PHYSICS_STEP`), so at about 1 fps on a busy SwiftShader runner one trip takes minutes. Its `timeout` is a no-progress window (the live ride from `__hq.motion()` and the rover position); time spent while the ride moves extends the test's timeout, and a trip past `RIDE_FRAME_BUDGET` frames fails. The budgets themselves (scene calls, triangles, memory) never loosen.
  - `expect.poll` for values.
- Static pages: `openPage(page, url)` (or `waitForHydration` after a reload or full navigation) before clicking client islands.
  - The Next.js chunks load after first paint, so `load` fires before hydration (signal: `html[data-hydrated]`, set by `MissionHud`).
  - A URL assertion after a client-side navigation (`router.push`: the RSC payload plus the page chunk) uses `{ timeout: NAV_TIMEOUT }` (`e2e/hq.ts`, 15 s): a CI runner shared with WebGL workers can stall the whole browser for 5 to 6 s, longer than the 5 s expect default.
  - Name UI by its message key (`en.hud.launcher.askRover`), not literal text, so a rename breaks the typecheck instead of a test run.
- `page.waitForTimeout` is only for proving that nothing happens (for example that `?tier=static` never mounts the canvas).
- Pass `?tier=lite` (no bloom or motes) unless the test is about the full tier.
- Memory gates read `readSettledGpuCounters` and `readJsHeapAfterGc` and assert with `expectNoGpuGrowth` against `GPU_MEMORY_BUDGET` (`e2e/budgets.ts` is the one definition of the counts, trips, toggles and heap slack).

### Keeping the suite lean

Each check lives in one place, at the cheapest level that can see the regression (the 2026-10-18 trim, [decisions.md](../decisions.md)):

- Settled floor budgets on a deep link belong to `e2e/perf/floors.spec.ts` (both tiers, with the program baseline). A default-suite spec measures a budget only where the perf lane does not look: a drive, a pose, a station, reduced motion, first person.
- A check with no quality-tier input runs on lite (label placement, routes, HUD, drawers). Run the full tier only for what it adds (bloom, motes, programs, its own budget numbers).
- Do not sample a pose sweep in CI when every pose sits far under budget: keep the highest pose and put the rest behind a capture switch (`LABS_SHOTS`, `L4_SHOTS`) or the local visual gate.
- Layout facts (positions, distances, mirror symmetry, reachable stops, counts) go into Vitest against the pure layout modules; the e2e keeps one case that proves the wiring.
- One ride tour covers the elevator panel, arrivals and routes on every floor (`e2e/arrivals.spec.ts`); add per-floor ride checks there rather than in a new tour.
- Before adding an e2e, search the suite for the same flow (`grep -rn "<the probe or test id>" e2e/`); fold a new assertion into the test that already reaches that state.
- A slow budget sweep, or a second viewport or tier of the same behavior, ends its title with ` @nightly` (see [Nightly-only e2e tests](#nightly-only-e2e-tests)).

### Nightly-only e2e tests

Owner decision 2026-10-18 ([decisions.md](../decisions.md)): no test is dropped; slow budget and matrix checks run only in the nightly.

- A test whose title ends with ` @nightly` runs in the nightly schedule run of `ci.yml` and on a dispatch with the `nightly` input. Pull requests and pushes to `main` (complement runs included) pass `--grep-invert @nightly`, and so does `bun run e2e:changed` (`--nightly` runs them too).
- Shard sizing leaves them out (`specSeconds` in `scripts/e2e-plan.ts`); a selection that matches no test passes (`--pass-with-no-tests` in `scripts/e2e-shard.ts`).
- `bun run e2e:durations` reads the nightly runs by default, the only runs that cover every test.
- A unit test in `tests/unit/e2e-plan.test.ts` pins the count: update it and this list together.
- Per behavior, pull requests and `main` keep one representative viewport and tier; the rest of the matrix is nightly.

| Test | Worker-s | What still guards it on PRs and `main` |
|---|---|---|
| `library-labels`: L4 timeline labels, desktop and phone | 108 + 72 | `tests/unit/library-label-sweep.test.ts`: the same poses and checks without a renderer, on every PR. |
| `gpu`: boot warms every floor (full tier) | 288 | `e2e/perf/floors.spec.ts` (programs per floor against the baseline) when the render path changes. |
| `daynight`: day costs the same programs and calls as night on L1 | 120 | The day and night behavior tests in `daynight.spec.ts`; the L1 perf gate. |
| `highlights`: L1 headroom under the floor budget (full) | 132 | The L1 perf gate on both tiers; the reduced-motion station and gate checks in `highlights.spec.ts`. |
| `memory`: 10 Lobby to Roof round trips (lite) | 162 | `e2e/perf/memory-full.spec.ts` (the same round trips on the full tier); the B1 round trips and Page View toggles stay. |
| `topics`: end plaza labels (desktop) | 50.8 | The phone variant (narrower caps, the most crowded screen). |
| `labs-paths`: arrival (1440x900 full) | 54.7 | The phone arrival; the desktop full tier through the reactor drive. |

- Not moved: the remaining viewport or tier pairs cost under 25 s per variant (HUD corners, drawer, Page View landing) or test tier-specific behavior (the first boost's programs, the Labs arrival calls per tier).
- The gpu, daynight and highlights checks do not follow a PR's perf selection: the perf lane runs only `e2e/perf/`, so it would need a second test directory and a per-floor grep in the e2e job.

### Retries and flaky tests

- No blanket retries: CI retries once; fix a flaky test instead of adding retries.
- The `Build, CV and e2e` job summary lists every test that passed only on retry (`scripts/flaky-report.ts`, plus a warning annotation).
- Give each one an issue with an owner, never a quarantine.

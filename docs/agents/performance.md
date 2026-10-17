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
| Session total, full tier (`BYTES_3D_BUDGET.session`) | full 470 KB (measured 455.0 KB plus a 15 KB margin) | `e2e/budgets.ts` |
| Session total, lite tier | lite 446.4 KB (the measured 431.4 KB plus 15 KB) | `e2e/budgets.ts` |
| Shader programs per floor and tier | within `e2e/perf/baseline.json` + 2 | `e2e/perf/baseline.json`, headroom in `e2e/budgets.ts` (`PROGRAM_HEADROOM`) |
| Full-tier memory round trips (`GPU_MEMORY_BUDGET.fullTierRoundTrips`) | (3) Lobby to Roof round trips, geometries, textures and programs at baseline, heap within the budget | `e2e/budgets.ts` (`GPU_MEMORY_BUDGET`) |
| Look check (`e2e:look`) | at most 0.1% of pixels may differ | `e2e/perf/look.spec.ts` |
| Visual gate, strict profile | per-pixel 0.1, at most 0.1% of pixels | `e2e/visual-gate.spec.ts` |
| Page View LCP | 2 s | `lighthouserc.json` |
| Page View CLS | 0.01 | `lighthouserc.json` |
| Page View TBT | 200 ms | `lighthouserc.json` |
| Page View transfer budgets for fonts, HTML, CSS and JS | see the file | `lighthouserc.json` |
| RUM sampling (`RUM_RATE`) | 25% of 3D sessions | `src/experience/perf/rumDecision.ts` |

Lighthouse CI is described in [ci-and-deploy.md](ci-and-deploy.md#ci).

### Perf lane (`e2e/perf/`)

- Runs only with `PERF=1`: `bun run e2e:perf`.
  - CI job `3D perf gates`: `bun run e2e:perf:shard i/2`, 2 duration-balanced shards; on a PR only for 3D code or a `src/` file the 3D roots import, always on `main` and nightly ([ci-and-deploy.md](ci-and-deploy.md#what-a-pull-request-runs)).
  - Run it when you touch the render path, materials, floor mounting or the 3D chunk's imports.
  - One spec: `E2E_PORT=<port> bun run e2e:perf e2e/perf/<file>` (with `PERF=1` the test dir is `e2e/perf`).
- Each test writes `perf-report/<id>.json`; `bun scripts/perf-summary.ts gates --head perf-report` prints the tables.

| Spec | What it gates |
|---|---|
| `bytes-3d` | 3D JS after the gate (see below) |
| `floors` | every floor and tier: settled scene calls, post passes, triangles, shader programs within `e2e/perf/baseline.json` + 2 |
| `peaks` | boot plus intro, elevator rides through the panel, hover, boosting; every frame |
| `memory-full` | full-tier memory gate (owner decision, see below); it writes the `memory-full` entry of the summary |

#### `bytes-3d`

- Main path: 3D JS after the gate under 450 KB gzip per tier, measured with `?prefetch=off` so it is the main path only.
  - 450 KB gates the critical path before the first frame (`?prefetch=off`).
- Floor chunks: each is loaded through `__hq.floorChunks.load` and capped on its own: `BYTES_3D_BUDGET.floors`, L3 20 KB, L4 16 KB, RF 8 KB gzip.
  - Incremental: a module shared by two floors counts toward the first one loaded, L3.
- Session total: idle prefetch loads every floor in a normal session, so the session total (main + all floor chunks) has its own cap, `BYTES_3D_BUDGET.session` (owner decision).
  - full 470 KB: measured 455.0 KB plus a 15 KB margin so creep is caught early.
  - lite 446.4 KB: the measured 431.4 KB plus 15 KB.
  - Asserted and logged; `scripts/perf-report.ts` prints them as "Floor chunks (loaded on demand)".

#### Memory gates

- `memory-full` (owner decision): `GPU_MEMORY_BUDGET.fullTierRoundTrips` (3) Lobby to Roof round trips on the full tier with Motion Full leave geometries, textures and programs at their baseline and the heap within the budget.
- The lite, reduced-motion memory gate is `e2e/memory.spec.ts` in the regular suite.
- Both use the `e2e/hq.ts` memory helpers and the one budget.

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

The full local suite takes 20 to 40 minutes on SwiftShader; most of it covers code you did not touch. Verify what you changed locally. PR CI runs only the heavy jobs your change needs (smart CI, [ci-and-deploy.md](ci-and-deploy.md#what-a-pull-request-runs)); pushes to `main` and the nightly run the full suite, the perf gates and Lighthouse.

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
| `src/experience/camera/**` | `camera`, `experience`, `career` and `ride` |
| `src/experience/input/**`, the rover mesh, fade and runtime and `src/hud/ViewControls.tsx` | `camera` and `experience` |
| `Readable`, `HoloIcon`, the scene probes and `tower/FloorLevel.tsx` | `camera`, `career`, `experience` and `ride` |
| `src/experience/scene/{FrameLoop,framePacer,cover,coverWatch}`, `CanvasBoundary`, `recovery` and `tower/rideClock` | `lifecycle`, `experience` and `pads` |
| `fx/useDispose`, `scene/memoryProbe`, `scene/sharedResources` and floor mounting (`tower/{Tower,near,FloorLevel}`) | `memory` and `experience` |
| `src/experience/sky/**` and `src/lib/day-night.ts` | `daynight` and `experience` |
| `e2e/hq.ts`, `playwright.config.ts`, `package.json`, `bun.lock` or `next.config.ts` | the full suite |
| unmapped paths | adds the smoke specs |
| docs and unit tests | nothing |

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
- `e2e:*` serves `out/` from the last build, so rebuild after code changes (`verify:quick` does).

### CI shards

- CI shards with `scripts/e2e-shard.ts` (both lanes):
  - `playwright test --list`, then the longest test first onto the least-loaded shard by the CI medians in `e2e/durations.json`.
  - Unknown tests count as the median; without the file it falls back to round-robin.
  - Playwright's own `--shard` cuts contiguous blocks.
- Refresh the timings with `bun run e2e:durations` when the `E2E shard n/4` job times drift apart.
- `bun run e2e:shard 1/4 --dry` prints the plan.
- Shards upload blob reports that `Build, CV and e2e` merges into the `playwright-report` artifact.
- Reproduce a shard locally: `bun run e2e:shard 2/4`.

## Writing 3D tests

- Wait on state, never on time. Use the helpers in `e2e/hq.ts`:
  - `enterHQ`.
  - `enterFloorRoute`: deep link, waits for the scene loop.
  - `waitForSceneLive`: the phase is `explore` before the first frame on deep links, and input sent earlier is dropped.
  - `waitForCameraSettle`: counts rendered frames, so a stalled main thread does not look settled.
  - `waitForFrames`, `waitForFloor`, `waitForRoom`, `waitForRoverMove`.
  - `expect.poll` for values.
- Static pages: `openPage(page, url)` (or `waitForHydration` after a reload or full navigation) before clicking client islands.
  - The Next.js chunks load after first paint, so `load` fires before hydration (signal: `html[data-hydrated]`, set by `MissionHud`).
- `page.waitForTimeout` is only for proving that nothing happens (for example that `?tier=static` never mounts the canvas).
- Pass `?tier=lite` (no bloom or motes) unless the test is about the full tier.
- Memory gates read `readSettledGpuCounters` and `readJsHeapAfterGc` and assert with `expectNoGpuGrowth` against `GPU_MEMORY_BUDGET` (`e2e/budgets.ts` is the one definition of the counts, trips, toggles and heap slack).

### Retries and flaky tests

- No blanket retries: CI retries once; fix a flaky test instead of adding retries.
- The `Build, CV and e2e` job summary lists every test that passed only on retry (`scripts/flaky-report.ts`, plus a warning annotation).
- Give each one an issue with an owner, never a quarantine.

# R5-P4: Measurement and CI Gates Implementation Plan

Status: shipped in #79 (a9e1638), 2026-10-13

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn every performance budget that CI can measure deterministically into a blocking gate (3D bytes after the gate, scene draw calls and post passes, peaks in the intro, rides and hover, shader programs, memory after round trips), make what CI cannot measure visible (a `?perf=1` overlay, a nightly game-first timeline, an anonymous sampled RUM beacon), make CI budgets authoritative in the spec, and stop `deploy.yml` from rerunning e2e on a commit CI already passed.

**Architecture:** A pure `renderStats` module wraps `renderer.render` once per canvas and splits every frame into scene calls (renders of the R3F scene) and post passes (every other render: the full tier's composer), with per-frame peaks and `renderer.info` GPU object counts; `window.__hq.perf` exposes it to Playwright and to the overlay. Gating specs live in a separate Playwright lane (`e2e/perf/`, `PERF=1`) that a new 2-shard CI job runs next to the e2e shards; each test writes one JSON entry to `perf-report/`, and a dependency-free `scripts/perf-summary.ts` turns those entries and the Lighthouse reports into per-chunk diffs and tables against the last green `main` run in the job summary. The RUM beacon is a lazy chunk loaded only in sampled sessions, posting one coarse, allowlisted object to a same-origin Pages Function that writes Analytics Engine `perf_events`.

**Tech Stack:** TypeScript strict, Next.js 16 static export, React 19, three r186 + @react-three/fiber 9 + @react-three/postprocessing 3, zustand 5, Playwright 1.64 (SwiftShader, Chrome DevTools Protocol for throttling and heap), Vitest 5, Bun 1.4, GitHub Actions, Cloudflare Pages Functions + Workers Analytics Engine, Lighthouse CI 0.15.1.

## Global Constraints

- Repo `ShinyQ/ShinyQ-HQ`, planned against `main` @ `f61fbba`. Read `AGENTS.md` (Hard rules, 3D experience, Ask the HQ, Workflow, Fast verification) and `README.md` first. Never modify the read-only reference clone `files/hq-local`.
- Workstream P4 of round 5 (`plan.md`): 3D bytes gate (SP6), per-chunk JS diff, `expectRenderBudget` split into scene vs post passes plus peak sampling (spec gap 8, F5.2, F5.4, SP9), programs and memory gates (F7.2, SP8, spec gap 9), `?perf=1` overlay (Area 13, SP12 option 1), nightly game-first timeline (SP2, Area 4), RUM beacon (SP12, spec gap 4 and 6), deploy reuses CI (Area 12), spec 08 budgets authoritative (spec gap 6, 7, 10).
- Owner decisions copied verbatim from `plan.md`: "RUM: add an anonymous, sampled performance beacon (graphics tier, FPS, load path, time to explore; no IP or user agent) to a Cloudflare Analytics Engine dataset; amend spec 06 section 4." and "`deploy.yml` reuses the green CI result for the same commit instead of rerunning e2e; CI JS budget stays 240 KB and the spec is updated to say CI budgets are authoritative."
- RUM rules for this plan: sampled 25% of 3D sessions, coarse fields only (tier, FPS buckets, load path, time to explore, context loss, boot timeout), no IP, no user agent, one beacon per browser session with `navigator.sendBeacon` to `/api/rum` (same origin), dataset `perf_events`; the CSP stays byte for byte as it is (`tests/unit/csp.test.ts` unchanged).
- Thresholds: 3D JS after the gate fails at 450 KB gzip (spec ceiling 600 KB), lite and full; scene draw calls < 150 per frame (settled and peaks), post passes <= 20, triangles < 30k, L1 scene <= 125, RF scene <= 79 (today's `< 80`); shader programs <= committed baseline + 2; memory deltas 0 with JS heap growth < 2 MB (P3's test); Lighthouse budgets unchanged (LCP 2000 ms, CLS 0.01, TBT 200 ms, JS 240 KB, CSS 20 KB, fonts 60 KB, HTML 80 KB).
- Time-based metrics (FPS, frame times, timeline marks) are never a CI gate: SwiftShader timing is noise (REPORT Area 12). They are trend artifacts, overlay readings or RUM.
- The aesthetic must not change. Nothing in this plan changes 3D pixels; the look check (Task 1) proves it after every task that touches the render path (desktop full 1440x900 and 2560x1440, phone lite 390x844, same camera poses, max 0.1% differing pixels). The footer privacy line is the only visible change (Page View footer only).
- Never remove the rover, neon look, bloom, holograms, missions or the intro. Nothing here does.
- No em dashes (U+2014) anywhere: code, comments, copy, docs, commits, PR text. EN/ID strings for every visible text; ASCII plus Latin-1 in messages.
- Bun is the package manager; prefix git with `rtk`. Conventional commits. One PR; do not merge without the owner.
- Local e2e port for this workstream: `4433` (`E2E_PORT=4433`). Do not run two e2e suites at once on one machine.
- Fast verification before every push: `bun run verify:quick`, then `E2E_PORT=4433 bun run e2e:changed`; plus `E2E_PORT=4433 bun run e2e:perf` once the perf lane exists.
- New workflows request only the permissions they use; third-party actions are pinned by SHA (this plan adds none).

---

## Before you start

- [x] Branch from the latest `main` and install:

```bash
rtk git fetch origin && rtk git switch -c feat/r5-p4-measurement-gates origin/main
bun install
```

- [x] Build `main` once into `out-main/` for every before/after comparison in this plan (the look check, the 3D bytes A/B, the draw call A/B):

```bash
bun run build
rm -rf out-main && cp -R out out-main
```

Expected: `bun run build` ends with the `defer-scripts` line and exit code 0; `ls out-main/en.html` prints the path.

- [x] Record today's draw calls with the existing gate (the "before" numbers for the PR body):

```bash
E2E_PORT=4433 bunx playwright test e2e/highlights.spec.ts -g "headroom" --reporter=list 2>&1 | grep "^L1 "
```

Expected (numbers from REPORT F5.2, plus or minus a few calls): ten lines such as `L1 lite at spawn: 115 calls, 15876 triangles` and `L1 full at spawn: 134 calls, 16103 triangles`. Paste them into a scratch note for Task 13.

- [x] Check the rest of round 5 for already merged work this plan touches (see "Cross-workstream contracts" below): `rtk git log --oneline origin/main -20`. If P3 merged its memory test or P1 merged the boot card headline, read their diff first and follow the rebase notes.

## Decisions made in this plan

| Question | Decision | Why |
|---|---|---|
| How are scene calls and post passes told apart? | Wrap `renderer.render` once (`instrumentRenderer`): a call whose scene is the R3F root scene is scene work, every other call is a post pass | The composer's `RenderPass` renders the R3F scene; bloom mip passes and the effect pass render their own full-screen scenes. Works on both tiers (lite: R3F's own `gl.render`), needs no postprocessing internals and keeps today's whole-frame totals in `__hq.rover.drawCalls` |
| Where do the per-frame counters run? | `RenderCounter` with `useFrame(..., -100)`: negative priority runs first and does not take over rendering | R3F only switches to manual rendering for priorities above 0 (`events-*.js` `subscribe`) |
| Peaks or samples? | Every frame since `resetPeaks()` (peak scene, post, triangles, min scene, frame count) | The old 5 samples 300 ms apart could miss a spike; peaks are still deterministic counters |
| Where do the gating specs run? | A separate lane `e2e/perf/` (`PERF=1`, ignored by the default suite) in a new CI job `3D perf gates` (2 shards) parallel to the e2e shards | Adds about 8 test-minutes on SwiftShader; in the 4 e2e shards it would lengthen the critical path by about 2 minutes, in its own job it adds none |
| How is "3D JS after the gate" measured? | Two cold contexts: `/en?tier=static` (Page View scripts) and `/en?tier=lite|full` until the scene runs and the network is quiet for 3 s; 3D bytes = encoded body bytes of every response the Page View load did not fetch | Deterministic (same build, same gzip), no bundle analyzer (webpack only), and it measures what a visitor downloads, not a chunk graph guess |
| Per-chunk diff baseline | The newest successful `ci.yml` push run on `main` (artifacts `lighthouse-reports` and `perf-report`), downloaded with `gh run download` | Chunk names are content hashes, so a changed chunk shows as one removed and one added row; totals and deltas stay exact |
| Shader program gate | Committed per-floor baseline `e2e/perf/baseline.json`, fail above baseline + 2; regenerate with one command when materials change on purpose | Program counts are deterministic but legitimately change with new materials (and with P2/P6 precompile); an exact pin would churn, no pin would miss a per-frame material leak |
| Peaks above 150 on main before P2 lands | `KNOWN_OVER` set in `peaks.spec.ts` turns exactly those scenarios into `test.fail` expected failures | The gate lands now; when P2's fix brings a peak under 150 the expected failure "passes", Playwright reports it, and the id must be removed (a ratchet, never a silent skip) |
| Overlay cost when off | A regex on `location.search` at mount; the overlay and its probe are a lazy chunk | "Zero cost otherwise": no download, no `useFrame`, no timer |
| RUM cost when not sampled | Decision code (about 0.4 KB) in the 3D chunk; probe, protocol and sampler are a lazy chunk loaded only in sampled sessions | 75% of sessions pay nothing but one `sessionStorage` read |
| RUM transport | `navigator.sendBeacon("/api/rum", JSON string)`: `text/plain`, CORS-safelisted, same origin, no preflight, survives unload | CSP `connect-src 'self'` already allows it |
| When is the beacon sent? | Once per browser session, on the first of: tab hidden, `pagehide`, 3D view closed (Page View), WebGL context lost | Captures context loss and the FPS window without a timer; `sessionStorage["hq:rum"] = "sent"` guarantees one point |
| Who is never sampled? | `navigator.webdriver` (all e2e and audits), Do Not Track, Global Privacy Control; `?rum=0` opts out, `?rum=1` forces (preview checks and tests) | Keeps test runs out of the dataset and respects privacy signals |
| Endpoint origin check | `originAllowed(request, env.ASK_ALLOWED_ORIGINS)` from the Ask Function | Same site origins, same tested guard; no new variable |
| Endpoint abuse | Exact allowlisted object, 512 bytes max, same Origin, per-isolate cap 600 points per minute, kill switch `RUM_ENABLED` | Free plan allows 100k points per day; a spammer can only add valid-looking coarse points |
| Deploy without e2e | `scripts/ci-status.ts`: reuse a green `Build, CV and e2e` check on the sha (waiting up to 40 min while CI runs), else a green CI run on a commit with the same tree; red CI fails the deploy; no result or `rerun_e2e` runs the shards as before | The facts PR is squash-merged with `GITHUB_TOKEN`, which starts no push CI on main; its PR head has the same tree |
| CI on main cancels older runs today | `cancel-in-progress` only for pull requests | Every main commit keeps a CI result the deploy can reuse |
| Visitor-facing privacy note | One EN/ID sentence in the site footer (`footer.privacy`) | The beacon is new data collection; the spec privacy note says what the footer says |

## Cross-workstream contracts (agreed names) and rebase notes

| Workstream | Shared file or name | Contract | Rebase note |
|---|---|---|---|
| P3 (CPU, lifecycle, memory) | Memory round-trip test | P3 owns the leak fixes and the test file `e2e/perf/memory.spec.ts` (perf lane, runs in the `3D perf gates` job). It uses only these P4 names: `readGpuCounters(page): Promise<GpuCounters>`, `GpuCounters = { geometries: number; textures: number; programs: number }`, `expectNoGpuGrowth(before, after, budget?)`, `readJsHeapAfterGc(page): Promise<number>` (all in `e2e/hq.ts`), `GPU_MEMORY_BUDGET = { geometries: 0, textures: 0, programs: 0, heapBytes: 2 * 1024 * 1024, roundTrips: 10 }` (`e2e/budgets.ts`) and `writePerfEntry({ kind: "memory", tier, trips, before, after, heapDeltaBytes })` (`e2e/perf/helpers.ts`). P4 owns those helpers, the thresholds, the CI job and the summary table | If P3 merges first with the same names in `e2e/hq.ts`: keep P3's bodies if they read `window.__hq.perf.stats`; otherwise replace them with Task 2's bodies. If P3 put its spec at `e2e/memory.spec.ts`: `rtk git mv e2e/memory.spec.ts e2e/perf/memory.spec.ts`, drop `"memory"` from `ALL_SPECS` in `scripts/e2e-plan.ts`, fix its imports to `../hq` |
| P3 | Pause rendering when > 90% covered | `expectRenderBudget` asserts at least 3 rendered frames in its window, so a budget check under a full-screen overlay fails loudly instead of passing on stale numbers | Call budget checks with the drawer closed or a desktop side panel (all current call sites already do) |
| P3 | `src/experience/Experience.tsx` (context-loss boundary and retry), `src/experience/scene/Director.tsx` (store mirror only on change) | P4 edits the `__hq` handle line, `FirstFrame`, imports and three JSX insertions in `Experience.tsx`; in `Director.tsx` it deletes the `info` block in `useFrame` and rewrites the two `roverRuntime.drawCalls/triangles` lines in the 0.1 s sync block | Re-apply by hand on conflict: the sync block keeps P3's change-gating, with P4's two lines inside it. `RenderCounter` resets its stats on remount, so P3's one-retry remount needs nothing extra |
| P2 (GPU) | Peaks in intro and rides, bloom passes, screenshot diffs, runtime monitor | P2 fixes peaks; P4 measures and gates them (`KNOWN_OVER` ratchet). Post passes stay <= 20 after P2's bloom-level change. P2's runtime monitor may reuse `FrameSampler` (`src/experience/perf/frames.ts`) instead of a second ring buffer. P2's screenshot-diff harness supersedes `e2e/perf/look.spec.ts` if it lands first | When P2 merges: run `E2E_PORT=4433 bun run e2e:perf e2e/perf/peaks.spec.ts`; every `KNOWN_OVER` id that now passes shows as "expected to fail, but passed"; delete it. Regenerate `e2e/perf/baseline.json` if P2 changed materials (Task 5 Step 4) |
| P6 (elevator ride, precompile) | `src/experience/scene/Director.tsx` (ride clock cap next to the `info` block), `Scene.tsx` / `Experience.tsx` (precompile) | No shared names. Precompile raises program counts early | Regenerate `e2e/perf/baseline.json` after rebasing onto P6 (Task 5 Step 4) and say so in the PR |
| P7 (camera, wheel zoom) | Wheel no longer changes floors | P4 tests ride with the elevator panel only (`[data-floor]` buttons), never the wheel | None |
| P1 (Page View, delivery, boot card) | Boot card headline; `lighthouserc.json`; `src/lib/boot-first.ts`; `docs/deploy.md` section 8; `README.md` budgets paragraph | P1 puts `elementtiming="hq-headline"` on the SSR boot card headline element; the nightly timeline reads that Element Timing entry (`headline`, null until P1 lands). P1 owns `lighthouserc.json` (warm-up URL); the chunk diff reads whatever URLs LHCI ran. P4 adds one `performance.mark` to `releaseBootCover` and the inline `off` function | On conflict in `boot-first.ts`, keep both: P1's boot card changes plus the two mark statements. Merge both edits in `docs/deploy.md` section 8 and the README paragraph |
| All | `AGENTS.md`, `README.md`, `e2e/hq.ts`, `scripts/e2e-plan.ts` | Additive edits only | Rebase and keep every side's bullets and rules |

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/experience/perf/renderStats.ts` | Create | Pure per-frame counters: `instrumentRenderer`, `closeFrame`, `renderStats`, `resetPeaks`, `resetRenderStats` |
| `src/experience/perf/RenderCounter.tsx` | Create | Installs the counter on the canvas renderer, closes each frame first |
| `src/experience/perf/frames.ts` | Create | `FrameSampler` ring buffer with FPS p50/p10 and frame p95 (overlay, RUM, optionally P2) |
| `src/experience/perf/lines.ts` | Create | Pure `perfOverlayOn(search)` and `perfLines(input)` for the overlay |
| `src/experience/perf/PerfOverlay.tsx` | Create | Lazy `?perf=1` chunk: `PerfProbe` (in the canvas) and the panel (HTML) |
| `src/experience/perf/usePerfMarks.ts` | Create | Store transitions to User Timing marks |
| `src/experience/perf/rumDecision.ts` | Create | Session sampling decision and load path (small, in the 3D chunk) |
| `src/experience/perf/rum.ts` | Create | `RumSession`: FPS window, context loss, payload (lazy chunk) |
| `src/experience/perf/RumProbe.tsx` | Create | Lazy chunk for sampled sessions: frames in, one beacon out |
| `src/lib/perf-marks.ts` | Create | Mark names and `markOnce` / `markTime` (contract with the timeline spec) |
| `src/lib/rum/protocol.ts` | Create | RUM wire contract: buckets, `parseRumPayload`, `rumDataPoint` (client and Function) |
| `src/lib/boot-first.ts` | Modify | `hq:boot-release` mark in the inline script and in `releaseBootCover` |
| `src/experience/scene/Scene.tsx` | Modify | Mount `RenderCounter` |
| `src/experience/scene/Director.tsx` | Modify | Drop its own `info` reset; mirror totals from `renderStats` |
| `src/experience/rover/runtime.ts` | Modify | Doc comments of `drawCalls` and `triangles` |
| `src/experience/Experience.tsx` | Modify | `__hq.perf`, first-frame mark, `usePerfMarks`, lazy overlay and RUM probe |
| `src/components/SiteFooter.tsx`, `messages/en.json`, `messages/id.json` | Modify | `footer.privacy` line |
| `functions/_lib/rum.ts` | Create | `createRumHandler`: method, kill switch, origin, size, schema, cap, write |
| `functions/api/rum.ts` | Create | `POST /api/rum` Pages Function |
| `functions/_lib/types.ts` | Modify | Generic `PagesContext<E>`, `RumEnv` |
| `wrangler.toml` | Modify | `PERF_EVENTS` dataset binding, `RUM_ENABLED` var |
| `e2e/budgets.ts` | Create | Every 3D CI threshold in one file |
| `e2e/hq.ts` | Modify | Split `expectRenderBudget`, peaks, GPU counters, heap, `waitForFrames(minMs)` |
| `e2e/highlights.spec.ts`, `e2e/roof.spec.ts` | Modify | Floor caps on scene calls from `FLOOR_SCENE_CAPS` |
| `e2e/perf/helpers.ts` | Create | `writePerfEntry`, `waitForStablePrograms` |
| `e2e/perf/baseline.json` | Create | Shader program baseline per tier and floor |
| `e2e/perf/look.spec.ts` | Create | Local before/after look check (`@look`, never in CI) |
| `e2e/perf/bytes-3d.spec.ts` | Create | 3D bytes gate (lite, full) |
| `e2e/perf/floors.spec.ts` | Create | Settled budget on both tiers and every floor plus the program gate |
| `e2e/perf/peaks.spec.ts` | Create | Peak scene calls in boot plus intro, rides and hover |
| `e2e/perf/timeline.spec.ts` | Create | Nightly game-first timeline (`@nightly`, trend only) |
| `e2e/perf-probes.spec.ts` | Create | Default suite: overlay on and off, marks, RUM beacon, footer note |
| `playwright.config.ts` | Modify | `PERF` lane and `E2E_DIR` |
| `package.json` | Modify | `e2e:perf`, `e2e:timeline`, `e2e:look` |
| `scripts/perf-report.ts` | Create | Pure summary logic: chunk diffs, gate tables, timeline, program baseline |
| `scripts/perf-summary.ts` | Create | CLI that writes the job summaries and the baseline file |
| `scripts/perf-base.sh` | Create | Downloads the newest `main` artifact for a baseline (never fails) |
| `scripts/ci-status.ts` | Create | Deploy gate: reuse the CI result for a commit or tree |
| `scripts/deploy-smoke.ts` | Modify | `GET /api/rum` must answer 405 |
| `scripts/e2e-plan.ts` | Modify | Rules for `e2e/perf/`, `e2e/budgets.ts`, perf and RUM code, new scripts; `perf-probes` spec |
| `.github/workflows/ci.yml` | Modify | `perf` job, Lighthouse chunk diff, aggregate summary, main runs never cancelled |
| `.github/workflows/deploy.yml` | Modify | `verify` job reuses CI; e2e shards only as a fallback |
| `.github/workflows/perf-nightly.yml` | Create | Nightly timeline with trend summary |
| `.gitignore` | Modify | `perf-report/`, `out-main/`, look snapshots |
| Tests | Create/Modify | `tests/unit/{render-stats,perf-report,perf-marks,perf-frames,rum-protocol,rum-client,rum-endpoint,ci-status}.test.ts`, `tests/unit/{boot-first,deploy-smoke,e2e-plan}.test.ts` |
| Docs | Modify | Spec 06 section 4 and privacy note, spec 08 sections 2 and 3, main spec analytics rows, `AGENTS.md`, `README.md`, `docs/deploy.md` |

Task order and dependencies: 1 (perf lane, look check) first; 2 (render counters) needs 1; 3 (report module) needs 2; 4 (bytes gate and CI job) needs 3; 5 (floors and programs) and 6 (peaks) need 4; 7 (marks and overlay) needs 2; 8 (RUM client) needs 7; 9 (RUM Function) needs 8; 10 (nightly timeline) needs 3 and 7; 11 (deploy reuse) is independent after 1; 12 (docs and privacy note) needs 4 to 11; 13 (verification and PR) is last.

---
### Task 1: Perf test lane and the local look check

Adds a Playwright lane for perf specs that the default suite and its shards never list, a way to serve another build (`E2E_DIR`) for before/after runs, and the look check every render-path task in this plan reruns (global rule: same poses, explicit threshold).

**Files:**
- Modify: `playwright.config.ts`
- Modify: `package.json` (scripts)
- Modify: `scripts/e2e-plan.ts` (rules)
- Modify: `tests/unit/e2e-plan.test.ts`
- Modify: `.gitignore`
- Create: `e2e/perf/look.spec.ts`

**Interfaces:**
- Consumes: `enterHQ`, `openPage`, `waitForCameraSettle`, `waitForFrames` from `e2e/hq.ts` (existing).
- Produces: env `PERF=1` (perf lane on), env `E2E_DIR` (static dir served by the Playwright web server, default `out`), scripts `e2e:perf`, `e2e:timeline`, `e2e:look`; tags `@look` and `@nightly` (excluded from `e2e:perf`); look snapshots under `e2e/perf/look.spec.ts-snapshots/` (gitignored).

- [x] **Step 1: Write the failing e2e-plan tests**

In `tests/unit/e2e-plan.test.ts`, add inside `describe("specsForChanges", ...)`:

```ts
  it("keeps the perf lane out of the regular suite and treats the budgets as shared infrastructure", () => {
    expect(specsForChanges(["e2e/perf/look.spec.ts"]).specs).toEqual([]);
    expect(specsForChanges(["e2e/perf/baseline.json"]).specs).toEqual([]);
    expect(specsForChanges(["e2e/budgets.ts"]).specs).toBe("all");
    expect(specsForChanges(["scripts/perf-summary.ts", "scripts/perf-base.sh", "scripts/ci-status.ts"]).specs).toEqual([]);
  });
```

- [x] **Step 2: Run it to see it fail**

Run: `bun run test tests/unit/e2e-plan.test.ts`
Expected: FAIL in "keeps the perf lane out of the regular suite": `e2e/perf/look.spec.ts` falls back to the smoke specs, `e2e/budgets.ts` is not `"all"`.

- [x] **Step 3: Add the rules**

In `scripts/e2e-plan.ts`, replace:

```ts
  { test: /^e2e\/(hq|routes)\.ts$/, specs: "all" },
  { test: /^e2e\/screenshots\.spec\.ts$|^e2e\/pageview-visual\.spec\.ts$/, specs: [] },
  // Not part of the site or the e2e suite.
  { test: /^(docs|tests|\.github)\/|\.md$|^scripts\/(e2e-|validate-|floor-thumbs)|^lighthouserc\.json$|^eslint\.config\.mjs$|^vitest\.config\.mts$/, specs: [] },
```

with:

```ts
  { test: /^e2e\/(hq|routes|budgets)\.ts$/, specs: "all" },
  { test: /^e2e\/screenshots\.spec\.ts$|^e2e\/pageview-visual\.spec\.ts$/, specs: [] },
  // Perf lane (PERF=1): `bun run e2e:perf` and the CI `3D perf gates` job run it, never the regular suite.
  { test: /^e2e\/perf\//, specs: [] },
  // Not part of the site or the e2e suite.
  { test: /^(docs|tests|\.github)\/|\.md$|^scripts\/(e2e-|validate-|floor-thumbs|perf-|ci-status)|^lighthouserc\.json$|^eslint\.config\.mjs$|^vitest\.config\.mts$/, specs: [] },
```

- [x] **Step 4: Run the test to see it pass**

Run: `bun run test tests/unit/e2e-plan.test.ts`
Expected: PASS (all tests).

- [x] **Step 5: Add the lane and `E2E_DIR` to the Playwright config**

In `playwright.config.ts`, replace:

```ts
const SCREENSHOTS = Boolean(process.env.SCREENSHOTS);
```

with:

```ts
const SCREENSHOTS = Boolean(process.env.SCREENSHOTS);
// Perf lane (e2e/perf/): the CI `3D perf gates` job, `bun run e2e:perf`, the nightly timeline and the local look check.
const PERF = Boolean(process.env.PERF);
// Static export the web server serves: `out` by default, `E2E_DIR=out-main` for before/after runs against a main build.
const DIR = process.env.E2E_DIR ?? "out";
```

Replace:

```ts
const SCREENSHOT_SPECS = ["**/screenshots.spec.ts", "**/pageview-visual.spec.ts"];
```

with:

```ts
const SCREENSHOT_SPECS = ["**/screenshots.spec.ts", "**/pageview-visual.spec.ts"];

/** Perf specs only run with PERF=1, so the regular suite, `e2e:changed` and the CI shards never list them. */
const PERF_SPECS = ["**/perf/**"];
```

Replace:

```ts
  testIgnore: SCREENSHOTS ? [] : SCREENSHOT_SPECS,
```

with:

```ts
  testIgnore: [...(SCREENSHOTS ? [] : SCREENSHOT_SPECS), ...(PERF ? [] : PERF_SPECS)],
```

Replace:

```ts
    command: `bun scripts/serve-static.ts --port ${PORT}`,
```

with:

```ts
    command: `bun scripts/serve-static.ts --port ${PORT} --dir ${DIR}`,
```

- [x] **Step 6: Add the scripts**

In `package.json` `scripts`, after `"e2e:shard": "bun scripts/e2e-shard.ts",` add:

```json
    "e2e:perf": "PERF=1 playwright test e2e/perf --grep-invert \"@nightly|@look\"",
    "e2e:timeline": "PERF=1 playwright test e2e/perf/timeline.spec.ts --workers=1",
    "e2e:look": "PERF=1 playwright test e2e/perf/look.spec.ts --workers=1",
```

- [x] **Step 7: Ignore local outputs**

Append to `.gitignore`:

```
# Perf lane: one JSON per measurement (CI uploads it), the main build for before/after runs, local look snapshots
/perf-report/
/out-main/
e2e/perf/*-snapshots/
```

- [x] **Step 8: Write the look check**

Create `e2e/perf/look.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { enterHQ, openPage, waitForCameraSettle, waitForFrames } from "../hq";

/**
 * Local look check (`bun run e2e:look`, never in CI): the same camera poses rendered by two builds
 * must match, so a measurement change can never change the look (round 5 rule). Write the baselines
 * from a main build, then compare the branch build:
 *
 *   E2E_DIR=out-main E2E_PORT=4433 bun run e2e:look --update-snapshots
 *   E2E_PORT=4433 bun run e2e:look
 *
 * Snapshots stay local (gitignored). Reduced motion holds every animation and snaps the camera, so a
 * pose is one still frame. Only the canvas is captured (the HUD is HTML and changes on its own).
 */
const POSES = [
  { name: "desktop-full-1440", tier: "full", viewport: { width: 1440, height: 900 }, mobile: false },
  { name: "desktop-full-2560", tier: "full", viewport: { width: 2560, height: 1440 }, mobile: false },
  { name: "phone-lite-390", tier: "lite", viewport: { width: 390, height: 844 }, mobile: true },
] as const;

const FLOORS = [
  { floor: "L1", path: "/en" },
  { floor: "L3", path: "/en/labs" },
] as const;

/** At most 0.1% of the pixels may differ by more than the per-pixel threshold (0.1 in YIQ space). */
const LOOK = { maxDiffPixelRatio: 0.001, threshold: 0.1 } as const;

test.describe.configure({ timeout: 240_000 });

for (const pose of POSES) {
  for (const { floor, path } of FLOORS) {
    test(`${floor} ${pose.name} @look`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: pose.viewport, isMobile: pose.mobile, hasTouch: pose.mobile, reducedMotion: "reduce" });
      const page = await context.newPage();
      await enterHQ(page, { path, tier: pose.tier });
      await waitForCameraSettle(page);
      await waitForFrames(page, 30);
      const canvas = page.locator("[data-testid='hq-world'] canvas");
      expect(await canvas.screenshot()).toMatchSnapshot(`${floor}-${pose.name}.png`, LOOK);
      await context.close();
    });
  }
}

for (const width of [1440, 390]) {
  test(`Page View main column ${width} @look`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    await openPage(page, "/en/quick?tier=static");
    await page.evaluate(() => document.fonts.ready);
    expect(await page.locator("#main").screenshot()).toMatchSnapshot(`pageview-main-${width}.png`, LOOK);
    // The footer may change on purpose (Task 12); it is saved for review in the PR, not compared.
    await page.locator("footer").screenshot({ path: `screenshots/look/footer-${width}.png` });
    await context.close();
  });
}
```

- [x] **Step 9: Record the baselines from main and prove the check is stable**

```bash
lsof -i :4433 || true
E2E_DIR=out-main E2E_PORT=4433 bun run e2e:look --update-snapshots
E2E_DIR=out-main E2E_PORT=4433 bun run e2e:look
```

Expected: `lsof` prints nothing (no server on the port). The first run writes 8 snapshots (`8 passed`, snapshot files under `e2e/perf/look.spec.ts-snapshots/`). The second run, main against itself, prints `8 passed`. If it fails, the scene is not still under reduced motion: open the diff in `test-results/`, and if the noise ratio shown is above 0.001, set `maxDiffPixelRatio` in `LOOK` to twice that ratio and write the measured ratio in the PR body. Do not continue with a check that fails against itself.

- [x] **Step 10: Typecheck, lint and commit**

```bash
bun run typecheck && bun run lint
rtk git add playwright.config.ts package.json scripts/e2e-plan.ts tests/unit/e2e-plan.test.ts .gitignore e2e/perf/look.spec.ts
rtk git commit -m "test: perf lane (PERF=1), E2E_DIR and a local look check"
```

Expected: both commands exit 0; the commit is created. Rollback: revert this commit; nothing in the site changed.

---

### Task 2: Scene vs post-pass render counters and the split render budget

Splits `renderer.info` into scene calls and post passes per frame with peaks and GPU object counts (spec gap 8, F5.2, F7.2), exposes them as `window.__hq.perf`, and rewrites `expectRenderBudget` to check the worst frame of a window: scene < 150, post <= 20, triangles < 30k. Defines every 3D threshold in `e2e/budgets.ts` and the memory helpers P3 uses.

**Files:**
- Create: `src/experience/perf/renderStats.ts`
- Create: `src/experience/perf/RenderCounter.tsx`
- Create: `tests/unit/render-stats.test.ts`
- Modify: `src/experience/scene/Scene.tsx`
- Modify: `src/experience/scene/Director.tsx:74-76, 203-210, 410-411`
- Modify: `src/experience/rover/runtime.ts` (comments)
- Modify: `src/experience/Experience.tsx:107` (`__hq` handle)
- Create: `e2e/budgets.ts`
- Modify: `e2e/hq.ts`
- Modify: `e2e/highlights.spec.ts:40, 286-289, 300-301`
- Modify: `e2e/roof.spec.ts:15, 90-93, 122-125`

**Interfaces:**
- Consumes: R3F `useFrame(callback, priority)`, `useThree`.
- Produces:
  - `renderStats: RenderStats` with `sceneCalls`, `postCalls`, `triangles` (last whole frame), `peakSceneCalls`, `peakPostCalls`, `peakTriangles`, `minSceneCalls`, `peakFrames` (since `resetPeaks()`), `programs`, `geometries`, `textures` (live `renderer.info`), `frames`.
  - `instrumentRenderer(gl: RendererLike, isScene: (scene: unknown) => boolean): () => void`, `closeFrame(): void`, `resetPeaks(): void`, `resetRenderStats(): void`.
  - `window.__hq.perf = { stats: renderStats, resetPeaks }`.
  - `e2e/budgets.ts`: `RENDER_BUDGET`, `RenderBudget`, `FLOOR_SCENE_CAPS`, `BUDGET_WINDOW`, `BYTES_3D_BUDGET`, `PAGE_JS_BUDGET`, `WARN_RATIO`, `PROGRAM_HEADROOM`, `GPU_MEMORY_BUDGET`.
  - `e2e/hq.ts`: `RenderPeaks`, `resetRenderPeaks(page)`, `readRenderPeaks(page)`, `expectPeaksWithinBudget(peaks, label, budget?)`, `expectRenderBudget(page): Promise<RenderPeaks>`, `GpuCounters`, `readGpuCounters(page)`, `expectNoGpuGrowth(before, after, budget?)`, `readJsHeapAfterGc(page)`, `waitForFrames(page, count?, minMs?)`, `HQSnapshot.sceneCalls`, `HQSnapshot.postCalls`.

- [x] **Step 1: Write the failing unit test**

Create `tests/unit/render-stats.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { closeFrame, instrumentRenderer, renderStats, resetPeaks, resetRenderStats, type RendererLike } from "@/experience/perf/renderStats";

/** A renderer double: each render() adds the draws registered for that scene (2 triangles each), like three.js with autoReset off. */
function fakeRenderer() {
  const info = {
    autoReset: true,
    render: { calls: 0, triangles: 0 },
    memory: { geometries: 7, textures: 3 },
    programs: [{}, {}] as unknown[],
    reset() {
      info.render.calls = 0;
      info.render.triangles = 0;
    },
  };
  const draws = new Map<unknown, number>();
  const gl: RendererLike = {
    info,
    render(scene) {
      const calls = draws.get(scene) ?? 0;
      info.render.calls += calls;
      info.render.triangles += calls * 2;
    },
  };
  return { gl, info, draws };
}

const SCENE = { name: "r3f scene" };
const QUAD = { name: "full-screen pass" };

beforeEach(() => resetRenderStats());

describe("render stats", () => {
  it("splits a frame into scene calls and post passes and turns autoReset off", () => {
    const { gl, info, draws } = fakeRenderer();
    draws.set(SCENE, 100);
    draws.set(QUAD, 1);
    const uninstall = instrumentRenderer(gl, (s) => s === SCENE);
    expect(info.autoReset).toBe(false);
    gl.render(SCENE, null);
    for (let i = 0; i < 18; i++) gl.render(QUAD, null);
    closeFrame();
    expect(renderStats).toMatchObject({ sceneCalls: 100, postCalls: 18, triangles: 236, programs: 2, geometries: 7, textures: 3, frames: 1 });
    expect(info.render.calls).toBe(0);
    uninstall();
  });

  it("keeps the worst and the lightest frame since resetPeaks", () => {
    const { gl, draws } = fakeRenderer();
    instrumentRenderer(gl, (s) => s === SCENE);
    for (const calls of [50, 120, 80]) {
      draws.set(SCENE, calls);
      gl.render(SCENE, null);
      closeFrame();
    }
    expect(renderStats).toMatchObject({ peakSceneCalls: 120, minSceneCalls: 50, peakFrames: 3, sceneCalls: 80 });
    resetPeaks();
    draws.set(SCENE, 60);
    gl.render(SCENE, null);
    closeFrame();
    expect(renderStats).toMatchObject({ peakSceneCalls: 60, minSceneCalls: 60, peakFrames: 1, frames: 4 });
  });

  it("does not count a frame that rendered nothing", () => {
    const { gl } = fakeRenderer();
    instrumentRenderer(gl, () => true);
    closeFrame();
    closeFrame();
    expect(renderStats).toMatchObject({ frames: 0, peakFrames: 0, sceneCalls: 0, programs: 2 });
  });

  it("reports an unbounded draw as non-finite instead of hiding it", () => {
    const { gl, info } = fakeRenderer();
    gl.render = () => {
      info.render.calls += 1;
      info.render.triangles = Number.POSITIVE_INFINITY;
    };
    instrumentRenderer(gl, () => true);
    gl.render(SCENE, null);
    closeFrame();
    expect(Number.isFinite(renderStats.peakTriangles)).toBe(false);
  });

  it("restores the original render on uninstall and stops counting", () => {
    const { gl, draws } = fakeRenderer();
    const original = gl.render;
    const uninstall = instrumentRenderer(gl, () => true);
    expect(gl.render).not.toBe(original);
    uninstall();
    expect(gl.render).toBe(original);
    draws.set(SCENE, 5);
    gl.render(SCENE, null);
    closeFrame();
    expect(renderStats.frames).toBe(0);
  });
});
```

- [x] **Step 2: Run it to see it fail**

Run: `bun run test tests/unit/render-stats.test.ts`
Expected: FAIL with `Failed to resolve import "@/experience/perf/renderStats"`.

- [x] **Step 3: Implement the counters**

Create `src/experience/perf/renderStats.ts`:

```ts
/**
 * Per-frame render counters (appendix 08 section 2), split into the scene pass and post-processing
 * passes. `instrumentRenderer` wraps `renderer.render` once: a call that renders the R3F scene is scene
 * work, any other call (the full tier's composer: bloom mip passes, the effect pass) is a post pass.
 * `closeFrame` runs first in every R3F frame and publishes the previous frame. Pure (no React, no
 * three import) so Vitest runs it in node. Read through `window.__hq.perf` (e2e) and by the `?perf=1`
 * overlay.
 */
export interface RendererLike {
  render: (scene: unknown, camera: unknown) => void;
  info: {
    autoReset: boolean;
    render: { calls: number; triangles: number };
    memory: { geometries: number; textures: number };
    programs?: readonly unknown[] | null;
    reset: () => void;
  };
}

export interface RenderStats {
  /** Last whole frame: scene draw calls, post-processing passes, triangles of both. */
  sceneCalls: number;
  postCalls: number;
  triangles: number;
  /** Worst frame since `resetPeaks()`, and the lightest scene frame (a frame that drew nothing is not counted). */
  peakSceneCalls: number;
  peakPostCalls: number;
  peakTriangles: number;
  minSceneCalls: number;
  /** Frames counted since `resetPeaks()`. */
  peakFrames: number;
  /** Live GPU objects from `renderer.info` (three.js has no material count). */
  programs: number;
  geometries: number;
  textures: number;
  /** Frames counted since the counter was installed. */
  frames: number;
}

const initial = (): RenderStats => ({
  sceneCalls: 0,
  postCalls: 0,
  triangles: 0,
  peakSceneCalls: 0,
  peakPostCalls: 0,
  peakTriangles: 0,
  minSceneCalls: Number.POSITIVE_INFINITY,
  peakFrames: 0,
  programs: 0,
  geometries: 0,
  textures: 0,
  frames: 0,
});

export const renderStats: RenderStats = initial();

const pending = { sceneCalls: 0, postCalls: 0, triangles: 0, rendered: false };
let active: RendererLike | null = null;

export function resetPeaks(): void {
  renderStats.peakSceneCalls = 0;
  renderStats.peakPostCalls = 0;
  renderStats.peakTriangles = 0;
  renderStats.minSceneCalls = Number.POSITIVE_INFINITY;
  renderStats.peakFrames = 0;
}

/** Everything back to zero: a remounted canvas (or a test) starts its own count. */
export function resetRenderStats(): void {
  Object.assign(renderStats, initial());
  pending.sceneCalls = 0;
  pending.postCalls = 0;
  pending.triangles = 0;
  pending.rendered = false;
}

/** Wraps `gl.render` so every call adds its draws to the scene or the post total. Returns the uninstall. */
export function instrumentRenderer(gl: RendererLike, isScene: (scene: unknown) => boolean): () => void {
  const original = gl.render;
  // Totals span every pass of a frame; three's autoReset would clear them at each render() call.
  gl.info.autoReset = false;
  active = gl;
  gl.render = (scene, camera) => {
    const calls = gl.info.render.calls;
    const triangles = gl.info.render.triangles;
    original.call(gl, scene, camera);
    const drawn = gl.info.render.calls - calls;
    if (isScene(scene)) pending.sceneCalls += drawn;
    else pending.postCalls += drawn;
    pending.triangles += gl.info.render.triangles - triangles;
    pending.rendered = true;
  };
  return () => {
    gl.render = original;
    if (active === gl) active = null;
  };
}

/** Publishes the frame that just rendered and starts the next one (call first in every frame). */
export function closeFrame(): void {
  const gl = active;
  if (!gl) return;
  const s = renderStats;
  if (pending.rendered) {
    s.sceneCalls = pending.sceneCalls;
    s.postCalls = pending.postCalls;
    s.triangles = pending.triangles;
    s.frames += 1;
    s.peakSceneCalls = Math.max(s.peakSceneCalls, pending.sceneCalls);
    s.peakPostCalls = Math.max(s.peakPostCalls, pending.postCalls);
    s.peakTriangles = Math.max(s.peakTriangles, pending.triangles);
    s.minSceneCalls = Math.min(s.minSceneCalls, pending.sceneCalls);
    s.peakFrames += 1;
  }
  s.programs = gl.info.programs?.length ?? 0;
  s.geometries = gl.info.memory.geometries;
  s.textures = gl.info.memory.textures;
  pending.sceneCalls = 0;
  pending.postCalls = 0;
  pending.triangles = 0;
  pending.rendered = false;
  gl.info.reset();
}
```

- [x] **Step 4: Run the unit test to see it pass**

Run: `bun run test tests/unit/render-stats.test.ts`
Expected: PASS (5 tests).

- [x] **Step 5: Mount the counter and switch the Director to it**

Create `src/experience/perf/RenderCounter.tsx`:

```tsx
"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect } from "react";
import { closeFrame, instrumentRenderer, resetRenderStats, type RendererLike } from "./renderStats";

/**
 * Counts scene draw calls and post-processing passes per frame (renderStats). The negative priority
 * runs it before every other frame callback without taking over rendering (R3F switches to manual
 * rendering only for priorities above 0).
 */
export function RenderCounter() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useLayoutEffect(() => {
    resetRenderStats();
    return instrumentRenderer(gl as unknown as RendererLike, (s) => s === scene);
  }, [gl, scene]);
  useFrame(() => closeFrame(), -100);
  return null;
}
```

In `src/experience/scene/Scene.tsx`, add the import after `import { Director } from "./Director";`:

```ts
import { RenderCounter } from "../perf/RenderCounter";
```

and make it the first child of the returned fragment, replacing:

```tsx
    <>
      <color attach="background" args={[settings.fog.color]} />
```

with:

```tsx
    <>
      <RenderCounter />
      <color attach="background" args={[settings.fog.color]} />
```

In `src/experience/scene/Director.tsx`, add after `import { roverRuntime } from "../rover/runtime";`:

```ts
import { renderStats } from "../perf/renderStats";
```

Delete these lines from the `state` ref:

```ts
    /** Draw calls and triangles of the last whole frame (every render pass). */
    frameCalls: 0,
    frameTriangles: 0,
```

Delete these lines from the top of the `useFrame` callback:

```ts
    // Count every pass of a frame (the full tier's composer renders several): read the last frame's
    // totals, then reset by hand, because `autoReset` would keep only the final pass.
    const info = three.gl.info;
    info.autoReset = false;
    local.frameCalls = info.render.calls;
    local.frameTriangles = info.render.triangles;
    info.reset();
```

and replace, in the 0.1 s store sync block:

```ts
      roverRuntime.drawCalls = local.frameCalls;
      roverRuntime.triangles = local.frameTriangles;
```

with:

```ts
      // Whole-frame totals (scene plus post passes), counted by RenderCounter.
      roverRuntime.drawCalls = renderStats.sceneCalls + renderStats.postCalls;
      roverRuntime.triangles = renderStats.triangles;
```

In `src/experience/rover/runtime.ts`, replace:

```ts
  /** Most recent draw call count (dev probe for the per-floor budget). */
  drawCalls: 0,
  /** Most recent triangle count (dev probe for the per-floor budget). */
  triangles: 0,
```

with:

```ts
  /** Whole-frame draw calls (scene plus post passes), mirrored every 0.1 s; the split is in `__hq.perf.stats`. */
  drawCalls: 0,
  /** Whole-frame triangles, mirrored every 0.1 s. */
  triangles: 0,
```

In `src/experience/Experience.tsx`, add after `import { interactRuntime } from "./interact/runtime";`:

```ts
import { renderStats, resetPeaks } from "./perf/renderStats";
```

and replace:

```ts
  (window as unknown as { __hq?: unknown }).__hq = { store, rover: roverRuntime, camera: () => [...roverRuntime.cameraPosition], layouts, interact: interactRuntime };
```

with:

```ts
  (window as unknown as { __hq?: unknown }).__hq = {
    store,
    rover: roverRuntime,
    camera: () => [...roverRuntime.cameraPosition],
    layouts,
    interact: interactRuntime,
    // Render counters split into scene calls and post passes, with peaks since resetPeaks() (e2e budgets, ?perf=1).
    perf: { stats: renderStats, resetPeaks },
  };
```

- [x] **Step 6: Typecheck and lint**

Run: `bun run typecheck && bun run lint`
Expected: exit 0. If lint reports `three` unused in `Director.tsx`, it is wrong: `three.clock.elapsedTime` still uses it; re-read the edit.

- [x] **Step 7: Put the thresholds in one file**

Create `e2e/budgets.ts`:

```ts
/**
 * CI performance budgets for the 3D experience: the authoritative numbers (appendix 08 section 2).
 * Page View budgets live in lighthouserc.json. Change a number only with an owner note in the PR that
 * needs it. Pure data (no Playwright import): e2e/hq.ts, the perf specs and scripts/perf-report.ts read it.
 */
export interface RenderBudget {
  /** Scene draw calls per frame (post-processing passes excluded). */
  sceneCalls: number;
  /** Post-processing passes per frame (the full tier composer: bloom mips, the effect pass). */
  postCalls: number;
  triangles: number;
  /** A settled floor draws more scene calls than this; fewer means it did not render. */
  minSceneCalls: number;
}

export const RENDER_BUDGET: RenderBudget = { sceneCalls: 150, postCalls: 20, triangles: 30_000, minSceneCalls: 10 };

/** Tighter caps on settled scene calls (inclusive): L1 is the densest floor, RF stays light. */
export const FLOOR_SCENE_CAPS: Readonly<Record<string, number>> = { L1: 125, RF: 79 };

/** A settled budget check watches at least this many frames and this long (every frame counts). */
export const BUDGET_WINDOW = { frames: 20, ms: 1200 } as const;

/** gzip JS the 3D path downloads after the gate, lite and full each. Spec ceiling 600 KB; CI fails at 450 KB. */
export const BYTES_3D_BUDGET = { failAt: 450 * 1024, spec: 600 * 1024, minExpected: 100 * 1024 } as const;

/** Lighthouse CI script budget per Page View page (`resource-summary:script:size` in lighthouserc.json). */
export const PAGE_JS_BUDGET = 245_760;

/** Summaries warn when a number reaches this share of its budget. */
export const WARN_RATIO = 0.9;

/** Shader programs per floor may exceed the committed baseline (e2e/perf/baseline.json) by this many. */
export const PROGRAM_HEADROOM = 2;

/**
 * Memory after round trips (P3's e2e/perf/memory.spec.ts): GPU object deltas after `roundTrips` L1 to RF
 * trips and JS heap growth after a forced GC.
 */
export const GPU_MEMORY_BUDGET = { geometries: 0, textures: 0, programs: 0, heapBytes: 2 * 1024 * 1024, roundTrips: 10 } as const;
```

- [x] **Step 8: Rewrite the budget helpers in `e2e/hq.ts`**

At the top of `e2e/hq.ts`, replace:

```ts
import { expect, type Page } from "@playwright/test";
```

with:

```ts
import { expect, type Page } from "@playwright/test";
import { BUDGET_WINDOW, GPU_MEMORY_BUDGET, RENDER_BUDGET, type RenderBudget } from "./budgets";
```

Replace the `HQSnapshot` interface and the `HQWindow` type:

```ts
export interface HQSnapshot {
  phase: string;
  floor: string;
  tier: string;
  ride: { from: string; to: string; stage: string } | null;
  rover: { x: number; z: number; heading: number; speed: number; face: string };
  firstVisit: boolean;
  drawCalls: number;
  triangles: number;
}

type HQWindow = Window & {
  __hq: {
    store: { getState: () => Omit<HQSnapshot, "drawCalls" | "triangles"> };
    rover: { drawCalls: number; triangles: number };
  };
};
```

with:

```ts
export interface HQSnapshot {
  phase: string;
  floor: string;
  tier: string;
  ride: { from: string; to: string; stage: string } | null;
  rover: { x: number; z: number; heading: number; speed: number; face: string };
  firstVisit: boolean;
  /** Whole-frame draw calls (scene plus post passes) and triangles, mirrored every 0.1 s. */
  drawCalls: number;
  triangles: number;
  /** Last frame's scene draw calls and post-processing passes (`__hq.perf.stats`). */
  sceneCalls: number;
  postCalls: number;
}

/** `window.__hq.perf.stats` (src/experience/perf/renderStats.ts). */
interface PerfStatsProbe {
  sceneCalls: number;
  postCalls: number;
  triangles: number;
  peakSceneCalls: number;
  peakPostCalls: number;
  peakTriangles: number;
  minSceneCalls: number;
  peakFrames: number;
  programs: number;
  geometries: number;
  textures: number;
  frames: number;
}

type HQWindow = Window & {
  __hq: {
    store: { getState: () => Omit<HQSnapshot, "drawCalls" | "triangles" | "sceneCalls" | "postCalls"> };
    rover: { drawCalls: number; triangles: number };
    perf: { stats: PerfStatsProbe; resetPeaks: () => void };
  };
};
```

In `snapshot()`, replace:

```ts
      drawCalls: hq.rover.drawCalls,
      triangles: hq.rover.triangles,
    };
```

with:

```ts
      drawCalls: hq.rover.drawCalls,
      triangles: hq.rover.triangles,
      sceneCalls: hq.perf.stats.sceneCalls,
      postCalls: hq.perf.stats.postCalls,
    };
```

Replace everything from `/**\n * Per-floor render budget (appendix 08 draw calls;` through the end of `expectRenderBudget` (the `RENDER_BUDGET` constant, `BUDGET_SAMPLES` and the function) with:

```ts
/** Worst frames since `resetRenderPeaks` (every rendered frame counts, not samples). */
export interface RenderPeaks {
  sceneCalls: number;
  postCalls: number;
  triangles: number;
  minSceneCalls: number;
  frames: number;
}

export async function resetRenderPeaks(page: Page) {
  await page.evaluate(() => (window as unknown as HQWindow).__hq.perf.resetPeaks());
}

export async function readRenderPeaks(page: Page): Promise<RenderPeaks> {
  return page.evaluate(() => {
    const s = (window as unknown as HQWindow).__hq.perf.stats;
    return { sceneCalls: s.peakSceneCalls, postCalls: s.peakPostCalls, triangles: s.peakTriangles, minSceneCalls: s.minSceneCalls, frames: s.peakFrames };
  });
}

/**
 * Asserts a peak window against the floor budget (appendix 08 section 2): scene calls and triangles
 * under the budget, post passes at most the budget, every count finite (Infinity means a draw with an
 * unbounded instance count, see the troika patch in src/experience/text-config.ts), and at least 3
 * rendered frames (a paused or stalled canvas must not pass on stale numbers).
 */
export function expectPeaksWithinBudget(peaks: RenderPeaks, label: string, budget: RenderBudget = RENDER_BUDGET) {
  const detail = `${label}: ${JSON.stringify(peaks)}`;
  expect(peaks.frames, `${detail} (no frames rendered in the window)`).toBeGreaterThanOrEqual(3);
  expect(Number.isFinite(peaks.sceneCalls) && Number.isFinite(peaks.postCalls) && Number.isFinite(peaks.triangles), detail).toBe(true);
  expect(peaks.sceneCalls, detail).toBeLessThan(budget.sceneCalls);
  expect(peaks.postCalls, detail).toBeLessThanOrEqual(budget.postCalls);
  expect(peaks.triangles, detail).toBeLessThan(budget.triangles);
}

/**
 * Per-floor render budget, called once the scene settled: the worst frame over at least
 * BUDGET_WINDOW.frames frames and BUDGET_WINDOW.ms. Returns the peaks for floor caps and logs.
 */
export async function expectRenderBudget(page: Page): Promise<RenderPeaks> {
  await resetRenderPeaks(page);
  await waitForFrames(page, BUDGET_WINDOW.frames, BUDGET_WINDOW.ms);
  const peaks = await readRenderPeaks(page);
  expectPeaksWithinBudget(peaks, "settled");
  expect(peaks.minSceneCalls, JSON.stringify(peaks)).toBeGreaterThan(RENDER_BUDGET.minSceneCalls);
  return peaks;
}

/** Live GPU objects (`renderer.info`): the memory gate's counters (three.js has no material count). */
export interface GpuCounters {
  geometries: number;
  textures: number;
  programs: number;
}

export async function readGpuCounters(page: Page): Promise<GpuCounters> {
  await waitForFrames(page, 2);
  return page.evaluate(() => {
    const s = (window as unknown as HQWindow).__hq.perf.stats;
    return { geometries: s.geometries, textures: s.textures, programs: s.programs };
  });
}

/** No GPU object growth between two reads (GPU_MEMORY_BUDGET allows 0 by default). */
export function expectNoGpuGrowth(before: GpuCounters, after: GpuCounters, budget: GpuCounters = GPU_MEMORY_BUDGET) {
  const detail = JSON.stringify({ before, after });
  expect(after.geometries - before.geometries, `geometries ${detail}`).toBeLessThanOrEqual(budget.geometries);
  expect(after.textures - before.textures, `textures ${detail}`).toBeLessThanOrEqual(budget.textures);
  expect(after.programs - before.programs, `programs ${detail}`).toBeLessThanOrEqual(budget.programs);
}

/** JS heap in use after a forced garbage collection (Chrome DevTools Protocol), in bytes. */
export async function readJsHeapAfterGc(page: Page): Promise<number> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("HeapProfiler.collectGarbage");
  const { usedSize } = await cdp.send("Runtime.getHeapUsage");
  await cdp.detach();
  return usedSize;
}
```

Replace `waitForFrames`:

```ts
/** Resolves after `count` rendered animation frames (state that updates per frame, not per millisecond). */
export async function waitForFrames(page: Page, count = 10) {
  await page.evaluate(
    (count) =>
      new Promise<void>((resolve) => {
        let seen = 0;
        const tick = () => (++seen >= count ? resolve() : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
      }),
    count,
  );
}
```

with:

```ts
/** Resolves after `count` rendered animation frames and at least `minMs` (state that updates per frame, not per millisecond). */
export async function waitForFrames(page: Page, count = 10, minMs = 0) {
  await page.evaluate(
    ({ count, minMs }) =>
      new Promise<void>((resolve) => {
        const start = performance.now();
        let seen = 0;
        const tick = () => (++seen >= count && performance.now() - start >= minMs ? resolve() : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
      }),
    { count, minMs },
  );
}
```

- [x] **Step 9: Move the floor caps to scene calls**

In `e2e/highlights.spec.ts`, replace:

```ts
/** Headroom under the 150-call floor budget (`RENDER_BUDGET` in e2e/hq.ts): the Lobby is the busiest floor. */
const L1_MAX_DRAW_CALLS = 140;
```

with:

```ts
import { FLOOR_SCENE_CAPS } from "./budgets";
```

(move that import up into the import block). Replace:

```ts
        await expectRenderBudget(page);
        const { drawCalls, triangles } = await snapshot(page);
        console.log(`L1 ${tier} at ${spot ? `(${spot.x}, ${spot.z})` : "spawn"}: ${drawCalls} calls, ${triangles} triangles`);
        expect(drawCalls).toBeLessThanOrEqual(L1_MAX_DRAW_CALLS);
```

with:

```ts
        const peaks = await expectRenderBudget(page);
        console.log(`L1 ${tier} at ${spot ? `(${spot.x}, ${spot.z})` : "spawn"}: ${peaks.sceneCalls} scene calls + ${peaks.postCalls} post passes, ${peaks.triangles} triangles`);
        // Headroom under the 150 scene-call budget: the Lobby is the busiest floor.
        expect(peaks.sceneCalls).toBeLessThanOrEqual(FLOOR_SCENE_CAPS.L1);
```

and replace:

```ts
    await expectRenderBudget(page);
    expect((await snapshot(page)).drawCalls).toBeLessThanOrEqual(L1_MAX_DRAW_CALLS);
```

with:

```ts
    const peaks = await expectRenderBudget(page);
    expect(peaks.sceneCalls).toBeLessThanOrEqual(FLOOR_SCENE_CAPS.L1);
```

In `e2e/roof.spec.ts`, replace:

```ts
/** The whole RF frame on the lite tier. Today's roof measured 113 draw calls (Task 1I Step 4); the cap stays at least 30 below. */
const RF_MAX_DRAW_CALLS = 80;
```

with:

```ts
import { FLOOR_SCENE_CAPS } from "./budgets";
```

(moved into the import block), and replace both occurrences of:

```ts
    await expectRenderBudget(page);
    expect((await snapshot(page)).drawCalls).toBeLessThan(RF_MAX_DRAW_CALLS);
```

with:

```ts
    const peaks = await expectRenderBudget(page);
    // The old roof measured 113 calls; the deck stays at least 30 below that (FLOOR_SCENE_CAPS.RF).
    expect(peaks.sceneCalls).toBeLessThanOrEqual(FLOOR_SCENE_CAPS.RF);
```

`snapshot` stays imported in both files (other tests use it).

- [x] **Step 10: Run the affected e2e specs**

```bash
bun run build
E2E_PORT=4433 bunx playwright test e2e/highlights.spec.ts e2e/roof.spec.ts e2e/library-roof.spec.ts e2e/labs.spec.ts e2e/career.spec.ts -g "budget|headroom" --reporter=list 2>&1 | tee perf-budget.log | grep -E "^L1 |passed|failed"
```

Expected: every selected test passes; the `L1` lines read about `115 scene calls + 0 post passes` on lite and about `116 scene calls + 18 post passes` on full (full total 134 as in "Before you start"; the split is new). If an L1 line is above 125 scene calls, stop: per-frame peaks found a spike the 5 samples missed. Record the spot and the numbers, do not raise `FLOOR_SCENE_CAPS`, and raise it with the owner and P2 in the PR (P2's stats ring batching removes about 25 calls). Delete `perf-budget.log` afterwards.

- [x] **Step 11: Full suite once (shared test infrastructure changed)**

Run: `E2E_PORT=4433 bun run e2e:full`
Expected: the whole suite passes (6 to 10 minutes on an idle machine). Any `expectRenderBudget` failure prints the peaks JSON; treat it as in Step 10.

- [x] **Step 12: Look check (render path touched)**

Run: `E2E_PORT=4433 bun run e2e:look`
Expected: `8 passed` against the main baselines from Task 1 (wrapping `render` changes no pixel). Rollback if not: revert this task's commit.

- [x] **Step 13: Commit**

```bash
rtk git add src/experience/perf/renderStats.ts src/experience/perf/RenderCounter.tsx tests/unit/render-stats.test.ts src/experience/scene/Scene.tsx src/experience/scene/Director.tsx src/experience/rover/runtime.ts src/experience/Experience.tsx e2e/budgets.ts e2e/hq.ts e2e/highlights.spec.ts e2e/roof.spec.ts
rtk git commit -m "feat: split render budget into scene calls and post passes with per-frame peaks"
```

---
### Task 3: Perf report entries and job summaries

One JSON entry per measurement (`perf-report/<id>.json`) and a dependency-free CLI that turns entries and Lighthouse reports into job summary Markdown: per-chunk JS diffs against `main` (Area 3 "per-chunk diff in job summary"), gate tables with deltas, the timeline trend and the program baseline file.

**Files:**
- Create: `scripts/perf-report.ts`
- Create: `scripts/perf-summary.ts`
- Create: `scripts/perf-base.sh`
- Create: `e2e/perf/helpers.ts`
- Create: `e2e/perf/baseline.json`
- Create: `tests/unit/perf-report.test.ts`

**Interfaces:**
- Consumes: `BYTES_3D_BUDGET`, `PAGE_JS_BUDGET`, `RENDER_BUDGET`, `WARN_RATIO` (`e2e/budgets.ts`); `readGpuCounters`, `waitForFrames` (`e2e/hq.ts`).
- Produces:
  - `type ChunkMap = Record<string, number>`, `type Tier = "lite" | "full"`, `GpuCountersEntry`, `PerfEntry` (union of `bytes3d`, `floor`, `peak`, `memory`, `timeline`), `Summary = { markdown: string; warnings: string[] }`, `ProgramBaseline = { programs: Record<Tier, Record<string, number>> }`.
  - `entryId(e)`, `isPerfEntry(v)`, `sum(m)`, `kb(bytes)`, `chunkName(url)`, `isLhr(v)`, `lhrScripts(lhr)`, `pagesFromLhrs(lhrs)`, `renderChunkDiff(title, head, base?, budget?)`, `renderLhci(head, base)`, `renderGates(head, base)`, `median(values)`, `TIMELINE_MARKS`, `renderTimeline(head, base)`, `programBaseline(entries, previous?)`.
  - CLI `bun scripts/perf-summary.ts lhci|gates|timeline|baseline --head <dir> [--base <dir>] [--write <file>]`.
  - `bash scripts/perf-base.sh <artifact> <dir> [workflow] [event]` (env `REPO`, `GH_TOKEN`).
  - `writePerfEntry(entry)`, `waitForStablePrograms(page, timeout?)`, `PERF_REPORT_DIR` in `e2e/perf/helpers.ts`.

- [x] **Step 1: Write the failing tests**

Create `tests/unit/perf-report.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  chunkName,
  entryId,
  isPerfEntry,
  median,
  pagesFromLhrs,
  programBaseline,
  renderChunkDiff,
  renderGates,
  renderLhci,
  renderTimeline,
  type PerfEntry,
} from "../../scripts/perf-report";

const ORIGIN = "http://127.0.0.1:4320";
const lhr = (page: string, items: { url: string; resourceType: string; transferSize: number }[]) => ({
  requestedUrl: `${ORIGIN}${page}`,
  audits: { "network-requests": { details: { items: items.map((i) => ({ ...i, url: `${ORIGIN}${i.url}` })) } } },
});

describe("chunks", () => {
  it("names Next.js chunks by file and other scripts by path", () => {
    expect(chunkName(`${ORIGIN}/_next/static/chunks/0hc43abc.js`)).toBe("0hc43abc.js");
    expect(chunkName("/_next/static/chunks/0hc43abc.js")).toBe("0hc43abc.js");
    expect(chunkName(`${ORIGIN}/sw.js`)).toBe("/sw.js");
  });

  it("reads script transfer sizes per page and keeps the largest of each chunk over runs", () => {
    const a = lhr("/en", [
      { url: "/_next/static/chunks/a.js", resourceType: "Script", transferSize: 1000 },
      { url: "/_next/static/css/x.css", resourceType: "Stylesheet", transferSize: 50 },
    ]);
    const b = lhr("/en", [
      { url: "/_next/static/chunks/a.js", resourceType: "Script", transferSize: 1010 },
      { url: "/_next/static/chunks/b.js", resourceType: "Script", transferSize: 500 },
    ]);
    const c = lhr("/en/quick", [{ url: "/_next/static/chunks/a.js", resourceType: "Script", transferSize: 990 }]);
    expect(pagesFromLhrs([a, b, c])).toEqual({ "/en": { "a.js": 1010, "b.js": 500 }, "/en/quick": { "a.js": 990 } });
  });

  it("diffs chunks against main and reports the budget share", () => {
    const s = renderChunkDiff("/en", { "a.js": 2048, "c.js": 1024 }, { "a.js": 2048, "b.js": 512 }, 4096);
    expect(s.markdown).toContain("Total 3.0 KB, 75% of 4.0 KB, main 2.5 KB, +0.5 KB.");
    expect(s.markdown).toContain("| `b.js` | 0.5 KB | |");
    expect(s.markdown).toContain("| `c.js` | | 1.0 KB |");
    expect(s.warnings).toEqual([]);
    expect(renderChunkDiff("/en", { "a.js": 2048 }, { "a.js": 2048 }).markdown).toContain("Same chunks as main.");
  });

  it("lists the largest chunks without a baseline and warns at 90% of the budget", () => {
    const s = renderChunkDiff("/en", { "a.js": 3800 }, undefined, 4096);
    expect(s.markdown).toContain("no main baseline");
    expect(s.markdown).toContain("| `a.js` | 3.7 KB |");
    expect(s.warnings).toEqual(["/en: 3.7 KB is 93% of the 4.0 KB budget"]);
  });

  it("renders one section per Lighthouse page", () => {
    const s = renderLhci([lhr("/en", [{ url: "/_next/static/chunks/a.js", resourceType: "Script", transferSize: 1024 }])], []);
    expect(s.markdown).toContain("### Page View JavaScript per chunk");
    expect(s.markdown).toContain("#### /en");
    expect(renderLhci([], []).markdown).toContain("No Lighthouse reports found.");
  });
});

describe("gates", () => {
  const head: PerfEntry[] = [
    { kind: "bytes3d", tier: "lite", js: { "x.js": 380 * 1024 }, other: { json: 51_000, font: 139_216 } },
    { kind: "floor", tier: "full", floor: "L1", sceneCalls: 136, postCalls: 18, triangles: 16_103, programs: 52, geometries: 410, textures: 37 },
    { kind: "peak", tier: "lite", scenario: "intro", sceneCalls: 140, postCalls: 0, triangles: 20_000, frames: 75 },
  ];
  const base: PerfEntry[] = [{ kind: "floor", tier: "full", floor: "L1", sceneCalls: 134, postCalls: 18, triangles: 16_103, programs: 52, geometries: 410, textures: 37 }];

  it("renders bytes, floors and peaks with deltas against main and warns near a budget", () => {
    const s = renderGates(head, base);
    expect(s.markdown).toContain("#### 3D JS after the gate (lite)");
    expect(s.markdown).toContain("Total 380.0 KB, 84% of 450.0 KB, no main baseline.");
    expect(s.markdown).toContain("Other 3D-path bytes: font 136.0 KB, json 49.8 KB.");
    expect(s.markdown).toContain("| full | L1 | 136 (+2) | 18 | 16103 | 52 | 410 | 37 |");
    expect(s.markdown).toContain("| lite | intro | 140 | 0 | 20000 | 75 |");
    expect(s.warnings).toEqual(["full L1: 136 scene calls is 91% of the 150 budget", "lite intro: 140 scene calls is 93% of the 150 budget"]);
  });

  it("renders P3's memory entries", () => {
    const s = renderGates([{ kind: "memory", tier: "lite", trips: 10, before: { geometries: 400, textures: 30, programs: 26 }, after: { geometries: 400, textures: 30, programs: 26 }, heapDeltaBytes: 512 * 1024 }], []);
    expect(s.markdown).toContain("| lite | 10 | 0 | 0 | 0 | 0.5 MB |");
  });

  it("says so when there is nothing to report", () => {
    expect(renderGates([], []).markdown).toContain("No perf entries found.");
  });

  it("keeps entry ids stable and recognizes entries", () => {
    expect(head.map(entryId)).toEqual(["bytes3d-lite", "floor-full-L1", "peak-lite-intro"]);
    expect(isPerfEntry(head[0])).toBe(true);
    expect(isPerfEntry({ kind: "nope" })).toBe(false);
    expect(isPerfEntry([])).toBe(false);
  });
});

describe("timeline", () => {
  const t = (run: number, explore: number): PerfEntry => ({
    kind: "timeline",
    profile: "p1",
    scenario: "home",
    run,
    release: "ready",
    marks: { coverFcp: 900, headline: null, bootRelease: 5000, firstFrame: 5000, introStart: 7000, introEnd: 9500, explore, firstDrawer: null },
  });

  it("takes medians and shows the previous nightly run in brackets", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
    const s = renderTimeline([t(1, 9500), t(2, 10500)], [t(1, 12000)]);
    expect(s.markdown).toContain("| p1 | home | ready | 0.90 s (0.90 s) | - | 5.00 s (5.00 s) | 5.00 s (5.00 s) | 7.00 s (7.00 s) | 9.50 s (9.50 s) | 10.00 s (12.00 s) | - |");
    expect(s.warnings).toEqual([]);
  });
});

describe("program baseline", () => {
  it("merges new floor readings into the previous baseline, sorted", () => {
    const floor = (tier: "lite" | "full", f: string, programs: number): PerfEntry => ({ kind: "floor", tier, floor: f, sceneCalls: 100, postCalls: 0, triangles: 1, programs, geometries: 1, textures: 1 });
    const b = programBaseline([floor("lite", "L3", 30), floor("lite", "L1", 26)], { programs: { lite: { L2: 28, L1: 20 }, full: { L1: 52 } } });
    expect(b).toEqual({ programs: { lite: { L1: 26, L2: 28, L3: 30 }, full: { L1: 52 } } });
    expect(Object.keys(b.programs.lite)).toEqual(["L1", "L2", "L3"]);
  });
});
```

- [x] **Step 2: Run them to see them fail**

Run: `bun run test tests/unit/perf-report.test.ts`
Expected: FAIL with `Cannot find module '../../scripts/perf-report'` (or "Failed to resolve import").

- [x] **Step 3: Implement the report module**

Create `scripts/perf-report.ts`:

```ts
/**
 * Pure helpers behind scripts/perf-summary.ts: per-chunk JS diffs (Lighthouse CI and the 3D bytes
 * gate), the perf gate tables, the nightly timeline and the shader program baseline. No Bun, no
 * Playwright and no `@/` imports, so the Lighthouse job runs it without `bun install` and Vitest tests
 * it in node.
 */
import { BYTES_3D_BUDGET, PAGE_JS_BUDGET, RENDER_BUDGET, WARN_RATIO } from "../e2e/budgets";

export type ChunkMap = Record<string, number>;
export type Tier = "lite" | "full";

export interface GpuCountersEntry {
  geometries: number;
  textures: number;
  programs: number;
}

/** One JSON file in perf-report/ (written by `writePerfEntry` in e2e/perf/helpers.ts). */
export type PerfEntry =
  | { kind: "bytes3d"; tier: Tier; js: ChunkMap; other: ChunkMap }
  | { kind: "floor"; tier: Tier; floor: string; sceneCalls: number; postCalls: number; triangles: number; programs: number; geometries: number; textures: number }
  | { kind: "peak"; tier: Tier; scenario: string; sceneCalls: number; postCalls: number; triangles: number; frames: number }
  | { kind: "memory"; tier: Tier; trips: number; before: GpuCountersEntry; after: GpuCountersEntry; heapDeltaBytes: number }
  | { kind: "timeline"; profile: string; scenario: string; run: number; release: string | null; marks: Record<string, number | null> };

type EntryOf<K extends PerfEntry["kind"]> = Extract<PerfEntry, { kind: K }>;

export interface Summary {
  markdown: string;
  warnings: string[];
}

export interface ProgramBaseline {
  programs: Record<Tier, Record<string, number>>;
}

const KINDS = new Set<string>(["bytes3d", "floor", "peak", "memory", "timeline"]);

export function isPerfEntry(value: unknown): value is PerfEntry {
  return typeof value === "object" && value !== null && !Array.isArray(value) && KINDS.has(String((value as { kind?: unknown }).kind));
}

export function entryId(e: PerfEntry): string {
  switch (e.kind) {
    case "bytes3d":
      return `bytes3d-${e.tier}`;
    case "floor":
      return `floor-${e.tier}-${e.floor}`;
    case "peak":
      return `peak-${e.tier}-${e.scenario}`;
    case "memory":
      return `memory-${e.tier}`;
    case "timeline":
      return `timeline-${e.profile}-${e.scenario}-${e.run}`;
  }
}

export const sum = (m: ChunkMap): number => Object.values(m).reduce((a, b) => a + b, 0);
export const kb = (bytes: number): string => `${(bytes / 1024).toFixed(1)} KB`;
const signedKb = (bytes: number): string => (bytes === 0 ? "0.0 KB" : `${bytes > 0 ? "+" : "-"}${kb(Math.abs(bytes))}`);
const signedInt = (n: number): string => (n > 0 ? `+${n}` : `${n}`);
const percent = (part: number, whole: number): number => Math.round((part / whole) * 100);
const withDelta = (now: number, before: number | undefined): string => (before === undefined || before === now ? `${now}` : `${now} (${signedInt(now - before)})`);

/** `/_next/static/...` chunks by file name (content hash), anything else by path. */
export function chunkName(url: string): string {
  const { pathname } = new URL(url, "http://local");
  return pathname.startsWith("/_next/static/") ? pathname.slice(pathname.lastIndexOf("/") + 1) : pathname;
}

export interface LhrLike {
  requestedUrl?: string;
  audits?: Record<string, { details?: { items?: unknown[] } } | undefined>;
}

export function isLhr(value: unknown): value is LhrLike {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const v = value as LhrLike;
  return typeof v.requestedUrl === "string" && Boolean(v.audits?.["network-requests"]);
}

/** Script requests of one Lighthouse run by chunk name (transfer bytes, like `resource-summary:script:size`). */
export function lhrScripts(lhr: LhrLike): ChunkMap {
  const out: ChunkMap = {};
  for (const raw of lhr.audits?.["network-requests"]?.details?.items ?? []) {
    const item = raw as { url?: string; resourceType?: string; transferSize?: number };
    if (item.resourceType !== "Script" || !item.url || !item.transferSize) continue;
    const name = chunkName(item.url);
    out[name] = Math.max(out[name] ?? 0, item.transferSize);
  }
  return out;
}

/** Page path to its scripts over every run of that page (the largest transfer per chunk). */
export function pagesFromLhrs(lhrs: readonly LhrLike[]): Record<string, ChunkMap> {
  const pages: Record<string, ChunkMap> = {};
  for (const lhr of lhrs) {
    if (!lhr.requestedUrl) continue;
    const page = new URL(lhr.requestedUrl).pathname;
    const merged = (pages[page] ??= {});
    for (const [name, bytes] of Object.entries(lhrScripts(lhr))) merged[name] = Math.max(merged[name] ?? 0, bytes);
  }
  return pages;
}

const TOP_CHUNKS = 10;

/** Total, budget share and the chunks added or removed against main (or the largest ones without a baseline). */
export function renderChunkDiff(title: string, head: ChunkMap, base?: ChunkMap, budget?: number): Summary {
  const total = sum(head);
  const parts = [`Total ${kb(total)}`];
  if (budget) parts.push(`${percent(total, budget)}% of ${kb(budget)}`);
  parts.push(base ? `main ${kb(sum(base))}, ${signedKb(total - sum(base))}` : "no main baseline");
  const lines = [`#### ${title}`, "", `${parts.join(", ")}.`, ""];
  if (base) {
    const added = Object.entries(head).filter(([name]) => !(name in base)).sort((a, b) => b[1] - a[1]);
    const removed = Object.entries(base).filter(([name]) => !(name in head)).sort((a, b) => b[1] - a[1]);
    if (added.length === 0 && removed.length === 0) lines.push("Same chunks as main.");
    else {
      lines.push("| Chunk | main | this run |", "|---|---:|---:|");
      for (const [name, bytes] of removed) lines.push(`| \`${name}\` | ${kb(bytes)} | |`);
      for (const [name, bytes] of added) lines.push(`| \`${name}\` | | ${kb(bytes)} |`);
    }
  } else {
    lines.push("| Largest chunks | this run |", "|---|---:|");
    for (const [name, bytes] of Object.entries(head).sort((a, b) => b[1] - a[1]).slice(0, TOP_CHUNKS)) lines.push(`| \`${name}\` | ${kb(bytes)} |`);
  }
  lines.push("", "");
  const warnings = budget && total >= WARN_RATIO * budget ? [`${title}: ${kb(total)} is ${percent(total, budget)}% of the ${kb(budget)} budget`] : [];
  return { markdown: lines.join("\n"), warnings };
}

/** Page View JS per Lighthouse page against the same pages on main. */
export function renderLhci(head: readonly LhrLike[], base: readonly LhrLike[]): Summary {
  const headPages = pagesFromLhrs(head);
  const basePages = pagesFromLhrs(base);
  const out: Summary = {
    markdown: "### Page View JavaScript per chunk\n\nTransfer bytes from Lighthouse CI. Chunk names are content hashes, so a changed chunk shows as one removed and one added row.\n\n",
    warnings: [],
  };
  const pages = Object.keys(headPages).sort();
  for (const page of pages) {
    const s = renderChunkDiff(page, headPages[page], base.length ? basePages[page] : undefined, PAGE_JS_BUDGET);
    out.markdown += s.markdown;
    out.warnings.push(...s.warnings);
  }
  if (pages.length === 0) out.markdown += "No Lighthouse reports found.\n";
  return out;
}

const pick = <K extends PerfEntry["kind"]>(entries: readonly PerfEntry[], kind: K): EntryOf<K>[] =>
  entries.filter((e): e is EntryOf<K> => e.kind === kind).sort((a, b) => entryId(a).localeCompare(entryId(b)));

function warnSceneCalls(warnings: string[], label: string, calls: number) {
  if (calls >= WARN_RATIO * RENDER_BUDGET.sceneCalls) warnings.push(`${label}: ${calls} scene calls is ${percent(calls, RENDER_BUDGET.sceneCalls)}% of the ${RENDER_BUDGET.sceneCalls} budget`);
}

/** The 3D perf gate tables (bytes, settled floors, peaks, memory) against the last main run. */
export function renderGates(head: readonly PerfEntry[], base: readonly PerfEntry[]): Summary {
  const out: Summary = { markdown: "### 3D perf gates\n\n", warnings: [] };
  const before = new Map(base.map((e) => [entryId(e), e]));
  const baseOf = <K extends PerfEntry["kind"]>(e: EntryOf<K>) => before.get(entryId(e)) as EntryOf<K> | undefined;

  for (const e of pick(head, "bytes3d")) {
    const s = renderChunkDiff(`3D JS after the gate (${e.tier})`, e.js, baseOf(e)?.js, BYTES_3D_BUDGET.failAt);
    const other = Object.entries(e.other).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k} ${kb(v)}`).join(", ");
    out.markdown += `${s.markdown}Other 3D-path bytes: ${other || "none"}.\n\n`;
    out.warnings.push(...s.warnings);
  }

  const floors = pick(head, "floor");
  if (floors.length) {
    out.markdown += "#### Settled floors\n\n| Tier | Floor | Scene calls | Post passes | Triangles | Programs | Geometries | Textures |\n|---|---|---:|---:|---:|---:|---:|---:|\n";
    for (const f of floors) {
      const b = baseOf(f);
      out.markdown += `| ${f.tier} | ${f.floor} | ${withDelta(f.sceneCalls, b?.sceneCalls)} | ${withDelta(f.postCalls, b?.postCalls)} | ${withDelta(f.triangles, b?.triangles)} | ${withDelta(f.programs, b?.programs)} | ${withDelta(f.geometries, b?.geometries)} | ${withDelta(f.textures, b?.textures)} |\n`;
      warnSceneCalls(out.warnings, `${f.tier} ${f.floor}`, f.sceneCalls);
    }
    out.markdown += "\n";
  }

  const peaks = pick(head, "peak");
  if (peaks.length) {
    out.markdown += "#### Peaks (every frame of the window)\n\n| Tier | Scenario | Scene calls | Post passes | Triangles | Frames |\n|---|---|---:|---:|---:|---:|\n";
    for (const p of peaks) {
      const b = baseOf(p);
      out.markdown += `| ${p.tier} | ${p.scenario} | ${withDelta(p.sceneCalls, b?.sceneCalls)} | ${withDelta(p.postCalls, b?.postCalls)} | ${withDelta(p.triangles, b?.triangles)} | ${p.frames} |\n`;
      warnSceneCalls(out.warnings, `${p.tier} ${p.scenario}`, p.sceneCalls);
    }
    out.markdown += "\n";
  }

  const memory = pick(head, "memory");
  if (memory.length) {
    out.markdown += "#### Memory after round trips (deltas)\n\n| Tier | Round trips | Geometries | Textures | Programs | JS heap |\n|---|---:|---:|---:|---:|---:|\n";
    for (const m of memory) {
      const d = (k: keyof GpuCountersEntry) => m.after[k] - m.before[k];
      out.markdown += `| ${m.tier} | ${m.trips} | ${d("geometries")} | ${d("textures")} | ${d("programs")} | ${(m.heapDeltaBytes / (1024 * 1024)).toFixed(1)} MB |\n`;
    }
    out.markdown += "\n";
  }

  if (out.markdown === "### 3D perf gates\n\n") out.markdown += "No perf entries found.\n";
  return out;
}

export const TIMELINE_MARKS = ["coverFcp", "headline", "bootRelease", "firstFrame", "introStart", "introEnd", "explore", "firstDrawer"] as const;

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const seconds = (ms: number | null): string => (ms === null ? "-" : `${(ms / 1000).toFixed(2)} s`);

/** Nightly game-first timeline: medians per profile and scenario, the previous run in brackets. Trend only. */
export function renderTimeline(head: readonly PerfEntry[], base: readonly PerfEntry[]): Summary {
  const rows = pick(head, "timeline");
  const previous = pick(base, "timeline");
  const groups = [...new Set(rows.map((r) => `${r.profile}|${r.scenario}`))].sort();
  const header = ["Profile", "Scenario", "Release", ...TIMELINE_MARKS];
  const align = ["---", "---", "---", ...TIMELINE_MARKS.map(() => "---:")];
  let markdown = `### Game-first timeline (trend only)\n\nMedian over runs, seconds from navigation start; the previous nightly run in brackets.\n\n| ${header.join(" | ")} |\n|${align.join("|")}|\n`;
  for (const group of groups) {
    const [profile, scenario] = group.split("|");
    const now = rows.filter((r) => r.profile === profile && r.scenario === scenario);
    const then = previous.filter((r) => r.profile === profile && r.scenario === scenario);
    const med = (list: typeof rows, mark: string) => median(list.map((r) => r.marks[mark]).filter((v): v is number => typeof v === "number"));
    const cell = (mark: string) => {
      const a = med(now, mark);
      const b = med(then, mark);
      return a === null || b === null ? seconds(a) : `${seconds(a)} (${seconds(b)})`;
    };
    const release = [...new Set(now.map((r) => r.release ?? "none"))].join(", ");
    markdown += `| ${profile} | ${scenario} | ${release} | ${TIMELINE_MARKS.map(cell).join(" | ")} |\n`;
  }
  if (groups.length === 0) markdown += "No timeline entries found.\n";
  return { markdown, warnings: [] };
}

/** Floor readings merged into the previous baseline (floors not measured this run keep their value), sorted. */
export function programBaseline(entries: readonly PerfEntry[], previous?: ProgramBaseline): ProgramBaseline {
  const programs: Record<Tier, Record<string, number>> = { lite: { ...(previous?.programs.lite ?? {}) }, full: { ...(previous?.programs.full ?? {}) } };
  for (const f of pick(entries, "floor")) programs[f.tier][f.floor] = f.programs;
  const sorted = (m: Record<string, number>) => Object.fromEntries(Object.entries(m).sort(([a], [b]) => a.localeCompare(b)));
  return { programs: { lite: sorted(programs.lite), full: sorted(programs.full) } };
}
```

- [x] **Step 4: Run the tests to see them pass**

Run: `bun run test tests/unit/perf-report.test.ts`
Expected: PASS (11 tests).

- [x] **Step 5: Write the CLI and the baseline downloader**

Create `scripts/perf-summary.ts`:

```ts
/**
 * Perf summaries for CI job pages. Never fails on numbers: the Playwright gates do that.
 *
 *   bun scripts/perf-summary.ts lhci --head .lighthouseci [--base base-lhci]
 *   bun scripts/perf-summary.ts gates --head perf-report [--base base-perf]
 *   bun scripts/perf-summary.ts timeline --head perf-report [--base base-timeline]
 *   bun scripts/perf-summary.ts baseline --head perf-report --write e2e/perf/baseline.json
 *
 * Appends Markdown to $GITHUB_STEP_SUMMARY when it is set (else prints it) and prints one
 * `::warning::` line per budget at 90% or more. Imports only node: modules and relative files, so it
 * runs without `bun install` (the Lighthouse job has none).
 */
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isLhr, isPerfEntry, programBaseline, renderGates, renderLhci, renderTimeline, type ProgramBaseline, type Summary } from "./perf-report";

/** Every parseable JSON file under `dir` (recursive); a missing dir is empty. */
function jsonFiles(dir: string | undefined): unknown[] {
  if (!dir || !existsSync(dir)) return [];
  const out: unknown[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const file = path.join(d, name);
      if (statSync(file).isDirectory()) walk(file);
      else if (name.endsWith(".json")) {
        try {
          out.push(JSON.parse(readFileSync(file, "utf8")));
        } catch {
          // Not a report file (or truncated): skip it.
        }
      }
    }
  };
  walk(dir);
  return out;
}

function arg(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function emit(summary: Summary) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (file) appendFileSync(file, `${summary.markdown}\n`);
  else console.log(summary.markdown);
  for (const warning of summary.warnings) console.log(`::warning::${warning}`);
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  const head = arg(args, "--head");
  const base = arg(args, "--base");
  const entries = (dir: string | undefined) => jsonFiles(dir).filter(isPerfEntry);
  switch (command) {
    case "lhci":
      emit(renderLhci(jsonFiles(head).filter(isLhr), jsonFiles(base).filter(isLhr)));
      return;
    case "gates":
      emit(renderGates(entries(head), entries(base)));
      return;
    case "timeline":
      emit(renderTimeline(entries(head), entries(base)));
      return;
    case "baseline": {
      const target = arg(args, "--write");
      if (!target) throw new Error("baseline needs --write <file>");
      const previous = existsSync(target) ? (JSON.parse(readFileSync(target, "utf8")) as ProgramBaseline) : undefined;
      writeFileSync(target, `${JSON.stringify(programBaseline(entries(head), previous), null, 2)}\n`);
      console.log(`Wrote ${target}`);
      return;
    }
    default:
      console.error("usage: bun scripts/perf-summary.ts lhci|gates|timeline|baseline --head <dir> [--base <dir>] [--write <file>]");
      process.exit(2);
  }
}

if (import.meta.main) main();
```

Create `scripts/perf-base.sh`:

```bash
#!/usr/bin/env bash
# Downloads artifact $1 of the newest successful run of workflow $3 (default ci.yml) on main into $2,
# optionally only runs of event $4 (for example push or schedule). Used for the "vs main" columns of
# the perf summaries. Never fails: without a baseline the summary just has no main column.
# Needs REPO (owner/name) and GH_TOKEN (actions: read).
set -u
artifact="$1"
dest="$2"
workflow="${3:-ci.yml}"
event="${4:-}"
args=(run list --repo "$REPO" --workflow "$workflow" --branch main --status success --limit 1 --json databaseId --jq '.[0].databaseId // empty')
if [ -n "$event" ]; then args+=(--event "$event"); fi
run_id=$(gh "${args[@]}" 2>/dev/null || true)
if [ -z "$run_id" ]; then
  echo "No successful $workflow run on main: no baseline for $artifact."
  exit 0
fi
if gh run download "$run_id" --repo "$REPO" -n "$artifact" -D "$dest" >/dev/null 2>&1; then
  echo "Baseline: $artifact from run $run_id."
else
  echo "Run $run_id has no $artifact artifact: no baseline."
fi
exit 0
```

```bash
chmod +x scripts/perf-base.sh
```

- [x] **Step 6: Write the e2e helpers and the empty baseline**

Create `e2e/perf/helpers.ts`:

```ts
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { entryId, type PerfEntry } from "../../scripts/perf-report";
import { readGpuCounters, waitForFrames } from "../hq";

/** perf-report/ (gitignored): one JSON file per measurement, read by `bun scripts/perf-summary.ts`. */
export const PERF_REPORT_DIR = process.env.PERF_REPORT_DIR ?? "perf-report";

/** Writes (or overwrites) this measurement's entry; call before asserting, so a failed gate still reports. */
export function writePerfEntry(entry: PerfEntry): void {
  mkdirSync(PERF_REPORT_DIR, { recursive: true });
  writeFileSync(path.join(PERF_REPORT_DIR, `${entryId(entry)}.json`), `${JSON.stringify(entry, null, 2)}\n`);
}

/**
 * Shader programs once they stop changing: neighbour floors mount on idle and compile when first
 * drawn, so wait until two reads 30 frames apart agree.
 */
export async function waitForStablePrograms(page: Page, timeout = 60_000): Promise<number> {
  const deadline = Date.now() + timeout;
  let last = (await readGpuCounters(page)).programs;
  while (Date.now() < deadline) {
    await waitForFrames(page, 30);
    const now = (await readGpuCounters(page)).programs;
    if (now === last) return now;
    last = now;
  }
  throw new Error(`shader programs still changing after ${timeout} ms (last ${last})`);
}
```

Create `e2e/perf/baseline.json`:

```json
{
  "programs": {
    "lite": {},
    "full": {}
  }
}
```

- [x] **Step 7: Try the CLI locally**

```bash
bun scripts/perf-summary.ts gates --head perf-report
bun scripts/perf-summary.ts nope; echo "exit $?"
```

Expected: the first prints `### 3D perf gates` and `No perf entries found.`; the second prints the usage line and `exit 2`.

- [x] **Step 8: Typecheck, lint, commit**

```bash
bun run typecheck && bun run lint && bun run test tests/unit/perf-report.test.ts tests/unit/e2e-plan.test.ts
rtk git add scripts/perf-report.ts scripts/perf-summary.ts scripts/perf-base.sh e2e/perf/helpers.ts e2e/perf/baseline.json tests/unit/perf-report.test.ts
rtk git commit -m "feat: perf report entries and job summaries with per-chunk diffs against main"
```

Expected: all exit 0.

---

### Task 4: 3D bytes gate in CI, the `3D perf gates` job and the per-chunk JS diff

SP6: the JS a visitor downloads after the gate on `?tier=lite` and `?tier=full`, gzip, fails at 450 KB (spec 600 KB). A new 2-shard CI job runs the perf lane; the aggregate job publishes the gate summary against `main`; the Lighthouse job publishes the Page View per-chunk diff.

**Files:**
- Create: `e2e/perf/bytes-3d.spec.ts`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `asReturningVisitor`, `openPage`, `waitForHQ`, `waitForPhase`, `waitForSceneLive` (`e2e/hq.ts`); `BYTES_3D_BUDGET` (`e2e/budgets.ts`); `writePerfEntry` (`e2e/perf/helpers.ts`); `chunkName`, `kb`, `sum`, `ChunkMap` (`scripts/perf-report.ts`); `scripts/perf-summary.ts`, `scripts/perf-base.sh`.
- Produces: perf entries `bytes3d-lite`, `bytes3d-full`; CI job `perf` ("3D perf gates 1/2", "3D perf gates 2/2") with artifacts `perf-report-1`, `perf-report-2`; merged artifact `perf-report` (30 days) from the aggregate job; summaries "3D perf gates" (aggregate job) and "Page View JavaScript per chunk" (Lighthouse job).

- [x] **Step 1: Write the gate**

Create `e2e/perf/bytes-3d.spec.ts`:

```ts
import { expect, test, type Page, type Response } from "@playwright/test";
import { chunkName, kb, sum, type ChunkMap } from "../../scripts/perf-report";
import { BYTES_3D_BUDGET } from "../budgets";
import { asReturningVisitor, openPage, waitForHQ, waitForPhase, waitForSceneLive } from "../hq";
import { writePerfEntry } from "./helpers";

/**
 * 3D bytes gate (SP6, appendix 08 section 2): the JavaScript a visitor downloads after the 3D gate,
 * gzip as served (scripts/serve-static.ts gzips like Cloudflare), on both tiers. Two cold contexts:
 * the Page View (`?tier=static`) and the 3D view until the scene runs and the network is quiet. Every
 * response the Page View did not fetch is 3D-path bytes: scripts are gated, fonts, JSON, CSS and
 * images are reported. Fails at 450 KB (spec ceiling 600 KB).
 */
test.describe.configure({ timeout: 150_000 });

interface Transfer {
  path: string;
  type: string;
  bytes: number;
}

/** Playwright resource types to report keys. */
const KIND: Record<string, string> = { script: "js", stylesheet: "css", font: "font", fetch: "json", xhr: "json", image: "image" };

/** Same-origin responses with their encoded body size, from `load` until no response arrived for `quietMs`. */
async function recordTransfers(page: Page, load: () => Promise<unknown>, quietMs = 3000, timeout = 60_000): Promise<Transfer[]> {
  const pending: Promise<Transfer | null>[] = [];
  let last = Date.now();
  const onResponse = (response: Response) => {
    last = Date.now();
    const url = new URL(response.url());
    if (url.hostname !== "127.0.0.1") return;
    const request = response.request();
    pending.push(
      request.sizes().then(
        (sizes) => ({ path: url.pathname, type: request.resourceType(), bytes: sizes.responseBodySize }),
        () => null,
      ),
    );
  };
  page.on("response", onResponse);
  await load();
  const deadline = Date.now() + timeout;
  // Proving that nothing more arrives is the one place a timed wait belongs (AGENTS.md, writing 3D tests).
  while (Date.now() - last < quietMs) {
    if (Date.now() > deadline) throw new Error(`the network never went quiet for ${quietMs} ms`);
    await page.waitForTimeout(250);
  }
  page.off("response", onResponse);
  return (await Promise.all(pending)).filter((t): t is Transfer => t !== null);
}

for (const tier of ["lite", "full"] as const) {
  test(`3D JS after the gate stays under ${BYTES_3D_BUDGET.failAt / 1024} KB gzip (${tier})`, async ({ browser }) => {
    const pageView = await browser.newContext();
    const pv = await pageView.newPage();
    const pageViewTransfers = await recordTransfers(pv, () => openPage(pv, "/en?tier=static"));
    await pageView.close();

    const context = await browser.newContext();
    const page = await context.newPage();
    await asReturningVisitor(page);
    const transfers = await recordTransfers(page, async () => {
      await page.goto(`/en?tier=${tier}`);
      await waitForHQ(page);
      await waitForPhase(page, "explore");
      await waitForSceneLive(page);
    });
    // null on a build without the counters (a main build in a before/after run).
    const postPasses = await page.evaluate(() => (window as unknown as { __hq: { perf?: { stats: { postCalls: number } } } }).__hq.perf?.stats.postCalls ?? null);
    await context.close();

    const seen = new Set(pageViewTransfers.map((t) => t.path));
    const js: ChunkMap = {};
    const other: ChunkMap = {};
    for (const t of transfers) {
      if (seen.has(t.path)) continue;
      const kind = KIND[t.type] ?? "other";
      if (kind === "js") js[chunkName(t.path)] = (js[chunkName(t.path)] ?? 0) + t.bytes;
      else other[kind] = (other[kind] ?? 0) + t.bytes;
    }
    writePerfEntry({ kind: "bytes3d", tier, js, other });
    const total = sum(js);
    console.log(`3D JS after the gate (${tier}): ${kb(total)} gzip in ${Object.keys(js).length} chunks; other ${JSON.stringify(other)}`);

    if (tier === "full" && postPasses !== null) expect(postPasses, "the full-tier composer never rendered (postprocessing chunk missing)").toBeGreaterThan(0);
    expect(total, "no 3D JavaScript measured: did the gate load the 3D chunk?").toBeGreaterThan(BYTES_3D_BUDGET.minExpected);
    expect(total, `3D JS ${kb(total)} is over the ${kb(BYTES_3D_BUDGET.failAt)} CI budget (spec ceiling ${kb(BYTES_3D_BUDGET.spec)})`).toBeLessThan(BYTES_3D_BUDGET.failAt);
  });
}
```

- [x] **Step 2: Run it against the branch build**

```bash
bun run build
E2E_PORT=4433 bun run e2e:perf e2e/perf/bytes-3d.spec.ts
bun scripts/perf-summary.ts gates --head perf-report
```

Expected: `2 passed`; the log shows about `3D JS after the gate (lite): 36x.x KB gzip` and `(full): 38x.x KB gzip` (production measured 370.6 and 394.3 KB with Cloudflare gzip, REPORT section 2; Bun's default gzip level reads within about 3% of that); the summary prints both chunk tables with "no main baseline" and an "Other 3D-path bytes" line that includes `font` (about 136 KB of troika WOFF) and `json` (rooms data). Record both totals for the PR body.

- [x] **Step 3: Prove the gate fails**

Temporarily change `failAt: 450 * 1024` in `e2e/budgets.ts` to `failAt: 300 * 1024`, then:

```bash
E2E_PORT=4433 bun run e2e:perf e2e/perf/bytes-3d.spec.ts -g lite
```

Expected: FAIL with `3D JS 36x.x KB is over the 300.0 KB CI budget (spec ceiling 600.0 KB)`. Restore `450 * 1024` and confirm `rtk git diff e2e/budgets.ts` is empty.

- [x] **Step 4: Measure main the same way (before/after)**

```bash
E2E_DIR=out-main E2E_PORT=4433 PERF_REPORT_DIR=perf-report-main bun run e2e:perf e2e/perf/bytes-3d.spec.ts
bun scripts/perf-summary.ts gates --head perf-report --base perf-report-main
rm -rf perf-report-main
```

Expected: `2 passed` on main; the branch summary now shows `main ...` and a delta. At this task the delta is about +1 KB (the render counter and `__hq.perf`). Record it.

- [x] **Step 5: Add the CI job, the aggregate summary and the Lighthouse chunk diff**

In `.github/workflows/ci.yml`, replace the header comment:

```yaml
# PR pipeline: build once, run e2e in 4 parallel shards against the same `out/`, then merge the
# reports. "Build, CV and e2e" is the aggregate job: it fails if any job before it failed
# (Lighthouse budgets included), so it stays the single required check. Screenshots run in screenshots.yml (nightly, label, manual).
```

with:

```yaml
# PR pipeline: build once, run e2e in 4 parallel shards and the 3D perf gates (e2e/perf/, 2 shards)
# against the same `out/`, then merge the reports. "Build, CV and e2e" is the aggregate job: it fails if
# any job before it failed (Lighthouse and 3D budgets included), so it stays the single required check,
# and it writes the 3D perf summary against the last green main run. Screenshots run in screenshots.yml
# (nightly, label, manual); the game-first timeline in perf-nightly.yml.
```

After the `e2e` job (before `build:`), add:

```yaml
  perf:
    # Deterministic 3D gates (appendix 08 section 2): 3D bytes after the gate, settled draw calls and
    # shader programs per floor on both tiers, peaks in the intro, rides and hover, memory after round
    # trips. Counters and bytes only; time-based numbers are never gated here.
    name: 3D perf gates ${{ matrix.shard }}/2
    runs-on: ubuntu-latest
    needs: site
    strategy:
      fail-fast: false
      matrix:
        shard: [1, 2]
    steps:
      - uses: actions/checkout@v7
      - uses: ./.github/actions/setup
        with:
          playwright: "true"
      - uses: actions/download-artifact@v8
        with:
          name: site
          path: out
      - name: 3D perf gates (shard ${{ matrix.shard }}/2)
        run: bun run e2e:perf --shard=${{ matrix.shard }}/2
      - uses: actions/upload-artifact@v7
        if: ${{ !cancelled() }}
        with:
          name: perf-report-${{ matrix.shard }}
          path: perf-report/
          retention-days: 3
          if-no-files-found: ignore
      - uses: actions/upload-artifact@v7
        if: failure()
        with:
          name: perf-test-results-${{ matrix.shard }}
          path: test-results/
          retention-days: 7
```

In the `build` job (name `Build, CV and e2e`), replace:

```yaml
    needs: [check, secrets, site, e2e, lighthouse]
    if: ${{ !cancelled() }}
    steps:
```

with:

```yaml
    needs: [check, secrets, site, e2e, lighthouse, perf]
    if: ${{ !cancelled() }}
    permissions:
      contents: read
      # Downloads the last green main run's perf-report for the summary deltas.
      actions: read
    steps:
```

and replace, in the same job:

```yaml
      - name: Require every job
        env:
          RESULTS: ${{ join(needs.*.result, ' ') }}
        run: |
          echo "check, secrets, site, e2e, lighthouse: $RESULTS"
```

with:

```yaml
      - uses: actions/download-artifact@v8
        with:
          pattern: perf-report-*
          path: perf-report
          merge-multiple: true
      - name: Main baseline for the 3D perf summary
        env:
          GH_TOKEN: ${{ github.token }}
          REPO: ${{ github.repository }}
        run: bash scripts/perf-base.sh perf-report base-perf ci.yml push
      - name: 3D perf summary
        run: bun scripts/perf-summary.ts gates --head perf-report --base base-perf
      - uses: actions/upload-artifact@v7
        with:
          # The next run's baseline when this run is on main.
          name: perf-report
          path: perf-report/
          retention-days: 30
          if-no-files-found: ignore
      - name: Require every job
        env:
          RESULTS: ${{ join(needs.*.result, ' ') }}
        run: |
          echo "check, secrets, site, e2e, lighthouse, perf: $RESULTS"
```

In the `lighthouse` job, replace:

```yaml
    name: Lighthouse CI
    runs-on: ubuntu-latest
    needs: site
    steps:
```

with:

```yaml
    name: Lighthouse CI
    runs-on: ubuntu-latest
    needs: site
    permissions:
      contents: read
      # Downloads the last green main run's Lighthouse reports for the per-chunk diff.
      actions: read
    steps:
```

and after the `Run Lighthouse CI` step (before the upload) add:

```yaml
      - name: Main baseline for the JS chunk diff
        if: ${{ !cancelled() }}
        env:
          GH_TOKEN: ${{ github.token }}
          REPO: ${{ github.repository }}
        run: bash scripts/perf-base.sh lighthouse-reports base-lhci ci.yml push
      - name: Page View JS per chunk (job summary)
        if: ${{ !cancelled() }}
        run: bun scripts/perf-summary.ts lhci --head .lighthouseci --base base-lhci
```

- [x] **Step 6: Check the workflow parses and the summary script needs no dependencies**

```bash
bun -e "const y = require('node:fs').readFileSync('.github/workflows/ci.yml', 'utf8'); for (const job of ['perf:', 'lighthouse:', 'build:']) if (!y.includes('  ' + job)) throw new Error(job); console.log('jobs present')"
rtk grep -n "^import" scripts/perf-summary.ts scripts/perf-report.ts e2e/budgets.ts
bun scripts/perf-summary.ts lhci --head .lighthouseci
```

Expected: `jobs present`; the imports are only `node:fs`, `node:path`, `./perf-report` and `../e2e/budgets` (so the Lighthouse job, which has no `bun install`, can run it); the `lhci` command prints `### Page View JavaScript per chunk` and `No Lighthouse reports found.` without a local `.lighthouseci/` (or real tables after a local `bunx @lhci/cli@0.15.1 autorun`). The workflow's YAML is validated for real by the PR's own CI run: if GitHub reports "Invalid workflow file", fix the indentation it names.

- [x] **Step 7: Commit**

```bash
rtk git add e2e/perf/bytes-3d.spec.ts .github/workflows/ci.yml
rtk git commit -m "ci: 3D bytes gate, 3D perf gates job and per-chunk JS diffs in job summaries"
```

---
### Task 5: Settled floors on both tiers and the shader program gate

Every floor on both tiers (today the full tier is checked on L1 only, REPORT Area 12): settled scene calls, post passes and triangles through `expectRenderBudget`, plus shader programs against a committed baseline (F7.2, spec gap 9). The entries also feed the "Settled floors" table.

**Files:**
- Create: `e2e/perf/floors.spec.ts`
- Modify: `e2e/perf/baseline.json` (generated)

**Interfaces:**
- Consumes: `enterFloorRoute`, `expectRenderBudget`, `readGpuCounters`, `waitForCameraSettle` (`e2e/hq.ts`); `FLOOR_SCENE_CAPS`, `PROGRAM_HEADROOM` (`e2e/budgets.ts`); `writePerfEntry`, `waitForStablePrograms` (`e2e/perf/helpers.ts`); `bun scripts/perf-summary.ts baseline`.
- Produces: perf entries `floor-<tier>-<floor>` for 5 floors x 2 tiers; `e2e/perf/baseline.json` with `programs.lite` and `programs.full` per floor.

- [x] **Step 1: Write the spec**

Create `e2e/perf/floors.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { FLOOR_SCENE_CAPS, PROGRAM_HEADROOM } from "../budgets";
import { enterFloorRoute, expectRenderBudget, readGpuCounters, waitForCameraSettle } from "../hq";
import baseline from "./baseline.json";
import { waitForStablePrograms, writePerfEntry } from "./helpers";

/**
 * Settled render budget and shader programs on every floor and both tiers (appendix 08 section 2).
 * Programs must stay within the committed baseline plus PROGRAM_HEADROOM: a material created per
 * frame or per item shows up here long before it shows up as jank. After an intended material change
 * (or a precompile change), regenerate the baseline:
 *
 *   E2E_PORT=4433 bun run e2e:perf e2e/perf/floors.spec.ts
 *   bun scripts/perf-summary.ts baseline --head perf-report --write e2e/perf/baseline.json
 *
 * and say why in the PR.
 */
test.describe.configure({ timeout: 150_000 });

const FLOORS = [
  { floor: "L1", path: "/en" },
  { floor: "L2", path: "/en/journey" },
  { floor: "L3", path: "/en/labs" },
  { floor: "L4", path: "/en/library" },
  { floor: "RF", path: "/en/contact" },
] as const;

const PROGRAMS: Record<string, Record<string, number>> = baseline.programs;

for (const tier of ["lite", "full"] as const) {
  for (const { floor, path } of FLOORS) {
    test(`${floor} ${tier}: settled draw calls and shader programs`, async ({ page }) => {
      await enterFloorRoute(page, path, { tier });
      await waitForCameraSettle(page);
      const programs = await waitForStablePrograms(page);
      const peaks = await expectRenderBudget(page);
      const gpu = await readGpuCounters(page);
      writePerfEntry({ kind: "floor", tier, floor, sceneCalls: peaks.sceneCalls, postCalls: peaks.postCalls, triangles: peaks.triangles, programs, geometries: gpu.geometries, textures: gpu.textures });
      console.log(`${floor} ${tier}: ${peaks.sceneCalls} scene + ${peaks.postCalls} post, ${peaks.triangles} tris, ${programs} programs, ${gpu.geometries} geometries, ${gpu.textures} textures`);

      if (tier === "lite") expect(peaks.postCalls, "lite has no composer").toBe(0);
      else expect(peaks.postCalls, "the full tier composer must render").toBeGreaterThan(0);
      const cap = FLOOR_SCENE_CAPS[floor];
      if (cap !== undefined) expect(peaks.sceneCalls).toBeLessThanOrEqual(cap);

      const base = PROGRAMS[tier]?.[floor];
      expect(base, `no shader program baseline for ${tier} ${floor}: run "bun scripts/perf-summary.ts baseline --head perf-report --write e2e/perf/baseline.json"`).toBeDefined();
      expect(programs, `${programs} programs vs baseline ${base} + ${PROGRAM_HEADROOM}`).toBeLessThanOrEqual(base! + PROGRAM_HEADROOM);
    });
  }
}
```

- [x] **Step 2: Run it to see the baseline assertion fail**

```bash
rm -rf perf-report
E2E_PORT=4433 bun run e2e:perf e2e/perf/floors.spec.ts
```

Expected: `10 failed`, each with `no shader program baseline for <tier> <floor>`, and every budget assertion before it passing (if a budget assertion fails instead, it is a real finding: record the printed peaks and stop for the owner and P2). `perf-report/` now holds ten `floor-*.json` files.

- [x] **Step 3: Generate the baseline and rerun**

```bash
bun scripts/perf-summary.ts baseline --head perf-report --write e2e/perf/baseline.json
cat e2e/perf/baseline.json
E2E_PORT=4433 bun run e2e:perf e2e/perf/floors.spec.ts
bun scripts/perf-summary.ts gates --head perf-report
```

Expected: `baseline.json` lists five floors per tier (L1 is about 26 lite and 52 full per REPORT F5.6); the rerun prints `10 passed`; the summary shows the "Settled floors" table. Copy the console lines into the PR notes.

- [x] **Step 4: Rerun twice more for determinism**

Run: `E2E_PORT=4433 bun run e2e:perf e2e/perf/floors.spec.ts --repeat-each=2 --reporter=list 2>&1 | grep -E " (lite|full): "`
Expected: for each floor and tier the program count is the same in every repeat and scene calls differ by at most 2 between repeats (counters are deterministic, REPORT Area 12). If programs differ between repeats on one floor, `waitForStablePrograms` is not waiting long enough: raise its frame gap from 30 to 60 in `e2e/perf/helpers.ts` and repeat.

- [x] **Step 5: Commit**

```bash
rtk git add e2e/perf/floors.spec.ts e2e/perf/baseline.json
rtk git commit -m "test: settled draw calls on every floor and tier, shader program gate"
```

---

### Task 6: Peak sampling in the intro, the elevator rides and hover

The settled gate misses the moments with the most content on screen: boot plus intro (L1 and L2 exterior, est. 150 to 230 calls), rides (destination and neighbours mount, est. 120 to 170) and hover (outline, name tag, est. +5 to 6) (F5.2, F5.4, SP9). Every frame of each window counts. Scenarios that are over budget on main before P2's fix land as expected failures (ratchet).

**Files:**
- Create: `e2e/perf/peaks.spec.ts`

**Interfaces:**
- Consumes: `asReturningVisitor`, `enterFloorRoute`, `enterHQ`, `expectPeaksWithinBudget`, `hoverTarget`, `readRenderPeaks`, `resetRenderPeaks`, `visibleTarget`, `waitForCameraSettle`, `waitForFloor`, `waitForFrames`, `waitForHQ`, `waitForPhase` (`e2e/hq.ts`); `writePerfEntry` (`e2e/perf/helpers.ts`).
- Produces: perf entries `peak-<tier>-intro`, `peak-<tier>-ride-<from>-<to>`, `peak-<tier>-hover`; the `KNOWN_OVER` ratchet that P2's rebase empties.

- [x] **Step 1: Write the spec**

Create `e2e/perf/peaks.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";
import {
  enterFloorRoute,
  enterHQ,
  expectPeaksWithinBudget,
  hoverTarget,
  readRenderPeaks,
  resetRenderPeaks,
  visibleTarget,
  waitForCameraSettle,
  waitForFloor,
  waitForFrames,
  waitForHQ,
  waitForPhase,
} from "../hq";
import { writePerfEntry } from "./helpers";

/**
 * Peak draw calls outside settled spots (appendix 08 section 2, REPORT F5.4 and SP9): boot plus the
 * intro, every elevator ride, and hovering a target. Every rendered frame of the window counts. Rides
 * use the elevator panel (the wheel zooms the camera since round 5).
 */
test.describe.configure({ timeout: 180_000 });

type Tier = "lite" | "full";

/**
 * Scenarios measured over budget on main before P2's peak fixes (r5-p2: exterior set without L2,
 * hidden floors below the rover). Each id turns its test into an expected failure (`test.fail`), so the
 * gate lands now and becomes a hard pass by itself: once P2 brings a peak under budget, Playwright
 * reports "expected to fail, but passed" and the id must be removed here. Add only ids measured over
 * budget in Task 6 Step 2, with their numbers in the PR.
 */
const KNOWN_OVER = new Set<string>([]);

function ratchet(id: string) {
  test.fail(KNOWN_OVER.has(id), `${id} is over budget until P2 lands; remove it from KNOWN_OVER when this passes`);
}

/** Resets the peaks, runs the window, then checks and records every frame's worst. */
async function measure(page: Page, tier: Tier, scenario: string, window: () => Promise<void>) {
  await resetRenderPeaks(page);
  await window();
  await waitForFrames(page, 5);
  const peaks = await readRenderPeaks(page);
  writePerfEntry({ kind: "peak", tier, scenario, sceneCalls: peaks.sceneCalls, postCalls: peaks.postCalls, triangles: peaks.triangles, frames: peaks.frames });
  console.log(`${tier} ${scenario}: ${peaks.sceneCalls} scene + ${peaks.postCalls} post, ${peaks.triangles} tris over ${peaks.frames} frames`);
  expectPeaksWithinBudget(peaks, `${tier} ${scenario}`);
}

for (const tier of ["lite", "full"] as const) {
  test(`boot and intro stay under the scene budget (${tier})`, async ({ page }) => {
    ratchet(`${tier} intro`);
    // A first session: the boot and the intro play; the tour and hint bubbles stay out of the way.
    await page.addInitScript(() => {
      localStorage.setItem("hq:terminal-seen", "1");
      localStorage.setItem("hq:onboarded", "done");
      localStorage.setItem("hq:hints", "off");
    });
    await page.goto(`/en?tier=${tier}`);
    await waitForHQ(page);
    await measure(page, tier, "intro", async () => {
      const start = page.getByTestId("boot").getByRole("button", { name: "Boot rover" });
      await expect(start).not.toHaveAttribute("aria-disabled", "true", { timeout: 60_000 });
      await start.click();
      await waitForPhase(page, "intro");
      await waitForPhase(page, "explore", 60_000);
    });
  });

  test(`hovering a target stays under the scene budget (${tier})`, async ({ page }) => {
    ratchet(`${tier} hover`);
    await enterHQ(page, { tier });
    await waitForCameraSettle(page);
    const target = await visibleTarget(page, { kinds: ["elevator-pad", "station", "kiosk"], minDistance: 3 });
    await measure(page, tier, "hover", async () => {
      await hoverTarget(page, target.id);
      await waitForFrames(page, 20, 600);
    });
  });
}

const ROUTE: Record<string, string> = { L1: "/en", L2: "/en/journey", L3: "/en/labs", L4: "/en/library", RF: "/en/contact" };

/** Up one, up several, the longest descent and a descent onto L2 (its road mounts on arrival). */
const RIDES: { tier: Tier; from: string; to: string }[] = [
  { tier: "lite", from: "L1", to: "L2" },
  { tier: "lite", from: "L1", to: "L3" },
  { tier: "lite", from: "L1", to: "L4" },
  { tier: "lite", from: "L1", to: "RF" },
  { tier: "lite", from: "RF", to: "L1" },
  { tier: "lite", from: "L3", to: "L2" },
  { tier: "full", from: "L1", to: "L2" },
  { tier: "full", from: "L2", to: "L1" },
];

for (const { tier, from, to } of RIDES) {
  test(`the ride ${from} to ${to} stays under the scene budget (${tier})`, async ({ page }) => {
    const scenario = `ride-${from}-${to}`;
    ratchet(`${tier} ${scenario}`);
    await enterFloorRoute(page, ROUTE[from], { tier });
    await waitForCameraSettle(page);
    await measure(page, tier, scenario, async () => {
      await page.getByRole("navigation", { name: "Elevator" }).locator(`[data-floor="${to}"]`).click();
      await waitForFloor(page, to);
    });
  });
}
```

- [x] **Step 2: Measure on the branch**

```bash
E2E_PORT=4433 bun run e2e:perf e2e/perf/peaks.spec.ts --reporter=list 2>&1 | tee peaks.log | grep -E "(lite|full) (intro|hover|ride)|passed|failed"
```

Expected: 12 tests. Every line `lite intro: N scene + 0 post ...` etc. is printed (entries are written before the assertion). For each test that fails ONLY because `sceneCalls` is not below 150 (the message names the scenario and shows the peaks JSON), add its id to `KNOWN_OVER`, for example:

```ts
const KNOWN_OVER = new Set<string>(["lite intro", "full intro"]);
```

Any other failure (post passes above 20, triangles, non-finite counts, fewer than 3 frames, a timeout) is a bug in this task or a real regression: fix or report it, never add it to `KNOWN_OVER`.

- [x] **Step 3: Rerun with the ratchet**

Run: `E2E_PORT=4433 bun run e2e:perf e2e/perf/peaks.spec.ts`
Expected: every test passes, the `KNOWN_OVER` ones as "expected to fail" (Playwright counts them as passed). Copy the peak lines from `peaks.log` into the PR notes, then `rm peaks.log`.

- [x] **Step 4: Run the whole perf lane in its CI shape**

```bash
E2E_PORT=4433 bun run e2e:perf --shard=1/2 && E2E_PORT=4433 bun run e2e:perf --shard=2/2
bun scripts/perf-summary.ts gates --head perf-report
```

Expected: both shards pass; each shard takes under about 5 minutes on an idle machine with 2 workers (the CI job must not become the critical path: the slowest e2e shard is about 5.3 minutes). If one shard runs over 6 minutes, change the matrix to `shard: [1, 2, 3]` and `--shard=${{ matrix.shard }}/3` in `ci.yml` and say so in the PR.

- [x] **Step 5: Commit**

```bash
rtk git add e2e/perf/peaks.spec.ts
rtk git commit -m "test: peak draw calls in boot and intro, elevator rides and hover"
```

---

### Task 7: Timeline marks and the `?perf=1` overlay

User Timing marks for the game-first timeline and RUM (`hq:boot-release`, `hq:first-frame`, `hq:intro-start`, `hq:intro-end`, `hq:explore`, `hq:first-drawer`), and a local overlay behind `?perf=1`: FPS p50/p10, frame p95, scene and post calls, triangles, GPU objects, tier and renderer, DPR and pixels (REPORT Area 13 option 1, no `r3f-perf` dependency). Zero cost without the flag.

**Files:**
- Create: `src/lib/perf-marks.ts`
- Create: `tests/unit/perf-marks.test.ts`
- Modify: `src/lib/boot-first.ts` (inline `off`, `releaseBootCover`)
- Modify: `tests/unit/boot-first.test.ts`
- Create: `src/experience/perf/usePerfMarks.ts`
- Create: `src/experience/perf/frames.ts`
- Create: `src/experience/perf/lines.ts`
- Create: `tests/unit/perf-frames.test.ts`
- Create: `src/experience/perf/PerfOverlay.tsx`
- Modify: `src/experience/Experience.tsx`
- Create: `e2e/perf-probes.spec.ts`
- Modify: `scripts/e2e-plan.ts`, `tests/unit/e2e-plan.test.ts`

**Interfaces:**
- Consumes: `renderStats` (Task 2), `useHQStore`, `getHQStore`.
- Produces:
  - `PERF_MARKS` (`bootRelease`, `firstFrame`, `introStart`, `introEnd`, `explore`, `firstDrawer`), `PerfMarkName`, `markOnce(name, detail?)`, `markTime(name): number | null` in `src/lib/perf-marks.ts`.
  - `usePerfMarks(): void`.
  - `FrameSampler` (`push(ms)`, `count`, `clear()`, `stats(): FrameStats`), `FrameStats = { count; fpsP50; fpsP10; frameP95 }` in `src/experience/perf/frames.ts`.
  - `perfOverlayOn(search): boolean`, `perfLines(input: PerfLineInput): string[]` in `src/experience/perf/lines.ts`.
  - Lazy chunk `src/experience/perf/PerfOverlay.tsx`: default export `PerfOverlay` (HTML panel, `data-testid="perf-overlay"`), named `PerfProbe` (R3F).
  - Default-suite spec `perf-probes` (`e2e/perf-probes.spec.ts`) and its `e2e-plan` rule.

- [x] **Step 1: Write the failing unit tests**

Create `tests/unit/perf-marks.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { markOnce, markTime, PERF_MARKS } from "@/lib/perf-marks";

afterEach(() => performance.clearMarks());

describe("perf marks", () => {
  it("writes each mark once per page load and reads its time", () => {
    expect(markTime(PERF_MARKS.firstFrame)).toBeNull();
    markOnce(PERF_MARKS.firstFrame);
    const first = markTime(PERF_MARKS.firstFrame);
    expect(first).toBeTypeOf("number");
    markOnce(PERF_MARKS.firstFrame);
    expect(performance.getEntriesByName(PERF_MARKS.firstFrame, "mark")).toHaveLength(1);
    expect(markTime(PERF_MARKS.firstFrame)).toBe(first);
  });

  it("keeps the release reason as the mark detail", () => {
    markOnce(PERF_MARKS.bootRelease, "timeout");
    expect((performance.getEntriesByName(PERF_MARKS.bootRelease, "mark")[0] as PerformanceMark).detail).toBe("timeout");
  });

  it("uses the hq: names the timeline spec reads", () => {
    expect(Object.values(PERF_MARKS)).toEqual(["hq:boot-release", "hq:first-frame", "hq:intro-start", "hq:intro-end", "hq:explore", "hq:first-drawer"]);
  });
});
```

Create `tests/unit/perf-frames.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { FrameSampler } from "@/experience/perf/frames";
import { perfLines, perfOverlayOn } from "@/experience/perf/lines";

describe("FrameSampler", () => {
  it("reports FPS p50, FPS p10 and frame p95 from frame times", () => {
    const s = new FrameSampler(100);
    for (let i = 0; i < 90; i++) s.push(16);
    for (let i = 0; i < 10; i++) s.push(50);
    expect(s.stats()).toEqual({ count: 100, fpsP50: 62.5, fpsP10: 20, frameP95: 50 });
  });

  it("keeps only the newest frames and ignores invalid ones", () => {
    const s = new FrameSampler(4);
    for (const ms of [10, 20, 30, 40, 50, 60, 0, -5, Number.NaN, Number.POSITIVE_INFINITY]) s.push(ms);
    expect(s.count).toBe(4);
    expect(s.stats().frameP95).toBe(60);
    expect(s.stats().fpsP50).toBe(1000 / 50);
    s.clear();
    expect(s.stats()).toEqual({ count: 0, fpsP50: null, fpsP10: null, frameP95: null });
  });
});

describe("perf overlay", () => {
  it("turns on only with ?perf=1", () => {
    expect(perfOverlayOn("?perf=1")).toBe(true);
    expect(perfOverlayOn("?tier=full&perf=1")).toBe(true);
    expect(perfOverlayOn("?perf=10")).toBe(false);
    expect(perfOverlayOn("?perf=0")).toBe(false);
    expect(perfOverlayOn("")).toBe(false);
  });

  it("formats the five overlay lines", () => {
    expect(
      perfLines({
        frames: { count: 240, fpsP50: 58.4, fpsP10: 51.7, frameP95: 21.34 },
        sceneCalls: 116,
        postCalls: 18,
        triangles: 16_103,
        programs: 52,
        geometries: 410,
        textures: 37,
        tier: "full",
        renderer: "ANGLE (Apple, Apple M4, OpenGL 4.1)",
        dpr: 2,
        width: 2880,
        height: 1800,
      }),
    ).toEqual([
      "fps p50 58 | p10 52 | frame p95 21.3 ms",
      "calls 116 scene + 18 post | tris 16.1k",
      "programs 52 | geometries 410 | textures 37",
      "tier full | ANGLE (Apple, Apple M4, OpenGL 4.1)",
      "dpr 2.00 | 2880x1800 (5.2 MP)",
    ]);
  });

  it("shows dashes before any frame was sampled", () => {
    const lines = perfLines({ frames: { count: 0, fpsP50: null, fpsP10: null, frameP95: null }, sceneCalls: 0, postCalls: 0, triangles: 0, programs: 0, geometries: 0, textures: 0, tier: "lite", renderer: "", dpr: 1, width: 0, height: 0 });
    expect(lines[0]).toBe("fps p50 - | p10 - | frame p95 - ms");
    expect(lines[3]).toBe("tier lite | renderer unknown");
  });
});
```

In `tests/unit/boot-first.test.ts`, change the first import line to:

```ts
import { afterEach, describe, expect, it } from "vitest";
```

(keep whatever else it imports from `vitest`) and add inside `describe("bootFirstScript", ...)`:

```ts
  afterEach(() => performance.clearMarks());

  it("marks the boot release with its reason for the timeline", () => {
    const { timers } = runScript({ path: "/en" });
    timers.find((t) => t.ms === 8000)!.fn();
    const mark = performance.getEntriesByName("hq:boot-release", "mark")[0] as PerformanceMark | undefined;
    expect(mark?.detail).toBe("timeout");
  });
```

- [x] **Step 2: Run them to see them fail**

Run: `bun run test tests/unit/perf-marks.test.ts tests/unit/perf-frames.test.ts tests/unit/boot-first.test.ts`
Expected: FAIL: the two new modules do not resolve, and "marks the boot release" finds no mark.

- [x] **Step 3: Implement the marks**

Create `src/lib/perf-marks.ts`:

```ts
/**
 * User Timing marks of the game-first timeline (nightly e2e/perf/timeline.spec.ts) and the RUM beacon
 * (time to explore). The names are a contract with the timeline spec; each mark is written once per
 * page load. Cheap, no imports: the boot-first head script repeats the `hq:boot-release` name inline.
 */
export const PERF_MARKS = {
  /** The boot cover came off; detail: ready, page, static or timeout. */
  bootRelease: "hq:boot-release",
  /** The canvas rendered its first frame. */
  firstFrame: "hq:first-frame",
  /** Boot rover was pressed: the intro starts. */
  introStart: "hq:intro-start",
  /** The intro handed over to explore. */
  introEnd: "hq:intro-end",
  /** First interactive phase (explore, room, palette, ...), with or without an intro. */
  explore: "hq:explore",
  /** The first Glass Drawer opened. */
  firstDrawer: "hq:first-drawer",
} as const;

export type PerfMarkName = (typeof PERF_MARKS)[keyof typeof PERF_MARKS];

export function markOnce(name: PerfMarkName, detail?: string): void {
  if (typeof performance === "undefined" || typeof performance.mark !== "function") return;
  try {
    if (performance.getEntriesByName(name, "mark").length > 0) return;
    performance.mark(name, detail === undefined ? undefined : { detail });
  } catch {
    // Marks are diagnostics: they never break the page.
  }
}

/** Milliseconds since navigation start, or null before the mark was written. */
export function markTime(name: PerfMarkName): number | null {
  if (typeof performance === "undefined" || typeof performance.getEntriesByName !== "function") return null;
  return performance.getEntriesByName(name, "mark")[0]?.startTime ?? null;
}
```

In `src/lib/boot-first.ts`, add after `import { SOFTWARE_RENDERER } from "./gpu-tier";`:

```ts
import { markOnce, PERF_MARKS } from "./perf-marks";
```

In `bootFirstScript()`, replace:

```ts
var off=function(r){if(d.hasAttribute("${BOOT_ATTR}")){d.removeAttribute("${BOOT_ATTR}");d.setAttribute("${BOOT_RELEASED_ATTR}",r)}};
```

with:

```ts
var off=function(r){if(d.hasAttribute("${BOOT_ATTR}")){d.removeAttribute("${BOOT_ATTR}");d.setAttribute("${BOOT_RELEASED_ATTR}",r);try{performance.mark("${PERF_MARKS.bootRelease}",{detail:r})}catch(e){}}};
```

and replace `releaseBootCover`:

```ts
export function releaseBootCover(reason: BootReleaseReason): void {
  const d = document.documentElement;
  if (!d.hasAttribute(BOOT_ATTR)) return;
  d.removeAttribute(BOOT_ATTR);
  d.setAttribute(BOOT_RELEASED_ATTR, reason);
}
```

with:

```ts
export function releaseBootCover(reason: BootReleaseReason): void {
  const d = document.documentElement;
  if (!d.hasAttribute(BOOT_ATTR)) return;
  d.removeAttribute(BOOT_ATTR);
  d.setAttribute(BOOT_RELEASED_ATTR, reason);
  markOnce(PERF_MARKS.bootRelease, reason);
}
```

- [x] **Step 4: Implement the sampler, the overlay lines and the store marks**

Create `src/experience/perf/frames.ts`:

```ts
/** Frame time statistics: FPS at the median and at the 10th percentile (from the 90th percentile frame time), frame p95 in ms. */
export interface FrameStats {
  count: number;
  fpsP50: number | null;
  fpsP10: number | null;
  frameP95: number | null;
}

/**
 * Ring buffer of the newest frame times (ms), for the `?perf=1` overlay and the RUM probe (P2's runtime
 * monitor may share it). Pure, no allocation per push.
 */
export class FrameSampler {
  private readonly samples: Float64Array;
  private next = 0;
  private filled = 0;

  constructor(readonly capacity: number) {
    this.samples = new Float64Array(capacity);
  }

  push(ms: number): void {
    if (!Number.isFinite(ms) || ms <= 0) return;
    this.samples[this.next] = ms;
    this.next = (this.next + 1) % this.capacity;
    this.filled = Math.min(this.filled + 1, this.capacity);
  }

  get count(): number {
    return this.filled;
  }

  clear(): void {
    this.next = 0;
    this.filled = 0;
  }

  stats(): FrameStats {
    if (this.filled === 0) return { count: 0, fpsP50: null, fpsP10: null, frameP95: null };
    const sorted = Array.from(this.samples.subarray(0, this.filled)).sort((a, b) => a - b);
    const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
    return { count: this.filled, fpsP50: 1000 / at(0.5), fpsP10: 1000 / at(0.9), frameP95: at(0.95) };
  }
}
```

Create `src/experience/perf/lines.ts`:

```ts
import type { FrameStats } from "./frames";

/** `?perf=1` turns the local performance overlay on; without it nothing of the overlay loads or runs. */
export const perfOverlayOn = (search: string): boolean => /[?&]perf=1(&|$)/.test(search);

export interface PerfLineInput {
  frames: FrameStats;
  sceneCalls: number;
  postCalls: number;
  triangles: number;
  programs: number;
  geometries: number;
  textures: number;
  tier: string;
  /** Unmasked WebGL renderer from the gate probe (shown locally only, never sent anywhere). */
  renderer: string;
  dpr: number;
  /** Drawing buffer size in device pixels. */
  width: number;
  height: number;
}

const num = (value: number | null, digits = 0): string => (value === null ? "-" : value.toFixed(digits));

export function perfLines(i: PerfLineInput): string[] {
  return [
    `fps p50 ${num(i.frames.fpsP50)} | p10 ${num(i.frames.fpsP10)} | frame p95 ${num(i.frames.frameP95, 1)} ms`,
    `calls ${i.sceneCalls} scene + ${i.postCalls} post | tris ${(i.triangles / 1000).toFixed(1)}k`,
    `programs ${i.programs} | geometries ${i.geometries} | textures ${i.textures}`,
    `tier ${i.tier} | ${i.renderer || "renderer unknown"}`,
    `dpr ${i.dpr.toFixed(2)} | ${i.width}x${i.height} (${((i.width * i.height) / 1e6).toFixed(1)} MP)`,
  ];
}
```

Create `src/experience/perf/usePerfMarks.ts`:

```ts
import { useEffect } from "react";
import { markOnce, PERF_MARKS } from "@/lib/perf-marks";
import { getHQStore, type Phase } from "@/store/useHQStore";

const interactive = (phase: Phase) => phase !== "boot" && phase !== "intro" && phase !== "static";

/** Writes the timeline marks from store transitions (each once per page load). */
export function usePerfMarks(): void {
  useEffect(() => {
    const store = getHQStore();
    if (interactive(store.getState().phase)) markOnce(PERF_MARKS.explore);
    return store.subscribe((s, prev) => {
      if (prev.phase === "boot" && s.phase === "intro") markOnce(PERF_MARKS.introStart);
      if (prev.phase === "intro" && s.phase === "explore") markOnce(PERF_MARKS.introEnd);
      if (interactive(s.phase) && !interactive(prev.phase)) markOnce(PERF_MARKS.explore);
      if (s.activeRoom && !prev.activeRoom) markOnce(PERF_MARKS.firstDrawer);
    });
  }, []);
}
```

Confirm `Phase` is exported from `src/store/useHQStore.ts` (`export type Phase = ...`, it is at main @ f61fbba).

- [x] **Step 5: Run the unit tests to see them pass**

Run: `bun run test tests/unit/perf-marks.test.ts tests/unit/perf-frames.test.ts tests/unit/boot-first.test.ts`
Expected: PASS (all tests, including the existing boot-first ones and "has no em dashes or closing script tags").

- [x] **Step 6: Write the overlay chunk**

Create `src/experience/perf/PerfOverlay.tsx`:

```tsx
"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useState } from "react";
import { useHQStore } from "@/store/useHQStore";
import { FrameSampler } from "./frames";
import { perfLines } from "./lines";
import { renderStats } from "./renderStats";

/** Shared by the probe (inside the canvas) and the panel (HTML): the newest 240 frame times and the buffer size. */
const live = { sampler: new FrameSampler(240), dpr: 1, width: 0, height: 0 };

/** Inside the Canvas (`?perf=1` only): one frame time per frame, the pixel ratio and the drawing buffer size. */
export function PerfProbe() {
  const gl = useThree((s) => s.gl);
  useFrame((_, dt) => {
    live.sampler.push(dt * 1000);
    live.dpr = gl.getPixelRatio();
    live.width = gl.domElement.width;
    live.height = gl.domElement.height;
  });
  return null;
}

/**
 * `?perf=1` panel for real-device checks (appendix 08 section 2, frame rate row): FPS p50/p10, frame
 * p95, scene and post calls, GPU objects, tier and renderer, DPR and pixels, 4 updates a second.
 * Decorative for assistive tech; never shown without the flag.
 */
export default function PerfOverlay() {
  const tier = useHQStore((s) => s.tier);
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 250);
    return () => window.clearInterval(id);
  }, []);
  const renderer = (window as { __hqProbe?: { renderer?: string } }).__hqProbe?.renderer ?? "";
  const lines = perfLines({
    frames: live.sampler.stats(),
    sceneCalls: renderStats.sceneCalls,
    postCalls: renderStats.postCalls,
    triangles: renderStats.triangles,
    programs: renderStats.programs,
    geometries: renderStats.geometries,
    textures: renderStats.textures,
    tier,
    renderer,
    dpr: live.dpr,
    width: live.width,
    height: live.height,
  });
  return (
    <div data-testid="perf-overlay" aria-hidden="true" className="pointer-events-none fixed bottom-2 left-2 z-[60] rounded bg-void/85 px-2 py-1 font-mono text-[11px] leading-4 text-ink">
      {lines.map((line, i) => (
        <p key={i} data-perf-line={i}>
          {line}
        </p>
      ))}
    </div>
  );
}
```

- [x] **Step 7: Wire marks and the overlay into `Experience`**

In `src/experience/Experience.tsx`:

Replace:

```ts
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
```

with:

```ts
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
```

Add after `import { audio } from "@/lib/audio";`:

```ts
import { markOnce, PERF_MARKS } from "@/lib/perf-marks";
```

Add after `import { renderStats, resetPeaks } from "./perf/renderStats";`:

```ts
import { perfOverlayOn } from "./perf/lines";
import { usePerfMarks } from "./perf/usePerfMarks";
```

Replace:

```ts
const COARSE_QUERY = "(pointer: coarse)";
```

with:

```ts
const COARSE_QUERY = "(pointer: coarse)";

// `?perf=1` only: without the flag nothing of the overlay is downloaded or run.
const PerfOverlay = lazy(() => import("./perf/PerfOverlay"));
const PerfProbe = lazy(() => import("./perf/PerfOverlay").then((m) => ({ default: m.PerfProbe })));
```

Replace `FirstFrame`:

```tsx
function FirstFrame({ onFrame }: { onFrame?: () => void }) {
  const ticks = useRef(0);
  useFrame(() => {
    if (!onFrame || ticks.current > 1) return;
    ticks.current += 1;
    if (ticks.current === 2) onFrame();
  });
  return null;
}
```

with:

```tsx
function FirstFrame({ onFrame }: { onFrame?: () => void }) {
  const ticks = useRef(0);
  useFrame(() => {
    if (ticks.current > 1) return;
    ticks.current += 1;
    if (ticks.current !== 2) return;
    markOnce(PERF_MARKS.firstFrame);
    onFrame?.();
  });
  return null;
}
```

Replace:

```ts
  const coarse = useHQStore((s) => s.device.coarse);
  const budget = renderBudget(tier, coarse);
```

with:

```ts
  const coarse = useHQStore((s) => s.device.coarse);
  const budget = renderBudget(tier, coarse);
  usePerfMarks();
  const [perf] = useState(() => perfOverlayOn(window.location.search));
```

Replace:

```tsx
          <Scene data={data} tier={tier} labels={labels} held={held} onToggleLang={toggleLang} />
          <FirstFrame onFrame={onFirstFrame} />
        </Canvas>
```

with:

```tsx
          <Scene data={data} tier={tier} labels={labels} held={held} onToggleLang={toggleLang} />
          <FirstFrame onFrame={onFirstFrame} />
          {perf && (
            <Suspense fallback={null}>
              <PerfProbe />
            </Suspense>
          )}
        </Canvas>
```

Replace:

```tsx
      <Hud data={data} onExit={onExit} onToggleLang={toggleLang} />
    </div>
```

with:

```tsx
      <Hud data={data} onExit={onExit} onToggleLang={toggleLang} />
      {perf && (
        <Suspense fallback={null}>
          <PerfOverlay />
        </Suspense>
      )}
    </div>
```

- [x] **Step 8: Map the new paths and add the spec to the plan**

In `scripts/e2e-plan.ts`, add `"perf-probes",` to `ALL_SPECS` between `"pageview",` and `"roof",`, and add these rules before `{ test: /^src\/experience\/(ExperienceGate\.tsx|gate-tier\.ts|introContinue\.ts)$|...`:

```ts
  // Measurement in the 3D view: render counters, the ?perf=1 overlay, timeline marks, the RUM probe.
  { test: /^src\/experience\/perf\/|^src\/lib\/(perf-marks\.ts|rum\/)/, specs: ["perf-probes", "experience"] },
```

In `tests/unit/e2e-plan.test.ts`, add:

```ts
  it("maps measurement code to the perf probes spec and the 3D experience", () => {
    expect(specsForChanges(["src/experience/perf/PerfOverlay.tsx"]).specs).toEqual(["experience", "perf-probes"]);
    expect(specsForChanges(["src/lib/perf-marks.ts"]).specs).toEqual(["experience", "perf-probes"]);
    expect(specsForChanges(["e2e/perf-probes.spec.ts"]).specs).toEqual(["perf-probes"]);
  });
```

- [x] **Step 9: Write the e2e spec (overlay and marks)**

Create `e2e/perf-probes.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { PERF_MARKS } from "../src/lib/perf-marks";
import { asReturningVisitor, enterHQ, waitForFrames, waitForHQ, waitForPhase, waitForSceneLive } from "./hq";

/**
 * Measurement probes in the default suite (round 5 P4): the `?perf=1` overlay is there with the flag
 * and absent without it, and the timeline marks are written. The gates themselves run in the perf lane
 * (e2e/perf/, `bun run e2e:perf`).
 */
test.describe.configure({ timeout: 120_000 });

test("?perf=1 shows live numbers; without it nothing of the overlay mounts", async ({ page }) => {
  await asReturningVisitor(page);
  await page.goto("/en?tier=lite&perf=1");
  await waitForHQ(page);
  await waitForPhase(page, "explore");
  await waitForSceneLive(page);
  const overlay = page.getByTestId("perf-overlay");
  await expect(overlay).toBeVisible();
  await expect(overlay.locator("[data-perf-line='0']")).toHaveText(/^fps p50 \d+ \| p10 \d+ \| frame p95 [\d.]+ ms$/, { timeout: 30_000 });
  await expect(overlay.locator("[data-perf-line='1']")).toHaveText(/^calls \d+ scene \+ 0 post \| tris [\d.]+k$/);
  await expect(overlay.locator("[data-perf-line='3']")).toHaveText(/^tier lite \| /);

  await page.goto("/en?tier=lite");
  await waitForHQ(page);
  await waitForSceneLive(page);
  await waitForFrames(page, 30);
  await expect(page.getByTestId("perf-overlay")).toHaveCount(0);
});

test("the 3D view writes the timeline marks", async ({ page }) => {
  await enterHQ(page);
  const marks = await page.evaluate((names) => names.map((n) => performance.getEntriesByName(n, "mark").length), [PERF_MARKS.firstFrame, PERF_MARKS.explore, PERF_MARKS.bootRelease]);
  expect(marks).toEqual([1, 1, 1]);
  const release = await page.evaluate((n) => (performance.getEntriesByName(n, "mark")[0] as PerformanceMark).detail, PERF_MARKS.bootRelease);
  expect(release).toBe("ready");
});
```

- [x] **Step 10: Verify**

```bash
bun run typecheck && bun run lint && bun run test tests/unit
bun run build
E2E_PORT=4433 bunx playwright test e2e/perf-probes.spec.ts e2e/boot-first.spec.ts
E2E_PORT=4433 bun run e2e:look
E2E_PORT=4433 bun run e2e:perf e2e/perf/bytes-3d.spec.ts
```

Expected: everything passes; the look check prints `8 passed` (marks and a hidden overlay change no pixel); the 3D bytes stay within about +1.5 KB of Task 4 (the overlay is a separate chunk that the gate never loads: `bun scripts/perf-summary.ts gates --head perf-report` lists no new chunk above 1 KB).

- [x] **Step 11: Commit**

```bash
rtk git add src/lib/perf-marks.ts tests/unit/perf-marks.test.ts src/lib/boot-first.ts tests/unit/boot-first.test.ts src/experience/perf/usePerfMarks.ts src/experience/perf/frames.ts src/experience/perf/lines.ts tests/unit/perf-frames.test.ts src/experience/perf/PerfOverlay.tsx src/experience/Experience.tsx e2e/perf-probes.spec.ts scripts/e2e-plan.ts tests/unit/e2e-plan.test.ts
rtk git commit -m "feat: timeline marks and a ?perf=1 overlay (zero cost without the flag)"
```

---
### Task 8: RUM client: protocol, sampling and the beacon probe

The field half of SP12: one coarse data point per sampled 3D session. The wire contract lives in one module shared with the Function (like `src/ask/protocol.ts`). The decision code is tiny and sits in the 3D chunk; the probe, the protocol and the sampler load only in sampled sessions.

**Files:**
- Create: `src/lib/rum/protocol.ts`
- Create: `tests/unit/rum-protocol.test.ts`
- Create: `src/experience/perf/rumDecision.ts`
- Create: `src/experience/perf/rum.ts`
- Create: `src/experience/perf/RumProbe.tsx`
- Create: `tests/unit/rum-client.test.ts`
- Modify: `src/experience/Experience.tsx`
- Modify: `e2e/perf-probes.spec.ts`

**Interfaces:**
- Consumes: `FrameSampler` (Task 7), `markTime`, `PERF_MARKS` (Task 7), `BOOT_RELEASED_ATTR`, `bootCoverUsed` (`src/lib/boot-first.ts`).
- Produces:
  - `src/lib/rum/protocol.ts`: `RUM_VERSION` (`1`), `RUM_MAX_BYTES` (512), `RUM_TIERS`, `RUM_PATHS` (`cover`, `enter`, `deeplink`), `RUM_FPS` (`na`, `lt15`, `15-24`, `25-29`, `30-44`, `45-54`, `55+`), `RUM_TIMES` (`na`, `lt3s`, `3-5s`, `5-8s`, `8-12s`, `12-20s`, `20s+`), types `RumTier`, `RumPath`, `RumFps`, `RumTime`, `RumPayload = { v; tier; path; fps50; fps10; explore; lost; timeout }`, `parseRumPayload(value): RumPayload | null`, `fpsBucket(fps)`, `timeBucket(ms)`, `rumDataPoint(p): { blobs: string[]; doubles: number[]; indexes: string[] }`.
  - `src/experience/perf/rumDecision.ts`: `RUM_RATE` (0.25), `RUM_SESSION_KEY` (`"hq:rum"`), `rumDecision(input): "on" | "off" | "sent"`, `rumPath({ startFloor?, startRoom?, coverUsed }): RumPath`, `decideRum(): boolean`.
  - `src/experience/perf/rum.ts`: `RUM_ENDPOINT` (`"/api/rum"`), `RUM_WARMUP_MS` (2000), `RUM_WINDOW_FRAMES` (600), `RUM_MIN_FRAMES` (60), `class RumSession` (`frame(dtMs, now, exploreAt, visible)`, `contextLost()`, `sampled`, `payload({ released, exploreAt })`).
  - Lazy default export `RumProbe({ tier, path })`.

- [x] **Step 1: Write the failing protocol tests**

Create `tests/unit/rum-protocol.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fpsBucket, parseRumPayload, rumDataPoint, RUM_MAX_BYTES, timeBucket, type RumPayload } from "@/lib/rum/protocol";

const valid: RumPayload = { v: 1, tier: "lite", path: "cover", fps50: "55+", fps10: "30-44", explore: "5-8s", lost: 0, timeout: 0 };

describe("RUM protocol", () => {
  it("accepts exactly the allowlisted object", () => {
    expect(parseRumPayload(valid)).toEqual(valid);
    expect(parseRumPayload(JSON.parse(JSON.stringify(valid)))).toEqual(valid);
  });

  it("rejects extra, missing or out-of-list fields", () => {
    expect(parseRumPayload({ ...valid, ua: "Mozilla/5.0" })).toBeNull();
    const missing = Object.fromEntries(Object.entries(valid).filter(([key]) => key !== "explore"));
    expect(parseRumPayload(missing)).toBeNull();
    expect(parseRumPayload({ ...valid, v: 2 })).toBeNull();
    expect(parseRumPayload({ ...valid, tier: "static" })).toBeNull();
    expect(parseRumPayload({ ...valid, path: "/en/labs/x" })).toBeNull();
    expect(parseRumPayload({ ...valid, fps50: 58 })).toBeNull();
    expect(parseRumPayload({ ...valid, explore: "4s" })).toBeNull();
    expect(parseRumPayload({ ...valid, lost: true })).toBeNull();
    expect(parseRumPayload({ ...valid, timeout: 2 })).toBeNull();
    expect(parseRumPayload(null)).toBeNull();
    expect(parseRumPayload([valid])).toBeNull();
    expect(parseRumPayload("x")).toBeNull();
  });

  it("buckets FPS and times at their edges", () => {
    expect([null, 0, 14.9, 15, 24.9, 25, 29.9, 30, 44.9, 45, 54.9, 55, 120].map(fpsBucket)).toEqual(["na", "na", "lt15", "15-24", "15-24", "25-29", "25-29", "30-44", "30-44", "45-54", "45-54", "55+", "55+"]);
    expect([null, -1, 2999, 3000, 4999, 5000, 7999, 8000, 11_999, 12_000, 19_999, 20_000].map(timeBucket)).toEqual(["na", "na", "lt3s", "3-5s", "3-5s", "5-8s", "5-8s", "8-12s", "8-12s", "12-20s", "12-20s", "20s+"]);
  });

  it("maps a payload to one Analytics Engine point with fixed positions", () => {
    expect(rumDataPoint({ ...valid, lost: 1 })).toEqual({ blobs: ["1", "lite", "cover", "55+", "30-44", "5-8s"], doubles: [1, 0, 1], indexes: ["lite"] });
  });

  it("fits the largest payload far under the size limit", () => {
    const largest: RumPayload = { v: 1, tier: "full", path: "deeplink", fps50: "45-54", fps10: "45-54", explore: "12-20s", lost: 1, timeout: 1 };
    expect(JSON.stringify(largest).length).toBeLessThan(RUM_MAX_BYTES / 2);
  });
});
```

Create `tests/unit/rum-client.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { RUM_MIN_FRAMES, RUM_WARMUP_MS, RUM_WINDOW_FRAMES, RumSession } from "@/experience/perf/rum";
import { rumDecision, rumPath, type RumDecisionInput } from "@/experience/perf/rumDecision";

const base: RumDecisionInput = { stored: null, search: "", webdriver: false, privacySignal: false, random: 0.1 };

describe("RUM sampling", () => {
  it("samples a quarter of new sessions", () => {
    expect(rumDecision({ ...base, random: 0.24 })).toBe("on");
    expect(rumDecision({ ...base, random: 0.25 })).toBe("off");
  });

  it("keeps the session's decision and sends at most once per session", () => {
    expect(rumDecision({ ...base, stored: "off", random: 0 })).toBe("off");
    expect(rumDecision({ ...base, stored: "on", random: 0.9 })).toBe("on");
    expect(rumDecision({ ...base, stored: "sent", search: "?rum=1" })).toBe("sent");
  });

  it("never samples automation or visitors with Do Not Track or Global Privacy Control, unless forced", () => {
    expect(rumDecision({ ...base, webdriver: true })).toBe("off");
    expect(rumDecision({ ...base, privacySignal: true })).toBe("off");
    expect(rumDecision({ ...base, webdriver: true, search: "?tier=lite&rum=1" })).toBe("on");
    expect(rumDecision({ ...base, search: "?rum=0" })).toBe("off");
    expect(rumDecision({ ...base, search: "?rum=10" })).toBe("on");
  });

  it("names the load path coarsely", () => {
    expect(rumPath({ coverUsed: true })).toBe("cover");
    expect(rumPath({ coverUsed: false })).toBe("enter");
    expect(rumPath({ startFloor: "L3", coverUsed: true })).toBe("deeplink");
    expect(rumPath({ startRoom: "L2:jenius-2024", coverUsed: false })).toBe("deeplink");
  });
});

describe("RUM session", () => {
  const explore = 4200;

  it("counts frames only after the warm-up, while visible, up to the window", () => {
    const s = new RumSession({ tier: "full", path: "cover" });
    s.frame(16, explore + RUM_WARMUP_MS - 1, explore, true);
    s.frame(16, explore + RUM_WARMUP_MS + 10, null, true);
    s.frame(16, explore + RUM_WARMUP_MS + 10, explore, false);
    expect(s.sampled).toBe(0);
    for (let i = 0; i < RUM_WINDOW_FRAMES + 50; i++) s.frame(16, explore + RUM_WARMUP_MS + i * 16, explore, true);
    expect(s.sampled).toBe(RUM_WINDOW_FRAMES);
  });

  it("reports FPS buckets, the explore bucket, context loss and the boot timeout", () => {
    const s = new RumSession({ tier: "lite", path: "deeplink" });
    for (let i = 0; i < 90; i++) s.frame(16, explore + RUM_WARMUP_MS + i, explore, true);
    for (let i = 0; i < 10; i++) s.frame(50, explore + RUM_WARMUP_MS + 100 + i, explore, true);
    s.contextLost();
    expect(s.payload({ released: "timeout", exploreAt: explore })).toEqual({ v: 1, tier: "lite", path: "deeplink", fps50: "55+", fps10: "15-24", explore: "3-5s", lost: 1, timeout: 1 });
  });

  it("says na when too few frames were seen or explore never came", () => {
    const s = new RumSession({ tier: "full", path: "enter" });
    for (let i = 0; i < RUM_MIN_FRAMES - 1; i++) s.frame(16, explore + RUM_WARMUP_MS + i, explore, true);
    expect(s.payload({ released: "ready", exploreAt: null })).toEqual({ v: 1, tier: "full", path: "enter", fps50: "na", fps10: "na", explore: "na", lost: 0, timeout: 0 });
  });
});
```

- [x] **Step 2: Run them to see them fail**

Run: `bun run test tests/unit/rum-protocol.test.ts tests/unit/rum-client.test.ts`
Expected: FAIL: `@/lib/rum/protocol`, `@/experience/perf/rum` and `@/experience/perf/rumDecision` do not resolve.

- [x] **Step 3: Implement the protocol**

Create `src/lib/rum/protocol.ts`:

```ts
/**
 * Wire contract of the anonymous performance beacon (`POST /api/rum`, appendix 06 section 4).
 * Coarse buckets only: no IP, no user agent, no renderer string, no URL, no free text. Imported by the
 * 3D chunk (src/experience/perf/) and the Pages Function (functions/_lib/rum.ts), so both agree.
 */
export const RUM_VERSION = 1 as const;
/** Largest accepted body; the largest valid payload is about 130 bytes. */
export const RUM_MAX_BYTES = 512;

export const RUM_TIERS = ["full", "lite"] as const;
/** How the 3D session started: the game-first boot cover, Enter the 3D HQ from the Page View, or a floor or room route. */
export const RUM_PATHS = ["cover", "enter", "deeplink"] as const;
export const RUM_FPS = ["na", "lt15", "15-24", "25-29", "30-44", "45-54", "55+"] as const;
export const RUM_TIMES = ["na", "lt3s", "3-5s", "5-8s", "8-12s", "12-20s", "20s+"] as const;

export type RumTier = (typeof RUM_TIERS)[number];
export type RumPath = (typeof RUM_PATHS)[number];
export type RumFps = (typeof RUM_FPS)[number];
export type RumTime = (typeof RUM_TIMES)[number];

export interface RumPayload {
  v: typeof RUM_VERSION;
  tier: RumTier;
  path: RumPath;
  /** Median and 10th percentile FPS over the session's window. */
  fps50: RumFps;
  fps10: RumFps;
  /** Navigation start to the first interactive phase. */
  explore: RumTime;
  /** 1 when the WebGL context was lost. */
  lost: 0 | 1;
  /** 1 when the 8 s boot timeout revealed the page. */
  timeout: 0 | 1;
}

const KEYS = ["v", "tier", "path", "fps50", "fps10", "explore", "lost", "timeout"] as const;

const oneOf = <T extends string>(list: readonly T[], value: unknown): value is T => typeof value === "string" && (list as readonly string[]).includes(value);
const bit = (value: unknown): value is 0 | 1 => value === 0 || value === 1;

/** The payload when `value` is exactly the allowlisted object (no extra keys, every value from its list), else null. */
export function parseRumPayload(value: unknown): RumPayload | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  const keys = Object.keys(o);
  if (keys.length !== KEYS.length || !KEYS.every((k) => keys.includes(k))) return null;
  if (o.v !== RUM_VERSION || !oneOf(RUM_TIERS, o.tier) || !oneOf(RUM_PATHS, o.path)) return null;
  if (!oneOf(RUM_FPS, o.fps50) || !oneOf(RUM_FPS, o.fps10) || !oneOf(RUM_TIMES, o.explore)) return null;
  if (!bit(o.lost) || !bit(o.timeout)) return null;
  return { v: RUM_VERSION, tier: o.tier, path: o.path, fps50: o.fps50, fps10: o.fps10, explore: o.explore, lost: o.lost, timeout: o.timeout };
}

export function fpsBucket(fps: number | null): RumFps {
  if (fps === null || !Number.isFinite(fps) || fps <= 0) return "na";
  if (fps < 15) return "lt15";
  if (fps < 25) return "15-24";
  if (fps < 30) return "25-29";
  if (fps < 45) return "30-44";
  if (fps < 55) return "45-54";
  return "55+";
}

export function timeBucket(ms: number | null): RumTime {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return "na";
  if (ms < 3000) return "lt3s";
  if (ms < 5000) return "3-5s";
  if (ms < 8000) return "5-8s";
  if (ms < 12_000) return "8-12s";
  if (ms < 20_000) return "12-20s";
  return "20s+";
}

/** One Analytics Engine point. Blobs: version, tier, path, fps50, fps10, explore. Doubles: lost, timeout, count. Index: tier. */
export function rumDataPoint(p: RumPayload): { blobs: string[]; doubles: number[]; indexes: string[] } {
  return { blobs: [String(p.v), p.tier, p.path, p.fps50, p.fps10, p.explore], doubles: [p.lost, p.timeout, 1], indexes: [p.tier] };
}
```

- [x] **Step 4: Implement the decision and the session**

Create `src/experience/perf/rumDecision.ts`:

```ts
import type { RumPath } from "@/lib/rum/protocol";

/** Share of 3D sessions that send the performance beacon (appendix 06 section 4). */
export const RUM_RATE = 0.25;
/** sessionStorage: "on" or "off" once decided for this browser session, "sent" after the beacon left. */
export const RUM_SESSION_KEY = "hq:rum";

export interface RumDecisionInput {
  stored: string | null;
  search: string;
  /** navigator.webdriver: Playwright, Lighthouse and other automation. */
  webdriver: boolean;
  /** Do Not Track or Global Privacy Control. */
  privacySignal: boolean;
  /** Math.random() for this session. */
  random: number;
}

export type RumDecision = "on" | "off" | "sent";

/**
 * Once per browser session: never again after the beacon was sent; `?rum=1` forces it on (preview
 * checks, tests) and `?rum=0` off; then the stored decision; automation and privacy signals are off;
 * otherwise RUM_RATE of sessions.
 */
export function rumDecision(i: RumDecisionInput): RumDecision {
  if (i.stored === "sent") return "sent";
  const forced = /[?&]rum=([01])(&|$)/.exec(i.search)?.[1];
  if (forced === "1") return "on";
  if (forced === "0") return "off";
  if (i.stored === "on" || i.stored === "off") return i.stored;
  if (i.webdriver || i.privacySignal) return "off";
  return i.random < RUM_RATE ? "on" : "off";
}

/** Coarse load path: a floor or room route, the game-first boot cover, or Enter the 3D HQ from the Page View. */
export function rumPath({ startFloor, startRoom, coverUsed }: { startFloor?: string; startRoom?: string; coverUsed: boolean }): RumPath {
  if (startFloor || startRoom) return "deeplink";
  return coverUsed ? "cover" : "enter";
}

/** Reads and stores this session's decision; true when this 3D view should run the RUM probe. */
export function decideRum(): boolean {
  let stored: string | null = null;
  try {
    stored = sessionStorage.getItem(RUM_SESSION_KEY);
  } catch {
    // Storage blocked: decide for this page only.
  }
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  const decision = rumDecision({
    stored,
    search: window.location.search,
    webdriver: nav.webdriver === true,
    privacySignal: nav.doNotTrack === "1" || nav.globalPrivacyControl === true,
    random: Math.random(),
  });
  if (decision !== "sent") {
    try {
      sessionStorage.setItem(RUM_SESSION_KEY, decision);
    } catch {
      // Same as above.
    }
  }
  return decision === "on";
}
```

Note: `?rum=10` does not match `rum=([01])(&|$)`, so the test expects the random draw (0.1, "on").

Create `src/experience/perf/rum.ts`:

```ts
import { fpsBucket, RUM_VERSION, timeBucket, type RumPath, type RumPayload, type RumTier } from "@/lib/rum/protocol";
import { FrameSampler } from "./frames";

export const RUM_ENDPOINT = "/api/rum";
/** The FPS window starts this long after explore (first-visit compiles and mounts settle first). */
export const RUM_WARMUP_MS = 2000;
/** Visible frames in the window (about 10 s at 60 Hz). */
export const RUM_WINDOW_FRAMES = 600;
/** With fewer frames the FPS buckets say "na". */
export const RUM_MIN_FRAMES = 60;

/** One sampled session's coarse numbers; `payload()` is the beacon body. */
export class RumSession {
  private readonly frames = new FrameSampler(RUM_WINDOW_FRAMES);
  private readonly input: { tier: RumTier; path: RumPath };
  private lost = false;

  constructor(input: { tier: RumTier; path: RumPath }) {
    this.input = input;
  }

  /** One rendered frame (ms), counted only while visible, from RUM_WARMUP_MS after explore, up to the window. */
  frame(dtMs: number, now: number, exploreAt: number | null, visible: boolean): void {
    if (!visible || exploreAt === null || now - exploreAt < RUM_WARMUP_MS || this.frames.count >= RUM_WINDOW_FRAMES) return;
    this.frames.push(dtMs);
  }

  contextLost(): void {
    this.lost = true;
  }

  get sampled(): number {
    return this.frames.count;
  }

  payload({ released, exploreAt }: { released: string | null; exploreAt: number | null }): RumPayload {
    const stats = this.frames.count >= RUM_MIN_FRAMES ? this.frames.stats() : null;
    return {
      v: RUM_VERSION,
      tier: this.input.tier,
      path: this.input.path,
      fps50: fpsBucket(stats?.fpsP50 ?? null),
      fps10: fpsBucket(stats?.fpsP10 ?? null),
      explore: timeBucket(exploreAt),
      lost: this.lost ? 1 : 0,
      timeout: released === "timeout" ? 1 : 0,
    };
  }
}
```

- [x] **Step 5: Run the unit tests to see them pass**

Run: `bun run test tests/unit/rum-protocol.test.ts tests/unit/rum-client.test.ts`
Expected: PASS (5 + 7 tests).

- [x] **Step 6: Write the probe and mount it in sampled sessions**

Create `src/experience/perf/RumProbe.tsx`:

```tsx
"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useState } from "react";
import { BOOT_RELEASED_ATTR } from "@/lib/boot-first";
import { markTime, PERF_MARKS } from "@/lib/perf-marks";
import type { RumPath, RumTier } from "@/lib/rum/protocol";
import { RUM_ENDPOINT, RumSession } from "./rum";
import { RUM_SESSION_KEY } from "./rumDecision";

/**
 * Sampled sessions only (Experience decides once per session; lazy chunk): feeds frame times to the
 * session and sends one beacon on the first of: tab hidden, page left, 3D view closed, WebGL context
 * lost. `next dev` (Strict Mode) runs the cleanup once on mount, so check beacons on a production build.
 */
export default function RumProbe({ tier, path }: { tier: RumTier; path: RumPath }) {
  const gl = useThree((s) => s.gl);
  const [session] = useState(() => new RumSession({ tier, path }));

  useFrame((_, dt) => {
    session.frame(dt * 1000, performance.now(), markTime(PERF_MARKS.explore), document.visibilityState === "visible");
  });

  useEffect(() => {
    let done = false;
    const send = () => {
      if (done) return;
      done = true;
      try {
        if (sessionStorage.getItem(RUM_SESSION_KEY) === "sent") return;
        sessionStorage.setItem(RUM_SESSION_KEY, "sent");
      } catch {
        // Without storage the in-memory flag still sends once per page.
      }
      const body = JSON.stringify(session.payload({ released: document.documentElement.getAttribute(BOOT_RELEASED_ATTR), exploreAt: markTime(PERF_MARKS.explore) }));
      try {
        navigator.sendBeacon?.(RUM_ENDPOINT, body);
      } catch {
        // A refused beacon is a lost sample, never an error for the visitor.
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") send();
    };
    const canvas = gl.domElement;
    const onLost = () => {
      // Closing the 3D view also loses the context on purpose; only a canvas still on the page crashed.
      if (!canvas.isConnected) return;
      session.contextLost();
      send();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", send);
    canvas.addEventListener("webglcontextlost", onLost);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", send);
      canvas.removeEventListener("webglcontextlost", onLost);
      send();
    };
  }, [gl, session]);

  return null;
}
```

In `src/experience/Experience.tsx`, add after `import { markOnce, PERF_MARKS } from "@/lib/perf-marks";`:

```ts
import { bootCoverUsed } from "@/lib/boot-first";
```

add after `import { usePerfMarks } from "./perf/usePerfMarks";`:

```ts
import { decideRum, rumPath } from "./perf/rumDecision";
```

add after the `PerfProbe` lazy line:

```ts
// Sampled sessions only (25%, decided once per browser session): unsampled sessions never download the probe.
const RumProbe = lazy(() => import("./perf/RumProbe"));
```

replace:

```ts
  const [perf] = useState(() => perfOverlayOn(window.location.search));
```

with:

```ts
  const [perf] = useState(() => perfOverlayOn(window.location.search));
  const [rum] = useState(() => (decideRum() ? rumPath({ startFloor, startRoom, coverUsed: bootCoverUsed() }) : null));
```

and replace:

```tsx
          {perf && (
            <Suspense fallback={null}>
              <PerfProbe />
            </Suspense>
          )}
        </Canvas>
```

with:

```tsx
          {perf && (
            <Suspense fallback={null}>
              <PerfProbe />
            </Suspense>
          )}
          {rum && (
            <Suspense fallback={null}>
              <RumProbe tier={tier === "full" ? "full" : "lite"} path={rum} />
            </Suspense>
          )}
        </Canvas>
```

- [x] **Step 7: Add the e2e checks**

In `e2e/perf-probes.spec.ts`, replace the first import with `import { expect, test, type Page } from "@playwright/test";`, add `import { parseRumPayload } from "../src/lib/rum/protocol";`, and append:

```ts
/** Captures beacons instead of sending them (the local static server has no Functions). */
async function stubBeacon(page: Page) {
  await page.addInitScript(() => {
    const sent: { url: string; body: string }[] = [];
    (window as unknown as { __beacons: typeof sent }).__beacons = sent;
    Object.defineProperty(Navigator.prototype, "sendBeacon", {
      configurable: true,
      value: (url: string, body: string) => {
        sent.push({ url: String(url), body: String(body) });
        return true;
      },
    });
  });
}

const beacons = (page: Page) => page.evaluate(() => (window as unknown as { __beacons: { url: string; body: string }[] }).__beacons);
const leave = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event("pagehide")));

test("a sampled session sends one coarse beacon when the page is left", async ({ page }) => {
  await asReturningVisitor(page);
  await stubBeacon(page);
  await page.goto("/en?tier=lite&rum=1");
  await waitForHQ(page);
  await waitForPhase(page, "explore");
  await waitForSceneLive(page);
  // The probe is a lazy chunk: keep leaving until it is mounted and has sent.
  await expect
    .poll(
      async () => {
        await leave(page);
        return (await beacons(page)).length;
      },
      { timeout: 30_000 },
    )
    .toBe(1);
  await leave(page);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  const sent = await beacons(page);
  expect(sent).toHaveLength(1);
  expect(sent[0].url).toBe("/api/rum");
  const payload = parseRumPayload(JSON.parse(sent[0].body));
  expect(payload).not.toBeNull();
  expect(payload).toMatchObject({ v: 1, tier: "lite", path: "cover", lost: 0, timeout: 0 });
  expect(payload!.explore).not.toBe("na");
  expect(await page.evaluate(() => sessionStorage.getItem("hq:rum"))).toBe("sent");
});

test("automation is never sampled without ?rum=1", async ({ page }) => {
  await stubBeacon(page);
  await enterHQ(page);
  await waitForFrames(page, 30);
  await leave(page);
  await waitForFrames(page, 10);
  expect(await beacons(page)).toEqual([]);
  expect(await page.evaluate(() => sessionStorage.getItem("hq:rum"))).toBe("off");
});
```

- [x] **Step 8: Verify**

```bash
bun run typecheck && bun run lint && bun run test tests/unit
bun run build
E2E_PORT=4433 bunx playwright test e2e/perf-probes.spec.ts
E2E_PORT=4433 bun run e2e:look
E2E_PORT=4433 bun run e2e:perf e2e/perf/bytes-3d.spec.ts
bun scripts/perf-summary.ts gates --head perf-report
```

Expected: all pass; look check `8 passed`; the 3D JS total grows by under 1.5 KB against Task 4's number (SP12 pass criterion: "< 1.5 KB gz in 3D chunk"); the summary lists no new chunk for `RumProbe` (it never loads under automation without `?rum=1`). Record the delta.

- [x] **Step 9: Commit**

```bash
rtk git add src/lib/rum/protocol.ts tests/unit/rum-protocol.test.ts src/experience/perf/rumDecision.ts src/experience/perf/rum.ts src/experience/perf/RumProbe.tsx tests/unit/rum-client.test.ts src/experience/Experience.tsx e2e/perf-probes.spec.ts
rtk git commit -m "feat: sampled anonymous RUM beacon client (25% of 3D sessions, coarse buckets)"
```

---

### Task 9: `POST /api/rum` Pages Function, `perf_events` binding and the smoke check

The server half of SP12: a same-origin Function that accepts only the exact protocol object and writes one Analytics Engine point to `perf_events`; never reads IP, user agent or any other header into the point. The deploy smoke check proves the Function exists.

**Files:**
- Create: `functions/_lib/rum.ts`
- Create: `functions/api/rum.ts`
- Modify: `functions/_lib/types.ts`
- Modify: `wrangler.toml`
- Create: `tests/unit/rum-endpoint.test.ts`
- Modify: `scripts/deploy-smoke.ts`
- Modify: `tests/unit/deploy-smoke.test.ts`
- Modify: `scripts/e2e-plan.ts`, `tests/unit/e2e-plan.test.ts`

**Interfaces:**
- Consumes: `parseRumPayload`, `rumDataPoint`, `RUM_MAX_BYTES` (Task 8); `originAllowed` (`functions/_lib/security.ts`); `AnalyticsEngineDataset` (`functions/_lib/types.ts`).
- Produces: `PagesContext<E = AskEnv>`, `RumEnv { RUM_ENABLED?; ASK_ALLOWED_ORIGINS?; PERF_EVENTS? }`; `createRumHandler({ now? })`, `RUM_ISOLATE_CAP` (600), `resetRumWindow()`; binding `PERF_EVENTS` (dataset `perf_events`), var `RUM_ENABLED = "true"`; smoke `Observed.rum`.

- [x] **Step 1: Write the failing endpoint tests**

Create `tests/unit/rum-endpoint.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { createRumHandler, resetRumWindow, RUM_ISOLATE_CAP } from "../../functions/_lib/rum";
import type { AnalyticsEngineDataset, RumEnv } from "../../functions/_lib/types";

const ORIGIN = "https://kurniadi.pages.dev";
const PAYLOAD = { v: 1, tier: "full", path: "cover", fps50: "55+", fps10: "45-54", explore: "5-8s", lost: 0, timeout: 0 };

function setup(env: Partial<RumEnv> = {}) {
  const points: Parameters<AnalyticsEngineDataset["writeDataPoint"]>[0][] = [];
  const fullEnv: RumEnv = { RUM_ENABLED: "true", ASK_ALLOWED_ORIGINS: `${ORIGIN},https://kurniadi.dev`, PERF_EVENTS: { writeDataPoint: (p) => points.push(p) }, ...env };
  const handler = createRumHandler({ now: () => Date.UTC(2026, 9, 13, 3, 0, 0) });
  const post = (body: string, headers: Record<string, string> = {}) =>
    handler({
      request: new Request(`${ORIGIN}/api/rum`, {
        method: "POST",
        headers: { Origin: ORIGIN, "Sec-Fetch-Site": "same-origin", "Content-Type": "text/plain;charset=UTF-8", "User-Agent": "TestAgent/9.9", "CF-Connecting-IP": "203.0.113.9", ...headers },
        body,
      }),
      env: fullEnv,
      waitUntil: () => undefined,
    });
  return { handler, post, points, env: fullEnv };
}

beforeEach(() => resetRumWindow());

describe("POST /api/rum", () => {
  it("writes one allowlisted point and answers 204 without a body", async () => {
    const { post, points } = setup();
    const res = await post(JSON.stringify(PAYLOAD));
    expect(res.status).toBe(204);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.text()).toBe("");
    expect(points).toEqual([{ blobs: ["1", "full", "cover", "55+", "45-54", "5-8s"], doubles: [0, 0, 1], indexes: ["full"] }]);
  });

  it("never stores the IP address or the user agent", async () => {
    const { post, points } = setup();
    await post(JSON.stringify(PAYLOAD));
    const stored = JSON.stringify(points);
    expect(stored).not.toContain("203.0.113.9");
    expect(stored).not.toContain("TestAgent");
  });

  it("answers 405 to anything but POST (the deploy smoke check relies on it)", async () => {
    const { handler, points, env } = setup();
    const res = await handler({ request: new Request(`${ORIGIN}/api/rum`), env, waitUntil: () => undefined });
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("POST");
    expect(points).toEqual([]);
  });

  it("drops everything while the kill switch is off", async () => {
    const { post, points } = setup({ RUM_ENABLED: "false" });
    expect((await post(JSON.stringify(PAYLOAD))).status).toBe(204);
    expect(points).toEqual([]);
  });

  it("rejects other origins, oversized bodies and anything outside the protocol", async () => {
    const { post, points } = setup();
    expect((await post(JSON.stringify(PAYLOAD), { Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" })).status).toBe(403);
    expect((await post("x".repeat(600))).status).toBe(413);
    expect((await post("{not json")).status).toBe(400);
    expect((await post(JSON.stringify({ ...PAYLOAD, ua: "Mozilla" }))).status).toBe(400);
    expect((await post(JSON.stringify({ ...PAYLOAD, tier: "static" }))).status).toBe(400);
    expect(points).toEqual([]);
  });

  it("caps points per isolate and minute", async () => {
    const { post, points } = setup();
    for (let i = 0; i < RUM_ISOLATE_CAP; i++) expect((await post(JSON.stringify(PAYLOAD))).status).toBe(204);
    expect((await post(JSON.stringify(PAYLOAD))).status).toBe(429);
    expect(points).toHaveLength(RUM_ISOLATE_CAP);
  });

  it("is bound in wrangler.toml with an explicit kill switch", () => {
    const toml = readFileSync("wrangler.toml", "utf8");
    expect(toml).toMatch(/^RUM_ENABLED = "(true|false)"$/m);
    expect(toml).toMatch(/\[\[analytics_engine_datasets\]\]\nbinding = "PERF_EVENTS"\ndataset = "perf_events"/);
  });
});
```

- [x] **Step 2: Run them to see them fail**

Run: `bun run test tests/unit/rum-endpoint.test.ts`
Expected: FAIL: `../../functions/_lib/rum` does not resolve.

- [x] **Step 3: Implement the handler and the Function**

In `functions/_lib/types.ts`, replace:

```ts
export interface PagesContext {
  request: Request;
  env: AskEnv;
  waitUntil(promise: Promise<unknown>): void;
}
```

with:

```ts
/** Bindings of the performance beacon Function (functions/api/rum.ts, appendix 06 section 4). */
export interface RumEnv {
  /** Kill switch: anything but "true" drops every point (still 204, so clients never retry). */
  RUM_ENABLED?: string;
  /** Site origins, shared with Ask the HQ. */
  ASK_ALLOWED_ORIGINS?: string;
  PERF_EVENTS?: AnalyticsEngineDataset;
}

export interface PagesContext<E = AskEnv> {
  request: Request;
  env: E;
  waitUntil(promise: Promise<unknown>): void;
}
```

Create `functions/_lib/rum.ts`:

```ts
import { parseRumPayload, rumDataPoint, RUM_MAX_BYTES } from "../../src/lib/rum/protocol";
import { originAllowed } from "./security";
import type { PagesContext, RumEnv } from "./types";

/** Points written per isolate and minute at most: a cheap ceiling for a spammed endpoint (AE free plan: 100k points a day). */
export const RUM_ISOLATE_CAP = 600;

const rumWindow = { minute: -1, count: 0 };

/** Tests only: a fresh per-minute window. */
export function resetRumWindow(): void {
  rumWindow.minute = -1;
  rumWindow.count = 0;
}

const empty = (status: number, headers: Record<string, string> = {}) => new Response(null, { status, headers: { "Cache-Control": "no-store", ...headers } });

/**
 * `POST /api/rum` (appendix 06 section 4): one coarse point per sampled 3D session into Analytics
 * Engine `perf_events`. Same origin only, at most RUM_MAX_BYTES, exactly the protocol object. Reads no
 * other header: the IP address and the user agent never reach the point.
 */
export function createRumHandler({ now = () => Date.now() }: { now?: () => number } = {}) {
  return async function handle({ request, env }: PagesContext<RumEnv>): Promise<Response> {
    if (request.method !== "POST") return empty(405, { Allow: "POST" });
    if (env.RUM_ENABLED !== "true") return empty(204);
    if (!originAllowed(request, env.ASK_ALLOWED_ORIGINS)) return empty(403);
    if (Number(request.headers.get("Content-Length") ?? "0") > RUM_MAX_BYTES) return empty(413);
    const text = await request.text();
    if (text.length > RUM_MAX_BYTES) return empty(413);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return empty(400);
    }
    const payload = parseRumPayload(body);
    if (!payload) return empty(400);
    const minute = Math.floor(now() / 60_000);
    if (rumWindow.minute !== minute) {
      rumWindow.minute = minute;
      rumWindow.count = 0;
    }
    rumWindow.count += 1;
    if (rumWindow.count > RUM_ISOLATE_CAP) return empty(429);
    try {
      env.PERF_EVENTS?.writeDataPoint(rumDataPoint(payload));
    } catch {
      // Analytics must never fail the beacon.
    }
    return empty(204);
  };
}
```

Create `functions/api/rum.ts`:

```ts
import { createRumHandler } from "../_lib/rum";
import type { PagesContext, RumEnv } from "../_lib/types";

/**
 * Anonymous performance beacon: `POST /api/rum` writes one coarse point per sampled 3D session to the
 * Analytics Engine dataset `perf_events` (appendix 06 section 4). Any other method answers 405.
 */
const handler = createRumHandler();

export const onRequest = (context: PagesContext<RumEnv>) => handler(context);
```

In `wrangler.toml`, replace:

```toml
[[analytics_engine_datasets]]
binding = "ASK_EVENTS"
dataset = "ask_events"
```

with:

```toml
[[analytics_engine_datasets]]
binding = "ASK_EVENTS"
dataset = "ask_events"

# Workers Analytics Engine dataset for the anonymous performance beacon (functions/api/rum.ts,
# appendix 06 section 4): one point per sampled 3D session, no IP, no user agent, coarse buckets only.
# blobs [version, tier, path, fps50, fps10, explore], doubles [contextLost, bootTimeout, 1], index tier.
# Created on the first write; query it with the Analytics Engine SQL API (docs/deploy.md section 12).
[[analytics_engine_datasets]]
binding = "PERF_EVENTS"
dataset = "perf_events"
```

and in `[vars]`, after `ASK_DAILY_CAP = "600"` add:

```toml
# Kill switch of the performance beacon (/api/rum). Anything but "true" drops every point (204).
# On since round 5 (owner approval 2026-10-13).
RUM_ENABLED = "true"
```

- [x] **Step 4: Run the tests to see them pass**

Run: `bun run test tests/unit/rum-endpoint.test.ts tests/ask/handler.test.ts tests/unit/provision-ask.test.ts`
Expected: PASS (7 new tests; the Ask handler and wrangler tests are unchanged and pass with the generic `PagesContext`).

- [x] **Step 5: Extend the deploy smoke check**

In `scripts/deploy-smoke.ts`, replace:

```ts
export interface Observed {
  status?: { code: number; enabled?: boolean; asOf?: string };
  page?: { code: number; html: string };
}
```

with:

```ts
export interface Observed {
  status?: { code: number; enabled?: boolean; asOf?: string };
  page?: { code: number; html: string };
  /** `GET /api/rum`: the beacon Function only accepts POST, so 405 proves it is deployed. */
  rum?: { code: number };
}
```

In `smokeProblems`, before `return problems;` add:

```ts
  if (observed.rum?.code !== 405) problems.push(`GET /api/rum returned HTTP ${observed.rum?.code ?? "none"}, expected 405 (the performance beacon Function is missing)`);
```

In `observe`, before `return observed;` add:

```ts
  try {
    const r = await fetch(`${site}/api/rum`, { cache: "no-store" });
    observed.rum = { code: r.status };
  } catch {
    // Reported as no response.
  }
```

and in `main`, replace:

```ts
  console.log(`Expecting ${site}: Ask enabled as of ${expected.asOf}, ${expected.contributions ?? "no"} contributions, beacon ${expected.beacon ? "on" : "off"}.`);
```

with:

```ts
  console.log(`Expecting ${site}: Ask enabled as of ${expected.asOf}, ${expected.contributions ?? "no"} contributions, beacon ${expected.beacon ? "on" : "off"}, /api/rum deployed.`);
```

Replace `tests/unit/deploy-smoke.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { smokeProblems, type Expected, type Observed } from "../../scripts/deploy-smoke";

const expected: Expected = { asOf: "2026-10-18", contributions: "7,600", beacon: true };
const html = '<p>7,600</p><script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon="{}"></script>';
const healthy: Observed = { status: { code: 200, enabled: true, asOf: "2026-10-18" }, page: { code: 200, html }, rum: { code: 405 } };

describe("post-deploy smoke check", () => {
  it("passes when production serves the new pack, facts, beacon and the RUM Function", () => {
    expect(smokeProblems(expected, healthy)).toEqual([]);
  });

  it("reports a stale deployment, a disabled endpoint, a missing number or beacon", () => {
    expect(smokeProblems(expected, { ...healthy, status: { code: 200, enabled: true, asOf: "2026-10-11" } })).toEqual(["GET /api/ask asOf is 2026-10-11, expected 2026-10-18"]);
    expect(smokeProblems(expected, { ...healthy, status: { code: 503 } })[0]).toMatch(/not enabled/);
    expect(smokeProblems(expected, { ...healthy, page: { code: 200, html: "<p>7,541</p>" } })).toEqual(["/en does not show 7,600 contributions", "/en has no Web Analytics beacon"]);
    expect(smokeProblems(expected, {})).toHaveLength(3);
  });

  it("reports a missing RUM Function (the static 404 page)", () => {
    expect(smokeProblems(expected, { ...healthy, rum: { code: 404 } })).toEqual(["GET /api/rum returned HTTP 404, expected 405 (the performance beacon Function is missing)"]);
  });

  it("does not require the beacon when the build had no token", () => {
    expect(smokeProblems({ ...expected, beacon: false }, { ...healthy, page: { code: 200, html: "7,600" } })).toEqual([]);
  });
});
```

- [x] **Step 6: Keep the RUM Function out of the Ask e2e mapping**

In `scripts/e2e-plan.ts`, add before `{ test: /^functions\//, specs: ["ask"] },`:

```ts
  // The performance beacon Function is unit tested (tests/unit/rum-endpoint.test.ts); no e2e covers Functions locally.
  { test: /^functions\/(api\/rum|_lib\/rum)\.ts$/, specs: [] },
```

In `tests/unit/e2e-plan.test.ts`, add:

```ts
  it("runs no e2e for the RUM Function", () => {
    expect(specsForChanges(["functions/api/rum.ts", "functions/_lib/rum.ts"]).specs).toEqual([]);
    expect(specsForChanges(["functions/_lib/handler.ts"]).specs).toEqual(["ask"]);
  });
```

- [x] **Step 7: Verify and commit**

```bash
bun run typecheck && bun run lint && bun run test
rtk git diff --quiet origin/main -- public/_headers tests/unit/csp.test.ts && echo "CSP unchanged"
rtk git add functions/_lib/rum.ts functions/api/rum.ts functions/_lib/types.ts wrangler.toml tests/unit/rum-endpoint.test.ts scripts/deploy-smoke.ts tests/unit/deploy-smoke.test.ts scripts/e2e-plan.ts tests/unit/e2e-plan.test.ts
rtk git commit -m "feat: /api/rum Pages Function writing Analytics Engine perf_events, smoke-checked after deploy"
```

Expected: every unit test passes; `CSP unchanged` is printed.

Optional, on the owner's machine with a logged-in wrangler (proves the Function bundles with the Ask one): `bun run build && bunx wrangler@4 pages functions build --outdir .wrangler/fn-check && rm -rf .wrangler/fn-check`. Expected: exit 0.

---
### Task 10: Nightly game-first timeline (trend only)

SP2: the path real WebGL2 visitors take, which Lighthouse never sees (it is bot-like): Playwright with a cold cache, `navigator.webdriver` hidden, network and CPU throttling, the boot cover, the Boot rover click, the intro, explore, and for a deep link the first drawer. Marks come from Task 7, the headline from P1's `elementtiming="hq-headline"`. Results are an artifact and a job summary with the previous night in brackets; nothing here blocks.

**Files:**
- Create: `e2e/perf/timeline.spec.ts`
- Create: `.github/workflows/perf-nightly.yml`

**Interfaces:**
- Consumes: `PERF_MARKS` (`src/lib/perf-marks.ts`); `asHumanBrowser`, `waitForHQ`, `waitForPhase` (`e2e/hq.ts`); `writePerfEntry` (`e2e/perf/helpers.ts`); `renderTimeline` through `bun scripts/perf-summary.ts timeline`; `scripts/perf-base.sh`.
- Produces: entries `timeline-<profile>-<scenario>-<run>` with `marks.coverFcp`, `headline`, `bootRelease`, `firstFrame`, `introStart`, `introEnd`, `explore`, `firstDrawer` (ms or null) and `release`; workflow `Perf timeline` with artifact `perf-timeline` (90 days).

- [x] **Step 1: Write the timeline spec**

Create `e2e/perf/timeline.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";
import { PERF_MARKS } from "../../src/lib/perf-marks";
import { asHumanBrowser, waitForHQ, waitForPhase } from "../hq";
import { writePerfEntry } from "./helpers";

/**
 * Nightly game-first timeline (SP2; `bun run e2e:timeline`, workflow perf-nightly.yml). Trend only:
 * SwiftShader and shared runners make every number here noisy, so nothing is asserted except that the
 * 3D view rendered at all. Each run is a cold context (empty cache and storage), with
 * `navigator.webdriver` hidden so the page treats it like a person, and `?tier=lite` so the boot cover
 * path runs on a software renderer. `rum=0` keeps the run out of the RUM dataset.
 */
const PROFILES = {
  /** No throttling. */
  none: { latency: 0, down: -1, up: -1, cpu: 1 },
  /** A fast 4G phone. */
  "4g": { latency: 40, down: (9 * 1000 * 1000) / 8, up: (1.5 * 1000 * 1000) / 8, cpu: 2 },
  /** The report's P1 profile: slow 4G (1.6 Mbps, 150 ms RTT), 4x CPU. */
  p1: { latency: 150, down: (1.6 * 1000 * 1000) / 8, up: (750 * 1000) / 8, cpu: 4 },
} as const;

/** Home (ends at explore) and a pod deep link (the intro, then the continuation mission opens the drawer). */
const SCENARIOS = { home: "/en", deeplink: "/en/labs/voice-ai-contact-center" } as const;
const RUNS = 2;

test.describe.configure({ timeout: 300_000 });

async function throttle(page: Page, profile: (typeof PROFILES)[keyof typeof PROFILES]) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: profile.latency, downloadThroughput: profile.down, uploadThroughput: profile.up });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: profile.cpu });
}

/** Element Timing for the boot card headline (P1 sets `elementtiming="hq-headline"`); null until then. */
async function observeHeadline(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __headline?: number };
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & { identifier?: string; renderTime?: number; loadTime?: number })[]) {
          if (entry.identifier === "hq-headline" && w.__headline === undefined) w.__headline = entry.renderTime || entry.loadTime || entry.startTime;
        }
      }).observe({ type: "element", buffered: true });
    } catch {
      // Element Timing is Chromium only.
    }
  });
}

async function collect(page: Page) {
  return page.evaluate((names) => {
    const at = (name: string) => performance.getEntriesByName(name, "mark")[0]?.startTime ?? null;
    const marks: Record<string, number | null> = {
      coverFcp: performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null,
      headline: (window as unknown as { __headline?: number }).__headline ?? null,
    };
    for (const [key, name] of Object.entries(names)) marks[key] = at(name);
    return { marks, release: document.documentElement.getAttribute("data-hq-boot-released") };
  }, PERF_MARKS);
}

for (const profile of Object.keys(PROFILES) as (keyof typeof PROFILES)[]) {
  for (const [scenario, path] of Object.entries(SCENARIOS)) {
    for (let run = 1; run <= RUNS; run++) {
      test(`${scenario} on ${profile}, run ${run} @nightly`, async ({ browser }) => {
        const context = await browser.newContext();
        const page = await context.newPage();
        await asHumanBrowser(page);
        await observeHeadline(page);
        await throttle(page, PROFILES[profile]);
        await page.goto(`${path}?tier=lite&rum=0`, { waitUntil: "commit" });
        await waitForHQ(page);
        const start = page.getByTestId("boot").getByRole("button", { name: "Boot rover" });
        await expect(start).not.toHaveAttribute("aria-disabled", "true", { timeout: 180_000 });
        await start.click();
        await waitForPhase(page, "explore", 180_000);
        if (scenario === "deeplink") {
          await page.waitForFunction((name) => performance.getEntriesByName(name, "mark").length > 0, PERF_MARKS.firstDrawer, { timeout: 120_000 }).catch(() => undefined);
        }
        const { marks, release } = await collect(page);
        writePerfEntry({ kind: "timeline", profile, scenario, run, release, marks });
        console.log(`${scenario} ${profile} #${run}: ${JSON.stringify(marks)} (release ${release})`);
        await context.close();
        expect(marks.firstFrame, "the 3D view never rendered").not.toBeNull();
      });
    }
  }
}
```

- [x] **Step 2: Run one profile locally**

```bash
bun run build
rm -rf perf-report
E2E_PORT=4433 bun run e2e:timeline -g "on none"
bun scripts/perf-summary.ts timeline --head perf-report
```

Expected: `4 passed` (home and deeplink, 2 runs each); the summary shows one row per scenario with `release` `ready`, `headline` `-` (until P1 lands), `firstDrawer` `-` for home and a number for deeplink. If `firstDrawer` is `-` on deeplink, the first-session Rover Terminal or tour blocked the continuation: record it in the PR (it is a product finding, not a test bug) and leave the spec as is.

- [x] **Step 3: Add the nightly workflow**

Create `.github/workflows/perf-nightly.yml`:

```yaml
name: Perf timeline

# Nightly game-first timeline (round 5 P4, REPORT SP2): the path real WebGL2 visitors take, which
# Lighthouse never sees. Cold cache, navigator.webdriver hidden, three throttling profiles, marks for
# cover paint, headline, first frame, intro end, explore and first drawer. Trend only: it never blocks
# anything, and SwiftShader numbers are compared night to night, never to real devices.
# Artifact `perf-timeline` (90 days); the job summary shows the previous night in brackets.

on:
  schedule:
    # 21:00 UTC is 04:00 in Jakarta, after the screenshots run (19:30 UTC).
    - cron: "0 21 * * *"
  workflow_dispatch:

concurrency:
  group: perf-timeline
  cancel-in-progress: true

permissions:
  contents: read
  # Downloads the previous night's artifact for the trend column.
  actions: read

env:
  SAFETY_BLOCKLIST: ${{ secrets.SAFETY_BLOCKLIST }}
  NEXT_TELEMETRY_DISABLED: "1"

jobs:
  timeline:
    name: Game-first timeline
    runs-on: ubuntu-latest
    timeout-minutes: 90
    steps:
      - uses: actions/checkout@v7
      - uses: ./.github/actions/setup
        with:
          playwright: "true"
      - uses: actions/cache@v6
        with:
          path: .next/cache
          key: next-${{ runner.os }}-${{ hashFiles('bun.lock') }}-${{ hashFiles('src/**', 'content/**', 'messages/**', 'public/**', 'next.config.ts') }}
          restore-keys: next-${{ runner.os }}-${{ hashFiles('bun.lock') }}-
      - run: bun run build
      - name: Timeline (cold cache, throttled, one worker)
        # Trend only: a slow or failed run must not hide the others' numbers.
        continue-on-error: true
        run: bun run e2e:timeline
      - name: Previous night
        if: ${{ !cancelled() }}
        env:
          GH_TOKEN: ${{ github.token }}
          REPO: ${{ github.repository }}
        run: bash scripts/perf-base.sh perf-timeline base-timeline perf-nightly.yml
      - name: Summary
        if: ${{ !cancelled() }}
        run: bun scripts/perf-summary.ts timeline --head perf-report --base base-timeline
      - uses: actions/upload-artifact@v7
        if: ${{ !cancelled() }}
        with:
          name: perf-timeline
          path: perf-report/
          retention-days: 90
          if-no-files-found: ignore
```

- [x] **Step 4: Commit**

```bash
bun run typecheck && bun run lint
rtk git add e2e/perf/timeline.spec.ts .github/workflows/perf-nightly.yml
rtk git commit -m "ci: nightly game-first timeline (cold cache, throttling profiles, trend only)"
```

After the PR merges, run it once by hand (`gh workflow run perf-nightly.yml --ref main`) and link the run in the PR thread.

---

### Task 11: Deploy reuses the CI result for the same commit

`deploy.yml` reran all 4 e2e shards on a commit CI had already tested (median 6.4 min, max 16.2, 2 of 25 deploys failed on flakes, REPORT Area 12). Now a `verify` job reuses CI's green `Build, CV and e2e` check for the sha (waiting while it runs), or a green CI run on a commit with the same tree (the weekly facts PR, tested before its squash merge, whose merge commit starts no CI because `GITHUB_TOKEN` pushes start no workflows). A red CI fails the deploy. Without any CI result, or with `rerun_e2e`, the old shards run. The production smoke check stays.

**Files:**
- Create: `scripts/ci-status.ts`
- Create: `tests/unit/ci-status.test.ts`
- Modify: `.github/workflows/deploy.yml`
- Modify: `.github/workflows/ci.yml` (concurrency)

**Interfaces:**
- Consumes: GitHub REST (`/repos/{repo}/commits/{sha}/check-runs`, `/repos/{repo}/commits/{sha}`, `/repos/{repo}/actions/workflows/ci.yml/runs`), env `GH_TOKEN`, `GITHUB_OUTPUT`, `GITHUB_STEP_SUMMARY`.
- Produces: `CI_CHECK` (`"Build, CV and e2e"`), `CI_WORKFLOW` (`"ci.yml"`), `CheckRun`, `Verdict`, `verdictFromChecks(runs)`, `TestedRun`, `sameTreeRun(tree, runs)`; CLI `bun scripts/ci-status.ts --repo <owner/name> --sha <sha> [--wait-minutes 40] [--grace-minutes 3] [--force-rerun true|false]` writing `reuse=true|false`; workflow input `rerun_e2e`; job output `needs.verify.outputs.reuse`.

- [x] **Step 1: Write the failing test**

Create `tests/unit/ci-status.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CI_CHECK, sameTreeRun, verdictFromChecks, type CheckRun } from "../../scripts/ci-status";

const run = (status: string, conclusion: string | null, url = "https://github.com/o/r/runs/1", name = CI_CHECK): CheckRun => ({ name, status, conclusion, html_url: url });

describe("deploy reuses the CI result", () => {
  it("reuses a green aggregate check", () => {
    expect(verdictFromChecks([run("completed", "success", "u1")])).toEqual({ kind: "reuse", url: "u1" });
  });

  it("prefers a green attempt over a red one (a rerun after a flake)", () => {
    expect(verdictFromChecks([run("completed", "failure", "u1"), run("completed", "success", "u2")])).toEqual({ kind: "reuse", url: "u2" });
  });

  it("waits while CI runs", () => {
    expect(verdictFromChecks([run("in_progress", null)])).toEqual({ kind: "wait" });
    expect(verdictFromChecks([run("queued", null), run("completed", "failure")])).toEqual({ kind: "wait" });
  });

  it("fails on a red CI", () => {
    expect(verdictFromChecks([run("completed", "failure", "u3")])).toEqual({ kind: "red", url: "u3", conclusion: "failure" });
    expect(verdictFromChecks([run("completed", "timed_out", "u4")])).toEqual({ kind: "red", url: "u4", conclusion: "timed_out" });
  });

  it("treats cancelled, skipped and other checks as no result", () => {
    expect(verdictFromChecks([run("completed", "cancelled"), run("completed", "skipped")])).toEqual({ kind: "missing" });
    expect(verdictFromChecks([run("completed", "success", "u5", "Lighthouse CI")])).toEqual({ kind: "missing" });
    expect(verdictFromChecks([])).toEqual({ kind: "missing" });
  });

  it("finds a green run that tested the same tree", () => {
    const runs = [
      { head_sha: "a1", tree: "t1", html_url: "r1" },
      { head_sha: "b2", tree: "t2", html_url: "r2" },
    ];
    expect(sameTreeRun("t2", runs)?.html_url).toBe("r2");
    expect(sameTreeRun("t3", runs)).toBeUndefined();
  });
});
```

- [x] **Step 2: Run it to see it fail**

Run: `bun run test tests/unit/ci-status.test.ts`
Expected: FAIL: `../../scripts/ci-status` does not resolve.

- [x] **Step 3: Implement the gate**

Create `scripts/ci-status.ts`:

```ts
/**
 * Deploy gate (deploy.yml, owner decision 2026-10-13): reuse the CI result for a commit instead of
 * rerunning e2e.
 *
 *   bun scripts/ci-status.ts --repo owner/name --sha <sha> [--wait-minutes 40] [--grace-minutes 3] [--force-rerun true]
 *
 * Writes `reuse=true|false` to $GITHUB_OUTPUT and one line to the job summary.
 * - reuse=true: CI's aggregate check `Build, CV and e2e` passed on this commit, or a successful CI run
 *   tested a commit with the same tree (the weekly facts PR before its squash merge: a GITHUB_TOKEN
 *   merge starts no push CI on main).
 * - reuse=false: no CI result for this commit or its tree after the grace period, or --force-rerun
 *   true: the deploy runs the e2e shards itself.
 * Exits 1 when CI failed on the commit, or still runs after --wait-minutes.
 * Uses fetch and GH_TOKEN only (checks: read, actions: read, contents: read); no dependencies.
 */
import { appendFileSync } from "node:fs";

export const CI_CHECK = "Build, CV and e2e";
export const CI_WORKFLOW = "ci.yml";

export interface CheckRun {
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string;
}

export type Verdict = { kind: "reuse"; url: string } | { kind: "wait" } | { kind: "red"; url: string; conclusion: string } | { kind: "missing" };

/** Cancelled or skipped runs (a superseded push, a manual cancel) say nothing about the commit. */
const NO_RESULT = new Set(["cancelled", "skipped", "neutral", "stale"]);

export function verdictFromChecks(runs: readonly CheckRun[]): Verdict {
  const mine = runs.filter((r) => r.name === CI_CHECK && !(r.status === "completed" && NO_RESULT.has(r.conclusion ?? "")));
  if (mine.length === 0) return { kind: "missing" };
  const green = mine.find((r) => r.status === "completed" && r.conclusion === "success");
  if (green) return { kind: "reuse", url: green.html_url };
  if (mine.some((r) => r.status !== "completed")) return { kind: "wait" };
  return { kind: "red", url: mine[0].html_url, conclusion: mine[0].conclusion ?? "unknown" };
}

export interface TestedRun {
  head_sha: string;
  tree: string;
  html_url: string;
}

export function sameTreeRun(tree: string, runs: readonly TestedRun[]): TestedRun | undefined {
  return runs.find((r) => r.tree === tree);
}

async function gh<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
  });
  if (!response.ok) throw new Error(`GitHub API ${path}: HTTP ${response.status}`);
  return (await response.json()) as T;
}

const treeOf = (repo: string, sha: string, token: string) => gh<{ commit: { tree: { sha: string } } }>(`/repos/${repo}/commits/${sha}`, token).then((c) => c.commit.tree.sha);

async function checkRuns(repo: string, sha: string, token: string): Promise<CheckRun[]> {
  const { check_runs } = await gh<{ check_runs: CheckRun[] }>(`/repos/${repo}/commits/${sha}/check-runs?check_name=${encodeURIComponent(CI_CHECK)}&per_page=100`, token);
  return check_runs;
}

/** The newest successful CI runs (any event) whose commit has the same tree as `sha`. */
async function runWithSameTree(repo: string, sha: string, token: string): Promise<TestedRun | undefined> {
  const tree = await treeOf(repo, sha, token);
  const { workflow_runs } = await gh<{ workflow_runs: { head_sha: string; html_url: string }[] }>(`/repos/${repo}/actions/workflows/${CI_WORKFLOW}/runs?status=success&per_page=30`, token);
  const tested: TestedRun[] = [];
  for (const run of workflow_runs) {
    const runTree = run.head_sha === sha ? tree : await treeOf(repo, run.head_sha, token).catch(() => "");
    tested.push({ head_sha: run.head_sha, tree: runTree, html_url: run.html_url });
    if (runTree === tree) break;
  }
  return sameTreeRun(tree, tested);
}

function output(reuse: boolean, note: string) {
  console.log(note);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `reuse=${reuse}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `- E2E: ${note}\n`);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const args = process.argv.slice(2);
  const flag = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const repo = flag("--repo") ?? process.env.GITHUB_REPOSITORY;
  const sha = flag("--sha");
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  if (!repo || !sha || !token) throw new Error("usage: GH_TOKEN=... bun scripts/ci-status.ts --repo owner/name --sha <sha>");
  if (flag("--force-rerun") === "true") return output(false, "rerun_e2e requested: the deploy runs the e2e shards.");
  const deadline = Date.now() + Number(flag("--wait-minutes") ?? 40) * 60_000;
  const graceUntil = Date.now() + Number(flag("--grace-minutes") ?? 3) * 60_000;
  for (;;) {
    const verdict = verdictFromChecks(await checkRuns(repo, sha, token));
    if (verdict.kind === "reuse") return output(true, `reused CI on this commit (${verdict.url}).`);
    if (verdict.kind === "red") {
      console.error(`::error::CI ended with "${verdict.conclusion}" on ${sha} (${verdict.url}). Fix main, or rerun CI, before deploying.`);
      process.exit(1);
    }
    if (verdict.kind === "missing") {
      const same = await runWithSameTree(repo, sha, token);
      if (same) return output(true, `reused CI on ${same.head_sha.slice(0, 7)}, same tree (${same.html_url}).`);
      // A push CI can take a moment to register its check run after the merge.
      if (Date.now() > graceUntil) return output(false, "no CI result for this commit or its tree: the deploy runs the e2e shards.");
    }
    if (Date.now() > deadline) {
      console.error(`::error::CI still runs on ${sha} after the wait; rerun the deploy when it finished.`);
      process.exit(1);
    }
    await sleep(30_000);
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
```

- [x] **Step 4: Run the test to see it pass**

Run: `bun run test tests/unit/ci-status.test.ts`
Expected: PASS (6 tests).

- [x] **Step 5: Try it against the real repository**

```bash
GH_TOKEN=$(gh auth token) bun scripts/ci-status.ts --repo ShinyQ/ShinyQ-HQ --sha "$(git rev-parse origin/main)" --wait-minutes 1 --grace-minutes 0
```

Expected: `reused CI on this commit (https://github.com/ShinyQ/ShinyQ-HQ/runs/...).` when the last main push CI is green; otherwise the red or "no CI result" line. Nothing is written to `GITHUB_OUTPUT` locally.

- [x] **Step 6: Rewrite `deploy.yml`**

In `.github/workflows/deploy.yml`, replace the header comment (lines 3 to 13) with:

```yaml
# Production deploy of the static export and the Pages Functions (Ask the HQ, the performance beacon)
# to Cloudflare Pages.
#
# Runs only when dispatched, never on a push to main:
#   - by refresh-facts.yml after it merged a weekly live-facts PR (sha = the merge commit), unless
#     the repository variable AUTO_DEPLOY_FACTS is "false";
#   - by hand: Actions > Deploy > Run workflow, or `gh workflow run deploy.yml --ref main [-f sha=<commit>]`.
# The sha must be on main. The deploy does not rerun e2e on a tested commit: `Reuse the CI result`
# (scripts/ci-status.ts) waits for CI's `Build, CV and e2e` check on the sha, or finds a green CI run on
# a commit with the same tree (the facts PR, tested before its squash merge). A red CI fails the deploy.
# Only without any CI result, or with the `rerun_e2e` input, does it build without the analytics beacon
# and run the 4 e2e shards itself. It deploys the production build (with the beacon) with
# --branch=main, smoke-checks production (scripts/deploy-smoke.ts) and opens a `deploy-failed` issue on
# failure. Needs the CLOUDFLARE_API_TOKEN (Pages Edit only) and CLOUDFLARE_ACCOUNT_ID secrets and the
# CF_PAGES_PROJECT variable; skips the upload with a notice while any is missing. docs/deploy.md.
```

Add the input after `reason:`:

```yaml
      rerun_e2e:
        description: Run the e2e shards here even when CI already passed on this commit
        required: false
        type: boolean
        default: false
```

Add this job after `resolve`:

```yaml
  verify:
    name: Reuse the CI result
    runs-on: ubuntu-latest
    needs: resolve
    permissions:
      contents: read
      checks: read
      actions: read
    outputs:
      reuse: ${{ steps.ci.outputs.reuse }}
    steps:
      - uses: actions/checkout@v7
        with:
          ref: ${{ needs.resolve.outputs.sha }}
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version-file: package.json
      - name: Green CI on this commit (waits while CI runs)
        id: ci
        env:
          GH_TOKEN: ${{ github.token }}
          REPO: ${{ github.repository }}
          SHA: ${{ needs.resolve.outputs.sha }}
          RERUN_E2E: ${{ inputs.rerun_e2e }}
        run: bun scripts/ci-status.ts --repo "$REPO" --sha "$SHA" --wait-minutes 40 --grace-minutes 3 --force-rerun "$RERUN_E2E"
```

In the `site` job, replace `needs: resolve` with `needs: [resolve, verify]`, and replace:

```yaml
      - name: Build for the e2e shards (no analytics beacon)
        run: bun run build
      - uses: actions/upload-artifact@v7
        with:
          name: site-test
```

with:

```yaml
      - name: Build for the e2e shards (no analytics beacon)
        if: needs.verify.outputs.reuse != 'true'
        run: bun run build
      - uses: actions/upload-artifact@v7
        if: needs.verify.outputs.reuse != 'true'
        with:
          name: site-test
```

In the `e2e` job, replace:

```yaml
    # The same sharded suite as CI, against the same commit (built without the beacon).
    name: E2E shard ${{ matrix.shard }}/4
    runs-on: ubuntu-latest
    needs: [resolve, site]
```

with:

```yaml
    # Only without a reusable CI result (or with rerun_e2e): the same sharded suite as CI, against
    # the same commit (built without the beacon).
    name: E2E shard ${{ matrix.shard }}/4
    runs-on: ubuntu-latest
    needs: [resolve, verify, site]
    if: needs.verify.outputs.reuse != 'true'
```

In the `deploy` job, replace:

```yaml
    needs: [resolve, site, e2e]
```

with:

```yaml
    needs: [resolve, verify, site, e2e]
    # After the shards passed, or straight after the build when the CI result was reused (e2e skipped).
    if: ${{ !cancelled() && needs.site.result == 'success' && (needs.e2e.result == 'success' || needs.e2e.result == 'skipped') }}
```

In the `report` job, replace `needs: [resolve, site, e2e, deploy]` with `needs: [resolve, verify, site, e2e, deploy]`.

- [x] **Step 7: Never cancel main CI runs**

In `.github/workflows/ci.yml`, replace:

```yaml
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
```

with:

```yaml
concurrency:
  group: ci-${{ github.ref }}
  # PR runs replace each other; main keeps every run, because deploy.yml reuses the result per commit.
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}
```

- [x] **Step 8: Check the workflow logic and commit**

```bash
rtk grep -n "needs:\|if:" .github/workflows/deploy.yml
bun run typecheck && bun run lint && bun run test tests/unit/ci-status.test.ts
rtk git add scripts/ci-status.ts tests/unit/ci-status.test.ts .github/workflows/deploy.yml .github/workflows/ci.yml
rtk git commit -m "ci: deploy reuses the green CI result for the commit instead of rerunning e2e"
```

Expected: the grep shows `verify` in the `needs` of `site`, `e2e`, `deploy` and `report`, the `reuse != 'true'` guards on the test build, its upload and `e2e`, and the `!cancelled()` guard on `deploy`. Truth table to check by reading: CI green, so verify `reuse=true`, test build skipped, e2e skipped, deploy runs. No CI result, so `reuse=false`, test build and e2e run, deploy after e2e. CI red, so verify fails, site skipped, deploy skipped, report opens the issue. After merge, the owner's next deploy is the end-to-end proof (Task 13 Step 6).

---
### Task 12: Spec amendments, the privacy note and the docs

Spec 06 section 4 gains the beacon and a privacy note (spec gap 4 and 6); spec 08 section 2 makes CI budgets authoritative and lists every gate with where it runs (spec gap 6, 7, 8, 9, 10); the main spec's analytics rows follow; visitors get a one-line EN/ID footer note; AGENTS.md, README.md and docs/deploy.md describe the new lane, jobs, Function and deploy behaviour.

**Files:**
- Modify: `docs/superpowers/specs/agent-hq/06-data-contracts.md` (section 4)
- Modify: `docs/superpowers/specs/agent-hq/08-quality-acceptance.md` (sections 2 and 3)
- Modify: `docs/superpowers/specs/2026-10-09-agent-hq-design.md` (lines 164 and 273)
- Modify: `messages/en.json`, `messages/id.json` (`footer.privacy`)
- Modify: `src/components/SiteFooter.tsx`
- Modify: `e2e/perf-probes.spec.ts` (footer note)
- Modify: `AGENTS.md`, `README.md`, `docs/deploy.md`

**Interfaces:**
- Consumes: every name above (documentation only), `useTranslations` keys.
- Produces: message key `footer.privacy` (EN and ID); `data-testid="footer-privacy"`.

- [x] **Step 1: Write the failing footer check**

Append to `e2e/perf-probes.spec.ts` (add `openPage` and the messages import: `import en from "../messages/en.json";` and `import id from "../messages/id.json";`, plus `openPage` in the `./hq` import):

```ts
test("the footer tells visitors what the performance beacon sends, in both languages", async ({ page }) => {
  await openPage(page, "/en/quick?tier=static");
  await expect(page.getByTestId("footer-privacy")).toHaveText(en.footer.privacy);
  await openPage(page, "/id/quick?tier=static");
  await expect(page.getByTestId("footer-privacy")).toHaveText(id.footer.privacy);
});
```

Run: `bun run build; E2E_PORT=4433 bunx playwright test e2e/perf-probes.spec.ts -g footer`
Expected: FAIL: TypeScript reports `Property 'privacy' does not exist` on `en.footer` (or the locator is not found).

- [x] **Step 2: Add the copy and the footer line**

In `messages/en.json`, replace:

```json
    "built": "The site runs on one validated dataset.",
```

with:

```json
    "built": "The site runs on one validated dataset.",
    "privacy": "Privacy: no tracking cookies or IDs. A sample of 3D visits sends anonymous performance ranges (graphics tier, frame rate, load time), never your IP address or browser details.",
```

In `messages/id.json`, replace:

```json
    "built": "Situs ini berjalan di atas satu dataset yang tervalidasi.",
```

with:

```json
    "built": "Situs ini berjalan di atas satu dataset yang tervalidasi.",
    "privacy": "Privasi: tanpa cookie atau ID pelacak. Sebagian kunjungan 3D mengirim rentang performa anonim (tier grafis, frame rate, waktu muat), tidak pernah alamat IP atau detail browser Anda.",
```

In `src/components/SiteFooter.tsx`, replace:

```tsx
          <ExternalLink href={REPO_URL} className="pv-uline pv-small" srHint={tc("external")}>
            {t("source")}
          </ExternalLink>
        </div>
```

with:

```tsx
          <ExternalLink href={REPO_URL} className="pv-uline pv-small" srHint={tc("external")}>
            {t("source")}
          </ExternalLink>
        </div>
        <p className="pv-small mt-3 max-w-[72ch]" data-testid="footer-privacy">
          {t("privacy")}
        </p>
```

- [x] **Step 3: Run the checks**

```bash
bun run test tests/unit/ui-copy.test.ts tests/content
bun run build
E2E_PORT=4433 bunx playwright test e2e/perf-probes.spec.ts e2e/pageview.spec.ts e2e/static-routes.spec.ts
E2E_PORT=4433 bun run e2e:look
```

Expected: unit tests pass (keys aligned, ASCII only, no em dash); e2e passes; the look check prints `8 passed` (the Page View `#main` column is unchanged; the footer is not compared). Open `screenshots/look/footer-1440.png` and `footer-390.png`: one new small line under the source link, nothing else moved. Attach both images to the PR. The HTML budget headroom of `/en/quick` (12.8 KB) easily absorbs about 0.4 KB of text in HTML plus RSC payload. Rollback: revert the footer commit; the beacon keeps working (the spec note stays the source of truth).

- [x] **Step 4: Amend spec 06 section 4**

In `docs/superpowers/specs/agent-hq/06-data-contracts.md`, replace the whole section:

```markdown
## 4. Analytics

Cloudflare Web Analytics (cookieless). It records page views, including SPA route changes made with the History API, so room and floor URLs act as events. No custom event API or third-party scripts are used.
```

with:

```markdown
## 4. Analytics

Three channels, all Cloudflare or first party, none with cookies, identifiers or a consent banner (amended 2026-10-13, owner approval of the performance beacon):

1. **Cloudflare Web Analytics** (production builds only). It records page views, including SPA route changes made with the History API, so room and floor URLs act as events, plus Core Web Vitals per path.
2. **Ask the HQ events**: Analytics Engine dataset `ask_events`, written by `functions/api/ask.ts` (design: `docs/superpowers/specs/2026-10-11-ask-hq-design.md`).
3. **Performance beacon (RUM)**: 25% of 3D sessions send one data point per browser session with `navigator.sendBeacon` to the same-origin Pages Function `POST /api/rum`, which writes it to the Analytics Engine dataset `perf_events` (binding `PERF_EVENTS`). The CSP is unchanged (`connect-src 'self'`). Contract: `src/lib/rum/protocol.ts`; client: `src/experience/perf/`; Function: `functions/api/rum.ts`.

| Field | Values | Analytics Engine |
|---|---|---|
| `v` | `1` | blob1 |
| `tier` | `full`, `lite` | blob2, index1 |
| `path` | `cover` (game-first boot cover), `enter` (Enter the 3D HQ from the Page View), `deeplink` (a floor or room route) | blob3 |
| `fps50`, `fps10` | median and 10th percentile FPS over up to 600 visible frames from 2 s after explore: `na`, `lt15`, `15-24`, `25-29`, `30-44`, `45-54`, `55+` | blob4, blob5 |
| `explore` | navigation start to the first interactive phase: `na`, `lt3s`, `3-5s`, `5-8s`, `8-12s`, `12-20s`, `20s+` | blob6 |
| `lost` | 1 when the WebGL context was lost | double1 |
| `timeout` | 1 when the 8 s boot timeout revealed the page | double2 |
| count | always 1 | double3 |

The beacon leaves on the first of: tab hidden, page left, 3D view closed (Page View), WebGL context lost. The Function accepts only that exact object (at most 512 bytes, same Origin, `RUM_ENABLED = "true"`), answers 204 and caps points per isolate and minute.

### Privacy note

- No cookies, identifiers, IP address, user agent, renderer string, URL or free text: every field is one of the fixed values above, and the Function reads no other header into the point.
- Sampling is decided once per browser session (`sessionStorage["hq:rum"]`); at most one point per session.
- Never sampled: browser automation (`navigator.webdriver`), Do Not Track, Global Privacy Control, and every visit that never opens the 3D view (Page View, static tier, crawlers). `?rum=0` opts a session out; `?rum=1` forces it (preview checks).
- Retention: Analytics Engine keeps points for 3 months (Cloudflare limit), then drops them.
- Kill switch: `RUM_ENABLED` in `wrangler.toml` (anything but `"true"` drops every point).
- Visitors see the same promise in one footer line (`footer.privacy`, EN and ID).
```

- [x] **Step 5: Make CI budgets authoritative in spec 08**

In `docs/superpowers/specs/agent-hq/08-quality-acceptance.md`, replace section 2 (from `## 2. Performance budgets` up to, not including, `## 3. Test strategy`) with:

```markdown
## 2. Performance budgets

CI budgets are authoritative (owner decision 2026-10-13). Where a CI gate exists, its number is the budget; the "Spec ceiling" column is only the outer limit a CI number may never be raised past. A budget changes only with an owner note in the PR that needs it. The numbers live in `lighthouserc.json` (Page View) and `e2e/budgets.ts` (3D). Only deterministic counters and bytes are gated; time-based 3D numbers are trends or real-device checks, because SwiftShader timing says nothing about a GPU.

| Metric | CI gate (authoritative) | Spec ceiling | Measured by |
|---|---|---|---|
| LCP, Page View (`/en`, `/en/quick`, `/en/journey`, a pod page) | < 2,000 ms (median of 3) | 2.5 s | Lighthouse CI, simulated mobile 4G |
| CLS | < 0.01 | 0.05 | Lighthouse CI |
| TBT | < 200 ms | 300 ms | Lighthouse CI |
| Page View transfer per page | JS 240 KB (245,760 B), CSS 20 KB, fonts 60 KB, HTML 80 KB; warn at 90% | JS 350 KB | Lighthouse CI `resource-summary`; per-chunk diff against main in the job summary |
| 3D JS after the gate (gzip), lite and full | < 450 KB each | 600 KB | `e2e/perf/bytes-3d.spec.ts`: transfer sizes after the 3D gate minus the Page View's scripts; fonts, JSON and CSS reported |
| Scene draw calls per floor, settled, both tiers | < 150; L1 <= 125, RF <= 79 | 150 | `expectRenderBudget`: worst frame over at least 20 frames and 1.2 s |
| Post-processing passes (full tier) | <= 20 | 20 | same, counted apart from scene calls |
| Scene draw calls at peaks: boot plus intro, every elevator ride, hover | < 150 | 150 | `e2e/perf/peaks.spec.ts`, every frame of the window |
| Triangles per frame | < 30,000 | 30,000 | `expectRenderBudget` |
| Shader programs per floor, both tiers | <= baseline + 2 (`e2e/perf/baseline.json`) | none | `e2e/perf/floors.spec.ts` |
| Memory after 10 floor round trips | geometries, textures and programs back to the warmed-up baseline (delta 0); JS heap growth < 2 MB | no growth | `e2e/perf/memory.spec.ts` on `renderer.info` (three.js has no material count) |
| Frame rate | none (not measurable in CI) | >= 55 fps desktop full, >= 30 fps mid-range phone lite | `?perf=1` overlay on real devices before a release; RUM beacon FPS buckets (appendix 06 section 4) |
| Game-first timeline: cover paint, headline, first frame, intro end, first drawer | trend only (nightly artifact) | headline < 1.5 s and first frame < 6 s on the P1 profile | `.github/workflows/perf-nightly.yml` (`e2e/perf/timeline.spec.ts`) |
```

In section 3, replace the row:

```markdown
| Performance | Lighthouse CI | Budgets above on `/en`, `/en/quick`, `/en/labs/{hero}` |
```

with:

```markdown
| Performance | Lighthouse CI; Playwright perf lane (`bun run e2e:perf`, CI job `3D perf gates`); nightly timeline; `?perf=1` and RUM for real devices | Budgets in section 2 on `/en`, `/en/quick`, `/en/journey`, `/en/labs/{hero}` and every 3D floor on both tiers |
```

- [x] **Step 6: Update the main spec's analytics rows**

In `docs/superpowers/specs/2026-10-09-agent-hq-design.md`, replace:

```markdown
| Analytics | Cloudflare Web Analytics (cookieless) |
```

with:

```markdown
| Analytics | Cloudflare Web Analytics (cookieless) plus an anonymous, sampled performance beacon to Analytics Engine `perf_events` (appendix 06 section 4) |
```

and replace:

```markdown
| Analytics | Cloudflare Web Analytics, cookieless, no consent banner |
```

with:

```markdown
| Analytics | Cloudflare Web Analytics, cookieless, no consent banner; anonymous sampled performance beacon (appendix 06 section 4, owner approval 2026-10-13) |
```

- [x] **Step 7: Update AGENTS.md**

Replace:

```
`__hq.rover.drawCalls` and `.triangles` feed `expectRenderBudget` (`e2e/hq.ts`: under 150 calls and 30k triangles per floor).
```

with:

```
`RenderCounter` (`src/experience/perf/`) splits `renderer.info` into scene calls and post passes every frame (`__hq.perf.stats`, peaks since `__hq.perf.resetPeaks()`, plus live programs, geometries and textures); `__hq.rover.drawCalls` and `.triangles` keep the whole-frame totals. `expectRenderBudget` (`e2e/hq.ts`, numbers in `e2e/budgets.ts`) checks the worst frame over at least 20 frames: under 150 scene calls, at most 20 post passes and under 30k triangles per floor.
```

Replace:

```
The Director sums `renderer.info` over every render pass of a frame (the full tier's composer included), and `e2e/highlights.spec.ts` caps L1 at 140 draw calls from the plaza to the hall on both tiers.
```

with:

```
`RenderCounter` counts the full tier's composer passes apart from scene calls, and `e2e/highlights.spec.ts` caps L1 at 125 scene calls (`FLOOR_SCENE_CAPS`) from the plaza to the hall on both tiers.
```

In "Folder layout", add after the `api/ask.ts` line:

```
  api/rum.ts                    anonymous performance beacon (POST /api/rum to Analytics Engine perf_events; _lib/rum.ts)
```

replace the `wrangler.toml` line with:

```
wrangler.toml                   Pages bindings and vars for /api/ask and /api/rum (source of truth once deployed; no secrets)
```

add after the `lib/boot-first.ts` line:

```
  lib/perf-marks.ts             User Timing marks of the game-first timeline (hq:boot-release, hq:first-frame, hq:intro-start, hq:intro-end, hq:explore, hq:first-drawer)
  lib/rum/protocol.ts           RUM beacon wire contract (buckets, parseRumPayload, rumDataPoint), shared with functions/
  experience/perf/              render counters (renderStats, RenderCounter), FrameSampler, the ?perf=1 overlay (lazy), timeline marks, the RUM decision and probe (lazy)
```

add after the `e2e-shard.ts` line:

```
  perf-report.ts, perf-summary.ts  pure summary logic and CLI: per-chunk JS diffs, 3D gate tables, timeline trend, program baseline (no dependencies)
  perf-base.sh                  downloads the newest main artifact as a summary baseline (never fails)
  ci-status.ts                  deploy gate: reuse the green CI result for a commit or its tree
```

and add after the `e2e/` line:

```
e2e/budgets.ts                  every 3D CI threshold (render, bytes, programs, memory)
e2e/perf/                       perf lane (PERF=1, `bun run e2e:perf`, CI job `3D perf gates`): bytes-3d, floors (+ baseline.json), peaks, memory (P3), nightly timeline, local look check
e2e/perf-probes.spec.ts         default suite: ?perf=1 overlay on and off, timeline marks, RUM beacon, footer privacy note
```

Replace the CI bullet (starts `- CI (\`.github/workflows/ci.yml\`) runs check`) with:

```
- CI (`.github/workflows/ci.yml`) runs check and the build in parallel, e2e in 4 shards against that one build, the 3D perf gates in 2 shards (`perf` job: `bun run e2e:perf`, see "Performance gates"), the aggregate required check `Build, CV and e2e` (merged HTML report and the 3D perf summary against the last green main run), a blocking `Lighthouse CI` job (`lighthouserc.json`: LCP 2 s, CLS 0.01, TBT 200 ms and transfer budgets for fonts, HTML, CSS and JS fail the aggregate check; its job summary has the Page View JS per chunk against main; see `docs/deploy.md` section 8 for what keeps LCP low), and a Cloudflare Pages preview (project `vars.CF_PREVIEW_PROJECT`, default `shinyq-hq`) only when `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` exist. Runs on `main` are never cancelled (the deploy reuses them).
```

Replace the Production bullet (starts `- Production (\`.github/workflows/deploy.yml\`)`) with:

```
- Production (`.github/workflows/deploy.yml`) runs only on `workflow_dispatch`: by hand, or from `refresh-facts.yml` after it merges the weekly live-facts PR (`AUTO_DEPLOY_FACTS=false` stops that). A push to `main` never deploys. It reuses CI's green `Build, CV and e2e` for the commit (or for a commit with the same tree; `scripts/ci-status.ts` waits while CI runs and fails the deploy on a red CI), builds, deploys `out/` plus `functions/`, smoke-checks production (`scripts/deploy-smoke.ts`, including `GET /api/rum` = 405) and opens a `deploy-failed` issue on failure. Without a CI result, or with the `rerun_e2e` input, it runs the 4 e2e shards itself first. PR previews are off unless `CF_PREVIEWS=true`. Owner setup: `docs/deploy.md`.
```

Insert a new section right before `## Workflow`:

```markdown
## Performance gates and measurement

- Authoritative budgets: appendix 08 section 2 (CI numbers win; change one only with an owner note in the PR). Page View numbers in `lighthouserc.json`, 3D numbers in `e2e/budgets.ts`.
- Perf lane `e2e/perf/` runs only with `PERF=1`: `bun run e2e:perf` (CI job `3D perf gates`, 2 shards) runs `bytes-3d` (3D JS after the gate under 450 KB gzip per tier), `floors` (every floor and tier: settled scene calls, post passes, triangles, shader programs within `e2e/perf/baseline.json` + 2), `peaks` (boot plus intro, elevator rides through the panel, hover; every frame) and P3's `memory`. Each test writes `perf-report/<id>.json`; `bun scripts/perf-summary.ts gates --head perf-report` prints the tables. Run it when you touch the render path, materials, floor mounting or the 3D chunk's imports.
- After an intended material or precompile change, regenerate the program baseline: `E2E_PORT=<port> bun run e2e:perf e2e/perf/floors.spec.ts`, then `bun scripts/perf-summary.ts baseline --head perf-report --write e2e/perf/baseline.json`, and say why in the PR. `KNOWN_OVER` in `e2e/perf/peaks.spec.ts` lists peaks over budget waiting for a fix (expected failures); remove an id as soon as it passes.
- Look check before and after any render-path change: `E2E_DIR=out-main E2E_PORT=<port> bun run e2e:look --update-snapshots` on a main build in `out-main/`, then `E2E_PORT=<port> bun run e2e:look` on yours (canvas at desktop full 1440x900 and 2560x1440 and phone lite 390x844, at most 0.1% of pixels may differ).
- Never gate time: SwiftShader FPS and timings are noise. Frame rate is checked on real devices with `?perf=1` (FPS p50/p10, frame p95, scene and post calls, GPU objects, tier and renderer, DPR and pixels; a lazy chunk, nothing loads without the flag) and in the field with the RUM beacon. The nightly `perf-nightly.yml` records the game-first timeline (marks in `src/lib/perf-marks.ts`) as a trend.
- RUM beacon (appendix 06 section 4): 25% of 3D sessions, once per browser session, coarse buckets only, `POST /api/rum` to Analytics Engine `perf_events`; never under automation (`?rum=1` forces it in a test or on a preview), never with Do Not Track or GPC. Do not add fields without amending appendix 06 and `src/lib/rum/protocol.ts` together; never send a URL, user agent, renderer string or free text.
```

In "Workflow", in the bullet that starts `- Package manager: Bun. Scripts:`, replace `` `e2e:shard`, `` with `` `e2e:shard`, `e2e:perf` (perf lane), `e2e:timeline` (nightly timeline), `e2e:look` (local look check), ``.

In "Fast verification", after the bullet that starts `- Before every push:`, add:

```
- Also run `E2E_PORT=<port> bun run e2e:perf` (3D bytes, floors, peaks, memory; about 8 to 10 minutes on 2 workers) when you change the render path, materials, floor mounting, the elevator or what the 3D chunk imports. `e2e:changed` never runs the perf lane.
```

In the "Ask the HQ" section, in the bullet that starts `- Bindings and vars live in \`wrangler.toml\`:`, replace `` `ASK_EVENTS` (Analytics Engine `ask_events`), optional `ASK_RL`; `` with `` `ASK_EVENTS` (Analytics Engine `ask_events`), `PERF_EVENTS` (Analytics Engine `perf_events`, the RUM beacon, kill switch `RUM_ENABLED`), optional `ASK_RL`; ``.

- [x] **Step 8: Update README.md**

Replace the CI paragraph (starts `GitHub Actions runs typecheck, lint and unit tests`) with:

```markdown
GitHub Actions runs typecheck, lint and unit tests next to the static build, then the Playwright suite in 4 parallel shards and the 3D perf gates in 2 shards against that build; `Build, CV and e2e` is the aggregate required check (the name predates the CV becoming a committed PDF), `Lighthouse CI` enforces the Page View budgets and the `3D perf gates` job the 3D ones. Both publish per-chunk JS and gate tables against the last green `main` run in the job summary. Screenshots run nightly on `main`, on demand and on PRs labelled `screenshots` (`.github/workflows/screenshots.yml`); the game-first timeline runs nightly as a trend (`.github/workflows/perf-nightly.yml`).
```

Replace the deploy paragraph (starts `Production is the Cloudflare Pages project`) with:

```markdown
Production is the Cloudflare Pages project `kurniadi` at https://kurniadi.pages.dev. `deploy.yml` deploys a commit on `main` when dispatched (Actions > Deploy, or `gh workflow run deploy.yml -f sha=<commit>`) and after each weekly facts merge: it reuses CI's green result for that commit instead of rerunning e2e (it runs the e2e shards only when no CI result exists or with `-f rerun_e2e=true`), builds, deploys with `wrangler pages deploy`, then smoke-checks `/api/ask`, `/api/rum`, `/en` and the analytics beacon, opening a `deploy-failed` issue on any failure. Ordinary merges to `main` do not deploy by themselves. PR previews (project `shinyq-hq`) are off unless `CF_PREVIEWS=true`. Cloudflare Web Analytics runs on production builds only; an anonymous, sampled performance beacon (appendix 06 section 4) writes coarse tier, FPS and load-time buckets to Analytics Engine. Details, secrets, variables and the Cloudflare resource inventory: [`docs/deploy.md`](docs/deploy.md).
```

Replace the budgets paragraph's first sentence `Budgets are enforced in CI (` with `Budgets are enforced in CI and are authoritative over the spec (appendix 08 section 2; ` and leave the rest of that paragraph unchanged.

Replace the 3D paragraph (starts `In 3D every floor stays under 150 draw calls`) with:

```markdown
In 3D every floor stays under 150 scene draw calls (L1 at most 125), at most 20 post-processing passes and 30k triangles, including the peaks of the intro, every elevator ride and hover; shader programs stay at their committed baseline and the JavaScript after the 3D gate stays under 450 KB gzip per tier (`e2e/budgets.ts`, `bun run e2e:perf`). Real-device frame rate is checked with `?perf=1`. Touch devices render fewer pixels (DPR 1.5 on full, 1.25 on lite, no composer MSAA; `renderBudget` in `src/experience/scene/settings.ts`), neighbouring floors mount on idle after the first frames, and the nav grids build in about a millisecond.
```

- [x] **Step 9: Update docs/deploy.md**

Replace the paragraph under the `gh workflow run` block in "Deploy from GitHub Actions (preferred)" (starts `Or Actions > Deploy > Run workflow.`) with:

```markdown
Or Actions > Deploy > Run workflow. `deploy.yml` checks that the commit is on `main`, then `Reuse the CI result` (`scripts/ci-status.ts`) looks for CI's `Build, CV and e2e` check on that commit: green means no e2e rerun; still running means it waits (up to 40 minutes); red fails the deploy. A commit without its own CI run (the weekly facts merge, made with `GITHUB_TOKEN`) reuses a green CI run on a commit with the same tree (the facts PR CI tested). With no CI result at all, or with `-f rerun_e2e=true`, it builds without the beacon and runs the 4 e2e shards first, as before. It builds with `CF_BEACON_TOKEN` for production, rebuilds the Ask knowledge pack in the deploy job, runs `wrangler pages deploy out --branch=main`, then `scripts/deploy-smoke.ts`: `GET /api/ask` must be enabled with the pack date of that commit, `GET /api/rum` must answer 405 (the beacon Function only accepts POST), and `/en` must return 200 with the commit's live contributions number and the beacon. It retries for up to 5 minutes while the production alias switches. Any failure opens (or comments on) the `deploy-failed` issue; production keeps serving the previous deployment.
```

In section 8 (Lighthouse CI), after the `- Reports:` bullet add:

```markdown
- Per-chunk diff: after the run, `scripts/perf-base.sh` downloads `lighthouse-reports` of the last green `main` push run and `bun scripts/perf-summary.ts lhci` writes "Page View JavaScript per chunk" to the job summary: total per page, share of the 240 KB budget (a warning at 90%), and the chunks added or removed against main (names are content hashes, so a changed chunk shows as one removed and one added row). The 3D side (3D JS after the gate, floors, peaks, memory) is in the `Build, CV and e2e` job summary, from the `3D perf gates` job (appendix 08 section 2).
```

In section 11, after the `ask_events` row add:

```markdown
| Analytics Engine | `perf_events` | Anonymous performance beacon, one point per sampled 3D session (created on first write) |
```

Append a new section at the end of the file:

````markdown
## 12. Performance beacon (RUM)

`functions/api/rum.ts` (`POST /api/rum`) writes one point per sampled 3D session (25%, once per browser session) to the Analytics Engine dataset `perf_events` (binding `PERF_EVENTS` in `wrangler.toml`). Fields, buckets and the privacy note: appendix 06 section 4. Kill switch: set `RUM_ENABLED = "false"` in `wrangler.toml` and deploy; the Function then answers 204 and writes nothing.

Check a deploy by hand: open `https://kurniadi.pages.dev/en?rum=1` in a normal browser, enter the tower, wait for explore, switch tabs; a `POST /api/rum` with status 204 appears in DevTools > Network. Points show up in SQL within a few minutes:

```sh
curl -s "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/analytics_engine/sql" \
  -H "Authorization: Bearer $CF_EVAL_TOKEN" \
  --data "SELECT blob2 AS tier, blob4 AS fps50, SUM(_sample_interval) AS points FROM perf_events WHERE timestamp > NOW() - INTERVAL '7' DAY GROUP BY tier, fps50 ORDER BY tier, fps50 FORMAT JSON"
```

Multiply by 4 for an estimate of 3D sessions (25% sampling). Other useful groupings: `blob3` (load path), `blob6` (time to explore), `SUM(double1)` (context losses), `SUM(double2)` (boot timeouts). `CF_EVAL_TOKEN` needs Account Analytics Read, like the Ask content-gap report.
````

- [x] **Step 10: Check and commit**

```bash
python3 -c "import pathlib,sys; files=[p for d in ['docs','src','e2e','scripts','functions','messages','.github'] for p in pathlib.Path(d).rglob('*') if p.is_file() and p.suffix in {'.md','.ts','.tsx','.json','.yml','.sh','.toml'}]+[pathlib.Path(f) for f in ['AGENTS.md','README.md','wrangler.toml']]; bad=[str(p) for p in files if chr(0x2014) in p.read_text(errors='ignore')]; print(bad or 'no em dashes'); sys.exit(1 if bad else 0)"
bun run test tests/content tests/unit
rtk git add docs/superpowers/specs/agent-hq/06-data-contracts.md docs/superpowers/specs/agent-hq/08-quality-acceptance.md docs/superpowers/specs/2026-10-09-agent-hq-design.md messages/en.json messages/id.json src/components/SiteFooter.tsx e2e/perf-probes.spec.ts AGENTS.md README.md docs/deploy.md
rtk git commit -m "docs: CI budgets authoritative (spec 08), RUM beacon and privacy note (spec 06), footer note"
```

Expected: `no em dashes`; tests pass.

---

### Task 13: Verification, before/after numbers and the PR

**Files:**
- No source changes (fix-forward commits only if a check fails).

**Interfaces:**
- Consumes: the whole branch, `out-main/`.
- Produces: a green branch and a PR with measured before/after numbers.

- [x] **Step 1: Fast verification**

```bash
rm -rf .next
bun run verify:quick
E2E_PORT=4433 bun run e2e:changed
```

Expected: `verify:quick` exits 0. `e2e:changed` runs the full suite (this branch changes `e2e/hq.ts`, `playwright.config.ts` and `package.json`) and every test passes.

- [x] **Step 2: The perf lane, both CI shards**

```bash
rm -rf perf-report
E2E_PORT=4433 bun run e2e:perf --shard=1/2 && E2E_PORT=4433 bun run e2e:perf --shard=2/2
bun scripts/perf-summary.ts gates --head perf-report > perf-gates.md
```

Expected: both shards pass (`KNOWN_OVER` scenarios as expected failures). Keep `perf-gates.md` for the PR body, then delete it after pasting.

- [x] **Step 3: Before/after on the same method**

```bash
E2E_DIR=out-main E2E_PORT=4433 PERF_REPORT_DIR=perf-report-main bun run e2e:perf e2e/perf/bytes-3d.spec.ts
bun scripts/perf-summary.ts gates --head perf-report --base perf-report-main | sed -n '/3D JS after the gate/,/Other 3D-path/p'
E2E_DIR=out-main E2E_PORT=4433 bunx playwright test e2e/highlights.spec.ts -g "headroom" --reporter=list 2>&1 | grep "^L1 "
E2E_PORT=4433 bunx playwright test e2e/highlights.spec.ts -g "headroom" --reporter=list 2>&1 | grep "^L1 "
E2E_PORT=4433 bun run e2e:look
rm -rf perf-report-main
```

Expected: 3D JS grows by less than 2 KB per tier against main (render counter, marks, RUM decision; the overlay and the probe are lazy chunks); the main L1 lines show whole-frame totals (`134 calls` full), the branch lines the split (`116 scene calls + 18 post passes`), with equal sums; the look check prints `8 passed`. Also run `bunx @lhci/cli@0.15.1 autorun` once (local Chrome) and compare `/en` script bytes with CI's latest main run: the Page View grows by under 0.3 KB (only `perf-marks.ts` reaches the initial bundle, through `boot-first.ts`).

- [x] **Step 4: Security review**

Dispatch the security-review agent on the branch diff with this focus: `/api/rum` (origin check, size limit, exact-schema parsing, no header reaches the data point, per-isolate cap, kill switch), the client never sends identifiers (`src/lib/rum/protocol.ts`, `RumProbe.tsx`), the CSP is unchanged (`tests/unit/csp.test.ts` untouched), `scripts/ci-status.ts` and `deploy.yml` (a red or missing CI can never deploy without e2e; permissions are read-only), `scripts/perf-base.sh` (no secrets in logs). Fix any finding with a test first.

- [x] **Step 5: Push and open the PR**

```bash
rtk git push -u origin feat/r5-p4-measurement-gates
gh pr create --title "Perf measurement and CI gates: 3D bytes, scene vs post calls, peaks, programs, RUM beacon, deploy reuses CI" --body-file - <<'BODY'
## What

Round 5, workstream P4 (REPORT.md SP2, SP6, SP12, Area 12 and 13, spec gaps 4, 6 to 10).

- 3D bytes gate: JS after the 3D gate on lite and full, fails at 450 KB gzip (spec 600 KB).
- Draw calls split into scene calls and post passes, checked every frame: settled on every floor and both tiers, and at the peaks (boot plus intro, elevator rides, hover). Scene < 150, post passes <= 20, L1 scene <= 125.
- Shader program gate per floor and tier (committed baseline + 2); memory gate helpers and thresholds for P3's round-trip test.
- New CI job `3D perf gates` (2 shards, parallel to e2e); per-chunk JS diffs against main in the Lighthouse and aggregate job summaries.
- `?perf=1` overlay for real devices (FPS p50/p10, frame p95, calls, GPU objects, tier, DPR, pixels), a lazy chunk, nothing loads without the flag.
- Nightly game-first timeline (cold cache, non-webdriver, throttling profiles), trend only.
- Anonymous RUM beacon (owner approved): 25% of 3D sessions, once per session, coarse buckets, no IP or user agent, `POST /api/rum` to Analytics Engine `perf_events`. CSP unchanged. Spec 06 section 4 and a footer privacy line (EN/ID).
- `deploy.yml` reuses CI's green result for the commit (or its tree) instead of rerunning e2e; still smoke-checks production (now also `/api/rum`). Main CI runs are no longer cancelled.
- Spec 08: CI budgets are authoritative.

## Numbers (same method before and after)

Paste: the L1 lines from "Before you start" and Task 13 Step 3; the 3D JS totals main vs branch (lite, full); `perf-gates.md`; the `KNOWN_OVER` ids with their peaks (they flip to hard passes when P2 lands); the Lighthouse `/en` script bytes main vs branch.

## Look

`bun run e2e:look` against a main build: 8 of 8 poses identical (desktop full 1440x900 and 2560x1440, phone lite 390x844, L1 and L3; Page View main column at 1440 and 390). Footer before/after images attached (one new line).

## Owner actions

- Nothing to provision: the `perf_events` dataset is created on the first write after deploy. Kill switch: `RUM_ENABLED` in `wrangler.toml`.
- After merge: run `gh workflow run perf-nightly.yml --ref main` once, and deploy as usual; the deploy log should say "reused CI on this commit".

## Cross-workstream
- P3 uses `readGpuCounters`, `expectNoGpuGrowth`, `readJsHeapAfterGc`, `GPU_MEMORY_BUDGET` and `writePerfEntry({ kind: "memory" })`; its test lives in `e2e/perf/memory.spec.ts`.
- P2: remove `KNOWN_OVER` ids as its peak fixes land; regenerate `e2e/perf/baseline.json` if materials change. P6: regenerate the baseline after precompile.
- P1: put `elementtiming="hq-headline"` on the boot card headline; the nightly timeline then fills the headline column.
BODY
```

Expected: `gh` prints the PR URL. Do not merge; the owner reviews.

- [x] **Step 6: After the owner merges (follow-up, same session or the next)**

```bash
gh workflow run perf-nightly.yml --ref main
gh run watch
gh workflow run deploy.yml --ref main -f reason="r5-p4 merged: first deploy that reuses CI"
gh run watch
```

Expected: the timeline run finishes with a summary table (its own failures never fail the job); the deploy's `Reuse the CI result` job prints `reused CI on this commit (...)`, the four e2e shard jobs show as skipped, the smoke check passes including `/api/rum`, and the deploy wall time is about 3 minutes instead of 6.4. Within an hour of real traffic, the SQL query in `docs/deploy.md` section 12 returns rows.

---

## Self-review

Spec coverage (the task's scope line by line):

| Requirement | Task |
|---|---|
| 3D bytes gate in CI, lite and full transfer after the gate, fail at 450 KB gz, spec 600 KB (SP6) | 4 (`bytes-3d.spec.ts`, `BYTES_3D_BUDGET`, CI `perf` job), 12 (spec 08) |
| Per-chunk JS diff in the job summary | 3 (`renderChunkDiff`, `renderLhci`, `perf-base.sh`), 4 (Lighthouse and aggregate summary steps) |
| `expectRenderBudget` split into scene vs post passes | 2 (`renderStats`, `RenderCounter`, new `expectRenderBudget`, floor caps) |
| Peak sampling during intro, rides and hover; scene < 150, passes <= 20 | 2 (per-frame peaks), 6 (`peaks.spec.ts`, `KNOWN_OVER` ratchet) |
| Shader programs gate | 5 (`floors.spec.ts`, `baseline.json`, `PROGRAM_HEADROOM`) |
| Memory gate shared with P3 (P3 owns fix and test; P4 owns wiring and thresholds; agreed names) | 2 (`readGpuCounters`, `expectNoGpuGrowth`, `readJsHeapAfterGc`, `GPU_MEMORY_BUDGET`), 3 (`writePerfEntry` memory kind, summary table), 4 (CI job runs `e2e/perf/`), contracts table |
| `?perf=1` overlay (FPS p50/p10, frame p95, draw calls, GPU tier, DPR, pixels), zero cost otherwise | 7 (`PerfOverlay` lazy chunk, `perfLines`, `perfOverlayOn`, e2e on and off) |
| Nightly game-first timeline: cold cache, non-webdriver UA, throttling profiles, marks for cover FCP, headline, first frame, intro end, first drawer; trend-only artifacts | 7 (marks), 10 (`timeline.spec.ts`, `perf-nightly.yml`, `renderTimeline`) |
| RUM beacon: anonymous, 25% sampled, coarse fields (tier, FPS buckets, load path, time to explore, context loss, boot timeout), no IP/UA, once per session, `sendBeacon` to `/api/rum`, Analytics Engine `perf_events`, CSP unchanged, `wrangler.toml` binding | 8 (protocol, decision, session, probe), 9 (Function, binding, kill switch, CSP check) |
| Amend spec 06 section 4 and the privacy note | 12 (Steps 1 to 4: spec section, privacy note, footer line EN/ID) |
| `deploy.yml` reuses the green CI result for the same commit, still smoke-checks production | 11 (`ci-status.ts`, `verify` job, fallback shards), 9 (smoke `/api/rum`), 13 Step 6 |
| Spec 08 so CI budgets are authoritative | 12 Step 5 |
| Port 4433 | Global Constraints and every local command |
| Aesthetic unchanged, screenshot-diff steps, rollback notes | 1 (look check), 2, 7, 8, 12 (look reruns), rollback notes in 1, 2, 12 |
| Measure before and after with the same method; numbers in the PR | Before you start, 4 Step 4, 13 Step 3 and the PR body |
| Docs: README, AGENTS.md, spec appendices | 12 |
| Cross-workstream files and rebase notes | Contracts table |

Placeholder scan: every code step has complete code; every command lists its expected output. Values that only a run can produce (byte totals, program counts, `KNOWN_OVER` ids) have a concrete procedure (Task 4 Step 2, Task 5 Steps 2 and 3, Task 6 Step 2) and the expected range from REPORT.md.

Type and name consistency: `renderStats` fields (`sceneCalls`, `postCalls`, `triangles`, `peakSceneCalls`, `peakPostCalls`, `peakTriangles`, `minSceneCalls`, `peakFrames`, `programs`, `geometries`, `textures`, `frames`) are mirrored by `PerfStatsProbe` in `e2e/hq.ts` and read by `PerfOverlay`. `RenderPeaks` (`sceneCalls`, `postCalls`, `triangles`, `minSceneCalls`, `frames`) feeds the `peak` and `floor` `PerfEntry` kinds with the same names. `GpuCounters` and `GpuCountersEntry` have the same three fields. `RENDER_BUDGET.sceneCalls/postCalls/triangles/minSceneCalls`, `FLOOR_SCENE_CAPS`, `BUDGET_WINDOW`, `BYTES_3D_BUDGET.failAt/spec/minExpected`, `PAGE_JS_BUDGET`, `WARN_RATIO`, `PROGRAM_HEADROOM`, `GPU_MEMORY_BUDGET` are defined once in `e2e/budgets.ts`. `PERF_MARKS` keys equal `TIMELINE_MARKS` minus `coverFcp` and `headline`, which the timeline spec adds. `RUM_SESSION_KEY` (`"hq:rum"`) is shared by `rumDecision.ts` and `RumProbe.tsx`; `RumPayload` field names match the spec 06 table and `rumDataPoint` positions match the `wrangler.toml` comment. `entryId` formats (`bytes3d-<tier>`, `floor-<tier>-<floor>`, `peak-<tier>-<scenario>`, `memory-<tier>`, `timeline-<profile>-<scenario>-<run>`) are the only file names `writePerfEntry` writes.

Open risks to watch during execution:
- Per-frame peaks are stricter than the old 5 samples: a transient spike on L1 could exceed 125 scene calls. The plan stops and reports instead of raising the cap (Task 2 Step 10).
- Intro and ride peaks may be over 150 on main until P2 lands; the `KNOWN_OVER` ratchet keeps CI green without hiding them, and P2's rebase must empty it.
- The perf job adds about 8 test-minutes per CI run on SwiftShader; it runs parallel to the e2e shards, with a third shard as the documented fallback (Task 6 Step 4).
- Program counts move with P2 and P6 (precompile, materials); the baseline must be regenerated in their PRs or this gate fails them (by design, with the command in the failure message).
- RUM: the 25% sample of a portfolio's traffic gives wide percentiles; the beacon is unauthenticated, so the dataset can receive valid-looking spam (bounded by the exact schema, 512 bytes and the per-isolate cap; the kill switch stops it).
- Deploy: a red CI on `main` now blocks deploys until fixed or rerun (intended); `rerun_e2e` is the escape hatch, never a bypass of e2e.

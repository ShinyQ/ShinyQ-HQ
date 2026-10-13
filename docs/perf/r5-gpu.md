# Round 5 P2: GPU and rendering measurements

Method: `scripts/perf-gpu.ts` (headed Chrome 155 on a real GPU, `?gfx=monitor-off`), `e2e/gpu.spec.ts` and the Highlights Hall budget log (SwiftShader in CI, deterministic counters), `scripts/visual-gate.ts` (screenshot diffs). Machine: MacBook with Apple M4 (macOS, ANGLE Metal). The machine was shared with other build sessions during these runs (load average 25 to 50), so frame times are vsync-bound and GPU timer values are relative: compare rows taken in the same run.

"Before" is main's rendering (the probe-only commit of this branch, built from the same tree as main). "After" is this branch.

## Summary (before -> after)

| Metric | Before | After | Budget |
|---|---|---|---|
| L1 full scene draw calls at spawn (CI, SwiftShader) | 134 | 109 | < 140 (L1 cap) |
| L1 lite scene draw calls at spawn (CI, SwiftShader) | 115 | 90 | < 140 |
| Intro peak calls, full (real GPU, 4x CPU) | 143 | 118 | < 150 |
| Worst ride peak calls, full (real GPU, 4x CPU) | 187 (ride to L3) | 140 | < 150 |
| Worst ride peak calls, lite 390x844@3 (real GPU, 4x CPU) | 129 | 110 | < 150 |
| New programs on first arrival, worst floor (CI, boot warm-up done) | 2 (RF) | 3 (L4: the composer EffectMaterial variant at ride start plus 2) | <= 3 |
| 1440x900@2 full, GPU ms p50 / p95 (same-build A/B, worst floor) | 22.4 / 25.5 | 14.8 / 16.3 | lower is better |
| 1440x900@2 full, frame p95 ms, worst floor | 17.5 | 17.7 | <= 18 |
| 1440x900@2 full, est. render-target MB | 353 | 104 | < 512 |
| 2560x1440@1 full, frame p95 ms, worst floor | unchanged budget | 17.5 | <= 18 |
| Long tasks > 50 ms during `ride:moving`, full 4x | 0 | 1 (RF) | 0 |

The `ride:moving` long task is one frame on the RF ride in one run; P6's ride clock caps the time a long frame adds, so the dolly pauses instead of skipping. Recorded as measured.

## SP4: full tier pixel cost (real GPU)

### Same build, A/B, 1440x900@2 (`msaa4` is main's composer setting, `current` this branch)

| variant | floor | frameP50 | frameP95 | gpuP50 | gpuP95 | pixelRatio | msaa | bloom | estMB |
|---|---|---|---|---|---|---|---|---|---|
| msaa4 | L1 | 16.7 | 17.5 | 21.3 | 24.1 | 2 | 4 | 8 | 353 |
| msaa4 | L2 | 16.7 | 17.4 | 21.1 | 24.7 | 2 | 4 | 8 | 353 |
| msaa4 | L3 | 16.7 | 17.4 | 21.2 | 24 | 2 | 4 | 8 | 353 |
| msaa4 | L4 | 16.7 | 17.5 | 20.3 | 24 | 2 | 4 | 8 | 353 |
| msaa4 | RF | 16.7 | 17.5 | 22.3 | 25.5 | 2 | 4 | 8 | 353 |
| current | L1 | 16.7 | 17.5 | 14.3 | 15.8 | 2 | 0 | 8 | 104 |
| current | L2 | 16.7 | 17.4 | 14.3 | 16.2 | 2 | 0 | 8 | 104 |
| current | L3 | 16.7 | 17.4 | 14.3 | 16.2 | 2 | 0 | 8 | 104 |
| current | L4 | 16.7 | 17.5 | 14.8 | 16.3 | 2 | 0 | 8 | 104 |
| current | RF | 16.7 | 17.3 | 14 | 16.2 | 2 | 0 | 8 | 104 |
| msaa4 | L1 | 16.7 | 17.4 | 20.7 | 24.1 | 2 | 4 | 8 | 353 |
| msaa4 | L2 | 16.7 | 17.5 | 20 | 22.3 | 2 | 4 | 8 | 353 |
| msaa4 | L3 | 16.7 | 17.4 | 20.6 | 25.5 | 2 | 4 | 8 | 353 |
| msaa4 | L4 | 16.7 | 17.4 | 22.4 | 25.5 | 2 | 4 | 8 | 353 |
| msaa4 | RF | 16.7 | 17.5 | 20.4 | 24.2 | 2 | 4 | 8 | 353 |
| current | L1 | 16.7 | 17.6 | 12.3 | 13.7 | 2 | 0 | 8 | 104 |
| current | L2 | 16.7 | 17.7 | 14.6 | 15.9 | 2 | 0 | 8 | 104 |
| current | L3 | 16.7 | 17.7 | 14.4 | 16.1 | 2 | 0 | 8 | 104 |
| current | L4 | 16.7 | 17.6 | 13 | 14.2 | 2 | 0 | 8 | 104 |
| current | RF | 16.7 | 17.7 | 13.5 | 15.6 | 2 | 0 | 8 | 104 |

### Main's build, 1440x900@2, the other spike variants (main does not report MSAA or bloom)

| variant | floors | frameP95 | gpuP50 | gpuP95 | pixelRatio |
|---|---|---|---|---|---|
| current (MSAA 4) | L1 to RF | 17.3 to 17.5 | 21.3 to 23.9 | 25.1 to 26.3 | 2 |
| msaa0 | L1 to RF | 17.2 to 17.7 | 11.9 to 17.7 | 13.1 to 25 | 2 |
| dpr1.5 | L1 to RF | 17.4 to 17.6 | 18.7 to 22 | 19.7 to 26.3 | 1.5 |
| bloom5 | L1 to RF | 17.3 to 17.6 | 21 to 23.5 | 24.4 to 25.8 | 2 |

MSAA is the lever at DPR 2; bloom levels barely move GPU time, so the safety net lowers them last.

### This branch, 2560x1440@1 (unchanged budget: DPR 1, MSAA 4)

| floor | frameP50 | frameP95 | gpuP50 | gpuP95 | pixelRatio | msaa | bloom | estMB |
|---|---|---|---|---|---|---|---|---|
| L1 | 16.7 | 17.4 | 23.1 | 25.4 | 1 | 4 | 8 | 251 |
| L2 | 16.7 | 17.5 | 21.3 | 24.1 | 1 | 4 | 8 | 251 |
| L3 | 16.7 | 17.2 | 19.2 | 24 | 1 | 4 | 8 | 251 |
| L4 | 16.7 | 17.3 | 22.8 | 24.4 | 1 | 4 | 8 | 251 |
| RF | 16.7 | 17.4 | 23 | 24.3 | 1 | 4 | 8 | 251 |

## SP9: intro, rides and compile hitches (real GPU, 4x CPU)

Peak draw calls cover every render pass; "new programs" are shader programs first seen on that step; tasks are long tasks in ms.

### Full tier, 1440x900@1

| step | before peak | after peak | before new programs | after new programs | before max task | after max task | after tasks > 50 ms | after tasks while moving |
|---|---|---|---|---|---|---|---|---|
| boot | | | | | 366 | 420 | 7 | |
| intro | 143 | 118 | | | 412 | 470 | 5 | |
| ride to L2 | 134 | 109 | 1 | 2 | 171 | 135 | 2 | 0 |
| ride to L3 | 187 | 140 | 1 | 1 | 68 | 70 | 2 | 0 |
| ride to L4 | 108 | 108 | 1 | 3 | 0 | 60 | 1 | 0 |
| ride to RF | 118 | 107 | 3 | 0 | 0 | 78 | 1 | 1 |
| ride to L1 | 147 | 140 | 1 | 0 | 98 | 91 | 1 | 0 |

### Lite tier, 390x844@3

| step | before peak | after peak | before new programs | after new programs | before max task | after max task |
|---|---|---|---|---|---|---|
| boot | | | | | 323 | 417 |
| intro | 121 | 95 | | | 340 | 313 |
| ride to L2 | 82 | 80 | 3 | 0 | 148 | 122 |
| ride to L3 | 129 | 110 | 2 | 1 | 50 | 68 |
| ride to L4 | 84 | 84 | 1 | 4 | 0 | 54 |
| ride to RF | 102 | 80 | 4 | 0 | 0 | 0 |
| ride to L1 | 118 | 106 | 1 | 0 | 102 | 85 |

The script clicks "Boot rover" as soon as it is enabled, before the boot warm-up has finished, so these program counts include floors the warm-up had not reached; the CI gate below waits for it. Decision (plan Task 11 Step 8): the lite boot's longest task rose from 323 to 417 ms with the staged warm-up, over the 200 ms rule, so the staged warm-up runs on the full tier only (`STAGED_WARM_TIERS = ["full"]`); lite floors compile as they mount (P6's `FloorPrep`).

## CI counters (SwiftShader)

| Counter | Before | After |
|---|---|---|
| Peaks (`e2e/gpu.spec.ts`, 1440x900@1 full) | intro 143, L1-L2 132, L2-L1 146, L1-RF 117, RF-L1 122 (local run) | intro 118, L1-L2 114, L2-L1 130, L1-RF 103, RF-L1 141 |
| Programs added on first arrival (after the boot warm-up) | L2 0, L3 1, L4 1, RF 2 | L2 0, L3 0, L4 0, RF 0 before P6/P7 merged; L2 1, L3 0, L4 3, RF 0 on the final rebase (one is the postprocessing EffectMaterial variant created when a ride starts) |
| L1 full at spawn / (20, 15) / (34, 13) / hall | 134 / 132 / 81 / 58 | 109 / 110 / 86 / 58 |
| L1 lite at spawn / (20, 15) / (34, 13) / hall | 115 / 113 / 62 / 40 | 90 / 91 / 67 / 40 |

SwiftShader peaks depend on when neighbouring floors finish mounting, so single rides vary by about 20 calls between runs; every peak stays under 150. At (34, 13) the batched stats ring draws all 5 objects when any tile is on screen (the old tiles were culled one by one), hence 5 more calls there.

## Safety net (real GPU, `?gfx=monitor-on`, 1440x900@2)

6x CPU throttle for 20 s, then none for 60 s:

| Time | Level | Flips | Applied |
|---|---|---|---|
| start | 0 | 0 | DPR 2, MSAA 0, bloom 8 |
| throttled +5 s to +20 s | 1 | 1 | DPR 1.7, MSAA 0, bloom 8 |
| normal +30 s | 1 | 1 | DPR 1.7 |
| normal +40 s to +80 s | 0 | 2 | DPR 2, MSAA 0, bloom 8 |

## Screenshot gate (`scripts/visual-gate.ts`, real GPU, every pose at a fixed frame count)

- Noise floor: base against itself, `strict`, 32 of 32 poses pass.
- Release gate, main against this branch, profile `release`: 32 of 32 poses pass.
- Same comparison under `strict` (per-pixel 0.1, at most 0.1% of pixels): lite 390x844 and full 2560x1440 are identical except the 2560 Lobby (0.14%, the batched stats ring); the full 1440x900@2 poses differ by 0.16% to 0.66%, on thin lines and tile edges only (composer MSAA off at DPR 2).

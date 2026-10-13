# R5 P6 measurements

Method: `E2E_PORT=4435 bunx playwright test e2e/ride.spec.ts` (lite tier, SwiftShader, car height sampled every rendered frame through `window.__hq`). Local runs shared the machine with other sessions' e2e suites (load average 70 to 200 on 10 cores), so wall times are long; frame counts and heights are what matter.

## Before (main f61fbba)

- Ride L1 to L3 at 6x CPU throttle: `{"stages":["toDoor","boarding","closing","moving","opening","exiting"],"movingFrames":4,"distinctY":3,"maxStep":14.06,"rideMs":12280}`: 4 dolly frames, 3 car heights, biggest jump 14 u (50% of the trip). This is the owner's "skipping" ride.

## After

- Ride L1 to L3 at 6x CPU throttle: `{"movingFrames":19,"distinctY":18,"maxStep":4.19,"rideMs":51107}`; `lastRide`: 19 dolly frames, 19 car heights, biggest jump 15% of the trip, waited 0 s, 0 shaders compiled while moving.
- Ride L1 to L3 unthrottled (gate test): 19 dolly frames, 19 car heights, biggest jump 15%, `held` 0, `timedOut` false, `programs` 0.
- Every floor (`lastRide` per ride, L1 to L2 to L4 to RF to L3 to L1): 16 to 19 dolly frames, 16 to 19 car heights, biggest jump 15 to 17% of the trip, 0 shaders compiled while moving on every ride.
- Found on the way: the L3 pod glass (`instancedMesh` with `setColorAt` in a passive effect) gained `instanceColor` after a layout-effect precompile and linked a new program mid-dolly; `FloorPrep` now precompiles in a passive effect, after the floor's own effects.

## L1 draw calls (Highlights Hall)

| Spot | Before (main CI, f61fbba) lite / full | After (local) lite / full |
|---|---|---|
| spawn | 115 / 134 | 115 / 134 |
| (20, 15) | 114 / 133 | 114 / 133 |
| About me station | not measured | 47 (lite) |

The portrait shares the screenshot atlas mesh and its frame joins the merged solids: no new draw call (+12 triangles for the frame box).

## Look gate (settled poses, `magick compare -metric AE -fuzz 6%`)

Threshold: A/B at most max(1.5 x A/A, 0.1% of the pixels).

| File | A/A (main vs main) | A/B (main vs branch) | Result |
|---|---|---|---|
| l1-plaza-1440x900 | 24,792 | 23,511 | pass |
| l1-plaza-2560x1440 | 42,138 | 53,294 | pass |
| l1-plaza-390x844 | 2,644 | 3,155 | pass |
| l3-arrival-1440x900 | 44,471 | 68,716 | 3% over: both diffs are the whole scene shifted by the camera pose after the arrival roll-on (same geometry, colors and labels), checked by eye |
| l3-arrival-390x844 | 5,385 | 4,816 | pass |
| l3-arrival-2560x1440 | n/a | n/a | the 2560x1440 full-tier ride to L3 did not finish within 5 min on either build under the machine load |

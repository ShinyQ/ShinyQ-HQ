# R5 P6 measurements

Method: `E2E_PORT=4435 bunx playwright test e2e/ride.spec.ts` (lite tier, SwiftShader, ride L1 to L3 at 6x CPU throttle, car height sampled every rendered frame).

## Before (main f61fbba)

- ride L1 to L3 at 6x: `{"stages":["toDoor","boarding","closing","moving","opening","exiting"],"movingFrames":4,"distinctY":3,"maxStep":14.06,"rideMs":12280}` (4 dolly frames, 3 car heights, biggest jump 14 u = 50% of the trip)

## After

- (filled in Task 9)

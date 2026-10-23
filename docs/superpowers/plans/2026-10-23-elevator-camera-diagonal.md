# Elevator Camera Diagonal ("Serong Kanan") Plan

Status: in review

**Goal:** going into the elevator and coming out of it, the camera stands behind the rover and 35 degrees to its right,
like the owner's L2 screenshot, on every floor and camera class.

**Owner decisions (2026-10-23):** the settled arrival view itself becomes the diagonal on every floor (supersedes the
2026-10-17 straight-behind arrival); 35 degrees; the way in turns to the diagonal as soon as the ride starts; B1 phones
follow the diagonal too, retuned so a station sign reads whole.

**Architecture:** data-driven through the existing view-zone machinery (approved over a transient additive yaw in
`rigPose` and over a scripted ride camera path).

- `camera/look.ts` (import-free): `ELEVATOR_DIAGONAL`, `ARRIVAL_YAW`, `DEPARTURE_YAW`, `ARRIVAL_RAIL_YAW`,
  `DEPARTURE_RAIL_YAW`; `camera/arrival.ts` re-exports them, uses them in `shaftClearZoom` and turns `shoulderPose` by
  the diagonal (still inside the car).
- Way in: a static view zone `DEPARTURE_VIEW` in `orbit.ts` (empty area), entered with `updateZone` by `CameraDirector`
  on the frame a ride enters `toDoor`; like any zone never under reduced motion or in first person. (A dedicated
  `aimDeparture` was dropped to keep the 3D session total inside its cap.)
- Way out: every arrival zone's yaw (and the L2 rail yaw) is the diagonal; `L3:overview` too.
- `LookOffset.right` (follow and rail rigs): portrait arrivals on L1, L2 and RF and the L3 overview aim sideways so the
  main sight stays in frame; steering and the look-ahead keep the orbit's forward, so the glide hands over without a jump.
- Zooms and aims tuned numerically against the framing tests (`arrivals.test.ts`, `labs-arrival.test.ts`): desktop
  zooms unchanged except L3 (1.3 to 1.4, the boards clear of the profile card and the elevator rail); phones L1 1.03 (aim 4.75, the whole name in frame), L2 0.8 (aim 7), RF 0.88 (aim 4.25), B1 0.8
  (pitch -0.2, one whole sign), L3 aims 5.75 (desktop) and 2.75 (phones).

**Verification:** `bun run verify:quick`; `bun run e2e:changed` (`e2e/arrivals.spec.ts` checks the diagonal on every
floor and the departure yaw through the dolly); the perf lane (ride and arrival peaks); the strict visual gate, where
the ride poses and the arrival-primed settled poses (`l4-library`, `rf-contact`) are expected to change and the rest
stay identical.

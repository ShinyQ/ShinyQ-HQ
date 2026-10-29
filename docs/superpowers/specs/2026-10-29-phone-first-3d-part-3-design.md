# Phone-First 3D, Part 3: Landscape Camera, Floating Stick and Tilt Hint (design)

Status: approved 2026-10-29 (owner decisions 2026-10-28/29, brainstorm, section 3); plan `2026-10-29-phone-first-3d-part-3.md`; implementation in review in #348.

Builds on part 1 (#329; spec `2026-10-25-phone-first-3d-design.md`), part 2 (#346; spec
`2026-10-28-phone-first-3d-part-2-design.md`) and #317 (touch controls). It does not redo them: the bottom boot card,
the L1 portrait landing view, the phone tour, the docked choice card and its step-aside, the top toast, the portrait
reading rule, the touch wording, the lazy menu and picker chunks, no swipe-to-floor and no floor-point driving stay as
they are. B1 gets the new landscape defaults but no tuning (the living machine work, spec
`2026-10-22-b1-living-machine-design.md`, stays on its own branches).

## 1. Problem

Live captures (kurniadi.pages.dev, lite tier, returning visitor, Chromium with touch, 2026-10-29), plus part 2's pure
reading harness (`tests/helpers/phone-camera.ts`) run at more sizes. Label heights are the em box in CSS px from each
label's reading pose:

| # | Size | What a visitor sees |
|---|---|---|
| 1 | 844 x 390, 667 x 375, 932 x 430 | Landscape phones use camera class `tablet`. Titles and names are about half their portrait size: median 5.5 px on L2 (11.7 px portrait), 9.5 on L3 (13.3), 5.6 on L4 (12.4), 6.3 on RF (11.8). Under 10 px at 844 x 390: 50 of 59 on L2, 26 of 38 on L3, 38 of 44 on L4, 9 of 9 on RF |
| 2 | 844 x 390 | The rover is 15 to 23 px tall (24 to 46 px on a portrait phone); on L1 the name hologram is cut by the bottom edge |
| 3 | 844 x 390 | The bottom band (joystick 120 px plus padding) takes 144 of 390 px, 37% of the height; the fixed stick sits on the floor in front of the rover |
| 4 | 390 x 844 | The fixed stick and Boost hold the bottom-left at all times; the stick is drawn even while nobody drives |
| 5 | 390 x 844, 834 x 1194 | Nothing tells a portrait visitor that the tower is built wide: a landscape screen shows a much wider slice of every floor |

Tablets: a portrait tablet (834 x 1194, camera class `mobile`) already reads larger than landscape (L2 16.5 px vs 14.8,
L4 17.5 vs 12.7); landscape shows a wider world. Neither tablet orientation changes in part 3 except the tilt hint.

## 2. Goal and success criteria

A landscape phone is as readable as a portrait one and sees more; on phones the stick appears only where and when a
thumb drives; portrait visitors on touch screens learn once that sideways is wider.

- Landscape reading: every L2, L3, L4 and RF title and name in part 2's list is at least 10 CSS px at 844 x 390 and
  at least 9 px at 667 x 375 from its reading pose, in front of the camera, its middle and the rover inside the
  landscape HUD-free box, facing within 60 degrees. 932 x 430 is reported. L1 at 844 x 390: the rover, the name
  hologram and the stats ring sit inside the HUD-free box from the landing pose.
- Floating stick (phones): a drag that starts in the drive zone drives; a still tap in the drive zone selects a glowing
  target as today; a drag outside it looks; one thumb can drive while the other looks.
- Tilt hint: shows once per device after the tour's closing line on a portrait touch screen (phone or tablet); a tap or
  a rotation clears it; it never shows on a fine pointer, in landscape, or again after it was shown.
- Unchanged: desktop, tablet and portrait phone camera poses (strict visual gate), tablet and desktop controls.
- Bytes: the 3D first frame and both session totals go down or stay equal against main; no existing cap rises; Classic
  CSS stays under 20,480 B.
- Every route still works without WebGL.

## 3. Decisions (owner, 2026-10-28/29)

| # | Question | Decision |
|---|---|---|
| 3.1 | How the landscape phone camera works | A new camera class for landscape phones, held to the same reading rule as portrait (10 px at 844 x 390, 9 px at 667 x 375), with a closer follow distance tuned per floor; it still sees a wider strip than portrait |
| 3.2 | What "joystick on demand" means | Floating stick: at rest a faint ring shows where the stick sits; a touch anywhere in the lower-left drive zone spawns the stick under the thumb and a drag drives; a still tap there still selects a target; one-finger look stays on the rest of the screen. Phones only (portrait and landscape); tablets keep the fixed stick |
| 3.3 | New gestures | None: part 3's gesture work is the floating stick split (the drive zone drives, the rest looks) |
| 3.4 | Where Boost lives on phones | Bottom-right, stacked above Reset view; the floating stick's double tap still toggles it; the whole lower-left is drive zone |
| 3.5 | Drive zone size | Portrait: the left half of the bottom 40%. Landscape: the left 40% of the width, below the floor chip row |
| 3.6 | Tilt hint form and timing | A Rover line in the part 2 top toast, right after the tour's closing line in the first session (and on Replay tutorial), portrait coarse screens only; it clears on rotate or tap and never shows again (localStorage). Strings ride in the tour chunk (no main-path bytes); visitors who already finished the tour do not see it |
| 3.7 | Tablets | The hint shows on portrait tablets too: it promises a wider view, which is true, not bigger text |
| 3.8 | Paying for bytes | Trims first, then another eager HUD piece moves into its own lazy chunk with a new small cap outside the session totals (the menu and picker precedent); the plan names it after measuring; any new cap goes to the parent session for a yes before merge |
| 3.9 | Hint wording | EN "Tip: turn your screen sideways for a wider view of the tower." / ID "Tips: putar layar ke posisi mendatar supaya tampilan menara lebih luas." |

## 4. Design

### 4.1 Landscape camera class

Files: `src/lib/viewport.ts`, `src/experience/types.ts`, `src/experience/camera/{rigs,intro,firstPerson,offset,orbit,arrival}.ts`,
`src/experience/camera/CameraDirector.tsx`, `src/store` (`device.camera` type), zone views in `src/experience/config.ts`
and the floor layouts (only where the gate needs them), `src/experience/sky/dayNight.ts` (sky azimuth table).

- `CameraClass = ViewportClass | "landscape"` in `types.ts`. `ViewportClass` (the HUD's classes) does not change.
  `cameraClass(w, h)` returns `landscape` for `isLandscapePhone(w, h)` (w > h, h < 500); every other screen keeps its
  class. `device.camera` becomes `CameraClass`.
- Every per-class camera table becomes `Record<CameraClass, ...>` and gains a `landscape` row: `FOLLOW`,
  `FOLLOW_LOOK_AHEAD`, `RAIL`, `HOLOGRAM_RIG`, `FIRST_PERSON_FOV`, `CLASS_ASPECT` (19.5 / 9), the intro's `WAKE`,
  `PULL`, `PEAK`, `PLAZA_ORBIT` and land values, the pitch ranges and the sky azimuth. The compiler lists every table, so
  none is missed. Starting values: the tablet row with the follow offset and rail distance pulled in until the median
  label reaches portrait size; the plan tunes them with the harness.
- `ViewZone.classView` and `primeView` accept `landscape`. No fallback chain: a zone without a landscape view uses the
  rig defaults, as a zone without a tablet view does today. Landscape views are added only where the defaults miss the
  gate: the L1 landing (`OBSERVATORY_VIEW`, so the name hologram clears the bottom edge), arrival views and L2 rail
  zones, as the harness reports.
- A rotation inside a zone re-applies the new class's view through `reclassZone` (no new code path); the
  `camera-look-offset` tests gain a portrait to landscape case.
- B1 uses the landscape defaults with no landscape zone views; `tests/unit` B1 sign rule stays as it is.

### 4.2 Floating stick (phones)

Files: `src/experience/input/joystick.ts`, `src/experience/input/useInputSources.ts`, a new pure
`src/experience/input/driveZone.ts`, `src/hud/Joystick.tsx`, `src/hud/Hud.tsx`, `src/hud/ViewControls.tsx` (Reset view
column), docs `3d-experience.md` (Input), `hud-and-drawer.md` (Corners HUD).

- Policy (HUD): `stick.enabled` in `input/joystick.ts`, set by `Hud` to phone layout, coarse pointer, an explorable
  phase, and not stepped aside for a docked line. Tablets and desktops keep `Joystick` as today.
- Zone (pure): `driveZone(w, h)` returns the rect: portrait, `x < w / 2` and `y > 0.6 h`; landscape, `x < 0.4 w` and
  `y >` the bottom of the floor chip row (the chip's top inset plus its 46 px height plus the safe area). Touches on HUD
  controls never reach the world element, so the zone never steals a button.
- Gesture (world input): in `useInputSources`, a touch `pointerdown` inside the zone while `stick.enabled` and no
  stick pointer is held becomes the stick pointer, remembered with its down point. It is never part of the pinch and
  twist pair and never emits `orbit` or `scrub`. Past `TAP_SLOP_PX` (12 px) it drives through `setJoystick`, with the
  stick centered on the down point (60 px radius, `applyDeadZone`); the release sets `setJoystick(0, 0, false)`. A
  still, quick release drives nothing; point-and-go's `isDragClick` already ignores moved presses, so a still tap
  selects a target exactly as today. The double tap (`DOUBLE_TAP_MS`, `TAP_MAX_MS`, event timestamps) toggles Boost
  through the shared `useBoostToggle` state, as the fixed stick does.
- Twin thumbs: with a stick pointer held, a second finger outside the zone is the single look pointer (one-finger
  drag rules); two non-stick fingers pinch and twist as today.
- Drawing (HUD): a small `FloatingStick` component (in `Joystick.tsx`) subscribes to the stick runtime and draws the
  base and knob under the thumb while driving (the existing glass and cyan knob classes, positioned with inline
  transforms), and a faint resting ring at the fixed stick's spot otherwise (no pulse; `aria-hidden`; `data-testid`
  `joystick` with `data-floating`). Docking a Rover line releases a held stick (existing `aside` effect).
- Boost on phones: `BoostButton` moves to the bottom band's right column, stacked above Reset view. The phone control
  count stays 6 (`e2e/hud-corners.spec.ts`).
- Copy: the phone tour's `movedPhone` line and the phone Controls card row (`hud.hintCoarse` on phones) name the drive
  zone ("drag on the lower left to drive" style; EN and ID), in their existing lazy chunks. Tablet and desktop copy is
  unchanged.
- CSS: no new utility classes where an existing one or an inline style works; the Classic CSS size is checked.

### 4.3 Tilt hint

Files: `src/hud/dialog/onboarding.ts` (the tour chunk), `src/hud/dialog/OnboardingLayer.tsx` (deps only if needed),
`messages/en.json` and `messages/id.json` (`onboarding.tilt`), docs `hud-and-drawer.md` (Onboarding, storage keys).

- After the tour's closing line resolves (both variants, full 8-step tablet tour and the 6-step phone tour, and Replay
  tutorial), `runOnboarding` says one more line, key `tilt`, when: a coarse pointer, `matchMedia("(orientation:
  portrait)")` matches, and `localStorage["hq:tilt-hint"]` is not set. It sets the key when the line shows.
- The line has no choices, so it uses the part 2 top toast on phones and the raised toast on tablets. It ends on a tap,
  on the toast hold, or on an orientation change (a `change` listener on the portrait query, removed when the line
  ends). Skipping or cancelling the tour skips the hint too (it never shows to a visitor who dismissed the tour).
- No orientation lock and no overlay: iOS Safari cannot lock, and the hint must never block.
- Strings: EN "Tip: turn your screen sideways for a wider view of the tower." / ID "Tips: putar layar ke posisi
  mendatar supaya tampilan menara lebih luas." In the tour's copy keys (`COPY_KEYS`), so they load with the tour chunk.
- Phones show the hint only because 4.1 passes the same reading rule as portrait at 844 x 390 and sees a wider strip;
  the PR reports portrait and landscape numbers side by side. If the landscape gate cannot pass, the phone condition
  is dropped and tablets keep the hint.

### 4.4 Amended in implementation

- Landscape rig: the tablet direction and FOV at 0.7 of the follow distance and 0.66 of the rail distance, plus a rig
  `lift` of 2 u (the look target raised, scaled by the zoom), so tall signs stay under the chip row of a short frame.
- Phone type sizes apply on both phone classes (`phoneCamera(cls)`): the camera alone could not reach 10 px on L2 and L4
  without cutting signs at the top. Desktop and tablet sizes are unchanged.
- Landscape zone views: the L1 kiosk (`landingLandscape`: the desktop's turn, zoom 3, pitch -0.1, look offset forward -2,
  up -2), the L1 office (the tablet frame: zoom 1.5 / 0.7 and a held look offset up -2 that takes the lift back), the L2
  time console, the L3 ops room and Tech Reactor, the L4 headlines and Topic Constellation, the RF comms and CV stops.
- The L2 repo skyline sign needed a higher rail aim than the near-row award placings allow, so `ViewZone.only` (a zone for
  some camera classes; `zoneAt` takes the class) adds a landscape-only `L2:skyline` view, and the rail honours a zone's
  `lookOffset.up` (`railPose(..., lookUp)`; no existing L2 zone sets one).
- A zone zoom above the hand-zoom range (the kiosk's 3) made the first pinch jump to 1.5: `zoomBy` never jumps a hand zoom
  past where it starts (zooming in from there is smooth, zooming out holds).
- The stick gesture and drawing state live in one pure module, `src/experience/input/floatingStick.ts` (not
  `driveZone.ts` plus `joystick.ts`); the drawn stick uses client coordinates.
- The floating stick's double tap toggles Boost only when its first tap selected no target, so point-and-go's tap-tap
  still drives to a target in the zone.
- The tilt string lives in `dialog.onboarding` (the tour's message keys, read only by the tour chunk); the tour chunk
  imports no values, so `OnboardingLayer` passes the store's `cancelDialog` in (`OnboardingDeps.cancel`). Only a phone's
  toast moves on by itself after the hold; a tablet's raised line waits for a tap.

- Bytes (section 5): trims could not pay the main-path growth, so the touch controls (`Joystick.tsx` with the stick
  gesture, `floatingStick.ts`) became a lazy chunk on coarse pointers (`touchChunk.ts`, `BYTES_3D_BUDGET.touch`), with the
  world input reading a handler slot (`stickInput` in `input/joystick.ts`) the chunk fills through `bindTouch`.

## 5. Bytes

- Main path grows by the landscape rows, the zone views, `driveZone`, the stick gesture and `FloatingStick`; it
  shrinks by nothing yet. Order: measure, trim (shared helpers, table compaction), then, if the first frame or a
  session total is still above main, move one eager HUD piece into its own lazy chunk with a cap of measured + 614 B
  outside the session totals (the menu and picker precedent; the plan names the piece). Any new cap is relayed to the
  parent session for a yes before merge. No existing cap rises.
- The tour chunk grows by the hint; its cap (`BYTES_3D_BUDGET.tour`) is re-set to measured + 614 B (outside both
  session totals; reported in the PR and the decision file).
- Classic CSS stays under 20,480 B (`lighthouserc.json`); the Classic pages do not import the 3D HUD.

## 6. Testing

- Unit: `cameraClass` (landscape phones, unchanged elsewhere); every camera table has a landscape row; the reading
  harness (`tests/unit/phone-reading.test.ts`) at 844 x 390 (10 px) and 667 x 375 (9 px) with a landscape HUD-free box,
  932 x 430 printed; L1 landing at 844 x 390; desktop, tablet and portrait poses pinned (no change); `driveZone`; the
  stick gesture (drive past slop, still tap ignored, double tap boost, stick finger out of pinch, twin-thumb look,
  disabled while aside); tilt hint conditions (coarse, portrait, key unset, skipped tour).
- HUD (Vitest): `FloatingStick` resting ring and live stick; Boost in the right column on phones; tablets keep the fixed
  stick.
- E2E (Playwright, touch): at 390 x 844 and 844 x 390, a drag in the zone moves the rover, a tap on a target in the zone
  selects it (the Go chip shows), a drag outside the zone turns the view, a docked line disables the zone; Boost sits
  bottom-right; at 390 x 844 and 834 x 1194 the hint follows the closing line once, a tap clears it, a viewport change to
  landscape clears it, a reload never shows it again; never with a fine pointer or in landscape.
- `bun run verify:quick`, `bun run e2e:changed`, the perf lane (camera and input on the render path), the strict visual
  gate (desktop, tablet and portrait phone poses unchanged).

## 7. Docs

`docs/agents/3d-experience.md` (camera classes, Input), `docs/agents/hud-and-drawer.md` (Corners HUD, Onboarding,
storage keys), `docs/agents/floors.md` (point-and-go touch note), `docs/agents/performance.md` (tour cap, any new cap),
`docs/features.md` (status log), decision file `docs/decisions/2026-10-29-phone-first-3d-part-3.md`.

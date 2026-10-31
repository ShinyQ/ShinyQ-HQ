# Phone-First 3D, Part 3 Implementation Plan

Status: shipped in #348 (faa2555), 2026-10-29

**Goal:** A landscape phone reads as well as a portrait one and sees more; on phones the stick appears only where and
when a thumb drives; portrait touch visitors learn once that sideways is wider. The 3D first frame and both session
totals go down or stay equal.

**Architecture:** Spec `docs/superpowers/specs/2026-10-29-phone-first-3d-part-3-design.md` (approved 2026-10-29). A new
camera class `landscape` for landscape phones with a row in every camera table, tuned with part 2's pure reading
harness; a floating stick whose gesture lives in the world input (`useInputSources`) and whose drawing lives in the HUD,
joined by a tiny stick runtime in `input/joystick.ts`; a tilt line appended to the tour in the tour chunk.

**Tech Stack:** Next.js 16 static export, React 19, react-three-fiber, zustand, next-intl, Tailwind 4.3, Vitest,
Playwright, Bun.

## Global Constraints

- No em dashes (U+2014) anywhere.
- Every new string is in both `messages/en.json` and `messages/id.json`, in a client namespace the tour chunk already reads.
- Desktop, tablet and portrait phone camera poses stay identical (pinned in the reading test, the strict visual gate).
- B1: new landscape defaults only, no B1 files touched.
- First frame and both session totals: measured delta at most 0 against main; no existing cap rises except the tour
  chunk's own cap (measured + 614 B, outside the session totals). Any new lazy chunk cap needs a yes relayed by the
  parent session.
- Classic CSS stays under 20,480 B: prefer inline styles over new utility classes for the stick.

## Tasks

1. Docs: this plan, the spec and the decision file `docs/decisions/2026-10-29-phone-first-3d-part-3.md`.
2. Camera class: `CameraClass = ViewportClass | "landscape"` in `src/experience/types.ts`; `cameraClass()` in
   `src/lib/viewport.ts` returns `landscape` for landscape phones; `device.camera` typed `CameraClass`; a `landscape`
   row in every camera table (`rigs.ts`, `intro.ts`, `firstPerson.ts`, `offset.ts`, `orbit.ts` zone views, sky
   azimuth). Tests: `tests/unit/viewport.test.ts` (or the existing camera class test).
3. Reading harness: `tests/unit/phone-reading.test.ts` and `tests/helpers/phone-camera.ts` measure 844 x 390 (10 px)
   and 667 x 375 (9 px) against a landscape HUD-free box, print 932 x 430, and keep the portrait gates.
4. Tune: landscape rig values first; landscape zone views only where the harness still fails (L1 landing at 844 x 390,
   arrivals, L2 rail zones); a portrait to landscape rotation case in `tests/unit/camera-look-offset.test.ts`.
5. Drive zone and stick runtime: pure `src/experience/input/driveZone.ts`; `stick` runtime in `input/joystick.ts`
   (`enabled`, origin, knob, subscribe). Tests: `tests/unit/drive-zone.test.ts`.
6. Stick gesture: `useInputSources` routes a touch that starts in the zone to the stick (slop, radius 60, dead zone,
   double tap boost by event time), keeps it out of pinch and twist, lets a second finger look. Pure helper
   `stickStep` covered by unit tests.
7. Stick HUD: `FloatingStick` in `src/hud/Joystick.tsx`, phones only from `Hud.tsx`; Boost in the right column above
   Reset view; `stick.enabled` policy (phone, coarse, explorable, not aside). Tests: `tests/hud/Joystick.test.tsx`.
8. Copy: phone `movedPhone` and the phone Controls row, EN and ID.
9. Tilt hint: `runOnboarding` says `tilt` after the closing line (coarse, portrait, `hq:tilt-hint` unset; a tap, the
   hold or an orientation change ends it). Tests: `tests/unit/onboarding.test.ts`.
10. E2E: `e2e/phone-first.spec.ts` (390 x 844, 844 x 390, 834 x 1194 touch) and fixes to specs that drive with the fixed
    stick on phones.
11. Bytes: `e2e/perf/bytes-3d.spec.ts` against a main build; trims; the tour cap re-set.
12. Docs: `3d-experience.md`, `hud-and-drawer.md`, `floors.md`, `performance.md`, `docs/features.md`.
13. Verify: `bun run verify:quick`, `bun run e2e:changed`, the perf lane, the strict visual gate, captures.

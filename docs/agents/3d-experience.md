# 3D experience

How the 3D tower mounts, boots and runs: gate and tiers, boot and intro, boost, data flow, elevator ride, elevator arrival, camera, frame loop, render budget, crash recovery, quality, precompile, batched text, ride cull, day and night, store and `window.__hq`.
Floor content lives in [floors.md](floors.md) and the per-floor files.

Index: [AGENTS.md](../../AGENTS.md).

## Gate and tiers

- `ExperienceGate({ data, startFloor?, startRoom? })` (client) runs on these routes; pages get `data` from `experienceDataFor(locale)` (`src/experience/gate-data.ts`).

  | Route | Prop |
  |---|---|
  | `/{locale}` | none |
  | `/{locale}/journey` | `startFloor="L2"` |
  | `/{locale}/journey/[slug]` | `startRoom="L2:slug"` |
  | `/{locale}/labs` | `startFloor="L3"` |
  | `/{locale}/labs/[slug]` | `startRoom="L3:slug"` |
  | `/{locale}/library` | `startFloor="L4"` |
  | `/{locale}/contact` | `startFloor="RF"` |

- A start floor or room places the rover at the room's door (or the floor spawn) and opens the drawer once this session has seen the intro.
  - Otherwise the intro plays first and the rover continues there (see [Boot and intro](#boot-and-intro)).
  - `?view=architecture` opens the hologram.
- Tier: decided once per page load (`src/lib/gpu-tier.ts`, `?tier=full|lite|static` override), after commit and never during render.
  - Reason: the WebGL probe takes seconds on software renderers and would block client navigation into gated routes.
- It then lazy-loads `src/experience/Experience.tsx` with `next/dynamic` and portals it over the page.
- While it is open, `#site-shell` (header, main, footer in the locale layout) is `inert`. The HTML stays in the DOM for SEO and is the static tier.
- The tier probe lives in `src/experience/gate-tier.ts` (`useGateTier()`), shared by the gate and the landing's "Enter the 3D HQ" button.
- The effective tier is the probe's tier adjusted by the graphics quality preference (`hq:quality`: `auto`, `full`, `lite`; `useQualityTier`, `applyQualityPref` in `src/lib/gpu-tier.ts`).
  - A `?tier=` override and a static device (no WebGL2, Save-Data, a software renderer) always win over the preference.
  - A change re-keys the canvas (`mount:tier`) and applies at once; `qualityRemount.ts` (`isQualityRemount`, `markCanvasReplaced`) makes `Experience` keep the rover, floor, phase and open room instead of re-resuming.

## Game-first load

### Head script

- An inline head script (`bootFirstScript()` from `src/lib/boot-first.ts`, in the locale layout) sets `html[data-hq-boot]` before first paint on gated routes when all of these hold:
  - WebGL2 exists.
  - `?tier=static` is absent.
  - The decided view is 3D: an explicit `?view=` (`classic` and `page` are Classic, `3d` and `architecture` are 3D), then this tab (`sessionStorage["hq:view"]`), then the remembered preference (`localStorage["hq:view"]`), then 3D. See [page-view.md](page-view.md#shareable-links).
  - Save-Data is off.
  - The visitor is not bot-like: `isBotLike(navigator, search)` matches crawler, preview and audit user agents, or `navigator.webdriver` without a `?tier=lite|full` override, which covers Lighthouse 12. The gate uses the same check and stays on the page, so these never load the 3D chunk.
  - This session has not already probed static (`sessionStorage["hq:probe"]`, written by the gate; `?tier=lite|full` overrides it).
- It always pins the decided view into `sessionStorage["hq:view"]` and rewrites the URL in place: Classic shows `?view=classic` (`?view=page` is normalized, other parameters kept), 3D drops `view=classic|page|3d` and keeps `view=architecture`.
- CSS then hides `#site-shell` behind the SSR `BootCover` (`src/components/BootCover.tsx`).
- Keep the route regex in `shouldBootFirst` in sync with the routes that mount `ExperienceGate`.
- Its sha256 lands in the page's script policy through `scripts/csp-hashes.ts` (see the CSP rules in [ask.md](ask.md)).

### Boot card

- The boot card names the owner at first paint: name, headline, motto and current role from content (`BootWho`, the role line from `roleLine` in `@/content/selectors`).
- It carries a small "Classic site" link (`hud.pageView`, with the HUD's `PageViewIcon`):
  - A real `?view=classic` link (works before hydration): the head script decides Classic from the explicit parameter and keeps it in the URL.
  - `ExperienceGate` handles it without a reload once hydrated (`data-hq-page-link`).
  - It leaves the 3D view; it does not skip the boot or the intro.
- `BootOverlay` renders the same `BootCard`, so the handoff does not move.

### Releasing the cover

- The gate preloads the 3D chunk and calls `releaseBootCover("ready" | "page" | "static")`: first canvas frame via `Experience`'s `onFirstFrame`, page view, or static tier.
- An 8 s timeout reveals the page if nothing does.
- Right after first paint the script probes WebGL once (`window.__hqProbe`, reused by `readTierInputs`, so there is no second context) and releases the cover at once without WebGL2 or on a software renderer.

### Quiet boot

- `#site-shell` also stays `visibility: hidden` while `html[data-hq]` is set (tower open), so the page never paints under it and never becomes a late LCP.
- Both states also set `content-visibility: hidden`, so the hidden page's lazy images and link prefetches never start.
- Header, nav, crumb and hero links use `QuietLink` (`prefetch={false}` while hidden).
- The Glass Drawer data loads after the first frame on idle (`afterFirstFrameIdle` in `src/experience/boot-signals.ts`) or at once when a room opens.

### Flags on every page

The same script sets these on every page before first paint:

| Attribute | Source | Effect |
|---|---|---|
| `html[data-motion]` | `storedMotion` from the persisted store | see "Motion setting" in [hud-and-drawer.md](hud-and-drawer.md) |
| `html[data-hq-3d]` | `canOffer3D`: WebGL2, no Save-Data, not bot-like, no `?tier=static` | the landing shows "Enter the 3D HQ" only then, so it never appears late |
| `html[data-hq-still]` | `ambientStill`: `navigator.webdriver` (covers Playwright and Lighthouse 12) or a crawler; `?ambient=on` opts out | the landing holds its still frame |

- Reason for `data-hq-still`: on CI's software compositor (SwiftShader) the infinite hero and ticker animations queue seconds of GPU work that stall the page's main thread and the next browser call, even after navigating away (13 s at 1999x1129). This was the root of several flaky e2e tests.

## Boot and intro

- The boot overlay and the intro play in full on the first 3D load of every browser session, on any route (`/{locale}`, floor and room deep links, a language switch that starts a new session) (owner decision).
- `Experience` writes `sessionStorage["hq:intro"] = "seen"` when the intro hands over to explore (`src/lib/intro-session.ts`).
- Later 3D loads in the same session open straight in: the Lobby in explore, deep links on their floor or room.
- Deep link during the first load:
  - The rover waits in the Lobby, and after the intro it continues as an ad hoc mission (`intro:continue`: elevator, drive, open; `introTarget`, `continuationSteps` and the pending slot in `src/experience/introContinue.ts`), so manual input cancels it like any mission.
  - The URL keeps the deep link during the intro; `?view=architecture` opens the hologram on arrival.
  - The first-session tour runs in its short form once the rover has arrived and the drawer is closed.
- Nothing skips the boot:
  - No Skip button; Esc does nothing in `boot`.
  - Mission steps wait for the intro (`afterIntro` in `host3d.ts`).
  - Boot rover only starts once the log has typed out (`aria-disabled` until then, same pace with reduced motion).
- The intro: Rover wakes up, then a reveal orbit (owner design). The timeline is pure (`camera/intro.ts`, `INTRO`); the shared frame state is `introRuntime` (`intro/runtime.ts`), written by `CameraDirector` and read by the floor shaders and the Lobby parts.
  - The boot holds the wake pose under every motion setting: a still, dark close-up of Rover (`introPose(plan, 0)`, per camera class `WAKE`), its face screen off (`introRuntime.face`), turned to the orbit's start, nothing revealed.
  - Boot rover starts `INTRO.duration` (6.6 s): the face boots (`introFace`: off until 0.35 s, a boot screen until 0.8 s) during a slow push-in over `INTRO.wake` (1.1 s), and Rover turns to its spawn heading between 1.3 and 2.6 s (`introHeading`).
  - Reveal ring: from `INTRO.revealStart` (0.55 s) a ring spreads from Rover (`revealRadius`, out to `INTRO.revealReach` 80 u) until `INTRO.revealEnd` (3.0 s), when the reveal turns off (Infinity). The grid and the lanes mask themselves with the shared `revealUniforms`, the Lobby landmarks switch on as the ring reaches them ([Intro reveal and beacons](floor-l1-lobby.md#intro-reveal-and-beacons)), and the fog rides the ring (`introFog`) so everything past it fades into the night, reaching the follow range before the ring turns off.
  - Orbit: after the wake the camera pulls back to a high point (`PULL`, `PEAK` per camera class) and sweeps 270 degrees (`INTRO.sweep`) while it descends, around Rover on desktop and around the plaza (the hologram, `plan.focus`) on tablets and phones, so the stats ring stays centred in a portrait frame and the skills wall is only seen from the front; the angular speed ramps up, holds and eases to rest (`orbitProgress`). The radius waits (`plan.hold`) until the path clears the elevator shaft. The plan (`introPlan`) is rebuilt every boot frame (the end pose follows a resize) and frozen from the first intro frame.
  - Beacons: as the orbit passes the middle of the view, the landmarks `stats`, `skills`, `hall`, `observatory` and `elevator` pulse once and their ids go into `introRuntime.lit`.
  - Handoff: the orbit's end pose is the primed follow pose (yaw, zoom, look-ahead, offset scale), and the path's end error is blended in with the orbit, so the intro lands exactly on it with no jump; `phase` becomes `explore` and the runtime resets (`active` false, `reveal` Infinity, `lit` emptied). The phase leaving the intro any other way (the static tier, `recover`) resets it too.
  - The slabs above the rover are ghosts from the first boot frame (`tower/FloorLevel.tsx`) and only L1's detail draws in the boot and intro (`tower/visibility.ts`).
  - Landing beat: when the intro hands over, the rover hops, blinks (`roverRuntime.blinkUntil`) and beeps (silent with the sound off).
  - Skip: drive, turn, zoom, reset view or Esc input during `intro` (the intents `move`, `orbit`, `zoom`, `view`, `cancel`; `skipsIntro`) ends it on the next frame: a cut to the follow pose under a veil (`IntroVeil`, the scene background color in front of the camera) that starts at 1 and fades out over `INTRO.skipFade` (0.3 s); `introRuntime.skipped` is true. The boot ignores that input. A drive key or joystick held as the intro ends onto a deep-link continuation neither drives nor cancels it until released for one frame (`holdSkipDrive`, Director); a later drive input cancels it as usual.
- Reduced motion (stored Motion Reduced, or System with the OS reduce): no camera motion. Boot rover cuts to the follow pose with everything revealed under a veil that clears over `INTRO.reduced` (0.9 s), then `explore`. A new visitor with the OS reduce alone and no stored choice gets Full, so the intro animates ([Motion setting](hud-and-drawer.md#motion-setting)).
- Probe: `__hq.intro` is `introRuntime`: `{ active, t, reveal, heading, face, veil, lit, skipped }`.
- Intro chunk: the intro-only code (`camera/intro.ts`, `IntroBeacons`, `IntroVeil`, `intro/beacons.ts`, `intro/landmarks.ts`, entry `intro/scene.ts`) is an on-demand chunk that only a session playing the intro (`!introSeen()`) downloads; a returning visitor never does.
  - `ExperienceGate` starts `loadIntro()` (`intro/chunk.ts`, one shared promise) alongside the 3D chunk, and `Experience` mounts nothing until it settled, so `CameraDirector`, the Lobby and the scene read it synchronously (`introModule()`) through the boot and the intro.
  - A failed load skips the intro: `Experience` marks it seen and the session starts like a returning visitor's, never a boot that cannot end.
  - Main-path code imports only types from the chunk (`tests/unit/intro-chunk-graph.test.ts`); `intro/runtime.ts`, `intro/IntroReveal.tsx` and `intro/chunk.ts` stay on the main path.
- Crawlers, Lighthouse and the static tier never load the 3D chunk.
- E2E: `asReturningVisitor` sets the flag, so `enterHQ` and `enterFloorRoute` land in explore (`enterHQ` also waits for `waitForSceneLive`); tests of the boot itself open without it.

## Rover idle

After 15 s without input (`IDLE.delay`) the rover plays a short scripted sequence (look around, blink, a hop or a spin, one beep), waits 8 to 14 s and plays another.

- `rover/idle.ts` (pure): `stepIdle` runs the sequences, `idleEligible` gates them (exploring, no mission, ride, beam or picker, not driving, parked, third person, no Ask face). Phases `room` (the drawer), `hologram`, `elevator`, `autopilot`, `boot`, `intro` and `static` are not `explore`, so nothing plays then. The terminal, the command palette, the settings panel, the menu sheet, the map overview and the Ask dock keep `phase` `explore` (only the Ask face is gated), so the idle can play behind them.
- `rover/activity.ts`: `activity.seq` counts input (`watchActivity` on the document plus every intent); any change restarts the wait.
- `Rover.tsx` draws it: the head parts sit in a pivot group (look yaw), the body spin goes on `body.rotation.y`, `blink` and `hop` reuse the blink timer and `hopUntil`, `beep` plays through `audio`. Raw yaw and spin are drawn as is; at 0 they decay out in about 0.15 s (the spin first wrapped to the nearest turn), so input stops it at once without a visible unwind. No extra meshes, materials or programs.
- Reduced motion plays only the blinks. A spin and a look never run under it.
- Probes on `roverRuntime`: `idle` (the step playing, null when not idling), `idleYaw`, `idleSpin` (as drawn) and `idleDelay` (infinite by default under `navigator.webdriver`, so Playwright runs and captures never catch an idle hop; the capture scripts that hide webdriver (`scripts/sky-shots.ts`, `scripts/capture-dev.ts`) set it to infinite themselves; e2e specs that use `asHumanBrowser` run with the normal delay; the idle spec sets it to 1).
- E2E: `e2e/rover-idle.spec.ts`.

## Boost

- Input: hold Shift, or double-tap the joystick on coarse pointers (`Joystick boost`, `useBoostToggle` in `src/hud/boost.ts`, `setBoost` in `input/joystick.ts`).
  - A double tap is a short first tap (released within 250 ms, moved under 12 px), then a pointer down within 300 ms of its release (`DOUBLE_TAP_MS`); each double tap toggles. There is no Boost button: the joystick's double tap is the only touch control.
  - A floor change, a ride start and unmount reset it; never persisted.
- Effect: 2x top speed and acceleration (`BOOST`, `boostOn`, `boostTuning`, `stepBoostLevel` in `rover/boost.ts`, pure).
- Manual driving only: the autopilot (missions, the elevator approach, point-and-go drives) keeps its speed.
- `RoverController.step` splits each frame so no sub-step travels more than `MAX_STEP_DISTANCE` (0.4 u, `physicsSteps`), so fast or slow frames never tunnel.

### Boost feel

Trails, squat and lean, camera kick, streaks and sparks (owner decision):

- `fx/BoostFx.tsx` (mounted by `Rover`) draws, one draw call each:
  - twin path-following trails (`fx/boostTrail.ts`: ring buffer of rear-wheel samples, camera-facing ribbons);
  - clip-space speed streaks (`fx/streaks.ts`);
  - pooled wheel sparks (`fx/sparks.ts`).
- They are invisible below `BOOST.trailMin` (0 draw calls when not boosting).
- Their programs compile and pin once at mount, hidden, through `precompileObject` (`scene/precompile.ts`, into the scene pass target).
- `rover/bodyDynamics.ts` (critically damped springs) squats, dips and leans the body.
- `camera/boostView.ts` widens the FOV and pulls the follow distance back before the collision clamp.
- Tier and reduced-motion gating: `fx/boostConfig.ts` (`boostFxConfig`: lite is shorter and fainter, reduced motion turns everything off).
- Probes: `roverRuntime.boost` (eased level), `trail`, `streaks`, `sparks`, `boostFx` (boost meshes drawn), `boostPitch`, `boostRoll`, `boostFov`, `boostPull`.
- E2E: `e2e/boost.spec.ts`.

## Data flow

### ExperienceData

- The 3D chunk gets its content as a serializable `ExperienceData` prop from the server page, so it never bundles `site-content.json` or zod.
- Add floor data there (L4 and RF: `library` and `roof` from `src/content/experience-floors.ts`), not by importing `@/content/load` in client code.
- `skills` carries every skill group in the wall order (`wallSkillGroups`, `SKILLS_WALL_ORDER` in `@/content/selectors`); the skills drawer, Page View and Ask list the same eight in dataset order.
  - `skills[].logos` holds the tech logo per item.
  - The L1 skills wall draws them as one merged quad mesh over a runtime canvas atlas (`floors/lobby/LogoQuads.tsx`, pure layout in `logoAtlas.ts`), one draw call in total.

### Intents and the Director

- Input sources (`input/useInputSources.ts`, HUD buttons, joystick, the point-and-go layer) emit intents on the `intents` bus.
- A click on the floor emits nothing (there is no `goto` intent; see "Point-and-go" in [floors.md](floors.md)).
- `scene/Director.tsx` consumes intents each frame and drives the elevator ride machine (`tower/elevator.ts`), the `RoverController` (`rover/controller.ts`, `nav/navgrid.ts`, `nav/collision.ts`) and the store.
- Per-frame pose lives in `rover/runtime.ts` (mutated in `useFrame`, never read in render).
- HUD and scene talk only through the store and intents.

### Store writes

Per-frame state lives in runtime objects; the store changes only on a real change:

- `setRover` ignores a patch within `POSE_EPSILON` of the mirror.
- The ride and the beam are written when a stage starts, the rover jumps or the motion ends.
  - Live progress: `rideNow`/`beamNow` from `tower/rideClock.ts`, `__hq.motion()` in tests.
  - `store.ride.t` is the stage start.
- `persist` writes `localStorage` only when `visited`, `firstVisit`, `locale` or `motion` change (`skipUnchanged`, `src/store/persist-storage.ts`).

## Elevator ride

- Ride clock: adds at most `rideCap(typical frame)` per frame (`RIDE_CAP` 1/30 s at 60 fps up to 1/20 s on steadily slow devices, `tower/elevator.ts`), so a long frame pauses a ride instead of skipping the dolly.
- `CameraDirector` caps its spring at `RIDE_CAP.max` during rides.
- Floor precompile: every floor precompiles its programs when its content commits.
  - `FloorPrep` in `tower/Tower.tsx` calls `precompileFloor` from `scene/precompile.ts` on the content group that `FloorLevel` registers in `tower/floorRegistry.ts`.
  - It compiles into the render target the scene pass uses, so full-tier programs match the composer.
- Troika syncs are counted per floor (`tower/textSync.ts`, installed by `text-config.ts`).
- `advanceRide` holds the car at closed doors (end of `closing`, or at the door under reduced motion) until `destinationReady(to)` (`tower/ridePrep.ts`) or `PREPARE_TIMEOUT` (1.5 s).
- A floor below the car that is still compiling stays hidden until the car moves (`floorContentVisible`, `tower/near.ts`).
- Ride stats: the Director measures each ride (`tower/rideStats.ts`): `window.__hq.ridePrep.lastRide`, and with `?perf=1` one `[hq ride]` console line per ride.
- Tests: `e2e/ride.spec.ts` (6x CPU throttle, reduced-motion cut, no compile while moving; it samples the live ride through `__hq.motion()`).

## Elevator arrival

Every floor arrives like L3 (owner decision, Round 8 J): the rover leaves the car heading east and the camera ends behind it, looking east. The one exception is the B1 phone arrival (the only class view that sets a `pitch`), which turns the camera to the north side of the rover so two station signs read whole ([B1](floor-b1-engine-room.md#layout)). Pure math in `camera/arrival.ts`; floor points and zones in [floors.md](floors.md#arrival).

- The Director rolls every elevator arrival on from the shaft to `FloorLayout.arrival` (the autopilot drive, `roverRuntime.autopilot`, carries `arrival: true`); a queued mission drive still replaces it.
- Glide (`CameraDirector`, lifecycle in the pure `stepGlide`): it starts when the ride's stage becomes `opening`, not under reduced motion.
  - It primes the destination's arrival zone (`primeZone`) and draws from `shoulderPose` (`ARRIVAL_GLIDE.start`: low behind the rover, inside the car, looking east) to the destination rig's settled pose (`rigPose`: follow, or the L2 rail), eased by `glideProgress` over `ARRIVAL_GLIDE.duration` (1.5 s).
  - The start pose pitches down by half the vertical FOV plus `belowHorizon` (4 degrees), so the top edge of the view stays below the horizon over the whole glide (the far floor stays out of the frustum; the ride peaks stay in budget).
  - The pose is snapped (no spring) and skips the collision clamp.
  - It uses the destination's rig and fog range from its first frame, so nothing pops when the ride ends.
  - After `ARRIVAL_GLIDE.duration` it holds at full progress (still snapped to the rover at the settled view, `arrivalGlide` stays 1) until the arrival roll-on ends, then hands over to the follow spring with the rover parked, so the camera never lags a rover at autopilot speed.
  - It ends at once on an `orbit`, `zoom` or `view` intent, held Q/E/R/F, drive input (`roverRuntime.steering`), a beam, a new ride, or a phase other than explore or elevator. The normal camera then eases on from the drawn pose.
- Zone hold: no `updateZone` runs while the glide runs or the arrival roll-on drives (`autopilot.arrival`), so the camera parks in the primed zone. Steering releases the hold; a scrub or a point-and-go drive replaces the roll-on (`roverRuntime.autopilot = null`), which releases it too.
- Away from L2, priming the arrival view also returns a rail yaw left over from an L2 zone to the nearest side view.
- Reduced motion: no glide. The Director teleports the rover to the arrival point heading east and sets `cameraSnap`; the camera primes the arrival zone on the frame the ride ends.
- Floor deep links to L3, L4 and RF spawn the rover on the arrival point heading east (`ARRIVAL_HEADING`, `place` in `Experience.tsx`).
  - On L4 and RF the first-frame prime pass primes the `arrivalOnly` zone under the rover, so the first frame shows the arrival view.
  - L3's arrival view `L3:overview` is an ordinary zone: it is not primed and eases in like any zone the rover is in (never under reduced motion).
- Zones: `ViewZone.arrivalOnly` and `ViewZone.railYaw` (see [Orbit](#orbit)). Zooms are capped per camera class by `shaftClearZoom`, so the camera stays east of the shaft (`SHAFT_CLEAR_X`); a turned class view (B1 phones) keeps its camera east of `SHAFT_CLEAR_X` too.
- A zone's `classView` may set `yaw`, `zoom` and `pitch` (an offset from the rig's elevation) for one camera class. Defining a `pitch` opts the class view into the turn-back: `OrbitState.zoneTurn` keeps the zone's yaw, and leaving the zone eases back to it with a level pitch, unless the visitor turned or tilted by hand meanwhile (`rotate` with a yaw or pitch change, `rotateStep` and `resetView` clear it). Any rotate or tilt clears the turn-back. A class view without `pitch` (the L1 kiosk on tablets and phones, the zoom-only views) leaves the yaw and the pitch untouched on exit; the zoom still eases back to 1 as on any zone exit.
- Probes on `roverRuntime`: `arrivalGlide` (0 to 1, -1 when not gliding), `cameraBehind` (heading of the vector from the camera to the rover) and `steering`.
- Tests: `tests/unit/arrivals.test.ts` (per floor: the arrival point and its east-facing zone, the free roll-on path, the settled camera behind the rover and clear of the shaft at four sizes, the deep-link spawns), `arrival-glide.test.ts` (`shoulderPose`, the top view edge below the horizon over the glide for every camera class, `glideProgress`, `glidePose`, the `stepGlide` lifecycle (start, progress, the hold while rolling on, each end, none under reduced motion), `cameraBehindHeading`, `railYawBehind`, `shaftClearZoom` and rail-aware zone priming and easing in `orbit.ts`), `orbit-arrival-only.test.ts` (`activeZone`: an `arrivalOnly` zone counts only once primed); `e2e/arrivals.spec.ts` (one desktop tour through the elevator panel: camera behind the rover within 0.1 rad of east, the rover heading east, the panel's `aria-current`, the floor announcer and the floor's route on every floor; glide cancel on input, reduced-motion cut); `scripts/arrival-shots.ts` captures the arrivals at four sizes.

## Pure modules

- Config, elevator, rigs, orbit, camera collision, first person, movement, faces, navgrid, collision, intents, url-sync, gpu-tier and viewport must stay free of React and three side effects, so Vitest can run them in node.
- `rover/fade.ts` only touches the three objects it is given.

## Disposal

- A geometry, texture or material built in `useMemo` and passed as a prop or in `args` must be disposed: call `useDispose(value)` (`src/experience/fx/useDispose.ts`) right after the `useMemo`. R3F disposes only what it creates from JSX.
- Shared resources that outlive a canvas (the glass material cache, troika's glyph atlas, three's DFG lookup table) collect a `dispose` listener of every renderer that draws them, so the canvas releases them on unmount (`releaseSharedResources` in `src/experience/scene/sharedResources.ts`).
  - Otherwise each Page View toggle would keep the old renderer alive.
- Guards:
  - `tests/unit/three-disposal.test.ts` fails on a memoized geometry or texture that is never disposed.
  - `e2e/memory.spec.ts` checks that 10 Lobby to Roof round trips and 5 Page View toggles keep `renderer.info` geometries, textures and programs at their baseline (`__hq.memory()`) with under 2 MB of JS heap growth.

## Camera

### Orbit

- `camera/orbit.ts` holds the orbit state (owner decision):
  - Unbounded yaw on every floor; L2 has its own yaw so it opens on its side view.
  - Pitch from just above the floor to near top-down: `PITCH_LIMITS` [0.06, 1.45] rad in `camera/rigs.ts`, applied per rig through `pitchRange(cls, rig)`.
  - Zoom 0.6 to 1.5.
  - Eased steps, reset, wall auto-face via `VIEW_ZONES`.
  - A `ViewZone.travel` direction limits a zone to a rover facing within 90 degrees of it; `zoneAt` takes the heading.
  - `ViewZone.railYaw` (L2 rail rig only) turns the rail like `yaw` turns the follow camera; leaving such a zone eases the rail back to the side view, unless the visitor turned it by hand.
  - `ViewZone.arrivalOnly` zones are active only once an arrival or a floor deep-link spawn primed them (`activeZone`): driving into one later does nothing.
- Add a floor's view zones there.
- `orbit` intents carry a `source`, so a floor can filter (for example L2 scrubbing on one-finger drags; `scrubSign` flips a scrub when the L2 view faces the other way).
- Controls per device: appendix 03 section 2 ([03-rover-camera-input.md](../superpowers/specs/agent-hq/03-rover-camera-input.md)).

### Collision

- A low third-person camera stays above the floor, on the slab and out of obstacle columns: `clampCamera` (`camera/collision.ts`) pulls it in along the view ray.
- A follow camera never looks off the slab into the void under it (Round 9 M): with the view's FOV, `clampCamera` also counts a camera off the slab as blocked while its bottom-center ray lands outside the bounds (`viewOnSlab`), at any height. The L2 rail view stands beside its narrow road by design and passes no FOV.
- The clamp runs on the wanted pose and again on the smoothed (drawn) pose, so the spring never cuts through a wall or past the slab edge for a frame. A blocked stretch next to the rover (the look-ahead ray crossing the L1 kiosk) is skipped, not taken as "nothing to clamp".
- The near planes never reach the floor: `CAMERA_NEAR / cos(fov / 2)` stays under `CAMERA_CLEARANCE.ground` (unit test).
- Cameras above `CAMERA_CLEARANCE.obstacle` (3.2 u) are never touched, except near taller columns a floor lists in `FloorLayout.tall` (rects with a height `h`: the 9.6 u L3 directory boards and the 11 u reactor core), so the default views do not change.
- Add every new tall piece to `FloorLayout.tall`.
- `cameraWorld(layout, floorY)` builds the camera's world: the floor's obstacles, bounds and tall columns plus the glass elevator shaft (`SHAFT_COLUMN`, a floor high), so a low camera never ends up inside the shaft.

### Wheel zoom and first person

- Zoom input: the mouse wheel, trackpad scroll and pinch, a two-finger pinch and `+`/`-` emit `zoom` (`classifyWheel`, `wheelZoomFactor` in `input/intents.ts`) (owner decision).
- The wheel never changes floors; PageUp/PageDown, the elevator panel, call pads and the vertical touch swipe do.
- Entering first person: zooming in past the closest distance (`FIRST_PERSON.enterPush`) glides into the rover's eyes in 0.45 s; a cut under reduced motion.

  | `camera/firstPerson.ts` | Value |
  |---|---|
  | eye | 1.55 u |
  | FOV | 65/70/80 |
  | look | -60 to +31 degrees |
  | near / far | 0.1 / 72 |
  | fog | 14 to 64 u |

- Leaving: zooming out (`exitPush`), `0`/Home or the reset button.
- `CameraDirector` keeps smoothing the third-person pose and mixes it toward the eye by `orbit.blend`, so blend 0 is exactly the third-person camera.
- The body fades with hashed alpha (`rover/fade.ts`: `alphaHash` set at mount, so no recompiles, no sorting change, about 4 extra shader programs once) and hides; rover clicks pass through to targets in front.
- `viewSuspended` holds third person during autopilot drives (`roverRuntime.driving` from the Director: missions, point-and-go, scrubs, arrival roll-ons), rides, beams, missions, rooms, the hologram, the boot and the intro; first person returns afterwards.
- R/F tilt.
- Probes: `__hq.rover.cameraMode`, `cameraBlend`, `cameraZoom`, `cameraLook`, `cameraElevation`, `cameraRailYaw`, `driving`.
- E2E: `e2e/camera.spec.ts` (including the low camera sweep: L1, L3 and L4 at the lowest tilt, turned all the way around, the drawn view on the slab and no flat void band in the canvas' bottom rows). The opt-in `e2e/camera-visual.spec.ts` (`CAMERA_SHOTS=baseline|compare`) proves third-person poses still match (at most 0.5% of pixels off by more than 24/255).

### Readable signs

- With the camera turning all the way around, in-world text must never read mirrored.
- Wrap a sign in `<Readable position pivot? yaw?>` (`fx/Readable.tsx`, pure side test `readableFlip` in `fx/readableFlip.ts` with hysteresis).
  - It turns its children half a turn around `pivot` when the camera is behind them and leaves them untouched from the front, so default views keep their pixels.
  - A function child gets `flipped` for direction marks (the L2 signpost arrow).
- Every L2 text uses it: room labels, placings, arch digits and signposts, the prologue, Workshop wall and benches.
- `HoloIcon` line icons do the same in their vertex shader on every floor.
- In first person the ghost floors above fade out with the glide and hide (`ceilingOpacity`, `tower/FloorLevel.tsx`), so no slab hangs over the rover's eyes.
- Probes: `__hq.probes.flippedSigns`, `__hq.probes.ghosts` (`fx/probes.ts`).

## Frame loop

- The canvas runs `frameloop="never"`. `FrameLoop` (`scene/FrameLoop.tsx`) calls R3F `advance` from its own rAF loop through `framePacer` (`scene/framePacer.ts`).
  - At most 60 fps (`FRAME_CAP_FPS`): 90, 120 and 144 Hz displays skip refreshes, 60 Hz displays render every one, no idle cap.
- Animate with `useFrame` deltas; never start another rAF loop or rely on `invalidate` in the scene.
- `__hq.frames()` counts rendered frames; `__hq.clock()` is the R3F clock in seconds (the `useFrame` time, 0 on a new canvas, frozen while paused).
- `__hq.audio()` is a read-only audio probe (`floor`, `ambience`, `muted`, `played`: one-shot request counts); see [Audio](ci-and-deploy.md#audio).
- A runtime quality monitor must take 60 fps as the ceiling and restart its sample window across a pause: `scene/frameMonitor.ts` treats a gap above `pauseMs` (a paused loop, a hidden tab) as a pause.

### Pausing when covered

- Rendering pauses while an opaque panel marked `data-hq-cover` hides more than 90% of the canvas (`scene/cover.ts`, `scene/coverWatch.ts`).
  - Pauses: the full-screen phone palette and modals, the drawer sheet at its 92% snap and the lightbox.
  - Keeps animating: the desktop side drawer, the 55% sheet and desktop overlays.
- Mark any new opaque full-screen panel with `data-hq-cover`.
- The rumble drops to 0 on pause.

## Floor mounting and render budget

### Floor order and the secret floor

- `FLOOR_IDS` (`src/experience/config.ts`) lists every floor bottom up, B1 first: `["B1", "L1", "L2", "L3", "L4", "RF"]`.
  - `floorY(id)` is `(floorIndex(id) - floorIndex("L1")) * FLOOR_GAP`, so L1 stays at y 0, every public floor keeps its height and B1 sits one gap below (y -14); ride time by index distance stays correct.
  - `PUBLIC_FLOORS` (`src/lib/floors.ts`, L1 to RF) is the list visitors tour: visit tracking, floor lines, missions, OG stills, picker thumbnails and the build dashboard never include B1.
  - `towerFloors(b1Unlocked)` is what the tower draws and the elevator serves (`PUBLIC_FLOORS`, plus B1 once unlocked); `shaftSpan(floors)` sizes the glass shaft (the old box while locked) and `ElevatorShaft` draws a stop label per drawn floor.
- The store's `b1Unlocked` gates the floor: a visitor unlocks it by reaching all five public floors (`markFloorSeen`, persisted), `unlockB1()` is the session-only dev and test flag `?unlock=b1` (in production with `debug`; never persisted, never starts the unlock moment). Details: [B1 access](floor-b1-engine-room.md#access). The elevator, deep links (`/{locale}#B1` through `startFloor`) and a language-switch resume go through `canEnterFloor` (`src/experience/b1.ts`).
- Locked sessions load no B1 chunk and no B1 drawer data, and mount no B1 DOM or scene objects. The bay titles (`ExperienceData.engine`, about 0.4 KB) ride in the page data and the B1 UI strings in the 3D-only `engine` namespace.
- Below the Lobby there is no sky: while `underground(roverRuntime.y)` (y below `UNDERGROUND_BELOW`, -0.5) `SkyController` hides the sky group and holds night (probe `__hq.sky.underground`, see "Day and night").

### What mounts and draws

- Floors above the rover render as ghosts each frame, the boot and the intro included (`tower/FloorLevel.tsx`), because the follow camera sits higher than `FLOOR_GAP`.
- Only the current floor, the ride target and their neighbours mount content (`nearFloors` in `tower/near.ts`). The neighbours mount on idle after the first frames, so a deep link builds one floor first.
- Content of floors below the rover is not drawn unless the elevator is moving (the opaque slab above hides it). Once the car is parked at the target (`opening`, `exiting`) the floors below hide again (`belowParkedCar` in `tower/near.ts`): the arrival glide starts low in the car, where the ride cull cannot prove them hidden.
- Content visibility is one pure rule (`tower/visibility.ts`):
  - the boot and intro show the Lobby's detail only;
  - a ride shows its target floor and floors within one floor gap under the car;
  - so intro and ride peaks stay under 150 calls (`e2e/gpu.spec.ts`).

### Pixel budget

`renderBudget(tier, coarse, screen)` in `scene/settings.ts`:

| Case | Budget |
|---|---|
| Desktop full | DPR up to 2 within an 8.3 MP total-pixel budget, so 5K and 4K-at-2x canvases get a lower DPR |
| Composer MSAA | 4, only below DPR 1.5, because Retina screens antialias on their own |
| Touch devices | DPR 1.5 on full and 1.25 on lite, without MSAA |
| Bloom | keeps 8 MIP levels |
| Canvas | never multisamples |

- `?gfx=dpr1.5,msaa0,bloom5,monitor-on|off` overrides it for measurements.
- `?gfx=probe` mounts the black-frame probe (`scene/BlackFrameProbe.tsx`, a lazy chunk, never loaded otherwise; see [Shader math](#shader-math)).

### Counting

- `RenderCounter` (`src/experience/perf/`) splits `renderer.info` into scene calls and post passes every frame (`__hq.perf.stats`, peaks since `__hq.perf.resetPeaks()`, plus live programs, geometries and textures).
- `__hq.rover.drawCalls`, `.triangles` and `__hq.render.peakCalls` keep the whole-frame totals (the Director feeds `renderProbe` from it).
- `expectRenderBudget` (`e2e/hq.ts`, numbers in `e2e/budgets.ts`) checks the worst frame over at least 20 frames: under 150 scene calls, at most 20 post passes and under 30k triangles per floor. More gates: [performance.md](performance.md).

## Crash recovery

- `CanvasBoundary` (around the R3F canvas, which rethrows creation and render errors) and the `webglcontextlost` listener call `onCrash`.
- `ExperienceGate` remounts the 3D view once on a fresh canvas, after the tab is visible again (`whenVisible`).
- A second failure sets the static tier and shows the notice with a "Retry 3D" button (`hud.retry3d`, `data-testid="retry-3d"`).
  - `recovery.ts`: `afterFailure`, `manualRetry`, `settled`; store `recover(tier)`.
- A failed manual retry goes straight back to the notice, so nothing loops.
- Page View exits lose the context on purpose and are ignored (the canvas is disconnected).

## Quality safety net

- `scene/QualityController.tsx` runs a pure frame monitor (`scene/frameMonitor.ts`) over a look-preserving ladder (`scene/quality.ts`).
- Monitor rules:
  - 2 s windows.
  - Steps down after 2 slow windows whose median and mean frame time are above 20 ms on full or 36 ms on lite.
  - Steps back up after 10 smooth windows (mean within a 60 fps frame).
  - 60 fps is the ceiling, so a high-refresh display paced to 60 fps never reads as slow.
  - A long gap (paused loop, hidden tab) restarts the windows.
  - At most 2 changes per 60 s; a relapse within 30 s locks the level.
- Ladder: DPR 85%, DPR 70%, composer MSAA off, bloom 2 levels lighter. Bloom levels follow the DPR so the glow keeps its on-screen size.
- It holds during boot, intro, rides and the L2 beam.
- It is off under `navigator.webdriver` (CI, Lighthouse) unless `?gfx=monitor-on`.
- It applies MSAA and bloom levels on the existing composer (no rebuild) and publishes the DPR to the `Canvas`.
- Level per session: `sessionStorage["hq:gfx"]`.
- Test handle: `__hq.quality` (`snapshot()`, `simulate(ms)`).

## Shader math

- One NaN pixel blacks out the whole full-tier frame: the composer's HDR input feeds the mipmap bloom, whose downsample spreads the pixel into every mip and whose upsample spreads it back over the screen, and ACES turns NaN into black. On lite (no bloom) the same NaN is a single black pixel.
- GLSL `pow(x, y)` is undefined for `x < 0` and returns NaN on Apple GPUs. Give every `pow()` a base that is non-negative by construction: `max(..., 0.)`, `clamp`, `abs`, a positive literal, or `x * x` for a square. `tests/unit/shader-pow.test.ts` scans `src` and fails otherwise.
  - Root cause of the L1 black flicker (2026-10-18): the glass fresnel `pow(1.-abs(dot(n, v)), 2.2)` in `fx/materials.ts`. Seen almost head-on, rounding puts `abs(dot)` a hair above 1; a low orbit on L1 lines the lobby and shaft glass up with the camera for single frames.
- Also guard `normalize` of a vector that can be zero, `asin` and `acos` (clamp to [-1, 1]), `sqrt` and `log` of values that can go negative.
- `?gfx=probe` checks this on a visitor's device. After every final draw it reads 5 canvas pixels; on an all-black frame it logs (`console.warn("[hq probe] black frame", ...)`, kept in `__hq.probe`) the floor, phase, camera, quality and canvas size, and on full scans the composer input for NaN and Inf and bisects the scene by visibility to name the object that writes the pixel. The quality monitor stays off with it unless `monitor-on`.

## Shader precompile

- `precompileObject`, `precompileFloor`, `precompileScene` in `scene/precompile.ts`:
  - compile a subtree for the target it is drawn into (composer input on full, canvas on lite);
  - wait without blocking where `KHR_parallel_shader_compile` exists;
  - pin new programs (`scene/programPins.ts`: never-rendered clones, so three keeps the program after the floor unmounts).
- `ProgramWarmup` compiles the scene after the first frame.
  - During boot only and on the full tier, it mounts each other floor hidden (`warmingFloor`, `nearFloors(..., warm)`), compiles and unmounts it. A Career Road mounted for warming stays hidden.
  - Every other floor compiles as it mounts through the tower's `FloorPrep` (see [Elevator ride](#elevator-ride)).
- `precompileFloor` returns null before the scene's first drawn frame and never switches to a render target that is already bound.
  - `withTarget`: three resets the canvas viewport with `floor()` on a switch to null, which would draw a fractional lite canvas 1 px narrower.
- Content visibility is `floorContentVisible` and `contentVisible` (`tower/visibility.ts`) together.
- `__hq.render` exposes `peakCalls` (reset with `resetPeak()`), `programs()`, `programNames()`, `graphics()` and `warmFloors()`.

## Batched text with live members

- `BatchedLabels` takes:
  - `toneMapped`: match the labels it replaces (drei `Text` is tone mapped unless `material-toneMapped={false}`);
  - outlines (`outlineWidth`, `outlineColor`; an outlined batch is 2 calls);
  - a `ref` handle (`batch`, `members`) for per-frame member matrices, opacities or text.
- Users: the L1 stats ring (5 calls: instanced plates and glows, one edge set, two text batches) and the L2 room labels and signposts (`floors/career/labels.ts`, `useMemberFade`).

## Ride cull

- `tower/rideCull.ts`, mounted by `tower/RideCullHooks.tsx`.
- Problem: during a ride a floor below the rover can draw under a slab that is still solid (the car parked at the floor above, or the target several floors down).
- Around every scene render (not in boot or intro):
  - `scene.onBeforeRender` hides each leaf mesh, line or points of such a floor whose world bounds, clipped to the view frustum (`clipBoxToFrustum`), lie in the shadow of a solid slab as seen from the camera (`inSlabShadow` in `tower/slabShadow.ts`, pure).
  - A solid slab: fill fully opaque and writing depth (`getFloorSlab` from `floorRegistry.ts`).
  - `scene.onAfterRender` shows it again, so components never see the change.
- Never culled:
  - shader materials (custom vertex shaders may leave the geometry bounds), unless the material sets `userData[RIDE_CULL_BOUNDS]` (today only the L1 Visitor Observatory's globe, dot and plate materials, whose holo modes never move a vertex);
  - `depthTest: false`;
  - meshes with children;
  - skinned or morphed meshes.
- Bounds:
  - troika keeps its own;
  - instanced meshes union their instances (cached by `instanceMatrix.version`);
  - other geometry recomputes when its position attribute version changes.
- A culled troika text still gets `sync()`, so the ride's typesetting wait ([Elevator ride](#elevator-ride)) is unchanged, and `gl.compile` never runs the hooks, so precompile sees every mesh.
- A floor under the car parked at the target (`belowParkedCar`) is hidden whole for the render (`CullFloor.hide`): FloorLevel decides visibility before the Director advances the ride, so this covers the frame the doors start to open, when the arrival glide already looks out of the car.
- Probe: `__hq.rideCull` (`meshes`, `triangles` of the last culling render).
- It keeps the ride peaks under 30k triangles with no visible change (`e2e/visual-gate.spec.ts` ride poses `ride-down-l2-l1-*`, `ride-down-l3-l2-*`).
- New floor content that moves vertices in a shader must use a shader material (or stay out of the cull) so its bounds are never trusted.

## Day and night

The tower runs a 4 minute cycle from neon night to a deep twilight "day" (owner decisions 2026-10-17 and 2026-10-18). Classic site pages are unchanged.

### Model

- `src/experience/sky/dayNight.ts` is pure: `skyState(phase)` maps a phase in [0, 1) to the sky (`CYCLE_MS` is 4 minutes).
  - Phase 0 is night, 0.25 dawn, 0.5 twilight day, 0.75 dusk (`SKY_PHASES`); the `day`, `warm` and `stars` mixes drive colors, lights and the star amount.
  - Night reproduces `sceneSettings` exactly (fog and background `#0a0a0f`, hemisphere, directional light, bloom), so the base look does not move.
  - "Day" is not daylight: an indigo to teal sky with a sun glow on the horizon. Neon glows brighter at night (full tier bloom 0.9 at night, 0.72 at twilight day).
- Geometry: the sky is a dome whose horizon sits at `SKY.horizon` (-0.6 rad), because the follow cameras look 44 to 47 degrees down.
  - The sun and the moon ride one tall, narrow ellipse on the sky sphere, opposite each other, so they move up and down (owner decision 2026-10-18): centered on the horizon at `SKY.azimuth` for the camera class (`skyAzimuth(device.camera)`: desktop -0.2, the open sky on the left of the L1 view between the profile card and the Visitor Observatory; tablet and phone -0.85, the open sky at the top left of the L1 portrait view), climbing `SKY.rise` (0.16 rad) above it and swinging `SKY.width` (0.06 rad) sideways where they cross it.
  - The sun rises on the left at dawn, tops out at midday, sinks straight down on the right at dusk and stays below the horizon at night; the moon does the same half a cycle later.
  - One orb near the horizon at a time: each orb's `alpha` (in the model, written by `applyOrbs`) fades in from 0.06 rad below the horizon to 0.03 above it, and the moon shows only while the sun is more than 0.06 rad below the horizon, so it fades out before the sun starts to show at dawn and back in after the sun is gone at dusk.
  - `SkyController` re-applies the sky when the camera class changes. The dome's sun glow follows the sun direction.

### Mode resolution

- `resolveSkyMode` picks the phase source:
  - `?sky=night|dawn|day|dusk|<0..1>` pins a phase (source `param`); `?sky=cycle` runs the clock.
  - Under automation (`navigator.webdriver`) the sky holds a still night otherwise (source `held`, `still` true): today's exact frame, so the visual baselines stay valid. The sky group (dome and orbs) is not drawn at all (`visible = false`, written when the mode resolves), which costs a CPU renderer (SwiftShader) nothing; the dome's star amount and both orb alphas are also written as 0. A visitor's held night (reduced motion or stored "off") has `still` false and keeps the moon and stars.
  - `?sky=` or `sessionStorage["hq:sky"]` (same values; the perf lane's opt-in, `parseSkyValue`) draws the sky under automation; the perf gates measure the sky through that opt-in.
  - A visitor runs the clock (source `clock`) when the stored choice says on, or when there is no choice and reduced motion is off. Reduced motion holds night unless the visitor turns the cycle on.
- The phase comes from clock time (`clockPhase(Date.now())`, `Date.now() % 4 min`): every visitor sees the same phase and a reload continues.
- Preference: `localStorage["hq:day-night"]` is `"on"`, `"off"` or unset (unset follows Motion). `src/lib/day-night.ts` (`readDayNight`, `setDayNight`, `subscribeDayNight`, `dayNightOn`) imports nothing, so the HUD bundle can use it.
- The "Day and night" toggle is registered in the settings registry (`src/hud/settings/defs/day-night.ts`, id `day-night`, group display, order 30) and shows in the settings panel (Display group, between Graphics quality and Minimap). Its `get` reads `dayNightOn(readDayNight(), reducedMotion)`, its `set` is `setDayNight`.

### Rendering

- `SkyController` (`src/experience/sky/`, mounted by `Scene.tsx` in place of the two light elements) owns the lights and the sky meshes; `applySky.ts` writes the state into them.
  - One camera-centered dome (`SphereGeometry` 400, 8x4, 48 triangles; the color comes per pixel from the view direction, with procedural twinkling stars) and one two-instance sun and moon mesh.
  - Both use the shared instanced holo program: `HOLO_MODE.sky` (12) and `HOLO_MODE.orb` (13), uniforms `uSun` and `uGlow` (`fx/holoFx.ts`). That is +2 scene draw calls and no new shader program.
  - First person has a 72 u far plane, so each frame the sky group scales uniformly about the camera by `min(1, 0.97 * camera.far / 400)`; directions and the sun and moon angular sizes stay the same.
  - The dome has `renderOrder` -100, is transparent and does not write depth.
  - On the full tier the two meshes mount only once the lazy composer is live; earlier, the frame-3 precompile would compile a canvas variant of the holo program.
- Per frame, only when the phase moved: the lights, the scene background and the fog color follow the phase. Fog near and far stay with `CameraDirector`.
- The RF star dome (`floors/roof/Sky.tsx`) fades with `skyRuntime.stars`.
- Probe: `__hq.sky` is `{ phase, day, stars, still, source, fog, azimuth, applied, underground }` (`stars` is the model's star amount even when `still`, the RF star dome fades with it; `source` is `"param"`, `"clock"` or `"held"`; `fog` is the applied fog hex; `azimuth` is the arc azimuth as last applied, `applied` counts applications, `underground` is true below the Lobby), read from `skyRuntime`.
- Tests: `tests/unit/day-night.test.ts`, `day-night-pref.test.ts`, `day-night-setting.test.ts`, `holo-sky.test.ts`; `e2e/daynight.spec.ts` (still held night under automation without a drawn sky, the sessionStorage opt-in, held night for a visitor, pinned phases, the same programs and scene calls at night and day, the clock, the stored choice and reduced motion). `scripts/e2e-plan.ts` maps `src/experience/sky/` and `src/lib/day-night.ts` to it.
- Captures: `bun scripts/sky-shots.ts --base <url> --out <dir>` (L1 and L3 by default, `FLOORS=L1,L2,L3,L4,RF`; four phases by default, `PHASES` takes names or numbers; desktop full and phone lite; `--gpu` renders on the Metal GPU on macOS, where a 1440x900 SwiftShader screenshot can time out). `bun scripts/b1-shots.ts --base <url> --out <dir>` captures B1 (arrival, aisle, each station's drawer; desktop full and phone lite) with the dev flag; its `unlock` part captures the locked row and the unlock moment.
- B1 is underground: no dome, sun or moon below `UNDERGROUND_BELOW`; the night state holds, so the lights and fog stay at today's look.
- Budgets are authoritative in `e2e/budgets.ts` (3D bytes, draw calls, triangles) and `e2e/perf/baseline.json` (shader programs, memory); this section keeps only the invariants above.

## Store additions beyond appendix 06

Appendix 06: [06-data-contracts.md](../superpowers/specs/agent-hq/06-data-contracts.md).

### State

| Key | Meaning |
|---|---|
| `topics` | L4 Topic Constellation: the picked `topic` with its rooms. Not persisted; the hash `#library-topic=<slug>` carries it |
| `reactor` | L3 Tech Reactor: drawer `ring`, picked `tech` with its pod slugs, Surprise me `spin` counter. Not persisted; the hash `#labs-tech=<slug>` carries the pick through `createReactorHashSync` in `floors/labs/reactorUrl.ts` |
| `ride` | elevator ride state |
| `floorsSeen` | public floors the rover reached in explore (B1 never counts); persisted. `markFloorSeen(floor)` adds one through `withFloorSeen`, fed by `watchFloorVisits` in `Experience` (arrival, deep link, resume, the Lobby once the intro ends) |
| `b1Unlocked` | the B1 Engine Room is reachable: the fifth public floor sets it (persisted), `unlockB1()` sets it for the session only (the `?unlock=b1` flag) |
| `b1Moment` | the one-time unlock moment is live (chime, Rover's offer, pulsing row). Set with the fifth floor, never by the flag, not persisted; `clearB1Moment()` ends it |
| `device` | `viewport`, `camera`, `coarse` |
| `reducedMotion` | effective: `resolveReducedMotion(motion, systemReducedMotion)` |
| `motion` | the Motion setting |
| `systemReducedMotion` | the OS flag |
| `notice` | notice |
| `readme` | README view in the drawer |
| `picker` | floor pad picker |
| `beam` | L2 teleport beam |
| `hover` | point-and-go target, `HoverState` |
| `pointHint` | its one-time hint |

### Actions

| Action | Notes |
|---|---|
| `selectTopic`, `clearTopic` | `topics` |
| `setReactorRing`, `selectReactorTech`, `clearReactorTech`, `spinReactor` | `reactor` |
| `setHover(hover)` | |
| `setPointHint(on)` | |
| `openPicker(picker)` | explore only, no ride or beam |
| `closePicker()` | |
| `setBeam(beam)` | |
| `openRoom(room, tab?)` | |
| `setDrawerTab` | |
| `toggleReadme(on?)` | |
| `openHologram()` / `closeHologram()` | phase `hologram`, which also blocks the elevator |
| `recover(tier)` | explore again before the canvas remounts after a WebGL crash |
| `setMotion(pref)` | |
| `setReducedMotion(os)` | records the OS flag |

### Persistence and storage

- Persisted keys: `visited`, `firstVisit`, `locale`, `motion`, `floorsSeen`, `b1Unlocked` (key `hq:v1`, version 3).
  - `merge` fills `floorsSeen` (public floors only) and `b1Unlocked` for older payloads. `partialize` writes `b1Unlocked` only when all five public floors were seen, so the session-only flag never reaches storage.
  - Older payloads migrate a stored or missing `system` to `full` and keep `reduced`; an unknown value falls back to `full` (see "Motion setting" in [hud-and-drawer.md](hud-and-drawer.md)).
  - `firstVisit` stays persisted for compatibility; the boot follows `hq:intro`.
- `sound` mirrors the audio engine (`@/lib/audio`, `localStorage["hq:sound"]`), which is the source of truth.
- The day and night choice lives outside the store in `localStorage["hq:day-night"]` (`"on"` or `"off"`; unset follows Motion), owned by `@/lib/day-night` (see "Day and night").
- `sessionStorage` keys:

  | Key | Meaning |
  |---|---|
  | `hq:view` | this tab's view (`page` or `3d`), pinned on every load by the head script |
  | `hq:resume` | language switch resumes the floor; after the boot and intro when this session has not seen them |
  | `hq:intro` | boot and intro played this session |
  | `hq:gfx` | the quality safety net's level for this session (`scene/qualityStore.ts`) |

### Sounds from the Director

- `ding` on elevator arrival, `beep` when the rover opens the terminal or a pad picker, `whoosh` on a teleport.
- It feeds `setRumble(speed)` every frame.

## Deviations from the spec (kept deliberately)

- The tier gate is a local heuristic instead of `detect-gpu`: no runtime CDN fetch; software renderers such as SwiftShader map to `static` like detect-gpu tier 0, so headless browsers and Lighthouse see the HTML page unless `?tier=` is set.
- L3 keeps the global shaft and puts the hub plaza in front of its door, with the wing roads running east (Software north, AI south).
  - Appendix 01 section 4 ([01-world-and-layout.md](../superpowers/specs/agent-hq/01-world-and-layout.md)) is updated, now superseded by the Project Roads in [floor-l3-labs.md](floor-l3-labs.md).
- The rover spawns turned toward the camera so its face greets the visitor, except on the L1 kiosk spawn (facing the kiosk) and on a floor's arrival point (heading east).

## Testing hooks

- Playwright sets `navigator.webdriver`, so e2e tests that need the 3D tier pass `?tier=lite|full`; tests of real auto-detection call `asHumanBrowser(page)` (`e2e/hq.ts`). More on writing 3D tests: [performance.md](performance.md).
- `window.__hq` exposes `{ store, rover, intro, camera, layouts, interact, memory, floorChunks, ridePrep, probes, rideCull, render, quality, frames, motion, perf, sky }` for Playwright:

  | Member | Contents |
  |---|---|
  | `intro` | `introRuntime`: the intro's timeline `t`, `reveal` radius, Rover `heading` and `face`, `veil`, `lit` landmark ids and `skipped` (see [Boot and intro](#boot-and-intro)) |
  | `floorChunks` | `floorChunksHandle`: `state(floor)`, `snapshot()`, `requestedAt(floor)`, `load(floor)` |
  | `layouts` | carries the floor pads |
  | `interact` | `interactRuntime`: the current floor's `items`, `project`, `screenOf(id)`, `screenAt(id, fx, fz, lift)`, `hitAt(x, y)` (the click raycast) and `highlight` |
  | `memory()` | the live `renderer.info` geometries, textures and program count (null without a canvas) |
  | `motion()` | the live ride and beam (`{ ride, beam }`, the store only holds their stage starts) |
  | `sky` | `{ phase, day, stars, source, fog, azimuth, applied, underground }` of the day and night cycle (see "Day and night") |
  | `probe` | only with `?gfx=probe`: `{ checked, black }`, frames checked and the black frames found (see [Shader math](#shader-math)) |

- E2E helpers in `e2e/hq.ts`: drive with `driveTo`, read pads with `padsOf`, point with `visibleTarget`, `targetPoint`, `hoverTarget` and `emptyFloorPoint`.
- The rover hides during the hologram view; pod labels too.

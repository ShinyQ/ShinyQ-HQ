# Vertical Sun and Moon Arc Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Status: in review, 2026-10-18 (owner request).

**Goal:** The sun and the moon of the day and night cycle move up and down (rise from the horizon, climb, sink straight down) instead of sliding right to left across the default view.

**Architecture:** `writeOrb` in `src/experience/sky/dayNight.ts` places both orbs on one tall, narrow ellipse on the sky sphere. The ellipse is centered on the dome horizon (`SKY.horizon`) at an azimuth chosen per camera class (`SKY.azimuth`), and lies in the plane that faces a camera looking along that azimuth: its long axis is the local meridian (up and down), its short axis is the camera's right. The sun rises on the left at dawn, tops out at midday, sinks on the right at dusk and sits below the horizon at night; the moon is on the opposite side of the same ellipse. `SkyController` reads `device.camera` from the store and passes the azimuth into `skyState`. Colors, timing, fog, lights and bloom do not change.

**Tech Stack:** TypeScript, three.js (`Vector3`), React Three Fiber, Zustand store, Vitest, Playwright, Bun.

## Global Constraints

- Owner request (verbatim): "the sun and moon for day cycle should be rotating from up to down not right to the left".
- No em dashes (U+2014) anywhere: code, comments, docs, commit messages, PR text.
- Keep `skyState` colors, `CYCLE_MS`, `SKY_PHASES`, fog, lights and bloom exactly as they are; only the orb directions (and so the dome's sun glow direction, `uSun`) change.
- `SKY.horizon` stays -0.6; the orb horizon fade in `applySky.ts` (`smoothstep(horizon - 0.06, horizon + 0.03, elevation)`) stays.
- Starting values: `rise` 0.2 rad, `width` 0.06 rad, azimuth desktop 0, tablet -0.85, mobile -0.85 (tune from captures; tests read the constants, not literals).
- Azimuth convention: `dir = (sin az * cos e, sin e, cos az * cos e)`, az 0 is +z; increasing azimuth is to the camera's left.
- The frame loop allocates nothing (`writeOrb` writes into the passed `Vector3`).
- No new shader program, no new draw call, no change to `e2e/budgets.ts` or `e2e/perf/baseline.json`.
- Do not edit `src/experience/scene/QualityController.tsx` or the postprocessing pipeline (another session owns them).
- Bun, conventional commits, docs updated in the same PR (current state only in `docs/agents/`).

---

### Task 1: Vertical arc geometry

**Files:**
- Modify: `src/experience/sky/dayNight.ts` (the `SKY` constant and its comment, `writeOrb`, `orbDirection`, `skyState`; add `skyAzimuth`)
- Test: `tests/unit/day-night.test.ts` (replace the "sun and moon move on opposite sides of a low arc around the dome horizon" test)

**Interfaces:**
- Produces: `SKY = { horizon: -0.6, rise: 0.2, width: 0.06, azimuth: { desktop: 0, tablet: -0.85, mobile: -0.85 } } as const`; `skyAzimuth(cls: ViewportClass): number`; `skyState(phase: number, out?: SkyState, azimuth?: number): SkyState` (azimuth defaults to `SKY.azimuth.desktop`); `orbDirection(phase: number, offset: number, out?: Vector3, azimuth?: number): Orb`. `SKY.arc` is removed (only `dayNight.ts` and the test used it).

- [ ] **Step 1: Write the failing test**

In `tests/unit/day-night.test.ts`, add `Vector3` to the `three` import and `skyAzimuth` to the `@/experience/sky/dayNight` import, then replace the whole `it("sun and moon move on opposite sides of a low arc around the dome horizon", ...)` block with:

```ts
  it("sun and moon ride one tall vertical arc facing the camera, opposite each other", () => {
    expect(skyAzimuth("desktop")).toBe(SKY.azimuth.desktop);
    expect(skyAzimuth("tablet")).toBe(SKY.azimuth.tablet);
    expect(skyAzimuth("mobile")).toBe(SKY.azimuth.mobile);
    // The default azimuth is the desktop one.
    expect(skyState(0.5).sun.dir.distanceTo(skyState(0.5, undefined, SKY.azimuth.desktop).sun.dir)).toBeLessThan(1e-9);
    for (const cls of ["desktop", "tablet", "mobile"] as const) {
      const az = skyAzimuth(cls);
      const at = (p: number) => skyState(p, undefined, az);
      // Camera right when looking along `az` (increasing azimuth is to the left).
      const right = new Vector3(-Math.cos(az), 0, Math.sin(az));
      // Midday: the sun at the top, the moon at the bottom; night: the other way round.
      expect(at(0.5).sun.elevation).toBeCloseTo(SKY.horizon + SKY.rise, 6);
      expect(at(0.5).moon.elevation).toBeCloseTo(SKY.horizon - SKY.rise, 6);
      expect(at(0).moon.elevation).toBeCloseTo(SKY.horizon + SKY.rise, 6);
      expect(at(0).sun.elevation).toBeCloseTo(SKY.horizon - SKY.rise, 6);
      // Top and bottom sit straight above and below the center: no sideways offset.
      expect(Math.abs(at(0.5).sun.dir.dot(right))).toBeLessThan(1e-9);
      // Dawn and dusk: on the horizon, the sun rising on the left and setting on the right, the moon opposite.
      const dawn = at(0.25);
      const dusk = at(0.75);
      expect(dawn.sun.elevation).toBeCloseTo(SKY.horizon, 2);
      expect(dusk.sun.elevation).toBeCloseTo(SKY.horizon, 2);
      expect(dawn.sun.dir.dot(right)).toBeLessThan(0);
      expect(dusk.sun.dir.dot(right)).toBeGreaterThan(0);
      expect(dawn.moon.dir.dot(right)).toBeGreaterThan(0);
      expect(dusk.moon.dir.dot(right)).toBeLessThan(0);
      let lateral = 0;
      let low = Infinity;
      let high = -Infinity;
      for (let i = 0; i < 64; i++) {
        const p = i / 64;
        const s = at(p);
        expect(s.sun.dir.length()).toBeCloseTo(1, 9);
        expect(s.moon.dir.length()).toBeCloseTo(1, 9);
        // The moon is the sun half a cycle later: the same ellipse, the opposite side.
        expect(s.moon.dir.distanceTo(at((p + 0.5) % 1).sun.dir)).toBeLessThan(1e-9);
        lateral = Math.max(lateral, Math.abs(Math.asin(s.sun.dir.dot(right))));
        low = Math.min(low, s.sun.elevation);
        high = Math.max(high, s.sun.elevation);
      }
      // Up to down: the vertical travel is more than twice the sideways travel.
      expect(high - low).toBeGreaterThan(2 * (2 * lateral));
    }
    // The night moon and the midday sun share one direction (in front of the L1 default camera).
    expect(skyState(0).moon.dir.distanceTo(skyState(0.5).sun.dir)).toBeLessThan(1e-9);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run tests/unit/day-night.test.ts`
Expected: FAIL (`skyAzimuth` is not exported, `SKY.rise` is undefined).

- [ ] **Step 3: Implement the geometry**

In `src/experience/sky/dayNight.ts`, add `import type { ViewportClass } from "../types";` and replace the `SKY` comment and constant with:

```ts
/**
 * Sky geometry in radians. `horizon`: elevation of the dome's horizon. The follow cameras look 44 to 47
 * degrees down (the frame top sits about 18 to 24 degrees below level), so the void around the
 * floating tower that a visitor sees lies well below the true horizon; the dome's horizon sits inside
 * it. The sun and the moon ride one tall, narrow ellipse on the sky sphere, opposite each other (owner
 * decision 2026-10-18: up to down, not right to left). It is centered on the horizon at `azimuth` (per
 * camera class) and faces a camera looking along that azimuth: `rise` is how far the orbs climb above
 * (and sink below) the horizon, `width` how far they swing sideways where they cross it (rising on the
 * left, setting on the right). Desktop: azimuth 0 (+z), the open void on the left of the L1 view (the
 * camera looks along about -0.38 rad there); tablet and phone: the open sky at the top left of the L1
 * portrait view (the camera looks along about -1.0 rad).
 */
export const SKY = { horizon: -0.6, rise: 0.2, width: 0.06, azimuth: { desktop: 0, tablet: -0.85, mobile: -0.85 } } as const;

/** The sun and moon arc's azimuth for a camera class (`device.camera`). */
export function skyAzimuth(cls: ViewportClass): number {
  return SKY.azimuth[cls];
}
```

Replace `writeOrb` and `orbDirection` with:

```ts
/**
 * Unit direction of the sun (`offset` 0) or the moon (`offset` 0.5) at `phase`, on the ellipse centered
 * at C (elevation `SKY.horizon`, `azimuth`), with the local up U (the meridian) and the camera right R.
 * The orb sits `a` radians from C along the tangent (x R + y U) / a, so the top is exactly `rise` above
 * the horizon. Night (theta 0): the sun at the bottom; dawn: left; midday: top; dusk: right.
 */
function writeOrb(phase: number, offset: number, azimuth: number, out: Vector3): number {
  const theta = 2 * Math.PI * (phase + offset);
  const x = -SKY.width * Math.sin(theta);
  const y = -SKY.rise * Math.cos(theta);
  const a = Math.hypot(x, y);
  const k = a > 0 ? Math.sin(a) / a : 1;
  const c = Math.cos(a);
  const sh = Math.sin(SKY.horizon);
  const ch = Math.cos(SKY.horizon);
  const sa = Math.sin(azimuth);
  const ca = Math.cos(azimuth);
  // C = (sa ch, sh, ca ch), U = (-sa sh, ch, -ca sh), R = (-ca, 0, sa): orthonormal.
  out.set(c * sa * ch + k * (-x * ca - y * sa * sh), c * sh + k * y * ch, c * ca * ch + k * (x * sa - y * ca * sh));
  return Math.asin(Math.min(1, Math.max(-1, out.y)));
}

export function orbDirection(phase: number, offset: number, out = new Vector3(), azimuth: number = SKY.azimuth.desktop): Orb {
  return { dir: out, elevation: writeOrb(phase, offset, azimuth, out) };
}
```

Change the `skyState` signature and its last two orb lines:

```ts
/** The sky at `phase` (writes into `out` so the frame loop allocates nothing). Phase 0 equals today's night. `azimuth`: the sun and moon arc's azimuth (`skyAzimuth`). */
export function skyState(phase: number, out: SkyState = createSkyState(), azimuth: number = SKY.azimuth.desktop): SkyState {
```

```ts
  out.sun.elevation = writeOrb(phase, 0, azimuth, out.sun.dir);
  out.moon.elevation = writeOrb(phase, 0.5, azimuth, out.moon.dir);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bunx vitest run tests/unit/day-night.test.ts tests/unit/sky-apply.test.ts tests/unit/holo-sky.test.ts`
Expected: PASS. Then `bunx tsc --noEmit -p .` passes (no other code reads `SKY.arc`).

- [ ] **Step 5: Commit**

```bash
git add src/experience/sky/dayNight.ts tests/unit/day-night.test.ts
git commit -m "feat(sky): sun and moon ride a vertical arc facing the camera"
```

### Task 2: Per camera class azimuth in the controller, probe and docs

**Files:**
- Modify: `src/experience/sky/SkyController.tsx` (read `device.camera`, pass the azimuth, re-apply on a class change)
- Modify: `src/experience/sky/skyRuntime.ts` (add `azimuth`)
- Modify: `e2e/daynight.spec.ts` (read `azimuth` in the pinned day test)
- Modify: `docs/agents/3d-experience.md` ("Day and night", Geometry bullet and the probe bullet)
- Modify: `docs/features.md` (status table row "Day and night" and the "Day and night" section bullet about the arc)
- Modify: `docs/decisions.md` (new dated row)

**Interfaces:**
- Consumes: `skyAzimuth(cls)`, `skyState(phase, out, azimuth)`, `SKY.azimuth` from Task 1.
- Produces: `skyRuntime.azimuth: number` (the azimuth last applied; `__hq.sky.azimuth`).

- [ ] **Step 1: Write the failing e2e assertion**

In `e2e/daynight.spec.ts`, add `azimuth: number;` to `SkyRead`, read it in `readSky` (`const { phase, day, stars, still, source, fog, applied, azimuth } = ...; return { phase, day, stars, still, source, fog, applied, azimuth };`), and in the test "?sky=night and ?sky=day pin the phase ..." after `expect(day.fog, ...)` add:

```ts
  // The desktop project's camera class puts the sun and moon arc at azimuth 0 (`SKY.azimuth.desktop`).
  expect(day.azimuth).toBe(0);
```

- [ ] **Step 2: Implement the runtime field and the controller wiring**

In `src/experience/sky/skyRuntime.ts` add after `fog`:

```ts
  /** Azimuth of the sun and moon arc as last applied (`SKY.azimuth` for the camera class). */
  azimuth: 0,
```

In `src/experience/sky/SkyController.tsx`:
- import `skyAzimuth` from `./dayNight` (keep the other imports);
- after `const reduced = useHQStore((s) => s.reducedMotion);` add `const cameraClass = useHQStore((s) => s.device.camera);`;
- after the `last` ref add:

```ts
  const azimuth = useRef(skyAzimuth(cameraClass));
  // A camera class change (rotate a tablet, resize a window) moves the sun and moon arc: re-apply on the next frame.
  useEffect(() => {
    azimuth.current = skyAzimuth(cameraClass);
    last.current = null;
  }, [cameraClass]);
```

- change `skyState(phase, state);` to `skyState(phase, state, azimuth.current);`;
- after `skyRuntime.fog = state.fog.getHex();` add `skyRuntime.azimuth = azimuth.current;`.

- [ ] **Step 3: Docs**

`docs/agents/3d-experience.md`, "Day and night" > "Model", replace the Geometry bullet and its sub-bullet with:

```md
- Geometry: the sky is a dome whose horizon sits at `SKY.horizon` (-0.6 rad), because the follow cameras look 44 to 47 degrees down.
  - The sun and the moon ride one tall, narrow ellipse on the sky sphere, opposite each other, so they move up and down (owner decision 2026-10-18): centered on the horizon at `SKY.azimuth` for the camera class (`skyAzimuth(device.camera)`: desktop 0, the open void on the left of the L1 view; tablet and phone -0.85, the open sky at the top left of the L1 portrait view), climbing `SKY.rise` (0.2 rad) above it and swinging `SKY.width` (0.06 rad) sideways where they cross it.
  - The sun rises on the left at dawn, tops out at midday, sinks straight down on the right at dusk and stays below the horizon at night; the moon does the same half a cycle later. `SkyController` re-applies the sky when the camera class changes. The dome's sun glow follows the sun direction.
```

In the probe bullet, change `` `{ phase, day, stars, still, source, fog, applied, underground }` `` to `` `{ phase, day, stars, still, source, fog, azimuth, applied, underground }` `` and add "`azimuth` is the arc azimuth as last applied," after the `fog` explanation.

`docs/features.md`: in the status table row "Day and night", change "with a sun and moon on a shallow arc" to "with a sun and moon that rise and set up and down (2026-10-18)"; in the "### Day and night" section replace the bullet "The sun and the moon cross a shallow arc around the tower, opposite each other; ..." with:

```md
- The sun and the moon rise and set up and down in the open sky of the default view, opposite each other: the sun comes up over the horizon on the left at dawn, stands highest at midday and sinks straight down on the right at dusk, and the moon does the same through the night. The lights, the fog and the bloom follow the phase, and the neon glows brighter at night.
```

`docs/decisions.md`: add a row at the end of the table (same columns as the rows above it):

```md
| 2026-10-18 | 3D | Owner request: "the sun and moon for day cycle should be rotating from up to down not right to the left". The sun and the moon now ride one tall, narrow ellipse centered on the dome horizon and facing the default camera (rise 0.2 rad, width 0.06 rad; azimuth 0 on desktop, -0.85 on tablets and phones), so they rise, climb and sink vertically, the sun rising on the left and setting on the right and the moon opposite. Timing, colors, fog, lights and bloom are unchanged; B1 still holds night with no sky. Supersedes the shallow arc around the tower of the Round 8 K day and night. |  |
```

- [ ] **Step 4: Verify**

Run: `bunx tsc --noEmit -p . && bunx vitest run tests/unit` (expect PASS, including the em dash and docs tests), then `bunx playwright test e2e/daynight.spec.ts -g "pin the phase"` (expect PASS).

- [ ] **Step 5: Commit**

```bash
git add src/experience/sky e2e/daynight.spec.ts docs/agents/3d-experience.md docs/features.md docs/decisions.md
git commit -m "feat(sky): place the sun and moon arc per camera class"
```

### Task 3: Capture tooling

**Files:**
- Modify: `scripts/sky-shots.ts`
- Modify: `docs/agents/3d-experience.md` (the Captures bullet)

- [ ] **Step 1: Add the floors and a GPU flag**

In `scripts/sky-shots.ts`:
- `ALL_FLOORS` becomes `[{ id: "L1", path: "/en" }, { id: "L2", path: "/en/journey" }, { id: "L3", path: "/en/labs" }, { id: "L4", path: "/en/library" }, { id: "RF", path: "/en/contact" }] as const`, and the default floor list (no `FLOORS` env) stays L1 and L3: `const FLOORS = process.env.FLOORS ? pick(ALL_FLOORS, process.env.FLOORS) : ALL_FLOORS.filter((f) => f.id === "L1" || f.id === "L3");`.
- Add a `--gpu` flag: `const GPU = args.includes("--gpu");` and launch with `GPU ? ["--use-angle=metal", "--ignore-gpu-blocklist", "--enable-gpu"] : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]` (the large desktop screenshot can time out under SwiftShader on macOS).
- Update the header comment: floors L1 to RF (default L1 and L3), `PHASES` accepts names or numbers (`PHASES=night,dawn,0.4,day,0.6,dusk`), `--gpu` uses the Metal GPU on macOS.

- [ ] **Step 2: Docs**

In the Captures bullet of `docs/agents/3d-experience.md`, change "(L1 and L3, four phases, desktop full and phone lite)" to "(L1 and L3 by default, `FLOORS=L1,L2,L3,L4,RF`; four phases by default, `PHASES` takes names or numbers; desktop full and phone lite; `--gpu` renders on the Metal GPU on macOS, where a 1440x900 SwiftShader screenshot can time out)".

- [ ] **Step 3: Verify and commit**

Run: `bunx tsc --noEmit -p .` and `bunx eslint scripts/sky-shots.ts` (PASS).

```bash
git add scripts/sky-shots.ts docs/agents/3d-experience.md
git commit -m "chore(sky): sky-shots covers every floor and can render on the GPU"
```

### Task 4: Captures, tuning and the pull request (controller)

- [ ] Run a dev server (`bun run dev -- -p 3418`), capture main (before) and this branch (after): L1 at `night,dawn,0.4,day,0.6,dusk` on desktop and phone, every floor at `day,dusk`, B1 (`scripts/b1-shots.ts`). Build contact strips (PIL) in the session files folder, not in the repo.
- [ ] If an orb sits behind the HUD or geometry, tune `SKY.rise`, `SKY.width` or `SKY.azimuth` (tests read the constants), update the values in the docs and the decisions row, and re-capture.
- [ ] `bun run verify:quick`, then `bun run e2e:changed`.
- [ ] Wait for a free CI slot, push, open a ready-for-review PR (not merged), list this plan in `docs/superpowers/README.md` with its PR.

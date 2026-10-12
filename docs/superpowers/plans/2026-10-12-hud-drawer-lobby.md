# R3-B: HUD, Boost, Unskippable Intro, Drawer Footer and Centered Lobby Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the owner's 3D HUD round: no rooms-visited counter, a hold-Shift (and touch) boost, the hint and walk pills pinned to the bottom on tablets and phones, an L1 Lobby centered on the elevator axis, "Missions" renamed to "Ask Rover", an unskippable boot and intro played once per browser session, a top bar without Quick view (highlighted Page view, Ask AI on its right) and the room drawer's cross-floor link moved into the footer.

**Architecture:** Pure modules carry the logic and get unit tests first (`rover/boost.ts`, `physicsSteps` in `rover/controller.ts`, `lib/intro-session.ts`, `reducedIntroPose` in `camera/rigs.ts`, `LOBBY` in `config.ts`); React and R3F files only wire them (Director, Rover, CameraDirector, Experience, Hud). The bottom of the HUD becomes one flex band (`BottomBand` in `Hud.tsx`) so the joystick, boost button, hint, walk pill and view controls cannot overlap by construction; `WalkBar` portals its pills into the band. Layout claims are proven with Playwright bounding boxes in a new `e2e/hud.spec.ts`.

**Tech Stack:** Next.js 16 (static export), Bun, Tailwind 4, next-intl, React Three Fiber and drei, zustand, Vitest (+ Testing Library, jsdom per file), Playwright on SwiftShader.

## Global Constraints

- No em dashes (U+2014) anywhere: code, comments, copy, docs, commits, PR text (a unit test scans the repo). Use commas, colons, parentheses or "to".
- Every UI string lives in `messages/en.json` and `messages/id.json` with identical keys; Indonesian is natural and professional, technical terms stay in English. User-facing name: **Ask Rover** (EN) and **Tanya Rover** (ID). Code identifiers (`MissionHud`, `RoverTerminal`, `missions`, `hq:terminal-seen`) keep their names.
- Only characters in the self-hosted font cuts (ASCII plus the typographic punctuation already used, such as `·`, `→`, `▶`, `✕`); no emoji (no `⚡`). `tests/content/fonts.test.ts` fails otherwise.
- Do not touch elevator code or content: `src/experience/tower/**`, `src/hud/ElevatorPanel.tsx`, `SHAFT`, `CAR`, `Ride`, the elevator call pad and L2 teleporters (another session), and `content/site-content.json` titles (another session).
- Render budget stays under 150 draw calls and 30k triangles per floor (`expectRenderBudget`); Lighthouse CI budgets stay green (LCP 2 s, CLS 0.01, TBT 200 ms, transfer budgets). The boost trail is one quad, drawn only while boosting.
- Touch targets at least 44 px (`min-h-11`); every HUD panel or pill over the world uses `.glass .glass-solid` (the primary Page view button is solid cyan instead).
- Static export only: no server runtime, no new routes.
- Crawlers, Lighthouse, `?tier=static` and the Page View never load the 3D chunk (unchanged `boot-first.ts` and `ExperienceGate`).
- Tests first in every task (failing run, then the implementation, then a passing run). E2E waits on state, never on time (`page.waitForTimeout` only to prove that nothing happens).
- Before pushing: `bun run verify:quick`, then `bun run e2e:changed`. This branch changes `e2e/hq.ts`, so `e2e:changed` runs the full suite (20 to 40 minutes locally); per-task runs below target single specs after a `bun run build`.
- Commands use the owner's `rtk` prefix (it passes unknown commands through unchanged); drop the prefix if `rtk` is not installed. Conventional commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`). One PR; never merge without the owner.

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `src/hud/ProfileCard.tsx` | Modify | Profile card without the rooms-visited counter and progress bar |
| `tests/hud/ProfileCard.test.tsx` | Create | Card shows the floor, no `n/N`, store keeps `visited` |
| `src/experience/rover/boost.ts` | Create | Pure boost rules: `BOOST`, `boostOn`, `boostTuning`, `stepBoostLevel` |
| `src/experience/rover/controller.ts` | Modify | `MAX_STEP_DISTANCE`, `physicsSteps`, distance-aware sub-steps in `step` |
| `src/experience/input/joystick.ts` | Modify | Shared `boost` flag and `setBoost` for the touch button |
| `tests/unit/boost.test.ts` | Create | Boost rules, sub-steps, no tunnelling at boost speed |
| `src/experience/rover/runtime.ts` | Modify | `boost` level and `trail` opacity (also test probes) |
| `src/experience/scene/Director.tsx` | Modify | Boost wiring; Esc never ends boot or intro |
| `src/experience/rover/Rover.tsx` | Modify | Boost trail quad (hidden under reduced motion) |
| `src/lib/intro-session.ts` | Create | `hq:intro` session flag: `introSeen`, `markIntroSeen`, `lobbyStartPhase` |
| `tests/unit/intro-session.test.ts` | Create | Flag behavior incl. unavailable storage |
| `src/experience/Experience.tsx` | Modify | Lobby start phase from the session flag; marks the flag after the intro |
| `src/components/BootCard.tsx` | Modify | No skip button; `startDisabled` until the log typed out |
| `src/components/BootCover.tsx` | Modify | Drops the skip label |
| `src/hud/BootOverlay.tsx` | Modify | Same typing pace with reduced motion; Boot rover gated by `ready` |
| `tests/hud/BootOverlay.test.tsx` | Create | No skip, gated start, reduced-motion pace |
| `src/experience/camera/rigs.ts` | Modify | `reducedIntroPose` |
| `src/experience/camera/CameraDirector.tsx` | Modify | Full-length intro under reduced motion, then a cut |
| `src/experience/missions/host3d.ts` | Modify | Mission steps wait for the intro instead of ending it |
| `src/hud/HudLaunchers.tsx` | Modify | "Ask Rover" label (`hud.launcher.askRover`), `labelClassName` prop |
| `src/hud/Controls.tsx` | Modify | Top bar without Quick view; `ViewActions` (primary Page view, Ask AI on its right); phone second row |
| `tests/hud/Controls.test.tsx` | Create | Top bar order and contents |
| `src/hud/Hud.tsx` | Modify | No IntroSkip; `BottomBand`; walk placement; phone offsets |
| `src/hud/BoostButton.tsx` | Create | Hold-to-boost touch control beside the joystick |
| `tests/hud/BoostButton.test.tsx` | Create | Press, release, cancel, unmount |
| `src/hud/Joystick.tsx` | Modify | In-flow inside the band |
| `src/hud/ViewControls.tsx` | Modify | In-flow; vertical on phones |
| `src/hud/walk/WalkBar.tsx` | Modify | `slot` prop: pills portal into the band; phone top offset 116 px |
| `src/hud/walk/WalkPrompt.tsx` | Modify | Phone top offset 116 px |
| `src/hud/walk/WalkLayer.tsx` | Modify | `bottomSlot` prop passed to `WalkBar` |
| `tests/hud/WalkBar.test.tsx` | Create | Pills in the slot, absolute without it |
| `src/hud/ask/AskDock.tsx` | Modify | Tower teaser under the phone's second row (116 px) |
| `src/hud/drawer/RoomDrawer.tsx` | Modify | Cross-floor link in the footer after the primary action; side panel top below the tablet second row |
| `tests/hud/RoomDrawer.test.tsx` | Modify | Footer order for every room type |
| `src/experience/config.ts` | Modify | `LOBBY` centered on the elevator axis (z = 0) |
| `tests/unit/lobby-layout.test.ts` | Modify | Axis alignment test |
| `messages/en.json`, `messages/id.json` | Modify | Strings per task (removals, Ask Rover, boost hints) |
| `tests/unit/rigs.test.ts`, `tests/unit/missions-host3d.test.ts`, `tests/hud/RoverTerminal.test.tsx`, `tests/hud/MissionHud.test.tsx`, `tests/unit/e2e-plan.test.ts` | Modify | Updated expectations |
| `e2e/hq.ts` | Modify | `asReturningVisitor` sets `hq:intro`; `enterHQ` without Skip |
| `e2e/hud.spec.ts` | Create | Top bar order, bottom band boxes, drawer footer |
| `e2e/experience.spec.ts`, `e2e/missions.spec.ts`, `e2e/ask.spec.ts`, `e2e/walk.spec.ts`, `e2e/library-roof.spec.ts`, `e2e/career.spec.ts`, `e2e/drawer-solid.spec.ts`, `e2e/screenshots.spec.ts` | Modify | Boost and intro tests, renamed labels, removed Skip and Quick view |
| `scripts/e2e-plan.ts` | Modify | `hud` spec and new path rules |
| `README.md`, `AGENTS.md`, `docs/superpowers/specs/agent-hq/01-world-and-layout.md`, `02-interaction-and-states.md`, `03-rover-camera-input.md`, `04-hud-responsive-i18n.md` | Modify | Docs |

Every message edit below uses this exact inline Bun helper (the message files round-trip byte for byte through `JSON.stringify(json, null, 2) + "\n"`; a `null` value deletes a key). It is repeated in full wherever it is used.

---

### Task 0: Branch

**Files:** none.

- [ ] **Step 1: Create the branch from main**

Run:
```bash
rtk git fetch origin && rtk git switch -c feat/r3-b-hud-drawer-lobby origin/main && rtk bun install
```
Expected: `Switched to a new branch 'feat/r3-b-hud-drawer-lobby'`, install finishes without changes to `bun.lock`.

---

### Task 1: Remove the rooms-visited counter from the profile card

**Files:**
- Modify: `src/hud/ProfileCard.tsx` (whole file)
- Modify: `messages/en.json`, `messages/id.json` (delete `hud.visited`)
- Test: `tests/hud/ProfileCard.test.tsx` (create)

**Interfaces:**
- Consumes: `buildExperienceData(locale, floorNames)` from `@/content/experience`, `getHQStore()` from `@/store/useHQStore`.
- Produces: `ProfileCard({ data, mobile })` (same signature). The store keeps `visited`, `markVisited`, persisted `hq:v1` unchanged (missions and walks use them).

- [ ] **Step 1: Write the failing test**

Create `tests/hud/ProfileCard.test.tsx`:
```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import { buildExperienceData } from "@/content/experience";
import { ProfileCard } from "@/hud/ProfileCard";
import { getHQStore } from "@/store/useHQStore";

const data = buildExperienceData("en", { L1: "Home", L2: "Journey", L3: "Work", L4: "Writing", RF: "About" });

afterEach(cleanup);

describe("ProfileCard", () => {
  it("shows the floor but no rooms-visited counter or progress bar, and keeps visited rooms in the store", () => {
    getHQStore().setState({ floor: "L1", visited: ["L1:skills", "L1:stats"] });
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ProfileCard data={data} mobile={false} />
      </NextIntlClientProvider>,
    );
    const card = screen.getByRole("region", { name: en.hud.profile });
    expect(card).toHaveTextContent("Home");
    expect(card).not.toHaveTextContent(/\d+\s*\/\s*\d+/);
    expect(card).not.toHaveTextContent(/visited/i);
    expect(card.querySelector("[aria-hidden='true'].rounded-full")).toBeNull();
    expect(getHQStore().getState().visited).toEqual(["L1:skills", "L1:stats"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `rtk bunx vitest run tests/hud/ProfileCard.test.tsx`
Expected: FAIL, `expected element not to have text content /\d+\s*\/\s*\d+/` (the card still renders `2/N`).

- [ ] **Step 3: Replace `src/hud/ProfileCard.tsx`**

```tsx
"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Monogram } from "@/components/Monogram";
import { ACCENT_TEXT, FLOOR_ACCENT } from "@/lib/accent";
import { useHQStore } from "@/store/useHQStore";
import type { ExperienceData } from "@/experience/types";

/**
 * Top-left card: name, title and current floor (appendix 04: collapses to a pill on mobile). Visited
 * rooms stay in the store for missions and walks, but the card no longer counts them (owner decision).
 */
export function ProfileCard({ data, mobile }: { data: ExperienceData; mobile: boolean }) {
  const t = useTranslations("hud");
  const floor = useHQStore((s) => s.floor);
  const [open, setOpen] = useState(false);
  const accent = ACCENT_TEXT[FLOOR_ACCENT[floor]];

  if (mobile && !open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={false}
        aria-label={`${t("profile")}: ${data.profile.name}, ${floor} ${data.floors[floor].name}`}
        className="glass glass-solid pointer-events-auto absolute top-3 left-3 flex min-h-11 items-center gap-2 rounded-full py-1 pr-4 pl-1"
      >
        <Monogram text={data.profile.monogram} size={36} />
        <span className={`label ${accent}`}>{floor}</span>
      </button>
    );
  }

  return (
    <section
      aria-label={t("profile")}
      className="glass glass-solid pointer-events-auto absolute top-3 left-3 w-[min(280px,calc(100vw-5.5rem))] p-4 md:top-4 md:left-4 lg:w-[280px] md:w-60"
    >
      <div className="flex items-center gap-3">
        <Monogram text={data.profile.monogram} size={44} />
        <div className="min-w-0">
          <p className="truncate text-[15px] leading-5 font-bold text-ink">{data.profile.name}</p>
          <p className="text-[13px] leading-5 text-cyan">{data.profile.headline}</p>
        </div>
      </div>
      <dl className="mt-3 border-t border-glass-border pt-3">
        <dt className="label text-ink-3">{t("floor")}</dt>
        <dd className="text-sm text-ink">
          <span className={`label mr-1.5 ${accent}`}>{floor}</span>
          {data.floors[floor].name}
        </dd>
      </dl>
      {mobile && (
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-expanded
          className="label mt-2 inline-flex min-h-11 items-center text-ink-2 hover:text-ink"
        >
          &#x2715; {t("profile")}
        </button>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Delete the unused `hud.visited` string in both locales**

Run:
```bash
rtk bun -e '
const fs = require("node:fs");
const edit = (file, changes) => {
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const [path, value] of Object.entries(changes)) {
    const keys = path.split(".");
    const last = keys.pop();
    const parent = keys.reduce((node, key) => node[key], json);
    if (value === null) delete parent[last];
    else parent[last] = value;
  }
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n");
};
edit("messages/en.json", { "hud.visited": null });
edit("messages/id.json", { "hud.visited": null });
'
```
Expected: `rtk git diff --stat messages` shows one deleted line per file (`"visited": "Rooms visited",` and `"visited": "Ruang yang dikunjungi",`). `walk.visited` stays.

- [ ] **Step 5: Run the tests**

Run: `rtk bunx vitest run tests/hud/ProfileCard.test.tsx tests/unit/ui-copy.test.ts tests/unit/experience-data.test.ts`
Expected: PASS (3 files). `roomCount` stays in `ExperienceData` (its test still passes).

- [ ] **Step 6: Commit**

```bash
rtk git add src/hud/ProfileCard.tsx tests/hud/ProfileCard.test.tsx messages/en.json messages/id.json
rtk git commit -m "feat(hud): drop the rooms visited counter from the profile card"
```

---

### Task 2: Boost and sub-step physics (pure)

**Files:**
- Create: `src/experience/rover/boost.ts`
- Modify: `src/experience/rover/controller.ts` (constants block and `step`)
- Modify: `src/experience/input/joystick.ts` (whole file)
- Test: `tests/unit/boost.test.ts` (create)

**Interfaces:**
- Consumes: `RoverTuning`, `stepRover` (`rover/movement.ts`), `Vec2` (`experience/types.ts`), `ROVER` (`config.ts`).
- Produces:
  - `BOOST: { multiplier: 2; rampUp: 8; rampDown: 4; trailMin: 0.05 }`
  - `boostOn(manual: Vec2 | null, held: Iterable<string>, button: boolean): boolean`
  - `boostTuning(tuning: RoverTuning, on: boolean): RoverTuning`
  - `stepBoostLevel(level: number, on: boolean, dt: number): number`
  - `MAX_STEP_DISTANCE = 0.4`, `physicsSteps(dt: number, topSpeed: number): number` (exported from `rover/controller.ts`)
  - `joystick.boost: boolean`, `setBoost(on: boolean): void` (from `input/joystick.ts`)

- [ ] **Step 1: Write the failing test**

Create `tests/unit/boost.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { ROVER } from "@/experience/config";
import { joystick, setBoost } from "@/experience/input/joystick";
import { BOOST, boostOn, boostTuning, stepBoostLevel } from "@/experience/rover/boost";
import { MAX_PHYSICS_STEP, physicsSteps, RoverController } from "@/experience/rover/controller";
import { stepRover, type RoverPose, type RoverTuning } from "@/experience/rover/movement";

const tuning: RoverTuning = {
  maxSpeed: ROVER.maxSpeedFine,
  accel: ROVER.accel,
  braking: ROVER.braking,
  turnRate: ROVER.turnRate,
  radius: ROVER.radius,
  maxTilt: ROVER.maxTilt,
};
const open = { obstacles: [], bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 } };
const start: RoverPose = { x: 0, z: 0, heading: 0, speed: 0, tilt: 0 };
const ahead = { x: 0, z: 1 };

describe("boost", () => {
  it("is on only while driving by hand with Shift or the touch button held", () => {
    expect(boostOn(ahead, ["w"], false)).toBe(false);
    expect(boostOn(ahead, ["w", "shift"], false)).toBe(true);
    expect(boostOn(ahead, ["Shift"], false)).toBe(true);
    expect(boostOn(ahead, [], true)).toBe(true);
    // Autopilot (missions, walks, elevator approach) and click-to-move have no manual input.
    expect(boostOn(null, ["shift"], true)).toBe(false);
    expect(boostOn({ x: 0, z: 0 }, ["shift"], true)).toBe(false);
  });

  it("doubles top speed and acceleration and leaves the rest alone", () => {
    expect(boostTuning(tuning, false)).toBe(tuning);
    expect(boostTuning(tuning, true)).toEqual({
      ...tuning,
      maxSpeed: ROVER.maxSpeedFine * BOOST.multiplier,
      accel: ROVER.accel * BOOST.multiplier,
    });
  });

  it("reaches about twice the cruising speed", () => {
    let p = start;
    for (let i = 0; i < 120; i++) p = stepRover(p, ahead, 1 / 60, boostTuning(tuning, true), open);
    expect(p.speed).toBeCloseTo(18);
  });

  it("eases the trail level in within half a second and out within two", () => {
    let level = 0;
    for (let i = 0; i < 30; i++) level = stepBoostLevel(level, true, 1 / 60);
    expect(level).toBeGreaterThan(0.9);
    for (let i = 0; i < 30; i++) level = stepBoostLevel(level, true, 1 / 60);
    expect(level).toBe(1);
    for (let i = 0; i < 120; i++) level = stepBoostLevel(level, false, 1 / 60);
    expect(level).toBe(0);
  });

  it("shares the touch button state through the joystick module", () => {
    setBoost(true);
    expect(joystick.boost).toBe(true);
    setBoost(false);
    expect(joystick.boost).toBe(false);
  });
});

describe("physics sub-steps", () => {
  it("splits long or fast frames so no sub-step covers more than 0.4 u", () => {
    expect(physicsSteps(1 / 60, 9)).toBe(1);
    expect(physicsSteps(0.25, 9)).toBe(Math.ceil(0.25 / MAX_PHYSICS_STEP));
    expect(physicsSteps(0.25, 18)).toBe(12);
    expect(physicsSteps(0, 18)).toBe(1);
  });

  it("never tunnels through a thin wall at boost speed on slow frames", () => {
    const wall = { minX: -10, maxX: 10, minZ: 5, maxZ: 5.1 };
    const rover = new RoverController({ x: 0, z: 0 }, 0);
    rover.pose = { ...rover.pose, speed: 18 };
    const ctx = { tuning: boostTuning(tuning, true), autopilotSpeed: ROVER.autopilotSpeed, world: { obstacles: [wall], bounds: open.bounds } };
    for (let i = 0; i < 12; i++) rover.step(0.25, ahead, ctx);
    expect(rover.pose.z).toBeLessThanOrEqual(4 + 1e-6);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `rtk bunx vitest run tests/unit/boost.test.ts`
Expected: FAIL, `Failed to resolve import "@/experience/rover/boost"`.

- [ ] **Step 3: Create `src/experience/rover/boost.ts`**

```ts
import type { Vec2 } from "../types";
import type { RoverTuning } from "./movement";

/**
 * Hold-to-boost (owner request): Shift on keyboards, the boost button beside the joystick on touch
 * screens. Manual driving only; the autopilot (missions, walks, the elevator approach) and
 * click-to-move keep their speed. Pure, so Vitest runs it in node.
 */
export const BOOST = {
  /** Top speed and acceleration factor while boosting (9 to 18 u/s on fine pointers). */
  multiplier: 2,
  /** Trail level easing per second, in and out. */
  rampUp: 8,
  rampDown: 4,
  /** Below this level the trail is not drawn (no draw call). */
  trailMin: 0.05,
} as const;

/** True while the visitor drives by hand and holds Shift or the touch boost button. */
export function boostOn(manual: Vec2 | null, held: Iterable<string>, button: boolean): boolean {
  if (!manual || Math.hypot(manual.x, manual.z) < 1e-3) return false;
  if (button) return true;
  for (const key of held) if (key.toLowerCase() === "shift") return true;
  return false;
}

/** Tuning for this frame: boosted top speed and acceleration, everything else unchanged. */
export function boostTuning(tuning: RoverTuning, on: boolean): RoverTuning {
  return on ? { ...tuning, maxSpeed: tuning.maxSpeed * BOOST.multiplier, accel: tuning.accel * BOOST.multiplier } : tuning;
}

/** Eases the visual boost level (0 to 1, drives the trail) toward `on`, snapping the last thousandth. */
export function stepBoostLevel(level: number, on: boolean, dt: number): number {
  const target = on ? 1 : 0;
  const next = level + (target - level) * Math.min(1, dt * (on ? BOOST.rampUp : BOOST.rampDown));
  return Math.abs(target - next) < 1e-3 ? target : next;
}
```

- [ ] **Step 4: Add distance-aware sub-steps to `src/experience/rover/controller.ts`**

Replace:
```ts
/** Largest physics step; longer frames are split so the rover never tunnels through walls. */
export const MAX_PHYSICS_STEP = 1 / 30;
/** Longest frame the simulation accepts (slow devices still move in near real time). */
export const MAX_FRAME_DT = 0.25;
```
with:
```ts
/** Largest physics step; longer frames are split so the rover never tunnels through walls. */
export const MAX_PHYSICS_STEP = 1 / 30;
/** Longest frame the simulation accepts (slow devices still move in near real time). */
export const MAX_FRAME_DT = 0.25;
/** Farthest one sub-step may travel (well under the 1 u rover radius), so boosted driving never tunnels. */
export const MAX_STEP_DISTANCE = 0.4;

/** Sub-steps for a frame of `dt` seconds: none longer than MAX_PHYSICS_STEP or MAX_STEP_DISTANCE at `topSpeed`. */
export function physicsSteps(dt: number, topSpeed: number): number {
  return Math.max(1, Math.ceil(dt / MAX_PHYSICS_STEP), Math.ceil((Math.max(0, topSpeed) * dt) / MAX_STEP_DISTANCE));
}
```
Then in `step`, replace:
```ts
    const dt = Math.min(frameDt, MAX_FRAME_DT);
    const steps = Math.max(1, Math.ceil(dt / MAX_PHYSICS_STEP));
```
with:
```ts
    const dt = Math.min(frameDt, MAX_FRAME_DT);
    const top = Math.max(ctx.tuning.maxSpeed, this.autopilot ? ctx.autopilotSpeed : 0, this.pose.speed);
    const steps = physicsSteps(dt, top);
```

- [ ] **Step 5: Replace `src/experience/input/joystick.ts`**

```ts
/** Shared touch state written by the HUD joystick and boost button, polled by the Director each frame. */
export const joystick = { x: 0, y: 0, active: false, boost: false };

export function setJoystick(x: number, y: number, active: boolean) {
  joystick.x = x;
  joystick.y = y;
  joystick.active = active;
}

/** The hold-to-boost button beside the joystick (released on pointer up, cancel or unmount). */
export function setBoost(on: boolean) {
  joystick.boost = on;
}
```

- [ ] **Step 6: Run the tests**

Run: `rtk bunx vitest run tests/unit/boost.test.ts tests/unit/rover.test.ts`
Expected: PASS (2 files). At 60 fps the sub-step count is unchanged (1), so `rover.test.ts` keeps passing.

- [ ] **Step 7: Commit**

```bash
rtk git add src/experience/rover/boost.ts src/experience/rover/controller.ts src/experience/input/joystick.ts tests/unit/boost.test.ts
rtk git commit -m "feat(rover): pure boost rules and distance-aware physics sub-steps"
```

---
### Task 3: Boost in the world (Director, trail, hints, e2e)

**Files:**
- Modify: `src/experience/rover/runtime.ts` (two fields)
- Modify: `src/experience/scene/Director.tsx` (imports, tuning block, explore step, runtime sync)
- Modify: `src/experience/rover/Rover.tsx` (trail texture, ref, frame update, mesh)
- Modify: `messages/en.json`, `messages/id.json` (`hud.hintFine`, `hud.canvasDescription`)
- Test: `e2e/experience.spec.ts` (three tests in `rover on desktop`)

**Interfaces:**
- Consumes: `boostOn`, `boostTuning`, `stepBoostLevel`, `BOOST` (Task 2), `joystick.boost` (Task 2).
- Produces: `roverRuntime.boost: number` (0 to 1, eased level) and `roverRuntime.trail: number` (opacity drawn this frame, 0 when hidden); both readable in Playwright as `window.__hq.rover.boost` / `.trail`.

- [ ] **Step 1: Write the failing e2e tests**

In `e2e/experience.spec.ts`, replace the import line:
```ts
import { asHumanBrowser, asReturningVisitor, collectErrors, expectRenderBudget, enterHQ, snapshot, waitForCameraSettle, waitForFloor, waitForHQ, waitForHydration, waitForPhase, waitForRoverMove } from "./hq";
```
with:
```ts
import { asHumanBrowser, asReturningVisitor, collectErrors, expectRenderBudget, enterHQ, snapshot, waitForCameraSettle, waitForFloor, waitForHQ, waitForHydration, waitForPhase, waitForRoverMove, waitForSceneLive } from "./hq";
```
Then add this helper after the `touch` helper (above `test.describe("boot and intro"`):
```ts
type Peaks = { speed: number; trail: number };

/** Records the highest rover speed and trail opacity over every rendered frame (the store only syncs every 0.1 s). */
async function trackPeaks(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __hq: { rover: Peaks }; __peaks: Peaks };
    w.__peaks = { speed: 0, trail: 0 };
    const tick = () => {
      w.__peaks.speed = Math.max(w.__peaks.speed, w.__hq.rover.speed);
      w.__peaks.trail = Math.max(w.__peaks.trail, w.__hq.rover.trail);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  return () => page.evaluate(() => (window as unknown as { __peaks: Peaks }).__peaks);
}
```
Then add these tests at the end of `test.describe("rover on desktop", () => {` (after `the Lobby stays under the draw call budget`):
```ts
  test("holding Shift boosts manual driving to about twice the speed, with a trail", async ({ page }) => {
    await enterHQ(page);
    await waitForCameraSettle(page);
    const peaks = await trackPeaks(page);
    // S drives toward the camera: open floor between the spawn and the south-east corner.
    await page.keyboard.down("Shift");
    await page.keyboard.down("s");
    await expect.poll(async () => (await peaks()).speed, { timeout: 20_000 }).toBeGreaterThan(12);
    await page.keyboard.up("s");
    await page.keyboard.up("Shift");
    const { speed, trail } = await peaks();
    expect(speed).toBeLessThanOrEqual(18.01);
    expect(trail).toBeGreaterThan(0);
  });

  test("without Shift the rover keeps its cruising speed and draws no trail", async ({ page }) => {
    await enterHQ(page);
    await waitForCameraSettle(page);
    const peaks = await trackPeaks(page);
    await page.keyboard.down("s");
    await expect.poll(async () => (await peaks()).speed, { timeout: 20_000 }).toBeGreaterThan(8);
    // Proving that nothing more happens: the speed stays at the 9 u/s cap.
    await page.waitForTimeout(500);
    await page.keyboard.up("s");
    const { speed, trail } = await peaks();
    expect(speed).toBeLessThanOrEqual(9.01);
    expect(trail).toBe(0);
  });

  test("reduced motion boosts without the trail", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    // Not enterHQ: it works the same before and after the intro changes of Task 4.
    await asReturningVisitor(page);
    await page.goto("/en?tier=lite");
    await waitForHQ(page);
    await waitForPhase(page, "explore", 30_000);
    await waitForSceneLive(page);
    const peaks = await trackPeaks(page);
    await page.keyboard.down("Shift");
    await page.keyboard.down("s");
    await expect.poll(async () => (await peaks()).speed, { timeout: 20_000 }).toBeGreaterThan(12);
    await page.keyboard.up("s");
    await page.keyboard.up("Shift");
    expect((await peaks()).trail).toBe(0);
    await context.close();
  });
```

- [ ] **Step 2: Build and run them to verify they fail**

Run: `rtk bun run build && rtk bunx playwright test e2e/experience.spec.ts -g "Shift|cruising|reduced motion boosts"`
Expected: FAIL. The Shift test times out at `toBeGreaterThan(12)` (received 9); the reduced-motion test fails the same way.

- [ ] **Step 3: Add the runtime fields in `src/experience/rover/runtime.ts`**

Replace:
```ts
  /** A mission was cancelled: show o_o for 600 ms. */
  cancelFlash: false,
```
with:
```ts
  /** A mission was cancelled: show o_o for 600 ms. */
  cancelFlash: false,
  /** Boost level 0 to 1, eased by the Director while Shift or the touch boost button drives the rover. */
  boost: 0,
  /** Boost trail opacity as drawn this frame (0 when hidden or under reduced motion; test probe). */
  trail: 0,
```

- [ ] **Step 4: Wire the boost in `src/experience/scene/Director.tsx`**

Replace the import line:
```ts
import { cameraRelative, type RoverTuning } from "../rover/movement";
```
with:
```ts
import { boostOn, boostTuning, stepBoostLevel } from "../rover/boost";
import { cameraRelative, type RoverTuning } from "../rover/movement";
```
Replace:
```ts
      radius: ROVER.radius,
      maxTilt: ROVER.maxTilt,
    };

    let y = floorY(s.floor);
```
with:
```ts
      radius: ROVER.radius,
      maxTilt: ROVER.maxTilt,
    };
    // Hold Shift or the touch boost button for about 2x speed: manual driving only, never the autopilot.
    const boosting = boostOn(manual, held.current ?? [], joystick.boost);
    const driveTuning = boostTuning(tuning, boosting);

    let y = floorY(s.floor);
```
Replace:
```ts
      const result = controller.step(dt, manual, { tuning, autopilotSpeed: ROVER.autopilotSpeed, world: layouts[s.floor] });
```
with:
```ts
      const result = controller.step(dt, manual, { tuning: driveTuning, autopilotSpeed: ROVER.autopilotSpeed, world: layouts[s.floor] });
```
Replace:
```ts
    const pose = controller.pose;
    audio.setRumble(pose.speed);
```
with:
```ts
    const pose = controller.pose;
    roverRuntime.boost = stepBoostLevel(roverRuntime.boost, boosting && pose.speed > 1, dt);
    audio.setRumble(pose.speed);
```
(The ride branch keeps `tuning`: manual input there cancels the ride, so a boost never applies to the elevator approach.)

- [ ] **Step 5: Draw the trail in `src/experience/rover/Rover.tsx`**

Replace:
```ts
import { MAX_FRAME_DT } from "./controller";
```
with:
```ts
import { BOOST } from "./boost";
import { MAX_FRAME_DT } from "./controller";
```
Replace:
```ts
const GLOW_CYAN = "#67e8f9";
```
with:
```ts
/** Boost trail: a cyan streak behind the rover, opaque at the rover and fading out behind it. */
function makeTrailTexture() {
  const canvas = makeCanvas(32, 128);
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, "rgba(103,232,249,0)");
    g.addColorStop(1, "rgba(103,232,249,.85)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 128);
  }
  const texture = new GlowTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

const GLOW_CYAN = "#67e8f9";
/** Full trail length behind the rover (u) at boost level 1. */
const TRAIL_LEN = 3.2;
```
Replace:
```ts
  const marker = useRef<Mesh>(null);
  const [glowTexture] = useState(makeGlowTexture);
```
with:
```ts
  const marker = useRef<Mesh>(null);
  const trail = useRef<Mesh>(null);
  const [glowTexture] = useState(makeGlowTexture);
  const [trailTexture] = useState(makeTrailTexture);
```
Replace:
```ts
    const mk = r.marker;
    if (mk.visible) {
```
with:
```ts
    // Boost trail: grows and brightens with the boost level; no trail under reduced motion.
    const level = reduced ? 0 : r.boost;
    r.trail = level > BOOST.trailMin ? level * 0.7 : 0;
    if (trail.current) {
      trail.current.visible = r.trail > 0;
      if (r.trail > 0) {
        trail.current.scale.set(1, level, 1);
        trail.current.position.z = -(0.7 + (TRAIL_LEN * level) / 2);
        (trail.current.material as MeshBasicMaterial).opacity = r.trail;
      }
    }

    const mk = r.marker;
    if (mk.visible) {
```
Replace:
```tsx
        {tier === "full" && <pointLight color={GLOW_CYAN} intensity={8} distance={7} decay={2} position={[0, 0.6, 0]} />}
```
with:
```tsx
        {/* Local -z is behind the rover; the plane's +y edge (transparent end of the gradient) points there. */}
        <mesh ref={trail} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, -0.7]} visible={false} raycast={() => null}>
          <planeGeometry args={[1.1, TRAIL_LEN]} />
          <meshBasicMaterial map={trailTexture} transparent opacity={0} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
        {tier === "full" && <pointLight color={GLOW_CYAN} intensity={8} distance={7} decay={2} position={[0, 0.6, 0]} />}
```

- [ ] **Step 6: Mention the boost in the keyboard hint and the canvas description**

Run:
```bash
rtk bun -e '
const fs = require("node:fs");
const edit = (file, changes) => {
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const [path, value] of Object.entries(changes)) {
    const keys = path.split(".");
    const last = keys.pop();
    const parent = keys.reduce((node, key) => node[key], json);
    if (value === null) delete parent[last];
    else parent[last] = value;
  }
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n");
};
const en = JSON.parse(fs.readFileSync("messages/en.json", "utf8"));
const id = JSON.parse(fs.readFileSync("messages/id.json", "utf8"));
edit("messages/en.json", {
  "hud.hintFine": "Drive: WASD or arrows · Boost: hold Shift · Move: click floor · Rotate: drag or Q/E · Floors: scroll or PgUp/PgDn",
  "hud.canvasDescription": en.hud.canvasDescription.replace("Use WASD or arrow keys to drive, or click", "Use WASD or arrow keys to drive (hold Shift to boost), or click"),
});
edit("messages/id.json", {
  "hud.hintFine": "Kemudi: WASD atau panah · Turbo: tahan Shift · Gerak: klik lantai · Putar: seret atau Q/E · Lantai: scroll atau PgUp/PgDn",
  "hud.canvasDescription": id.hud.canvasDescription.replace("untuk menyetir, atau klik", "untuk menyetir (tahan Shift untuk turbo), atau klik"),
});
'
rtk git diff --stat messages
```
Expected: 2 changed lines per file (`hintFine`, `canvasDescription`); `grep -c "hold Shift to boost" messages/en.json` prints `1`, `grep -c "tahan Shift untuk turbo" messages/id.json` prints `1`.

- [ ] **Step 7: Run unit checks, build and the e2e tests**

Run: `rtk bun run typecheck && rtk bunx vitest run tests/unit/ui-copy.test.ts tests/content/fonts.test.ts tests/unit/boost.test.ts && rtk bun run build && rtk bunx playwright test e2e/experience.spec.ts -g "Shift|cruising|reduced motion boosts|draw call budget"`
Expected: typecheck clean, 3 Vitest files PASS, 4 Playwright tests PASS (the Lobby draw call budget test proves the idle trail costs no draw call).

- [ ] **Step 8: Commit**

```bash
rtk git add src/experience/rover/runtime.ts src/experience/scene/Director.tsx src/experience/rover/Rover.tsx messages/en.json messages/id.json e2e/experience.spec.ts
rtk git commit -m "feat(rover): hold Shift to boost with a short trail"
```

---

### Task 4: Unskippable boot and intro, once per browser session

**Files:**
- Create: `src/lib/intro-session.ts`, `tests/unit/intro-session.test.ts`, `tests/hud/BootOverlay.test.tsx`
- Modify: `src/experience/Experience.tsx` (import, `startSession`, one effect)
- Modify: `src/components/BootCard.tsx` (whole file), `src/components/BootCover.tsx` (one prop), `src/hud/BootOverlay.tsx` (whole file)
- Modify: `src/hud/Hud.tsx` (remove `IntroSkip`)
- Modify: `src/experience/scene/Director.tsx` (`cancel` case)
- Modify: `src/experience/camera/rigs.ts` (new export), `src/experience/camera/CameraDirector.tsx` (intro branch, cut)
- Modify: `src/experience/missions/host3d.ts` (`afterIntro`, three methods)
- Modify: `messages/en.json`, `messages/id.json` (delete `hud.skipIntro`)
- Modify: `tests/unit/rigs.test.ts`, `tests/unit/missions-host3d.test.ts`
- Modify: `e2e/hq.ts`, `e2e/experience.spec.ts`, `e2e/career.spec.ts`, `e2e/library-roof.spec.ts`, `e2e/screenshots.spec.ts`
- Modify: `scripts/e2e-plan.ts`, `tests/unit/e2e-plan.test.ts`

**Interfaces:**
- Consumes: `INTRO_ORBIT`, `INTRO_DURATION`, `introPose`, `CameraPose`, `ViewportClass` (`camera/rigs.ts`); store `finishIntro`, `setPhase`.
- Produces:
  - `INTRO_KEY = "hq:intro"`; `interface SessionLike { getItem(key: string): string | null; setItem(key: string, value: string): void }`
  - `introSeen(storage?: SessionLike | null): boolean`, `markIntroSeen(storage?: SessionLike | null): void`, `lobbyStartPhase(seen: boolean): "boot" | "explore"`
  - `reducedIntroPose(cls: ViewportClass, end: CameraPose): CameraPose`
  - `BootCardProps` without `skipLabel`/`onSkip`, with `startDisabled?: boolean`
  - E2E: `asReturningVisitor(page)` sets `sessionStorage["hq:intro"] = "seen"`; `enterHQ(page, { path?, tier? })` waits for explore and `waitForSceneLive` (no Skip click).

- [ ] **Step 1: Write the failing unit tests**

Create `tests/unit/intro-session.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { INTRO_KEY, introSeen, lobbyStartPhase, markIntroSeen, type SessionLike } from "@/lib/intro-session";

const memory = () => {
  const data = new Map<string, string>();
  const storage: SessionLike = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
  return { data, storage };
};
const broken: SessionLike = {
  getItem: () => {
    throw new Error("denied");
  },
  setItem: () => {
    throw new Error("denied");
  },
};

describe("intro session flag", () => {
  it("plays the full boot and intro until they finished once in this session", () => {
    const { data, storage } = memory();
    expect(introSeen(storage)).toBe(false);
    expect(lobbyStartPhase(introSeen(storage))).toBe("boot");
    markIntroSeen(storage);
    expect(data.get(INTRO_KEY)).toBe("seen");
    expect(lobbyStartPhase(introSeen(storage))).toBe("explore");
  });

  it("treats unavailable storage as a new session, so the intro plays", () => {
    expect(introSeen(broken)).toBe(false);
    expect(() => markIntroSeen(broken)).not.toThrow();
    expect(introSeen(null)).toBe(false);
  });
});
```
Create `tests/hud/BootOverlay.test.tsx`:
```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import { BootOverlay } from "@/hud/BootOverlay";
import { getHQStore } from "@/store/useHQStore";

const LINES = 6;
const LINE_MS = 180;

function renderOverlay() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <BootOverlay name="Kurniadi Ahmad Wijaya" monogram="KAW" />
    </NextIntlClientProvider>,
  );
}

const typeAll = () => {
  for (let i = 0; i < LINES; i++) act(() => void vi.advanceTimersByTime(LINE_MS));
};

beforeEach(() => {
  vi.useFakeTimers();
  getHQStore().setState({ phase: "boot", reducedMotion: false });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("BootOverlay", () => {
  it("has no skip and only boots once the log has typed out", () => {
    renderOverlay();
    expect(screen.queryByRole("button", { name: /skip/i })).toBeNull();
    const start = screen.getByRole("button", { name: en.hud.bootStart });
    expect(start).toHaveFocus();
    expect(start).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(start);
    expect(getHQStore().getState().phase).toBe("boot");
    typeAll();
    expect(start).not.toHaveAttribute("aria-disabled");
    fireEvent.click(start);
    expect(getHQStore().getState().phase).toBe("intro");
  });

  it("types the log at the same pace with reduced motion", () => {
    getHQStore().setState({ reducedMotion: true });
    renderOverlay();
    const start = screen.getByRole("button", { name: en.hud.bootStart });
    expect(start).toHaveAttribute("aria-disabled", "true");
    typeAll();
    expect(start).not.toHaveAttribute("aria-disabled");
  });
});
```
In `tests/unit/rigs.test.ts`, replace the import block:
```ts
import {
  followPose,
  forwardOf,
  INTRO_DURATION,
  INTRO_SWEEP,
  introAngle,
  introPose,
  PITCH_LIMITS,
  railPose,
  railShift,
  selectRig,
  springFactor,
} from "@/experience/camera/rigs";
```
with:
```ts
import {
  followPose,
  forwardOf,
  INTRO_DURATION,
  INTRO_ORBIT,
  INTRO_SWEEP,
  introAngle,
  introPose,
  PITCH_LIMITS,
  railPose,
  railShift,
  reducedIntroPose,
  selectRig,
  springFactor,
} from "@/experience/camera/rigs";
```
and add inside `describe("camera rigs", () => {` (after the first `it`):
```ts
  it("holds one still exterior shot for the reduced-motion intro", () => {
    const end = followPose("desktop", [14, 1, 10]);
    const still = reducedIntroPose("desktop", end);
    expect(still).toEqual(introPose("desktop", INTRO_ORBIT, end));
    expect(still.position[1]).toBeGreaterThan(end.position[1]);
  });
```
In `tests/unit/missions-host3d.test.ts`, replace the whole test:
```ts
  it("finishes the intro before a mission rides the elevator", async () => {
    const { store, host } = setup();
    store.getState().setPhase("intro");
    await host.elevator("L2", { signal: signal(), missionId: "m" });
    expect(store.getState().floor).toBe("L2");
  });
```
with:
```ts
  /** A host whose frame loop ends the intro on the third frame (the camera's job), recording phases. */
  function introSetup() {
    const store = createHQStore(memory());
    store.getState().setPhase("intro");
    const rover: RoverChannel = { autopilot: null, cancelFlash: false };
    const deps: HostDeps = { locale: "en", rooms: ROOMS, navigate: vi.fn(), say: vi.fn(), openPalette: vi.fn() };
    const phases: string[] = [];
    const tick = async () => {
      const s = store.getState();
      phases.push(s.phase);
      if (phases.length === 3 && s.phase === "intro") s.finishIntro();
      if (s.ride) s.arriveFloor(s.ride.to);
      if (rover.autopilot) rover.autopilot.state = "done";
    };
    return { store, phases, host: create3DHost(deps, { store, rover, layouts, years, tick }) };
  }

  it("waits for the intro to end before a mission rides the elevator (nothing skips it)", async () => {
    const { store, phases, host } = introSetup();
    await host.elevator("L2", { signal: signal(), missionId: "m" });
    expect(phases.slice(0, 3)).toEqual(["intro", "intro", "intro"]);
    expect(store.getState()).toMatchObject({ floor: "L2", phase: "explore" });
  });

  it("opens a room and drives only after the intro", async () => {
    const { store, phases, host } = introSetup();
    await host.openRoom("L1:skills", undefined, { signal: signal(), missionId: "m" });
    expect(phases.slice(0, 3)).toEqual(["intro", "intro", "intro"]);
    expect(store.getState()).toMatchObject({ phase: "room", activeRoom: "L1:skills" });
    const second = introSetup();
    await second.host.driveTo({ x: 5, z: 5 }, { signal: signal(), missionId: "m" });
    expect(second.phases.slice(0, 3)).toEqual(["intro", "intro", "intro"]);
  });
```
In `tests/unit/e2e-plan.test.ts`, add to `it("maps floor code to its spec", () => {`:
```ts
    expect(specsForChanges(["src/lib/intro-session.ts"]).specs).toEqual(["boot-first", "experience"]);
    expect(specsForChanges(["src/components/BootCard.tsx"]).specs).toEqual(["boot-first", "experience"]);
```

- [ ] **Step 2: Run them to verify they fail**

Run: `rtk bunx vitest run tests/unit/intro-session.test.ts tests/hud/BootOverlay.test.tsx tests/unit/rigs.test.ts tests/unit/missions-host3d.test.ts tests/unit/e2e-plan.test.ts`
Expected: FAIL: `Failed to resolve import "@/lib/intro-session"`; BootOverlay finds a `Skip intro` button; `reducedIntroPose is not a function`; host3d `expected [ 'elevator', ... ] to deeply equal [ 'intro', 'intro', 'intro' ]`; e2e-plan maps `src/lib/intro-session.ts` to `["pageview", "static-routes"]`.

- [ ] **Step 3: Create `src/lib/intro-session.ts`**

```ts
/**
 * The full boot and intro play once per browser session and cannot be skipped (owner decision,
 * October 2026). The flag lives in sessionStorage: later Lobby loads in the same tab open straight
 * in explore, a new session (or tab) plays them again. Deep links and language switches never play
 * them (Experience `startSession`).
 */
export const INTRO_KEY = "hq:intro";

export interface SessionLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function session(): SessionLike | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

export function introSeen(storage: SessionLike | null = session()): boolean {
  try {
    return storage?.getItem(INTRO_KEY) === "seen";
  } catch {
    return false;
  }
}

export function markIntroSeen(storage: SessionLike | null = session()): void {
  try {
    storage?.setItem(INTRO_KEY, "seen");
  } catch {
    // Storage can be unavailable; the intro then plays again on the next load.
  }
}

/** First phase of a Lobby session: the boot overlay until the intro played in this session, then explore. */
export function lobbyStartPhase(seen: boolean): "boot" | "explore" {
  return seen ? "explore" : "boot";
}
```

- [ ] **Step 4: Start the Lobby from the flag and mark it in `src/experience/Experience.tsx`**

Replace:
```ts
import { formatYearMonth } from "@/lib/format";
```
with:
```ts
import { formatYearMonth } from "@/lib/format";
import { introSeen, lobbyStartPhase, markIntroSeen } from "@/lib/intro-session";
```
Replace:
```ts
    s.setPhase(s.firstVisit ? "boot" : "intro");
```
with:
```ts
    // Boot and intro play in full once per browser session; later Lobby loads go straight in.
    s.setPhase(lobbyStartPhase(introSeen()));
```
Replace:
```ts
  // The audio engine owns the sound setting (localStorage "hq:sound", on unless the visitor muted);
```
with:
```ts
  // The intro played to its end: later Lobby loads in this session open straight in explore.
  useEffect(
    () =>
      getHQStore().subscribe((s, prev) => {
        if (prev.phase === "intro" && s.phase === "explore") markIntroSeen();
      }),
    [],
  );

  // The audio engine owns the sound setting (localStorage "hq:sound", on unless the visitor muted);
```

- [ ] **Step 5: Replace `src/components/BootCard.tsx`**

```tsx
import type { Ref } from "react";
import { splitBootLine } from "@/lib/boot-first";

export interface BootCardProps {
  eyebrow: string;
  monogram: string;
  title: string;
  titleId?: string;
  lines: string[];
  /** Number of lines shown; the rest keep their space so the card never changes height. */
  shown: number;
  /** CSS-staggered line reveal (the SSR cover, which has no JS yet). */
  stagger?: boolean;
  startLabel: string;
  onStart?: () => void;
  /** The log is still typing: Boot rover stays focusable but does nothing yet (the boot is never skipped). */
  startDisabled?: boolean;
  startRef?: Ref<HTMLButtonElement>;
  /** Render the button invisible (cover): same layout as the overlay, nothing to click or focus. */
  placeholder?: boolean;
}

/**
 * The boot card shared by the SSR boot cover and the 3D boot overlay, so the handoff from one to
 * the other does not move a pixel. Plain markup (no hooks), usable from server and client components.
 * There is no skip: the boot and the intro always play in full (owner decision).
 */
export function BootCard({ startRef, ...p }: BootCardProps) {
  return (
    <div className="hq-boot-card">
      <p className="eyebrow">{p.eyebrow}</p>
      <p className="mt-3 font-mono text-sm text-cyan">{p.monogram}</p>
      <p id={p.titleId} className="mt-2 text-2xl font-extrabold text-ink">
        {p.title}
      </p>
      <ol className="hq-boot-log mt-5">
        {p.lines.map((line, i) => {
          const { ok, text } = splitBootLine(line);
          return (
            <li
              key={line}
              data-shown={i < p.shown ? "" : undefined}
              style={p.stagger ? { animationDelay: `${120 + i * 220}ms` } : undefined}
              className={p.stagger ? "hq-boot-line-in" : undefined}
            >
              {ok ? <span className="text-green">[ok]</span> : null} {text}
            </li>
          );
        })}
      </ol>
      <div className="hq-boot-bar" />
      <div className={`mt-6 flex flex-wrap gap-3 ${p.placeholder ? "invisible" : ""}`}>
        <button
          ref={startRef}
          type="button"
          onClick={p.onStart}
          aria-disabled={p.startDisabled || undefined}
          tabIndex={p.placeholder ? -1 : undefined}
          className={`inline-flex min-h-11 items-center rounded-xl bg-[#6366f1] px-6 py-3 font-semibold text-white shadow-[0_0_30px_rgba(99,102,241,.55)] transition hover:bg-[#6366f1]/85 ${
            p.startDisabled ? "cursor-wait opacity-70" : ""
          }`}
        >
          {p.startLabel}
        </button>
      </div>
    </div>
  );
}
```
In `src/components/BootCover.tsx` delete the line:
```tsx
        skipLabel={t("skipIntro")}
```

- [ ] **Step 6: Replace `src/hud/BootOverlay.tsx`**

```tsx
"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { BootCard } from "@/components/BootCard";
import { bootCoverUsed } from "@/lib/boot-first";
import { useHQStore } from "@/store/useHQStore";

const LINE_MS = 180;

/**
 * Boot overlay, once per browser session: up to 6 terminal lines and a Boot rover button (appendix
 * 02 section 2). Nothing skips it (owner decision): Boot rover starts the intro only once the log
 * has typed out, at the same pace with reduced motion (revealing lines is not motion). Same card as
 * the SSR boot cover (BootCard); when the cover was shown, its log already played, so the overlay
 * starts with every line visible and the handoff does not restart the animation.
 */
export function BootOverlay({ name, monogram }: { name: string; monogram: string }) {
  const t = useTranslations("hud");
  const setPhase = useHQStore((s) => s.setPhase);
  const lines = [t("bootLine1"), t("bootLine2"), t("bootLine3"), t("bootLine4", { name }), t("bootLine5"), t("bootLine6")];
  const [typed, setTyped] = useState(() => (bootCoverUsed() ? lines.length : 0));
  const ready = typed >= lines.length;
  const start = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    start.current?.focus();
  }, []);

  useEffect(() => {
    if (ready) return;
    const id = window.setTimeout(() => setTyped((n) => n + 1), LINE_MS);
    return () => window.clearTimeout(id);
  }, [typed, ready]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="hq-boot-title"
      className="hq-boot-backdrop pointer-events-auto absolute inset-0 grid place-items-center p-4"
      data-testid="boot"
    >
      <BootCard
        eyebrow={t("bootEyebrow")}
        monogram={monogram}
        title={t("bootTitle")}
        titleId="hq-boot-title"
        lines={lines}
        shown={typed}
        startLabel={t("bootStart")}
        startDisabled={!ready}
        startRef={start}
        onStart={() => {
          if (ready) setPhase("intro");
        }}
      />
    </div>
  );
}
```

- [ ] **Step 7: Remove the in-world Skip button from `src/hud/Hud.tsx`**

Delete the whole `IntroSkip` function:
```tsx
function IntroSkip() {
  const t = useTranslations("hud");
  const finishIntro = useHQStore((s) => s.finishIntro);
  return (
    <button
      type="button"
      onClick={finishIntro}
      className="glass glass-solid pointer-events-auto absolute bottom-20 left-1/2 inline-flex min-h-11 -translate-x-1/2 items-center gap-2 rounded-full px-5 text-sm font-semibold text-ink"
    >
      {t("skipIntro")}
      <kbd className="label rounded border border-glass-border px-1.5 py-0.5 text-ink-3">Esc</kbd>
    </button>
  );
}
```
and replace:
```tsx
          {phase === "intro" ? <IntroSkip /> : phase !== "room" && !walking && <HintBar coarse={coarse} mobile={mobile} />}
```
with:
```tsx
          {phase !== "intro" && phase !== "room" && !walking && <HintBar coarse={coarse} mobile={mobile} />}
```

- [ ] **Step 8: Esc no longer ends the intro (`src/experience/scene/Director.tsx`)**

Replace:
```ts
        case "cancel":
          if (s.phase === "intro") s.finishIntro();
          else if (s.ride?.stage === "toDoor") {
```
with:
```ts
        case "cancel":
          // Esc never skips the boot or the intro (owner decision); it stops elevator drives and click-to-move.
          if (s.phase === "boot" || s.phase === "intro") break;
          if (s.ride?.stage === "toDoor") {
```

- [ ] **Step 9: Reduced motion keeps the intro length (`rigs.ts`, `CameraDirector.tsx`)**

In `src/experience/camera/rigs.ts`, add after the `introPose` function:
```ts
/** Reduced motion: one still exterior shot (the end of the orbit) held for the whole intro, then a cut to the follow camera. */
export function reducedIntroPose(cls: ViewportClass, end: CameraPose): CameraPose {
  return introPose(cls, INTRO_ORBIT, end);
}
```
In `src/experience/camera/CameraDirector.tsx`, replace:
```ts
  INTRO_DURATION,
  introPose,
  railPose,
```
with:
```ts
  INTRO_DURATION,
  introPose,
  railPose,
  reducedIntroPose,
```
Replace:
```ts
    shift: { x: 0, y: 0 },
  });
```
with:
```ts
    shift: { x: 0, y: 0 },
    /** Reduced motion: cut (no glide) from the still intro shot to the follow camera on the next frame. */
    cut: false,
  });
```
Replace:
```ts
      } else if (s.reducedMotion) {
        desired = end;
        s.finishIntro();
      } else {
        l.introStart ??= l.now;
        const t = l.now - l.introStart;
        desired = introPose(cls, t, end);
        if (t >= INTRO_DURATION) s.finishIntro();
      }
```
with:
```ts
      } else {
        // The intro always runs its full length; reduced motion holds a still exterior shot instead of the orbit.
        l.introStart ??= l.now;
        const t = l.now - l.introStart;
        desired = s.reducedMotion ? reducedIntroPose(cls, end) : introPose(cls, t, end);
        if (t >= INTRO_DURATION) {
          s.finishIntro();
          l.cut = s.reducedMotion;
        }
      }
```
Replace:
```ts
    l.desiredPos.set(...desired.position);
```
with:
```ts
    if (l.cut && rig !== "intro") {
      snap = true;
      l.cut = false;
    }

    l.desiredPos.set(...desired.position);
```

- [ ] **Step 10: Missions wait for the intro (`src/experience/missions/host3d.ts`)**

Replace:
```ts
  const waitUntil = async (done: () => boolean, signal: AbortSignal) => {
    while (!signal.aborted && !done()) await tick();
  };
```
with:
```ts
  const waitUntil = async (done: () => boolean, signal: AbortSignal) => {
    while (!signal.aborted && !done()) await tick();
  };
  /** The boot and the intro always play in full: a mission started meanwhile waits (owner decision). */
  const afterIntro = (signal: AbortSignal) =>
    waitUntil(() => {
      const phase = store.getState().phase;
      return phase !== "boot" && phase !== "intro";
    }, signal);
```
Replace:
```ts
    async elevator(floor, ctx: StepContext) {
      const s = store.getState();
      if (s.phase === "boot" || s.phase === "intro") s.finishIntro();
```
with:
```ts
    async elevator(floor, ctx: StepContext) {
      await afterIntro(ctx.signal);
      if (ctx.signal.aborted) return;
      const s = store.getState();
```
Replace:
```ts
    async driveTo(target, ctx) {
      // Driving to another spot leaves the open room (appendix 02: room to explore on drive away).
```
with:
```ts
    async driveTo(target, ctx) {
      await afterIntro(ctx.signal);
      if (ctx.signal.aborted) return;
      // Driving to another spot leaves the open room (appendix 02: room to explore on drive away).
```
Replace:
```ts
    async openRoom(id, tab) {
      const room = byId.get(id);
```
with:
```ts
    async openRoom(id, tab, ctx) {
      await afterIntro(ctx.signal);
      if (ctx.signal.aborted) return;
      const room = byId.get(id);
```

- [ ] **Step 11: Delete the Skip string and map the new paths for `e2e:changed`**

Run:
```bash
rtk bun -e '
const fs = require("node:fs");
const edit = (file, changes) => {
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const [path, value] of Object.entries(changes)) {
    const keys = path.split(".");
    const last = keys.pop();
    const parent = keys.reduce((node, key) => node[key], json);
    if (value === null) delete parent[last];
    else parent[last] = value;
  }
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n");
};
edit("messages/en.json", { "hud.skipIntro": null });
edit("messages/id.json", { "hud.skipIntro": null });
'
```
In `scripts/e2e-plan.ts`, replace:
```ts
  { test: /^src\/experience\/ExperienceGate\.tsx$|^src\/lib\/(boot-first|gpu-tier)\.ts$|^src\/components\/BootCover\.tsx$/, specs: ["boot-first", "experience"] },
```
with:
```ts
  { test: /^src\/experience\/ExperienceGate\.tsx$|^src\/lib\/(boot-first|gpu-tier|intro-session)\.ts$|^src\/components\/Boot(Cover|Card)\.tsx$/, specs: ["boot-first", "experience"] },
```

- [ ] **Step 12: Run the unit tests**

Run: `rtk bunx vitest run tests/unit/intro-session.test.ts tests/hud/BootOverlay.test.tsx tests/unit/rigs.test.ts tests/unit/missions-host3d.test.ts tests/unit/e2e-plan.test.ts tests/unit/store.test.ts tests/unit/ui-copy.test.ts && rtk bun run typecheck && rtk bun run lint`
Expected: 7 files PASS; typecheck and lint clean (no `useHQStore` or `finishIntro` left unused in `Hud.tsx`).

- [ ] **Step 13: Update the e2e helpers (`e2e/hq.ts`)**

Replace:
```ts
/** Marks the visitor as returning, so the boot overlay is skipped and only the intro plays. */
export async function asReturningVisitor(page: Page) {
  await page.addInitScript(() => {
    // The Rover Terminal auto-opens once per browser; tests open it explicitly.
    localStorage.setItem("hq:terminal-seen", "1");
```
with:
```ts
/**
 * Marks the visitor as returning in this browser session: the boot and the intro already played
 * (`hq:intro`), so the Lobby opens straight in explore. Nothing can skip them any more.
 */
export async function asReturningVisitor(page: Page) {
  await page.addInitScript(() => {
    // The Rover Terminal auto-opens once per browser; tests open it explicitly.
    localStorage.setItem("hq:terminal-seen", "1");
    sessionStorage.setItem("hq:intro", "seen");
```
Replace:
```ts
/** Opens /en (or `path`) as a returning visitor, skips the intro and waits for explore. */
export async function enterHQ(page: Page, { path = "/en", tier = "lite" }: { path?: string; tier?: string } = {}) {
  await asReturningVisitor(page);
  await page.goto(`${path}?tier=${tier}`);
  await waitForHQ(page);
  await page.getByRole("button", { name: /Skip intro|Lewati intro/ }).click();
  await waitForPhase(page, "explore");
}
```
with:
```ts
/** Opens /en (or `path`) as a returning visitor (intro already played this session) and waits until input is handled. */
export async function enterHQ(page: Page, { path = "/en", tier = "lite" }: { path?: string; tier?: string } = {}) {
  await asReturningVisitor(page);
  await page.goto(`${path}?tier=${tier}`);
  await waitForHQ(page);
  await waitForPhase(page, "explore");
  await waitForSceneLive(page);
}
```

- [ ] **Step 14: Rewrite the boot and intro e2e tests (`e2e/experience.spec.ts`)**

Replace the import line (as left by Task 3):
```ts
import { asHumanBrowser, asReturningVisitor, collectErrors, expectRenderBudget, enterHQ, snapshot, waitForCameraSettle, waitForFloor, waitForHQ, waitForHydration, waitForPhase, waitForRoverMove, waitForSceneLive } from "./hq";
```
with:
```ts
import { asHumanBrowser, asReturningVisitor, collectErrors, expectRenderBudget, enterHQ, snapshot, waitForCameraSettle, waitForFloor, waitForFrames, waitForHQ, waitForHydration, waitForPhase, waitForRoverMove, waitForSceneLive } from "./hq";
```
Replace the two tests `first visit shows the boot overlay, then the intro, then explore` and `reduced motion skips the orbit` (the first two tests in `test.describe("boot and intro"`) with:
```ts
  test("the boot and the intro play in full once per session; nothing skips them", async ({ page }) => {
    const errors = collectErrors(page);
    await page.addInitScript(() => localStorage.setItem("hq:terminal-seen", "1"));
    await page.goto("/en?tier=lite");
    await waitForHQ(page);
    const boot = page.getByTestId("boot");
    await expect(boot).toBeVisible();
    await expect(page.getByRole("button", { name: /skip/i })).toHaveCount(0);
    const start = boot.getByRole("button", { name: "Boot rover" });
    await expect(start).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(boot).toBeVisible();
    await expect(start).not.toHaveAttribute("aria-disabled", "true");
    await start.click();
    await waitForPhase(page, "intro");
    const introAt = Date.now();
    // Esc used to skip the intro; proving that it no longer does.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    expect((await snapshot(page)).phase).toBe("intro");
    await waitForPhase(page, "explore", 30_000);
    expect(Date.now() - introAt).toBeGreaterThanOrEqual(2000);
    expect(await page.evaluate(() => sessionStorage.getItem("hq:intro"))).toBe("seen");

    // Same session: straight into the Lobby, no boot and no intro.
    await page.reload();
    await waitForHQ(page);
    expect((await snapshot(page)).phase).toBe("explore");
    await expect(page.getByTestId("boot")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("a new session plays the boot again, even for a returning visitor", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript(() => {
      localStorage.setItem("hq:terminal-seen", "1");
      localStorage.setItem("hq:v1", JSON.stringify({ state: { firstVisit: false, visited: [], locale: "en", sound: false }, version: 1 }));
    });
    await page.goto("/en?tier=lite");
    await waitForHQ(page);
    await expect(page.getByTestId("boot")).toBeVisible();
    expect((await snapshot(page)).phase).toBe("boot");
    await context.close();
  });

  test("reduced motion holds a still intro of the same length", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.addInitScript(() => localStorage.setItem("hq:terminal-seen", "1"));
    await page.goto("/en?tier=lite");
    await waitForHQ(page);
    const start = page.getByTestId("boot").getByRole("button", { name: "Boot rover" });
    await expect(start).not.toHaveAttribute("aria-disabled", "true");
    await start.click();
    await waitForPhase(page, "intro");
    const introAt = Date.now();
    await waitForFrames(page, 3);
    const read = () =>
      page.evaluate(() => {
        const w = window as unknown as { __hq: { camera: () => number[]; store: { getState: () => { phase: string } } } };
        return { camera: w.__hq.camera(), phase: w.__hq.store.getState().phase };
      });
    const a = await read();
    await page.waitForTimeout(300);
    const b = await read();
    expect(b.phase).toBe("intro");
    expect(Math.hypot(a.camera[0] - b.camera[0], a.camera[1] - b.camera[1], a.camera[2] - b.camera[2])).toBeLessThan(0.01);
    await waitForPhase(page, "explore", 30_000);
    expect(Date.now() - introAt).toBeGreaterThanOrEqual(2000);
    await context.close();
  });
```
In the `sound is on by default` test, delete the line:
```ts
    await page.getByRole("button", { name: /Skip intro|Lewati intro/ }).click();
```
Replace the test `the terminal opens after the intro on the first visit` with:
```ts
  test("the terminal opens after the intro on the first visit", async ({ page }) => {
    await page.goto("/en?tier=lite");
    await waitForHQ(page);
    await page.waitForTimeout(1200);
    await expect(page.getByRole("dialog", { name: "Rover Terminal" })).toHaveCount(0);
    const start = page.getByTestId("boot").getByRole("button", { name: "Boot rover" });
    await expect(start).not.toHaveAttribute("aria-disabled", "true");
    await start.click();
    await expect(page.getByRole("dialog", { name: "Rover Terminal" })).toBeVisible({ timeout: 30_000 });
  });
```

- [ ] **Step 15: Drop the remaining Skip references in other specs**

Delete this line in `e2e/career.spec.ts`:
```ts
    await expect(page.getByRole("button", { name: /Skip intro/ })).toHaveCount(0);
```
Delete this line in `e2e/library-roof.spec.ts`:
```ts
    await expect(page.getByRole("button", { name: "Skip intro" })).toHaveCount(0);
```
In `e2e/screenshots.spec.ts` (`open3D`), delete:
```ts
  await page.getByRole("button", { name: /Skip intro/ }).click();
```
Then run: `grep -rnE "Skip intro|skipIntro|Lewati intro" src e2e tests messages`
Expected: no output.

- [ ] **Step 16: Build and run the affected e2e specs**

Run: `rtk bun run build && rtk bunx playwright test e2e/experience.spec.ts e2e/boot-first.spec.ts`
Expected: all PASS, including the three new boot tests and the reworded terminal test.

- [ ] **Step 17: Commit**

```bash
rtk git add src/lib/intro-session.ts src/experience/Experience.tsx src/components/BootCard.tsx src/components/BootCover.tsx src/hud/BootOverlay.tsx src/hud/Hud.tsx src/experience/scene/Director.tsx src/experience/camera/rigs.ts src/experience/camera/CameraDirector.tsx src/experience/missions/host3d.ts messages/en.json messages/id.json scripts/e2e-plan.ts tests/unit/intro-session.test.ts tests/hud/BootOverlay.test.tsx tests/unit/rigs.test.ts tests/unit/missions-host3d.test.ts tests/unit/e2e-plan.test.ts e2e/hq.ts e2e/experience.spec.ts e2e/career.spec.ts e2e/library-roof.spec.ts e2e/screenshots.spec.ts
rtk git commit -m "feat(hq): unskippable boot and intro, once per browser session"
```

---
### Task 5: Rename "Missions" to "Ask Rover" (ID "Tanya Rover")

**Files:**
- Modify: `messages/en.json`, `messages/id.json` (`hud.launcher`, `hud.terminal`, `hud.palette`, `hud.kioskTitle`, `hud.kioskHint`)
- Modify: `src/hud/HudLaunchers.tsx` (label key, doc comment)
- Modify: `tests/hud/RoverTerminal.test.tsx`, `tests/hud/MissionHud.test.tsx`
- Modify: `e2e/experience.spec.ts`, `e2e/missions.spec.ts`, `e2e/ask.spec.ts`, `e2e/walk.spec.ts`, `e2e/library-roof.spec.ts`, `e2e/screenshots.spec.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: message key `hud.launcher.askRover` (replaces `hud.launcher.missions`). User-facing names: HUD and Page View header button "Ask Rover", terminal dialog "Ask Rover", Cmd-K group "Ask Rover", prompt `rover@hq:~$ ./ask-rover`. Code names and the palette group id `missions` are unchanged. E2E finds the button with `{ name: "Ask Rover", exact: true }` (the Ask AI pill also starts with "Ask") and the terminal with `getByRole("dialog", { name: "Ask Rover" })`.

Final strings:

| Key | EN | ID |
|---|---|---|
| `hud.launcher.askRover` | Ask Rover | Tanya Rover |
| `hud.terminal.title` | Ask Rover | Tanya Rover |
| `hud.terminal.prompt` | rover@hq:~$ ./ask-rover | rover@hq:~$ ./ask-rover |
| `hud.terminal.options` | Ask Rover options | Pilihan Tanya Rover |
| `hud.palette.label` | Search Ask Rover, rooms, years and actions | Cari Tanya Rover, ruang, tahun, dan perintah |
| `hud.palette.placeholder` | Find an Ask Rover pick, room, year or action | Cari pilihan Tanya Rover, ruang, tahun, atau perintah |
| `hud.palette.groups.missions` | Ask Rover | Tanya Rover |
| `hud.kioskTitle` | rover@hq:~$ ./ask-rover | rover@hq:~$ ./ask-rover |
| `hud.kioskHint` | Select the kiosk or the rover to open Ask Rover | Pilih kios atau rover untuk membuka Tanya Rover |

(`hud.status.running`, `.cancel`, `.cancelled` are not rendered anywhere today, so they stay untouched.)

- [ ] **Step 1: Update the tests first**

Run:
```bash
perl -pi -e 's/\{ name: "Missions" \}/{ name: "Ask Rover", exact: true }/g; s/\{ name: "Rover Terminal" \}/{ name: "Ask Rover" }/g; s/the HUD Missions button/the HUD Ask Rover button/; s/the Missions tour/the Ask Rover tour/; s/"Rover Terminal\x27s ask option/"Ask Rover\x27s ask option/; s/^test\("Rover Terminal auto-opens/test("Ask Rover auto-opens/' e2e/experience.spec.ts e2e/missions.spec.ts e2e/ask.spec.ts e2e/walk.spec.ts e2e/library-roof.spec.ts e2e/screenshots.spec.ts
perl -pi -e 's/\{ name: "Rover Terminal" \}/{ name: "Ask Rover" }/g; s/name: "Missions" \}/name: "Ask Rover" }/g; s/^(\s+)Missions$/$1Ask Rover/; s#rover\@hq:~\$ \./missions#rover\@hq:~\$ ./ask-rover#g' tests/hud/RoverTerminal.test.tsx tests/hud/MissionHud.test.tsx
grep -rnE '"Missions"|"Rover Terminal"|\./missions' e2e tests
```
Expected: the grep prints nothing. `rtk git diff --stat` shows 8 changed test files.

- [ ] **Step 2: Run the unit tests to verify they fail**

Run: `rtk bunx vitest run tests/hud/RoverTerminal.test.tsx tests/hud/MissionHud.test.tsx`
Expected: FAIL, `Unable to find role="dialog" and name "Ask Rover"` (the terminal is still titled "Rover Terminal").

- [ ] **Step 3: Update the strings**

Run:
```bash
rtk bun -e '
const fs = require("node:fs");
const edit = (file, changes) => {
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const [path, value] of Object.entries(changes)) {
    const keys = path.split(".");
    const last = keys.pop();
    const parent = keys.reduce((node, key) => node[key], json);
    if (value === null) delete parent[last];
    else parent[last] = value;
  }
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n");
};
edit("messages/en.json", {
  "hud.launcher.missions": null,
  "hud.launcher.askRover": "Ask Rover",
  "hud.terminal.title": "Ask Rover",
  "hud.terminal.prompt": "rover@hq:~$ ./ask-rover",
  "hud.terminal.options": "Ask Rover options",
  "hud.palette.label": "Search Ask Rover, rooms, years and actions",
  "hud.palette.placeholder": "Find an Ask Rover pick, room, year or action",
  "hud.palette.groups.missions": "Ask Rover",
  "hud.kioskTitle": "rover@hq:~$ ./ask-rover",
  "hud.kioskHint": "Select the kiosk or the rover to open Ask Rover",
});
edit("messages/id.json", {
  "hud.launcher.missions": null,
  "hud.launcher.askRover": "Tanya Rover",
  "hud.terminal.title": "Tanya Rover",
  "hud.terminal.prompt": "rover@hq:~$ ./ask-rover",
  "hud.terminal.options": "Pilihan Tanya Rover",
  "hud.palette.label": "Cari Tanya Rover, ruang, tahun, dan perintah",
  "hud.palette.placeholder": "Cari pilihan Tanya Rover, ruang, tahun, atau perintah",
  "hud.palette.groups.missions": "Tanya Rover",
  "hud.kioskTitle": "rover@hq:~$ ./ask-rover",
  "hud.kioskHint": "Pilih kios atau rover untuk membuka Tanya Rover",
});
'
```

- [ ] **Step 4: Use the new key in `src/hud/HudLaunchers.tsx`**

Replace:
```tsx
/** Header entry points for the missions HUD: Rover Terminal and command palette (⌘K). */
```
with:
```tsx
/** Header entry points: Ask Rover (the Rover Terminal and its missions) and the command palette (⌘K). */
```
Replace:
```tsx
        <span className="sr-only sm:not-sr-only">{t("missions")}</span>
```
with:
```tsx
        <span className="sr-only sm:not-sr-only">{t("askRover")}</span>
```

- [ ] **Step 5: Run the unit tests**

Run: `rtk bunx vitest run tests/hud/RoverTerminal.test.tsx tests/hud/MissionHud.test.tsx tests/hud/CommandPalette.test.tsx tests/unit/ui-copy.test.ts tests/unit/search.test.ts && rtk bun run typecheck`
Expected: 5 files PASS; typecheck clean (next-intl message types know `askRover`).

- [ ] **Step 6: Build and run the e2e specs that click it**

Run: `rtk bun run build && rtk bunx playwright test e2e/missions.spec.ts e2e/ask.spec.ts -g "Ask Rover|Lobby with the terminal open|journey|hire" && rtk bunx playwright test e2e/experience.spec.ts -g "Ask Rover|terminal"`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
rtk git add messages/en.json messages/id.json src/hud/HudLaunchers.tsx tests/hud/RoverTerminal.test.tsx tests/hud/MissionHud.test.tsx e2e/experience.spec.ts e2e/missions.spec.ts e2e/ask.spec.ts e2e/walk.spec.ts e2e/library-roof.spec.ts e2e/screenshots.spec.ts
rtk git commit -m "feat(hud): rename Missions to Ask Rover (Tanya Rover)"
```

---

### Task 6: 3D top bar (no Quick view, highlighted Page view, Ask AI on its right)

**Files:**
- Modify: `src/hud/Controls.tsx` (whole file), `src/hud/HudLaunchers.tsx` (whole file)
- Modify: `src/hud/Hud.tsx` (`FloorNotice` phone offset)
- Modify: `src/hud/walk/WalkBar.tsx`, `src/hud/walk/WalkPrompt.tsx` (`top` placement on phones)
- Modify: `src/hud/ask/AskDock.tsx` (tower teaser offset on phones)
- Modify: `src/hud/drawer/RoomDrawer.tsx` (side panel top below 1024 px)
- Modify: `messages/en.json`, `messages/id.json` (delete `hud.quickView`; `hud.canvasDescription` last sentence)
- Create: `tests/hud/Controls.test.tsx`, `e2e/hud.spec.ts`
- Modify: `e2e/drawer-solid.spec.ts`, `e2e/screenshots.spec.ts`, `scripts/e2e-plan.ts`, `tests/unit/e2e-plan.test.ts`

**Interfaces:**
- Consumes: `AskPill` (`hud/ask/AskPill.tsx`, `data-testid="ask-pill"`), `HudLaunchers`.
- Produces:
  - `TopBar({ onExit, onToggleLang })`, `MobileMenu({ onExit, onToggleLang })` (same signatures); both render `data-testid="hud-topbar"` and `ViewActions` (`data-testid="hud-view-actions"`) with the Page view button (`data-testid="page-view"`, class `bg-cyan`) followed by `AskPill`.
  - `HudLaunchers({ buttonClassName?, labelClassName? })`: `labelClassName` defaults to `"sr-only sm:not-sr-only"`.
  - Layout contract used by later tasks: phones have two top rows (12 to 56 px and 64 to 108 px), so overlays under the top controls on phones start at `top-[116px]`; tablets keep `sm:top-[124px]`; from 1024 px the bar is one row.
  - E2E spec `hud` (`e2e/hud.spec.ts`) with helpers `box(locator)`, `mockAsk(page)`, `newPage(browser, vp)` that Tasks 7 and 9 extend.

- [ ] **Step 1: Write the failing unit test**

Create `tests/hud/Controls.test.tsx`:
```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import { MobileMenu, TopBar } from "@/hud/Controls";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={`/en${href}`} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/hud/ask/AskPill", () => ({
  AskPill: () => (
    <button type="button" data-testid="ask-pill">
      Ask AI
    </button>
  ),
}));
vi.mock("@/lib/audio", () => ({ useAudio: () => ({ muted: false, toggleMuted: vi.fn() }) }));

const Wrap = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="en" messages={en}>
    {children}
  </NextIntlClientProvider>
);

afterEach(cleanup);

describe("3D top bar", () => {
  it("has no Quick view, a primary Page view and Ask AI right after it, at the end", async () => {
    const onExit = vi.fn();
    render(
      <Wrap>
        <TopBar onExit={onExit} onToggleLang={vi.fn()} />
      </Wrap>,
    );
    expect(screen.queryByText("Quick view")).toBeNull();
    const pageView = screen.getByTestId("page-view");
    expect(pageView).toHaveTextContent(en.hud.pageView);
    expect(pageView.className).toContain("bg-cyan");
    expect(pageView.nextElementSibling).toBe(screen.getByTestId("ask-pill"));
    const controls = within(screen.getByTestId("hud-topbar")).getAllByRole("button");
    expect(controls.at(-1)).toBe(screen.getByTestId("ask-pill"));
    expect(screen.getByRole("button", { name: en.hud.launcher.askRover })).toBeInTheDocument();
    await userEvent.click(pageView);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("phones: Page view and Ask AI get their own row; the menu holds only language and sound", async () => {
    render(
      <Wrap>
        <MobileMenu onExit={vi.fn()} onToggleLang={vi.fn()} />
      </Wrap>,
    );
    expect(screen.getByTestId("page-view").nextElementSibling).toBe(screen.getByTestId("ask-pill"));
    const menuButton = screen.getByRole("button", { name: en.hud.menu });
    await userEvent.click(menuButton);
    const menu = document.getElementById(menuButton.getAttribute("aria-controls")!)!;
    expect(within(menu).queryByText("Quick view")).toBeNull();
    expect(within(menu).queryByText(en.hud.pageView)).toBeNull();
    expect(within(menu).getByRole("group", { name: en.hud.language })).toBeInTheDocument();
    expect(within(menu).getByRole("button", { name: en.hud.sound })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `rtk bunx vitest run tests/hud/Controls.test.tsx`
Expected: FAIL, `Unable to find an element by: [data-testid="page-view"]`.

- [ ] **Step 3: Replace `src/hud/HudLaunchers.tsx`**

```tsx
"use client";

import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import { openPalette, openTerminal } from "./events";

const noop = () => () => {};
const isApple = () => /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent);

/** Header entry points: Ask Rover (the Rover Terminal and its missions) and the command palette (⌘K). */
export function HudLaunchers({ buttonClassName, labelClassName = "sr-only sm:not-sr-only" }: { buttonClassName?: string; labelClassName?: string } = {}) {
  const t = useTranslations("hud.launcher");
  const shortcut = useSyncExternalStore(noop, () => (isApple() ? "⌘K" : "Ctrl K"), () => "Ctrl K");
  const button =
    buttonClassName ??
    "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md border border-glass-border px-2.5 text-sm text-ink-2 transition hover:border-cyan/50 hover:text-ink";
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" onClick={openTerminal} className={button} aria-haspopup="dialog">
        <span aria-hidden="true" className="font-mono text-cyan">
          &gt;_
        </span>
        <span className={labelClassName}>{t("askRover")}</span>
      </button>
      <button
        type="button"
        onClick={() => openPalette()}
        className={button}
        aria-haspopup="dialog"
        aria-label={t("searchShortcut", { shortcut })}
        aria-keyshortcuts="Meta+K Control+K /"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <kbd aria-hidden="true" className="label hidden rounded border border-glass-border px-1.5 py-0.5 text-ink-3 sm:inline">
          {shortcut}
        </kbd>
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Replace `src/hud/Controls.tsx`**

```tsx
"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { LOCALES, type Locale } from "@/content/schema";
import { useAudio } from "@/lib/audio";
import { AskPill } from "./ask/AskPill";
import { HudLaunchers } from "./HudLaunchers";

function LangToggle({ onToggleLang }: { onToggleLang: () => void }) {
  const t = useTranslations("hud");
  const locale = useLocale() as Locale;
  return (
    <div role="group" aria-label={t("language")} className="glass glass-solid flex rounded-full p-0.5">
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={l === locale}
          onClick={() => l !== locale && onToggleLang()}
          className={`label inline-flex min-h-10 min-w-11 items-center justify-center rounded-full px-2.5 transition ${
            l === locale ? "bg-cyan/15 text-cyan" : "text-ink-2 hover:text-ink"
          }`}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function SoundToggle({ withLabel = false }: { withLabel?: boolean }) {
  const t = useTranslations("hud");
  const { muted, toggleMuted } = useAudio();
  const sound = !muted;
  return (
    <button
      type="button"
      aria-pressed={sound}
      aria-label={withLabel ? undefined : t("sound")}
      onClick={toggleMuted}
      className="glass glass-solid inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full px-3 text-ink-2 transition hover:text-ink"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M11 5 6 9H2v6h4l5 4V5z" />
        {sound ? <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" /> : <path d="m22 9-6 6M16 9l6 6" />}
      </svg>
      {withLabel && <span className="text-sm">{t("sound")}</span>}
    </button>
  );
}

const launcher = "glass glass-solid inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full px-3 text-sm text-ink-2 transition hover:text-ink";
/** Page view is the one primary control of the 3D HUD (solid cyan, like Back to 3D in the Page View). */
const primary =
  "inline-flex min-h-11 items-center rounded-full bg-cyan px-4 text-sm font-semibold text-void shadow-[0_0_24px_-6px_var(--color-cyan)] transition hover:bg-cyan/85 focus-visible:outline-offset-4";

/** Page view (highlighted) with Ask AI on its right, the far right of the HUD. Quick view lives only in the Page View. */
function ViewActions({ onExit }: { onExit: () => void }) {
  const t = useTranslations("hud");
  return (
    <div className="flex items-center gap-2" data-testid="hud-view-actions">
      <button type="button" onClick={onExit} title={t("pageViewHint")} className={primary} data-testid="page-view">
        {t("pageView")}
      </button>
      <AskPill />
    </div>
  );
}

/**
 * Desktop and tablet top-right controls (appendix 04 section 2): one row from 1024 px; below that,
 * Page view and Ask AI get their own row under the bar.
 */
export function TopBar({ onExit, onToggleLang }: { onExit: () => void; onToggleLang: () => void }) {
  return (
    <div className="pointer-events-auto absolute top-4 right-4 flex flex-col items-end gap-2 lg:flex-row lg:items-center" data-testid="hud-topbar">
      <div className="flex items-center gap-2">
        <HudLaunchers buttonClassName={launcher} labelClassName="sr-only md:not-sr-only" />
        <LangToggle onToggleLang={onToggleLang} />
        <SoundToggle />
      </div>
      <ViewActions onExit={onExit} />
    </div>
  );
}

/** Phones: Ask Rover, search and the menu (language, sound) on the first row; Page view and Ask AI on the second. */
export function MobileMenu({ onExit, onToggleLang }: { onExit: () => void; onToggleLang: () => void }) {
  const t = useTranslations("hud");
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="pointer-events-auto absolute top-3 right-3 flex flex-col items-end gap-2" data-testid="hud-topbar">
      <div className="flex items-center gap-2">
        <HudLaunchers buttonClassName={launcher} labelClassName="sr-only" />
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          aria-label={t("menu")}
          onClick={() => setOpen((v) => !v)}
          className="glass glass-solid grid size-11 place-items-center rounded-full text-ink"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>
      <ViewActions onExit={onExit} />
      {open && (
        <div id={id} className="glass glass-solid flex w-56 flex-col gap-2 p-3">
          <LangToggle onToggleLang={onToggleLang} />
          <SoundToggle withLabel />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Move phone overlays under the second row, and the tablet side drawer under it**

In `src/hud/Hud.tsx` (`FloorNotice`), replace `${mobile ? "top-[68px]" : "top-[168px]"}` with `${mobile ? "top-[116px]" : "top-[168px]"}`.

In `src/hud/walk/WalkBar.tsx`, replace:
```ts
const CARD: Record<WalkPlacement, string> = {
  // Phones: under the menu row. Tablets: under the Ask pill row, right of the profile card.
  top: "top-[68px] left-3 right-3 sm:top-[124px] sm:left-auto sm:right-4 sm:w-[min(480px,calc(100%-290px))]",
```
with:
```ts
const CARD: Record<WalkPlacement, string> = {
  // Phones: under both top rows (menu, then Page view and Ask AI). Tablets: under the Page view row, right of the profile card.
  top: "top-[116px] left-3 right-3 sm:top-[124px] sm:left-auto sm:right-4 sm:w-[min(480px,calc(100%-290px))]",
```
and replace both remaining `top: "top-[68px] left-1/2 -translate-x-1/2 sm:top-[124px]",` lines (in `PILL` and `LAUNCHER`) with `top: "top-[116px] left-1/2 -translate-x-1/2 sm:top-[124px]",`.

In `src/hud/walk/WalkPrompt.tsx`, replace:
```ts
  // Phones: under the menu row. Tablets: under the Ask pill row, right of the profile card.
  top: "top-[68px] left-3 right-3 sm:top-[124px] sm:left-auto sm:right-4 sm:w-[min(480px,calc(100%-290px))]",
```
with:
```ts
  // Phones: under both top rows (menu, then Page view and Ask AI). Tablets: under the Page view row, right of the profile card.
  top: "top-[116px] left-3 right-3 sm:top-[124px] sm:left-auto sm:right-4 sm:w-[min(480px,calc(100%-290px))]",
```

In `src/hud/ask/AskDock.tsx`, replace:
```ts
              ? "top-[68px] right-3 sm:top-[124px] sm:right-4 lg:top-[76px]"
```
with:
```ts
              ? "top-[116px] right-3 sm:top-[124px] sm:right-4 lg:top-[76px]"
```

In `src/hud/drawer/RoomDrawer.tsx`, replace:
```ts
      ? `top-[68px] right-3 bottom-3 md:top-[76px] md:right-4 md:bottom-4 ${narrow ? "w-[min(420px,calc(100vw-1.5rem))]" : "w-[min(var(--hq-drawer-w),calc(100vw-1.5rem))]"}`
```
with:
```ts
      ? `top-[124px] right-3 bottom-3 md:right-4 md:bottom-4 lg:top-[76px] ${narrow ? "w-[min(420px,calc(100vw-1.5rem))]" : "w-[min(var(--hq-drawer-w),calc(100vw-1.5rem))]"}`
```
(The side layout only exists from 900 px wide; below 1024 px it now starts under the Page view and Ask AI row, exactly like the Ask side panel in `AskChat.tsx`.)

- [ ] **Step 6: Strings: no Quick view in the 3D HUD**

Run:
```bash
rtk bun -e '
const fs = require("node:fs");
const edit = (file, changes) => {
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const [path, value] of Object.entries(changes)) {
    const keys = path.split(".");
    const last = keys.pop();
    const parent = keys.reduce((node, key) => node[key], json);
    if (value === null) delete parent[last];
    else parent[last] = value;
  }
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n");
};
const en = JSON.parse(fs.readFileSync("messages/en.json", "utf8"));
const id = JSON.parse(fs.readFileSync("messages/id.json", "utf8"));
edit("messages/en.json", {
  "hud.quickView": null,
  "hud.canvasDescription": en.hud.canvasDescription.replace("Quick view opens the portfolio as a page.", "Page view shows the portfolio as a page."),
});
edit("messages/id.json", {
  "hud.quickView": null,
  "hud.canvasDescription": id.hud.canvasDescription.replace("Buka Ringkasan untuk membaca portofolio dalam tampilan halaman.", "Tampilan halaman menampilkan portofolio sebagai halaman."),
});
'
grep -nE "Quick view|Ringkasan" messages/en.json messages/id.json
```
Expected: only `hud.actions.quickView` (Cmd-K action, both locales) and the Page View strings remain (`quick.*`, `common.*`); no `hud.quickView`, and `canvasDescription` ends with "Page view shows the portfolio as a page." / "Tampilan halaman menampilkan portofolio sebagai halaman.".

- [ ] **Step 7: Run the unit tests**

Run: `rtk bunx vitest run tests/hud/Controls.test.tsx tests/hud/RoomDrawer.test.tsx tests/hud/AskDock.test.tsx tests/unit/ui-copy.test.ts && rtk bun run typecheck && rtk bun run lint`
Expected: 4 files PASS; typecheck and lint clean.

- [ ] **Step 8: Write the e2e spec for the top bar**

Create `e2e/hud.spec.ts`:
```ts
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { enterHQ } from "./hq";

/**
 * 3D HUD layout (owner round R3-B): the top bar (no Quick view, a highlighted Page view with Ask AI
 * on its right), the bottom band (hint and walk pill at the bottom, clear of the joystick, boost and
 * view controls) and the room drawer footer (cross-floor link right of the primary action).
 */
test.describe.configure({ timeout: 150_000 });

type Box = { x: number; y: number; width: number; height: number };
const box = async (locator: Locator): Promise<Box> => (await locator.boundingBox())!;

/** Ask the HQ enabled (the pill only shows then), teaser already seen. */
async function mockAsk(page: Page) {
  await page.route("**/api/ask", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: true, turnstileSiteKey: null, asOf: "2026-10-11", maxLength: 300 }) }),
  );
  await page.addInitScript(() => sessionStorage.setItem("hq:ask-teaser", "1"));
}

async function newPage(browser: Browser, vp: { width: number; height: number; touch: boolean }) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.touch, isMobile: vp.touch, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await mockAsk(page);
  return { context, page };
}

const TOP_BAR = [
  { name: "desktop", width: 1440, height: 900, touch: false },
  { name: "tablet", width: 834, height: 1112, touch: true },
  { name: "phone", width: 390, height: 844, touch: true },
] as const;

test.describe("3D top bar", () => {
  for (const vp of TOP_BAR) {
    test(`${vp.name}: no Quick view, a highlighted Page view and Ask AI on its right`, async ({ browser }) => {
      const { context, page } = await newPage(browser, vp);
      await enterHQ(page);
      const hud = page.getByTestId("hud");
      await expect(hud.getByRole("link", { name: "Quick view" })).toHaveCount(0);
      await expect(hud.getByRole("button", { name: "Ask Rover", exact: true })).toBeVisible();
      const pageView = hud.getByTestId("page-view");
      const ask = hud.locator("[data-testid='ask-pill']:visible");
      await expect(pageView).toBeVisible();
      await expect(ask).toBeVisible({ timeout: 15_000 });
      expect(await pageView.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(34, 211, 238)");
      const p = await box(pageView);
      const a = await box(ask);
      expect(a.x).toBeGreaterThanOrEqual(p.x + p.width);
      expect(Math.abs(a.y + a.height / 2 - (p.y + p.height / 2))).toBeLessThan(4);
      // Ask AI is the last control on the right edge.
      expect(vp.width - (a.x + a.width)).toBeLessThanOrEqual(24);
      await context.close();
    });
  }
});
```
Register the spec in `scripts/e2e-plan.ts`: in `ALL_SPECS` replace:
```ts
  "gallery",
  "labs",
```
with:
```ts
  "gallery",
  "hud",
  "labs",
```
and replace these three rules:
```ts
  { test: /^src\/experience\/missions\/walks?\.ts$|^src\/hud\/walk\//, specs: ["walk", "missions"] },
```
```ts
  { test: /^src\/hud\/drawer\//, specs: ["labs", "gallery", "career", "library-roof", "drawer-solid"] },
```
```ts
  { test: /^src\/hud\//, specs: ["experience", "missions", "drawer-solid"] },
```
with:
```ts
  { test: /^src\/experience\/missions\/walks?\.ts$|^src\/hud\/walk\//, specs: ["walk", "missions", "hud"] },
```
```ts
  { test: /^src\/hud\/drawer\//, specs: ["labs", "gallery", "career", "library-roof", "drawer-solid", "hud"] },
```
```ts
  { test: /^src\/hud\//, specs: ["experience", "missions", "drawer-solid", "hud"] },
```
In `tests/unit/e2e-plan.test.ts`, add to `it("maps floor code to its spec", () => {`:
```ts
    expect(specsForChanges(["src/hud/Controls.tsx"]).specs).toEqual(["drawer-solid", "experience", "hud", "missions"]);
    expect(specsForChanges(["src/hud/walk/WalkBar.tsx"]).specs).toEqual(["hud", "missions", "walk"]);
```

- [ ] **Step 9: Point the old Quick view checks at the new bar**

In `e2e/drawer-solid.spec.ts`, replace:
```ts
    // No visible top-bar control (Quick view, language, sound, Page view, menu) may sit under the drawer.
```
with:
```ts
    // No visible top-bar control (Ask Rover, search, language, sound, Page view, Ask AI, menu) may sit under the drawer.
```
and replace:
```ts
  const pill = page.getByRole("link", { name: "Quick view" });
```
with:
```ts
  const pill = page.getByRole("button", { name: "Sound" });
```
In `e2e/screenshots.spec.ts`, delete:
```ts
    if (viewport.name === "mobile") await page.getByRole("button", { name: "Menu" }).click();
```

- [ ] **Step 10: Build and run**

Run: `rtk bunx vitest run tests/unit/e2e-plan.test.ts && rtk bun run build && rtk bunx playwright test e2e/hud.spec.ts e2e/drawer-solid.spec.ts && rtk bunx playwright test e2e/experience.spec.ts -g "page view|3 key|accessibility" && rtk bunx playwright test e2e/walk.spec.ts -g "phone"`
Expected: e2e-plan PASS; `hud.spec.ts` 3 tests PASS; `drawer-solid` PASS (Ask AI and Page view at 1024 px and up are in the single row, clear of the drawer); Page view and axe tests PASS; the phone walk tests PASS (walk card at 116 px, under both rows, clear of Ask AI).

- [ ] **Step 11: Commit**

```bash
rtk git add src/hud/Controls.tsx src/hud/HudLaunchers.tsx src/hud/Hud.tsx src/hud/walk/WalkBar.tsx src/hud/walk/WalkPrompt.tsx src/hud/ask/AskDock.tsx src/hud/drawer/RoomDrawer.tsx messages/en.json messages/id.json tests/hud/Controls.test.tsx e2e/hud.spec.ts e2e/drawer-solid.spec.ts e2e/screenshots.spec.ts scripts/e2e-plan.ts tests/unit/e2e-plan.test.ts
rtk git commit -m "feat(hud): top bar without Quick view, highlighted Page view, Ask AI on its right"
```

---
### Task 7: Bottom band (hint and walk pill at the bottom, touch boost button)

**Files:**
- Create: `src/hud/BoostButton.tsx`, `tests/hud/BoostButton.test.tsx`, `tests/hud/WalkBar.test.tsx`
- Modify: `src/hud/Hud.tsx` (whole file), `src/hud/Joystick.tsx` (doc comment and class), `src/hud/ViewControls.tsx` (class)
- Modify: `src/hud/walk/WalkBar.tsx` (imports, props, idle and paused branches), `src/hud/walk/WalkLayer.tsx` (prop)
- Modify: `messages/en.json`, `messages/id.json` (`hud.hintCoarse`, new `hud.boost`)
- Test: `e2e/hud.spec.ts` (append the bottom band tests)

**Interfaces:**
- Consumes: `setBoost` and `joystick.boost` (Task 2), `TopBar`/`MobileMenu` (Task 6), `WalkPlacement` (`"top" | "bottom" | "bottom-raised" | "dock"`).
- Produces:
  - `BoostButton()` with `data-testid="boost"`, `data-active="true"` while held.
  - `BottomBand({ left, right, children, slotRef })` inside `Hud.tsx`, `data-testid="hud-bottom"`, center column `data-testid="hud-bottom-center"`.
  - `WalkBarProps.slot?: HTMLElement | null` and `WalkLayer` prop `bottomSlot?: HTMLElement | null`: when set, the idle launcher (`data-testid="walk-launcher"`) and the paused pill (`data-testid="walk-pill"`) render in flow inside that element through a portal; without it they keep their absolute placement.

- [ ] **Step 1: Write the failing unit tests**

Create `tests/hud/BoostButton.test.tsx`:
```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import { joystick, setBoost } from "@/experience/input/joystick";
import { BoostButton } from "@/hud/BoostButton";

function renderButton() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <BoostButton />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  setBoost(false);
});

describe("BoostButton", () => {
  it("boosts while held and stops on release or cancel", () => {
    renderButton();
    const button = screen.getByTestId("boost");
    expect(button).toHaveAttribute("aria-hidden", "true");
    expect(button).toHaveTextContent(en.hud.boost);
    fireEvent.pointerDown(button);
    expect(joystick.boost).toBe(true);
    expect(button).toHaveAttribute("data-active", "true");
    fireEvent.pointerUp(button);
    expect(joystick.boost).toBe(false);
    expect(button).not.toHaveAttribute("data-active");
    fireEvent.pointerDown(button);
    fireEvent.pointerCancel(button);
    expect(joystick.boost).toBe(false);
  });

  it("never leaves the boost on when it unmounts while held", () => {
    const { unmount } = renderButton();
    fireEvent.pointerDown(screen.getByTestId("boost"));
    expect(joystick.boost).toBe(true);
    unmount();
    expect(joystick.boost).toBe(false);
  });
});
```
Create `tests/hud/WalkBar.test.tsx`:
```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import type { WalkController, WalkState } from "@/experience/missions/walk";
import { WalkBar } from "@/hud/walk/WalkBar";

const walk = { definition: { id: "projects", stops: [] }, start: vi.fn(), resume: vi.fn(), end: vi.fn() } as unknown as WalkController;
const state = (status: WalkState["status"]): WalkState => ({ status, filter: null, index: 2, total: 9, stop: null, visited: [] });

function renderBar(status: WalkState["status"], slot: HTMLElement | null) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <WalkBar walk={walk} state={state(status)} placement="bottom-raised" coarse launcher={en.walk.projects.start} slot={slot} />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("WalkBar pills and the bottom band", () => {
  it("renders the idle launcher in flow inside the band slot", () => {
    const slot = document.body.appendChild(document.createElement("div"));
    renderBar("idle", slot);
    const launcher = screen.getByTestId("walk-launcher");
    expect(slot).toContainElement(launcher);
    expect(launcher.className).not.toMatch(/\babsolute\b/);
    expect(screen.getByRole("button", { name: new RegExp(en.walk.projects.start) })).toBeInTheDocument();
  });

  it("renders the paused pill in the slot and keeps the stop count for wider screens only", () => {
    const slot = document.body.appendChild(document.createElement("div"));
    renderBar("paused", slot);
    const pill = screen.getByTestId("walk-pill");
    expect(slot).toContainElement(pill);
    expect(screen.getByRole("button", { name: new RegExp(en.walk.resume) })).toBeInTheDocument();
    expect(screen.getByText("Stop 3 of 9").className).toContain("sm:inline");
  });

  it("keeps the absolute placement without a slot (room drawer or Ask panel open)", () => {
    renderBar("idle", null);
    expect(screen.getByTestId("walk-launcher").className).toMatch(/\babsolute\b/);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `rtk bunx vitest run tests/hud/BoostButton.test.tsx tests/hud/WalkBar.test.tsx`
Expected: FAIL: `Failed to resolve import "@/hud/BoostButton"`; WalkBar `expected <div> to contain element` (the launcher renders absolute, outside the slot).

- [ ] **Step 3: Strings for the touch boost**

Run:
```bash
rtk bun -e '
const fs = require("node:fs");
const edit = (file, changes) => {
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const [path, value] of Object.entries(changes)) {
    const keys = path.split(".");
    const last = keys.pop();
    const parent = keys.reduce((node, key) => node[key], json);
    if (value === null) delete parent[last];
    else parent[last] = value;
  }
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n");
};
edit("messages/en.json", {
  "hud.hintCoarse": "Move: tap floor · Drive: joystick · Boost: hold the boost button · Rotate: drag · Floors: swipe up or down",
  "hud.boost": "Boost",
});
edit("messages/id.json", {
  "hud.hintCoarse": "Gerak: ketuk lantai · Kemudi: joystick · Turbo: tahan tombol turbo · Putar: seret · Lantai: geser ke atas atau bawah",
  "hud.boost": "Turbo",
});
'
```

- [ ] **Step 4: Create `src/hud/BoostButton.tsx`**

```tsx
"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { setBoost } from "@/experience/input/joystick";

/**
 * Hold-to-boost for coarse pointers, beside the joystick (keyboard users hold Shift). Pointer-only
 * like the joystick, so it is hidden from assistive tech; release, cancel or unmount ends the boost.
 */
export function BoostButton() {
  const t = useTranslations("hud");
  const pointer = useRef<number | null>(null);
  const [active, setActive] = useState(false);

  useEffect(() => () => setBoost(false), []);

  const press = (e: PointerEvent<HTMLDivElement>) => {
    pointer.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Capture can fail for synthetic pointers; tracking the id is enough.
    }
    setBoost(true);
    setActive(true);
  };

  const release = (e: PointerEvent<HTMLDivElement>) => {
    if (pointer.current !== e.pointerId) return;
    pointer.current = null;
    setBoost(false);
    setActive(false);
  };

  return (
    <div
      aria-hidden="true"
      data-testid="boost"
      data-active={active ? "true" : undefined}
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={release}
      className={`glass glass-solid pointer-events-auto grid size-14 shrink-0 touch-none place-items-center rounded-full transition select-none ${
        active ? "border-cyan text-cyan shadow-[0_0_24px_-4px_var(--color-cyan)]" : "text-ink-2"
      }`}
    >
      <span className="flex flex-col items-center leading-none">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 13l7-7 7 7" />
          <path d="M5 19l7-7 7 7" />
        </svg>
        <span className="label mt-0.5 text-[9px]">{t("boost")}</span>
      </span>
    </div>
  );
}
```

- [ ] **Step 5: Put the joystick and the view controls in flow**

In `src/hud/Joystick.tsx`, replace:
```tsx
/** Virtual joystick for coarse pointers: bottom-left, 120 px, 12% dead zone (appendix 03 section 3). */
```
with:
```tsx
/** Virtual joystick for coarse pointers: left of the bottom band, 120 px, 12% dead zone (appendix 03 section 3). */
```
and replace:
```tsx
      className="glass glass-solid pointer-events-auto absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-5 size-[120px] touch-none rounded-full"
```
with:
```tsx
      className="glass glass-solid pointer-events-auto relative size-[120px] shrink-0 touch-none rounded-full"
```
In `src/hud/ViewControls.tsx`, replace:
```tsx
      className="glass glass-solid pointer-events-auto absolute right-2 bottom-[max(1.5rem,env(safe-area-inset-bottom))] flex items-center gap-0.5 rounded-full p-0.5 md:right-4"
```
with:
```tsx
      className="glass glass-solid pointer-events-auto flex flex-col items-center gap-0.5 rounded-full p-0.5 sm:flex-row"
```

- [ ] **Step 6: Let `WalkBar` portal its pills into the band**

In `src/hud/walk/WalkBar.tsx`, replace:
```tsx
import { useTranslations } from "next-intl";
import { useRef, type PointerEvent } from "react";
import type { WalkController, WalkState } from "@/experience/missions/walk";
```
with:
```tsx
import { useTranslations } from "next-intl";
import { useRef, type PointerEvent, type ReactElement } from "react";
import { createPortal } from "react-dom";
import type { WalkController, WalkState } from "@/experience/missions/walk";
```
Replace:
```tsx
  /** Label of the idle launcher pill (the walk's start label); no pill without it. */
  launcher?: string;
}
```
with:
```tsx
  /** Label of the idle launcher pill (the walk's start label); no pill without it. */
  launcher?: string;
  /** The HUD bottom band's center column: the launcher and the paused pill render there, in flow. */
  slot?: HTMLElement | null;
}
```
Replace:
```tsx
export function WalkBar({ walk, state, placement, coarse, launcher }: WalkBarProps) {
  const t = useTranslations("walk");
  const swipe = useRef<{ id: number; x: number } | null>(null);
  const { definition } = walk;
  const name = t(`${definition.id}.name`);

  if (state.status === "idle") {
    if (!launcher) return null;
    return (
      <div className={`pointer-events-auto absolute ${LAUNCHER[placement]}`} data-testid="walk-launcher">
        <button type="button" onClick={() => void walk.start()} className="glass glass-solid inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold text-ink">
          <span aria-hidden="true" className="text-amber">
            ▶
          </span>
          {launcher}
        </button>
      </div>
    );
  }

  if (state.status === "paused") {
    return (
      <div className={`pointer-events-auto absolute flex items-center gap-2 ${PILL[placement]}`} data-testid="walk-pill">
        <button type="button" onClick={() => void walk.resume()} className="glass glass-solid inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold text-ink">
          <span aria-hidden="true" className="text-amber">
            ▶
          </span>
          {t("resume")}
          <span className="label text-ink-3">{t("stopOf", { index: state.index + 1, total: state.total })}</span>
        </button>
        <button type="button" onClick={() => walk.end()} aria-label={t("end")} className="glass glass-solid grid size-11 place-items-center rounded-full text-ink-2 hover:text-ink">
          <span aria-hidden="true">✕</span>
        </button>
      </div>
    );
  }
```
with:
```tsx
export function WalkBar({ walk, state, placement, coarse, launcher, slot = null }: WalkBarProps) {
  const t = useTranslations("walk");
  const swipe = useRef<{ id: number; x: number } | null>(null);
  const { definition } = walk;
  const name = t(`${definition.id}.name`);
  // Pills join the HUD bottom band when it offers its slot (nothing covers it); else they keep their own spot.
  const pill = (node: ReactElement) => (slot ? createPortal(node, slot) : node);

  if (state.status === "idle") {
    if (!launcher) return null;
    return pill(
      <div className={`pointer-events-auto ${slot ? "flex max-w-full justify-center" : `absolute ${LAUNCHER[placement]}`}`} data-testid="walk-launcher">
        <button
          type="button"
          onClick={() => void walk.start()}
          className="glass glass-solid inline-flex min-h-11 max-w-full items-center gap-2 rounded-full px-4 py-1.5 text-left text-sm font-semibold text-ink"
        >
          <span aria-hidden="true" className="shrink-0 text-amber">
            ▶
          </span>
          <span className="min-w-0">{launcher}</span>
        </button>
      </div>,
    );
  }

  if (state.status === "paused") {
    return pill(
      <div className={`pointer-events-auto flex items-center gap-2 ${slot ? "max-w-full justify-center" : `absolute ${PILL[placement]}`}`} data-testid="walk-pill">
        <button
          type="button"
          onClick={() => void walk.resume()}
          className="glass glass-solid inline-flex min-h-11 min-w-0 items-center gap-2 rounded-full px-4 py-1.5 text-left text-sm font-semibold text-ink"
        >
          <span aria-hidden="true" className="shrink-0 text-amber">
            ▶
          </span>
          <span className="min-w-0">{t("resume")}</span>
          <span className={slot ? "label hidden text-ink-3 sm:inline" : "label text-ink-3"}>{t("stopOf", { index: state.index + 1, total: state.total })}</span>
        </button>
        <button type="button" onClick={() => walk.end()} aria-label={t("end")} className="glass glass-solid grid size-11 shrink-0 place-items-center rounded-full text-ink-2 hover:text-ink">
          <span aria-hidden="true">✕</span>
        </button>
      </div>,
    );
  }
```
In `src/hud/walk/WalkLayer.tsx`, replace:
```tsx
export function WalkLayer({
  data,
  placement,
  coarse,
  hidden = false,
  onActive,
}: {
  data: ExperienceData;
  placement: WalkPlacement;
  coarse: boolean;
```
with:
```tsx
export function WalkLayer({
  data,
  placement,
  bottomSlot = null,
  coarse,
  hidden = false,
  onActive,
}: {
  data: ExperienceData;
  placement: WalkPlacement;
  /** The HUD bottom band's center column, when nothing covers it (pills render there). */
  bottomSlot?: HTMLElement | null;
  coarse: boolean;
```
and replace:
```tsx
  return <WalkBar walk={walk} state={state} placement={placement} coarse={coarse} launcher={promptSeen(floor) ? t(`${walk.definition.id}.start`) : undefined} />;
```
with:
```tsx
  return (
    <WalkBar
      walk={walk}
      state={state}
      placement={placement}
      coarse={coarse}
      slot={bottomSlot}
      launcher={promptSeen(floor) ? t(`${walk.definition.id}.start`) : undefined}
    />
  );
```

- [ ] **Step 7: Replace `src/hud/Hud.tsx` with the bottom band**

```tsx
"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, type ReactNode } from "react";
import { READY_FLOORS } from "@/experience/config";
import type { ExperienceData } from "@/experience/types";
import { Link } from "@/i18n/navigation";
import { useHQStore } from "@/store/useHQStore";
import { useAskPanelOpen } from "./ask/availability";
import { BoostButton } from "./BoostButton";
import { BootOverlay } from "./BootOverlay";
import { DrawerHost } from "./drawer/DrawerHost";
import { drawerLayout } from "./drawer/layout";
import { HologramOverlay } from "./HologramOverlay";
import { MobileMenu, TopBar } from "./Controls";
import { ElevatorPanel } from "./ElevatorPanel";
import { Joystick } from "./Joystick";
import { ProfileCard } from "./ProfileCard";
import { ViewControls } from "./ViewControls";
import type { WalkPlacement } from "./walk/WalkBar";
import { WalkLayer } from "./walk/WalkLayer";
import { YearChip } from "./YearChip";

/** Control hints, in the bottom band's center column under the walk pill. */
function HintBar({ coarse, mobile }: { coarse: boolean; mobile: boolean }) {
  const t = useTranslations("hud");
  const rail = useHQStore((s) => s.floor === "L2");
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (!mobile) return;
    const id = window.setTimeout(() => setHidden(true), 6000);
    return () => window.clearTimeout(id);
  }, [mobile]);
  if (hidden) return null;
  return (
    <p className="glass glass-solid pointer-events-none order-last max-w-full px-4 py-2 text-center text-[13px] leading-5 text-ink-2" data-testid="hint">
      {coarse ? (rail ? t("career.scrubHint") : t("hintCoarse")) : t("hintFine")}
    </p>
  );
}

function FloorNotice({ data, mobile }: { data: ExperienceData; mobile: boolean }) {
  const t = useTranslations("hud");
  const floor = useHQStore((s) => s.floor);
  const exploring = useHQStore((s) => s.phase === "explore");
  if (!exploring || READY_FLOORS.includes(floor)) return null;
  const { name, route } = data.floors[floor];
  return (
    <div className={`glass glass-solid pointer-events-auto absolute left-3 w-[min(280px,calc(100vw-5.5rem))] p-3 text-sm md:left-4 ${mobile ? "top-[116px]" : "top-[168px]"}`}>
      <p className="text-ink-2">{t("underConstruction", { name })}</p>
      <Link href={route} className="link mt-1 inline-flex min-h-11 items-center">
        {t("openFloorPage", { name })}
      </Link>
    </div>
  );
}

function FloorAnnouncer({ data }: { data: ExperienceData }) {
  const t = useTranslations("hud");
  const floor = useHQStore((s) => s.floor);
  return (
    <p className="sr-only" aria-live="polite" data-testid="floor-announcer">
      {t("currentFloor", { floor, name: data.floors[floor].name })}
    </p>
  );
}

/** Reduced motion replaces the elevator ride with a short fade cut. */
function CutFade() {
  const cut = useHQStore((s) => s.reducedMotion && s.ride?.stage === "moving");
  return <div aria-hidden="true" className={`pointer-events-none absolute inset-0 bg-void ${cut ? "opacity-100" : "opacity-0"}`} />;
}

/**
 * Bottom HUD band: one flex row, so nothing in it can overlap (owner request: the hint and the walk
 * pill sit at the bottom on tablets and phones). Left: the joystick and the boost button (coarse
 * pointers; phones stack the boost button above the joystick). Center: the walk pill (WalkBar
 * portals it into `slotRef`) above the controls hint. Right: the view controls (vertical on phones).
 * It hugs the bottom edge above the iOS home indicator (safe area).
 */
function BottomBand({ left, right, children, slotRef }: { left: ReactNode; right: ReactNode; children: ReactNode; slotRef: (node: HTMLDivElement | null) => void }) {
  return (
    <div data-testid="hud-bottom" className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end gap-3 pr-2 pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-5 md:pr-4">
      <div className="flex shrink-0 flex-col-reverse items-end gap-3 sm:flex-1 sm:flex-row sm:items-center">{left}</div>
      <div ref={slotRef} data-testid="hud-bottom-center" className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2 sm:flex-initial">
        {children}
      </div>
      <div className="flex shrink-0 justify-end sm:flex-1">{right}</div>
    </div>
  );
}

/** HTML HUD over the canvas. It talks to the scene only through the store and intents. */
export function Hud({ data, onExit, onToggleLang }: { data: ExperienceData; onExit: () => void; onToggleLang: () => void }) {
  const phase = useHQStore((s) => s.phase);
  const viewport = useHQStore((s) => s.device.viewport);
  const coarse = useHQStore((s) => s.device.coarse);
  const mobile = viewport === "mobile";
  const [walking, setWalking] = useState(false);
  const [bottomSlot, setBottomSlot] = useState<HTMLDivElement | null>(null);
  const askOpen = useAskPanelOpen();
  // The room drawer and the Ask panel cover the bottom band (sheets) or the right side (side panels):
  // the Walk HUD then docks beside the side panel or goes under the top controls. Otherwise its pills
  // join the bottom band, and its card sits above the band (coarse) or at the bottom (fine pointers).
  const side = typeof window !== "undefined" && drawerLayout(window.innerWidth, window.innerHeight) === "side";
  const covered = phase === "room" || askOpen;
  const walkPlacement: WalkPlacement = covered ? (side ? "dock" : "top") : mobile ? "top" : coarse ? "bottom-raised" : "bottom";
  const explorable = phase !== "intro" && phase !== "room";

  return (
    <div className="pointer-events-none absolute inset-0 z-10" data-testid="hud" data-phase={phase}>
      <CutFade />
      {phase === "boot" ? (
        <BootOverlay name={data.profile.name} monogram={data.profile.monogram} />
      ) : phase === "hologram" ? (
        // The hologram view owns the screen: only its own controls show.
        <HologramOverlay locale={data.locale} />
      ) : (
        <>
          <ProfileCard data={data} mobile={mobile} />
          {mobile ? <MobileMenu onExit={onExit} onToggleLang={onToggleLang} /> : <TopBar onExit={onExit} onToggleLang={onToggleLang} />}
          <ElevatorPanel data={data} compact={mobile} />
          <FloorNotice data={data} mobile={mobile} />
          {phase !== "intro" && <YearChip career={data.career} mobile={mobile} hidden={mobile && (walking || phase === "room")} />}
          <BottomBand
            slotRef={setBottomSlot}
            left={
              coarse && phase !== "intro" ? (
                <>
                  <Joystick />
                  <BoostButton />
                </>
              ) : null
            }
            right={explorable ? <ViewControls /> : null}
          >
            {explorable && !walking && <HintBar coarse={coarse} mobile={mobile} />}
          </BottomBand>
          <DrawerHost locale={data.locale} />
        </>
      )}
      {/* Mounted in every phase so a walk keeps its state through the hologram view. */}
      <WalkLayer
        data={data}
        placement={walkPlacement}
        bottomSlot={covered ? null : bottomSlot}
        coarse={coarse}
        hidden={phase === "boot" || phase === "intro" || phase === "hologram"}
        onActive={setWalking}
      />
      <FloorAnnouncer data={data} />
    </div>
  );
}
```

- [ ] **Step 8: Run the unit tests**

Run: `rtk bunx vitest run tests/hud/BoostButton.test.tsx tests/hud/WalkBar.test.tsx tests/unit/ui-copy.test.ts tests/content/fonts.test.ts && rtk bun run typecheck && rtk bun run lint`
Expected: 4 files PASS; typecheck and lint clean.

- [ ] **Step 9: Write the bottom band e2e tests**

In `e2e/hud.spec.ts`, replace the import line:
```ts
import { enterHQ } from "./hq";
```
with:
```ts
import en from "../messages/en.json";
import { asReturningVisitor, enterHQ, waitForHQ, waitForPhase, waitForSceneLive } from "./hq";
```
Replace:
```ts
const box = async (locator: Locator): Promise<Box> => (await locator.boundingBox())!;
```
with:
```ts
const box = async (locator: Locator): Promise<Box> => (await locator.boundingBox())!;
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
```
Append at the end of the file:
```ts
const BOTTOM = [
  { name: "tablet", width: 834, height: 1112, touch: true },
  { name: "phone", width: 390, height: 844, touch: true },
] as const;

test.describe("bottom band", () => {
  for (const vp of BOTTOM) {
    test(`${vp.name}: the hint and the walk pill sit at the bottom, clear of the joystick, boost, view controls and Ask AI`, async ({ browser }) => {
      const { context, page } = await newPage(browser, vp);
      await asReturningVisitor(page);
      await page.goto("/en/labs?tier=lite&walk=on");
      await waitForHQ(page);
      await waitForPhase(page, "explore");
      await waitForSceneLive(page);
      await page.getByTestId("walk-prompt").getByRole("button", { name: en.walk.explore }).click();
      const launcher = page.getByTestId("walk-launcher");
      await expect(launcher.getByRole("button", { name: new RegExp(en.walk.projects.start) })).toBeVisible();
      const ask = page.locator("[data-testid='ask-pill']:visible");
      await expect(ask).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId("boost")).toBeVisible();

      const controls = {
        joystick: await box(page.getByTestId("joystick")),
        boost: await box(page.getByTestId("boost")),
        view: await box(page.getByTestId("view-controls")),
        ask: await box(ask),
      };
      const pill = await box(launcher);
      // The hint auto-hides on phones after 6 s; measure it only while it shows.
      const hintLocator = page.getByTestId("hint");
      const hint = (await hintLocator.count()) ? await hintLocator.boundingBox({ timeout: 1000 }).catch(() => null) : null;
      const center = hint ? [pill, hint] : [pill];

      // At the bottom: the lowest center item ends within 32 px of the viewport bottom (24 px band
      // padding plus rounding), and the pill sits right on top of the hint when both show.
      expect(vp.height - Math.max(...center.map((b) => b.y + b.height))).toBeLessThanOrEqual(32);
      expect(vp.height - (pill.y + pill.height)).toBeLessThanOrEqual(32 + (hint ? hint.height + 8 : 0));
      for (const item of center) {
        expect(item.x).toBeGreaterThanOrEqual(0);
        expect(item.x + item.width).toBeLessThanOrEqual(vp.width);
        for (const [name, control] of Object.entries(controls)) expect(overlaps(item, control), `overlaps ${name}`).toBe(false);
      }
      expect(overlaps(controls.joystick, controls.boost)).toBe(false);
      expect(overlaps(controls.joystick, controls.view)).toBe(false);
      await context.close();
    });
  }
});
```

- [ ] **Step 10: Build and run the HUD specs**

Run: `rtk bun run build && rtk bunx playwright test e2e/hud.spec.ts e2e/walk.spec.ts e2e/drawer-solid.spec.ts && rtk bunx playwright test e2e/experience.spec.ts -g "touch|joystick|reset button|one-finger|accessibility"`
Expected: all PASS: 5 `hud.spec` tests (3 top bar, 2 bottom band), the walk specs (pills in the band, cards unchanged), drawer-solid, the joystick and view controls tests, axe.

- [ ] **Step 11: Commit**

```bash
rtk git add src/hud/BoostButton.tsx src/hud/Hud.tsx src/hud/Joystick.tsx src/hud/ViewControls.tsx src/hud/walk/WalkBar.tsx src/hud/walk/WalkLayer.tsx messages/en.json messages/id.json tests/hud/BoostButton.test.tsx tests/hud/WalkBar.test.tsx e2e/hud.spec.ts
rtk git commit -m "feat(hud): bottom band for hint, walk pill, joystick, boost and view controls"
```

---

### Task 8: Center the L1 Lobby on the elevator axis

**Files:**
- Modify: `src/experience/config.ts` (`LOBBY`)
- Test: `tests/unit/lobby-layout.test.ts` (import line, new test)
- Modify: `e2e/experience.spec.ts` (`WASD drives the rover and walls keep it inside the Lobby`)
- Modify: `docs/superpowers/specs/agent-hq/01-world-and-layout.md` (section 2)

**Interfaces:**
- Consumes: `SHAFT` (`config.ts`, `z: 0`, not modified), `buildFloorLayouts`.
- Produces: `LOBBY` with `bounds { minX: -24, maxX: 28, minZ: -21, maxZ: 21 }`, `spawn { x: 14, z: 10 }`, `hologram { x: 6, z: 0, radius: 3 }`, `skillsWall.z = -18.5`, `certWall.z = 0`, `kiosk.z = 19`. Every Lobby element moves +4 u in z with the plaza, so the relative layout (walkways, view zones, `LOBBY_STOPS`, lane spokes) is unchanged. The lane ring, the stats ring, the certification arc and the slab (and its grid floor, which `FloorLevel` centers on the bounds) are all centered on z = 0, the axis of the elevator door at (-24, 0).

- [ ] **Step 1: Write the failing test**

In `tests/unit/lobby-layout.test.ts`, replace:
```ts
import { buildFloorLayouts, LOBBY, ROVER, ROVER_HEIGHT } from "@/experience/config";
```
with:
```ts
import { buildFloorLayouts, LOBBY, ROVER, ROVER_HEIGHT, SHAFT } from "@/experience/config";
```
and add as the first test inside `describe("Lobby layout", () => {`:
```ts
  it("centers the plaza circle and the slab on the elevator axis (owner: lurus with the elevator)", () => {
    const l1 = buildFloorLayouts(8).L1;
    const axis = SHAFT.z;
    expect(l1.door.z).toBe(axis);
    expect(l1.approach.z).toBe(axis);
    // Lane ring, stats ring and certification arc all center on the hologram.
    expect(LOBBY.hologram.z).toBe(axis);
    // The slab and its grid floor center on the bounds (FloorLevel); same 52 x 42 u footprint as before.
    expect((LOBBY.bounds.minZ + LOBBY.bounds.maxZ) / 2).toBe(axis);
    expect(LOBBY.bounds.maxZ - LOBBY.bounds.minZ).toBe(42);
    expect(LOBBY.certWall.z).toBe(axis);
    // The spawn keeps its place on the default camera diagonal from the plaza.
    expect({ dx: LOBBY.spawn.x - LOBBY.hologram.x, dz: LOBBY.spawn.z - LOBBY.hologram.z }).toEqual({ dx: 8, dz: 10 });
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `rtk bunx vitest run tests/unit/lobby-layout.test.ts`
Expected: FAIL, `expected -4 to be 0` (hologram z).

- [ ] **Step 3: Move the plaza in `src/experience/config.ts`**

Replace:
```ts
/**
 * Lobby element positions (appendix 01 section 2). The plaza sits east of the elevator so the walls
 * keep a clear walkway (at least 4 u) outside the lane ring; see tests/unit/lobby-layout.test.ts.
 */
export const LOBBY = {
  bounds: { minX: -24, maxX: 28, minZ: -24, maxZ: 18 },
  /** On the default camera diagonal from the plaza, so the hologram is centered on arrival. */
  spawn: { x: 14, z: 6 },
  hologram: { x: 6, z: -4, radius: 3 },
```
with:
```ts
/**
 * Lobby element positions (appendix 01 section 2). The plaza sits east of the elevator, centered on
 * its axis (z = 0, like the door at (-24, 0)), so the lane ring and the slab line up with the
 * elevator; the walls keep a clear walkway (at least 4 u) outside the lane ring. See
 * tests/unit/lobby-layout.test.ts.
 */
export const LOBBY = {
  bounds: { minX: -24, maxX: 28, minZ: -21, maxZ: 21 },
  /** On the default camera diagonal from the plaza, so the hologram is centered on arrival. */
  spawn: { x: 14, z: 10 },
  hologram: { x: 6, z: 0, radius: 3 },
```
Replace:
```ts
  skillsWall: { x: 6, z: -22.5, w: 40, d: 1, h: 8.5, plinth: 0.35 },
  /** Footprint of the curved certification wall (floors/lobby/layout.ts CERT_WALL): the obstacle and view zone use it. */
  certWall: { x: 25, z: -4, w: 2.4, d: 18, h: 6.2 },
  kiosk: { x: 2, z: 15, w: 3, d: 2 },
```
with:
```ts
  skillsWall: { x: 6, z: -18.5, w: 40, d: 1, h: 8.5, plinth: 0.35 },
  /** Footprint of the curved certification wall (floors/lobby/layout.ts CERT_WALL): the obstacle and view zone use it. */
  certWall: { x: 25, z: 0, w: 2.4, d: 18, h: 6.2 },
  kiosk: { x: 2, z: 19, w: 3, d: 2 },
```

- [ ] **Step 4: Run the Lobby, navigation and mission tests**

Run: `rtk bunx vitest run tests/unit/lobby-layout.test.ts tests/unit/navgrid.test.ts tests/unit/orbit.test.ts tests/unit/missions-host3d.test.ts tests/unit/doors.test.ts tests/unit/store.test.ts`
Expected: 6 files PASS (spacing, on-slab, walkable ring, spawn and approach all hold: the kiosk box ends at z 20.75 inside 21, the skills wall starts at z -19.05 inside -21).

- [ ] **Step 5: Update the e2e wall check**

In `e2e/experience.spec.ts`, replace:
```ts
    // Lobby slab x -24 to 28, z -24 to 18, minus the rover radius.
    expect(rover.x).toBeGreaterThan(-23.01);
    expect(rover.x).toBeLessThan(27.01);
    expect(rover.z).toBeGreaterThan(-23.01);
    expect(rover.z).toBeLessThan(17.01);
    // Never inside the hologram pedestal at (6, -4).
    expect(Math.abs(rover.x - 6) > 3.9 || Math.abs(rover.z + 4) > 3.9).toBe(true);
```
with:
```ts
    // Lobby slab x -24 to 28, z -21 to 21 (centered on the elevator axis), minus the rover radius.
    expect(rover.x).toBeGreaterThan(-23.01);
    expect(rover.x).toBeLessThan(27.01);
    expect(rover.z).toBeGreaterThan(-20.01);
    expect(rover.z).toBeLessThan(20.01);
    // Never inside the hologram pedestal at (6, 0).
    expect(Math.abs(rover.x - 6) > 3.9 || Math.abs(rover.z) > 3.9).toBe(true);
```

- [ ] **Step 6: Update appendix 01 section 2**

In `docs/superpowers/specs/agent-hq/01-world-and-layout.md`, replace:
```md
Footprint: 52 × 42 u, x from -24 to 28 and z from -24 to 18. The west edge stays at the elevator door (the shaft is fixed at x = -28), so the plaza sits east of the origin. Accent: green `#34d399`.
```
with:
```md
Footprint: 52 × 42 u, x from -24 to 28 and z from -21 to 21. The west edge stays at the elevator door (the shaft is fixed at x = -28), so the plaza sits east of the origin, centered on the elevator axis (z = 0): the lane ring, the stats ring, the certification arc and the slab line up with the door (owner request, October 2026). Accent: green `#34d399`.
```
and replace the table rows:
```md
| Spawn point | (14, 6) | | Rover start on the default camera diagonal from the plaza, turned toward the camera |
| Profile hologram | (6, -4) | Pedestal radius 3 | Rotating wireframe monogram "KAW" (hexagon radius 2.3, center height 3.4) |
```
```md
| Skills wall | (6, -22.5) |
```
```md
| Certifications wall | Footprint (25, -4) |
```
```md
| Mission kiosk | (2, 15) | 3 × 2 | Diegetic mirror of the Rover Terminal missions |
```
with (only the position cells change; keep the rest of each row as it is):
```md
| Spawn point | (14, 10) | | Rover start on the default camera diagonal from the plaza, turned toward the camera |
| Profile hologram | (6, 0) | Pedestal radius 3 | Rotating wireframe monogram "KAW" (hexagon radius 2.3, center height 3.4) |
```
```md
| Skills wall | (6, -18.5) |
```
```md
| Certifications wall | Footprint (25, 0) |
```
```md
| Ask Rover kiosk | (2, 19) | 3 × 2 | Diegetic mirror of Ask Rover (the Rover Terminal missions) |
```

- [ ] **Step 7: Build and run the Lobby e2e tests**

Run: `rtk bun run build && rtk bunx playwright test e2e/experience.spec.ts -g "WASD|click to move|draw call budget|certification|Shift|cruising"`
Expected: all PASS (walls, click to move, budget under 150 calls and 30k triangles, the certification preview, and the boost tests from the new spawn).

- [ ] **Step 8: Commit**

```bash
rtk git add src/experience/config.ts tests/unit/lobby-layout.test.ts e2e/experience.spec.ts docs/superpowers/specs/agent-hq/01-world-and-layout.md
rtk git commit -m "fix(lobby): center the plaza ring and the slab on the elevator axis"
```

---
### Task 9: Room drawer: cross-floor link in the footer, right of the primary action

**Files:**
- Modify: `src/hud/drawer/RoomDrawer.tsx` (doc comment, header link block, `hasFooter`, footer)
- Test: `tests/hud/RoomDrawer.test.tsx` (one test replaced, one added)
- Test: `e2e/hud.spec.ts` (append the drawer footer tests)

**Interfaces:**
- Consumes: `RoomView.link` (`{ room, label }`, set by `room-views/career.ts` (`drawer.seeOnL3`) and `room-views/labs.ts` (`drawer.seeOnL2`)), `onLink(room)`.
- Produces: `<footer data-testid="drawer-footer">` with children in this order: primary `page` link (`drawer.openPage`, `common.caseStudy` for pods, `drawer.rooms.readPost` for posts), `external` link, the cross-floor button (`data-testid="drawer-cross-link"`, secondary amber outline), then View architecture. The drawer body no longer renders the link; the "..." menu still offers it. One shared footer serves every room type (L1 to RF, custom `research` and `roof` bodies included).

- [ ] **Step 1: Write the failing unit tests**

In `tests/hud/RoomDrawer.test.tsx`, replace the whole test `it("keeps the footer to one primary action and offers the cross-floor link in the menu", async () => {` (through its closing `});`) with:
```tsx
  it("puts the cross-floor link in the footer right after the one primary link, and keeps it in the menu", async () => {
    const user = userEvent.setup();
    const onLink = vi.fn();
    render(<Harness view={hero} onLink={onLink} />);
    const footer = screen.getByTestId("drawer-footer");
    expect(within(footer).getAllByRole("link")).toHaveLength(1);
    expect(within(footer).queryByText(en.drawer.readmeHint)).toBeNull();
    expect(footer.children[0]).toHaveTextContent(en.common.caseStudy);
    expect(footer.children[1]).toBe(within(footer).getByRole("button", { name: hero.link!.label }));
    expect(within(screen.getByTestId("drawer-body")).queryByRole("button", { name: hero.link!.label })).toBeNull();
    await user.click(screen.getByRole("button", { name: "More actions" }));
    const items = screen.getAllByRole("button", { name: new RegExp(hero.link!.label) });
    expect(items).toHaveLength(2);
    await user.click(items[1]);
    expect(onLink).toHaveBeenCalledWith(hero.link!.room);
  });

  it("uses the same footer order for every room type, custom bodies included", () => {
    const byKind = new Map<string, RoomView>();
    for (const view of Object.values(views)) {
      const seen = byKind.get(view.kind);
      if (!seen || (view.link && !seen.link)) byKind.set(view.kind, view);
    }
    expect([...byKind.keys()]).toEqual(expect.arrayContaining(["lobby", "career", "pod", "post", "research", "roof"]));
    expect([...byKind.values()].filter((v) => v.link).map((v) => v.kind).sort()).toEqual(["career", "pod"]);
    for (const view of byKind.values()) {
      const { unmount } = render(<Harness view={view} />);
      const footer = screen.queryByTestId("drawer-footer");
      const primaries = (view.page ? 1 : 0) + (view.external ? 1 : 0);
      if (primaries) expect(footer, view.id).not.toBeNull();
      if (view.link) {
        expect(within(screen.getByTestId("drawer-body")).queryByRole("button", { name: view.link.label }), view.id).toBeNull();
        expect(footer!.children[primaries], view.id).toBe(within(footer!).getByRole("button", { name: view.link.label }));
      }
      unmount();
    }
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `rtk bunx vitest run tests/hud/RoomDrawer.test.tsx`
Expected: FAIL, `Unable to find an element by: [data-testid="drawer-footer"]`.

- [ ] **Step 3: Move the link in `src/hud/drawer/RoomDrawer.tsx`**

Replace the doc comment lines:
```tsx
 * Layout, top to bottom: a slim bar that stays put (room code, badges, prev/next, menu, close; the
 * title joins it once the big title scrolls away), one scrolling region (title, subtitle, meta and the
 * cross-floor link, then the tabs, which stick under the bar, then the tab body), and a one-row footer
 * with the primary action.
```
with:
```tsx
 * Layout, top to bottom: a slim bar that stays put (room code, badges, prev/next, menu, close; the
 * title joins it once the big title scrolls away), one scrolling region (title, subtitle and meta,
 * then the tabs, which stick under the bar, then the tab body), and a footer row: the primary action,
 * the cross-floor link right of it (owner request: more room for the body), then View architecture.
```
Delete this block (inside `drawer-body`, after the meta line):
```tsx
          {link && (
            <button
              type="button"
              onClick={link.onClick}
              className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg border border-amber/50 px-3 text-[13px] font-semibold text-ink transition hover:border-amber hover:bg-amber/10"
            >
              {link.label}
              <span aria-hidden="true" className="text-amber">
                →
              </span>
            </button>
          )}
```
Replace:
```tsx
  const hasFooter = Boolean(view.page || view.external || showHologram);
  const link = view.link ? { label: view.link.label, onClick: () => onLink(view.link!.room) } : undefined;
```
with:
```tsx
  const link = view.link ? { label: view.link.label, onClick: () => onLink(view.link!.room) } : undefined;
  const hasFooter = Boolean(view.page || view.external || link || showHologram);
```
Replace:
```tsx
        <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-glass-border px-4 py-2.5 sm:px-5">
```
with:
```tsx
        <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-glass-border px-4 py-2.5 sm:px-5" data-testid="drawer-footer">
```
Replace:
```tsx
          {showHologram && <HologramButton onClick={onHologram} compact />}
        </footer>
```
with:
```tsx
          {link && (
            <button
              type="button"
              onClick={link.onClick}
              data-testid="drawer-cross-link"
              className="inline-flex min-h-11 min-w-0 items-center gap-2 rounded-lg border border-amber/50 px-3 text-left text-[13px] font-semibold text-ink transition hover:border-amber hover:bg-amber/10"
            >
              <span className="min-w-0">{link.label}</span>
              <span aria-hidden="true" className="shrink-0 text-amber">
                →
              </span>
            </button>
          )}
          {showHologram && <HologramButton onClick={onHologram} compact />}
        </footer>
```

- [ ] **Step 4: Run the drawer unit tests**

Run: `rtk bunx vitest run tests/hud/RoomDrawer.test.tsx tests/hud/LibraryRoofRooms.test.tsx && rtk bun run typecheck && rtk bun run lint`
Expected: 2 files PASS (including `links to the related room on another floor`, which finds the button by name); typecheck and lint clean.

- [ ] **Step 5: Write the drawer footer e2e tests**

In `e2e/hud.spec.ts`, replace:
```ts
import { asReturningVisitor, enterHQ, waitForHQ, waitForPhase, waitForSceneLive } from "./hq";
```
with:
```ts
import { asReturningVisitor, enterFloorRoute, enterHQ, waitForHQ, waitForPhase, waitForRoom, waitForSceneLive } from "./hq";
```
Append at the end of the file:
```ts
const DRAWER = [
  { name: "desktop", width: 1440, height: 900, touch: false },
  { name: "phone", width: 390, height: 844, touch: true },
] as const;
const CROSS_LINKS = [
  { path: "/en/journey/jenius-2024", room: "L2:jenius-2024", primary: en.drawer.openPage, link: en.drawer.seeOnL3 },
  { path: "/en/labs/digital-banking-integrations", room: "L3:digital-banking-integrations", primary: en.common.caseStudy, link: en.drawer.seeOnL2 },
] as const;

test.describe("room drawer footer", () => {
  for (const vp of DRAWER) {
    for (const target of CROSS_LINKS) {
      test(`${vp.name}: ${target.room} shows the cross-floor link right of the primary action`, async ({ browser }) => {
        const { context, page } = await newPage(browser, vp);
        await enterFloorRoute(page, target.path);
        await waitForRoom(page, target.room);
        const drawer = page.getByTestId("room-drawer");
        const footer = drawer.getByTestId("drawer-footer");
        const primary = footer.getByRole("link", { name: target.primary });
        const cross = footer.getByRole("button", { name: target.link });
        await expect(primary).toBeVisible();
        await expect(cross).toBeVisible();
        await expect(drawer.getByTestId("drawer-body").getByRole("button", { name: target.link })).toHaveCount(0);
        const p = await box(primary);
        const c = await box(cross);
        const f = await box(footer);
        const sameRow = Math.abs(p.y - c.y) < 4;
        if (vp.name === "desktop") expect(sameRow).toBe(true);
        // Right of the primary action, or wrapped onto the next row on narrow phones; never outside the footer.
        expect(sameRow ? c.x >= p.x + p.width : c.y >= p.y + p.height).toBe(true);
        expect(c.x + c.width).toBeLessThanOrEqual(f.x + f.width + 0.5);
        await context.close();
      });
    }
  }
});
```

- [ ] **Step 6: Build and run the drawer specs**

Run: `rtk bun run build && rtk bunx playwright test e2e/hud.spec.ts -g "drawer footer" && rtk bunx playwright test e2e/career.spec.ts -g "See the case study" && rtk bunx playwright test e2e/drawer-solid.spec.ts e2e/labs.spec.ts`
Expected: 4 footer tests PASS; the L2 to L3 cross-floor ride still PASSES (the button keeps its name); drawer-solid and labs PASS.

- [ ] **Step 7: Commit**

```bash
rtk git add src/hud/drawer/RoomDrawer.tsx tests/hud/RoomDrawer.test.tsx e2e/hud.spec.ts
rtk git commit -m "feat(drawer): cross-floor link moves into the footer next to the primary action"
```

---

### Task 10: Docs (README, AGENTS.md, appendices 02 to 04)

**Files:**
- Modify: `README.md` (Try it, L2 and L3 paragraphs)
- Modify: `AGENTS.md` (Folder layout `hud/`, Missions and HUD, 3D experience, Walk HUD, Glass Drawer, Styling, Ask the HQ)
- Modify: `docs/superpowers/specs/agent-hq/02-interaction-and-states.md`, `03-rover-camera-input.md`, `04-hud-responsive-i18n.md`

**Interfaces:**
- Consumes: the names and behaviors produced by Tasks 1 to 9.
- Produces: docs only.

- [ ] **Step 1: README**

Replace:
```md
Try it: open `/en`, press **Boot rover**, drive with WASD or the arrow keys (or click the floor), and change floors with the elevator panel (every button is named after its page: L1 Home, L2 Journey, L3 Work, L4 Writing, RF About), the mouse wheel or PageUp/PageDown. Add `?tier=lite` or `?tier=static` to force a tier, and use **Page view** to read the page without 3D.
```
with:
```md
Try it: open `/en`, press **Boot rover** (the boot log and the intro play in full once per browser session; nothing skips them), drive with WASD or the arrow keys (hold **Shift** to boost to about twice the speed; on touch screens hold the boost button next to the joystick) or click the floor, and change floors with the elevator panel (every button is named after its page: L1 Home, L2 Journey, L3 Work, L4 Writing, RF About), the mouse wheel or PageUp/PageDown. **Ask Rover** (top bar, or click the rover) offers guided trips; **Page view** (highlighted, with **Ask AI** on its right) reads the page without 3D. Add `?tier=lite` or `?tier=static` to force a tier.
```
In the L2 paragraph replace `or the "Follow my career" mission.` with `or the "Follow my career" pick in Ask Rover.`; in the L3 paragraph replace `or the "Tour my projects" mission;` with `or the "Tour my projects" pick in Ask Rover;`.

- [ ] **Step 2: AGENTS.md**

Make these replacements (each `old` string occurs once):

1. `` hud/                          HUD over the canvas (profile card, elevator panel with named floors from `hud.floorLabel`, controls, boot, joystick) `` becomes `` hud/                          HUD over the canvas (profile card, elevator panel with named floors from `hud.floorLabel`, controls, boot, bottom band with joystick and BoostButton) ``.
2. `` `sessionStorage` keys owned by the Ask dock: `` becomes `` `sessionStorage` keys: `hq:intro` (boot and intro played this session, `src/lib/intro-session.ts`); owned by the Ask dock: ``.
3. `` `sessionStorage` keys: `hq:view` (page view), `hq:resume` (language switch resumes the floor without boot or intro). `` becomes `` `sessionStorage` keys: `hq:view` (page view), `hq:resume` (language switch resumes the floor without boot or intro), `hq:intro` (boot and intro played this session). `firstVisit` stays persisted for compatibility; the boot now follows `hq:intro`. ``
4. `` at the bottom, bottom-left beside the room drawer or the Ask side panel (`dock`, via `useAskPanelOpen` from `hud/ask/availability.ts`), or under the top controls on phones and bottom sheets (`top`; on tablets right of the profile card, below the Ask pill row), and an idle launcher pill. `` becomes `` at the bottom (above the bottom band on coarse pointers), bottom-left beside the room drawer or the Ask side panel (`dock`, via `useAskPanelOpen` from `hud/ask/availability.ts`), or under the top controls on phones and bottom sheets (`top`: 116 px on phones, under both top rows; on tablets right of the profile card, below the Page view and Ask AI row), and the idle launcher and paused pills, which `WalkBar` portals into the HUD bottom band (`slot`) unless the drawer or the Ask panel covers it. ``
5. `` (`drawer-body`: title, badges, subtitle, meta and the cross-floor link, then the tabs, sticky under the bar, then the tab body) and a one-row footer (primary action, View architecture). `` becomes `` (`drawer-body`: title, badges, subtitle and meta, then the tabs, sticky under the bar, then the tab body) and a footer row (`drawer-footer`: primary action, the cross-floor link as a secondary amber button right of it, then View architecture; it wraps on phones). The "..." menu offers the cross-floor link too. ``
6. `` The side drawer starts below the HUD top bar (`top-[68px]`, `md:top-[76px]`); hints hide while a room is open. `` becomes `` The side drawer starts below the HUD top bar (`top-[124px]` below 1024 px, under the Page view and Ask AI row, and `lg:top-[76px]`); hints hide while a room is open. ``
7. `` the "Ask AI" pill in the 3D top-right cluster (own row under the bar on tablets), `` becomes `` the "Ask AI" pill at the far right of the 3D top bar, right of the highlighted Page view (both on their own row below 1024 px), ``

Then append these bullets:

At the end of `## Missions and HUD`:
```md
- User-facing name (owner decision, October 2026): the Rover Terminal and its missions are **Ask Rover** (ID **Tanya Rover**) wherever a visitor reads them: the 3D top bar and Page View header button (`hud.launcher.askRover`), the terminal title and prompt (`./ask-rover`), the Cmd-K group, aria labels and the Lobby kiosk. Code names (`MissionHud`, `RoverTerminal`, `missions`, `hq:terminal-seen`) stay. Playwright finds the button with `{ name: "Ask Rover", exact: true }` (the Ask AI pill also starts with "Ask").
```
In `## 3D experience (Phases 1 to 5a)`, after the `Game-first load` bullet:
```md
- Boot and intro (owner decision, October 2026): on `/{locale}` the boot overlay and the intro play in full once per browser session (`sessionStorage["hq:intro"] = "seen"`, written by `Experience` when the intro hands over to explore; `src/lib/intro-session.ts`). Nothing skips them: no Skip button, Esc does nothing in `boot` or `intro`, mission steps wait for the intro (`afterIntro` in `host3d.ts`), and Boot rover only starts once the log has typed out (`aria-disabled` until then, same pace with reduced motion). Reduced motion keeps the 2.5 s length but holds one still exterior shot (`reducedIntroPose`) and then cuts to the follow camera. Later Lobby loads in the same session open straight in explore; deep links (start floor or room) and language switches skip boot and intro as before. Crawlers, Lighthouse and the static tier never load the 3D chunk. E2E: `asReturningVisitor` sets the flag, so `enterHQ` lands in explore and waits for `waitForSceneLive`.
- Boost (owner request): hold Shift, or the boost button beside the joystick on coarse pointers (`src/hud/BoostButton.tsx`, `setBoost` in `input/joystick.ts`), for 2x top speed and acceleration (`BOOST`, `boostOn`, `boostTuning`, `stepBoostLevel` in `rover/boost.ts`, pure). Manual driving only: the autopilot (missions, walks, the elevator approach) and click-to-move keep their speed. `RoverController.step` splits each frame so no sub-step travels more than `MAX_STEP_DISTANCE` (0.4 u, `physicsSteps`), so fast or slow frames never tunnel. The rover draws a short cyan trail while boosting (one additive quad, none under reduced motion); `roverRuntime.boost` is the eased level and `roverRuntime.trail` the drawn opacity (test probes).
```
At the end of `## Styling`:
```md
- 3D HUD layout (owner decisions, October 2026): the top bar has no Quick view (it stays in the Page View footer, the Home hero and About); Page view is the one primary (solid cyan) control, with the Ask AI pill on its right at the far right. From 1024 px everything is one row; below that Page view and Ask AI get their own row (tablets under the bar, phones under the menu row, so phone overlays under the top controls start at 116 px). The screen bottom is one flex band (`BottomBand` in `Hud.tsx`): joystick and boost button on the left (phones stack the boost button above the joystick), the walk pill above the controls hint in the center, the view controls on the right (vertical on phones). Nothing in the band can overlap, it hugs the bottom edge above the safe area, and `e2e/hud.spec.ts` checks the boxes at 834 x 1112 and 390 x 844. The profile card shows no rooms-visited counter; the store still records `visited`.
```

- [ ] **Step 3: Appendix 02 (`02-interaction-and-states.md`)**

Replace:
```md
  boot --> intro: Boot rover / auto on return visit
  intro --> explore: intro finished or skipped
```
with:
```md
  [*] --> explore: intro already played this session (L1), deep link or language switch
  boot --> intro: Boot rover (once the log has typed out)
  intro --> explore: intro finished (never skipped)
```
Replace:
```md
| boot → intro | Boot lines type out (max 6 lines), then a CRT-off flash | 1.2 s (skippable) | Instant |
| intro → explore | Exterior orbit and fly-in (see appendix 01) | 2.5 s | 200 ms fade |
```
with:
```md
| boot → intro | Boot lines type out (max 6 lines), then a CRT-off flash; once per browser session | 1.2 s, never skipped | Same pace (revealing lines is not motion) |
| intro → explore | Exterior orbit and fly-in (see appendix 01); once per browser session | 2.5 s, never skipped | A still exterior shot for the same 2.5 s, then a cut |
```

- [ ] **Step 4: Appendix 03 (`03-rover-camera-input.md`)**

Replace:
```md
| Max speed (autopilot) | 12 u/s | 12 u/s |
```
with:
```md
| Max speed (autopilot) | 12 u/s | 12 u/s |
| Max speed (boost: hold Shift or the boost button, manual driving only) | 18 u/s | 16 u/s |
| Acceleration while boosting | 36 u/s² | 36 u/s² |
```
Replace:
```md
- The joystick appears only on coarse pointers: bottom-left, 120 px diameter, 12% dead zone.
```
with:
```md
- The joystick appears only on coarse pointers: bottom-left, 120 px diameter, 12% dead zone, with a hold-to-boost button beside it (above it on phones). Keyboards boost with Shift. Physics sub-steps never travel more than 0.4 u, so boosting never tunnels through walls.
```

- [ ] **Step 5: Appendix 04 (`04-hud-responsive-i18n.md`, section 2 table)**

Replace:
```md
| Profile card | Top-left, 280 px, name, title, floor, visited `n/N` | Same, 240 px | Collapsed pill: monogram plus floor; tap to expand |
| Quick view | Top-right button | Top-right button | Inside the menu (≡) |
```
with:
```md
| Profile card | Top-left, 280 px, name, title, floor | Same, 240 px | Collapsed pill: monogram plus floor; tap to expand |
| Quick view | Not in the 3D HUD (Page View footer, Home hero and About) | Same | Same |
| Page view and Ask AI | Top-right, last in the bar: Page view (primary, solid cyan), then Ask AI at the far right | Own row under the bar, same order | Second row under the menu row, same order |
```
Replace:
```md
| Joystick | Hidden | Bottom-left on coarse pointers | Bottom-left |
| Hint bar | Bottom-center, keyboard hints | Touch hints | Touch hints, auto-hides after 6 s |
```
with:
```md
| Joystick and boost | Hidden (hold Shift to boost) | Bottom band, left, boost button beside the joystick (coarse pointers) | Bottom band, left, boost button above the joystick |
| Hint bar and walk pill | Bottom band, center: walk pill above keyboard hints | Same, touch hints, between the joystick and the view controls | Same, hints auto-hide after 6 s |
| View controls | Bottom band, right | Same | Bottom band, right, vertical |
```

- [ ] **Step 6: Check the docs**

Run: `rtk bunx vitest run tests/content/safety.test.ts && grep -rnP "\x{2014}" README.md AGENTS.md docs/superpowers/specs/agent-hq/0[1-4]-*.md || echo "no em dash"`
Expected: PASS and `no em dash`.

- [ ] **Step 7: Commit**

```bash
rtk git add README.md AGENTS.md docs/superpowers/specs/agent-hq/02-interaction-and-states.md docs/superpowers/specs/agent-hq/03-rover-camera-input.md docs/superpowers/specs/agent-hq/04-hud-responsive-i18n.md
rtk git commit -m "docs: boost, Ask Rover, unskippable intro, HUD bands and drawer footer"
```

---

### Task 11: Full verification, screenshots and PR

**Files:**
- Modify: `e2e/screenshots.spec.ts` (new `HUD layout` block)

**Interfaces:**
- Consumes: everything above.
- Produces: the PR.

- [ ] **Step 1: Add HUD screenshots**

In `e2e/screenshots.spec.ts`, append at the end of the file:
```ts
test.describe("HUD layout (bottom band, top bar, drawer footer)", () => {
  for (const vp of [
    { width: 834, height: 1112 },
    { width: 390, height: 844 },
  ] as const) {
    test(`bottom band on L3 @ ${vp.width}x${vp.height}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
      const page = await context.newPage();
      await asReturningVisitor(page);
      await page.goto("/en/labs?tier=lite&walk=on");
      await waitForHQ(page);
      await waitForPhase(page, "explore");
      await page.getByTestId("walk-prompt").getByRole("button", { name: "Explore freely" }).click();
      await expect(page.getByTestId("walk-launcher")).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      // In-world text (troika) builds its glyphs slowly on SwiftShader.
      await page.waitForTimeout(3000);
      await page.screenshot({ path: `screenshots/hq-bottom-band-${vp.width}x${vp.height}.png` });
      await context.close();
    });
  }

  for (const vp of [
    { width: 1440, height: 900, touch: false },
    { width: 390, height: 844, touch: true },
  ] as const) {
    test(`drawer footer on L2 @ ${vp.width}x${vp.height}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, hasTouch: vp.touch, isMobile: vp.touch });
      const page = await context.newPage();
      await asReturningVisitor(page);
      await page.goto("/en/journey/jenius-2024?tier=lite");
      await waitForHQ(page);
      await waitForRoom(page, "L2:jenius-2024");
      await expect(page.getByTestId("drawer-footer")).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(3000);
      await page.screenshot({ path: `screenshots/hq-drawer-footer-${vp.width}x${vp.height}.png` });
      await context.close();
    });
  }
});
```

- [ ] **Step 2: Quick verification**

Run: `rtk bun run verify:quick`
Expected: typecheck, lint, all Vitest files and `next build` pass (about 1 to 2 minutes). `tests/unit/e2e-plan.test.ts` confirms `hud` is a known spec; the em dash scan and `ui-copy` pass.

- [ ] **Step 3: Full e2e (this branch changes `e2e/hq.ts`)**

Run: `rtk bun run e2e:changed --dry && rtk bun run e2e:changed`
Expected: the dry run prints `all` (because `e2e/hq.ts` changed); the full suite then passes (20 to 40 minutes locally on SwiftShader), including every `expectRenderBudget` check (under 150 draw calls and 30k triangles per floor).

- [ ] **Step 4: Lighthouse budgets (optional locally, blocking in CI)**

Run: `rtk bunx @lhci/cli@0.15.1 autorun`
Expected: `Done running autorun.` with no failed assertions (LCP 2 s, CLS 0.01, TBT 200 ms, transfer budgets). The SSR boot cover only lost a button; nothing new ships on the Page View path.

- [ ] **Step 5: Screenshots**

Run: `SCREENSHOTS=1 rtk bunx playwright test e2e/screenshots.spec.ts --workers=1 -g "HUD layout|3D lobby|page view with Back|3D boot|terminal"`
Expected: PASS, and `ls screenshots | grep -E "hq-bottom-band|hq-drawer-footer|hq-lobby|page-view|hq-boot|terminal"` lists the new `hq-bottom-band-834x1112.png`, `hq-bottom-band-390x844.png`, `hq-drawer-footer-1440x900.png`, `hq-drawer-footer-390x844.png` and the refreshed lobby (top bar), page view, boot (no Skip) and terminal (Ask Rover) shots. Review them by eye: hint and pill on the bottom edge, Ask AI right of a cyan Page view, the cross link next to Open page.

- [ ] **Step 6: Commit the screenshot spec, push and open the PR**

```bash
rtk git add e2e/screenshots.spec.ts
rtk git commit -m "test(screenshots): HUD bottom band and drawer footer captures"
rtk git push -u origin feat/r3-b-hud-drawer-lobby
gh pr create --base main --head feat/r3-b-hud-drawer-lobby --label screenshots --title "feat(hud): boost, Ask Rover, unskippable intro, top bar, bottom band, drawer footer, centered Lobby" --body "$(cat <<'EOF'
## What
- Profile card: no more rooms visited counter (the store still records visited rooms for missions and walks).
- Boost: hold Shift (or the new boost button beside the joystick on touch) for about 2x speed with a short trail; no trail under reduced motion; autopilot and click-to-move unaffected; physics sub-steps capped at 0.4 u so nothing tunnels.
- Bottom band: the controls hint and the walk pills (Tour my projects, Walk my journey, Resume walk) sit on the bottom edge on tablets and phones, safe-area aware, in one flex row with the joystick, boost and view controls, so nothing overlaps.
- L1 Lobby: the lane ring, plaza and slab are centered on the elevator axis (z = 0), with a unit test.
- "Missions" is now "Ask Rover" (ID "Tanya Rover") in the HUD, Page View header, terminal, Cmd-K, aria labels, kiosk and docs.
- Boot and intro: no Skip button and no skipping keys; they play in full once per browser session (sessionStorage hq:intro); reduced motion keeps the length with a still shot. Deep links and language switches still open in place.
- 3D top bar: Quick view removed (it stays in the Page View), Page view highlighted, Ask AI on its right at the far right (desktop, tablet row, phone row).
- Room drawer: the cross-floor link ("Read the case study in Labs", "View the career entry") moved from the header into the footer, right of Open page or Read case study, for every room type.

## Tests
- Vitest: boost rules and sub-steps, intro session flag, BootOverlay, Controls, BoostButton, WalkBar slot, RoomDrawer footer order, Lobby axis alignment, host3d intro waits, rigs.
- Playwright: new e2e/hud.spec.ts (top bar order at 1440, 834 and 390; bottom band boxes at 834x1112 and 390x844; drawer footer), boost speed and trail in experience.spec.ts, unskippable intro once per session, renamed labels across specs. Full suite run locally (e2e/hq.ts changed).
- Render budget and Lighthouse budgets green.

## Coordination
Does not touch the elevator (call pad, teleporters) or content titles. Screenshots: label `screenshots` (CI artifact) plus the local HUD captures.
EOF
)"
```
Expected: the push succeeds and `gh pr create` prints the PR URL. Do not merge; the owner reviews.

---

## Self-Review

**1. Spec coverage**

| Requirement | Task |
|---|---|
| Remove ROOMS VISITED n/62 from the profile card; keep `visited` internally | 1 |
| Hold Shift for about 2x speed with a short trail; reduced motion: no trail | 2 (rules), 3 (Director, trail, e2e) |
| Touch boost button beside the joystick (hold to boost) | 2 (`setBoost`), 7 (`BoostButton`) |
| Autopilot unaffected; collisions correct at higher speed (sub-steps) | 2 (`boostOn`, `physicsSteps`, no-tunnel test) |
| Hint and Tour/Walk/Resume pills at the bottom on tablet and phone, safe-area aware, no overlap with joystick, boost, view controls, Ask | 7 (`BottomBand`, WalkBar slot, e2e boxes at 834x1112 and 390x844) |
| L1 circle and square symmetric with the elevator; unit test | 8 |
| "Missions" to "Ask Rover" everywhere user-facing (top bar, Page View header, terminal title, Cmd-K, aria, docs); ID "Tanya Rover" | 5, 10 |
| Full intro, no Skip, no skipping keys, once per browser session (sessionStorage), reduced motion same length, crawlers and Page View unaffected | 4 |
| No Quick view in the game; Page view highlighted; Ask AI right of Page view on desktop, tablet row and phone | 6 |
| Drawer header cross link into the footer right of the primary action, secondary style, wraps on phones, every drawer type | 9 |
| Do not touch elevator code or content titles; render and Lighthouse budgets green | Global Constraints, 3, 8, 11 |
| E2E: boost speed, intro unskippable once per session, top bar order, drawer footer, bottom boxes at 834x1112 and 390x844 | 3, 4, 6, 7, 9 |
| Screenshots, README and docs, PR | 10, 11 |

No gaps found.

**2. Placeholder scan:** every code step shows the full code or the exact before and after text; every command has an expected result. No "TBD", "similar to", or "add tests" without code.

**3. Type and name consistency:** `boostOn` / `boostTuning` / `stepBoostLevel` / `BOOST` (Task 2) are the names used in Director and Rover (Task 3). `physicsSteps` and `MAX_STEP_DISTANCE` (Task 2) match the docs (Task 10). `roverRuntime.boost` and `.trail` (Task 3) match the e2e probes. `introSeen` / `markIntroSeen` / `lobbyStartPhase` / `INTRO_KEY = "hq:intro"` (Task 4) match `e2e/hq.ts` and the docs. `reducedIntroPose` (Task 4) matches rigs and CameraDirector. `hud.launcher.askRover` (Task 5) is used by `HudLaunchers` in Tasks 5 and 6. `data-testid` values `page-view`, `ask-pill`, `hud-topbar`, `hud-view-actions` (Task 6), `boost`, `hud-bottom`, `hud-bottom-center`, `walk-launcher`, `walk-pill`, `hint`, `joystick`, `view-controls` (Task 7), `drawer-footer`, `drawer-cross-link` (Task 9) match the tests. `WalkBarProps.slot` and the `WalkLayer` prop `bottomSlot` (Task 7) are wired in `Hud.tsx` (Task 7). The phone offset `top-[116px]` (Task 6) is repeated in the full `Hud.tsx` of Task 7 (`FloorNotice`).

**Known risks for the owner (not blocking the plan):**
- Deep links (`/en/labs`, `/en/journey/...`) and language switches still skip boot and intro (the URL contract and many specs rely on it); only `/{locale}` plays them. Say so if every first visit must play the intro.
- `sessionStorage` is per tab: a new tab replays the intro.
- Cmd-K still lists the "Quick view" action (a search action, not a HUD button).
- Merge risk with parallel sessions: `messages/*.json`, `Hud.tsx`, `AskDock.tsx`, `WalkLayer.tsx`, `config.ts` (R3-F roof edits), `e2e/hq.ts`, `experience.spec.ts`, `missions.spec.ts`; the Lobby moved +4 u in z, so anything another session places at absolute L1 coordinates must be rechecked (the elevator approach (-21, 0) and door are unchanged).

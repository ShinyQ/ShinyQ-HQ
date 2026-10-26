# Phone-First 3D Implementation Plan

Status: in review.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the first 30 seconds of the 3D tower on a portrait phone feel made for the screen (boot card, landing frame, onboarding), while the 3D first-frame path and both session totals go down or stay equal.

**Architecture:** Spec `docs/superpowers/specs/2026-10-25-phone-first-3d-design.md` (approved 2026-10-25). The tour script (`src/hud/dialog/onboarding.ts`, pure, no value imports) becomes a lazy chunk loaded only by a session that plays the tour; that frees main-path bytes that pay for a docked dialog card, a bottom-band step-aside and a prime-only phone view on the existing `L1:kiosk` spawn zone. The boot card change is CSS plus one data attribute; the wake framing lives in the intro chunk.

**Tech Stack:** Next.js 16 static export, React 19, react-three-fiber, zustand, next-intl, Tailwind 4, Vitest, Playwright, Bun.

## Global Constraints

- No em dashes (U+2014) anywhere: code, comments, copy, docs, commits, PR text.
- Every user-facing string is `{ en, id }` / in both `messages/en.json` and `messages/id.json` with identical keys; Indonesian uses "saya".
- 3D first frame (`BYTES_3D_BUDGET.failAt`, 477,594 B; full measures 477,249 B on main 6397c628) and both session totals (caps lite 528,424 B, full 544,558 B) must measure at or below main. No existing cap changes.
- New cap `BYTES_3D_BUDGET.tour` = measured + 614 B, outside both session totals (approved by the parent session under the owner's delegation, 2026-10-25).
- The tour chunk loads only in a session that plays the tour (not onboarded, or Replay tutorial); never for a returning visitor.
- Desktop and tablet camera poses stay bit-identical; tablets and desktops keep today's boot card and 8-step tour.
- Classic CSS stays under 20,480 B (live 19,586 B gzip); the phone CSS block under 300 B gzip. Only Tailwind utilities that the stylesheet already contains (grep the built CSS before adding one).
- Corners HUD caps (phone 6, tablet 10) unchanged.
- Animate in CSS only; reduce rules use `@variant motion-reduce` or the existing `motion-reduce:` utility; no new rAF loop.
- Commits: conventional messages, one per task.

## Deviations from the spec (decided while planning)

1. Landing view: no new `L1:spawn` zone. The session spawn is already the primed `L1:kiosk` zone (`floors/lobby/observatoryLayout.ts`, `prime: true`), and the intro already lands on the primed pose (`CameraDirector`, `introPlan(..., end)` with pitch and look offsets). A new optional `ViewZone.primeView` (per class, used only by `primeZone`) gives the phone landing pose at session start, and the existing `classView` still applies when a drive comes back to the kiosk. This matches the owner's "every L1 session start", not "every return".
2. Tour chunk loader: `OnboardingLayer` (3D chunk) starts `loadTour()` on mount when not onboarded, not `ExperienceGate`. The chunk entry has no value imports, so it cannot regroup shared modules, and the Classic page bundle stays untouched.
3. A failed tour chunk on Replay tutorial does nothing that time (the shared promise resets, the next Replay retries); no toast.
4. Boot card size: the card is at most 55% of 390 x 844 and at most 66% of 375 x 667 (55% does not fit the owner block on a 667 px screen); Boot rover and the Classic site link share one row.

## File map

| File | Responsibility | Task |
|---|---|---|
| `src/hud/dialog/names.ts` (new) | `firstName` (main path) | 1 |
| `src/hud/dialog/onboarding.ts` | the tour script (becomes the chunk entry): `COPY_KEYS`, `onboardingCopy`, phone steps | 1, 2 |
| `src/hud/dialog/tourChunk.ts` (new) | `loadTour()`, the only `import()` of the chunk | 1 |
| `src/hud/dialog/OnboardingLayer.tsx` | start timing, deep-link wait, Replay host, runs the loaded tour | 1, 2 |
| `src/experience/Experience.tsx` | `__hq.tour.load` probe | 1 |
| `tests/unit/tour-chunk-graph.test.ts` (new) | chunk boundary | 1 |
| `e2e/budgets.ts`, `e2e/perf/bytes-3d.spec.ts` | `tour` cap and measurement | 1 |
| `messages/en.json`, `messages/id.json` | 3 new `dialog.onboarding` keys | 2 |
| `src/hud/dialog/placement.ts`, `DialogBox.tsx` | docked card | 3 |
| `src/hud/Hud.tsx`, `src/hud/Joystick.tsx` | bottom band step-aside | 3 |
| `src/experience/camera/orbit.ts` | `primeView`, `zonePrime`, turn-back yaw | 4 |
| `src/experience/floors/lobby/observatoryLayout.ts` | the kiosk zone's phone `primeView` | 4 |
| `tests/unit/landing-view.test.ts` (new) | framing at 390 x 844 and 375 x 667 | 4 |
| `src/app/globals.css`, `src/components/BootCard.tsx` | bottom boot card, rolling line | 5 |
| `src/experience/camera/intro.ts` | phone wake look (intro chunk) | 5 |
| `e2e/phone-first.spec.ts` (new), `scripts/e2e-plan.ts` | phone e2e | 6 |
| docs, decision file | current-state docs | 7 |

---

### Task 1: The tour script becomes a lazy chunk

**Files:**
- Create: `src/hud/dialog/names.ts`, `src/hud/dialog/tourChunk.ts`, `tests/unit/tour-chunk-graph.test.ts`
- Modify: `src/hud/dialog/onboarding.ts`, `src/hud/dialog/OnboardingLayer.tsx`, `src/hud/Hud.tsx:18`, `src/hud/dialog/FloorIntroLayer.tsx:11`, `src/experience/Experience.tsx` (the `__hq` object near line 195), `e2e/budgets.ts`, `e2e/perf/bytes-3d.spec.ts`, any test that imports `firstName` from `onboarding`
- Test: `tests/unit/tour-chunk-graph.test.ts`, `tests/unit/onboarding.test.ts`, `tests/hud/*Onboarding*` if present

**Interfaces:**
- Produces: `firstName(name: string): string` in `@/hud/dialog/names`; `loadTour(): Promise<TourModule | null>` and `type TourModule = typeof import("./onboarding")` in `@/hud/dialog/tourChunk`; `COPY_KEYS: readonly (keyof OnboardingCopy)[]`, `type TourT = (key: string, values: { name: string }) => string`, `onboardingCopy(t: TourT, name: string): OnboardingCopy` in `onboarding.ts`; `window.__hq.tour.load(): Promise<unknown>`.

- [ ] **Step 1: Write the failing graph test** `tests/unit/tour-chunk-graph.test.ts` (pattern of `tests/unit/intro-chunk-graph.test.ts`):

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT, staticClosure } from "../helpers/import-graph";

/** The first-session tour chunk (tourChunk.ts loads it only for a session that plays the tour, or Replay tutorial). */
const ENTRY = "src/hud/dialog/onboarding.ts";

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) files(full, out);
    else if (/\.tsx?$/.test(name)) out.push(relative(ROOT, full));
  }
  return out;
}

describe("tour chunk boundary", () => {
  it("keeps the tour script out of the main 3D chunk and the gate", () => {
    for (const entry of ["src/experience/Experience.tsx", "src/experience/ExperienceGate.tsx"]) {
      expect(staticClosure(entry).has(ENTRY), entry).toBe(false);
    }
  });

  it("keeps the loader on the main path", () => {
    expect(staticClosure("src/experience/Experience.tsx").has("src/hud/dialog/tourChunk.ts")).toBe(true);
  });

  it("imports the entry dynamically from tourChunk.ts only, and the entry imports no values", () => {
    const importers = files(join(ROOT, "src")).filter((f) => /import\(\s*["'][^"']*\/onboarding["']\s*\)/.test(readFileSync(join(ROOT, f), "utf8")));
    expect(importers).toEqual(["src/hud/dialog/tourChunk.ts"]);
    // Type-only imports keep shared modules out of the chunk, so Turbopack never regroups them.
    expect([...staticClosure(ENTRY)]).toEqual([ENTRY]);
  }, 60_000);
});
```

Check `tests/helpers/import-graph.ts`: if `staticClosure` follows `import type`, change the last assertion to check that every `import` line in `onboarding.ts` is `import type`.

- [ ] **Step 2: Run it, expect FAIL** (`Hud.tsx` imports `firstName` from `onboarding.ts`).

Run: `bunx vitest run tests/unit/tour-chunk-graph.test.ts`

- [ ] **Step 3: Move `firstName`.** Create `src/hud/dialog/names.ts`:

```ts
/** The first word of a name (Rover's lines say "Kurniadi's HQ"). */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}
```

Delete `firstName` from `onboarding.ts`; repoint `Hud.tsx`, `FloorIntroLayer.tsx`, `OnboardingLayer.tsx` and tests (`grep -rn "firstName" src tests`) to `./names` / `@/hud/dialog/names`.

- [ ] **Step 4: Add the copy builder to `onboarding.ts`** (after `OnboardingCopy`):

```ts
/** Every copy key, in `dialog.onboarding`; OnboardingLayer resolves them with its `t` once the chunk is in. */
export const COPY_KEYS = [
  "welcome", "start", "skip", "skipped", "moveFine", "moveCoarse", "pointGoFine", "pointGoCoarse", "moved",
  "cameraFine", "cameraCoarse", "highlights", "showMe", "later", "elevator", "roverMenu", "askAi", "closing", "closingShort",
] as const satisfies readonly (keyof OnboardingCopy)[];

/** A `t` of the `dialog.onboarding` namespace; every line gets `{ name }` (lines without the placeholder ignore it). */
export type TourT = (key: string, values: { name: string }) => string;

export function onboardingCopy(t: TourT, name: string): OnboardingCopy {
  return Object.fromEntries(COPY_KEYS.map((key) => [key, t(key, { name })])) as unknown as OnboardingCopy;
}
```

Add a unit test in `tests/unit/onboarding.test.ts`: `onboardingCopy((k, v) => `${k}:${v.name}`, "Ana")` returns an object whose keys equal `COPY_KEYS` and whose `welcome` is `"welcome:Ana"`; and `COPY_KEYS` covers every key of `messages/en.json` `dialog.onboarding` (read the JSON, compare sorted lists).

- [ ] **Step 5: Create `src/hud/dialog/tourChunk.ts`:**

```ts
import type * as Tour from "./onboarding";

/** The first-session tour chunk (`./onboarding.ts`): the script, its copy keys and the try-it helpers. */
export type TourModule = typeof Tour;

let pending: Promise<TourModule | null> | null = null;

/**
 * Loads the tour chunk once per page (one shared promise), only for a session that plays the tour or Replay tutorial.
 * Resolves to null when the import fails, and forgets the failure so the next call (the next Replay) tries again.
 * This import() is the only reference to the chunk entry.
 */
export function loadTour(): Promise<TourModule | null> {
  pending ??= import("./onboarding").then(
    (mod) => mod,
    () => {
      pending = null;
      return null;
    },
  );
  return pending;
}
```

- [ ] **Step 6: Rewrite `OnboardingLayer.tsx`** to import only types from `./onboarding` and run the loaded module. Replace the value import line with:

```ts
import { firstName } from "./names";
import type { OnboardingVariant, TourT } from "./onboarding";
import { loadTour } from "./tourChunk";
```

Replace the body of `run` (keep `running` guard, `markOnboarded` rule and `finally`):

```ts
  const run = useCallback(
    async (variant: OnboardingVariant, replay: boolean) => {
      if (running.current) return;
      running.current = true;
      try {
        const tour = await loadTour();
        // A failed chunk: no tour this time, nothing marked, so a later session (or Replay) tries again.
        if (!tour) return;
        const outcome = await tour.runOnboarding({
          say,
          copy: tour.onboardingCopy(t as unknown as TourT, name),
          coarse,
          variant,
          waitForMove: (signal) => tour.waitForRoverMove(getHQStore(), signal),
          // The hall registers its stations as L1 extras, so they are found from any floor (replay).
          highlights: () => tour.highlightsTarget(extraItems("L1")),
          showMe: async (hall) => {
            const drive: MissionStep = { kind: "drive", to: hall.at };
            const steps: MissionStep[] = getHQStore().getState().floor === hall.floor ? [drive] : [{ kind: "elevator", floor: hall.floor }, drive];
            await runMissionSteps("onboarding:highlights", steps);
          },
          askAi: () => document.querySelector("[data-testid='hud'] [data-onboard='ask-ai']") !== null,
        });
        if (outcome !== "cancelled" && (!replay || !onboarded())) markOnboarded(outcome);
      } finally {
        running.current = false;
      }
    },
    [t, name, coarse],
  );

  // A session that will play the tour fetches its chunk early (during the boot and intro); a returning visitor never does.
  useEffect(() => {
    if (!onboarded()) void loadTour();
  }, []);
```

Update the component doc comment: the script is a lazy chunk (`tourChunk.ts`).

- [ ] **Step 7: Probe and byte gate.**
  - `Experience.tsx`: import `loadTour` from `@/hud/dialog/tourChunk` and add `tour: { load: loadTour },` next to `office:` in the `__hq` object (and its type, wherever `__hq` is typed: `grep -rn "office: {" src/experience/fx src/experience/*.ts e2e/hq.ts`).
  - `e2e/budgets.ts`: in `BYTES_3D_BUDGET` add (the number is set in Task 7 Step 3; start with a provisional `1_400 + 614` and replace it with the measurement):

```ts
  /** First-session tour chunk (`hud/dialog/onboarding.ts`, loaded only by a session that plays the tour or Replay tutorial), outside both session totals like the intro chunk (parent session under the owner's delegation, 2026-10-25): measured + 614 B. */
  tour: 1_400 + 614,
```

  - `e2e/perf/bytes-3d.spec.ts`: after the office beacon measurement (last), measure the tour chunk the same way as `measureOffice`:

```ts
type TourLoad = { __hq: { tour?: { load: () => Promise<unknown> } } };

/** Bytes of the first-session tour chunk (`__hq.tour.load()`), on top of everything counted; null on a build without it. */
async function measureTour(page: Page, seen: Set<string>, counted: Set<string>): Promise<number | null> {
  if (!(await page.evaluate(() => Boolean((window as unknown as TourLoad).__hq.tour)))) return null;
  const loaded = await recordTransfers(page, () => page.evaluate(() => (window as unknown as TourLoad).__hq.tour!.load().then(() => undefined)), 2000);
  const bytes = loaded.filter((t) => t.type === "script" && !seen.has(t.path) && !counted.has(t.path)).reduce((n, t) => n + t.bytes, 0);
  for (const t of loaded) counted.add(t.path);
  return bytes;
}
```

  Call it last in each tier's test, add `...(tour === null ? {} : { tour })` to the `writePerfEntry` payload, log `First-session tour chunk (${tier}): ${kb(tour)} gzip (cap ${kb(BYTES_3D_BUDGET.tour)}), outside the session total`, and `expect(tour).toBeLessThanOrEqual(BYTES_3D_BUDGET.tour)` when not null. Add one sentence to the file's doc comment. Never add it to `sessionTotal`.

- [ ] **Step 8: Run the tests.**

Run: `bunx vitest run tests/unit/tour-chunk-graph.test.ts tests/unit/onboarding.test.ts tests/unit/hall-interact.test.ts tests/hud tests/unit/client-namespaces.test.ts`
Expected: PASS. Fix any OnboardingLayer HUD test that now needs `await`/`findBy*` for the async chunk.

- [ ] **Step 9: Typecheck, lint, build.** `bun run typecheck && bun run lint && bun run build` (or `bun run verify:quick`). Expected: PASS, the build's client-chunk checks pass.

- [ ] **Step 10: Commit** `refactor(onboarding): the first-session tour script loads as its own chunk`.

---

### Task 2: The phone tour

**Files:**
- Modify: `src/hud/dialog/onboarding.ts`, `src/hud/dialog/OnboardingLayer.tsx`, `messages/en.json`, `messages/id.json`
- Test: `tests/unit/onboarding.test.ts`, `tests/unit/dialog-copy.test.ts`

**Interfaces:**
- Consumes: Task 1's `COPY_KEYS`, `onboardingCopy`, `OnboardingDeps`.
- Produces: `OnboardingDeps.phone: boolean`; copy keys `pointGoPhone`, `movedPhone`, `floorChip`; phone line keys in order `welcome`, `point-go`, `moved`, `floor-chip`, `rover-menu`, (`ask-ai`), `closing`.

- [ ] **Step 1: Failing tests** in `tests/unit/onboarding.test.ts` (reuse the file's fake `say` helper; read it first). Cases:
  - `phone: true, variant: "full"`, Ask on: the spoken line keys are exactly `["welcome", "point-go", "moved", "floor-chip", "rover-menu", "ask-ai", "closing"]`; `floor-chip` has `spotlight: "elevator"`, `rover-menu` `"rover-menu"`, `ask-ai` `"ask-ai"`; `point-go` has `until` and its text is `copy.pointGoPhone`; `moved` text `copy.movedPhone`; `highlights` and `showMe` are never called.
  - `phone: true, variant: "short"`, Ask off: `["welcome", "point-go", "moved", "floor-chip", "rover-menu", "closing"]`, closing text `copy.closingShort`.
  - `phone: false`: the existing expectations unchanged (add `phone: false` to the existing deps builders).

- [ ] **Step 2: Run, expect FAIL.** `bunx vitest run tests/unit/onboarding.test.ts`

- [ ] **Step 3: Implement.** In `OnboardingCopy` add `pointGoPhone: string; movedPhone: string; floorChip: string;`, append the three keys to `COPY_KEYS`, add `/** A phone (the Corners phone HUD with touch): the short phone script. */ phone: boolean;` to `OnboardingDeps`. Replace step 2 through the `if (d.variant === "full")` block with:

```ts
  if (d.phone) {
    // Phones (owner decision 2026-10-25): tap-to-go first (the joystick and Boost are on screen and in the menu's
    // Controls card), then the floor chip; no camera, Highlights Hall or elevator pad lines.
    result = await d.say(
      [
        { key: "point-go", text: copy.pointGoPhone, until: d.waitForMove, fallbackMs: d.tryItMs ?? TRY_IT_MS },
        { key: "moved", text: copy.movedPhone, face: "arrived" },
        { key: "floor-chip", text: copy.floorChip, spotlight: "elevator" },
      ],
      tour,
    );
    end = await ended(result);
    if (end) return end;
  } else {
    // (the existing step 2 say, its ended check, and the existing `if (d.variant === "full") { ... }` block, unchanged)
  }
```

Steps 5 and 6 (Rover menu, Ask, closing) stay shared.

- [ ] **Step 4: Copy.** In `messages/en.json` `dialog.onboarding` add:

```json
      "pointGoPhone": "Tap a glowing object, then tap it again or its Go button, and I'll drive you there. Try it!",
      "movedPhone": "Nice driving! The joystick and the Boost button work too.",
      "floorChip": "Tap the floor chip up here to ride the elevator to another floor.",
```

In `messages/id.json`:

```json
      "pointGoPhone": "Ketuk objek yang menyala, lalu ketuk lagi atau tombol Pergi, nanti saya antar. Coba!",
      "movedPhone": "Mantap! Joystick dan tombol Turbo juga bisa dipakai.",
      "floorChip": "Ketuk chip lantai di atas untuk naik lift ke lantai lain.",
```

- [ ] **Step 5: Wire `phone`.** In `OnboardingLayer.tsx`: `const phone = useHQStore((s) => s.device.coarse && s.device.viewport === "mobile");` (the `phone` dialog placement), pass `phone` to `runOnboarding`, add it to the `useCallback` deps.

- [ ] **Step 6: Run** `bunx vitest run tests/unit/onboarding.test.ts tests/unit/dialog-copy.test.ts tests/unit/i18n*.test.ts tests/hud` Expected: PASS.

- [ ] **Step 7: Commit** `feat(onboarding): a short phone tour (tap-to-go, the floor chip, the menu, Ask)`.

---

### Task 3: Docked dialog card and the bottom band step-aside

**Files:**
- Modify: `src/hud/dialog/placement.ts`, `src/hud/dialog/DialogBox.tsx`, `src/hud/Hud.tsx` (`BottomBand`, `Hud`), `src/hud/Joystick.tsx`
- Test: `tests/hud/DialogBox.test.tsx` (or the existing dialog HUD test file), `tests/hud/Joystick.test.tsx`, `tests/unit/dialog-placement*.test.ts` if present

**Interfaces:**
- Produces: `docks(view: Pick<DialogView, "line" | "paused" | "fallback">): boolean` and `DOCK_PLACE: string` in `placement.ts`; `DialogBox` sets `data-docked="true"` when docked; `Joystick` prop `aside?: boolean`; `BottomBand` prop `aside?: boolean`, `data-aside` on `hud-bottom`.

- [ ] **Step 1: Failing tests.**
  - placement: `docks({ line: { key: "a", text: "x", choices: [{ id: "a", label: "A" }, { id: "b", label: "B" }] }, paused: false, fallback: false })` is true; without choices and `fallback: false` false; `fallback: true` true; `paused: true` false.
  - DialogBox (render with `placement="phone"` after `dialog.say` a line with choices; see how the existing DialogBox test drives the engine): the box has `data-docked="true"` and its class contains `bottom-[calc(12px+env(safe-area-inset-bottom))]`; the choices group has `flex-col`; with `placement="raised"` and the same line, no `data-docked`.
  - Joystick: render `<Joystick boost aside={false} />`, fire `pointerDown` then `pointerMove` on `joystick` (see the existing test for event shape), rerender with `aside={true}`: `setJoystick` was last called with `(0, 0, false)` (spy on `@/experience/input/joystick`) and the knob transform is back to `translate(calc(-50% + 0px), calc(-50% + 0px))`.
  - Hud (if a Hud test harness exists in `tests/hud/HudCorners.test.tsx`): on a phone layout with a choice line spoken, `hud-bottom` has `inert` and `data-aside="true"`.

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: `placement.ts`.** Add:

```ts
import type { DialogView } from "./engine";

/** Docked on a phone (owner decision 2026-10-25): the box sits at the bottom in thumb reach, full width. */
export const DOCK_PLACE = "bottom-[calc(12px+env(safe-area-inset-bottom))] left-3 right-3";

/**
 * A phone line that asks for a choice (its own choices, or a try-it's Continue) docks at the bottom while it shows,
 * and the bottom band (joystick, Boost, Reset view) steps aside. Lines without choices stay the slim toast.
 */
export function docks(view: Pick<DialogView, "line" | "paused" | "fallback">): boolean {
  return !view.paused && Boolean(view.line?.choices?.length || view.fallback);
}
```

Before adding the class strings, confirm the utilities exist: `bun run build` then `grep -c "flex-col\|w-full\|opacity-0\|transition-opacity" .next/static/chunks/*.css` (or the built CSS under `out/`). `bottom-[calc(12px+env(safe-area-inset-bottom))]` is new: it costs a few bytes; keep it.

- [ ] **Step 4: `DialogBox.tsx`.** After `const toast = placement === "phone";` add `const docked = toast && docks(view);` (import `docks`, `DOCK_PLACE`). Use `${docked ? DOCK_PLACE : DIALOG_PLACE[placement]}` in the section class, add `data-docked={docked ? "true" : undefined}`, the choices group class `${docked ? "mt-2 flex flex-col gap-2" : "mt-2 flex flex-wrap gap-2"}`, and each choice button `${docked ? "w-full" : ""}` in front of its class. Add to the doc comment: "On a phone a line with choices docks at the bottom (`DOCK_PLACE`), its choices stacked full width."

- [ ] **Step 5: `Joystick.tsx`.** `export function Joystick({ boost = false, aside = false }: { boost?: boolean; aside?: boolean })`, pass `aside` through `BoostJoystick` to `Stick`, and in `Stick` (import `useEffect`):

```ts
  // Stepping aside for a docked Rover line (the band goes inert): let go of a held stick, so the rover stops.
  useEffect(() => {
    if (!aside || active.current === null) return;
    active.current = null;
    setJoystick(0, 0, false);
    setKnob({ x: 0, y: 0 });
  }, [aside]);
```

- [ ] **Step 6: `Hud.tsx`.** `BottomBand({ left, right, aside = false, children })`: add `inert={aside}`, `data-aside={aside ? "true" : undefined}` and `transition-opacity motion-reduce:transition-none ${aside ? "opacity-0" : ""}` to the `hud-bottom` div. In `Hud`: `const docked = useDialog((v) => phone && coarse && docks(v));` and pass `aside={docked}` to `BottomBand` and `<Joystick boost aside={docked} />`. The center column (point-and-go status) is inside the band and steps aside too; that is intended (the docked card covers it). Update `BottomBand`'s doc comment.

- [ ] **Step 7: Run** `bunx vitest run tests/hud tests/unit/dialog*.test.ts` Expected: PASS. Then `bun run verify:quick`.

- [ ] **Step 8: Commit** `feat(hud): a phone line with choices docks at the bottom and the bottom band steps aside`.

---

### Task 4: The phone landing view on L1

**Files:**
- Modify: `src/experience/camera/orbit.ts` (`ViewZone`, `OrbitState` and its factory, `turnOf`, `zoneView`, `primeZone`, `updateZone`, `reclassZone`), `src/experience/floors/lobby/observatoryLayout.ts`
- Create: `tests/unit/landing-view.test.ts`
- Test: `tests/unit/camera-look-offset.test.ts`, `tests/unit/lobby-observatory.test.ts`, every `tests/unit/*orbit*`/`*camera*` test

**Interfaces:**
- Produces: `ViewZone.primeView?: Partial<Record<ViewportClass, ClassView>>` (`type ClassView = { yaw?: number; zoom?: number; pitch?: number; lookOffset?: LookOffset }`, exported); `zoneView(zone, cls?, prime = false)`; `OrbitState.zonePrime: boolean`; `OBSERVATORY_VIEW.landingPhone: { zoom: number; pitch: number; lookOffset: LookOffset }`.

- [ ] **Step 1: Failing tests.**
  - In `tests/unit/lobby-observatory.test.ts` (or a new block in `landing-view.test.ts`): the `L1:kiosk` zone has `primeView.mobile` with a `pitch`; it has no `primeView.desktop` or `primeView.tablet`.
  - Orbit (`landing-view.test.ts`): with a fresh `OrbitState` (use the factory the orbit tests use), `primeZone(s, kiosk, "mobile")` sets `s.pitch === OBSERVATORY_VIEW.landingPhone.pitch` (clamped within the range), `s.zonePrime === true`, `s.zoneTurn === yawLooking(axis)` (the class view's yaw); `primeZone(s, kiosk, "desktop")` yields exactly the same fields as before this task (compare with `zoneView(kiosk, "desktop")`: yaw, zoom, pitch 0, look offsets 0). `updateZone(s, null, false, "mobile")` after the mobile prime sets `pitchTarget` 0, `yawTarget` the nearest angle of `yawLooking(axis)`, `lookForwardTarget`/`lookUpTarget` 0, `zoomTarget` 1. Driving back: `updateZone(s, kiosk, false, "mobile")` from no zone uses the `classView.mobile` (pitch target 0, zoom `spawnZoomNarrow.mobile`), not the prime view.
  - Rotation: after the mobile prime, `updateZone(s, kiosk, false, "tablet")` (same id, class changed) eases the pitch target back to 0 (the tablet class view has no pitch).
  - Framing (pure, no renderer), at 390 x 844 and 375 x 667, camera class from `cameraClass(w, h)`: build the landing pose like `CameraDirector` (`followForward(cls, yaw)`, `FOLLOW_LOOK_AHEAD[cls]`, `followOffsetScale(cls, w / h)`, `followPose(cls, [spawn.x + f.x * ahead, 1, spawn.z + f.z * ahead], yaw, zoom * scale, pitch, forward, up, right)` with the primed values). Project with a screen helper extended from `tests/unit/lobby-title.test.ts` (`screenY` plus the matching `screenX` using `r`). Safe frame: x in [12, w - 12], y in [76, h - 168] (the top bar and minimap row, and the joystick, Boost and toast band). Assert: the rover (`LOBBY.spawn`, y 1) inside; both ends of the name (`LOBBY.hologram`, y `TITLE_TOP` from `floors/lobby/layout.ts`, x plus and minus half the name width: use the title's measured half width from `lobbyElements` if it exposes it, else 4 u) inside; at least 6 of the 8 stats tile centers (from `lobbyElements(...)`, read `floors/lobby/layout.ts` for the tile list) inside; the slab's far edge along the view (the `LOBBY.bounds` corner point farthest along the camera's forward, y 0) at `screenY <= 0.15 * h`.

- [ ] **Step 2: Run, expect FAIL.** `bunx vitest run tests/unit/landing-view.test.ts tests/unit/lobby-observatory.test.ts`

- [ ] **Step 3: `orbit.ts`.**
  - Export `type ClassView = { yaw?: number; zoom?: number; pitch?: number; lookOffset?: LookOffset };` and use it in `classView`.
  - Add to `ViewZone`:

```ts
  /**
   * Another class view applied only when the zone is primed (`primeZone`: the session start, through the boot and the
   * intro), never when a drive enters it (owner decision 2026-10-25: the phone landing view on L1 at every session start,
   * not on every return to the spawn). Falls back to `classView`.
   */
  primeView?: Partial<Record<ViewportClass, ClassView>>;
```

  - `OrbitState`: `/** The current zone was primed (its `primeView` applies), not entered by a drive. */ zonePrime: boolean;` default `false` in the state factory.
  - `turnOf`: return `view.yaw` instead of `zone.yaw` (identical for every existing pitched class view, which has no own yaw; a primed phone view that turns returns to its own yaw). Update its doc comment.
  - `zoneView(zone, cls?, prime = false)`: `const own = cls ? ((prime ? zone.primeView?.[cls] : undefined) ?? zone.classView?.[cls]) : undefined;`
  - `primeZone`: `const view = zone ? zoneView(zone, cls, true) : ...;` and `s.zonePrime = zone !== null;`
  - `updateZone`: right after `s.zoneCls = cls;` in the entering branch, `s.zonePrime = false;`.
  - `reclassZone`: `const was = zoneView(zone, from, s.zonePrime); const view = zoneView(zone, to, s.zonePrime);`.

- [ ] **Step 4: `observatoryLayout.ts`.** Add to `OBSERVATORY_VIEW` (starting values; Step 5 tunes them):

```ts
  /**
   * Phone landing view at the session start (owner decision 2026-10-25, primed only): steeper and aimed back toward the
   * camera, so Rover, the name over the hologram and the stats ring fill a portrait frame with little sky. Leaving the
   * spawn eases back to the follow view (its `pitch` opts into the turn-back).
   */
  landingPhone: { zoom: 1.85, pitch: 0.3, lookOffset: { forward: -4, up: 0 } },
```

and to the `L1:kiosk` zone: `primeView: { mobile: { yaw: yawLooking(axis), zoom: OBSERVATORY_VIEW.landingPhone.zoom, pitch: OBSERVATORY_VIEW.landingPhone.pitch, lookOffset: OBSERVATORY_VIEW.landingPhone.lookOffset } },`.

- [ ] **Step 5: Tune** `landingPhone` until the framing test passes at both sizes, preferring the smallest pitch that clears the sky rule. Then capture the real frame: `bun run build`, serve `out/` (`bun scripts/serve-static.ts` or the repo's preview script; check `package.json`), and with Playwright at `devices["iPhone 13"]` but viewport 390 x 844, `asReturningVisitor`, open `/en?tier=lite`, wait for `waitForSceneLive`, screenshot. Adjust until the name, Rover and the ring read clearly between the top bar and the joystick. Record the final values in the comment.

- [ ] **Step 6: Run** `bunx vitest run tests/unit` (the frozen-pose test `camera-look-offset.test.ts` must stay green: desktop and tablet poses are identical). Expected: PASS.

- [ ] **Step 7: Commit** `feat(camera): a phone landing view on L1 at every session start`.

---

### Task 5: The boot card on a portrait phone

**Files:**
- Modify: `src/components/BootCard.tsx`, `src/app/globals.css` (after the `@layer components` block that holds `.hq-boot-*`), `src/experience/camera/intro.ts`
- Test: `tests/unit/boot-card*.test.tsx` or `tests/hud/BootOverlay.test.tsx` (whichever renders `BootCard`), `tests/unit/intro*.test.ts`, `tests/unit/ascii.test.ts`

**Interfaces:**
- Produces: `BootCard` marks the newest shown log line `data-last=""` (`i === shown - 1`); classes `hq-boot-mark` (img), `hq-boot-title` (title `p`), `hq-boot-actions` (button row); `WAKE[cls].boot?: number` (look height held during the boot, intro chunk).

- [ ] **Step 1: Failing tests.**
  - BootCard: rendered with `shown={3}` of 6 lines, only the third `li` has `data-last`; with `shown={6}` the sixth; `shown={0}` none. The img has class `hq-boot-mark`, the title `hq-boot-title`.
  - Intro (in the existing intro test file): `introPose(plan, 0)` for `"mobile"` has a lower target y than with `WAKE.mobile.boot` removed (compute: target y equals `rover[1] + WAKE.mobile.boot` at t 0), and at `t = INTRO.wake` the target y equals today's wake look path (`boot` no longer applies); desktop and tablet poses unchanged at every sampled `t` (compare against values computed before the edit, or assert `WAKE.desktop.boot === undefined && WAKE.tablet.boot === undefined`).

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: `BootCard.tsx`.** Add `className="hq-boot-mark mt-3 block"` to the img, `hq-boot-title` in front of the title's classes, `data-last={i === p.shown - 1 ? "" : undefined}` on each `li`, and `hq-boot-actions` in front of the button row's classes. Doc comment: "On a portrait phone the card docks at the bottom and the log shows one rolling line (`data-last`, globals.css)."

- [ ] **Step 4: `globals.css`.** After the closing brace of the `@layer components` block holding `.hq-boot-*` (and before `@keyframes hq-boot-line`), add an unlayered block (unlayered rules win over the Tailwind utilities on the same elements):

```css
/* Portrait phones (owner decision 2026-10-25): the boot card docks at the bottom in thumb reach, Rover's wake close-up
   shows above it, and the log is one rolling line. The owner block (the game-first LCP) keeps its markup and rules. */
@media (max-width: 639px) and (orientation: portrait) {
  html[data-hq-boot] .hq-boot-cover,
  .hq-boot-backdrop {
    place-items: end stretch;
    padding: 0;
  }
  .hq-boot-backdrop {
    background: linear-gradient(transparent 30%, rgb(5 5 12 / 0.85) 62%);
  }
  .hq-boot-card {
    display: grid;
    grid-template-columns: 36px 1fr;
    column-gap: 12px;
    width: 100%;
    padding: 18px 20px max(16px, env(safe-area-inset-bottom));
    border-width: 1px 0 0;
    border-radius: 20px 20px 0 0;
  }
  .hq-boot-card > * {
    grid-column: 1 / -1;
  }
  .hq-boot-card > .eyebrow,
  .hq-boot-title {
    grid-column: 2;
    margin: 0;
  }
  .hq-boot-mark {
    grid-row: 1 / 3;
    width: 36px;
    margin: 0;
    align-self: center;
  }
  .hq-boot-title {
    font-size: 1.25rem;
    line-height: 1.5rem;
  }
  .hq-boot-log {
    display: grid;
    min-height: 0;
    margin-top: 12px;
  }
  .hq-boot-log li {
    grid-area: 1 / 1;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .hq-boot-log li:not([data-last]) {
    opacity: 0;
  }
  .hq-boot-log li.hq-boot-line-in {
    animation-name: hq-boot-roll;
    animation-fill-mode: none;
  }
  .hq-boot-log li.hq-boot-line-in:last-child {
    animation-name: hq-boot-line;
    animation-fill-mode: forwards;
  }
  .hq-boot-actions {
    flex-wrap: nowrap;
    margin-top: 14px;
  }
  .hq-boot-actions > button {
    flex: 1;
    justify-content: center;
  }
}
@keyframes hq-boot-roll {
  20%,
  80% {
    opacity: 1;
  }
}
```

Notes for the implementer:
  - The cover's lines keep their stagger delays (`120 + i * 220` ms) and the 0.25 s duration from `.hq-boot-line-in`: each line fades in and out inside its slot; the last line stays (`hq-boot-line`, forwards). Under reduced motion the existing rule turns the animation off, and `:not([data-last])` keeps only the last line visible.
  - The overlay (`BootOverlay`) types lines at `LINE_MS` 180 ms through `shown`; `data-last` moves with it. When the cover played first, the overlay starts with every line shown, so the last line is the one visible: no jump at the handoff.
  - Measure the gzip cost: `bun run build && gzip -9c <built css> | wc -c` before and after; the block must add under 300 B. Drop `text-overflow` or merge selectors if it does not.

- [ ] **Step 5: Wake framing (intro chunk) in `src/experience/camera/intro.ts`.** Add `boot?: number` to the `WAKE` record type with a doc comment ("look height held through the boot on portrait screens, so Rover sits above the bottom boot card; the push-in eases it to `look`"), set `mobile: { distance: 3.75, fov: 52, height: 2.4, look: 1.75, boot: 0.2 }`, and in `rawPose` change the `lookY` line to:

```ts
  const push = smooth(span(t, 0, INTRO.wake));
  const lookY = wake.look + ((wake.boot ?? wake.look) - wake.look) * (1 - push) + (acrossY - wake.look) * pull + (plan.endLookY - acrossY) * look;
```

(reuse the `smooth`/`span` helpers that `pathRadius` uses). Tune `boot` on a capture: Rover's head in the top 40% of a 390 x 844 frame with the bottom card up (capture script from Task 4 Step 5, without `asReturningVisitor` but with `asHumanBrowser`, screenshot about 2 s after load).

- [ ] **Step 6: Run** `bunx vitest run tests/unit tests/hud` and `bun run verify:quick`. Expected: PASS.

- [ ] **Step 7: Capture** 390 x 844 and 375 x 667 (boot card up) and check: the card's top edge is at or below 45% of the height on 390 x 844, Boot rover is in the bottom 40%, the card is at most 66% of 375 x 667, Rover is visible above the card, the owner block reads whole.

- [ ] **Step 8: Commit** `feat(boot): a bottom boot card with one rolling log line on portrait phones`.

---

### Task 6: Phone e2e

**Files:**
- Create: `e2e/phone-first.spec.ts`
- Modify: `scripts/e2e-plan.ts` (map the changed paths to the new spec: `src/components/BootCard.tsx`, `src/hud/dialog/**`, `src/hud/Joystick.tsx`, `src/experience/floors/lobby/observatoryLayout.ts`, `src/experience/camera/orbit.ts`, `src/app/globals.css`), `tests/unit/e2e-plan.test.ts` if it pins the mapping
- Test: the spec itself

**Interfaces:**
- Consumes: `data-docked`, `data-aside`, `data-last`, `data-line` keys, `__hq` orbit state (find the probe exposing the orbit/camera: `grep -rn "orbit" src/experience/fx/probes.ts src/experience/Experience.tsx`).

- [ ] **Step 1: Write the spec** (read `e2e/boot-first.spec.ts`, `e2e/missions.spec.ts` and `e2e/hq.ts` first; wait on state, never on time):

```ts
import { devices, expect, test } from "@playwright/test";
import { asHumanBrowser, asReturningVisitor, waitForPhase, waitForSceneLive } from "./hq";

const PHONE = { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } };

test.describe("phone-first 3D", () => {
  test.use(PHONE);

  test("the boot card docks at the bottom with one rolling log line", async ({ page }) => {
    await asHumanBrowser(page);
    await page.goto("/en?tier=lite");
    const card = page.getByTestId("boot").locator(".hq-boot-card");
    await expect(card).toBeVisible();
    const box = (await card.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(844 * 0.45);
    const start = page.getByTestId("boot").getByRole("button");
    const startBox = (await start.boundingBox())!;
    expect(startBox.y).toBeGreaterThanOrEqual(844 * 0.6);
    await expect(start).not.toHaveAttribute("aria-disabled", "true");
    const visible = await page.$$eval("[data-testid='boot'] .hq-boot-log li", (lis) => lis.filter((li) => getComputedStyle(li).opacity !== "0").length);
    expect(visible).toBe(1);
  });

  test("a returning visitor lands on the phone landing view", async ({ page }) => {
    await asReturningVisitor(page);
    await page.goto("/en?tier=lite");
    await waitForPhase(page, "explore");
    await waitForSceneLive(page);
    // Read the orbit through the camera probe (exact field names from the probe): primed into L1:kiosk with the phone pitch.
    const orbit = await page.evaluate(() => (window as any).__hq.camera?.orbit ?? (window as any).__hq.probes?.camera);
    expect(orbit.zone).toBe("L1:kiosk");
    expect(orbit.pitch).toBeGreaterThan(0);
  });

  test("the welcome line docks and the bottom band steps aside; the phone tour runs its steps", async ({ page }) => {
    // A visitor who saw the intro but not the tour: the tour runs on explore.
    await page.addInitScript(() => sessionStorage.setItem("hq:intro", "seen"));
    await page.goto("/en?tier=lite");
    await waitForPhase(page, "explore");
    const box = page.getByTestId("dialog-box");
    await expect(box).toHaveAttribute("data-line", "welcome");
    await expect(box).toHaveAttribute("data-docked", "true");
    await expect(page.getByTestId("hud-bottom")).toHaveAttribute("data-aside", "true");
    await box.getByRole("button", { name: "Show me around" }).click();
    await expect(box).toHaveAttribute("data-line", "point-go");
    await expect(page.getByTestId("hud-bottom")).not.toHaveAttribute("data-aside", "true");
  });
});

test.describe("tablet keeps today's boot card and tour", () => {
  test.use({ ...devices["iPad Pro 11"], viewport: { width: 834, height: 1194 } });

  test("centered card, the desktop-style tour starts with the move line", async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem("hq:intro", "seen"));
    await page.goto("/en?tier=lite");
    await waitForPhase(page, "explore");
    const box = page.getByTestId("dialog-box");
    await expect(box).toHaveAttribute("data-line", "welcome");
    await expect(box).not.toHaveAttribute("data-docked", "true");
    await box.getByRole("button", { name: "Show me around" }).click();
    await expect(box).toHaveAttribute("data-line", "move");
  });
});
```

Replace the orbit probe read with the real probe path (find it; if no probe exposes `zone`/`pitch`, add the two fields to the existing camera probe in the 3D code, a few bytes, or assert through `roverRuntime.cameraView` which already holds the applied zone id). Confirm the device names exist in Playwright's registry. Confirm `?tier=lite` plus `asHumanBrowser` shows the boot (see `boot-first.spec.ts`); if the cover's `.hq-boot-card` and the overlay's both match, scope to the overlay (`data-testid="boot"`).

- [ ] **Step 2: Run** `bun run build` then `bunx playwright test e2e/phone-first.spec.ts` (with the repo's web server config; see `playwright.config.ts`). Fix until green. Also run `bunx playwright test e2e/boot-first.spec.ts e2e/missions.spec.ts e2e/hud-corners.spec.ts e2e/boost.spec.ts`.

- [ ] **Step 3: Map it** in `scripts/e2e-plan.ts` and run `bunx vitest run tests/unit/e2e-plan.test.ts`.

- [ ] **Step 4: Commit** `test(e2e): phone-first boot card, landing view and phone tour`.

---

### Task 7: Docs, budgets, verification, captures, PR

**Files:**
- Create: `docs/decisions/2026-10-26-phone-first-3d.md`
- Modify: `docs/agents/3d-experience.md` (Boot card, Boot and intro wake, the orbit `primeView`), `docs/agents/hud-and-drawer.md` (Onboarding: phone tour and tour chunk; Dialog box: docked card; Corners layout: step-aside), `docs/agents/performance.md` (the tour chunk next to the intro chunk, line ~100), `docs/agents/floor-l1-lobby.md` (the spawn view), `docs/features.md`, `e2e/budgets.ts` (final `tour` number), this plan's `Status:` line, the spec's `Status:` line

- [ ] **Step 1: Docs (current state only, no history).** In `performance.md`, after the intro chunk bullet: "The first-session tour chunk (`hud/dialog/onboarding.ts`, loaded by `tourChunk.ts` only in a session that plays the tour or on Replay tutorial; [Onboarding](hud-and-drawer.md#onboarding)) is in neither total either: measured last through `__hq.tour.load()` and held to `BYTES_3D_BUDGET.tour` (measured + 614 B, [decision](../decisions/2026-10-26-phone-first-3d.md))." Add the boot card, landing view and phone tour to `docs/features.md` (L1 / HUD section bullets).

- [ ] **Step 2: Verify.** `bun run verify:quick`, then `bun run e2e:changed`. Fix failures.

- [ ] **Step 3: Perf lane.** `E2E_PORT=<free port> bun run e2e:perf`. Read the logged bytes: first frame (full, lite), session totals (full, lite), the tour chunk. Compare with main 6397c628 (first frame full 477,249 B; session measured full 543,944 B, lite 527,810 B). Set `tour` in `e2e/budgets.ts` to measured + 614. If the first frame or a session total is above main, cut from Task 3 or Task 4 code until it is not (never raise a cap).

- [ ] **Step 4: Strict visual gate.** `bun scripts/visual-gate.ts --base HEAD~N --profile strict` against main (`--base origin/main` if supported; read the script's usage). Phone poses at the L1 spawn differ by design; every other pose must hold. Record the result for the PR.

- [ ] **Step 5: Captures.** Before (main build or the live site) and after (this branch's build) at 390 x 844: the boot card, the landing frame after the intro, the docked welcome line. Save to the session folder (never commit images); attach them to the PR with `gh` image upload or describe them.

- [ ] **Step 6: Decision file** `docs/decisions/2026-10-26-phone-first-3d.md`:

```markdown
# 3D experience

- Date: 2026-10-26

Phone-first 3D (sub-project D, spec `docs/superpowers/specs/2026-10-25-phone-first-3d-design.md`): on a portrait phone the boot card docks at the bottom with one rolling log line, L1 opens on a phone landing view at every session start (primed only), and a 6-step phone tour docks its choice lines at the bottom while the joystick, Boost and Reset view step aside. Budgets (parent session under the owner's delegation, 2026-10-25): the tour script moves into its own chunk, loaded only by a session that plays the tour, outside both session totals like the intro chunk, with a new cap `BYTES_3D_BUDGET.tour` at measured + 614 B (measured <N> B, cap <N+614> B). Measured: first frame full <x> B and lite <y> B (main 477,249 B and <lite>), session totals full <a> B and lite <b> B (main 543,944 B and 527,810 B); no existing cap changed.
```

Fill the numbers from Step 3.

- [ ] **Step 7: Status lines.** Plan: `Status: in review`. Commit `docs: phone-first 3D docs, the tour chunk cap and the decision`.

- [ ] **Step 8: CI queue and PR.** `gh run list -R ShinyQ/ShinyQ-HQ -s in_progress` and `-s queued`: at most 2 runs in flight (one full). Push `feat/phone-first-3d`, open the PR ready for review with the summary, the byte table, the visual gate result and the captures; no em dashes. Report the link and the byte deltas to the parent session.

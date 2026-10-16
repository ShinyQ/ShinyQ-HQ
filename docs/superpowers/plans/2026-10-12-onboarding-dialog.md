# Rover Dialog, First-Session Onboarding, Hint Bubbles and Floor Lines Implementation Plan

Status: shipped in #64 (f1845ac), 2026-10-12. Later removed in #167: the walk choice at the end of the floor lines (the lines stay)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give first-time visitors simple guidance in the 3D HQ through a classic handheld-RPG text box spoken by the Rover (typewriter text, portrait, continue arrow, choices), a short first-session onboarding after the boot and intro, "!" hint bubbles over nearby interactive objects, and one first-visit line per floor that ends with that floor's walk choice.

**Architecture:** A framework-free dialog engine (`src/hud/dialog/engine.ts`: queue, `say()` promise, typewriter clock, choices, try-it waits, pause) is mirrored into a small zustand slice (`useDialog`) and drawn by one lazily loaded HTML box over the canvas (`DialogLayer`). Scripts are plain async functions on top of `say()`: the onboarding (`onboarding.ts`, triggered by `OnboardingLayer` after the intro or after a deep link arrives), the floor lines (rewired `WalkLayer`, replacing `WalkPrompt`) and the hint lines (`HintLayer`). The 3D side adds one R3F component without geometry (`HintProbe`) that picks the nearest object from point-and-go's live target list (`interactRuntime.items`, the shared interactables registry) and moves the HTML "!" bubble over it every frame; a hint's Go choice emits point-and-go's own `interact` intent, so the bubble and a click on the object do exactly the same thing.

**Tech Stack:** Next.js 16 static export, React 19, TypeScript strict, React Three Fiber, zustand, next-intl, Tailwind CSS 4, Web Audio (`@/lib/audio`), Vitest (node and jsdom), Playwright on SwiftShader, Bun.

## Global Constraints

- Owner request (verbatim): "Also im thinking of proper on boarding so the user have simple guidance at first (some kind like hover have chat like old pokemon games)".
- No em dashes (U+2014) anywhere: code, comments, copy, docs, commits, PR text. A unit test scans the repo. Use commas, colons, parentheses or "to".
- Bilingual: every UI string lives in `messages/en.json` and `messages/id.json` with identical keys and placeholders (`tests/unit/ui-copy.test.ts`). Indonesian is natural and professional, technical terms stay in English. The Rover Terminal and its missions read **Ask Rover** (ID **Tanya Rover**); Ask AI reads **Tanya AI** in Indonesian.
- Content is data: never hardcode career facts in components or copy. The owner's name comes from `data.profile.name` (first word, `firstName`), never a literal.
- Dialog box: bottom of the screen, pixel-style double frame (`.hq-dialog`), JetBrains Mono (already preloaded, no new font files), Rover face portrait drawn with the existing `drawFace` / `faceFrame`, typewriter text (28 ms per character; reduced motion: instant), blinking continue arrow (SVG, never a glyph outside the font cut), A button / Enter / Space / click / tap to continue (first press completes the line, second advances), optional 2 to 3 choices with arrow keys.
- Keyboard "a" stays the strafe-left drive key: the "A" press is the on-screen round **A** button (plus Enter and Space), never the letter key.
- Accessibility: the box is a non-modal `role="dialog"` named "Rover" with a polite live region holding the full line; it takes focus only when it shows choices (first choice focused, no focus trap, Tab leaves, WASD keeps driving); Esc picks a choice marked `cancel`.
- One API: `say(lines | script, { id?, skip? })` returns `Promise<SayResult>`; requests queue; `useDialog(selector)` is the store slice.
- No collisions: the box sits above the HUD bottom band and everything point-and-go puts in its center column (`InteractStatus`: the "Go to {label}" chip and the one-time "Click a glowing object" hint, above the walk pill): 128 px on fine pointers, 160 px on touch tablets, 232 px and clear of the right elevator panel on phones. It pauses and hides while a room drawer, the hologram, the pad picker, the Ask panel or any `aria-modal` dialog (terminal, palette, CV, paper, cert) is open, and during boot and intro.
- Point-and-go (parallel plan, merged first) removed click-the-floor driving: the moving step teaches keys or joystick, Shift or the boost button, and point-and-go (desktop: point at a glowing object to see its name, click it; touch: tap once to select, then tap again or press the "Go to {label}" chip). It never says "click the floor".
- First-session onboarding: right after the unskippable boot and intro, once per browser (`localStorage["hq:onboarded"]` = `done` | `skipped`); replaces the Lobby first-visit Rover Terminal auto-open (the terminal stays on its button); "Skip tutorial" after the first line; replayable from Ask Rover ("replay the tutorial") and Cmd-K ("Replay the tutorial").
- Deep links: the intro still rides on to the linked floor or room; the onboarding then runs in its **short** form (welcome, moving with the try-it step, Ask Rover and Ask AI, closing) once the continuation has ended and the room drawer is closed; that floor's first-visit line follows after it.
- Hints: one "!" bubble at a time (nearest point-and-go target within 5 u of its approach point `at`), HTML projected from the scene (no draw calls), floating above point-and-go's hover label (`labelAnchor` plus a lift), hidden during walks, missions, autopilot, rides, beams, pickers, drawers, the Ask panel, while Rover speaks and while any point-and-go target is hovered or tap-selected (`store.hover`: its label and Go chip own that moment); Enter / tap / click opens a one-line dialog whose Go choice emits `{ type: "interact", item }` (point-and-go drives there and runs the action). Toggle: "hints: on/off" in Ask Rover and "Turn hints on or off" in Cmd-K (`localStorage["hq:hints"]`, missing means on).
- Floor lines: L2 Journey, L3 Work, L4 Writing, RF About, the first time the rover is free on that floor (per browser, the existing `localStorage["hq:walk-prompt"]`), ending with the walk choice; one prompt, not two. `?walk=off` turns floor lines off with the walks.
- Sound: a soft synthesized `blip` every 3 typed characters through `audio.play` (respects mute and the shared 20 per second rate limit); no audio files.
- Performance: the dialog chunk loads on the first line; `HintProbe` renders nothing; every floor stays under 150 draw calls and 30k triangles (`expectRenderBudget`). CSS additions stay under 1 KB.
- Pure modules (`engine.ts`, `onboarding.ts`, `storage.ts`, `tutorial.ts`, `floorIntro.ts`, `hintLines.ts`, `placement.ts`, `experience/hints/select.ts`, `experience/hints/runtime.ts`) never import React, three.js or the store at module scope (type imports are fine).
- Static export, no new routes, no new runtime dependencies.
- Before every push: `bun run verify:quick` then `bun run e2e:changed`. This work changes `e2e/hq.ts`, so run `bun run e2e:full` once before opening the PR.
- Conventional commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`), prefer the `rtk` git wrapper, one PR, never merge without the owner.

## Interfaces From Parallel Plans

Two round-4 plans land before this one. This plan uses only the names below, copied from their final contracts.

**Point-and-go** (`r4-i-point-and-go.md`, branch `feat/point-and-go`; prerequisite for every task). It removes click-the-floor driving (the `goto` intent, the floor click, the click marker) and adds:

- `src/experience/interact/registry.ts`:

  ```ts
  export type InteractKind = "door" | "elevator-pad" | "teleporter" | "station" | "kiosk" | "board";
  export type InteractAction =
    | { type: "open-room"; room: RoomId }
    | { type: "elevator-picker" }
    | { type: "teleport-picker"; year: number }
    | { type: "command"; command: string }; // "terminal" | "palette:pods" | "palette:rooms" | "palette:posts" | "cv"
  export interface Interactable { id: string; floor: FloorId; kind: InteractKind; label: string; at: Vec2; bounds: Rect; height?: number; action: InteractAction }
  export interface InteractData { experience: ExperienceData; labels: InteractLabels }
  export function interactablesFor(floor: FloorId, layouts: FloorLayouts, data: InteractData): Interactable[];
  export function baseInteractables(floor: FloorId, layouts: FloorLayouts, data: InteractData): Interactable[];
  export function registerExtraInteractables(floor: FloorId, items: readonly Interactable[]): () => void;
  export function extraInteractables(floor: FloorId): readonly Interactable[];
  export function onInteractablesChange(listener: () => void): () => void;
  ```

  `label` is one string already resolved for the tower's locale (never `{ en, id }`). Ids: `<floor>:pad:elevator`, `L2:teleporter:<year>`, `<floor>:door:<slug>` (L2, L3, L4 rooms, for example `L3:door:voice-ai-contact-center`, `L2:door:workshop`, `L4:door:research`), `RF:station:contact`, `RF:station:cv`, `L1:station:profile`, `L1:station:skills`, `L1:kiosk:ask-rover`, `L3:board:<wing>`, `L4:board:archive`.
- `src/experience/interact/useInteractables.ts`: `useInteractables(floor, layouts, data)`.
- `src/experience/interact/runtime.ts`: `interactRuntime.items` (the current floor's full list, base plus extras, written by `InteractLayer`), `interactRuntime.floorY`, `interactRuntime.project`, `interactRuntime.screenOf(id, lift)`; exposed as `window.__hq.interact`.
- `src/experience/interact/pick.ts`: `labelAnchor(item): [x, y, z]` (floor-local point of the hover label), `parseCommand(command)`, `HoverState { item; via: "pointer" | "tap" }`.
- Intent `{ type: "interact"; item: Interactable }`: the Director drives to the target (a cancellable mission leg) and runs its action (`performInteract`: rooms through `goToRoom`, the floor or year picker, Ask Rover, a palette, the CV).
- Store: `hover: HoverState | null` (hovered or tap-selected target), `setHover`, `pointHint`.
- HUD: `src/hud/InteractStatus.tsx` in the bottom band's center column (`interact-live` live region, the `interact-go` chip "Go to {label}" after a first tap, the one-time `point-hint`); `Hud.tsx` renders `<InteractStatus coarse={coarse} />` right above the `HintBar` line.
- E2E helpers in `e2e/hq.ts`: `visibleTarget(page, { kinds, safe?, minDistance? })`, `targetPoint(page, id)`, `hoveredTarget(page)`, `PHONE_SAFE`, `DESKTOP_SAFE`.

This plan reads targets only through `src/experience/hints/source.ts` (`interactRuntime.items` for the current floor, `extraInteractables` for the L1 hall), so it never builds `InteractData` itself.

**Highlights Hall** (`r4-g-highlights-hall.md`, optional at merge time). It registers its four L1 stations with `registerExtraInteractables("L1", ...)`, ids `L1:station:highlights-about`, `L1:station:highlights-projects`, `L1:station:highlights-experience`, `L1:station:highlights-contact`, each `{ kind: "station", action: { type: "open-room", room: "L1:highlights-<station>" } }`. It also adds `"L1"` to `WALK_FLOORS` with `NO_WALK_PROMPT = ["L1"]` (the Quick tour walk, introduced by this onboarding instead of a floor prompt) and edits `WalkLayer`. The onboarding finds the hall by the id `L1:station:highlights-about` or, as a fallback, by its room `L1:highlights-about`; without the hall the step is skipped. Floor lines never run on L1 (`FLOOR_LINES`), so the hall's L1 walk never gets one.

Start: `git checkout main && git pull`, then check `git grep -n "export function interactablesFor" src/experience/interact/registry.ts` prints a line (point-and-go is merged); if not, stop and wait for it. Then `git checkout -b feat/onboarding-dialog`. If the hall PR merges while this branch is open, `git rebase main` and keep both sides of `WalkLayer` (Task 9 says how).

---

## File Structure

Create:

- `src/hud/dialog/engine.ts`: dialog engine (queue, `say`, typewriter `tick`, choices, try-it `until` with fallback, skip, cancel, pause, instant). Pure.
- `src/hud/dialog/store.ts`: the singleton engine, the `dialogStore` slice, `say`, `cancelDialog`, `cancelAllDialogs`, `useDialog`.
- `src/hud/dialog/storage.ts`: `hq:onboarded` and `hq:hints` flags with an in-memory fallback and change listeners. Pure.
- `src/hud/dialog/tutorial.ts`: replay registry (`registerTutorial`, `replayTutorial`, `tutorialAvailable`, `subscribeTutorial`). Pure.
- `src/hud/dialog/hooks.ts`: `useOnboardingSettled`, `useHintsOn`, `useTutorialAvailable`.
- `src/hud/dialog/placement.ts`: `dialogPlacement`, `DIALOG_PLACE`. Pure.
- `src/hud/dialog/RoverPortrait.tsx`: 2D canvas portrait from the rover face texture code.
- `src/hud/dialog/DialogBox.tsx`: the text box (typewriter clock, blips, keys, choices, skip, A button).
- `src/hud/dialog/Spotlight.tsx`: pulse ring around a `data-onboard` HUD control.
- `src/hud/dialog/useModalOpen.ts`: true while any `aria-modal` dialog is in the document.
- `src/hud/dialog/DialogLayer.tsx`: lazy default export; pause rules, reduced motion, box and spotlight.
- `src/hud/dialog/onboarding.ts`: `runOnboarding`, `waitForRoverMove`, `highlightsTarget`, `firstName`, constants. Pure.
- `src/hud/dialog/OnboardingLayer.tsx`: auto start after the intro or a deep link arrival, replay host.
- `src/hud/dialog/floorIntro.ts`: `floorIntroLine`. Pure.
- `src/hud/dialog/hintLines.ts`: `HINT_KINDS`, `HINT_OBJECTS`, `hintObjectKey`, `hintGoKey`, `hintLine`. Pure.
- `src/hud/dialog/HintLayer.tsx`: the "!" bubble, its Enter shortcut and its Go choice (the `interact` intent).
- `src/experience/hints/source.ts`: `hintItems()` (current floor, `interactRuntime.items`) and `extraItems(floor)` (registered extras); the only import of the point-and-go registry and runtime; re-exports `Interactable`.
- `src/experience/hints/select.ts`: `HINT`, `nearestHint`, `hintAnchor`. Pure.
- `src/experience/hints/runtime.ts`: `hintRuntime`, `setHintTarget`, `subscribeHintTarget`, `registerHintElement`.
- `src/experience/hints/HintProbe.tsx`: picks the target and positions the bubble every frame (renders nothing).
- Tests: `tests/unit/dialog-engine.test.ts`, `tests/unit/dialog-storage.test.ts`, `tests/unit/dialog-copy.test.ts`, `tests/unit/onboarding.test.ts`, `tests/unit/floor-intro.test.ts`, `tests/unit/hint-select.test.ts`, `tests/unit/hint-lines.test.ts`, `tests/hud/DialogBox.test.tsx`, `tests/hud/OnboardingLayer.test.tsx`, `tests/hud/HintLayer.test.tsx`, `e2e/onboarding.spec.ts`.
- `docs/superpowers/plans/2026-10-12-onboarding-dialog.md`: this plan, committed (AGENTS.md: write a plan before a phase).

Modify:

- `src/lib/audio/types.ts`, `src/lib/audio/synth.ts`, `src/lib/audio/engine.ts`: `blip` one-shot, rate limited with clicks.
- `src/experience/introContinue.ts`: `onContinuationChange` listener.
- `src/app/globals.css`: `.hq-dialog` frame.
- `messages/en.json`, `messages/id.json`: new `dialog` namespace; `hud.actions.replayTutorial`, `hud.actions.toggleHints`.
- `src/hud/Hud.tsx`: `OnboardingLayer`, lazy `DialogLayer`, `HintLayer`, hint bar hidden while Rover speaks (point-and-go's `InteractStatus` line stays above it).
- `src/hud/ElevatorPanel.tsx`, `src/hud/HudLaunchers.tsx`, `src/hud/ask/AskPill.tsx`: `data-onboard` attributes.
- `src/experience/scene/Scene.tsx`: mounts `HintProbe`.
- `src/experience/scene/Director.tsx`: removes the first-visit terminal auto-open.
- `src/hud/RoverTerminal.tsx`: `extras` options; removes `shouldAutoOpenTerminal`.
- `src/hud/MissionHud.tsx`, `src/hud/palette-types.ts`, `src/hud/search.ts`, `src/hud/index-data.ts`: replay and hints in Ask Rover and Cmd-K.
- `src/hud/walk/WalkLayer.tsx`: floor line through the dialog instead of `WalkPrompt` (which stays for the dev prototypes).
- `scripts/e2e-plan.ts`, `tests/unit/e2e-plan.test.ts`: `onboarding` spec and rules.
- `e2e/hq.ts` (`asReturningVisitor`), `e2e/experience.spec.ts`, `e2e/walk.spec.ts`, `e2e/hud.spec.ts`, `e2e/library-roof.spec.ts`, `e2e/missions.spec.ts`, `e2e/ask.spec.ts`, `e2e/gallery.spec.ts`, `e2e/pageview.spec.ts`, `e2e/pageview-visual.spec.ts`, `e2e/screenshots.spec.ts`.
- `tests/unit/audio.test.ts`, `tests/unit/intro-session.test.ts`, `tests/hud/RoverTerminal.test.tsx`, `tests/hud/CommandPalette.test.tsx`, `tests/hud/MissionHud.test.tsx`.
- `README.md`, `AGENTS.md`.

Task order: 1 engine, 2 flags and replay bridge, 3 blip, 4 dialog box, 5 hint source and probe, 6 onboarding script, 7 onboarding wiring, 8 Ask Rover and Cmd-K, 9 floor lines, 10 hint bubble, 11 remaining e2e, 12 screenshots, 13 docs and PR.

---
### Task 1: Dialog engine and the `useDialog` slice

**Files:**
- Create: `src/hud/dialog/engine.ts`
- Create: `src/hud/dialog/store.ts`
- Test: `tests/unit/dialog-engine.test.ts`

**Interfaces:**
- Consumes: `RoverFace` from `src/experience/types.ts` (type only).
- Produces (engine): `CHAR_MS = 28`, `BLIP_EVERY = 3`, `CONTINUE_CHOICE = "continue"`, `interface DialogChoice { id: string; label: string; cancel?: boolean }`, `interface DialogLine { text: string; key?: string; face?: RoverFace; choices?: readonly DialogChoice[]; spotlight?: string; until?: (signal: AbortSignal) => Promise<unknown>; fallbackMs?: number }`, `type SayInput = string | DialogLine | readonly (string | DialogLine)[]`, `interface SayOptions { id?: string; skip?: { label: string } }`, `interface SayResult { status: "done" | "skipped" | "cancelled"; choice: string | null }`, `interface DialogView { id; line; index; total; shown; length; waiting; fallback; paused; active; skipLabel }`, `IDLE_VIEW`, `linesOf(input): DialogLine[]`, `createDialogEngine(): DialogEngine` with `view`, `say`, `advance`, `choose(id)`, `move(1 | -1)`, `escape(): boolean`, `skip`, `cancel(id)`, `cancelAll`, `setPaused`, `setInstant`, `tick(ms): number`, `busy`, `subscribe`.
- Produces (store): `dialog` (the singleton engine), `dialogStore`, `say(input, options?)`, `cancelDialog(id)`, `cancelAllDialogs()`, `useDialog<T>(selector: (view: DialogView) => T): T`.

- [x] **Step 1: Write the failing test**

Create `tests/unit/dialog-engine.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { CHAR_MS, CONTINUE_CHOICE, createDialogEngine, linesOf } from "@/hud/dialog/engine";

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const choices = [
  { id: "yes", label: "Yes" },
  { id: "no", label: "No", cancel: true },
];

describe("linesOf", () => {
  it("accepts a string, a line or a list of both", () => {
    expect(linesOf("Hi")).toEqual([{ text: "Hi" }]);
    expect(linesOf({ text: "Hi", key: "a" })).toEqual([{ text: "Hi", key: "a" }]);
    expect(linesOf(["One", { text: "Two" }])).toEqual([{ text: "One" }, { text: "Two" }]);
  });
});

describe("dialog engine", () => {
  it("types one character per CHAR_MS and reports what it revealed", () => {
    const d = createDialogEngine();
    void d.say("Hello");
    expect(d.view.shown).toBe(0);
    expect(d.tick(CHAR_MS * 2)).toBe(2);
    expect(d.view.shown).toBe(2);
    expect(d.tick(CHAR_MS / 2)).toBe(0);
    expect(d.tick(CHAR_MS * 10)).toBe(3);
    expect(d.view.shown).toBe(5);
  });

  it("completes the line on the first press and advances on the second", async () => {
    const d = createDialogEngine();
    const done = vi.fn();
    void d.say(["First line", "Second"]).then(done);
    d.advance();
    expect(d.view.shown).toBe("First line".length);
    expect(d.view.index).toBe(0);
    d.advance();
    expect(d.view.index).toBe(1);
    d.advance();
    d.advance();
    await flush();
    expect(done).toHaveBeenCalledWith({ status: "done", choice: null });
    expect(d.view.line).toBeNull();
  });

  it("shows whole lines at once in instant mode (reduced motion)", () => {
    const d = createDialogEngine();
    d.setInstant(true);
    void d.say("Hello there");
    expect(d.view.shown).toBe(d.view.length);
  });

  it("picks choices with arrows and a press, only once the line has typed out", async () => {
    const d = createDialogEngine();
    const result = d.say({ text: "Go?", choices });
    d.choose("yes");
    expect(d.view.line).not.toBeNull();
    d.advance();
    d.move(1);
    expect(d.view.active).toBe(1);
    d.move(1);
    expect(d.view.active).toBe(0);
    d.move(-1);
    expect(d.view.active).toBe(1);
    d.choose("maybe");
    expect(d.view.line).not.toBeNull();
    d.advance();
    await expect(result).resolves.toEqual({ status: "done", choice: "no" });
  });

  it("Esc picks the cancel choice, and does nothing without one", async () => {
    const d = createDialogEngine();
    expect(d.escape()).toBe(false);
    const result = d.say({ text: "Go?", choices });
    expect(d.escape()).toBe(false);
    d.advance();
    expect(d.escape()).toBe(true);
    await expect(result).resolves.toEqual({ status: "done", choice: "no" });
  });

  it("waits on a try-it line until the world says so, then moves on by itself", async () => {
    const d = createDialogEngine();
    let release = () => {};
    const until = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));
    const result = d.say([{ text: "Drive!", until }, "Nice!"]);
    expect(until).toHaveBeenCalledTimes(1);
    d.advance();
    expect(d.view.waiting).toBe(true);
    d.advance();
    expect(d.view.index).toBe(0);
    release();
    await flush();
    expect(d.view.index).toBe(1);
    d.advance();
    d.advance();
    await expect(result).resolves.toEqual({ status: "done", choice: null });
  });

  it("offers Continue on a try-it line after its fallback delay and aborts the wait", async () => {
    const d = createDialogEngine();
    const seen: { signal?: AbortSignal } = {};
    const until = (signal: AbortSignal) => {
      seen.signal = signal;
      return new Promise<void>(() => {});
    };
    const result = d.say([{ text: "Try", until, fallbackMs: 1000 }, "Next"]);
    d.advance();
    d.choose(CONTINUE_CHOICE);
    expect(d.view.index).toBe(0);
    d.tick(999);
    expect(d.view.fallback).toBe(false);
    d.tick(1);
    expect(d.view.fallback).toBe(true);
    d.choose(CONTINUE_CHOICE);
    expect(d.view.index).toBe(1);
    expect(seen.signal?.aborted).toBe(true);
    d.advance();
    d.advance();
    await expect(result).resolves.toMatchObject({ status: "done" });
  });

  it("queues requests and resolves them in order", async () => {
    const d = createDialogEngine();
    d.setInstant(true);
    const order: string[] = [];
    void d.say("A", { id: "a" }).then(() => order.push("a"));
    void d.say("B", { id: "b" }).then(() => order.push("b"));
    expect(d.view.id).toBe("a");
    expect(d.busy()).toBe(true);
    d.advance();
    await flush();
    expect(d.view.id).toBe("b");
    d.advance();
    await flush();
    expect(order).toEqual(["a", "b"]);
    expect(d.busy()).toBe(false);
  });

  it("cancels by id, queued or current, and everything at once", async () => {
    const d = createDialogEngine();
    const a = d.say("A", { id: "a" });
    const b = d.say("B", { id: "b" });
    const c = d.say("C", { id: "c" });
    d.cancel("b");
    await expect(b).resolves.toEqual({ status: "cancelled", choice: null });
    d.cancel("a");
    await expect(a).resolves.toEqual({ status: "cancelled", choice: null });
    expect(d.view.id).toBe("c");
    d.cancelAll();
    await expect(c).resolves.toMatchObject({ status: "cancelled" });
    expect(d.view.line).toBeNull();
  });

  it("skips only a request that offers it", async () => {
    const d = createDialogEngine();
    const plain = d.say("No skip", { id: "plain" });
    d.skip();
    expect(d.view.id).toBe("plain");
    d.cancel("plain");
    await plain;
    const tour = d.say(["One", "Two"], { id: "tour", skip: { label: "Skip tutorial" } });
    expect(d.view.skipLabel).toBe("Skip tutorial");
    d.skip();
    await expect(tour).resolves.toEqual({ status: "skipped", choice: null });
  });

  it("holds still while paused: no typing, no presses", () => {
    const d = createDialogEngine();
    void d.say("Paused line");
    d.setPaused(true);
    expect(d.view.paused).toBe(true);
    expect(d.tick(CHAR_MS * 5)).toBe(0);
    d.advance();
    expect(d.view.shown).toBe(0);
    d.setPaused(false);
    expect(d.tick(CHAR_MS * 2)).toBe(2);
  });

  it("notifies subscribers with every new view", () => {
    const d = createDialogEngine();
    const seen: (string | null)[] = [];
    const off = d.subscribe((view) => seen.push(view.line?.text ?? null));
    void d.say("Hi");
    d.advance();
    d.advance();
    off();
    expect(seen).toEqual(["Hi", "Hi", null]);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/unit/dialog-engine.test.ts`
Expected: FAIL with "Failed to resolve import "@/hud/dialog/engine"".

- [x] **Step 3: Write minimal implementation**

Create `src/hud/dialog/engine.ts`:

```ts
import type { RoverFace } from "@/experience/types";

/**
 * Rover's dialog engine: a queue of requests, each a list of lines shown one at a time in the text
 * box (src/hud/dialog/DialogBox.tsx). Framework-free and clock-free: the box drives `tick(ms)` while
 * it is visible, so tests advance time by hand. Reduced motion turns on `instant` (whole lines).
 */

/** Typewriter pace: one character every 28 ms (about 36 a second). */
export const CHAR_MS = 28;
/** One soft blip per this many typed characters. */
export const BLIP_EVERY = 3;
/** Choice id of the Continue button a try-it line offers after its fallback delay. */
export const CONTINUE_CHOICE = "continue";

export interface DialogChoice {
  id: string;
  label: string;
  /** Picked by Esc (for example "Not now", "Explore freely", "Skip tutorial"). */
  cancel?: boolean;
}

export interface DialogLine {
  text: string;
  /** Stable name of the line for tests (`data-line`). */
  key?: string;
  /** Rover's portrait emote. Default `idle`. */
  face?: RoverFace;
  choices?: readonly DialogChoice[];
  /** `data-onboard` name of a HUD control to ring while the line shows. */
  spotlight?: string;
  /** Try-it line: it moves on by itself once this resolves (aborted when the line ends). */
  until?: (signal: AbortSignal) => Promise<unknown>;
  /** With `until`: after this long (counted while visible), a Continue choice appears. */
  fallbackMs?: number;
}

export type SayInput = string | DialogLine | readonly (string | DialogLine)[];

export interface SayOptions {
  /** Request id: `onboarding`, `floor:L2`, `hint:<object id>`. Cancel by id. */
  id?: string;
  /** Shows a small skip button on every line of this request; pressing it resolves "skipped". */
  skip?: { label: string };
}

export interface SayResult {
  status: "done" | "skipped" | "cancelled";
  /** The choice picked on the request's last choice line, if any. */
  choice: string | null;
}

export interface DialogView {
  id: string | null;
  line: DialogLine | null;
  index: number;
  total: number;
  /** Characters typed so far. */
  shown: number;
  length: number;
  /** A try-it line still waits for the world. */
  waiting: boolean;
  /** The try-it fallback (Continue) is offered. */
  fallback: boolean;
  paused: boolean;
  /** Highlighted choice. */
  active: number;
  skipLabel: string | null;
}

export const IDLE_VIEW: DialogView = {
  id: null,
  line: null,
  index: 0,
  total: 0,
  shown: 0,
  length: 0,
  waiting: false,
  fallback: false,
  paused: false,
  active: 0,
  skipLabel: null,
};

export interface DialogEngine {
  readonly view: DialogView;
  say(input: SayInput, options?: SayOptions): Promise<SayResult>;
  /** A, Enter, Space, a click or a tap: completes the typing line, else advances (or picks the highlighted choice). */
  advance(): void;
  choose(id: string): void;
  move(delta: 1 | -1): void;
  /** Esc: picks the line's cancel choice; false when there is none. */
  escape(): boolean;
  skip(): void;
  /** Cancels every request with this id (current and queued). */
  cancel(id: string): void;
  cancelAll(): void;
  setPaused(paused: boolean): void;
  setInstant(instant: boolean): void;
  /** Advances the typewriter and the fallback clock; returns how many characters it revealed. */
  tick(ms: number): number;
  busy(): boolean;
  subscribe(listener: (view: DialogView) => void): () => void;
}

interface Request {
  id: string;
  lines: DialogLine[];
  skipLabel: string | null;
  choice: string | null;
  resolve: (result: SayResult) => void;
}

const isLine = (value: unknown): value is DialogLine => typeof value === "object" && value !== null && "text" in value;

export function linesOf(input: SayInput): DialogLine[] {
  if (typeof input === "string") return [{ text: input }];
  const list: readonly (string | DialogLine)[] = isLine(input) ? [input] : (input as readonly (string | DialogLine)[]);
  return list.map((line) => (typeof line === "string" ? { text: line } : line));
}

export function createDialogEngine(): DialogEngine {
  const queue: Request[] = [];
  const listeners = new Set<(view: DialogView) => void>();
  let view: DialogView = IDLE_VIEW;
  let index = 0;
  let shown = 0;
  let carry = 0;
  let waited = 0;
  let active = 0;
  let satisfied = true;
  let fallback = false;
  let paused = false;
  let instant = false;
  let abort: AbortController | null = null;

  const request = () => queue[0] ?? null;
  const current = () => request()?.lines[index] ?? null;
  const typed = (line: DialogLine) => shown >= line.text.length;

  function publish() {
    const req = request();
    const line = current();
    view =
      req && line
        ? { id: req.id, line, index, total: req.lines.length, shown, length: line.text.length, waiting: !satisfied, fallback, paused, active, skipLabel: req.skipLabel }
        : { ...IDLE_VIEW, paused };
    for (const listener of listeners) listener(view);
  }

  function startLine() {
    abort?.abort();
    abort = null;
    const line = current();
    shown = line && instant ? line.text.length : 0;
    carry = 0;
    waited = 0;
    active = 0;
    fallback = false;
    satisfied = !line?.until;
    if (line?.until) {
      const controller = new AbortController();
      abort = controller;
      Promise.resolve(line.until(controller.signal)).then(
        () => {
          if (controller.signal.aborted) return;
          satisfied = true;
          if (typed(line)) next();
          else publish();
        },
        () => undefined,
      );
    }
    publish();
  }

  function finish(status: SayResult["status"]) {
    const req = queue.shift();
    abort?.abort();
    abort = null;
    index = 0;
    req?.resolve({ status, choice: req.choice });
    if (queue.length) startLine();
    else {
      shown = 0;
      publish();
    }
  }

  function next() {
    const req = request();
    if (!req) return;
    if (index + 1 < req.lines.length) {
      index += 1;
      startLine();
    } else finish("done");
  }

  const engine: DialogEngine = {
    get view() {
      return view;
    },
    say(input, options = {}) {
      const lines = linesOf(input);
      return new Promise<SayResult>((resolve) => {
        if (!lines.length) {
          resolve({ status: "done", choice: null });
          return;
        }
        queue.push({ id: options.id ?? "say", lines, skipLabel: options.skip?.label ?? null, choice: null, resolve });
        if (queue.length === 1) {
          index = 0;
          startLine();
        }
      });
    },
    advance() {
      const line = current();
      if (!line || paused) return;
      if (!typed(line)) {
        shown = line.text.length;
        if (line.until && satisfied) next();
        else publish();
        return;
      }
      if (line.choices?.length) {
        engine.choose(line.choices[active].id);
        return;
      }
      if (!satisfied) {
        if (fallback) next();
        return;
      }
      next();
    },
    choose(id) {
      const line = current();
      const req = request();
      if (!line || !req || paused || !typed(line)) return;
      if (id === CONTINUE_CHOICE && !satisfied && fallback) {
        next();
        return;
      }
      if (!line.choices?.some((choice) => choice.id === id)) return;
      req.choice = id;
      next();
    },
    move(delta) {
      const line = current();
      const count = line?.choices?.length ?? 0;
      if (!line || !count || paused || !typed(line)) return;
      active = (active + delta + count) % count;
      publish();
    },
    escape() {
      const line = current();
      const cancel = line?.choices?.find((choice) => choice.cancel);
      if (!line || !cancel || paused || !typed(line)) return false;
      engine.choose(cancel.id);
      return true;
    },
    skip() {
      if (request()?.skipLabel && !paused) finish("skipped");
    },
    cancel(id) {
      for (let i = queue.length - 1; i >= 1; i -= 1) {
        if (queue[i].id !== id) continue;
        const [req] = queue.splice(i, 1);
        req.resolve({ status: "cancelled", choice: req.choice });
      }
      if (request()?.id === id) finish("cancelled");
    },
    cancelAll() {
      const all = queue.splice(0);
      abort?.abort();
      abort = null;
      index = 0;
      shown = 0;
      for (const req of all) req.resolve({ status: "cancelled", choice: req.choice });
      publish();
    },
    setPaused(next) {
      if (paused === next) return;
      paused = next;
      publish();
    },
    setInstant(next) {
      instant = next;
      const line = current();
      if (next && line && !typed(line)) {
        shown = line.text.length;
        publish();
      }
    },
    tick(ms) {
      const line = current();
      if (!line || paused) return 0;
      let revealed = 0;
      let changed = false;
      if (!typed(line)) {
        carry += ms;
        const count = Math.floor(carry / CHAR_MS);
        if (count > 0) {
          carry -= count * CHAR_MS;
          const before = shown;
          shown = Math.min(line.text.length, shown + count);
          revealed = shown - before;
          changed = true;
        }
      }
      if (typed(line) && line.until && satisfied) {
        next();
        return revealed;
      }
      if (!satisfied && !fallback && line.fallbackMs !== undefined) {
        waited += ms;
        if (waited >= line.fallbackMs) {
          fallback = true;
          changed = true;
        }
      }
      if (changed) publish();
      return revealed;
    },
    busy: () => queue.length > 0,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return engine;
}
```

Create `src/hud/dialog/store.ts`:

```ts
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import { createDialogEngine, IDLE_VIEW, type DialogView, type SayInput, type SayOptions, type SayResult } from "./engine";

/** The dialog slice: the engine's current view, mirrored for React. */
export interface DialogSlice {
  view: DialogView;
}

export const dialogStore = createStore<DialogSlice>(() => ({ view: IDLE_VIEW }));

/** The one Rover dialog of the 3D HUD (onboarding, floor lines, hints). */
export const dialog = createDialogEngine();
dialog.subscribe((view) => dialogStore.setState({ view }));

export const say = (input: SayInput, options?: SayOptions): Promise<SayResult> => dialog.say(input, options);
export const cancelDialog = (id: string) => dialog.cancel(id);
export const cancelAllDialogs = () => dialog.cancelAll();

export function useDialog<T>(selector: (view: DialogView) => T): T {
  return useStore(dialogStore, (state) => selector(state.view));
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/unit/dialog-engine.test.ts`
Expected: PASS (12 tests).

- [x] **Step 5: Commit**

```bash
rtk git add src/hud/dialog/engine.ts src/hud/dialog/store.ts tests/unit/dialog-engine.test.ts
rtk git commit -m "feat(hud): Rover dialog engine with queue, typewriter, choices and try-it lines"
```

---

### Task 2: Onboarding and hint flags, the replay bridge and the continuation listener

**Files:**
- Create: `src/hud/dialog/storage.ts`
- Create: `src/hud/dialog/tutorial.ts`
- Create: `src/hud/dialog/hooks.ts`
- Modify: `src/experience/introContinue.ts`
- Test: `tests/unit/dialog-storage.test.ts`
- Test: `tests/unit/intro-session.test.ts` (append one test)

**Interfaces:**
- Consumes: nothing new.
- Produces: `ONBOARDED_KEY = "hq:onboarded"`, `HINTS_KEY = "hq:hints"`, `type OnboardingMark = "done" | "skipped"`, `interface FlagStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }`, `onboarded(storage?): boolean`, `markOnboarded(mark, storage?)`, `hintsOn(storage?): boolean`, `setHintsOn(on, storage?)`, `subscribeFlags(listener): () => void`, `resetFlagMemory()`; `registerTutorial(run: () => void): () => void`, `replayTutorial(): boolean`, `tutorialAvailable(): boolean`, `subscribeTutorial(listener): () => void`; hooks `useOnboardingSettled(): boolean`, `useHintsOn(): boolean`, `useTutorialAvailable(): boolean`; `onContinuationChange(listener: () => void): () => void` in `introContinue.ts`.

- [x] **Step 1: Write the failing tests**

Create `tests/unit/dialog-storage.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HINTS_KEY, ONBOARDED_KEY, hintsOn, markOnboarded, onboarded, resetFlagMemory, setHintsOn, subscribeFlags, type FlagStorage } from "@/hud/dialog/storage";
import { registerTutorial, replayTutorial, subscribeTutorial, tutorialAvailable } from "@/hud/dialog/tutorial";

function memory(): FlagStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

const broken: FlagStorage = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

beforeEach(() => resetFlagMemory());

describe("onboarding flag", () => {
  it("is unset on a fresh browser and remembers done or skipped", () => {
    const storage = memory();
    expect(onboarded(storage)).toBe(false);
    markOnboarded("skipped", storage);
    expect(storage.data.get(ONBOARDED_KEY)).toBe("skipped");
    expect(onboarded(storage)).toBe(true);
  });

  it("ignores unknown values", () => {
    const storage = memory();
    storage.data.set(ONBOARDED_KEY, "maybe");
    expect(onboarded(storage)).toBe(false);
  });

  it("keeps the mark for this page when storage is blocked", () => {
    expect(onboarded(broken)).toBe(false);
    markOnboarded("done", broken);
    expect(onboarded(broken)).toBe(true);
  });
});

describe("hints flag", () => {
  it("is on unless the visitor turned it off", () => {
    const storage = memory();
    expect(hintsOn(storage)).toBe(true);
    setHintsOn(false, storage);
    expect(storage.data.get(HINTS_KEY)).toBe("off");
    resetFlagMemory();
    expect(hintsOn(storage)).toBe(false);
    setHintsOn(true, storage);
    expect(hintsOn(storage)).toBe(true);
  });

  it("notifies subscribers on every change", () => {
    const storage = memory();
    const listener = vi.fn();
    const off = subscribeFlags(listener);
    setHintsOn(false, storage);
    markOnboarded("done", storage);
    off();
    setHintsOn(true, storage);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe("tutorial replay bridge", () => {
  it("runs the registered host and reports availability", () => {
    const listener = vi.fn();
    const offListener = subscribeTutorial(listener);
    expect(tutorialAvailable()).toBe(false);
    expect(replayTutorial()).toBe(false);
    const run = vi.fn();
    const off = registerTutorial(run);
    expect(tutorialAvailable()).toBe(true);
    expect(replayTutorial()).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
    off();
    expect(tutorialAvailable()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
    offListener();
  });

  it("ignores a stale unregister", () => {
    const first = registerTutorial(() => {});
    const second = registerTutorial(() => {});
    first();
    expect(tutorialAvailable()).toBe(true);
    second();
    expect(tutorialAvailable()).toBe(false);
  });
});
```

Append to `tests/unit/intro-session.test.ts` (add `onContinuationChange` and `vi` to the existing imports from `@/experience/introContinue` and `vitest`):

```ts
describe("continuation listener", () => {
  it("tells the onboarding when a deep link starts and stops continuing", () => {
    const listener = vi.fn();
    const off = onContinuationChange(listener);
    setIntroTarget({ floor: "L4" });
    expect(isContinuing()).toBe(true);
    takeIntroTarget();
    endContinuation();
    expect(isContinuing()).toBe(false);
    off();
    setIntroTarget(null);
    expect(listener).toHaveBeenCalledTimes(3);
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run tests/unit/dialog-storage.test.ts tests/unit/intro-session.test.ts`
Expected: FAIL with "Failed to resolve import "@/hud/dialog/storage"" and "onContinuationChange is not a function".

- [x] **Step 3: Write minimal implementation**

Create `src/hud/dialog/storage.ts`:

```ts
/**
 * Browser flags of the Rover dialog (localStorage): `hq:onboarded` (`done` or `skipped`, the
 * first-session tour ran) and `hq:hints` (`off` hides the "!" bubbles; missing means on). Blocked
 * storage keeps the value for this page, so a skipped tour does not come back on every frame.
 */
export const ONBOARDED_KEY = "hq:onboarded";
export const HINTS_KEY = "hq:hints";

export type OnboardingMark = "done" | "skipped";

export interface FlagStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

let memoryOnboarded: OnboardingMark | null = null;
let memoryHints: boolean | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

function local(): FlagStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function onboarded(storage: FlagStorage | null = local()): boolean {
  if (memoryOnboarded) return true;
  try {
    const value = storage?.getItem(ONBOARDED_KEY);
    return value === "done" || value === "skipped";
  } catch {
    return false;
  }
}

export function markOnboarded(mark: OnboardingMark, storage: FlagStorage | null = local()) {
  memoryOnboarded = mark;
  try {
    storage?.setItem(ONBOARDED_KEY, mark);
  } catch {
    // Remembered for this page only.
  }
  notify();
}

export function hintsOn(storage: FlagStorage | null = local()): boolean {
  if (memoryHints !== null) return memoryHints;
  try {
    return storage?.getItem(HINTS_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setHintsOn(on: boolean, storage: FlagStorage | null = local()) {
  memoryHints = on;
  try {
    storage?.setItem(HINTS_KEY, on ? "on" : "off");
  } catch {
    // Remembered for this page only.
  }
  notify();
}

export function subscribeFlags(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Tests: forget the in-memory copies. */
export function resetFlagMemory() {
  memoryOnboarded = null;
  memoryHints = null;
}
```

Create `src/hud/dialog/tutorial.ts`:

```ts
/**
 * Replay bridge between the always-mounted MissionHud (Ask Rover, Cmd-K) and the 3D HUD's
 * OnboardingLayer, which registers itself while the tower is open. Same pattern as
 * `registerWalkStarter` in experience/missions/bridge.ts.
 */
let host: (() => void) | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

export function registerTutorial(run: () => void): () => void {
  host = run;
  notify();
  return () => {
    if (host !== run) return;
    host = null;
    notify();
  };
}

export function tutorialAvailable(): boolean {
  return host !== null;
}

/** Starts the full tour again; false when the 3D HUD is not open. */
export function replayTutorial(): boolean {
  if (!host) return false;
  host();
  return true;
}

export function subscribeTutorial(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
```

Create `src/hud/dialog/hooks.ts`:

```ts
"use client";

import { useSyncExternalStore } from "react";
import { hintsOn, onboarded, subscribeFlags } from "./storage";
import { subscribeTutorial, tutorialAvailable } from "./tutorial";

/** The first-session tour is done or skipped (floor lines wait for it). */
export function useOnboardingSettled(): boolean {
  return useSyncExternalStore(subscribeFlags, () => onboarded(), () => false);
}

export function useHintsOn(): boolean {
  return useSyncExternalStore(subscribeFlags, () => hintsOn(), () => false);
}

/** The 3D HUD is open, so "Replay the tutorial" can run. */
export function useTutorialAvailable(): boolean {
  return useSyncExternalStore(subscribeTutorial, tutorialAvailable, () => false);
}
```

Modify `src/experience/introContinue.ts`. Below `let continuing = false;` add:

```ts
const continuationListeners = new Set<() => void>();
const notifyContinuation = () => continuationListeners.forEach((listener) => listener());

/** Notified whenever a deep link becomes pending, starts continuing or ends (the onboarding waits for it). */
export function onContinuationChange(listener: () => void): () => void {
  continuationListeners.add(listener);
  return () => {
    continuationListeners.delete(listener);
  };
}
```

and make the three mutators notify:

```ts
/** Remembers where to continue once the intro ends (null clears it). */
export function setIntroTarget(target: IntroTarget | null) {
  pending = target;
  notifyContinuation();
}

/** Hands the pending target over once; while its continuation runs, `isContinuing()` is true. */
export function takeIntroTarget(): IntroTarget | null {
  const target = pending;
  pending = null;
  if (target) {
    continuing = true;
    notifyContinuation();
  }
  return target;
}

export function endContinuation() {
  continuing = false;
  notifyContinuation();
}
```

Also update the `isContinuing` doc comment to: `/** A deep link is pending or being continued (the onboarding waits for it to arrive). */`.

- [x] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run tests/unit/dialog-storage.test.ts tests/unit/intro-session.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
rtk git add src/hud/dialog/storage.ts src/hud/dialog/tutorial.ts src/hud/dialog/hooks.ts src/experience/introContinue.ts tests/unit/dialog-storage.test.ts tests/unit/intro-session.test.ts
rtk git commit -m "feat(hud): onboarding and hint flags, tutorial replay bridge, continuation listener"
```

---

### Task 3: The `blip` sound

**Files:**
- Modify: `src/lib/audio/types.ts:1`
- Modify: `src/lib/audio/synth.ts` (new `scheduleBlip`, `ONE_SHOTS`)
- Modify: `src/lib/audio/engine.ts` (`play`)
- Test: `tests/unit/audio.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `SoundName` gains `"blip"`; `audio.play("blip")` (shares the click rate limit, 20 per second).

- [x] **Step 1: Write the failing test**

In `tests/unit/audio.test.ts`, change the one-shot list to include the blip:

```ts
  it.each(["beep", "ding", "whoosh", "click", "blip"] as const)("%s starts and stops its sources", (name) => {
```

and add after the "rate limits key clicks to 20 per second" test:

```ts
  it("rate limits dialog blips together with key clicks", () => {
    const { engine, ctx, clock } = setup();
    engine.setMuted(false);
    const before = ctx().oscillators.length;
    for (let i = 0; i < 21; i++) {
      clock.t = i * 40;
      engine.play("blip");
    }
    expect(ctx().oscillators.length - before).toBe(20);
  });
```

- [x] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/unit/audio.test.ts`
Expected: FAIL with "TypeError: ONE_SHOTS[name] is not a function" for `blip`, and the rate limit test counts 0 oscillators.

- [x] **Step 3: Write minimal implementation**

`src/lib/audio/types.ts` line 1:

```ts
export type SoundName = "beep" | "ding" | "whoosh" | "click" | "blip";
```

In `src/lib/audio/synth.ts`, add after `scheduleClick`:

```ts
/** Dialog text blip: a soft 30 ms square tick, like a handheld RPG text box (one per 3 typed characters). */
export function scheduleBlip(ctx: BaseAudioContext, destination: AudioNode, when: number): void {
  const end = when + 0.03;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(880, when);
  envelope(gain, when, 0.04, 0.002, end);
  osc.connect(gain).connect(destination);
  cleanupOnEnded(osc, [osc, gain]);
  osc.start(when);
  osc.stop(end + 0.005);
}
```

and extend the map:

```ts
export const ONE_SHOTS: Record<SoundName, OneShot> = {
  beep: scheduleBeep,
  ding: scheduleDing,
  whoosh: scheduleWhoosh,
  click: scheduleClick,
  blip: scheduleBlip,
};
```

In `src/lib/audio/engine.ts`, inside `play`, replace `if (name === "click" && !allowClick()) return;` with:

```ts
      if ((name === "click" || name === "blip") && !allowClick()) return;
```

- [x] **Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/unit/audio.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
rtk git add src/lib/audio/types.ts src/lib/audio/synth.ts src/lib/audio/engine.ts tests/unit/audio.test.ts
rtk git commit -m "feat(audio): soft blip one-shot for the Rover dialog"
```

---
### Task 4: The dialog box over the canvas (copy, frame, portrait, keys, placement, spotlight)

**Files:**
- Modify: `messages/en.json`, `messages/id.json` (new top-level `dialog` namespace, after `certs`)
- Modify: `src/app/globals.css` (append `.hq-dialog`)
- Create: `src/hud/dialog/placement.ts`
- Create: `src/hud/dialog/RoverPortrait.tsx`
- Create: `src/hud/dialog/DialogBox.tsx`
- Create: `src/hud/dialog/Spotlight.tsx`
- Create: `src/hud/dialog/useModalOpen.ts`
- Create: `src/hud/dialog/DialogLayer.tsx`
- Modify: `src/hud/Hud.tsx` (lazy `DialogLayer`, hint bar hidden while Rover speaks)
- Modify: `src/hud/ElevatorPanel.tsx:38`, `src/hud/HudLaunchers.tsx` (Ask Rover button), `src/hud/ask/AskPill.tsx` (`data-onboard`)
- Test: `tests/unit/dialog-copy.test.ts`
- Test: `tests/hud/DialogBox.test.tsx`

**Interfaces:**
- Consumes: `dialog`, `say`, `useDialog`, `cancelAllDialogs` (Task 1); `CONTINUE_CHOICE`, `BLIP_EVERY` (Task 1); `audio` from `@/lib/audio` (`blip`, Task 3); `drawFace`, `FACE_W`, `FACE_H` from `src/experience/rover/faceTexture.ts`; `faceFrame` from `src/experience/rover/faces.ts`; `useAskPanelOpen` from `src/hud/ask/availability.ts`.
- Produces: messages `dialog.*` (all keys used by later tasks: `dialog.onboarding.*`, `dialog.floor.{L2,L3,L4,RF}`, `dialog.hints.*`, `dialog.menu.*`); `type DialogPlacement = "bottom" | "raised" | "phone"`, `dialogPlacement(viewport: ViewportClass, coarse: boolean): DialogPlacement`, `DIALOG_PLACE`; `DialogBox({ placement, reducedMotion })` with test ids `dialog-box` (attributes `data-dialog`, `data-line`, `data-typing`, `data-motion`), `dialog-choices`, `dialog-next`, `dialog-try`, `dialog-skip`; `Spotlight({ target, still })` with test id `onboard-spotlight` (`data-target`, `data-motion`); default export `DialogLayer()`; HUD attributes `data-onboard="elevator" | "ask-rover" | "ask-ai"`.

- [x] **Step 1: Write the failing tests**

Create `tests/unit/dialog-copy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import id from "../../messages/id.json";
import { collectStrings } from "@/content/safety";
import { dialogPlacement, DIALOG_PLACE } from "@/hud/dialog/placement";

/** Three rows of the box on a 390 px phone (about 37 mono characters per row). */
const MAX_LINE = 110;

describe("Rover dialog copy", () => {
  it("keeps every spoken line short enough for three rows on a phone", () => {
    for (const messages of [en, id]) {
      const spoken = [messages.dialog.onboarding, messages.dialog.floor, messages.dialog.hints.kind, messages.dialog.hints.object];
      for (const group of spoken) {
        for (const { path, value } of collectStrings(group)) {
          expect(value.length, path).toBeLessThanOrEqual(MAX_LINE);
          expect(value, path).not.toContain("\n");
        }
      }
    }
  });

  it("has a line for every floor above the Lobby", () => {
    expect(Object.keys(en.dialog.floor).sort()).toEqual(["L2", "L3", "L4", "RF"]);
  });
});

describe("dialog placement", () => {
  it("sits above the bottom band and point-and-go's chip and hint: low on fine pointers, raised over the joystick on touch, clear of the elevator panel on phones", () => {
    expect(dialogPlacement("desktop", false)).toBe("bottom");
    expect(dialogPlacement("mobile", false)).toBe("bottom");
    expect(dialogPlacement("tablet", true)).toBe("raised");
    expect(dialogPlacement("mobile", true)).toBe("phone");
    expect(DIALOG_PLACE.bottom).toContain("bottom-[128px]");
    expect(DIALOG_PLACE.raised).toContain("bottom-[160px]");
    expect(DIALOG_PLACE.phone).toContain("right-[60px]");
  });
});
```

Create `tests/hud/DialogBox.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import type { SayResult } from "@/hud/dialog/engine";
import { DialogBox } from "@/hud/dialog/DialogBox";
import type { DialogPlacement } from "@/hud/dialog/placement";
import { cancelAllDialogs, dialog, say } from "@/hud/dialog/store";

function renderBox(placement: DialogPlacement = "bottom") {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <DialogBox placement={placement} reducedMotion />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  // jsdom has no 2D canvas; the portrait simply stays blank.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  dialog.setPaused(false);
  dialog.setInstant(true);
});

afterEach(() => {
  act(() => cancelAllDialogs());
  cleanup();
  vi.restoreAllMocks();
});

describe("DialogBox", () => {
  it("renders nothing while Rover is quiet", () => {
    renderBox();
    expect(screen.queryByTestId("dialog-box")).toBeNull();
  });

  it("shows Rover's name, the line and the A button, and a click on A advances", async () => {
    renderBox();
    let result: Promise<SayResult> = Promise.resolve({ status: "done", choice: null });
    act(() => {
      result = say({ text: "Hello there", key: "hello" }, { id: "test" });
    });
    const box = screen.getByRole("dialog", { name: en.dialog.name });
    expect(box).toHaveAttribute("data-dialog", "test");
    expect(box).toHaveAttribute("data-line", "hello");
    expect(box).toHaveAttribute("data-typing", "false");
    expect(box).toHaveTextContent("Hello there");
    act(() => fireEvent.click(screen.getByRole("button", { name: en.dialog.next })));
    await expect(result).resolves.toEqual({ status: "done", choice: null });
    expect(screen.queryByTestId("dialog-box")).toBeNull();
  });

  it("completes a typing line on the first Enter and advances on the second, without reaching the game", async () => {
    dialog.setInstant(false);
    renderBox();
    const game = vi.fn();
    window.addEventListener("keydown", game);
    let result: Promise<SayResult> = Promise.resolve({ status: "done", choice: null });
    act(() => {
      result = say("A longer line that types");
    });
    expect(screen.getByTestId("dialog-box")).toHaveAttribute("data-typing", "true");
    act(() => void fireEvent.keyDown(document.body, { key: "Enter" }));
    expect(screen.getByTestId("dialog-box")).toHaveAttribute("data-typing", "false");
    act(() => void fireEvent.keyDown(document.body, { key: "Enter" }));
    await expect(result).resolves.toMatchObject({ status: "done" });
    expect(game).not.toHaveBeenCalled();
    window.removeEventListener("keydown", game);
  });

  it("advances on a tap anywhere on the box", async () => {
    renderBox();
    let result: Promise<SayResult> = Promise.resolve({ status: "done", choice: null });
    act(() => {
      result = say("Tap me");
    });
    act(() => void fireEvent.click(screen.getByTestId("dialog-box")));
    await expect(result).resolves.toMatchObject({ status: "done" });
  });

  it("leaves Enter alone in text fields", () => {
    renderBox();
    act(() => void say("Hi"));
    const input = document.body.appendChild(document.createElement("input"));
    act(() => void fireEvent.keyDown(input, { key: "Enter" }));
    expect(screen.getByTestId("dialog-box")).toBeInTheDocument();
    input.remove();
  });

  it("focuses the first choice, moves with the arrows and resolves the clicked one", async () => {
    renderBox();
    let result: Promise<SayResult> = Promise.resolve({ status: "done", choice: null });
    act(() => {
      result = say({ text: "Pick one", choices: [{ id: "a", label: "Alpha" }, { id: "b", label: "Beta" }] });
    });
    const alpha = screen.getByRole("button", { name: "Alpha" });
    expect(alpha).toHaveFocus();
    act(() => void fireEvent.keyDown(alpha, { key: "ArrowDown" }));
    expect(screen.getByRole("button", { name: "Beta" })).toHaveFocus();
    expect(screen.queryByTestId("dialog-next")).toBeNull();
    act(() => void fireEvent.click(screen.getByRole("button", { name: "Beta" })));
    await expect(result).resolves.toEqual({ status: "done", choice: "b" });
  });

  it("shows the try-it hint, then Continue after the fallback, and the skip button", async () => {
    renderBox();
    let tour: Promise<SayResult> = Promise.resolve({ status: "done", choice: null });
    act(() => {
      tour = say([{ text: "Drive", until: () => new Promise(() => {}), fallbackMs: 100 }, "Next"], { id: "tour", skip: { label: "Skip tutorial" } });
    });
    expect(screen.getByTestId("dialog-try")).toHaveTextContent(en.dialog.tryIt);
    expect(screen.queryByRole("button", { name: en.dialog.continue })).toBeNull();
    act(() => void dialog.tick(100));
    act(() => void fireEvent.click(screen.getByRole("button", { name: en.dialog.continue })));
    expect(screen.getByTestId("dialog-box")).toHaveTextContent("Next");
    act(() => void fireEvent.click(screen.getByTestId("dialog-skip")));
    await expect(tour).resolves.toEqual({ status: "skipped", choice: null });
  });

  it("hides while paused", () => {
    renderBox();
    act(() => {
      void say("Hi");
      dialog.setPaused(true);
    });
    expect(screen.queryByTestId("dialog-box")).toBeNull();
  });

  it("clears the joystick, boost and elevator panel on phones", () => {
    renderBox("phone");
    act(() => void say("Hi"));
    expect(screen.getByTestId("dialog-box").className).toContain("right-[60px]");
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run tests/unit/dialog-copy.test.ts tests/hud/DialogBox.test.tsx`
Expected: FAIL with "Failed to resolve import "@/hud/dialog/placement"" and "Cannot read properties of undefined (reading 'onboarding')".

- [x] **Step 3: Write minimal implementation**

Add to `messages/en.json` as a new top-level key after `"certs"`:

```json
  "dialog": {
    "name": "Rover",
    "next": "Next",
    "continue": "Continue",
    "choices": "Choices",
    "tryIt": "Try it now",
    "onboarding": {
      "welcome": "Hi, I'm Rover! Welcome to {name}'s HQ. Want a quick tour of how things work?",
      "start": "Show me around",
      "skip": "Skip tutorial",
      "skipped": "No problem. You can replay the tour from Ask Rover anytime.",
      "moveFine": "Drive with WASD or the arrow keys. Hold Shift to boost.",
      "moveCoarse": "Drag the joystick to drive. Hold the boost button to go faster.",
      "pointGoFine": "Point at a glowing object to see its name, then click it and I'll drive you there. Try it!",
      "pointGoCoarse": "Or tap a glowing object, then tap it again or its Go button, and I'll drive you there. Try it!",
      "moved": "Nice driving!",
      "highlights": "The Highlights Hall on the east side shows {name}'s best work at a glance. Want to see it?",
      "showMe": "Take me there",
      "later": "Later",
      "elevator": "The elevator goes to every floor. Stop on the glowing call pad in front of it to pick one.",
      "askRover": "Not sure where to go? Ask Rover has guided trips.",
      "askAi": "And Ask AI answers questions about {name}'s work.",
      "closing": "That's it! Look for the ! bubbles near things you can use. Have fun exploring!",
      "closingShort": "That's the basics! Replay the full tour from Ask Rover anytime."
    },
    "floor": {
      "L2": "This is the Career Road: one plaza per year, oldest first, from the first job to today.",
      "L3": "Welcome to Project Roads: product and AI projects on two wings that meet in one loop.",
      "L4": "This is the Newsroom: posts newest first, then research, models and talks.",
      "RF": "Up on the roof: who {name} is, availability, the CV and how to get in touch."
    },
    "hints": {
      "bubble": "Hint: {label}",
      "kind": {
        "door": "{label}: drive into the door to open it.",
        "elevator-pad": "Step on me to pick a floor.",
        "teleporter": "Stop on this pad to beam to another year.",
        "station": "{label}: open it for a closer look.",
        "kiosk": "{label}: open it to use the kiosk.",
        "board": "{label}: open it to see the full list."
      },
      "object": {
        "highlights": "The Highlights Hall: {name}'s best work in one place.",
        "askRover": "The Ask Rover kiosk: guided trips around the HQ.",
        "cv": "The CV kiosk: read or download the CV.",
        "contact": "The comms station: every way to reach {name}.",
        "research": "The Research desk: papers with abstracts and citations.",
        "workshop": "The Workshop: side projects, repos and models."
      },
      "go": {
        "open": "Open",
        "pickFloor": "Pick a floor",
        "pickYear": "Pick a year",
        "askRover": "Ask Rover",
        "browse": "Browse",
        "viewCv": "View CV",
        "go": "Go"
      },
      "notNow": "Not now"
    },
    "menu": {
      "replay": "replay the tutorial",
      "hintsOn": "hints: on",
      "hintsOff": "hints: off"
    }
  }
```

Add to `messages/id.json` in the same place:

```json
  "dialog": {
    "name": "Rover",
    "next": "Berikutnya",
    "continue": "Lanjut",
    "choices": "Pilihan",
    "tryIt": "Coba sekarang",
    "onboarding": {
      "welcome": "Hai, saya Rover! Selamat datang di HQ {name}. Mau tur singkat cara menjelajah di sini?",
      "start": "Ajak saya keliling",
      "skip": "Lewati tutorial",
      "skipped": "Tidak masalah. Tur ini bisa diputar ulang kapan saja dari Tanya Rover.",
      "moveFine": "Kemudikan dengan WASD atau tombol panah. Tahan Shift untuk boost.",
      "moveCoarse": "Geser joystick untuk mengemudi. Tahan tombol boost agar lebih cepat.",
      "pointGoFine": "Arahkan ke objek yang menyala untuk melihat namanya, lalu klik, nanti saya antar. Coba!",
      "pointGoCoarse": "Atau ketuk objek yang menyala, lalu ketuk lagi atau tombol Pergi, nanti saya antar. Coba!",
      "moved": "Mantap, kemudinya lancar!",
      "highlights": "Highlights Hall di sisi timur merangkum karya terbaik {name}. Mau lihat?",
      "showMe": "Antar saya ke sana",
      "later": "Nanti saja",
      "elevator": "Lift ini menuju semua lantai. Berhenti di pad panggil yang menyala di depannya untuk memilih lantai.",
      "askRover": "Bingung mau ke mana? Tanya Rover punya perjalanan berpemandu.",
      "askAi": "Tanya AI juga bisa menjawab pertanyaan tentang karya {name}.",
      "closing": "Selesai! Cari gelembung ! di dekat benda yang bisa dipakai. Selamat menjelajah!",
      "closingShort": "Itu dasarnya! Tur lengkap bisa diputar ulang dari Tanya Rover kapan saja."
    },
    "floor": {
      "L2": "Ini Career Road: satu plaza per tahun, dari yang terlama, sejak pekerjaan pertama hingga hari ini.",
      "L3": "Selamat datang di Project Roads: proyek produk dan AI di dua sayap yang bertemu dalam satu putaran.",
      "L4": "Ini Newsroom: tulisan terbaru lebih dulu, lalu riset, model, dan talk.",
      "RF": "Di atap ini: siapa {name}, ketersediaan, CV, dan cara menghubungi."
    },
    "hints": {
      "bubble": "Petunjuk: {label}",
      "kind": {
        "door": "{label}: kemudikan masuk ke pintu untuk membukanya.",
        "elevator-pad": "Berhenti di atas saya untuk memilih lantai.",
        "teleporter": "Berhenti di pad ini untuk teleport ke tahun lain.",
        "station": "{label}: buka untuk melihat lebih dekat.",
        "kiosk": "{label}: buka untuk memakai kios ini.",
        "board": "{label}: buka untuk melihat daftar lengkap."
      },
      "object": {
        "highlights": "Highlights Hall: karya terbaik {name} di satu tempat.",
        "askRover": "Kios Tanya Rover: perjalanan berpemandu keliling HQ.",
        "cv": "Kios CV: baca atau unduh CV.",
        "contact": "Stasiun komunikasi: semua cara menghubungi {name}.",
        "research": "Meja Riset: paper lengkap dengan abstrak dan sitasi.",
        "workshop": "Workshop: proyek sampingan, repo, dan model."
      },
      "go": {
        "open": "Buka",
        "pickFloor": "Pilih lantai",
        "pickYear": "Pilih tahun",
        "askRover": "Tanya Rover",
        "browse": "Telusuri",
        "viewCv": "Lihat CV",
        "go": "Pergi"
      },
      "notNow": "Nanti saja"
    },
    "menu": {
      "replay": "putar ulang tutorial",
      "hintsOn": "petunjuk: aktif",
      "hintsOff": "petunjuk: mati"
    }
  }
```

Append to `src/app/globals.css`:

```css
/* Rover dialog box and hint bubble (src/hud/dialog): a pixel-style double frame, like a handheld RPG text box. */
.hq-dialog {
  border: 2px solid var(--color-ink);
  border-radius: 6px;
  background: rgb(10 10 18 / 0.96);
  box-shadow:
    0 0 0 2px var(--color-void),
    0 0 0 4px rgb(34 211 238 / 0.55),
    0 12px 32px rgb(0 0 0 / 0.5);
}
```

Create `src/hud/dialog/placement.ts`:

```ts
import type { ViewportClass } from "@/experience/types";

export type DialogPlacement = "bottom" | "raised" | "phone";

/**
 * Where the box sits, always above the HUD bottom band's center column (walk pill, point-and-go's
 * one-time "Click a glowing object" hint or its "Go to {label}" chip in InteractStatus, the controls
 * hint, which hides while Rover speaks): 128 px on fine pointers (pill 44 + hint 40 + gaps and
 * padding), above the joystick and boost on touch tablets, and on phones above the stacked boost
 * button and joystick and left of the elevator panel (right edge, vertically centered).
 */
export function dialogPlacement(viewport: ViewportClass, coarse: boolean): DialogPlacement {
  if (!coarse) return "bottom";
  return viewport === "mobile" ? "phone" : "raised";
}

export const DIALOG_PLACE: Record<DialogPlacement, string> = {
  bottom: "bottom-[128px] left-1/2 w-[min(640px,calc(100%-2rem))] -translate-x-1/2",
  raised: "bottom-[160px] left-1/2 w-[min(560px,calc(100%-2rem))] -translate-x-1/2",
  phone: "bottom-[calc(232px+env(safe-area-inset-bottom))] left-3 right-[60px]",
};
```

Create `src/hud/dialog/RoverPortrait.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { drawFace, FACE_H, FACE_W } from "@/experience/rover/faceTexture";
import { faceFrame } from "@/experience/rover/faces";
import type { RoverFace } from "@/experience/types";

/** Rover's screen as a 2D portrait: the same drawing as the in-world face texture, blinking unless still. */
export function RoverPortrait({ face, still }: { face: RoverFace; still: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [blink, setBlink] = useState(false);

  useEffect(() => {
    if (still) return;
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(() => {
        setBlink(true);
        timer = window.setTimeout(() => {
          setBlink(false);
          schedule();
        }, 150);
      }, 3000 + Math.random() * 3000);
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [still]);

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const font = getComputedStyle(document.documentElement).getPropertyValue("--font-jetbrains").trim() || "monospace";
    drawFace(ctx, faceFrame(face, 0, { blinking: blink }), font);
  }, [face, blink]);

  return (
    <canvas
      ref={canvas}
      width={FACE_W}
      height={FACE_H}
      aria-hidden="true"
      className="h-9 w-12 shrink-0 rounded-sm border-2 border-terminal-fg/60 [image-rendering:pixelated] sm:h-12 sm:w-16"
    />
  );
}
```

Create `src/hud/dialog/DialogBox.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef } from "react";
import { audio } from "@/lib/audio";
import { BLIP_EVERY, CONTINUE_CHOICE, type DialogChoice, type DialogView } from "./engine";
import { DIALOG_PLACE, type DialogPlacement } from "./placement";
import { RoverPortrait } from "./RoverPortrait";
import { dialog, useDialog } from "./store";

const TEXT_INPUT = 'input, textarea, select, [contenteditable="true"], [contenteditable=""]';
const CONTROL = "button, a, [role='button'], summary";
const MODAL = "[role='dialog'][aria-modal='true']";
const NEXT_KEYS = new Set(["ArrowDown", "ArrowRight"]);
const PREV_KEYS = new Set(["ArrowUp", "ArrowLeft"]);

function choicesOf(view: DialogView, continueLabel: string): readonly DialogChoice[] {
  if (!view.line || view.shown < view.length) return [];
  if (view.line.choices?.length) return view.line.choices;
  return view.fallback ? [{ id: CONTINUE_CHOICE, label: continueLabel }] : [];
}

/**
 * Rover's text box (handheld RPG style): portrait, name, typewriter line, then a blinking A button or
 * the choices. Not modal: the world keeps driving behind it. Enter and Space advance unless a text
 * field, another control or a modal dialog has the key; arrows move between the choices once one has
 * focus; Esc picks a "cancel" choice. A tap or click anywhere on the box advances too.
 */
export function DialogBox({ placement, reducedMotion }: { placement: DialogPlacement; reducedMotion: boolean }) {
  const t = useTranslations("dialog");
  const view = useDialog((v) => v);
  const nameId = useId();
  const textId = useId();
  const box = useRef<HTMLElement>(null);
  const line = view.line;
  const visible = Boolean(line) && !view.paused;
  const done = Boolean(line) && view.shown >= view.length;
  const choices = choicesOf(view, t("continue"));
  const choiceKey = choices.map((choice) => choice.id).join("|");

  // Typewriter clock (also the try-it fallback clock) and one soft blip per few characters.
  useEffect(() => {
    if (!visible) return;
    let raf = 0;
    let last = performance.now();
    let count = 0;
    const loop = (now: number) => {
      count += dialog.tick(now - last);
      last = now;
      if (count >= BLIP_EVERY) {
        count = 0;
        audio.play("blip");
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [visible]);

  // Choices take focus when they appear and follow the highlight (no trap: Tab leaves).
  useEffect(() => {
    if (!choiceKey) return;
    box.current?.querySelector<HTMLButtonElement>(`[data-choice-index="${view.active}"]`)?.focus({ preventScroll: true });
  }, [choiceKey, view.active]);

  useEffect(() => {
    if (!visible) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (document.querySelector(MODAL)) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(TEXT_INPUT)) return;
      const inBox = Boolean(target && box.current?.contains(target));
      if (!inBox && target?.closest(CONTROL)) return;
      const current = dialog.view;
      if (event.key === "Enter" || event.key === " ") {
        // A focused choice or button activates natively.
        if (inBox && target?.closest("button")) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        dialog.advance();
        return;
      }
      if (inBox && (NEXT_KEYS.has(event.key) || PREV_KEYS.has(event.key)) && current.line?.choices?.length && current.shown >= current.length) {
        event.preventDefault();
        event.stopImmediatePropagation();
        dialog.move(NEXT_KEYS.has(event.key) ? 1 : -1);
        return;
      }
      if (event.key === "Escape" && dialog.escape()) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    // Capture on window runs before the game's keyboard handler (Enter would open Ask Rover).
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [visible]);

  if (!line || view.paused) return null;

  return (
    <section
      ref={box}
      role="dialog"
      aria-modal="false"
      aria-labelledby={nameId}
      aria-describedby={textId}
      data-testid="dialog-box"
      data-dialog={view.id ?? undefined}
      data-line={line.key}
      data-typing={done ? "false" : "true"}
      data-motion={reducedMotion ? "still" : "live"}
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest("button")) return;
        dialog.advance();
      }}
      className={`hq-dialog pointer-events-auto absolute z-20 flex cursor-pointer gap-3 p-3 font-mono text-[14px] leading-6 text-ink sm:p-4 ${DIALOG_PLACE[placement]}`}
    >
      <RoverPortrait face={line.face ?? "idle"} still={reducedMotion} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h2 id={nameId} className="label text-cyan">
            {t("name")}
          </h2>
          {view.skipLabel && (
            <button
              type="button"
              data-testid="dialog-skip"
              onClick={() => dialog.skip()}
              className="label -mt-3 -mr-2 inline-flex min-h-11 items-center px-2 text-ink-3 hover:text-ink"
            >
              {view.skipLabel}
            </button>
          )}
        </div>
        <p id={textId} className="sr-only" aria-live="polite">
          {line.text}
        </p>
        {/* The untyped rest is laid out but invisible, so the box keeps its height while it types. */}
        <p aria-hidden="true" className="min-h-12 whitespace-pre-line">
          {line.text.slice(0, view.shown)}
          <span className="invisible">{line.text.slice(view.shown)}</span>
        </p>
        {choices.length > 0 ? (
          <div role="group" aria-label={t("choices")} data-testid="dialog-choices" className="mt-2 flex flex-wrap gap-2">
            {choices.map((choice, index) => (
              <button
                key={choice.id}
                type="button"
                data-choice-index={index}
                onClick={() => dialog.choose(choice.id)}
                className={`inline-flex min-h-11 items-center gap-1 rounded px-3 font-semibold ${
                  index === view.active ? "bg-cyan text-void" : "border border-glass-border text-ink hover:border-ink-3"
                }`}
              >
                <span aria-hidden="true" className="w-3">
                  {index === view.active ? ">" : ""}
                </span>
                {choice.label}
              </button>
            ))}
          </div>
        ) : view.waiting ? (
          <p className="label mt-2 text-amber" data-testid="dialog-try">
            {t("tryIt")}
          </p>
        ) : null}
      </div>
      {choices.length === 0 && !view.waiting && (
        <button
          type="button"
          data-testid="dialog-next"
          aria-label={t("next")}
          onClick={() => dialog.advance()}
          className="grid size-11 shrink-0 place-items-center self-end rounded-full border-2 border-ink text-ink hover:border-cyan hover:text-cyan"
        >
          <span aria-hidden="true" className="flex flex-col items-center leading-none font-bold">
            <span className="text-[13px]">A</span>
            <svg viewBox="0 0 10 6" className={`mt-0.5 h-1.5 w-2.5 fill-current ${done ? "motion-safe:animate-pulse" : "invisible"}`}>
              <path d="M0 0h10L5 6z" />
            </svg>
          </span>
        </button>
      )}
    </section>
  );
}
```

Create `src/hud/dialog/useModalOpen.ts`:

```ts
"use client";

import { useEffect, useState } from "react";

const MODAL = "[role='dialog'][aria-modal='true']";

/** True while any modal dialog is open (terminal, palette, pad picker, room drawer, CV, paper, cert). */
export function useModalOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let raf = 0;
    const check = () => {
      raf = 0;
      setOpen(document.querySelector(MODAL) !== null);
    };
    const observer = new MutationObserver(() => {
      if (!raf) raf = requestAnimationFrame(check);
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-modal", "role"] });
    check();
    return () => {
      observer.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return open;
}
```

Create `src/hud/dialog/Spotlight.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

const PAD = 6;

/** Pulse ring around a HUD control (`data-onboard` name) while Rover talks about it. Still under reduced motion. */
export function Spotlight({ target, still }: { target: string; still: boolean }) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    const measure = () => {
      const hud = document.querySelector("[data-testid='hud']");
      const el = [...(hud?.querySelectorAll<HTMLElement>(`[data-onboard="${target}"]`) ?? [])].find((node) => node.getClientRects().length > 0);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    measure();
    const timer = window.setInterval(measure, 500);
    window.addEventListener("resize", measure);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", measure);
    };
  }, [target]);

  if (!rect) return null;
  return (
    <div
      aria-hidden="true"
      data-testid="onboard-spotlight"
      data-target={target}
      data-motion={still ? "still" : "live"}
      className="pointer-events-none fixed z-30"
      style={{ left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }}
    >
      <span className="absolute inset-0 rounded-[22px] shadow-[0_0_24px_rgb(251_191_36/0.6)] ring-2 ring-amber" />
      {!still && <span className="absolute inset-0 rounded-[22px] ring-2 ring-amber motion-safe:animate-ping" />}
    </div>
  );
}
```

Create `src/hud/dialog/DialogLayer.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { useHQStore, type Phase } from "@/store/useHQStore";
import { useAskPanelOpen } from "../ask/availability";
import { DialogBox } from "./DialogBox";
import { dialogPlacement } from "./placement";
import { Spotlight } from "./Spotlight";
import { dialog, useDialog } from "./store";
import { useModalOpen } from "./useModalOpen";

/** Rover never talks over these: the line waits (hidden, clock stopped) until they close. */
const QUIET_PHASES: readonly Phase[] = ["boot", "intro", "room", "hologram", "palette", "terminal", "static"];

/** Lazily loaded on the first line: the box, the spotlight, and the pause and reduced motion rules. */
export default function DialogLayer() {
  const phase = useHQStore((s) => s.phase);
  const picker = useHQStore((s) => s.picker !== null);
  const viewport = useHQStore((s) => s.device.viewport);
  const coarse = useHQStore((s) => s.device.coarse);
  const reduced = useHQStore((s) => s.reducedMotion);
  const askOpen = useAskPanelOpen();
  const modal = useModalOpen();
  const quiet = QUIET_PHASES.includes(phase) || picker || askOpen || modal;
  const spotlight = useDialog((v) => (v.paused || !v.line ? null : (v.line.spotlight ?? null)));

  useEffect(() => dialog.setPaused(quiet), [quiet]);
  useEffect(() => dialog.setInstant(reduced), [reduced]);

  return (
    <>
      <DialogBox placement={dialogPlacement(viewport, coarse)} reducedMotion={reduced} />
      {spotlight && <Spotlight target={spotlight} still={reduced} />}
    </>
  );
}
```

Modify `src/hud/Hud.tsx`:

1. Add imports:

```tsx
import dynamic from "next/dynamic";
import { useDialog } from "./dialog/store";
```

and below the imports:

```tsx
/** Rover's text box: its chunk loads with the first line. */
const DialogLayer = dynamic(() => import("./dialog/DialogLayer"), { ssr: false });
```

2. In `Hud`, after `const askOpen = useAskPanelOpen();` add:

```tsx
  const speaking = useDialog((v) => v.line !== null);
```

3. Replace `{explorable && !walking && <HintBar coarse={coarse} mobile={mobile} />}` with the line below. Keep point-and-go's `<InteractStatus coarse={coarse} />` right above it untouched: the Go chip and the point hint must keep working while Rover speaks (the try-it step needs the chip), and the box sits above them.

```tsx
            {explorable && !walking && !speaking && <HintBar coarse={coarse} mobile={mobile} />}
```

4. After `<FloorAnnouncer data={data} />` add:

```tsx
      {speaking && <DialogLayer />}
```

Add the spotlight targets:

- `src/hud/ElevatorPanel.tsx`: on the element with `data-testid="elevator-panel"`, add `data-onboard="elevator"`.
- `src/hud/HudLaunchers.tsx`: on the Ask Rover `<button type="button" onClick={openTerminal} ...>`, add `data-onboard="ask-rover"`.
- `src/hud/ask/AskPill.tsx`: on the pill `<button ... data-testid="ask-pill">`, add `data-onboard="ask-ai"`.

- [x] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run tests/unit/dialog-copy.test.ts tests/hud/DialogBox.test.tsx tests/unit/ui-copy.test.ts tests/content/fonts.test.ts tests/content/safety.test.ts`
Expected: PASS (the font test proves the copy and the components stay inside the font cut; the safety test proves no em dash or blocked term).

Then: `bun run typecheck && bun run lint`
Expected: no errors.

- [x] **Step 5: Commit**

```bash
rtk git add messages/en.json messages/id.json src/app/globals.css src/hud/dialog/placement.ts src/hud/dialog/RoverPortrait.tsx src/hud/dialog/DialogBox.tsx src/hud/dialog/Spotlight.tsx src/hud/dialog/useModalOpen.ts src/hud/dialog/DialogLayer.tsx src/hud/Hud.tsx src/hud/ElevatorPanel.tsx src/hud/HudLaunchers.tsx src/hud/ask/AskPill.tsx tests/unit/dialog-copy.test.ts tests/hud/DialogBox.test.tsx
rtk git commit -m "feat(hud): Rover text box with portrait, typewriter, choices, spotlight and placement"
```

---
### Task 5: Hint source, nearest-target selection and the bubble probe (3D side)

Gate: point-and-go is on `main` (see "Interfaces From Parallel Plans"): `src/experience/interact/registry.ts`, `runtime.ts` and `pick.ts` exist.

**Files:**
- Create: `src/experience/hints/source.ts`
- Create: `src/experience/hints/select.ts`
- Create: `src/experience/hints/runtime.ts`
- Create: `src/experience/hints/HintProbe.tsx`
- Modify: `src/experience/scene/Scene.tsx` (mount the probe)
- Test: `tests/unit/hint-select.test.ts`

**Interfaces:**
- Consumes (point-and-go): `Interactable`, `extraInteractables` from `src/experience/interact/registry.ts`; `interactRuntime` (`items`) from `src/experience/interact/runtime.ts`; `labelAnchor` from `src/experience/interact/pick.ts`; store `hover`. Also `floorY` from `src/experience/config.ts`; `roverRuntime` from `src/experience/rover/runtime.ts`; `getHQStore`, `useHQStore`.
- Produces: `hintItems(): readonly Interactable[]` (the current floor's targets, base plus extras), `extraItems(floor: FloorId): readonly Interactable[]`, `type Interactable` (re-export); `HINT = { radius: 5, keep: 6, margin: 0.5, lift: 1.1, everyS: 0.1 }`, `nearestHint<T extends { id: string; at: Vec2 }>(items: readonly T[], rover: Vec2, current?: T | null): T | null`, `hintAnchor(item: Pick<Interactable, "bounds" | "height" | "kind">, floorY: number): { x: number; y: number; z: number }` (above point-and-go's hover label); `interface HintTarget { item: Interactable; anchor: { x: number; y: number; z: number } }`, `hintRuntime: { target: HintTarget | null; element: HTMLElement | null }`, `setHintTarget(next: HintTarget | null)`, `subscribeHintTarget(listener): () => void`, `registerHintElement(element: HTMLElement | null)`; `<HintProbe />` (no props).

- [x] **Step 1: Write the failing test**

Create `tests/unit/hint-select.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { labelAnchor } from "@/experience/interact/pick";
import type { Interactable } from "@/experience/hints/source";
import { HINT, hintAnchor, nearestHint } from "@/experience/hints/select";
import { hintRuntime, setHintTarget, subscribeHintTarget } from "@/experience/hints/runtime";

const at = (id: string, x: number, z = 0) => ({ id, at: { x, z } });
const origin = { x: 0, z: 0 };

describe("nearestHint", () => {
  it("picks the nearest target within the radius", () => {
    expect(nearestHint([at("L1:pad:elevator", 4.5), at("L1:kiosk:ask-rover", 3)], origin)?.id).toBe("L1:kiosk:ask-rover");
    expect(nearestHint([at("L1:station:skills", HINT.radius + 0.1)], origin)).toBeNull();
    expect(nearestHint([], origin)).toBeNull();
  });

  it("keeps the current bubble until another target is clearly nearer or it leaves the keep radius", () => {
    const a = at("a", 3);
    const b = at("b", -2.8);
    expect(nearestHint([a, b], origin, a)?.id).toBe("a");
    const c = at("c", -1);
    expect(nearestHint([a, c], origin, a)?.id).toBe("c");
    const drifting = at("a", 5.5);
    expect(nearestHint([drifting], origin, drifting)?.id).toBe("a");
    expect(nearestHint([at("a", 6.5)], origin, a)).toBeNull();
  });
});

describe("hintAnchor", () => {
  it("floats above point-and-go's hover label, so the two never overlap", () => {
    const pad = { kind: "elevator-pad" as const, bounds: { minX: 2, maxX: 4, minZ: -1, maxZ: 1 }, height: 0.4 };
    const [lx, ly, lz] = labelAnchor(pad);
    const anchor = hintAnchor(pad, 14);
    expect(anchor.x).toBe(lx);
    expect(anchor.z).toBe(lz);
    expect(anchor.y).toBeCloseTo(14 + ly + HINT.lift);
  });
});

describe("hint runtime", () => {
  it("notifies only when the picked target changes", () => {
    const item = { id: "L1:pad:elevator" } as Interactable;
    const listener = vi.fn();
    const off = subscribeHintTarget(listener);
    setHintTarget({ item, anchor: { x: 0, y: 0, z: 0 } });
    setHintTarget({ item, anchor: { x: 1, y: 0, z: 0 } });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(hintRuntime.target?.anchor.x).toBe(1);
    setHintTarget(null);
    expect(listener).toHaveBeenCalledTimes(2);
    off();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/unit/hint-select.test.ts`
Expected: FAIL with "Failed to resolve import "@/experience/hints/select"".

- [x] **Step 3: Write minimal implementation**

Create `src/experience/hints/source.ts`:

```ts
import type { FloorId } from "@/content/schema";
import { extraInteractables, type Interactable } from "../interact/registry";
import { interactRuntime } from "../interact/runtime";

export type { Interactable };

/**
 * Point-and-go targets for the dialog and the hint bubbles: the only place this feature reads the
 * interactables registry. The current floor's list (built-in plus extras, labels already in the
 * tower's locale) is the one InteractLayer keeps in `interactRuntime.items`, so a bubble always
 * points at exactly what a click would pick.
 */
export function hintItems(): readonly Interactable[] {
  return interactRuntime.items;
}

/** Targets other features registered on a floor (for example the L1 Highlights Hall), on any floor the rover is on. */
export function extraItems(floor: FloorId): readonly Interactable[] {
  return extraInteractables(floor);
}
```

Create `src/experience/hints/select.ts`:

```ts
import { labelAnchor } from "../interact/pick";
import type { Interactable } from "../interact/registry";
import type { Vec2 } from "../types";

/** Hint bubble tuning (u, seconds). */
export const HINT = {
  /** A bubble shows for the nearest target whose approach point (`at`) is this close. */
  radius: 5,
  /** The shown bubble stays until the rover is this far from it (no flicker at the edge). */
  keep: 6,
  /** Another target must be this much nearer to take the bubble over. */
  margin: 0.5,
  /** Height above point-and-go's hover label (`labelAnchor`), so the bubble and the label never overlap. */
  lift: 1.1,
  /** Selection runs 10 times a second; the bubble position every frame. */
  everyS: 0.1,
} as const;

const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);

/** The one target to show a bubble for: nearest within `HINT.radius`, sticky within `HINT.keep`. */
export function nearestHint<T extends { id: string; at: Vec2 }>(items: readonly T[], rover: Vec2, current: T | null = null): T | null {
  let best: T | null = null;
  let bestD = Infinity;
  for (const item of items) {
    const d = distance(item.at, rover);
    if (d <= HINT.radius && d < bestD) {
      best = item;
      bestD = d;
    }
  }
  if (current) {
    const kept = items.find((item) => item.id === current.id);
    if (kept) {
      const d = distance(kept.at, rover);
      if (d <= HINT.keep && (!best || d <= bestD + HINT.margin)) return kept;
    }
  }
  return best;
}

/** World point the bubble's tail points at: straight above point-and-go's hover label for the target. */
export function hintAnchor(item: Pick<Interactable, "bounds" | "height" | "kind">, floorY: number): { x: number; y: number; z: number } {
  const [x, y, z] = labelAnchor(item);
  return { x, y: floorY + y + HINT.lift, z };
}
```

Create `src/experience/hints/runtime.ts`:

```ts
import type { Interactable } from "./source";

export interface HintTarget {
  item: Interactable;
  anchor: { x: number; y: number; z: number };
}

/**
 * Shared between HintProbe (in the canvas) and the HUD bubble: the picked target and the bubble
 * element the probe moves every frame. Mutated outside React render.
 */
export const hintRuntime = {
  target: null as HintTarget | null,
  element: null as HTMLElement | null,
};

const listeners = new Set<() => void>();

/** Sets the picked target; listeners hear about it only when a different target is picked. */
export function setHintTarget(next: HintTarget | null) {
  const changed = (hintRuntime.target?.item.id ?? null) !== (next?.item.id ?? null);
  hintRuntime.target = next;
  if (changed) listeners.forEach((listener) => listener());
}

export function subscribeHintTarget(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function registerHintElement(element: HTMLElement | null) {
  hintRuntime.element = element;
}
```

Create `src/experience/hints/HintProbe.tsx`:

```tsx
"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Vector3 } from "three";
import { getHQStore } from "@/store/useHQStore";
import { floorY } from "../config";
import { roverRuntime } from "../rover/runtime";
import { hintRuntime, setHintTarget } from "./runtime";
import { HINT, hintAnchor, nearestHint } from "./select";
import { hintItems } from "./source";

/**
 * Picks the one point-and-go target a "!" bubble floats over (10 times a second) and moves the HTML
 * bubble over its anchor every frame. No bubble while the rover is not free (ride, beam, any autopilot
 * drive: missions, walks, point-and-go) or while a target is hovered or tap-selected (point-and-go's
 * label and Go chip own that moment). Renders nothing: no draw calls.
 */
export function HintProbe() {
  const next = useRef(0);
  const point = useMemo(() => new Vector3(), []);

  useFrame(({ camera, clock, size }) => {
    const now = clock.elapsedTime;
    if (now >= next.current) {
      next.current = now + HINT.everyS;
      const s = getHQStore().getState();
      const pilot = roverRuntime.autopilot;
      const free = s.phase === "explore" && !s.ride && !s.beam && !s.hover && (!pilot || pilot.state === "done");
      const items = hintItems().filter((item) => item.floor === s.floor);
      const pick = free ? nearestHint(items, roverRuntime, hintRuntime.target?.item ?? null) : null;
      setHintTarget(pick ? { item: pick, anchor: hintAnchor(pick, floorY(s.floor)) } : null);
    }
    const element = hintRuntime.element;
    const target = hintRuntime.target;
    if (!element || !target) return;
    point.set(target.anchor.x, target.anchor.y, target.anchor.z).project(camera);
    const onScreen = point.z < 1 && Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1;
    const x = ((point.x + 1) / 2) * size.width;
    const y = ((1 - point.y) / 2) * size.height;
    element.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`;
    element.style.visibility = onScreen ? "visible" : "hidden";
  });
  return null;
}
```

(The `item.floor === s.floor` filter keeps a stale list from the previous floor out for the frame between arrival and InteractLayer's next write.)

Modify `src/experience/scene/Scene.tsx`: add `import { HintProbe } from "../hints/HintProbe";` and, right after point-and-go's `<InteractLayer ... />` element, add:

```tsx
      <HintProbe />
```

- [x] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run tests/unit/hint-select.test.ts && bun run typecheck`
Expected: PASS, no type errors.

- [x] **Step 5: Commit**

```bash
rtk git add src/experience/hints/ src/experience/scene/Scene.tsx tests/unit/hint-select.test.ts
rtk git commit -m "feat(3d): hint bubble probe picks the nearest point-and-go target and projects it to the HUD"
```

---

### Task 6: The onboarding script

**Files:**
- Create: `src/hud/dialog/onboarding.ts`
- Test: `tests/unit/onboarding.test.ts`

**Interfaces:**
- Consumes: `DialogLine`, `SayInput`, `SayOptions`, `SayResult`, `linesOf` (Task 1); `Interactable` from `src/experience/hints/source.ts` (Task 5, type only); `HQStore` (type only); `FloorId`, `Vec2` (types).
- Produces: `ONBOARDING_ID = "onboarding"`, `HIGHLIGHTS_ID = "L1:station:highlights-about"` (the hall's first station in the registry), `HIGHLIGHTS_ROOM = "L1:highlights-about"` (its room, the fallback match), `TRY_IT_MS = 12_000`, `MOVE_DONE_U = 2`, `type OnboardingVariant = "full" | "short"`, `type OnboardingOutcome = "done" | "skipped" | "cancelled"`, `interface HighlightsTarget { floor: FloorId; at: Vec2 }`, `interface OnboardingCopy { welcome; start; skip; skipped; moveFine; moveCoarse; pointGoFine; pointGoCoarse; moved; highlights; showMe; later; elevator; askRover; askAi; closing; closingShort }` (all `string`), `interface OnboardingDeps { say; copy; coarse; variant; waitForMove; highlights; showMe; askAi; tryItMs? }`, `runOnboarding(deps): Promise<OnboardingOutcome>`, `waitForRoverMove(store, signal, distance?): Promise<void>`, `highlightsTarget(items: readonly Interactable[]): HighlightsTarget | null` (id `HIGHLIGHTS_ID`, else an `open-room` action on `HIGHLIGHTS_ROOM`), `firstName(name: string): string`. Line keys spoken, in order: `welcome`, `move`, `point-go`, `moved`, `highlights` (full, when the hall exists), `elevator` (full), `ask-rover`, `ask-ai` (when the Ask AI pill shows), `closing`; on skip: `skipped`.

- [x] **Step 1: Write the failing test**

Create `tests/unit/onboarding.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { StateStorage } from "zustand/middleware";
import type { Interactable } from "@/experience/hints/source";
import { linesOf, type DialogLine, type SayInput, type SayOptions, type SayResult } from "@/hud/dialog/engine";
import {
  firstName,
  HIGHLIGHTS_ID,
  HIGHLIGHTS_ROOM,
  highlightsTarget,
  ONBOARDING_ID,
  runOnboarding,
  TRY_IT_MS,
  waitForRoverMove,
  type OnboardingCopy,
  type OnboardingDeps,
} from "@/hud/dialog/onboarding";
import { createHQStore } from "@/store/useHQStore";

const copy: OnboardingCopy = {
  welcome: "welcome",
  start: "start",
  skip: "skip",
  skipped: "skipped",
  moveFine: "moveFine",
  moveCoarse: "moveCoarse",
  pointGoFine: "pointGoFine",
  pointGoCoarse: "pointGoCoarse",
  moved: "moved",
  highlights: "highlights",
  showMe: "showMe",
  later: "later",
  elevator: "elevator",
  askRover: "askRover",
  askAi: "askAi",
  closing: "closing",
  closingShort: "closingShort",
};

/** Records every line Rover says; answers a request from the first line whose key has an answer. */
function fakeSay(answers: Record<string, Partial<SayResult>> = {}) {
  const said: { lines: DialogLine[]; options?: SayOptions }[] = [];
  const say = vi.fn(async (input: SayInput, options?: SayOptions): Promise<SayResult> => {
    const lines = linesOf(input);
    said.push({ lines, options });
    for (const line of lines) {
      const answer = line.key ? answers[line.key] : undefined;
      if (answer) return { status: "done", choice: null, ...answer };
    }
    return { status: "done", choice: null };
  });
  const keys = () => said.flatMap((s) => s.lines.map((line) => line.key));
  const line = (key: string) => said.flatMap((s) => s.lines).find((l) => l.key === key)!;
  return { say, said, keys, line };
}

function deps(over: Partial<OnboardingDeps> = {}): OnboardingDeps {
  return {
    say: fakeSay().say,
    copy,
    coarse: false,
    variant: "full",
    waitForMove: () => Promise.resolve(),
    highlights: () => ({ floor: "L1", at: { x: 20, z: 0 } }),
    showMe: vi.fn(async () => {}),
    askAi: () => true,
    ...over,
  };
}

const item = (over: Partial<Interactable>): Interactable => ({
  id: "L1:station:profile",
  floor: "L1",
  kind: "station",
  label: "Profile",
  at: { x: 0, z: 0 },
  bounds: { minX: -1, maxX: 1, minZ: -1, maxZ: 1 },
  action: { type: "open-room", room: "L1:profile" },
  ...over,
});

const memoryStorage: StateStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("runOnboarding", () => {
  it("walks the full tour in order and offers Skip after the first line", async () => {
    const fake = fakeSay({ welcome: { choice: "start" } });
    const outcome = await runOnboarding(deps({ say: fake.say }));
    expect(outcome).toBe("done");
    expect(fake.keys()).toEqual(["welcome", "move", "point-go", "moved", "highlights", "elevator", "ask-rover", "ask-ai", "closing"]);
    expect(fake.said[0].options).toEqual({ id: ONBOARDING_ID });
    expect(fake.said[1].options).toEqual({ id: ONBOARDING_ID, skip: { label: "skip" } });
    expect(fake.line("welcome").choices?.map((c) => c.id)).toEqual(["start", "skip"]);
    expect(fake.line("elevator").spotlight).toBe("elevator");
    expect(fake.line("ask-rover").spotlight).toBe("ask-rover");
    expect(fake.line("ask-ai").spotlight).toBe("ask-ai");
    expect(fake.line("closing").text).toBe("closing");
  });

  it("makes the moving step a try-it line with a Continue fallback", async () => {
    const fake = fakeSay();
    const waitForMove = vi.fn(() => Promise.resolve());
    await runOnboarding(deps({ say: fake.say, waitForMove }));
    const tryIt = fake.line("point-go");
    expect(tryIt.until).toBe(waitForMove);
    expect(tryIt.fallbackMs).toBe(TRY_IT_MS);
  });

  it("speaks touch controls on coarse pointers", async () => {
    const fake = fakeSay();
    await runOnboarding(deps({ say: fake.say, coarse: true }));
    expect(fake.line("move").text).toBe("moveCoarse");
    expect(fake.line("point-go").text).toBe("pointGoCoarse");
  });

  it("stops after the welcome when the visitor skips", async () => {
    const fake = fakeSay({ welcome: { choice: "skip" } });
    expect(await runOnboarding(deps({ say: fake.say }))).toBe("skipped");
    expect(fake.keys()).toEqual(["welcome", "skipped"]);
  });

  it("stops when the skip button is pressed mid-tour", async () => {
    const fake = fakeSay({ move: { status: "skipped" } });
    expect(await runOnboarding(deps({ say: fake.say }))).toBe("skipped");
    expect(fake.keys()).toEqual(["welcome", "move", "point-go", "moved", "skipped"]);
  });

  it("ends quietly when cancelled", async () => {
    const fake = fakeSay({ move: { status: "cancelled" } });
    expect(await runOnboarding(deps({ say: fake.say }))).toBe("cancelled");
    expect(fake.keys()).not.toContain("closing");
    expect(fake.keys()).not.toContain("skipped");
  });

  it("skips the Highlights Hall step when the hall is not there", async () => {
    const fake = fakeSay();
    await runOnboarding(deps({ say: fake.say, highlights: () => null }));
    expect(fake.keys()).not.toContain("highlights");
  });

  it("drives to the Highlights Hall on Take me there, before the elevator line", async () => {
    const fake = fakeSay({ highlights: { choice: "show" } });
    const order: string[] = [];
    const showMe = vi.fn(async () => {
      order.push(`drive:${fake.keys().length}`);
    });
    await runOnboarding(deps({ say: fake.say, showMe }));
    expect(showMe).toHaveBeenCalledWith({ floor: "L1", at: { x: 20, z: 0 } });
    expect(order).toEqual([`drive:${fake.keys().indexOf("highlights") + 1}`]);
  });

  it("runs the short tour after a deep link: no Highlights Hall, no elevator", async () => {
    const fake = fakeSay();
    await runOnboarding(deps({ say: fake.say, variant: "short" }));
    expect(fake.keys()).toEqual(["welcome", "move", "point-go", "moved", "ask-rover", "ask-ai", "closing"]);
    expect(fake.line("closing").text).toBe("closingShort");
  });

  it("leaves out Ask AI when its button is not shown", async () => {
    const fake = fakeSay();
    await runOnboarding(deps({ say: fake.say, askAi: () => false }));
    expect(fake.keys()).not.toContain("ask-ai");
  });
});

describe("highlightsTarget", () => {
  it("finds the Highlights Hall's first station by registry id, else by its room", () => {
    expect(HIGHLIGHTS_ID).toBe("L1:station:highlights-about");
    const projects = item({ id: "L1:station:highlights-projects", at: { x: 40, z: 6 }, action: { type: "open-room", room: "L1:highlights-projects" } });
    const about = item({ id: HIGHLIGHTS_ID, at: { x: 38, z: -6 }, action: { type: "open-room", room: HIGHLIGHTS_ROOM } });
    expect(highlightsTarget([projects, about])).toEqual({ floor: "L1", at: { x: 38, z: -6 } });
    const renamed = item({ id: "L1:station:hall-about", at: { x: 1, z: 2 }, action: { type: "open-room", room: HIGHLIGHTS_ROOM } });
    expect(highlightsTarget([renamed])?.at).toEqual({ x: 1, z: 2 });
    expect(highlightsTarget([item({}), projects])).toBeNull();
  });
});

describe("waitForRoverMove", () => {
  it("resolves after 2 u of driving, a floor change or an abort", async () => {
    const store = createHQStore(memoryStorage);
    const moved = vi.fn();
    void waitForRoverMove(store, new AbortController().signal).then(moved);
    const start = store.getState().rover;
    store.getState().setRover({ x: start.x + 1 });
    await flush();
    expect(moved).not.toHaveBeenCalled();
    store.getState().setRover({ x: start.x + 2.5 });
    await flush();
    expect(moved).toHaveBeenCalledTimes(1);

    const rode = vi.fn();
    void waitForRoverMove(store, new AbortController().signal).then(rode);
    store.setState({ floor: "L2" });
    await flush();
    expect(rode).toHaveBeenCalledTimes(1);

    const aborted = vi.fn();
    const controller = new AbortController();
    void waitForRoverMove(store, controller.signal).then(aborted);
    controller.abort();
    await flush();
    expect(aborted).toHaveBeenCalledTimes(1);
  });
});

describe("firstName", () => {
  it("keeps the first word of the profile name", () => {
    expect(firstName("Kurniadi Ahmad Wijaya")).toBe("Kurniadi");
    expect(firstName("  Single  ")).toBe("Single");
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/unit/onboarding.test.ts`
Expected: FAIL with "Failed to resolve import "@/hud/dialog/onboarding"".

- [x] **Step 3: Write minimal implementation**

Create `src/hud/dialog/onboarding.ts`:

```ts
import type { FloorId } from "@/content/schema";
import type { Interactable } from "@/experience/hints/source";
import type { Vec2 } from "@/experience/types";
import type { HQStore } from "@/store/useHQStore";
import type { DialogLine, SayInput, SayOptions, SayResult } from "./engine";

/**
 * The first-session tour (owner request: "simple guidance at first, like old Pokemon games"). Plain
 * async code on top of `say()`, so it is tested with a fake `say`. OnboardingLayer runs it after the
 * intro (full) or after a deep link arrives (short), and from "Replay the tutorial" (full).
 */
export const ONBOARDING_ID = "onboarding";
/** The Highlights Hall's first station on L1 east (r4-g, registered as an L1 extra); the step is skipped without it. */
export const HIGHLIGHTS_ID = "L1:station:highlights-about";
/** Its room, matched when the station id differs. */
export const HIGHLIGHTS_ROOM = "L1:highlights-about";
/** A try-it step offers Continue after this long. */
export const TRY_IT_MS = 12_000;
/** The moving step is done once the rover has driven this far (keys, joystick or point-and-go). */
export const MOVE_DONE_U = 2;

export type OnboardingVariant = "full" | "short";
export type OnboardingOutcome = "done" | "skipped" | "cancelled";

export interface HighlightsTarget {
  floor: FloorId;
  at: Vec2;
}

export interface OnboardingCopy {
  welcome: string;
  start: string;
  skip: string;
  skipped: string;
  moveFine: string;
  moveCoarse: string;
  pointGoFine: string;
  pointGoCoarse: string;
  moved: string;
  highlights: string;
  showMe: string;
  later: string;
  elevator: string;
  askRover: string;
  askAi: string;
  closing: string;
  closingShort: string;
}

export interface OnboardingDeps {
  say: (input: SayInput, options?: SayOptions) => Promise<SayResult>;
  copy: OnboardingCopy;
  coarse: boolean;
  variant: OnboardingVariant;
  waitForMove: (signal: AbortSignal) => Promise<void>;
  highlights: () => HighlightsTarget | null;
  showMe: (target: HighlightsTarget) => Promise<void>;
  /** The Ask AI pill is on screen (Ask the HQ enabled). */
  askAi: () => boolean;
  tryItMs?: number;
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

export function highlightsTarget(items: readonly Interactable[]): HighlightsTarget | null {
  const hall = items.find((i) => i.id === HIGHLIGHTS_ID) ?? items.find((i) => i.action.type === "open-room" && i.action.room === HIGHLIGHTS_ROOM);
  return hall ? { floor: hall.floor, at: { x: hall.at.x, z: hall.at.z } } : null;
}

/** Resolves once the rover has moved `distance` from where it stood, changed floor, or the line ended. */
export function waitForRoverMove(store: Pick<HQStore, "getState" | "subscribe">, signal: AbortSignal, distance = MOVE_DONE_U): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const start = store.getState();
    const from = { x: start.rover.x, z: start.rover.z };
    let off = () => {};
    const done = () => {
      off();
      signal.removeEventListener("abort", done);
      resolve();
    };
    off = store.subscribe((s) => {
      if (s.floor !== start.floor || Math.hypot(s.rover.x - from.x, s.rover.z - from.z) >= distance) done();
    });
    signal.addEventListener("abort", done, { once: true });
  });
}

export async function runOnboarding(d: OnboardingDeps): Promise<OnboardingOutcome> {
  const { copy } = d;
  const tour: SayOptions = { id: ONBOARDING_ID, skip: { label: copy.skip } };
  const ended = async (result: SayResult): Promise<OnboardingOutcome | null> => {
    if (result.status === "cancelled") return "cancelled";
    if (result.status === "skipped" || result.choice === "skip") {
      await d.say({ key: "skipped", text: copy.skipped, face: "arrived" }, { id: ONBOARDING_ID });
      return "skipped";
    }
    return null;
  };

  // 1. Welcome, with "Skip tutorial" as its second choice (the skip button joins from the next line).
  let result = await d.say(
    {
      key: "welcome",
      text: copy.welcome,
      face: "arrived",
      choices: [
        { id: "start", label: copy.start },
        { id: "skip", label: copy.skip, cancel: true },
      ],
    },
    { id: ONBOARDING_ID },
  );
  let end = await ended(result);
  if (end) return end;

  // 2. Moving: keys or joystick and boost, then point-and-go (there is no click-the-floor driving any
  // more: desktop points and clicks a glowing object, touch taps it twice or uses its Go chip); waits
  // until the rover moves, whichever way.
  result = await d.say(
    [
      { key: "move", text: d.coarse ? copy.moveCoarse : copy.moveFine },
      { key: "point-go", text: d.coarse ? copy.pointGoCoarse : copy.pointGoFine, until: d.waitForMove, fallbackMs: d.tryItMs ?? TRY_IT_MS },
      { key: "moved", text: copy.moved, face: "arrived" },
    ],
    tour,
  );
  end = await ended(result);
  if (end) return end;

  if (d.variant === "full") {
    // 3. The Highlights Hall on L1 east, when it exists.
    const hall = d.highlights();
    if (hall) {
      result = await d.say(
        {
          key: "highlights",
          text: copy.highlights,
          choices: [
            { id: "show", label: copy.showMe },
            { id: "later", label: copy.later, cancel: true },
          ],
        },
        tour,
      );
      end = await ended(result);
      if (end) return end;
      if (result.choice === "show") await d.showMe(hall);
    }

    // 4. Elevator and call pads.
    result = await d.say({ key: "elevator", text: copy.elevator, spotlight: "elevator" }, tour);
    end = await ended(result);
    if (end) return end;
  }

  // 5. Ask Rover and Ask AI, each ringed while Rover talks about it.
  const ask: DialogLine[] = [{ key: "ask-rover", text: copy.askRover, spotlight: "ask-rover" }];
  if (d.askAi()) ask.push({ key: "ask-ai", text: copy.askAi, spotlight: "ask-ai" });
  result = await d.say(ask, tour);
  end = await ended(result);
  if (end) return end;

  // 6. Closing.
  result = await d.say({ key: "closing", text: d.variant === "full" ? copy.closing : copy.closingShort, face: "arrived" }, { id: ONBOARDING_ID });
  return result.status === "cancelled" ? "cancelled" : "done";
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/unit/onboarding.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
rtk git add src/hud/dialog/onboarding.ts tests/unit/onboarding.test.ts
rtk git commit -m "feat(hud): first-session onboarding script (full and short tours, try-it step, skip)"
```

---
### Task 7: Run the onboarding after the intro (and after deep links), retire the terminal auto-open

**Files:**
- Create: `src/hud/dialog/OnboardingLayer.tsx`
- Modify: `src/hud/Hud.tsx` (mount `OnboardingLayer`)
- Modify: `src/experience/scene/Director.tsx` (remove the first-visit terminal auto-open)
- Modify: `src/hud/RoverTerminal.tsx` (remove `shouldAutoOpenTerminal`)
- Modify: `tests/hud/RoverTerminal.test.tsx`, `tests/hud/MissionHud.test.tsx` (auto-open is gone)
- Modify: `e2e/hq.ts` (`asReturningVisitor`), `e2e/experience.spec.ts`, `e2e/missions.spec.ts`, `e2e/ask.spec.ts`, `e2e/gallery.spec.ts`, `e2e/pageview.spec.ts`, `e2e/pageview-visual.spec.ts`, `e2e/screenshots.spec.ts` (onboarding flags)
- Modify: `scripts/e2e-plan.ts`, `tests/unit/e2e-plan.test.ts`
- Create: `e2e/onboarding.spec.ts`
- Test: `tests/hud/OnboardingLayer.test.tsx`

**Interfaces:**
- Consumes: `runOnboarding`, `waitForRoverMove`, `highlightsTarget`, `firstName`, `OnboardingCopy`, `OnboardingVariant` (Task 6); `say`, `cancelAllDialogs` (Task 1); `onboarded`, `markOnboarded` (Task 2); `registerTutorial` (Task 2); `isContinuing`, `onContinuationChange` (Task 2); `extraItems` (Task 5); `runMissionSteps` from `src/experience/missions/bridge.ts`; `roverRuntime` from `src/experience/rover/runtime.ts`.
- Produces: `OnboardingLayer({ data })` (auto start 600 ms after the rover is free in explore, retried every 600 ms while a mission, an arrival roll-on or a point-and-go drive still runs; `START_DELAY_MS`); e2e spec `onboarding` with helpers `box`, `expectLine`, `next`, `freshVisit` reused by Tasks 8 to 11; `asReturningVisitor` sets `hq:onboarded=done` and `hq:hints=off`.

- [x] **Step 1: Write the failing tests**

Create `tests/hud/OnboardingLayer.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import { endContinuation, setIntroTarget, takeIntroTarget } from "@/experience/introContinue";
import type { ExperienceData } from "@/experience/types";
import { OnboardingLayer } from "@/hud/dialog/OnboardingLayer";
import { markOnboarded, ONBOARDED_KEY, resetFlagMemory } from "@/hud/dialog/storage";
import { cancelAllDialogs, dialog } from "@/hud/dialog/store";
import { replayTutorial, tutorialAvailable } from "@/hud/dialog/tutorial";
import { getHQStore } from "@/store/useHQStore";

// No Highlights Hall registered: the full tour goes from the try-it step straight to the elevator.
vi.mock("@/experience/hints/source", () => ({ hintItems: () => [], extraItems: () => [] }));

const data = { profile: { name: "Kurniadi Ahmad Wijaya" } } as unknown as ExperienceData;

function renderLayer() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <OnboardingLayer data={data} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  resetFlagMemory();
  getHQStore().setState({ phase: "boot", floor: "L1", ride: null, activeRoom: null });
});

afterEach(() => {
  act(() => cancelAllDialogs());
  cleanup();
  setIntroTarget(null);
  endContinuation();
  vi.useRealTimers();
});

describe("OnboardingLayer", () => {
  it("starts the full tour 600 ms after the intro hands over in the Lobby, with the first name", () => {
    renderLayer();
    act(() => void vi.advanceTimersByTime(2000));
    expect(dialog.view.id).toBeNull();
    act(() => void getHQStore().setState({ phase: "explore" }));
    act(() => void vi.advanceTimersByTime(600));
    expect(dialog.view.id).toBe("onboarding");
    expect(dialog.view.line?.key).toBe("welcome");
    expect(dialog.view.line?.text).toContain("Kurniadi");
    expect(dialog.view.line?.text).not.toContain("Wijaya");
  });

  it("stays quiet for a visitor who finished or skipped it before", () => {
    markOnboarded("done");
    renderLayer();
    act(() => void getHQStore().setState({ phase: "explore" }));
    act(() => void vi.advanceTimersByTime(1000));
    expect(dialog.view.id).toBeNull();
  });

  it("remembers a skip", async () => {
    getHQStore().setState({ phase: "explore" });
    renderLayer();
    act(() => void vi.advanceTimersByTime(600));
    await act(async () => {
      dialog.advance();
      dialog.choose("skip");
    });
    await vi.waitFor(() => expect(dialog.view.line?.key).toBe("skipped"));
    await act(async () => {
      dialog.advance();
      dialog.advance();
    });
    await vi.waitFor(() => expect(localStorage.getItem(ONBOARDED_KEY)).toBe("skipped"));
  });

  it("waits for a deep link to arrive, then runs the short tour (no Highlights Hall, no elevator)", async () => {
    setIntroTarget({ floor: "L4" });
    renderLayer();
    act(() => void getHQStore().setState({ phase: "explore" }));
    act(() => void vi.advanceTimersByTime(1000));
    expect(dialog.view.id).toBeNull();
    act(() => {
      takeIntroTarget();
      getHQStore().setState({ floor: "L4" });
      endContinuation();
    });
    act(() => void vi.advanceTimersByTime(600));
    expect(dialog.view.line?.key).toBe("welcome");
    await act(async () => {
      dialog.advance();
      dialog.choose("start");
    });
    await vi.waitFor(() => expect(dialog.view.line?.key).toBe("move"));
    await act(async () => {
      dialog.advance();
      dialog.advance();
    });
    expect(dialog.view.line?.key).toBe("point-go");
    await act(async () => {
      const rover = getHQStore().getState().rover;
      getHQStore().getState().setRover({ x: rover.x + 3 });
    });
    await act(async () => void dialog.advance());
    await vi.waitFor(() => expect(dialog.view.line?.key).toBe("moved"));
    await act(async () => {
      dialog.advance();
      dialog.advance();
    });
    await vi.waitFor(() => expect(dialog.view.line?.key).toBe("ask-rover"));
  });

  it("replays the full tour on request, even when onboarded", () => {
    markOnboarded("done");
    getHQStore().setState({ phase: "explore" });
    renderLayer();
    expect(tutorialAvailable()).toBe(true);
    act(() => {
      replayTutorial();
      vi.advanceTimersByTime(1);
    });
    expect(dialog.view.line?.key).toBe("welcome");
  });
});
```

Create `e2e/onboarding.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";
import en from "../messages/en.json";
import { collectErrors, waitForHQ, waitForPhase, waitForSceneLive } from "./hq";

/**
 * Rover's dialog (src/hud/dialog): the first-session onboarding after the boot and intro, its
 * replay, the floor lines with the walk choice and the "!" hint bubbles.
 */
test.describe.configure({ timeout: 180_000 });

export const box = (page: Page) => page.getByTestId("dialog-box");
export const choices = (page: Page) => page.getByTestId("dialog-choices");

/** Waits for Rover to show the line with this key. */
export async function expectLine(page: Page, key: string | RegExp, timeout = 30_000) {
  await expect(box(page)).toHaveAttribute("data-line", key, { timeout });
}

/**
 * Advances the current line once it has typed out (one press). Waiting first keeps it deterministic:
 * a press racing the last typed character could otherwise skip a line. The "first press completes"
 * rule is covered by the unit tests and by "pressing on does not skip a try-it step" below.
 */
export async function next(page: Page) {
  await expect(box(page)).toHaveAttribute("data-typing", "false", { timeout: 15_000 });
  await page.keyboard.press("Enter");
}

/** Ask the HQ enabled (the Ask AI pill shows), teaser already seen. */
export async function mockAsk(page: Page) {
  await page.route("**/api/ask", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: true, turnstileSiteKey: null, asOf: "2026-10-11", maxLength: 300 }) }),
  );
  await page.addInitScript(() => sessionStorage.setItem("hq:ask-teaser", "1"));
}

/** A first visit in a new session: the boot plays, Boot rover starts the intro. */
export async function freshVisit(page: Page, path = "/en") {
  await mockAsk(page);
  await page.goto(`${path}?tier=lite`);
  await waitForHQ(page);
  const start = page.getByTestId("boot").getByRole("button", { name: "Boot rover" });
  await expect(start).not.toHaveAttribute("aria-disabled", "true");
  await start.click();
  await waitForPhase(page, "intro");
}

test.describe("first-session onboarding", () => {
  test("Rover greets after the intro instead of the Ask Rover terminal, and Skip ends it for good", async ({ page }) => {
    const errors = collectErrors(page);
    await freshVisit(page);
    await waitForPhase(page, "explore", 30_000);
    await expect(box(page)).toHaveAttribute("data-dialog", "onboarding", { timeout: 15_000 });
    await expectLine(page, "welcome");
    await expect(box(page)).toContainText("Kurniadi");
    await expect(page.getByRole("dialog", { name: "Ask Rover" })).toHaveCount(0);

    await choices(page).getByRole("button", { name: en.dialog.onboarding.skip }).click();
    await expectLine(page, "skipped");
    await next(page);
    await expect(box(page)).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("hq:onboarded"))).toBe("skipped");

    await page.reload();
    await waitForHQ(page);
    await waitForPhase(page, "explore");
    await waitForSceneLive(page);
    // Proving that nothing shows: the tour would start 600 ms after explore.
    await page.waitForTimeout(1500);
    await expect(box(page)).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
```

Add to `tests/unit/e2e-plan.test.ts` (inside `describe("specsForChanges")`):

```ts
  it("maps the Rover dialog, the onboarding and the hint bubbles to the onboarding spec", () => {
    expect(specsForChanges(["src/hud/dialog/engine.ts"]).specs).toEqual(["experience", "onboarding", "walk"]);
    expect(specsForChanges(["src/experience/hints/HintProbe.tsx"]).specs).toEqual(["experience", "onboarding", "walk"]);
    expect(specsForChanges(["src/hud/walk/WalkLayer.tsx"]).specs).toEqual(["hud", "missions", "onboarding", "walk"]);
    expect(specsForChanges(["src/experience/introContinue.ts"]).specs).toEqual(["boot-first", "experience", "onboarding"]);
  });
```

- [x] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run tests/hud/OnboardingLayer.test.tsx tests/unit/e2e-plan.test.ts`
Expected: FAIL with "Failed to resolve import "@/hud/dialog/OnboardingLayer"", and the e2e-plan test fails on "knows every spec in e2e/" (`onboarding` missing from `ALL_SPECS`) and on the new mapping.

- [x] **Step 3: Write minimal implementation**

Create `src/hud/dialog/OnboardingLayer.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MissionStep } from "@/content/schema";
import { extraItems } from "@/experience/hints/source";
import { isContinuing, onContinuationChange } from "@/experience/introContinue";
import { runMissionSteps } from "@/experience/missions/bridge";
import { roverRuntime } from "@/experience/rover/runtime";
import type { ExperienceData } from "@/experience/types";
import { getHQStore, useHQStore } from "@/store/useHQStore";
import { firstName, highlightsTarget, runOnboarding, waitForRoverMove, type OnboardingCopy, type OnboardingVariant } from "./onboarding";
import { markOnboarded, onboarded } from "./storage";
import { cancelAllDialogs, say } from "./store";
import { registerTutorial } from "./tutorial";

/** Pause after the intro hands over (or a deep link arrives) before Rover speaks. */
export const START_DELAY_MS = 600;

/**
 * Starts the first-session tour once per browser: in the Lobby right after the boot and intro
 * (full), or after a deep link has ridden on to its floor or room and the drawer is closed (short).
 * Replaces the old first-visit Rover Terminal auto-open. Also the host of "Replay the tutorial".
 */
export function OnboardingLayer({ data }: { data: ExperienceData }) {
  const t = useTranslations("dialog.onboarding");
  const coarse = useHQStore((s) => s.device.coarse);
  const ready = useHQStore((s) => s.phase === "explore" && !s.ride);
  const [continuing, setContinuing] = useState(false);
  const deepLinked = useRef(false);
  const running = useRef(false);
  const name = firstName(data.profile.name);

  // The deep link target is set in Experience's layout effect, after this component rendered: sync on mount.
  useEffect(() => {
    const sync = () => {
      const now = isContinuing();
      if (now) deepLinked.current = true;
      setContinuing(now);
    };
    sync();
    return onContinuationChange(sync);
  }, []);

  const run = useCallback(
    async (variant: OnboardingVariant, replay: boolean) => {
      if (running.current) return;
      running.current = true;
      const copy: OnboardingCopy = {
        welcome: t("welcome", { name }),
        start: t("start"),
        skip: t("skip"),
        skipped: t("skipped"),
        moveFine: t("moveFine"),
        moveCoarse: t("moveCoarse"),
        pointGoFine: t("pointGoFine"),
        pointGoCoarse: t("pointGoCoarse"),
        moved: t("moved"),
        highlights: t("highlights", { name }),
        showMe: t("showMe"),
        later: t("later"),
        elevator: t("elevator"),
        askRover: t("askRover"),
        askAi: t("askAi", { name }),
        closing: t("closing"),
        closingShort: t("closingShort"),
      };
      try {
        const outcome = await runOnboarding({
          say,
          copy,
          coarse,
          variant,
          waitForMove: (signal) => waitForRoverMove(getHQStore(), signal),
          // The hall registers its stations as L1 extras, so they are found from any floor (replay).
          highlights: () => highlightsTarget(extraItems("L1")),
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

  // "Replay the tutorial" (Ask Rover, Cmd-K): stop whatever Rover says, then start over in full.
  useEffect(
    () =>
      registerTutorial(() => {
        cancelAllDialogs();
        window.setTimeout(() => void run("full", true), 0);
      }),
    [run],
  );

  useEffect(() => {
    if (!ready || continuing || running.current || onboarded()) return;
    let timer = 0;
    const attempt = () => {
      const s = getHQStore().getState();
      if (s.phase !== "explore" || onboarded() || running.current) return;
      // Let an arrival roll-on (FloorLayout.arrival) or a mission drive finish first, so the try-it step starts from rest.
      const pilot = roverRuntime.autopilot;
      if (s.mission?.status === "running" || (pilot && pilot.state !== "done")) {
        timer = window.setTimeout(attempt, START_DELAY_MS);
        return;
      }
      void run(s.floor === "L1" && !deepLinked.current ? "full" : "short", false);
    };
    timer = window.setTimeout(attempt, START_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [ready, continuing, run]);

  return null;
}
```

Modify `src/hud/Hud.tsx`: add `import { OnboardingLayer } from "./dialog/OnboardingLayer";` and, right before `{speaking && <DialogLayer />}`, add:

```tsx
      <OnboardingLayer data={data} />
```

Modify `src/experience/scene/Director.tsx`:

- Delete the imports `import { shouldAutoOpenTerminal } from "@/hud/RoverTerminal";` and `import { isContinuing } from "../introContinue";`, and drop `isAutoOpenClaimed` from the bridge import, which after point-and-go reads `import { cancelMission, goToRoom, isAutoOpenClaimed, runMissionSteps } from "../missions/bridge";` and becomes `import { cancelMission, goToRoom, runMissionSteps } from "../missions/bridge";`.
- In the greeting block, delete the comment lines starting "First visit: the Rover Terminal opens once the intro hands over" and the line `if (isAutoOpenClaimed() && !isContinuing() && shouldAutoOpenTerminal()) window.setTimeout(openTerminal, 400);`. Keep `import { openCv, openPalette, openTerminal } from "@/hud/events";` as point-and-go left it (the `terminal` and `interact` cases use all three). The block becomes:

```tsx
    // Greet once the intro hands control to the visitor (the first-session tour is OnboardingLayer's).
    if (s.phase === "explore" && (local.prevPhase === "intro" || local.prevPhase === "boot")) {
      roverRuntime.status = labels.hello;
      local.statusUntil = now + 2;
      roverRuntime.hopUntil = now + 0.35;
    }
```

Modify `src/hud/RoverTerminal.tsx`: delete `shouldAutoOpenTerminal` (the function and its doc comment); keep `TERMINAL_SEEN_KEY` and `markTerminalSeen` (MissionHud still records the first open). In `tests/hud/RoverTerminal.test.tsx`, remove `shouldAutoOpenTerminal` from the import and replace the test "auto-opens only until the terminal was seen" with:

```ts
  it("records that the terminal was seen", () => {
    markTerminalSeen();
    expect(localStorage.getItem("hq:terminal-seen")).toBe("1");
  });
```

In `tests/hud/MissionHud.test.tsx`, replace the comment `// Still unseen, so the 3D Lobby greets a first visitor with it after the intro.` with `// Nothing opens it on its own any more (the 3D tour is the Rover dialog); the key only records an open.`

Modify `e2e/hq.ts` `asReturningVisitor`:

```ts
export async function asReturningVisitor(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("hq:terminal-seen", "1");
    // The first-session tour already ran; "!" hint bubbles off so they never cover a click target.
    localStorage.setItem("hq:onboarded", "done");
    localStorage.setItem("hq:hints", "off");
    sessionStorage.setItem("hq:intro", "seen");
    if (!localStorage.getItem("hq:v1")) {
      localStorage.setItem("hq:v1", JSON.stringify({ state: { firstVisit: false, visited: [], locale: "en", sound: false }, version: 1 }));
    }
  });
}
```

and update its doc comment to: "Marks the visitor as returning: the boot and the intro already played this session (`hq:intro`), the first-session tour ran (`hq:onboarded`) and hint bubbles are off (`hq:hints`), so any route opens straight in and nothing covers the world."

In every other e2e file that sets `localStorage.setItem("hq:terminal-seen", "1")` without `asReturningVisitor` (`e2e/experience.spec.ts` lines 48, 82, 121, 136; `e2e/missions.spec.ts:14`; `e2e/ask.spec.ts:68`; `e2e/gallery.spec.ts:12`; `e2e/pageview.spec.ts:34`; `e2e/pageview-visual.spec.ts:26`; `e2e/screenshots.spec.ts:99,261`), add right after it, inside the same init script:

```ts
localStorage.setItem("hq:onboarded", "done");
```

(single-expression arrow functions such as `() => localStorage.setItem("hq:terminal-seen", "1")` become block bodies with both statements).

In `e2e/experience.spec.ts`, replace the test "the terminal opens after the intro on the first visit" with:

```ts
  test("the first visit gets Rover's tour after the intro, not the Ask Rover terminal", async ({ page }) => {
    await page.goto("/en?tier=lite");
    await waitForHQ(page);
    const start = page.getByTestId("boot").getByRole("button", { name: "Boot rover" });
    await expect(start).not.toHaveAttribute("aria-disabled", "true");
    await start.click();
    await expect(page.getByTestId("dialog-box")).toHaveAttribute("data-dialog", "onboarding", { timeout: 30_000 });
    await expect(page.getByRole("dialog", { name: "Ask Rover" })).toHaveCount(0);
  });
```

Modify `scripts/e2e-plan.ts`:

1. Add `"onboarding"` to `ALL_SPECS` between `"missions"` and `"pads"`.
2. Change the walk rule to include it:

```ts
  { test: /^src\/experience\/missions\/walks?\.ts$|^src\/hud\/walk\//, specs: ["walk", "missions", "hud", "onboarding"] },
```

3. Insert, right before the `// 3D floors.` comment:

```ts
  // Rover's dialog, the first-session tour, floor lines and the "!" hint bubbles.
  { test: /^src\/hud\/dialog\/|^src\/experience\/hints\//, specs: ["onboarding", "experience", "walk"] },
```

4. Add `"onboarding"` to the gate rule's specs: `specs: ["boot-first", "experience", "onboarding"]` (the rule matching `introContinue.ts`).

- [x] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run tests/hud/OnboardingLayer.test.tsx tests/unit/e2e-plan.test.ts tests/hud/RoverTerminal.test.tsx tests/hud/MissionHud.test.tsx`
Expected: PASS.

Run: `bun run verify:quick && bunx playwright test e2e/onboarding.spec.ts e2e/experience.spec.ts -g "tour|Rover greets|boot and intro"`
Expected: PASS (the build runs inside `verify:quick`).

- [x] **Step 5: Commit**

```bash
rtk git add src/hud/dialog/OnboardingLayer.tsx src/hud/Hud.tsx src/experience/scene/Director.tsx src/hud/RoverTerminal.tsx tests/hud/OnboardingLayer.test.tsx tests/hud/RoverTerminal.test.tsx tests/hud/MissionHud.test.tsx e2e/ scripts/e2e-plan.ts tests/unit/e2e-plan.test.ts
rtk git commit -m "feat(hud): first-session onboarding after the intro replaces the terminal auto-open"
```

---

### Task 8: Replay the tutorial and toggle hints from Ask Rover and Cmd-K

**Files:**
- Modify: `src/hud/RoverTerminal.tsx` (`extras` options)
- Modify: `src/hud/MissionHud.tsx`
- Modify: `src/hud/palette-types.ts:7`, `src/hud/search.ts:5-11`, `src/hud/index-data.ts:23-29`
- Modify: `messages/en.json`, `messages/id.json` (`hud.actions.replayTutorial`, `hud.actions.toggleHints`)
- Test: `tests/hud/RoverTerminal.test.tsx`, `tests/hud/CommandPalette.test.tsx`, `tests/hud/MissionHud.test.tsx`
- Test: `e2e/onboarding.spec.ts` (append)

**Interfaces:**
- Consumes: `replayTutorial`, `useTutorialAvailable`, `useHintsOn`, `setHintsOn`, `hintsOn` (Task 2); `dialog.menu.*` messages (Task 4); e2e helpers from Task 7.
- Produces: `interface TerminalExtra { key: string; label: string; onSelect: () => void }`, `RoverTerminalProps.extras?: readonly TerminalExtra[]` (shown after the missions, before "explore on my own"; their keys select them); `PaletteActionId` gains `"replay-tutorial" | "toggle-hints"`.

- [x] **Step 1: Write the failing tests**

Append to `tests/hud/RoverTerminal.test.tsx` (inside the top-level `describe`):

```tsx
  it("lists extra options after the missions and runs them by key or tap", async () => {
    const replay = vi.fn();
    const hints = vi.fn();
    renderTerminal({
      extras: [
        { key: "r", label: "replay the tutorial", onSelect: replay },
        { key: "h", label: "hints: on", onSelect: hints },
      ],
    });
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options.at(-3)).toContain("[r]replay the tutorial");
    expect(options.at(-2)).toContain("[h]hints: on");
    expect(options.at(-1)).toContain(en.hud.terminal.driveMyself);
    await userEvent.keyboard("r");
    expect(replay).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("option", { name: /hints: on/ }));
    expect(hints).toHaveBeenCalledTimes(1);
  });
```

In `tests/hud/CommandPalette.test.tsx`, extend `actionLabels`:

```ts
  "replay-tutorial": { en: "Replay the tutorial", id: "Putar ulang tutorial" },
  "toggle-hints": { en: "Turn hints on or off", id: "Nyalakan atau matikan petunjuk" },
```

Append to `tests/hud/MissionHud.test.tsx` (add `import { registerTutorial } from "@/hud/dialog/tutorial";` and `import { HINTS_KEY, resetFlagMemory } from "@/hud/dialog/storage";` to the imports):

```tsx
describe("MissionHud with the 3D HUD open", () => {
  it("offers replay and hints in Ask Rover only while the tutorial host is registered", async () => {
    resetFlagMemory();
    renderHud();
    act(() => openTerminal());
    expect(screen.queryByRole("option", { name: /replay the tutorial/ })).toBeNull();
    act(() => screen.getByRole("button", { name: en.hud.terminal.close }).click());
    const replay = vi.fn();
    let off = () => {};
    act(() => {
      off = registerTutorial(replay);
    });
    act(() => openTerminal());
    await userEvent.click(screen.getByRole("option", { name: new RegExp(en.dialog.menu.hintsOn) }));
    expect(localStorage.getItem(HINTS_KEY)).toBe("off");
    expect(screen.getByRole("option", { name: new RegExp(en.dialog.menu.hintsOff) })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("option", { name: new RegExp(en.dialog.menu.replay) }));
    expect(replay).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog", { name: en.hud.terminal.title })).toBeNull();
    act(() => off());
  });

  it("finds Replay the tutorial in Cmd-K while the 3D HUD is open", async () => {
    const replay = vi.fn();
    const off = registerTutorial(replay);
    renderHud();
    await userEvent.keyboard("{Control>}k{/Control}");
    await userEvent.keyboard("tutorial{Enter}");
    expect(replay).toHaveBeenCalledTimes(1);
    off();
  });
});
```

Append to `e2e/onboarding.spec.ts` (add `enterHQ` to the import from `./hq`):

```ts
test.describe("replay", () => {
  test("Ask Rover and Cmd-K replay the tour for a returning visitor", async ({ page }) => {
    await enterHQ(page);
    await page.getByRole("button", { name: "Ask Rover", exact: true }).click();
    const terminal = page.getByRole("dialog", { name: "Ask Rover" });
    await terminal.getByRole("option", { name: new RegExp(en.dialog.menu.replay) }).click();
    await expect(terminal).toBeHidden();
    await expectLine(page, "welcome");
    await expect(box(page)).toHaveAttribute("data-dialog", "onboarding");
    await choices(page).getByRole("button", { name: en.dialog.onboarding.skip }).click();
    await expectLine(page, "skipped");
    await next(page);
    await expect(box(page)).toHaveCount(0);

    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog", { name: "Command palette" });
    await palette.getByRole("combobox").fill("tutorial");
    await page.keyboard.press("Enter");
    await expectLine(page, "welcome");
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run tests/hud/RoverTerminal.test.tsx tests/hud/CommandPalette.test.tsx tests/hud/MissionHud.test.tsx`
Expected: FAIL (no `[r]` option; `actionLabels` has keys `PaletteActionId` does not know, reported by the test run as a missing label; no replay option in MissionHud).

- [x] **Step 3: Write minimal implementation**

`messages/en.json` `hud.actions` gains:

```json
      "replayTutorial": "Replay the tutorial",
      "toggleHints": "Turn hints on or off"
```

`messages/id.json` `hud.actions` gains:

```json
      "replayTutorial": "Putar ulang tutorial",
      "toggleHints": "Nyalakan atau matikan petunjuk"
```

`src/hud/palette-types.ts` line 7:

```ts
export type PaletteActionId = "view-cv" | "copy-email" | "toggle-language" | "toggle-sound" | "quick-view" | "replay-tutorial" | "toggle-hints";
```

`src/hud/search.ts` `ACTION_KEYWORDS` gains:

```ts
  "replay-tutorial": ["tutorial", "tour", "onboarding", "help", "guide", "replay", "panduan", "bantuan", "ulang"],
  "toggle-hints": ["hints", "hint", "bubbles", "tips", "petunjuk", "tips"],
```

`src/hud/index-data.ts` `ACTION_KEYS` gains:

```ts
  "replay-tutorial": "replayTutorial",
  "toggle-hints": "toggleHints",
```

`src/hud/RoverTerminal.tsx`:

1. Export the type and add the prop (after `onAsk?: () => void;` in `RoverTerminalProps`):

```ts
export interface TerminalExtra {
  /** Single lowercase key that picks it (not a digit and not `a`). */
  key: string;
  label: string;
  onSelect: () => void;
}
```

```ts
  /** Options after the missions, before "explore on my own" (3D only: replay the tutorial, hints). */
  extras?: readonly TerminalExtra[];
```

2. In `TerminalPanel`, destructure `extras = []` with the other props and replace the option bookkeeping:

```ts
  const askOffset = ask ? 1 : 0;
  const extraOffset = askOffset + missions.length;
  const optionCount = extraOffset + extras.length + 1;
```

3. Replace `choose`:

```ts
  const choose = (index: number) => {
    if (ask && index === 0) return enterAsk();
    const mission = index - askOffset;
    if (mission < missions.length) return onRun(missions[mission].id);
    const extra = index - extraOffset;
    if (extra < extras.length) return extras[extra].onSelect();
    onClose();
  };
```

4. In `onKeyDown`, right after the `if (ask && key.toLowerCase() === "a") { ... }` block, add:

```ts
    const extra = extras.findIndex((option) => option.key === key.toLowerCase());
    if (extra >= 0) {
      event.preventDefault();
      choose(extraOffset + extra);
      return;
    }
```

5. Replace the options list source and the key computation in the render:

```tsx
          {[...(ask ? [tAsk("option")] : []), ...missions.map((m) => m.label[locale]), ...extras.map((option) => option.label), t("driveMyself")].map((label, index) => {
            const selected = index === active;
            const mission = index - askOffset;
            const extra = index - extraOffset;
            const key = ask && index === 0 ? "a" : mission < missions.length ? String(mission + 1) : extra < extras.length ? extras[extra].key : "esc";
```

(the rest of the `<li>` stays as it is).

`src/hud/MissionHud.tsx`:

1. Imports:

```ts
import { useHintsOn, useTutorialAvailable } from "./dialog/hooks";
import { hintsOn, setHintsOn } from "./dialog/storage";
import { replayTutorial } from "./dialog/tutorial";
import { RoverTerminal, markTerminalSeen, type TerminalExtra } from "./RoverTerminal";
```

(the last line replaces the existing `RoverTerminal` import).

2. Below `STATIC_ACTIONS`:

```ts
/** Only while the 3D HUD is open (its OnboardingLayer hosts the replay). */
const TUTORIAL_ACTIONS: readonly PaletteActionId[] = ["replay-tutorial", "toggle-hints"];
```

3. In `MissionHud`, after `const askEnabled = ...`:

```ts
  const tutorial = useTutorialAvailable();
  const hints = useHintsOn();
  const tMenu = useTranslations("dialog.menu");
```

4. Replace the `entries` memo:

```ts
  const entries = useMemo(
    () => (index ? buildPaletteEntries(index, tutorial ? [...STATIC_ACTIONS, ...TUTORIAL_ACTIONS] : STATIC_ACTIONS) : []),
    [index, tutorial],
  );
  const extras = useMemo<TerminalExtra[]>(
    () =>
      tutorial
        ? [
            {
              key: "r",
              label: tMenu("replay"),
              onSelect: () => {
                setTerminalOpen(false);
                replayTutorial();
              },
            },
            { key: "h", label: hints ? tMenu("hintsOn") : tMenu("hintsOff"), onSelect: () => setHintsOn(!hints) },
          ]
        : [],
    [tutorial, hints, tMenu],
  );
```

5. In `runAction`, add before the closing brace of the `switch`:

```ts
      case "replay-tutorial":
        replayTutorial();
        return;
      case "toggle-hints": {
        const next = !hintsOn();
        setHintsOn(next);
        say(next ? tMenu("hintsOn") : tMenu("hintsOff"));
        return;
      }
```

6. Pass the extras to the terminal: add `extras={extras}` to `<RoverTerminal ... />`.

- [x] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run tests/hud/RoverTerminal.test.tsx tests/hud/CommandPalette.test.tsx tests/hud/MissionHud.test.tsx tests/unit/ui-copy.test.ts tests/unit/search.test.ts`
Expected: PASS.

Run: `bun run verify:quick && bunx playwright test e2e/onboarding.spec.ts -g "replay"`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
rtk git add src/hud/RoverTerminal.tsx src/hud/MissionHud.tsx src/hud/palette-types.ts src/hud/search.ts src/hud/index-data.ts messages/en.json messages/id.json tests/hud/RoverTerminal.test.tsx tests/hud/CommandPalette.test.tsx tests/hud/MissionHud.test.tsx e2e/onboarding.spec.ts
rtk git commit -m "feat(hud): replay the tutorial and toggle hints from Ask Rover and Cmd-K"
```

---
### Task 9: First-visit floor lines that end with the walk choice (one prompt, not two)

**Files:**
- Create: `src/hud/dialog/floorIntro.ts`
- Modify: `src/hud/walk/WalkLayer.tsx`
- Modify: `e2e/walk.spec.ts`, `e2e/hud.spec.ts:75`, `e2e/library-roof.spec.ts:106`, `e2e/screenshots.spec.ts:203-207,341`
- Test: `tests/unit/floor-intro.test.ts`
- Test: `e2e/onboarding.spec.ts` (append)

**Interfaces:**
- Consumes: `say`, `cancelDialog` (Task 1); `useOnboardingSettled` (Task 2); `firstName` (Task 6); `dialog.floor.*` messages (Task 4); `promptSeen`, `markPromptSeen` from `src/experience/missions/walk.ts`.
- Produces: `FLOOR_LINES: readonly FloorId[] = ["L2", "L3", "L4", "RF"]` (floors with a Rover line; L1 is the onboarding's, even after the hall adds an L1 walk), `interface FloorIntroCopy { text: string; start: string; resume: string | null; explore: string }`, `floorIntroLine(copy): DialogLine` (key `floor`, choices `start` or `resume`, then `explore` as the cancel choice); dialog request id `floor:<FloorId>`. `WalkPrompt` is no longer rendered by `WalkLayer` (it stays for the dev prototypes).

- [x] **Step 1: Write the failing tests**

Create `tests/unit/floor-intro.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import { FLOOR_LINES, floorIntroLine } from "@/hud/dialog/floorIntro";

describe("floor lines", () => {
  it("speak on L2, L3, L4 and RF only (L1 belongs to the onboarding), each with a line in messages", () => {
    expect(FLOOR_LINES).toEqual(["L2", "L3", "L4", "RF"]);
    expect(Object.keys(en.dialog.floor).sort()).toEqual([...FLOOR_LINES].sort());
  });
});

describe("floorIntroLine", () => {
  it("ends the floor line with the walk choice and Explore freely as the Esc choice", () => {
    const line = floorIntroLine({ text: "This is the Career Road.", start: "Walk my journey", resume: null, explore: "Explore freely" });
    expect(line.key).toBe("floor");
    expect(line.text).toBe("This is the Career Road.");
    expect(line.choices).toEqual([
      { id: "start", label: "Walk my journey" },
      { id: "explore", label: "Explore freely", cancel: true },
    ]);
  });

  it("offers to resume a saved walk instead of starting over", () => {
    const line = floorIntroLine({ text: "Roof.", start: "Meet me", resume: "Resume at stop 3", explore: "Explore freely" });
    expect(line.choices?.map((c) => c.id)).toEqual(["resume", "explore"]);
    expect(line.choices?.[0].label).toBe("Resume at stop 3");
  });
});
```

Append to `e2e/onboarding.spec.ts` (add `asReturningVisitor` to the import from `./hq`):

```ts
test.describe("floor lines", () => {
  test("the first visit to L2 gets one Rover line that ends with the walk choice", async ({ page }) => {
    await asReturningVisitor(page);
    await page.goto("/en/journey?tier=lite");
    await waitForHQ(page);
    await waitForPhase(page, "explore");
    await waitForSceneLive(page);
    await expect(box(page)).toHaveAttribute("data-dialog", "floor:L2", { timeout: 15_000 });
    await expect(box(page)).toContainText(en.dialog.floor.L2);
    await expect(choices(page).getByRole("button", { name: en.walk.journey.start })).toBeVisible();
    await expect(page.getByTestId("walk-prompt")).toHaveCount(0);
    await choices(page).getByRole("button", { name: en.walk.explore }).click();
    await expect(box(page)).toHaveCount(0);
    await expect(page.getByTestId("walk-launcher")).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("hq:walk-prompt") ?? "[]"))).toContain("L2");
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run tests/unit/floor-intro.test.ts`
Expected: FAIL with "Failed to resolve import "@/hud/dialog/floorIntro"".

- [x] **Step 3: Write minimal implementation**

Create `src/hud/dialog/floorIntro.ts`:

```ts
import type { FloorId } from "@/content/schema";
import type { DialogLine } from "./engine";

/** Floors whose first visit gets a Rover line ending with the walk choice. L1 is introduced by the onboarding. */
export const FLOOR_LINES: readonly FloorId[] = ["L2", "L3", "L4", "RF"];

export interface FloorIntroCopy {
  /** Rover's line about the floor (`dialog.floor.<id>`). */
  text: string;
  /** The walk's start label (`walk.<id>.start`). */
  start: string;
  /** "Resume at stop N" when an earlier walk can be resumed, else null. */
  resume: string | null;
  explore: string;
}

/** First visit to a floor: one line about it that ends with the walk choice (start or resume, or explore freely). */
export function floorIntroLine(copy: FloorIntroCopy): DialogLine {
  const go = copy.resume ? { id: "resume", label: copy.resume } : { id: "start", label: copy.start };
  return {
    key: "floor",
    text: copy.text,
    face: "arrived",
    choices: [go, { id: "explore", label: copy.explore, cancel: true }],
  };
}
```

Modify `src/hud/walk/WalkLayer.tsx`:

1. Imports: delete `import { WalkPrompt } from "./WalkPrompt";` and add:

```ts
import { FLOOR_LINES, floorIntroLine } from "@/hud/dialog/floorIntro";
import { useOnboardingSettled } from "@/hud/dialog/hooks";
import { firstName } from "@/hud/dialog/onboarding";
import { cancelDialog, say } from "@/hud/dialog/store";
```

2. In `WalkLayer`, after `const t = useTranslations("walk");` add:

```ts
  const tFloor = useTranslations("dialog.floor");
  const name = firstName(data.profile.name);
  const settled = useOnboardingSettled();
```

3. In the first-visit effect, keep every existing guard (after the hall PR it also has `|| NO_WALK_PROMPT.includes(floor)`) and add `!settled` and `!FLOOR_LINES.includes(floor)`; add `settled` to its dependencies. On `main` before the hall PR it reads:

```ts
  // First visit to a floor with a walk: once the first-session tour is settled and the rover is free, Rover introduces the floor.
  useEffect(() => {
    if (!walk || !exploring || active || !settled || !FLOOR_LINES.includes(floor) || promptSeen(floor)) return;
    const timer = window.setTimeout(() => setPrompt(floor), PROMPT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [walk, exploring, active, settled, floor]);
```

   and with the hall merged the guard line is `if (!walk || !exploring || active || !settled || !FLOOR_LINES.includes(floor) || promptSeen(floor) || NO_WALK_PROMPT.includes(floor)) return;`.

   Then add this effect right below it:

```ts
  // One prompt, not two: the floor line ends with the walk choice.
  useEffect(() => {
    if (!walk || prompt !== floor || active) return;
    const saved = walk.saved();
    const resumeIndex = saved && !saved.done && saved.stop ? walk.stops().findIndex((s) => s.id === saved.stop) : -1;
    const id = `floor:${floor}`;
    let live = true;
    void say(
      floorIntroLine({
        text: tFloor(floor, { name }),
        start: t(`${walk.definition.id}.start`),
        resume: resumeIndex > 0 ? t("resumeAt", { index: resumeIndex + 1 }) : null,
        explore: t("explore"),
      }),
      { id },
    ).then((result) => {
      if (!live || result.status === "cancelled") return;
      markPromptSeen(floor);
      setPrompt(null);
      if (result.choice === "start") void walk.start({ restart: true });
      else if (result.choice === "resume") void walk.start();
    });
    return () => {
      live = false;
      cancelDialog(id);
    };
  }, [walk, prompt, floor, active, name, t, tFloor]);
```

4. In the render tail, change `if (!walk || !state || hidden) return null;` to

```tsx
  if (!walk || !state || hidden || prompting) return null;
```

   and delete the whole `if (prompting) { ... return <WalkPrompt ... />; }` block below it. Leave the `<WalkBar ... />` return as it is (the hall PR's `launcher={promptSeen(floor) || NO_WALK_PROMPT.includes(floor) ? ...}` stays when present).

5. Update the component doc comment's first sentence to: "Guided walks in the 3D HUD: one controller per floor with a walk, the first-visit floor line (Rover's dialog, ending with the walk choice), the Walk HUD, `[` and `]` to step, and manual driving pausing the walk."

Driving away still closes the prompt as "Explore freely": the existing intents effect (after point-and-go: `move`, `interact` or `scrub`) calls `closePrompt()`, which marks the floor seen and clears `prompt`; the cleanup above then cancels the line. So clicking a glowing object while the floor line shows counts as "Explore freely" too.

Update the e2e specs that drove the old card (the floor line keeps the same button names, inside `dialog-choices`):

- `e2e/walk.spec.ts`: replace every `page.getByTestId("walk-prompt")` with `page.getByTestId("dialog-choices")`; replace each heading check with a check on the box text:
  - `await expect(prompt.getByRole("heading")).toHaveText("Walk my journey?");` becomes `await expect(page.getByTestId("dialog-box")).toContainText(en.dialog.floor.L2);`
  - `await expect(prompt.getByRole("heading")).toHaveText("Tour my projects?");` becomes `await expect(page.getByTestId("dialog-box")).toContainText(en.dialog.floor.L3);`
  - both `await expect(prompt.getByRole("heading")).toHaveText(en.walk.writing.title);` become `await expect(page.getByTestId("dialog-box")).toContainText(en.dialog.floor.L4);`
  - the `toHaveCount(0)` checks on `walk-prompt` become `await expect(page.getByTestId("dialog-box")).toHaveCount(0);`
- `e2e/hud.spec.ts:75` and `e2e/screenshots.spec.ts:341`: `page.getByTestId("walk-prompt")` becomes `page.getByTestId("dialog-choices")`.
- `e2e/library-roof.spec.ts:106`: `await expect(page.getByTestId("walk-prompt")).toHaveCount(0);` becomes `await expect(page.getByTestId("dialog-box")).toHaveCount(0);` and its comment reads "the floor line never shows over a mission's walk".
- `e2e/screenshots.spec.ts:203-207`: `const prompt = page.getByTestId("dialog-choices");` (the `toBeVisible`, screenshot and "Read my writing" click stay).

Run `git grep -n "walk-prompt" e2e` afterwards: no line may remain.

- [x] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run tests/unit/floor-intro.test.ts tests/hud/WalkBar.test.tsx tests/unit/walk.test.ts`
Expected: PASS.

Run: `bun run verify:quick && bunx playwright test e2e/onboarding.spec.ts e2e/walk.spec.ts -g "floor lines|Guided walks"`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
rtk git add src/hud/dialog/floorIntro.ts src/hud/walk/WalkLayer.tsx tests/unit/floor-intro.test.ts e2e/walk.spec.ts e2e/hud.spec.ts e2e/library-roof.spec.ts e2e/screenshots.spec.ts e2e/onboarding.spec.ts
rtk git commit -m "feat(hud): first-visit floor lines in Rover's dialog end with the walk choice"
```

---

### Task 10: The "!" hint bubble and its one-line dialogs

**Files:**
- Create: `src/hud/dialog/hintLines.ts`
- Create: `src/hud/dialog/HintLayer.tsx`
- Modify: `src/hud/Hud.tsx` (mount `HintLayer`)
- Test: `tests/unit/hint-lines.test.ts`
- Test: `tests/hud/HintLayer.test.tsx`
- Test: `e2e/onboarding.spec.ts` (append)

**Interfaces:**
- Consumes: `Interactable` (Task 5, re-exported from point-and-go's registry: `label` is one string, actions `open-room { room }`, `elevator-picker`, `teleport-picker { year }`, `command { command }`); `hintRuntime`, `setHintTarget`, `subscribeHintTarget`, `registerHintElement` (Task 5); `say`, `useDialog` (Task 1); `useHintsOn` (Task 2); `dialog.hints.*` messages (Task 4); point-and-go's intent `{ type: "interact"; item }` (`intents` from `src/experience/input/intents.ts`) and store `hover`.
- Produces: `HINT_KINDS: readonly InteractKind[]`, `HINT_OBJECTS: Readonly<Record<string, string>>` (registry id to `dialog.hints.object.<key>`), `hintObjectKey(item): string | null`, `type HintGoKey = "open" | "pickFloor" | "pickYear" | "askRover" | "browse" | "viewCv" | "go"`, `hintGoKey(item): HintGoKey`, `interface HintCopy { text: string; go: string; notNow: string }`, `hintLine(item, copy): DialogLine` (key `hint:<kind>`, choices `go`, `no`); `HintLayer({ suppressed, name })` with test id `hint-bubble` (`data-hint` = registry id, `data-kind`); dialog request id `hint:<registry id>`. The Go choice emits `{ type: "interact", item }`; nothing else runs object actions.

- [x] **Step 1: Write the failing tests**

Create `tests/unit/hint-lines.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import id from "../../messages/id.json";
import type { Interactable } from "@/experience/hints/source";
import { HINT_KINDS, HINT_OBJECTS, hintGoKey, hintLine, hintObjectKey } from "@/hud/dialog/hintLines";

const item = (over: Partial<Interactable>): Interactable => ({
  id: "L1:station:profile",
  floor: "L1",
  kind: "station",
  label: "Profile",
  at: { x: 0, z: 0 },
  bounds: { minX: -1, maxX: 1, minZ: -1, maxZ: 1 },
  action: { type: "open-room", room: "L1:profile" },
  ...over,
});

describe("hint lines", () => {
  it("has a line for every kind, every special object and every Go label, in both languages", () => {
    for (const messages of [en, id]) {
      for (const kind of HINT_KINDS) expect(messages.dialog.hints.kind[kind], kind).toBeTruthy();
      for (const key of Object.values(HINT_OBJECTS)) expect(messages.dialog.hints.object[key as keyof typeof en.dialog.hints.object], key).toBeTruthy();
      for (const key of ["open", "pickFloor", "pickYear", "askRover", "browse", "viewCv", "go"] as const) expect(messages.dialog.hints.go[key], key).toBeTruthy();
    }
  });

  it("finds the special line by the exact registry id", () => {
    expect(HINT_OBJECTS).toEqual({
      "L1:station:highlights-about": "highlights",
      "L1:kiosk:ask-rover": "askRover",
      "RF:station:cv": "cv",
      "RF:station:contact": "contact",
      "L4:door:research": "research",
      "L2:door:workshop": "workshop",
    });
    expect(hintObjectKey(item({ id: "RF:station:cv", floor: "RF", action: { type: "open-room", room: "RF:cv" } }))).toBe("cv");
    expect(hintObjectKey(item({ id: "L1:kiosk:ask-rover", kind: "kiosk", action: { type: "command", command: "terminal" } }))).toBe("askRover");
    expect(hintObjectKey(item({}))).toBeNull();
  });

  it("names the Go choice after the action", () => {
    expect(hintGoKey(item({}))).toBe("open");
    expect(hintGoKey(item({ id: "L1:pad:elevator", kind: "elevator-pad", action: { type: "elevator-picker" } }))).toBe("pickFloor");
    expect(hintGoKey(item({ id: "L2:teleporter:2021", kind: "teleporter", action: { type: "teleport-picker", year: 2021 } }))).toBe("pickYear");
    expect(hintGoKey(item({ kind: "kiosk", action: { type: "command", command: "terminal" } }))).toBe("askRover");
    expect(hintGoKey(item({ kind: "board", action: { type: "command", command: "palette:pods" } }))).toBe("browse");
    expect(hintGoKey(item({ kind: "board", action: { type: "command", command: "palette:posts" } }))).toBe("browse");
    expect(hintGoKey(item({ action: { type: "command", command: "cv" } }))).toBe("viewCv");
    expect(hintGoKey(item({ action: { type: "command", command: "unknown" } }))).toBe("go");
  });

  it("builds one line with Go and Not now", () => {
    const line = hintLine(item({ kind: "elevator-pad" }), { text: "Step on me to pick a floor.", go: "Pick a floor", notNow: "Not now" });
    expect(line).toMatchObject({ key: "hint:elevator-pad", text: "Step on me to pick a floor." });
    expect(line.choices).toEqual([
      { id: "go", label: "Pick a floor" },
      { id: "no", label: "Not now", cancel: true },
    ]);
  });
});
```

Create `tests/hud/HintLayer.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import type { Interactable } from "@/experience/hints/source";
import { setHintTarget } from "@/experience/hints/runtime";
import { intents, type Intent } from "@/experience/input/intents";
import { HintLayer } from "@/hud/dialog/HintLayer";
import { resetFlagMemory, setHintsOn } from "@/hud/dialog/storage";
import { cancelAllDialogs, dialog } from "@/hud/dialog/store";
import { getHQStore } from "@/store/useHQStore";

const pad: Interactable = {
  id: "L1:pad:elevator",
  floor: "L1",
  kind: "elevator-pad",
  label: "Elevator",
  at: { x: -22, z: 0 },
  bounds: { minX: -23.4, maxX: -20.6, minZ: -1.4, maxZ: 1.4 },
  action: { type: "elevator-picker" },
};

function renderLayer(suppressed = false) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <HintLayer suppressed={suppressed} name="Kurniadi" />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  resetFlagMemory();
  localStorage.clear();
  dialog.setInstant(true);
  getHQStore().setState({ phase: "explore", picker: null, ride: null, beam: null, mission: null, hover: null, floor: "L1" });
});

afterEach(() => {
  act(() => {
    cancelAllDialogs();
    setHintTarget(null);
  });
  cleanup();
});

describe("HintLayer", () => {
  it("shows one bubble for the picked target, opens its line on Enter, and Go hands the target to point-and-go", async () => {
    const seen: Intent[] = [];
    const off = intents.on((intent) => seen.push(intent));
    renderLayer();
    act(() => setHintTarget({ item: pad, anchor: { x: -22, y: 3.2, z: 0 } }));
    const bubble = screen.getByTestId("hint-bubble");
    expect(bubble).toHaveAttribute("data-hint", "L1:pad:elevator");
    expect(bubble).toHaveAttribute("data-kind", "elevator-pad");
    expect(bubble).toHaveAccessibleName(en.dialog.hints.bubble.replace("{label}", "Elevator"));
    act(() => void fireEvent.keyDown(document.body, { key: "Enter" }));
    expect(dialog.view.id).toBe("hint:L1:pad:elevator");
    expect(dialog.view.line?.text).toBe(en.dialog.hints.kind["elevator-pad"]);
    expect(dialog.view.line?.choices?.[0].label).toBe(en.dialog.hints.go.pickFloor);
    expect(screen.queryByTestId("hint-bubble")).toBeNull();
    await act(async () => dialog.choose("go"));
    expect(seen).toEqual([{ type: "interact", item: pad }]);
    off();
  });

  it("Not now does nothing", async () => {
    const seen: Intent[] = [];
    const off = intents.on((intent) => seen.push(intent));
    renderLayer();
    act(() => setHintTarget({ item: pad, anchor: { x: 0, y: 0, z: 0 } }));
    act(() => void fireEvent.click(screen.getByTestId("hint-bubble")));
    await act(async () => void dialog.escape());
    expect(seen).toEqual([]);
    off();
  });

  it("hides while hints are off, during walks, outside explore and while point-and-go has a target", () => {
    const view = renderLayer(true);
    act(() => setHintTarget({ item: pad, anchor: { x: 0, y: 0, z: 0 } }));
    expect(screen.queryByTestId("hint-bubble")).toBeNull();
    view.unmount();
    renderLayer();
    act(() => setHintsOn(false));
    expect(screen.queryByTestId("hint-bubble")).toBeNull();
    act(() => setHintsOn(true));
    expect(screen.getByTestId("hint-bubble")).toBeInTheDocument();
    act(() => void getHQStore().setState({ hover: { item: pad, via: "tap" } }));
    expect(screen.queryByTestId("hint-bubble")).toBeNull();
    act(() => void getHQStore().setState({ hover: null, phase: "room" }));
    expect(screen.queryByTestId("hint-bubble")).toBeNull();
  });
});
```

Append to `e2e/onboarding.spec.ts` (add `driveTo`, `padsOf`, `hoveredTarget` to the import from `./hq`):

```ts
test.describe("hint bubbles", () => {
  test("near the elevator pad a ! bubble opens Rover's line, and Pick a floor drives there and opens the picker", async ({ page }) => {
    await asReturningVisitor(page);
    await page.addInitScript(() => localStorage.setItem("hq:hints", "on"));
    await page.goto("/en?tier=lite");
    await waitForHQ(page);
    await waitForPhase(page, "explore");
    await waitForSceneLive(page);
    const lift = (await padsOf(page, "L1")).find((p) => p.kind === "elevator")!;
    await driveTo(page, { x: lift.at.x + 4, z: lift.at.z });
    const bubble = page.getByTestId("hint-bubble");
    await expect(bubble).toBeVisible({ timeout: 15_000 });
    await expect(bubble).toHaveAttribute("data-hint", "L1:pad:elevator");
    await expect(bubble).toHaveAttribute("data-kind", "elevator-pad");
    expect(await hoveredTarget(page)).toBeNull();
    await page.keyboard.press("Enter");
    await expect(box(page)).toHaveAttribute("data-dialog", "hint:L1:pad:elevator");
    await expect(box(page)).toContainText(en.dialog.hints.kind["elevator-pad"]);
    await expect(bubble).toHaveCount(0);
    await choices(page).getByRole("button", { name: en.dialog.hints.go.pickFloor }).click();
    // Point-and-go's `interact`: a short drive onto the pad, then the floor picker.
    await expect(page.getByTestId("pad-picker")).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press("Escape");

    // Hints off from Ask Rover: the bubble goes away.
    await page.getByRole("button", { name: "Ask Rover", exact: true }).click();
    await page.getByRole("dialog", { name: "Ask Rover" }).getByRole("option", { name: new RegExp(en.dialog.menu.hintsOn) }).click();
    await page.keyboard.press("Escape");
    await expect(bubble).toHaveCount(0);
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run tests/unit/hint-lines.test.ts tests/hud/HintLayer.test.tsx`
Expected: FAIL with "Failed to resolve import "@/hud/dialog/hintLines"".

- [x] **Step 3: Write minimal implementation**

Create `src/hud/dialog/hintLines.ts`:

```ts
import type { Interactable } from "@/experience/hints/source";
import type { DialogLine } from "./engine";

/** Every point-and-go kind has a generic line (`dialog.hints.kind.<kind>`, with the target's `{label}`). */
export const HINT_KINDS = ["door", "elevator-pad", "teleporter", "station", "kiosk", "board"] as const satisfies readonly Interactable["kind"][];

/** Targets with their own line (`dialog.hints.object.<key>`), by exact registry id (r4-i ids; r4-g for the hall). */
export const HINT_OBJECTS: Readonly<Record<string, string>> = {
  "L1:station:highlights-about": "highlights",
  "L1:kiosk:ask-rover": "askRover",
  "RF:station:cv": "cv",
  "RF:station:contact": "contact",
  "L4:door:research": "research",
  "L2:door:workshop": "workshop",
};

export function hintObjectKey(item: Pick<Interactable, "id">): string | null {
  return HINT_OBJECTS[item.id] ?? null;
}

export type HintGoKey = "open" | "pickFloor" | "pickYear" | "askRover" | "browse" | "viewCv" | "go";

/** Label key of the Go choice (`dialog.hints.go.<key>`), named after what point-and-go will do on arrival. */
export function hintGoKey(item: Pick<Interactable, "action">): HintGoKey {
  const action = item.action;
  switch (action.type) {
    case "open-room":
      return "open";
    case "elevator-picker":
      return "pickFloor";
    case "teleport-picker":
      return "pickYear";
    case "command":
      if (action.command === "terminal") return "askRover";
      if (action.command === "cv") return "viewCv";
      if (action.command.startsWith("palette:")) return "browse";
      return "go";
  }
}

export interface HintCopy {
  text: string;
  go: string;
  notNow: string;
}

/** The one-line dialog a "!" bubble opens: what the target is, then Go (point-and-go to it) or Not now. */
export function hintLine(item: Pick<Interactable, "kind">, copy: HintCopy): DialogLine {
  return {
    key: `hint:${item.kind}`,
    text: copy.text,
    face: "arrived",
    choices: [
      { id: "go", label: copy.go },
      { id: "no", label: copy.notNow, cancel: true },
    ],
  };
}
```

Create `src/hud/dialog/HintLayer.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { hintRuntime, registerHintElement, subscribeHintTarget } from "@/experience/hints/runtime";
import { intents } from "@/experience/input/intents";
import { useHQStore } from "@/store/useHQStore";
import { useAskPanelOpen } from "../ask/availability";
import { hintGoKey, hintLine, hintObjectKey } from "./hintLines";
import { useHintsOn } from "./hooks";
import { say, useDialog } from "./store";

const TEXT_INPUT = 'input, textarea, select, [contenteditable="true"], [contenteditable=""]';
const CONTROL = "button, a, [role='button'], summary";
const MODAL = "[role='dialog'][aria-modal='true']";

const pickedItem = () => hintRuntime.target?.item ?? null;

/**
 * The "!" bubble over the nearest point-and-go target (HintProbe moves it every frame, above the
 * target's hover label). Enter, a tap or a click opens Rover's one-line dialog about it; its Go choice
 * emits point-and-go's `interact` intent, so the rover drives there and runs the action exactly as a
 * click on the object would. Hidden while hints are off, during walks (`suppressed`), missions, rides,
 * beams, pickers, drawers, the Ask panel, while Rover is already talking, and while point-and-go has
 * a hovered or tap-selected target (its label, live text and "Go to" chip own that moment).
 */
export function HintLayer({ suppressed, name }: { suppressed: boolean; name: string }) {
  const t = useTranslations("dialog.hints");
  const on = useHintsOn();
  const target = useSyncExternalStore(subscribeHintTarget, pickedItem, () => null);
  const free = useHQStore((s) => s.phase === "explore" && !s.picker && !s.ride && !s.beam && !s.hover && s.mission?.status !== "running");
  const talking = useDialog((v) => v.id !== null);
  const askOpen = useAskPanelOpen();
  const item = on && !suppressed && free && !talking && !askOpen ? target : null;
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    registerHintElement(item ? button.current : null);
    return () => registerHintElement(null);
  }, [item]);

  const open = () => {
    if (!item) return;
    const key = hintObjectKey(item);
    const text = key ? t(`object.${key}`, { name }) : t(`kind.${item.kind}`, { label: item.label });
    void say(hintLine(item, { text, go: t(`go.${hintGoKey(item)}`), notNow: t("notNow") }), { id: `hint:${item.id}` }).then((result) => {
      if (result.choice === "go") intents.emit({ type: "interact", item });
    });
  };

  // Enter is the bubble's A press while it shows (instead of opening Ask Rover).
  useEffect(() => {
    if (!item) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (document.querySelector(MODAL)) return;
      const el = event.target instanceof Element ? event.target : null;
      if (el?.closest(TEXT_INPUT) || el?.closest(CONTROL)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      open();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  });

  if (!item) return null;
  return (
    <button
      ref={button}
      type="button"
      onClick={open}
      data-testid="hint-bubble"
      data-hint={item.id}
      data-kind={item.kind}
      aria-label={t("bubble", { label: item.label })}
      aria-keyshortcuts="Enter"
      style={{ visibility: "hidden" }}
      className="pointer-events-auto absolute top-0 left-0 z-10 grid size-11 place-items-center will-change-transform"
    >
      <span aria-hidden="true" className="hq-dialog grid size-8 place-items-center font-mono text-base font-bold text-amber motion-safe:animate-bounce">
        !
      </span>
    </button>
  );
}
```

The bubble is HTML over the canvas, so tapping it never reaches point-and-go's hit mesh (no accidental select or drive). In the jsdom test the probe never runs, so the bubble keeps `visibility: hidden`; the test reads it by test id, which ignores visibility. In the browser the probe sets `visibility: visible` once the anchor is on screen.

Modify `src/hud/Hud.tsx`: add `import { HintLayer } from "./dialog/HintLayer";` and `import { firstName } from "./dialog/onboarding";`, and mount the bubble right after `<OnboardingLayer data={data} />`:

```tsx
      <HintLayer suppressed={walking} name={firstName(data.profile.name)} />
```

- [x] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run tests/unit/hint-lines.test.ts tests/hud/HintLayer.test.tsx tests/unit/ui-copy.test.ts`
Expected: PASS.

Run: `bun run verify:quick && bunx playwright test e2e/onboarding.spec.ts -g "hint bubbles"`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
rtk git add src/hud/dialog/hintLines.ts src/hud/dialog/HintLayer.tsx src/hud/Hud.tsx tests/unit/hint-lines.test.ts tests/hud/HintLayer.test.tsx e2e/onboarding.spec.ts
rtk git commit -m "feat(hud): ! hint bubbles over point-and-go targets open Rover's one-line dialogs"
```

---

### Task 11: End-to-end coverage of every step, deep links, reduced motion and phones

**Files:**
- Test: `e2e/onboarding.spec.ts` (append)

**Interfaces:**
- Consumes: helpers `box`, `choices`, `expectLine`, `next`, `mockAsk`, `freshVisit` (Task 7); `snapshot`, `waitForRoverMove`, `waitForFloor`, `expectRenderBudget`, `driveTo`, `padsOf` from `e2e/hq.ts`; point-and-go's `visibleTarget`, `targetPoint`, `PHONE_SAFE` (`e2e/hq.ts`) and test ids `interact-go`, `point-hint`; line keys from Task 6.
- Produces: nothing new for later tasks.

- [x] **Step 1: Write the tests**

Append to `e2e/onboarding.spec.ts` (extend the import from `./hq` with `expectRenderBudget`, `snapshot`, `waitForFloor`, `waitForRoverMove`, `visibleTarget`, `targetPoint`, `PHONE_SAFE`; add `type Browser, type Locator` to the Playwright import):

```ts
type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const rect = async (locator: Locator): Promise<Box> => (await locator.boundingBox())!;

/** Shows point-and-go's one-time "Click a glowing object" hint (InteractStatus) without clicking the world. */
async function showPointHint(page: Page) {
  await page.evaluate(() =>
    (window as unknown as { __hq: { store: { getState: () => { setPointHint: (on: boolean) => void } } } }).__hq.store.getState().setPointHint(true),
  );
  await expect(page.getByTestId("point-hint")).toBeVisible();
}

/** Drives forward until the try-it step notices (2 u). */
async function driveABit(page: Page) {
  const from = (await snapshot(page)).rover;
  await page.keyboard.down("w");
  await waitForRoverMove(page, from, 2.5);
  await page.keyboard.up("w");
}

test.describe("every step of the tour", () => {
  test("each try-it step waits for the visitor, rings its HUD control and advances", async ({ page }) => {
    const errors = collectErrors(page);
    await freshVisit(page);
    await waitForPhase(page, "explore", 30_000);
    await expectLine(page, "welcome");
    await choices(page).getByRole("button", { name: en.dialog.onboarding.start }).click();

    await expectLine(page, "move");
    await expect(box(page)).toContainText(en.dialog.onboarding.moveFine);
    await expect(page.getByTestId("dialog-skip")).toHaveText(en.dialog.onboarding.skip);
    // Point-and-go's one-time hint sits in the bottom band, below the box.
    await showPointHint(page);
    expect(overlaps(await rect(box(page)), await rect(page.getByTestId("point-hint")))).toBe(false);
    await next(page);

    await expectLine(page, "point-go");
    await expect(box(page)).toContainText(en.dialog.onboarding.pointGoFine);
    await expect(page.getByTestId("dialog-try")).toBeVisible();
    // Pressing on does not skip a try-it step.
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await expect(box(page)).toHaveAttribute("data-line", "point-go");
    await driveABit(page);

    await expectLine(page, "moved");
    await next(page);

    // The Highlights Hall step shows only when the parallel plan's station is in the registry.
    await expectLine(page, /^(highlights|elevator)$/);
    if ((await box(page).getAttribute("data-line")) === "highlights") {
      await choices(page).getByRole("button", { name: en.dialog.onboarding.later }).click();
    }

    await expectLine(page, "elevator");
    await expect(page.getByTestId("onboard-spotlight")).toHaveAttribute("data-target", "elevator");
    await next(page);
    await expectLine(page, "ask-rover");
    await expect(page.getByTestId("onboard-spotlight")).toHaveAttribute("data-target", "ask-rover");
    await next(page);
    await expectLine(page, "ask-ai");
    await expect(page.getByTestId("onboard-spotlight")).toHaveAttribute("data-target", "ask-ai");
    await next(page);
    await expectLine(page, "closing");
    await next(page);

    await expect(box(page)).toHaveCount(0);
    await expect(page.getByTestId("onboard-spotlight")).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("hq:onboarded"))).toBe("done");
    expect(errors).toEqual([]);
  });

  test("a deep link rides on first, then runs the short tour, then the floor line with the walk choice", async ({ page }) => {
    await freshVisit(page, "/en/library");
    await waitForFloor(page, "L4");
    await expect(box(page)).toHaveAttribute("data-dialog", "onboarding", { timeout: 30_000 });
    await expectLine(page, "welcome");
    await choices(page).getByRole("button", { name: en.dialog.onboarding.start }).click();
    await expectLine(page, "move");
    await next(page);
    await expectLine(page, "point-go");
    // The fallback: Continue appears after 12 s without driving.
    await choices(page).getByRole("button", { name: en.dialog.continue }).click({ timeout: 20_000 });
    await expectLine(page, "moved");
    await next(page);
    await expectLine(page, "ask-rover");
    await next(page);
    await expectLine(page, "ask-ai");
    await next(page);
    await expectLine(page, "closing");
    await expect(box(page)).toContainText(en.dialog.onboarding.closingShort);
    await next(page);
    await expect(box(page)).toHaveAttribute("data-dialog", "floor:L4", { timeout: 15_000 });
    await expect(choices(page).getByRole("button", { name: en.walk.writing.start })).toBeVisible();
  });

  test("the ! bubble adds no draw calls", async ({ page }) => {
    await asReturningVisitor(page);
    await page.addInitScript(() => localStorage.setItem("hq:hints", "on"));
    await page.goto("/en?tier=lite");
    await waitForHQ(page);
    await waitForPhase(page, "explore");
    await waitForSceneLive(page);
    const lift = (await padsOf(page, "L1")).find((p) => p.kind === "elevator")!;
    await driveTo(page, { x: lift.at.x + 4, z: lift.at.z });
    await expect(page.getByTestId("hint-bubble")).toBeVisible({ timeout: 15_000 });
    await expectRenderBudget(page);
  });
});

test.describe("reduced motion", () => {
  test("lines appear whole, one press advances, and nothing pulses", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await freshVisit(page);
    await waitForPhase(page, "explore", 30_000);
    await expectLine(page, "welcome");
    await expect(box(page)).toHaveAttribute("data-typing", "false");
    await expect(box(page)).toHaveAttribute("data-motion", "still");
    await choices(page).getByRole("button", { name: en.dialog.onboarding.start }).click();
    await expectLine(page, "move");
    await expect(box(page)).toHaveAttribute("data-typing", "false");
    await page.keyboard.press("Enter");
    await expectLine(page, "point-go");
    await driveABit(page);
    await expectLine(page, "moved");
    await page.keyboard.press("Enter");
    await expectLine(page, /^(highlights|elevator)$/);
    if ((await box(page).getAttribute("data-line")) === "highlights") {
      await choices(page).getByRole("button", { name: en.dialog.onboarding.later }).click();
    }
    await expectLine(page, "elevator");
    await expect(page.getByTestId("onboard-spotlight")).toHaveAttribute("data-motion", "still");
    await context.close();
  });
});

test.describe("phone layout", () => {
  test("390x844: the box clears the joystick, boost, view controls, elevator panel and the Go chip; tap, Go and taps advance", async ({ browser }: { browser: Browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await freshVisit(page);
    await waitForPhase(page, "explore", 30_000);
    await expectLine(page, "welcome");
    await expect(page.getByTestId("boost")).toBeVisible();
    const dialog = await rect(box(page));
    expect(dialog.x).toBeGreaterThanOrEqual(0);
    expect(dialog.x + dialog.width).toBeLessThanOrEqual(390);
    expect(dialog.y + dialog.height).toBeLessThanOrEqual(844);
    for (const id of ["joystick", "boost", "view-controls", "elevator-panel"]) {
      expect(overlaps(dialog, await rect(page.getByTestId(id))), id).toBe(false);
    }
    await showPointHint(page);
    expect(overlaps(dialog, await rect(page.getByTestId("point-hint")))).toBe(false);

    await choices(page).getByRole("button", { name: en.dialog.onboarding.start }).tap();
    await expectLine(page, "move");
    await expect(box(page)).toContainText(en.dialog.onboarding.moveCoarse);
    await expect(box(page)).toHaveAttribute("data-typing", "false", { timeout: 15_000 });
    await box(page).tap();
    await expectLine(page, "point-go");
    await expect(box(page)).toContainText(en.dialog.onboarding.pointGoCoarse);

    // Point-and-go on touch, as the line teaches: the first tap selects (Go chip), the chip drives.
    const top = (await rect(box(page))).y;
    const target = await visibleTarget(page, { kinds: ["station", "kiosk", "elevator-pad"], safe: { ...PHONE_SAFE, bottom: 844 - top + 8 }, minDistance: 4 });
    const point = await targetPoint(page, target.id);
    await page.touchscreen.tap(point.x, point.y);
    const go = page.getByTestId("interact-go");
    await expect(go).toBeVisible();
    await expect(go).toHaveText(en.hud.interact.go.replace("{label}", target.label));
    expect(overlaps(await rect(box(page)), await rect(go))).toBe(false);
    await expect(page.getByTestId("hint-bubble")).toHaveCount(0);
    await expect(box(page)).toHaveAttribute("data-line", "point-go");
    const from = (await snapshot(page)).rover;
    await go.tap();
    await waitForRoverMove(page, from, 2.5);
    // Stop the drive before it arrives (arrival would open a drawer, a picker or Ask Rover and pause the line).
    await page.keyboard.press("Escape");
    await expectLine(page, "moved");

    await page.getByTestId("dialog-skip").tap();
    await expectLine(page, "skipped");
    await box(page).tap();
    if ((await box(page).count()) > 0) await box(page).tap();
    await expect(box(page)).toHaveCount(0);
    await context.close();
  });
});
```

- [x] **Step 2: Run the new tests against a fresh build**

Run: `bun run build && bunx playwright test e2e/onboarding.spec.ts`
Expected: PASS (all tests in the file, about 3 to 5 minutes on SwiftShader).

- [x] **Step 3: Fix any failure at its source**

If a test fails, fix the implementation (never loosen an assertion); the likely spots are placement classes in `src/hud/dialog/placement.ts` (phone overlap) and the pause rules in `DialogLayer.tsx` (a line hidden behind a drawer). Re-run the single failing test with `bunx playwright test e2e/onboarding.spec.ts -g "<test title>"`.

- [x] **Step 4: Run the affected suites**

Run: `bun run e2e:changed`
Expected: PASS (onboarding, experience, walk, hud, missions and the other mapped specs).

- [x] **Step 5: Commit**

```bash
rtk git add e2e/onboarding.spec.ts src/hud/dialog/
rtk git commit -m "test(e2e): onboarding steps, deep link short tour, reduced motion, phone layout, bubble budget"
```

---

### Task 12: PR screenshots of the dialog, the spotlight, a bubble and a floor line

**Files:**
- Modify: `e2e/screenshots.spec.ts`

**Interfaces:**
- Consumes: `VIEWPORTS`, `shot`, `open3DAt` (existing in `e2e/screenshots.spec.ts`); `driveTo`, `padsOf`, `waitForHQ`, `waitForPhase` from `e2e/hq.ts`.
- Produces: `screenshots/hq-onboarding-welcome-*.png`, `hq-onboarding-spotlight-*.png`, `hq-hint-bubble-*.png`, `hq-floor-line-*.png` at 1440x900, 1024x1366 and 390x844.

- [x] **Step 1: Add the captures**

Add `import en from "../messages/en.json";` to `e2e/screenshots.spec.ts` and append:

```ts
test.describe("Rover dialog", () => {
  for (const viewport of VIEWPORTS) {
    test(`3D onboarding @ ${viewport.width}x${viewport.height}`, async ({ browser }) => {
      test.setTimeout(240_000);
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
        hasTouch: viewport.touch,
        isMobile: viewport.name === "mobile",
      });
      const page = await context.newPage();
      // The boot and intro already played this session, but this browser was never onboarded.
      await page.addInitScript(() => {
        sessionStorage.setItem("hq:intro", "seen");
        localStorage.setItem("hq:terminal-seen", "1");
        localStorage.setItem("hq:hints", "on");
      });
      await page.goto(`/en?tier=${viewport.tier}`);
      await waitForHQ(page);
      await waitForPhase(page, "explore");
      await page.evaluate(() => document.fonts.ready);
      const box = page.getByTestId("dialog-box");
      await expect(box).toHaveAttribute("data-line", "welcome", { timeout: 30_000 });
      await expect(box).toHaveAttribute("data-typing", "false", { timeout: 15_000 });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: shot("hq-onboarding-welcome", viewport) });

      /** One click once the line has typed out (a click on a choice line would pick its highlighted choice). */
      const advance = async () => {
        await expect(box).toHaveAttribute("data-typing", "false", { timeout: 15_000 });
        await box.click();
      };
      await page.getByTestId("dialog-choices").getByRole("button", { name: en.dialog.onboarding.start }).click();
      await expect(box).toHaveAttribute("data-line", "move");
      await advance();
      await expect(box).toHaveAttribute("data-line", "point-go");
      await page.getByTestId("dialog-choices").getByRole("button", { name: en.dialog.continue }).click({ timeout: 20_000 });
      await expect(box).toHaveAttribute("data-line", "moved");
      await advance();
      await expect(box).toHaveAttribute("data-line", /^(highlights|elevator)$/, { timeout: 15_000 });
      if ((await box.getAttribute("data-line")) === "highlights") {
        await page.getByTestId("dialog-choices").getByRole("button", { name: en.dialog.onboarding.later }).click();
      }
      await expect(box).toHaveAttribute("data-line", "elevator");
      await expect(box).toHaveAttribute("data-typing", "false", { timeout: 15_000 });
      await page.waitForTimeout(800);
      await page.screenshot({ path: shot("hq-onboarding-spotlight", viewport) });
      await page.getByTestId("dialog-skip").click();
      await expect(box).toHaveAttribute("data-line", "skipped");
      await advance();
      await expect(box).toHaveCount(0);

      const lift = (await padsOf(page, "L1")).find((p) => p.kind === "elevator")!;
      await driveTo(page, { x: lift.at.x + 4, z: lift.at.z });
      await expect(page.getByTestId("hint-bubble")).toBeVisible({ timeout: 15_000 });
      await page.waitForTimeout(800);
      await page.screenshot({ path: shot("hq-hint-bubble", viewport) });
      await context.close();
    });

    test(`3D floor line @ ${viewport.width}x${viewport.height}`, async ({ browser }) => {
      test.setTimeout(180_000);
      const { context, page } = await open3DAt(browser, viewport, "/en/journey");
      const box = page.getByTestId("dialog-box");
      await expect(box).toHaveAttribute("data-dialog", "floor:L2", { timeout: 30_000 });
      await expect(box).toHaveAttribute("data-typing", "false", { timeout: 15_000 });
      // In-world text (troika) builds its glyphs slowly on SwiftShader.
      await page.waitForTimeout(3000);
      await page.screenshot({ path: shot("hq-floor-line", viewport) });
      await context.close();
    });
  }
});
```

- [x] **Step 2: Capture**

Run: `bun run build && SCREENSHOTS=1 bunx playwright test e2e/screenshots.spec.ts -g "Rover dialog" --workers=1`
Expected: PASS and 12 new PNG files under `screenshots/`: `hq-onboarding-welcome`, `hq-onboarding-spotlight`, `hq-hint-bubble` and `hq-floor-line`, each at 1440x900, 1024x1366 and 390x844.

- [x] **Step 3: Review the captures**

Open each new PNG and check: the box sits above the bottom band and never covers the joystick, boost, view controls or the elevator panel; the portrait shows `^_^`; the spotlight ring sits on the elevator panel; the "!" bubble floats over the call pad; on 390x844 the box text wraps within three rows. Fix placement or copy length and re-capture if any check fails.

- [x] **Step 4: Commit**

```bash
rtk git add e2e/screenshots.spec.ts
rtk git commit -m "test(screenshots): Rover dialog, tour spotlight, hint bubble and floor line captures"
```

(The PNGs are artifacts for the PR description, not committed; `screenshots/` is ignored.)

---

### Task 13: Docs, full verification and the PR

**Files:**
- Create: `docs/superpowers/plans/2026-10-12-onboarding-dialog.md` (copy of this plan)
- Modify: `README.md`, `AGENTS.md`

**Interfaces:**
- Consumes: everything above.
- Produces: the PR.

- [x] **Step 1: Copy the plan into the repo**

```bash
cp /Users/shinyq/.copilot/session-state/d439b68f-b2e6-4b77-9feb-f9099e8cd824/files/plans/r4-h-onboarding-dialog.md docs/superpowers/plans/2026-10-12-onboarding-dialog.md
```

- [x] **Step 2: Update README.md**

1. Status table, add a row after "Walkable floors 3":

```markdown
| Onboarding | Rover's dialog (handheld RPG text box), first-session tour, "!" hint bubbles, first-visit floor lines with the walk choice | Done |
```

2. In the "Try it" paragraph, replace the sentence "**Ask Rover** (top bar, or click the rover) offers guided trips;" with:

```markdown
Right after the boot and intro of your first session, Rover runs a short tour in a classic text box at the bottom of the screen (typewriter text, its face as the portrait; press Enter, Space, the round A button, click or tap to continue, or "Skip tutorial"): driving and boost, point-and-go, the Highlights Hall, the elevator and its call pads, then Ask Rover and Ask AI, each ringed while Rover talks about it. A deep link rides on to its floor first and gets a shorter tour there. Near anything you can use, a "!" bubble floats over it: press Enter or tap it for a one-line tip with a Go choice. The first time you reach L2, L3, L4 or RF, Rover introduces the floor and offers its guided walk. **Ask Rover** (top bar, or click the rover) offers guided trips, "replay the tutorial" and "hints: on/off" (also in Cmd-K);
```

3. Replace the sentence "The Rover Terminal never opens on its own over the Page View; it greets first-time visitors in the 3D Lobby after the intro, and the **Ask Rover** button opens it anywhere." with:

```markdown
The Rover Terminal never opens on its own; the **Ask Rover** button opens it anywhere, and first-time visitors in 3D get Rover's tour instead.
```

- [x] **Step 3: Update AGENTS.md**

1. "Missions and HUD", the localStorage bullet: replace "`hq:terminal-seen` (first-visit auto-open in the 3D Lobby after the intro; the Page View never opens the terminal on its own)" with "`hq:terminal-seen` (set when the terminal first opens; nothing opens it on its own any more)", add "`hq:onboarded` (`done` or `skipped`: the first-session tour ran) and `hq:hints` (`off` hides the hint bubbles)" to the list, and replace the last sentence with "Tests and screenshots that must not see the tour or the bubbles use `asReturningVisitor` (it sets `hq:onboarded=done` and `hq:hints=off`) or set `hq:onboarded` next to `hq:terminal-seen`."

2. "3D experience", the "Boot and intro" bullet: replace "and the Lobby-only first-visit terminal stays closed" with "and the first-session tour runs in its short form once the rover has arrived and the drawer is closed".

3. Add a new section after "Walkable floors: road kit and guided walks":

```markdown
## Rover dialog, onboarding and hints

- Owner request (round 4): "proper on boarding so the user have simple guidance at first (some kind like ... chat like old pokemon games)". Plan: `docs/superpowers/plans/2026-10-12-onboarding-dialog.md`.
- Engine (`src/hud/dialog/engine.ts`, pure): `say(lines | line | string, { id?, skip? })` returns `Promise<{ status: "done" | "skipped" | "cancelled", choice }>`; requests queue; a line has `text`, `key` (`data-line`), `face` (portrait emote, a `RoverFace`), `choices` (2 to 3, one may be `cancel` for Esc), `spotlight` (`data-onboard` name of a HUD control to ring) and `until` / `fallbackMs` (try-it lines that move on by themselves, with a Continue choice after the fallback). `tick(ms)` types at `CHAR_MS` (28 ms); reduced motion sets `instant`. Use the singleton from `store.ts` (`say`, `cancelDialog`, `useDialog` slice); never create another engine.
- Box (`DialogBox`, lazily loaded `DialogLayer`): non-modal `role="dialog"` named "Rover" over the canvas, `.hq-dialog` frame, JetBrains Mono, the rover face drawn by `drawFace` as the portrait, an A button (keyboard "a" stays the strafe key), Enter and Space through a window capture listener (so the game's Enter does not open Ask Rover), arrows between focused choices, a soft `blip` (`audio.play("blip")`, shares the click rate limit). It pauses and hides during boot, intro, a room drawer, the hologram, the pad picker, the Ask panel and any `aria-modal` dialog. Placement (`placement.ts`): 128 px above the bottom on fine pointers, 160 px on touch tablets, 232 px and left of the elevator panel on phones, always above the bottom band's center column (walk pill and point-and-go's `InteractStatus` Go chip and one-time hint).
- Onboarding (`onboarding.ts`, `OnboardingLayer.tsx`): once per browser after the boot and intro (full: welcome with Skip, moving with a try-it wait that teaches point-and-go (desktop: point and click a glowing object; touch: tap twice or use its Go chip; there is no click-the-floor driving), the Highlights Hall (registry extra `L1:station:highlights-about`, room `L1:highlights-about`) when it is registered, elevator and call pads, Ask Rover, Ask AI when its pill shows, closing); after a deep link, once the continuation ends and the drawer closes, the short form (no Highlights Hall, no elevator). It replaced the Director's first-visit terminal auto-open. Replay: Ask Rover "replay the tutorial" (`r`), Cmd-K "Replay the tutorial" (`registerTutorial` / `replayTutorial`, only while the 3D HUD is open).
- Floor lines: `WalkLayer` speaks `dialog.floor.<id>` on the first free moment on L2, L3, L4 and RF (`FLOOR_LINES`; never L1, which has the hall's Quick tour walk without a prompt) after the tour settled, ending with the walk choice (`floorIntroLine`); `hq:walk-prompt` remembers it; `?walk=off` turns them off. `WalkPrompt` only serves the dev prototypes now.
- Hint bubbles: `HintProbe` (in the canvas, no draw calls) picks the nearest point-and-go target within 5 u of its `at` (`nearestHint`, sticky to 6 u) from `hintItems()` (`src/experience/hints/source.ts`: `interactRuntime.items`, the only read of the registry here) and moves the HUD bubble (`HintLayer`) over `hintAnchor` (above point-and-go's hover label) every frame. Enter, a tap or a click opens `dialog.hints.kind.<kind>` (with the registry `label`) or an object line (`HINT_OBJECTS`, keyed by registry id such as `L1:pad:elevator`, `RF:station:cv`, `L1:station:highlights-about`); Go emits point-and-go's `{ type: "interact", item }`, so it drives and acts exactly like a click. No bubble during walks, missions, autopilot, rides, beams, pickers, drawers, the Ask panel, while Rover talks or while point-and-go has a hovered or tap-selected target; "hints: on/off" in Ask Rover (`h`) and Cmd-K.
- Copy: every spoken line is at most 110 characters (`tests/unit/dialog-copy.test.ts`), uses the first name from `profile.name` (`firstName`), never a literal.
- E2E: `e2e/onboarding.spec.ts` (helpers `freshVisit`, `expectLine`, `next`); `scripts/e2e-plan.ts` maps `src/hud/dialog/**` and `src/experience/hints/**` to `onboarding`, `experience` and `walk`.
```

4. "Fast verification", the `e2e:changed` bullet: after "`src/hud/drawer/**` to the drawer specs, `drawer-solid` included)" add ", `src/hud/dialog/**` and `src/experience/hints/**` to `onboarding`, `experience` and `walk`".

- [x] **Step 4: Full verification**

Run: `bun run verify:quick`
Expected: typecheck, lint, all unit tests and the build pass.

Run: `bun run e2e:full`
Expected: PASS (this work changed `e2e/hq.ts`, so the whole suite runs once).

Run: `git grep -nP "\x{2014}" -- . ':!node_modules' | head`
Expected: no output.

- [x] **Step 5: Commit and open the PR**

```bash
rtk git add docs/superpowers/plans/2026-10-12-onboarding-dialog.md README.md AGENTS.md
rtk git commit -m "docs: Rover dialog, onboarding, hint bubbles and floor lines"
rtk git push -u origin feat/onboarding-dialog
gh pr create --title "feat(hud): Rover dialog, first-session onboarding, hint bubbles and floor lines" --label screenshots --body-file - <<'BODY'
## What

Owner request: "proper on boarding so the user have simple guidance at first (some kind like ... chat like old pokemon games)".

- Rover's dialog: a handheld-RPG text box over the canvas (portrait from the rover face, typewriter, A button / Enter / Space / tap, choices, try-it steps, soft blip), one `say()` API with a queue and a `useDialog` slice. Pauses behind drawers, pickers, the Ask panel and modals.
- First-session tour right after the boot and intro (once per browser, `hq:onboarded`): welcome and Skip, driving and point-and-go (waits until you move), the Highlights Hall (when present), elevator and call pads, Ask Rover and Ask AI (spotlighted), closing. Deep links ride on first and get a short tour there. Replaces the Lobby terminal auto-open.
- "!" hint bubbles over the nearest interactive object (registry), one line each with a Go choice. Hints on/off in Ask Rover and Cmd-K.
- First-visit floor lines on L2, L3, L4 and RF that end with the walk choice (one prompt instead of the old card).
- Replay the tutorial from Ask Rover and Cmd-K.

## Tests

- Unit: engine, flags, replay bridge, onboarding script (full, short, skip, cancel, Highlights Hall missing or shown), floor line, hint selection and lines, dialog box keys and focus, onboarding layer timing, terminal extras, palette actions, blip, copy length.
- E2E `e2e/onboarding.spec.ts`: tour after a fresh intro and Skip, every try-it step, deep link short tour then floor line, replay from Ask Rover and Cmd-K, floor line with the walk choice, bubble near the elevator pad opening the picker, reduced motion, 390x844 layout, bubble render budget. Existing walk specs now drive the floor line.

## Screenshots

From the `screenshots` workflow: `hq-onboarding-welcome`, `hq-onboarding-spotlight`, `hq-hint-bubble`, `hq-floor-line` at 1440x900, 1024x1366 and 390x844.

## Notes

- Builds on point-and-go (registry, `interact` intent, `InteractStatus`); `src/experience/hints/source.ts` is the only reader of its registry here. Finds the Highlights Hall when that PR is merged.
- `asReturningVisitor` now also sets `hq:onboarded=done` and `hq:hints=off`.
BODY
```

Do not merge; the owner reviews.

---
## Self-Review

**Spec coverage (owner request and confirmed design):**

| Requirement | Task |
|---|---|
| Handheld-RPG text box at the bottom, pixel-style frame, bundled mono font, Rover face portrait, typewriter (instant under reduced motion), blinking continue arrow | 4 (`DialogBox`, `.hq-dialog`, `RoverPortrait`), 1 (`CHAR_MS`, `instant`) |
| A / Enter / Space / click / tap; first press completes, second advances; 2 to 3 choices with arrows | 1 (`advance`, `move`, `choose`), 4 (capture listener, A button, box click) |
| Accessible: non-modal dialog, live region, focus only on choices, no trap; EN and ID | 4, all copy in `messages/*` (Task 4, 8) |
| One API, `say()` taking lines or a script, with a promise and a queue; `useDialog` slice | 1 |
| No collisions with the Ask dock, walk HUD, bottom band, joystick, boost, drawers; pause behind drawers and modals | 4 (`placement.ts`, `DialogLayer` quiet rules, hint bar hidden), 11 (390x844 overlap test) |
| Onboarding after the unskippable boot and intro, once per browser (`hq:onboarded`) | 2, 6, 7 |
| Steps: welcome + Skip; moving with keys or joystick, Shift boost, point-and-go, wait or Continue; Highlights Hall with Show me / Later, skipped when missing; elevator and call pads; Ask Rover and Ask AI with spotlight; closing | 6 (script), 4 (`Spotlight`), 7 (wiring), 11 (every step e2e) |
| Replay from Ask Rover and Cmd-K | 2 (bridge), 7 (host), 8 (terminal extras, palette actions) |
| Replaces the Lobby terminal auto-open; terminal stays on its button | 7 (Director, `RoverTerminal`) |
| Deep links: intro rides on, then a short tour after arrival, then the floor line | 2 (`onContinuationChange`), 7 (`deepLinked`, autopilot wait), 11 (deep link e2e) |
| "!" bubbles: nearest only, from the registry (`interactRuntime.items`), hidden during walks, autopilot, drawers and point-and-go hover; Enter, tap or click opens a one-line dialog whose Go is point-and-go's `interact`; per-kind lines with the registry `label` and per-id overrides | 5 (probe, selection, anchor above the hover label), 10 (`HintLayer`, `hintLines`) |
| Point-and-go: moving step teaches point and click (desktop) and tap twice or the "Go to {label}" chip (touch), never the floor; no collision with `InteractStatus` | 4 (copy, 128 px placement, `InteractStatus` kept above the hint bar), 11 (point hint and Go chip overlap checks, touch Go chip drive) |
| Hints on/off in Ask Rover (and Cmd-K) | 2 (flag), 8 (toggle), 10 (e2e turns them off) |
| First visit per floor (L2, L3, L4, RF), one line ending with the walk choice, replacing the walk prompt | 9 |
| Soft blip per typed character group, respects mute | 3, 4 |
| HTML over the canvas, lazy loaded, no draw-call growth | 4 (`dynamic`), 5 (`HintProbe` renders nothing), 11 (`expectRenderBudget` with a bubble) |
| Unit, e2e, screenshots, README / AGENTS / docs, PR | 1 to 11, 12, 13 |

**Placeholder scan:** no "TBD", "TODO", "fill in" or "similar to Task N"; every code step carries its code. The only conditionals are merge-order ones with both versions written out: the `WalkLayer` guard with or without the hall's `NO_WALK_PROMPT` (Task 9) and the hall step, which the script skips when the hall is not registered (Task 6).

**Type consistency:** `say(input: SayInput, options?: SayOptions): Promise<SayResult>` (Tasks 1, 6, 7, 9, 10); `cancelDialog(id: string)` (Tasks 1, 9); `cancelAllDialogs()` (Tasks 1, 4, 7, 10); `useDialog(selector)` (Tasks 1, 4, 10); `hintItems()` and `extraItems(floor)` (Tasks 5, 7); `Interactable` always imported from `@/experience/hints/source` (Tasks 5, 6, 10); `highlightsTarget(items): HighlightsTarget | null` and `HighlightsTarget { floor; at }` (Tasks 6, 7); `firstName` from `onboarding.ts` (Tasks 6, 7, 9, 10); `setHintsOn(on)`, `hintsOn()`, `useHintsOn()` (Tasks 2, 8, 10); `registerTutorial`, `replayTutorial`, `useTutorialAvailable` (Tasks 2, 7, 8); `TerminalExtra { key; label; onSelect }` (Task 8); `floorIntroLine(FloorIntroCopy)` (Task 9); `hintLine(item, HintCopy)`, `hintGoKey(item): HintGoKey` (Task 10); point-and-go names exactly as in r4-i: `Interactable.label: string`, `InteractAction` (`teleport-picker { year }`, `command { command: string }`), `interactRuntime.items`, `extraInteractables`, `labelAnchor`, store `hover`, intent `{ type: "interact"; item }`, test ids `interact-go`, `point-hint`, e2e helpers `visibleTarget`, `targetPoint`, `PHONE_SAFE`; registry ids `L1:pad:elevator`, `L1:kiosk:ask-rover`, `RF:station:cv`, `RF:station:contact`, `L4:door:research`, `L2:door:workshop`, `L1:station:highlights-about` (Tasks 5, 6, 10, 11); line keys `welcome`, `move`, `point-go`, `moved`, `highlights`, `elevator`, `ask-rover`, `ask-ai`, `closing`, `skipped`, `floor`, `hint:<kind>` (Tasks 6, 7, 9, 10, 11, 12); request ids `onboarding`, `floor:<id>`, `hint:<object id>`; test ids `dialog-box`, `dialog-choices`, `dialog-next`, `dialog-try`, `dialog-skip`, `onboard-spotlight`, `hint-bubble`.

**Open risks:**

1. Point-and-go must be on `main` before Task 1 (the dialog sits above its `InteractStatus`, the hints read its `interactRuntime.items`, Go emits its `interact`). The Highlights Hall may land before or after: without it the hall step is skipped. Its plan file (`r4-g-highlights-hall.md`, Task 10) still writes ids `station:L1:highlights-<station>` and `{ en, id }` labels; the agreed ids are `L1:station:highlights-<station>` with string labels, and the onboarding also matches the room `L1:highlights-about`, so either spelling works, but the `highlights` object line in `HINT_OBJECTS` needs the agreed id.
2. Returning visitors from before this release have no `hq:onboarded`, so they see the tour once (skippable). Visitors who already saw a floor's walk prompt (`hq:walk-prompt`) do not get that floor's line.
3. Enter now advances Rover's line and, while a bubble shows, opens the hint instead of Ask Rover; the Ask Rover button, `a` in the terminal and Cmd-K are unchanged. Keyboard "a" stays the strafe key, so the "A" press is the on-screen button.
4. SwiftShader e2e timing: the tour types at 28 ms per character and the try-it fallback is 12 s; tests wait on `data-typing` and `data-line`, never on time, and the deep link test uses the fallback on purpose. The Highlights Hall step is asserted only when it appears.
5. `asReturningVisitor` turns hints off for the whole suite so a bubble never covers a click target in older specs; only `e2e/onboarding.spec.ts` and the screenshots exercise bubbles.
6. Merge conflicts: `WalkLayer.tsx` (point-and-go: `interact` closes the prompt; hall: `NO_WALK_PROMPT`), `Hud.tsx` (point-and-go: `InteractStatus` line), `Director.tsx` (point-and-go imports) and `e2e/hq.ts` are edited by all three plans; Tasks 4, 7 and 9 say which lines to keep.

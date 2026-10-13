# Motion setting and "Classic site" rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let visitors override the OS reduced-motion flag (System / Full / Reduced) across the 3D HQ and the HTML pages, and rename the user-facing "Page view" to "Classic site" ("Situs klasik").

**Architecture:** One persisted store preference `motion` (localStorage `hq:v1`, version 2) resolves the existing `reducedMotion` flag (`resolveReducedMotion` in `src/lib/motion.ts`), so every 3D consumer keeps reading `reducedMotion`. The inline head script sets `html[data-motion]` before first paint from the same storage, and the CSS reduce rules plus Tailwind's `motion-safe` / `motion-reduce` variants honor that attribute. The HUD gets a small motion popover beside Sound (a fieldset of native radios; inline in the phone menu), three Cmd-K actions and a one-time Rover line when the OS reduces motion. The rename is copy only: message values, test names, docs; ids, routes, test ids and class names stay.

**Tech Stack:** Next.js 16 static export, React 19, zustand 5 persist, Tailwind v4, next-intl, Vitest, Playwright.

## Global Constraints

- No em dashes anywhere (a unit test scans the repo).
- Every user-facing string in EN and ID (`messages/en.json`, `messages/id.json`, identical keys).
- Spoken Rover lines at most 110 characters (`tests/unit/dialog-copy.test.ts`).
- Do not rename internal identifiers, routes, `data-testid="page-view"`, CSS classes.
- Opposite button keeps its wording: it reads "Back to 3D" / "Kembali ke 3D" today (`hud.back3d`); the unused `hud.explore3d` ("Explore in 3D" / "Jelajahi dalam 3D") stays reserved.
- 1024 px top bar stays one row and clear of the profile card in EN and ID with both "⌘K" and "Ctrl K" (`e2e/hud.spec.ts`).
- JS budgets: Page View script under 240 KB (about 203 KB today), 3D chunk under 450 KB per tier (388 lite, 412 full). Report deltas.
- E2E port 4445 (`E2E_PORT=4445`), never 4173.
- No colored edge stripes; reuse `.glass .glass-solid`, the LangToggle segment style.

## File map

| File | Responsibility |
|---|---|
| `src/lib/motion.ts` (new) | `MotionPref`, `isMotionPref`, `resolveReducedMotion`, `MOTION_ATTR`, `applyMotionAttr`, `storedMotion` (self-contained, inlined in the head script), hint flag `MOTION_HINT_KEY` helpers |
| `src/store/useHQStore.ts` | `motion`, `systemReducedMotion`, `setMotion`, `setReducedMotion` now records the OS flag; persist version 2 with `migrate` and `merge` |
| `src/lib/boot-first.ts` | head script sets `data-motion` |
| `src/app/globals.css`, `landing.css`, `pageview.css` | `@custom-variant motion-reduce / motion-safe`, reduce blocks also under `[data-motion="reduced"]`, never under `[data-motion="full"]` |
| `src/hud/MotionControl.tsx` (new) | `MotionChoices` (fieldset of 3 native radios) and `MotionMenu` (icon trigger + popover) |
| `src/hud/Controls.tsx` | mount `MotionMenu` beside Sound (TopBar), `MotionChoices` in the phone menu |
| `src/hud/RoverTerminal.tsx` | typing animation follows the effective preference |
| `src/hud/palette-types.ts`, `search.ts`, `index-data.ts`, `MissionHud.tsx` | actions `motion-system`, `motion-full`, `motion-reduced` |
| `src/hud/dialog/MotionHintLayer.tsx` (new), `src/hud/Hud.tsx` | one-time Rover line with "Full motion" / "Keep reduced" |
| `messages/*.json` | `hud.motion.*`, `hud.actions.motion*`, `dialog.motion.*`, rename values |
| `e2e/hq.ts` | `asReturningVisitor` marks the motion hint seen |
| `e2e/motion.spec.ts` (new), `scripts/e2e-plan.ts` | e2e for the setting and the hint, mapped paths |
| tests | `tests/unit/motion.test.ts`, store persistence, boot-first, Controls, palette |
| docs | README, AGENTS.md, specs 02 and 04, design spec note |

---

### Task 1: Motion preference core (store, resolver, head script, CSS)

**Files:**
- Create: `src/lib/motion.ts`, `tests/unit/motion.test.ts`
- Modify: `src/store/useHQStore.ts`, `src/lib/boot-first.ts`, `src/experience/Experience.tsx`, `src/app/globals.css`, `src/app/landing.css`, `src/app/pageview.css`, `tests/unit/boot-first.test.ts`, store tests

**Interfaces (produces):**
```ts
export type MotionPref = "system" | "full" | "reduced";
export const MOTION_PREFS: readonly MotionPref[];
export const MOTION_ATTR = "data-motion";
export function isMotionPref(v: unknown): v is MotionPref;
export function resolveReducedMotion(pref: MotionPref, systemReduced: boolean): boolean; // system ? os : pref === "reduced"
export function applyMotionAttr(pref: MotionPref, root?: HTMLElement): void; // sets "full" | "reduced", removes on "system"
export function storedMotion(raw: string | null): "full" | "reduced" | null; // self-contained, parses hq:v1
// store
motion: MotionPref; systemReducedMotion: boolean; reducedMotion: boolean (derived)
setMotion(pref: MotionPref): void; setReducedMotion(systemReduced: boolean): void // records the OS flag
```

- [ ] Step 1: unit tests for `resolveReducedMotion` (6 cases), `storedMotion` (valid, system, garbage JSON, null), store: default `system`, `setMotion("full")` with OS reduce gives `reducedMotion false`, persisted JSON has `motion` and `version: 2`, a v1 payload (`{state:{visited,firstVisit,locale},version:1}`) migrates to `motion: "system"` keeping `visited`, an invalid stored motion falls back to `system`.
- [ ] Step 2: run `bunx vitest run tests/unit/motion.test.ts`, expect FAIL (module missing).
- [ ] Step 3: implement `src/lib/motion.ts`; store: `persist` `version: 2`, `migrate: (s) => ({ ...s, motion: "system" })` for v1, `merge` validates `motion` and recomputes `reducedMotion`; `partialize` adds `motion`; `setMotion` calls `applyMotionAttr`. Initial `systemReducedMotion` reads `prefersReducedMotion()` (guarded) so the Page View store is right too.
- [ ] Step 4: head script: `var m=(${storedMotion})(localStorage.getItem("hq:v1"));if(m)d.setAttribute("data-motion",m);` (in a try), before the boot decision so every page gets it. Unit test asserts the script contains `data-motion` and runs it in a fake DOM.
- [ ] Step 5: CSS. In `globals.css` after `@import "tailwindcss"`:
```css
@custom-variant motion-reduce {
  :root[data-motion="reduced"] & { @slot; }
  @media (prefers-reduced-motion: reduce) { :root:not([data-motion="full"]) & { @slot; } }
}
@custom-variant motion-safe {
  :root[data-motion="full"] & { @slot; }
  @media (prefers-reduced-motion: no-preference) { :root:not([data-motion="reduced"]) & { @slot; } }
}
```
Each `@media (prefers-reduced-motion: reduce) { rules }` block becomes `@variant motion-reduce { rules }` where the selector is a descendant of `html`; the `html { scroll-behavior }` rule gets `:root[data-motion="reduced"]` and `:root:not([data-motion="full"])` forms. Verify the compiled CSS in `out/_next/static/chunks/*.css`.
- [ ] Step 6: run unit tests, typecheck; commit `feat(motion): System, Full and Reduced motion preference with an html[data-motion] override`.

### Task 2: HUD control, palette actions, terminal

**Files:** Create `src/hud/MotionControl.tsx`, `tests/hud/MotionControl.test.tsx`; modify `src/hud/Controls.tsx`, `src/hud/RoverTerminal.tsx`, `src/hud/palette-types.ts`, `src/hud/search.ts`, `src/hud/index-data.ts`, `src/hud/MissionHud.tsx`, `tests/hud/CommandPalette.test.tsx`, `tests/hud/Controls.test.tsx`, messages.

**Interfaces:** `MotionChoices({ idPrefix? })`: `<fieldset>` with `<legend>` "Motion" / "Gerak", 3 native radios (`name` unique per instance), labels "System / Full / Reduced" and "Sistem / Penuh / Dikurangi", checked segment `bg-cyan/15 text-cyan` (LangToggle style), focus ring via `has-[:focus-visible]`. `MotionMenu()`: 44 px glass icon button (`aria-label` "Motion", `aria-expanded`, `aria-controls`, `data-onboard="motion"`, `data-testid="motion-menu"`), popover `glass glass-solid` under it with a one-line description and `MotionChoices`; Esc and outside pointerdown close it and return focus. Palette ids `motion-system | motion-full | motion-reduced` with keywords (motion, animation, reduce, gerak, animasi).

- [ ] Step 1: Testing Library test: radios render with names in EN, picking Full calls the store, Esc closes the popover, focus returns to the trigger.
- [ ] Step 2: implement; mount `MotionMenu` after `SoundToggle` in `TopBar`, `MotionChoices` in `MobileMenu`'s panel.
- [ ] Step 3: palette actions in `STATIC_ACTIONS` (Page View and 3D) with a toast "Motion: Full" etc.
- [ ] Step 4: `RoverTerminal` animates unless `resolveReducedMotion(store motion, OS)`.
- [ ] Step 5: unit tests, lint; commit `feat(hud): Motion control beside Sound, in the phone menu and in Cmd-K`.

### Task 3: one-time hint

**Files:** Create `src/hud/dialog/MotionHintLayer.tsx`; modify `src/hud/Hud.tsx`, `src/lib/motion.ts` (`motionHintSeen`, `markMotionHintSeen`, key `hq:motion-hint`), `e2e/hq.ts` (`asReturningVisitor` sets `hq:motion-hint=seen`), messages `dialog.motion.{ask,full,keep,on,kept}`, `tests/unit/dialog-copy.test.ts` (scan `dialog.motion`).

Behavior: when the phase is `explore`, no ride, the tour is settled (`useOnboardingSettled`), `systemReducedMotion` and `motion === "system"` and the flag is unset, wait `START_DELAY_MS`, then `say({ key: "motion-hint", text, choices: [{ id: "full", label }, { id: "keep", label, cancel: true }] }, { id: "motion" })`. Any resolution marks the flag; `full` calls `setMotion("full")` and says the `on` line with `spotlight: "motion"`. Never on the Page View (the layer lives in the 3D HUD) and never during boot or intro (phase gate).

- [ ] Step 1: implement, unit copy test; commit with Task 2 group.

### Task 4: e2e

**Files:** Create `e2e/motion.spec.ts`; modify `scripts/e2e-plan.ts` (map `src/lib/motion.ts`, `src/hud/MotionControl.tsx`, `src/hud/dialog/MotionHintLayer.tsx` to `motion`), `e2e/hud.spec.ts` stays as is.

Tests (all `?tier=lite`, `page.emulateMedia({ reducedMotion: "reduce" })` where stated):
1. OS reduce + System: ride L1 to L2, `lastRide.distinctY <= 2`.
2. OS reduce, pick Full in the popover: `html[data-motion=full]`, store `reducedMotion false`, ride L1 to L3 `lastRide.distinctY >= 12`; reload keeps Full and the boot cover script sets the attribute before hydration.
3. No OS flag, pick Reduced: ride shows the cut.
4. Hint: OS reduce, fresh flag: line `motion-hint` shows; "Full motion" sets Full; reload: no hint. Second context: Esc ("Keep reduced") persists, reload shows no hint, still reduced.
5. Holograms animate under Full: open a hero pod's architecture view and see packets move (or `__hq` probe) with OS reduce + Full.
6. axe on the open popover and on the phone menu.

- [ ] Step 1: write the spec, build, run `E2E_PORT=4445 bunx playwright test e2e/motion.spec.ts`.

### Task 5: rename "Page view" to "Classic site"

**Files:** `messages/en.json`, `messages/id.json` (`hud.pageView`, `hud.canvasDescription`, `hud.staticNotice`, `hud.constructionHint`, `directoryIntro`, dev `sheetTitle`), tests that query the name (`e2e/experience.spec.ts`, `e2e/screenshots.spec.ts`, `tests/hud/*`), README, AGENTS.md, specs (`agent-hq/02`, pageview revamp note), comments that quote the label (`BootCard.tsx`, `PageViewIcon.tsx`, `Controls.tsx`).

- [ ] Step 1: change values: EN "Classic site", hint "Show this page as a classic website, without the 3D tower"; ID "Situs klasik", "Tampilkan halaman ini sebagai situs klasik, tanpa menara 3D"; notices "Showing the classic site." / "Situs klasik dibuka."; construction hint "Open this floor on the classic site" / "Buka lantai ini di situs klasik"; directory intro "Every floor also has a classic site page." / "Setiap lantai juga punya halaman di situs klasik."; canvas description last sentence "Classic site shows the portfolio as a regular website." / "Situs klasik menampilkan portofolio sebagai situs biasa."
- [ ] Step 2: grep for leftover user-facing "Page view" / "Tampilan halaman"; update tests by name.
- [ ] Step 3: measure the top bar at 1024 (EN, ID, Mac, Windows) and capture before/after shots at 390, 1024, 1440.
- [ ] Step 4: commit `feat(copy): rename Page view to Classic site (Situs klasik)` plus docs commit.

### Task 6: verification and PR

- [ ] `bun run verify:quick`, `E2E_PORT=4445 bun run e2e:changed`, `E2E_PORT=4445 bun run e2e:perf e2e/perf/bytes-3d.spec.ts` (3D bytes), Page View gzip of `/en` scripts before and after.
- [ ] Push, open the PR, wait for "Typecheck, lint, unit tests", "Build, CV and e2e", "Lighthouse CI", "3D perf gates"; fix until green; do not merge.

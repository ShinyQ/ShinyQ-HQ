# Phone-First 3D, Part 2 Implementation Plan

Status: shipped in #346 (15ec117), 2026-10-29

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On a phone, Rover's choiceless lines never hide the rover or a control, titles and names on L2 to RF are readable from where a visitor stops, and no visible text asks a touch visitor to press a key, while the 3D first frame and both session totals go down or stay equal.

**Architecture:** Spec `docs/superpowers/specs/2026-10-28-phone-first-3d-part-2-design.md` (approved 2026-10-28). The phone toast moves to the top with pure CSS orientation variants; key hints become a `Kbd` chip hidden on coarse pointers plus `aria-keyshortcuts`, with touch strings for key-only hint lines; the phone menu's sheet body moves into a lazy chunk that pays for the main-path additions; a pure reading test projects every L2 to RF title and name from its reading pose, and failing labels get phone zone views or portrait-only font sizes.

**Tech Stack:** Next.js 16 static export, React 19, react-three-fiber with troika text, zustand, next-intl, Tailwind 4.3 (`portrait:`, `landscape:`, `pointer-coarse:` variants), Vitest, Playwright, Bun.

## Global Constraints

- No em dashes (U+2014) anywhere: code, comments, copy, docs, commits, PR text.
- Every user-facing string is `{ en, id }` or a key in both `messages/en.json` and `messages/id.json`; new keys never go into `LAYOUT_NAMESPACES` (`/en/quick` is at its HTML budget).
- Desktop poses, sizes and copy stay bit-identical; tablets change only the key caps rule.
- B1 files are not touched (the living machine work is in flight).
- 3D first frame and both session totals: measured delta at most 0 against main; no existing cap rises. The only new cap is `BYTES_3D_BUDGET.menu` = measured + 614 B.
- Reading rule: titles and names at least 10 CSS px tall at 390 x 844 and at least 9 CSS px at 375 x 667 (camera class `mobile`), from the reading pose; fine print is exempt.
- Toast: at 390 x 844, 375 x 667 and 844 x 390 the floor line box intersects none of the rover, joystick, Boost, Reset view, floor chip, Ask, menu and minimap, and shows unclamped.
- `rtk` for git; conventional commits; `useDispose` after memoized geometry/material; `useFrame` only.

## File map

| File | Change |
|---|---|
| `src/hud/dialog/placement.ts` | `TOAST_PLACE` (top toast, orientation variants) replaces `DIALOG_PLACE.phone` |
| `src/hud/dialog/DialogBox.tsx` | picks `TOAST_PLACE`; `line-clamp-3` |
| `src/hud/Kbd.tsx` (new) | key cap hidden on coarse pointers |
| `src/hud/ViewControls.tsx`, `src/hud/menu/HudMenu.tsx`, `src/hud/HologramOverlay.tsx`, `src/hud/drawer/RoomDrawer.tsx`, `src/hud/HudLaunchers.tsx`, `src/hud/RoverTerminal.tsx`, `src/hud/CommandPalette.tsx`, `src/hud/pads/PadPicker.tsx`, `src/hud/settings/{registry,SettingsPanel}.tsx` | key split, touch strings |
| `messages/en.json`, `messages/id.json` | shorter labels, 4 touch keys |
| `src/hud/menu/MenuSheet.tsx` (new), `src/hud/menu/menuChunk.ts` (new) | lazy sheet body and its loader |
| `src/experience/Experience.tsx` | `__hq.menu.load` |
| `e2e/budgets.ts`, `e2e/perf/bytes-3d.spec.ts` | `menu` cap and measurement |
| `src/experience/floors/{career,labs,library,roof}/readable.ts` (new) | pure label lists per floor |
| `tests/helpers/phone-camera.ts` (new) | settled poses and projection, shared with `arrivals.test.ts` |
| `tests/unit/phone-reading.test.ts` (new) | the reading rule |
| floor label sources and view zones | phone fixes |
| `tests/unit/{placement,key-hints,menu-chunk-graph}.test.ts` (new) | unit gates |
| `e2e/phone-first.spec.ts` | toast, menu and wording checks |
| docs | `hud-and-drawer.md`, `floors.md`, `styling-and-i18n.md`, `performance.md`, `docs/features.md`, `docs/decisions/2026-10-28-phone-first-3d-part-2.md` |

---

### Task 1: Top toast

**Files:**
- Modify: `src/hud/dialog/placement.ts`, `src/hud/dialog/DialogBox.tsx`
- Test: `tests/unit/placement.test.ts` (new), existing `tests/hud/*DialogBox*`

**Interfaces:**
- Produces: `TOAST_PLACE: string` in `placement.ts`; `DIALOG_PLACE` keeps keys `bottom` and `raised` only (type `Record<Exclude<DialogPlacement, "phone">, string>`).

- [ ] **Step 1: Failing test** `tests/unit/placement.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DIALOG_PLACE, DOCK_PLACE, TOAST_PLACE, dialogPlacement } from "@/hud/dialog/placement";

describe("dialog placement", () => {
  it("puts a phone's choiceless line at the top: below the minimap row in portrait, between the chip and the buttons in landscape", () => {
    expect(TOAST_PLACE).toContain("portrait:top-[calc(144px+env(safe-area-inset-top))]");
    expect(TOAST_PLACE).toContain("landscape:top-[calc(16px+env(safe-area-inset-top))]");
    expect(TOAST_PLACE).toContain("landscape:left-[184px]");
    expect(TOAST_PLACE).toContain("landscape:right-[128px]");
    expect(TOAST_PLACE).not.toMatch(/bottom-/);
  });
  it("keeps the docked card, tablets and desktops as they are", () => {
    expect(DOCK_PLACE).toBe("bottom-[calc(12px+env(safe-area-inset-bottom))] left-3 right-3");
    expect(Object.keys(DIALOG_PLACE).sort()).toEqual(["bottom", "raised"]);
    expect(dialogPlacement("mobile", true)).toBe("phone");
    expect(dialogPlacement("tablet", true)).toBe("raised");
    expect(dialogPlacement("mobile", false)).toBe("bottom");
  });
});
```

- [ ] **Step 2:** `bunx vitest run tests/unit/placement.test.ts` fails (no `TOAST_PLACE`).
- [ ] **Step 3: Implement** in `placement.ts`:

```ts
export const DIALOG_PLACE: Record<Exclude<DialogPlacement, "phone">, string> = {
  bottom: "bottom-[128px] left-1/2 w-[min(640px,calc(100%-2rem))] -translate-x-1/2",
  raised: "bottom-[160px] left-1/2 w-[min(560px,calc(100%-2rem))] -translate-x-1/2",
};

/**
 * A phone's choiceless line (owner decision 2026-10-28): a top toast, never over the rover, Boost or the joystick.
 * Portrait: full width below the minimap row (64 + 72 px, plus a gap). Landscape: at the top, between the floor
 * chip (its widest name, EN and ID) and the Ask and menu buttons, which also clears the minimap under them.
 */
export const TOAST_PLACE =
  "left-3 right-3 portrait:top-[calc(144px+env(safe-area-inset-top))] landscape:top-[calc(16px+env(safe-area-inset-top))] landscape:left-[184px] landscape:right-[128px]";
```

In `DialogBox.tsx`: `${docked ? DOCK_PLACE : toast ? TOAST_PLACE : DIALOG_PLACE[placement as "bottom" | "raised"]}` and `line-clamp-3` for `line-clamp-2`; update the doc comment (three rows).
- [ ] **Step 4:** Measure the floor chip's widest name at 844 x 390 in EN and ID (`FloorChip` on each floor, `getBoundingClientRect().right`) and the Ask pill's left edge; adjust `left-[184px]` / `right-[128px]` so each clears by at least 8 px. Run `bunx vitest run tests/unit/placement.test.ts tests/hud`.
- [ ] **Step 5:** Commit `feat(phone): top toast for Rover lines without choices`.

### Task 2: Touch wording and `Kbd`

**Files:**
- Create: `src/hud/Kbd.tsx`
- Modify: `ViewControls.tsx`, `menu/HudMenu.tsx`, `HologramOverlay.tsx`, `drawer/RoomDrawer.tsx`, `HudLaunchers.tsx`, `RoverTerminal.tsx`, `CommandPalette.tsx`, `pads/PadPicker.tsx`, the settings registry (`soundKbd`) and `SettingsPanel.tsx`, `messages/*.json`
- Test: `tests/unit/key-hints.test.ts` (new), `tests/hud/*`

**Interfaces:**
- Produces: `Kbd({ children, className? })`; `KEY_HINT = "pointer-coarse:hidden"`; `SettingDef.hintKbd?: string`.

- [ ] **Step 1: Failing test** `tests/unit/key-hints.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const en = JSON.parse(readFileSync("messages/en.json", "utf8"));
const id = JSON.parse(readFileSync("messages/id.json", "utf8"));
/** Strings shown only to fine pointers or only to screen readers keep their keys (spec 4.3). */
const FINE_ONLY = new Set(["hud.hintFine", "hud.canvasDescription", "dialog.onboarding.moveFine", "hud.terminal.hint", "hud.palette.hint", "hud.palette.close", "hud.pads.floorHint", "hud.pads.yearHint", "hud.pads.consoleHint", "hud.hologram.hint", "hud.lightbox.hint", "hud.back3dHint", "hud.drawer.readmeHint"]);
const KEY = /\((?:[A-Z0-9])\)|\b(?:key|tombol) [A-Z]\b|\bEsc\b|\bEnter\b|\barrows?\b|\bpanah\b/;

function walk(node: unknown, path: string[], out: [string, string][]) {
  if (typeof node === "string") out.push([path.join("."), node]);
  else if (node && typeof node === "object") for (const [k, v] of Object.entries(node)) walk(v, [...path, k], out);
}

describe("touch wording", () => {
  for (const [name, messages] of [["en", en], ["id", id]] as const) {
    it(`${name}: no visible string outside the fine-only list names a key`, () => {
      const all: [string, string][] = [];
      walk(messages, [], all);
      const offenders = all.filter(([key, value]) => !FINE_ONLY.has(key) && KEY.test(value));
      expect(offenders).toEqual([]);
    });
  }
  it("adds the touch hints in both locales", () => {
    for (const m of [en, id]) for (const k of ["floorHintTouch", "yearHintTouch", "consoleHintTouch"]) expect(m.hud.pads[k]).toBeTruthy();
    for (const m of [en, id]) expect(m.hud.hologram.hintTouch).toBeTruthy();
  });
});
```

(Adjust the `FINE_ONLY` paths to the real key paths found with `grep -n` before running; the list is exactly the strings the spec keeps.)
- [ ] **Step 2:** Run it; it fails on `rotateLeft`, `rotateRight`, `reset`, the sound hint and the missing touch keys.
- [ ] **Step 3: Implement.**
  - `src/hud/Kbd.tsx`:

```tsx
/** A key cap (the HUD's one style), hidden on a coarse pointer (owner decision 2026-10-28): touch visitors never see keys. */
export const KEY_HINT = "pointer-coarse:hidden";
export function Kbd({ children, className = "" }: { children: string; className?: string }) {
  return <kbd aria-hidden="true" className={`label rounded border border-glass-border px-1.5 py-0.5 text-ink-3 ${KEY_HINT} ${className}`}>{children}</kbd>;
}
```

  - Messages (EN / ID): `hud.view.rotateLeft` "Rotate left" / "Putar ke kiri"; `rotateRight` "Rotate right" / "Putar ke kanan"; `reset` "Reset view" / "Atur ulang tampilan"; settings sound hint "Off mutes everything." / "Mati membisukan semuanya."; new `hud.pads.floorHintTouch` "Tap a floor to ride there." / "Ketuk lantai untuk naik ke sana."; `yearHintTouch` "Tap a year to beam there." / "Ketuk tahun untuk pindah ke sana."; `consoleHintTouch` "Tap a year to beam there, or go back to the elevator." / "Ketuk tahun untuk pindah ke sana, atau kembali ke lift."; hologram `hintTouch` "Projects: Previous or Next · Back: the Back button" / "Proyek: Sebelumnya atau Berikutnya · Kembali: tombol Kembali".
  - `ViewControls`: buttons get `aria-keyshortcuts="Q"`, `"0"`, `"E"`; `title={`${t("rotateLeft")} (Q)`}` (desktop tooltip keeps the key). `ResetView`: `aria-keyshortcuts="0"`, title stays the label plus " (0)".
  - `HudMenu`: actions carry `kbd?: string`; render `{a.label}{a.kbd && <Kbd className="ml-auto">{a.kbd}</Kbd>}` and `aria-keyshortcuts={a.kbd}` for rotate (Q, E) and map (N).
  - `HologramOverlay`: the Back `<kbd>` becomes `<Kbd>Esc</Kbd>`; the sr-only hint uses `hintTouch` when `useHQStore((s) => s.device.coarse)`.
  - `RoomDrawer`: both `<kbd>t</kbd>` become `<Kbd>t</Kbd>`.
  - `HudLaunchers`: append `KEY_HINT` to the search key chip class.
  - `RoverTerminal` and `CommandPalette` footers: add `pointer-coarse:hidden` to `hidden sm:block`.
  - `PadPicker`: `const coarse = useHQStore((s) => s.device.coarse);` and `t(coarse ? "pads.floorHintTouch" : "pads.floorHint")`, same for year and console.
  - Settings: the sound def gets `hintKbd: "M"`; `RowText` and the fieldset hint render `{t(def.hintKey)}{def.hintKbd && <> <Kbd>{def.hintKbd}</Kbd></>}`.
- [ ] **Step 4:** `bunx vitest run tests/unit/key-hints.test.ts tests/hud tests/unit/messages*` passes; `grep -rn "<kbd" src/hud` shows only `Kbd.tsx`.
- [ ] **Step 5:** Commit `feat(phone): key caps only on fine pointers, touch wording for key hints`.

### Task 3: Lazy menu sheet and the `menu` cap

**Files:**
- Create: `src/hud/menu/MenuSheet.tsx`, `src/hud/menu/menuChunk.ts`
- Modify: `src/hud/menu/HudMenu.tsx`, `src/experience/Experience.tsx` (`__hq.menu`), `e2e/budgets.ts`, `e2e/perf/bytes-3d.spec.ts`
- Test: `tests/unit/menu-chunk-graph.test.ts` (new), existing HUD menu tests and `e2e/hud-corners.spec.ts`

**Interfaces:**
- Produces: `loadMenu(): Promise<typeof import("./MenuSheet") | null>` (one shared promise, forgets failures), `MenuSheet({ data, layout, onExit, onClose, controls, setControls })`.

- [ ] **Step 1: Failing test** `tests/unit/menu-chunk-graph.test.ts` (copy of `tour-chunk-graph.test.ts` with `ENTRY = "src/hud/menu/MenuSheet.tsx"`, loader `src/hud/menu/menuChunk.ts`; the last assertion checks only that the entry's static closure excludes `src/hud/menu/HudMenu.tsx` and `src/experience/Experience.tsx`).
- [ ] **Step 2:** Run it; it fails (no entry).
- [ ] **Step 3: Implement.**
  - `menuChunk.ts`: the `tourChunk.ts` pattern (`pending ??= import("./MenuSheet").then(m => m, () => { pending = null; return null; })`).
  - `MenuSheet.tsx`: `MenuProfile`, the icons, the action list and `LazySettingsPanel`, moved verbatim from `HudMenu.tsx`.
  - `HudMenu.tsx` keeps the button, `Modal`, `SheetHeader`, `close`, the `controls` state; the body is `lazyFromChunk(() => loadMenu().then(m => { if (!m) throw new Error("menu"); return m.MenuSheet; }), MenuFailed)` inside `Suspense` with a skeleton (`min-h-[22rem]`, `data-testid="menu-loading"`). `MenuFailed` renders `ChunkFailed` (`testId="menu-failed"`) plus the Classic site button (`onExit`). The button's `onPointerDown` and the `,` toggle call `loadMenu()`.
  - `Experience.tsx`: `menu: { load: loadMenu }` next to `tour`.
  - `bytes-3d.spec.ts`: `measureMenu` like `measureTour` (after it), logged and gated by `BYTES_3D_BUDGET.menu`.
- [ ] **Step 4:** `bun run build` (client-chunk check passes), measure with `E2E_PORT=<port> bun run e2e:perf -- e2e/perf/bytes-3d.spec.ts`, then set `menu: <measured> + 614` with a doc comment; confirm first frame and session totals are at most main's (476,967 / 460,833 B first frame, 543,944 / 527,810 B session on main as recorded; re-measure main on the same machine if the numbers moved).
- [ ] **Step 5:** Commit `perf(phone): lazy menu sheet chunk pays for the phone additions`.

### Task 4: Reading harness and label lists

**Files:**
- Create: `tests/helpers/phone-camera.ts`, `src/experience/floors/career/readable.ts`, `labs/readable.ts`, `library/readable.ts`, `roof/readable.ts`, `tests/unit/phone-reading.test.ts`
- Modify: `tests/unit/arrivals.test.ts` (import the helpers), label components whose positions or sizes are inline (`YearGates`, `CareerRooms`, `Pods`, `NewsroomDecor`, `EndPlaza`, `SignalGarden`): lift their constants into the floor's `readable.ts` (or an existing pure module) and import them back, values unchanged

**Interfaces:**
- Produces:

```ts
// src/experience/readable.ts (types only)
export type ReadingPose = { at: Vec2; heading: number; primed?: boolean };
export type Readable = { id: string; text: string; at: Vec3; fontSize: number; phoneFontSize?: number; yaw?: number; reading: ReadingPose };
// each floor: export function readableLabels(input): Readable[]
// tests/helpers/phone-camera.ts
export function readingPose(floor: FloorId, layout: FloorLayout, reading: ReadingPose, w: number, h: number): CameraPose;
export function cameraOf(pose: CameraPose, w: number, h: number): PerspectiveCamera;
export function screen(camera: PerspectiveCamera, w: number, h: number, p: Vec3): { x: number; y: number; front: boolean };
export function emPx(camera: PerspectiveCamera, w: number, h: number, l: Readable, cls: ViewportClass): number;
```

`readingPose` is `settledPose` from `arrivals.test.ts` generalised: the zone is `zoneAt(floor, { ...reading.at, heading }, layout.viewZones, primed)`; with no zone it is the plain follow (or rail on L2) pose at zoom 1. `emPx` projects `at` plus and minus half the font size (the phone size on class `mobile` when set).

- [ ] **Step 1:** Move `cameraOf`, `screen` and the pose code into `tests/helpers/phone-camera.ts`; `arrivals.test.ts` imports them; `bunx vitest run tests/unit/arrivals.test.ts` still passes.
- [ ] **Step 2:** Write the label lists from the audit (spec 4.2 scope): L2 room names, year signposts, year digits, Workshop, console, Repos, award placings; L3 board titles, pod names, the ops sign, the reactor ring names and count; L4 zone and section signs, post title signs, ticker, featured title, orb labels, pieces count, monument values, vault spines and title; RF availability headline, Comms, channel names, CV title. Each `reading` is the stop a visitor reads it from: the arrival (primed), the board, door, pad, bay or vault stop, heading toward the label.
- [ ] **Step 3:** `phone-reading.test.ts`: for each floor and label, `emPx` at 390 x 844 is at least 10 and at 375 x 667 at least 9; fixed-yaw labels also face the camera within 60 degrees; the label is in front of the camera. Print a table of failures.
- [ ] **Step 4:** Run; record the failures (expected: L3 pod names and board titles, L2 room names and placings, RF channel names and CV title, L4 orb labels).
- [ ] **Step 5:** Commit the harness with failing labels marked `it.fails` per label, so CI stays green and each fix flips one (`test(phone): reading rule harness for L2 to RF`).

### Task 5: Fix L2, L3, L4 and RF

Per floor (one commit each, `feat(phone): readable <floor> on portrait phones`):

- [ ] **Step 1:** For each failing label, try a phone zone view first: add or tune `classView.mobile` (zoom below 1 brings the camera closer; pitch) on the zone at its stop, or add an arrival-only or stop zone; keep `arrivals.test.ts`, the frozen desktop pose test and `shaftClearZoom` passing.
- [ ] **Step 2:** Otherwise give the label a `phoneFontSize` in `readable.ts`, read in the component through `useHQStore((s) => s.cameraClass === "mobile")` (or the existing class selector), growing its plate (`signPlate` already sizes from the font) where it would overflow.
- [ ] **Step 3:** Flip the label's `it.fails` to `it`; `bunx vitest run tests/unit/phone-reading.test.ts tests/unit/arrivals.test.ts`.
- [ ] **Step 4:** Portrait captures (`files/phone-shots.ts` equivalent against a local build) of the floor at 390 x 844 and 375 x 667; check no clipping.
- [ ] **Step 5:** Commit.

### Task 6: E2E, perf, visual gate, docs and PR

- [ ] **Step 1:** Extend `e2e/phone-first.spec.ts`: at 390 x 844, 375 x 667, 844 x 390 (touch, lite, returning visitor, floor lines unseen) ride to L2, L3, L4 and RF; the `dialog-box` rect intersects none of `joystick`, `boost`, `view-reset`, the floor chip, the Ask pill, `hud-menu`, `hud-minimap`, nor the rover's projected box; its text row has `scrollHeight <= clientHeight`. The phone menu opens on first tap, and its rotate action reads "Rotate left" with no visible `kbd`. A 1440 x 900 page keeps the `ViewControls` titles "Rotate left (Q)" and the pad pickers' key hints.
- [ ] **Step 2:** `bun run verify:quick`, `bun run e2e:changed`, `E2E_PORT=<port> bun run e2e:perf`, `bun scripts/visual-gate.ts --base HEAD --profile strict`.
- [ ] **Step 3:** Docs: `hud-and-drawer.md` (placement table, the toast, the lazy menu sheet, `Kbd`), `floors.md` (the phone reading rule), `styling-and-i18n.md` (key hints and touch wording), `performance.md` (the `menu` cap), `docs/features.md`, decision `docs/decisions/2026-10-28-phone-first-3d-part-2.md` (measured bytes); spec and plan Status lines.
- [ ] **Step 4:** Check CI capacity (`gh run list -R ShinyQ/ShinyQ-HQ -s in_progress`, `-s queued`), push, open the PR, report to the parent session.

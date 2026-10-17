# Rover Menu and Ask Naming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Status: shipped, 2026-10-17 (Round 9 sub-project N).

**Goal:** Rename the `>_` terminal to "Rover menu" and the chat panel to "Ask Rover Assistant", trim the menu to 8 entries, move "Replay the tutorial" and "Hints" into the settings panel, and keep the menu fully on screen on phones.

**Architecture:** Missions stay data (`content/site-content.json`): one new `work` mission replaces `best-swe`, `best-ai` and `surprise`, and the menu lists the catalog in `order`. The settings registry gains an `action` control kind (a button row that can close its sheet); the tutorial replay and the hints toggle become two setting definitions. The terminal drops its Ask option and extras and becomes a flex column capped to the dynamic viewport with a scrolling list.

**Tech Stack:** Next.js 16 static export, React 19, next-intl, Tailwind 4, Vitest (jsdom), Playwright with axe.

Spec: Round 9 design section 4 (session file `2026-10-17-round-9-design.md`), sections 1, 2 and 9.

## Global Constraints

- No em dashes (U+2014) anywhere, including commits and PR text.
- Every user-facing string in `messages/en.json` and `messages/id.json` with identical keys; Indonesian natural ("saya"), technical terms in English.
- Names (owner): chat panel title "Ask Rover Assistant" (ID "Asisten Rover"); floating launcher stays "Ask AI"; `>_` button and terminal "Rover menu" (ID "Menu Rover"); prompt `rover@hq:~$ ./rover-menu`.
- Menu (owner), exactly: [1] Explore my work, [2] See the highlights, [3] Follow my career, 2019 to 2026, [4] Browse my projects, [5] Read my writing, [6] View CV, [7] Discuss a role or project, [esc] Explore on my own.
- "Replay the tutorial" and "Hints" live in the settings panel, general group, through `src/hud/settings/registry.ts` and `defs/index.ts`.
- The terminal panel never exceeds the visible viewport (dvh, safe-area insets); the list scrolls inside; header and footer stay visible; whole panel on screen at 390x844 and 375x667.
- Label in name (WCAG 2.5.3): an `aria-label` starts with the control's visible text.
- Content is data: mission labels and steps come from `content/site-content.json`; no hard-coded mission ids in components.
- Keep internal ids: the point-and-go id `L1:kiosk:ask-rover` (stored visits), `RoverTerminal`, `MissionHud`, `hq:terminal-seen`, `/api/ask`, `hq:ask-*` keys, workflows and the Ask Function names.
- Budgets unchanged: Classic JS 240 KB, CSS 20,480 B; no 3D change beyond kiosk text.

## File map

| File | Change |
|---|---|
| `content/site-content.json` | missions: add `work`, remove `best-swe`, `best-ai`, `surprise`, reorder |
| `src/hud/terminal.ts` | `orderTerminalMissions(missions)`: catalog order, at most 9 |
| `src/hud/RoverTerminal.tsx` | no Ask option, no extras; viewport-capped flex layout; hint with the last key |
| `src/hud/MissionHud.tsx` | drop `hq:visits`, extras and the terminal Ask wiring |
| `src/hud/settings/registry.ts`, `SettingsPanel.tsx`, `defs/tutorial.ts`, `defs/index.ts` | `action` control, replay and hints settings |
| `src/hud/settings/LazySettingsPanel.tsx`, `src/hud/menu/HudMenu.tsx`, `src/hud/menu/SettingsSheet.tsx` | pass `onClose` to the panel |
| `src/hud/HudLaunchers.tsx`, `src/hud/menu/HudMenu.tsx`, `src/hud/dialog/*`, `src/experience/**` | names, `roverMenu` keys, `rover-menu` spotlight |
| `messages/en.json`, `messages/id.json` | strings below |
| tests and e2e | updated names, new behavior |
| `docs/agents/hud-and-drawer.md`, `ask.md`, `styling-and-i18n.md`, `floors.md`, `floor-l1-lobby.md`, `docs/features.md`, `docs/decisions.md`, `README.md` | current state and a dated decision row |

---

### Task 1: Missions data and menu order

**Files:**
- Modify: `content/site-content.json` (the `missions` array, near line 10050)
- Modify: `src/hud/terminal.ts`, `src/hud/MissionHud.tsx` (visit counter)
- Test: `tests/hud/RoverTerminal.test.tsx` ("terminal helpers"), `tests/content/dataset.test.ts:148`, `tests/unit/search.test.ts`, `tests/unit/missions-runner.test.ts`, `tests/unit/missions-static-host.test.ts`, `tests/unit/kiosk.test.ts:109`

**Interfaces:**
- Produces: `orderTerminalMissions(missions: readonly Mission[]): Mission[]` (sorted by `order`, sliced to 9). Mission ids after this task: `work`, `highlights`, `journey`, `projects`, `blog`, `cv`, `hire`.

- [ ] **Step 1: Update the failing tests first**

In `tests/hud/RoverTerminal.test.tsx`, replace the "leads with software and AI, alternating per visit" test with:

```ts
it("lists the Rover menu in catalog order, at most 9", () => {
  const all = getContent().missions;
  expect(orderTerminalMissions(all).map((m) => m.id)).toEqual(["work", "highlights", "journey", "projects", "blog", "cv", "hire"]);
  expect(orderTerminalMissions(all).map((m) => m.label.en)).toEqual([
    "Explore my work",
    "See the highlights",
    "Follow my career, 2019 to 2026",
    "Browse my projects",
    "Read my writing",
    "View CV",
    "Discuss a role or project",
  ]);
  expect(orderTerminalMissions([...all, ...all.map((m) => ({ ...m, id: `${m.id}-x`, order: m.order + 10 }))])).toHaveLength(9);
});
```

and `const missions = orderTerminalMissions(getContent().missions);` at the top. In `tests/content/dataset.test.ts`, replace "names the L3 wings in the best-swe and best-ai mission labels" with a test that the `work` mission rides to L3 and its `say` step names all three wings from `common.wing` in both locales:

```ts
it("the work mission rides to L3 and names every L3 wing (common.wing)", () => {
  const work = data.missions.find((m) => m.id === "work")!;
  expect(work.steps[0]).toEqual({ kind: "elevator", floor: "L3" });
  const say = work.steps.find((s) => s.kind === "say")!;
  for (const [locale, messages] of [["en", en], ["id", id]] as const) {
    for (const wing of Object.values(messages.common.wing)) expect(say.text[locale]).toContain(wing);
  }
});
```

(reuse the file's existing imports for `en`, `id` and the parsed dataset; add the imports if missing). In `tests/unit/search.test.ts` change `mission:best-ai` to `mission:work` (floor `L3`) and drop the `mission:surprise` floor assertion. In `tests/unit/missions-runner.test.ts` and `tests/unit/missions-static-host.test.ts`, keep the surprise-step coverage by running a synthetic mission `{ id: "surprise", order: 99, label: { en: "x", id: "x" }, steps: [{ kind: "surprise" }] }` appended to the missions passed to `createMissionRunner` (the step kind stays supported); update the expected id list at `missions-runner.test.ts:57` to the new ids. In `tests/unit/kiosk.test.ts:109` update the comment's example label to "Follow my career, 2019 to 2026".

- [ ] **Step 2: Run them and see them fail**

Run: `bunx vitest run tests/hud/RoverTerminal.test.tsx tests/content/dataset.test.ts tests/unit/search.test.ts tests/unit/missions-runner.test.ts tests/unit/missions-static-host.test.ts`
Expected: FAIL (unknown mission `work`, signature mismatch).

- [ ] **Step 3: Change the data**

Replace the first two and the last mission objects; set `order` so the result is:

```json
{ "id": "work", "order": 0, "label": { "en": "Explore my work", "id": "Jelajahi karya saya" }, "steps": [ { "kind": "elevator", "floor": "L3" }, { "kind": "say", "text": { "en": "Pick a wing: Product Engineering, AI Engineering, or Data and ML.", "id": "Pilih wing: Product Engineering, AI Engineering, atau Data and ML." } } ] },
{ "id": "highlights", "order": 1, ... },
{ "id": "journey", "order": 2, ... },
{ "id": "projects", "order": 3, ... },
{ "id": "blog", "order": 4, ... },
{ "id": "cv", "order": 5, ... },
{ "id": "hire", "order": 6, ... }
```

(keep each existing mission's label and steps; only `order` changes). Keep the JSON file's formatting style.

- [ ] **Step 4: Simplify the order helper and drop the visit counter**

`src/hud/terminal.ts`:

```ts
/** Rover menu order: the mission catalog by `order` (content/site-content.json), at most 9 options (keys 1 to 9). */
export function orderTerminalMissions(missions: readonly Mission[]): Mission[] {
  return [...missions].sort((a, b) => a.order - b.order).slice(0, 9);
}
```

Remove `EQUAL_BILLING`. In `MissionHud.tsx` remove `VISITS_KEY`, `countVisit`, the `visit` state, its timer, and call `orderTerminalMissions(index.missions)`.

- [ ] **Step 5: Run the tests and the content check**

Run: `bunx vitest run tests/hud tests/unit tests/content && bun run validate:content`
Expected: PASS (fix any other test that named `best-swe`, `best-ai` or `surprise` as a mission).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(missions): one Explore my work entry, Rover menu in catalog order"
```

---

### Task 2: Replay and hints in the settings panel

**Files:**
- Modify: `src/hud/settings/registry.ts`, `src/hud/settings/SettingsPanel.tsx`, `src/hud/settings/LazySettingsPanel.tsx` (props pass through, no change needed if it spreads props), `src/hud/settings/defs/index.ts`, `src/hud/menu/HudMenu.tsx`, `src/hud/menu/SettingsSheet.tsx`
- Create: `src/hud/settings/defs/tutorial.ts`
- Messages: `hud.settings.tutorial`, `hud.settings.hints`
- Test: `tests/hud/SettingsPanel.test.tsx` (create if absent, else extend), `tests/hud/HudMenu.test.tsx`

**Interfaces:**
- Produces: `SettingControl` gains `{ kind: "action"; run: () => void; closesPanel?: boolean }`; `SettingsPanel` gains `onClose?: () => void` (called before `run` when `closesPanel`); settings ids `replay-tutorial` (order 30) and `hints` (order 40), group `general`, both `available: tutorialAvailable`.

- [ ] **Step 1: Write the failing tests**

```tsx
it("replays the tutorial from the general group and closes the sheet first", async () => {
  const run = vi.fn();
  const stop = registerTutorial(run);
  const onClose = vi.fn();
  render(<Wrap><SettingsPanel onClose={onClose} /></Wrap>);
  const general = screen.getByRole("region", { name: en.hud.settings.groups.general });
  await userEvent.click(within(general).getByRole("button", { name: en.hud.settings.tutorial.label }));
  expect(onClose).toHaveBeenCalledBefore(run);
  expect(run).toHaveBeenCalledOnce();
  stop();
});

it("toggles hints as a switch in the general group", async () => {
  const stop = registerTutorial(vi.fn());
  setHintsOn(true);
  render(<Wrap><SettingsPanel /></Wrap>);
  const hints = within(screen.getByTestId("setting-hints")).getByRole("switch", { name: en.hud.settings.hints.label });
  expect(hints).toHaveAttribute("aria-checked", "true");
  await userEvent.click(hints);
  expect(hintsOn()).toBe(false);
  stop();
});

it("hides replay and hints while the 3D tutorial host is not registered", () => {
  render(<Wrap><SettingsPanel /></Wrap>);
  expect(screen.queryByTestId("setting-replay-tutorial")).toBeNull();
  expect(screen.queryByTestId("setting-hints")).toBeNull();
});
```

(`Wrap` = `NextIntlClientProvider` with `en`; import `registerTutorial` from `@/hud/dialog/tutorial`, `hintsOn`, `setHintsOn`, `resetFlagMemory` from `@/hud/dialog/storage`; call `resetFlagMemory()` and `localStorage.clear()` in `afterEach`.) If `toHaveBeenCalledBefore` is unavailable, record calls into an array and compare order.

- [ ] **Step 2: Run and see them fail**

Run: `bunx vitest run tests/hud/SettingsPanel.test.tsx`
Expected: FAIL (no such rows).

- [ ] **Step 3: Implement**

`registry.ts`: add the union member and document it:

```ts
  /** A one-shot command shown as a button with the label; `closesPanel` closes the sheet before it runs. */
  | { kind: "action"; run: () => void; closesPanel?: boolean };
```

`defs/tutorial.ts`:

```ts
import { hintsOn, setHintsOn, subscribeFlags } from "@/hud/dialog/storage";
import { replayTutorial, subscribeTutorial, tutorialAvailable } from "@/hud/dialog/tutorial";
import { defineSetting } from "../registry";

/** Starts Rover's full tour again (only while the 3D HUD hosts it); the sheet closes first so the tour is visible. */
export const replayTutorialSetting = defineSetting({
  id: "replay-tutorial",
  group: "general",
  order: 30,
  labelKey: "tutorial.label",
  hintKey: "tutorial.hint",
  control: { kind: "action", run: () => void replayTutorial(), closesPanel: true },
  subscribe: subscribeTutorial,
  available: tutorialAvailable,
});

/** The "!" hint bubbles near usable objects (`hq:hints`). */
export const hintsSetting = defineSetting({
  id: "hints",
  group: "general",
  order: 40,
  labelKey: "hints.label",
  hintKey: "hints.hint",
  control: { kind: "toggle", get: () => hintsOn(), set: (on) => setHintsOn(on) },
  subscribe: subscribeFlags,
  available: tutorialAvailable,
});
```

Append both to `SETTINGS` in `defs/index.ts`. In `SettingsPanel.tsx` add:

```tsx
function ActionRow({ def, control, onClose }: RowProps<"action"> & { onClose?: () => void }) {
  const t = useTranslations("hud.settings");
  const hint = useId();
  return (
    <div data-testid={`setting-${def.id}`}>
      <button
        type="button"
        aria-describedby={def.hintKey ? hint : undefined}
        onClick={() => {
          if (control.closesPanel) onClose?.();
          control.run();
        }}
        className="hq-glow flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm text-ink"
      >
        {t(def.labelKey)}
      </button>
      <Hint id={hint} hintKey={def.hintKey} />
    </div>
  );
}
```

`Row` gets `onClose` and a `case "action"`; `SettingsPanel({ defs, headingLevel, onClose })` passes it down. In `HudMenu.tsx` render `<LazySettingsPanel headingLevel={3} onClose={close} />`; in `SettingsSheet.tsx` `<LazySettingsPanel headingLevel={3} onClose={onClose} />`.

Messages (EN / ID), under `hud.settings`:

```json
"tutorial": { "label": "Replay the tutorial", "hint": "Rover shows you around the HQ again." },
"hints": { "label": "Hints", "hint": "Shows ! bubbles near things you can use." }
```

```json
"tutorial": { "label": "Putar ulang tutorial", "hint": "Rover memandu keliling HQ lagi." },
"hints": { "label": "Petunjuk", "hint": "Menampilkan gelembung ! di dekat hal yang bisa dipakai." }
```

- [ ] **Step 4: Run the tests**

Run: `bunx vitest run tests/hud`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(settings): replay the tutorial and hints in the general group"
```

---

### Task 3: Rover menu panel (8 entries, fits the viewport)

**Files:**
- Modify: `src/hud/RoverTerminal.tsx`, `src/hud/MissionHud.tsx`
- Messages: `hud.terminal.hint` with `{last}`; remove `ask.terminal` and `dialog.menu.replay`
- Test: `tests/hud/RoverTerminal.test.tsx`, `tests/hud/MissionHud.test.tsx`, `e2e/missions.spec.ts` (new viewport test), `e2e/ask.spec.ts` (remove the terminal ask test), `e2e/onboarding.spec.ts` (replay and hints now through settings)

**Interfaces:**
- Consumes: `orderTerminalMissions(missions)` (Task 1), settings ids `replay-tutorial`, `hints` (Task 2).
- Produces: `RoverTerminalProps` without `ask`, `onAsk`, `extras`; `TerminalExtra` removed.

- [ ] **Step 1: Update tests to the new behavior**

RoverTerminal tests: delete the "RoverTerminal ask option" describe and "lists extra options" test; assert the options are the 7 mission labels plus `en.hud.terminal.driveMyself`, keys `1` to `7` and `esc`, and the footer reads `Pick: 1 to 7 or arrows + Enter · Close: Esc`. MissionHud tests: delete "offers ask in the terminal only when the status says enabled" and "hands the terminal's ask option to the dock" and replace "offers replay and hints in Ask Rover only while the tutorial host is registered" with "the Rover menu never lists replay or hints, even with the 3D HUD open" (register a tutorial, open the terminal, expect 8 options and no option matching `/tutorial|hints/i`). Keep "finds Replay the tutorial in Cmd-K while the 3D HUD is open".

- [ ] **Step 2: Run and see them fail**

Run: `bunx vitest run tests/hud/RoverTerminal.test.tsx tests/hud/MissionHud.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement the panel**

In `RoverTerminal.tsx` remove `ask`, `onAsk`, `extras`, `TerminalExtra`, `tAsk`, `askOffset`, `extraOffset`, `enterAsk` and the `a` and extra key branches; `optionCount = missions.length + 1`; options `[...missions.map((m) => m.label[locale]), t("driveMyself")]`. Layout:

```tsx
<div
  className="fixed inset-0 z-50 flex items-end justify-center bg-void/60 pt-[max(0.75rem,env(safe-area-inset-top))] sm:justify-end sm:bg-transparent sm:p-6"
  onClick={onClose}
>
  <div
    ...
    className={
      className ??
      "flex max-h-[calc(100dvh-max(0.75rem,env(safe-area-inset-top)))] w-full flex-col overflow-hidden rounded-t-2xl border ... pb-[env(safe-area-inset-bottom)] ... sm:max-h-[calc(100dvh-3rem)] sm:w-[360px] sm:rounded-2xl sm:pb-0"
    }
  >
    <div className="flex shrink-0 items-center justify-between ...">header</div>
    <div className="shrink-0 px-4 pt-3 pb-2">typed lines</div>
    <ul className="mx-3 mb-3 min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-[10px] ...">...</ul>
    <p className="hidden shrink-0 border-t ... sm:block">{t("hint", { last: missions.length })}</p>
  </div>
</div>
```

(keep the existing colors, shadow, border, typing logic, focus trap and `scrollIntoView` of the active option; drop `max-h-[50vh]` and `sm:max-h-none`). Messages: EN `"hint": "Pick: 1 to {last} or arrows + Enter · Close: Esc"`, ID `"hint": "Pilih: 1 hingga {last} atau panah + Enter · Tutup: Esc"`. Remove `ask.terminal` (EN and ID) and `dialog.menu.replay`; keep `dialog.menu.hintsOn` / `hintsOff` (the Cmd-K toast).

In `MissionHud.tsx` remove `extras`, `useTutorialAvailable`/`useHintsOn` imports if now unused (keep `tutorial` for the palette actions), the `ask` and `onAsk` props on `RoverTerminal`, and the `TerminalExtra` import.

- [ ] **Step 4: e2e**

`e2e/missions.spec.ts`: append

```ts
for (const viewport of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
  test(`the Rover menu fits a ${viewport.width}x${viewport.height} screen`, async ({ page }) => {
    await seenTerminal(page);
    await page.setViewportSize(viewport);
    await openPage(page, "/en?tier=static");
    await page.getByRole("button", { name: en.hud.launcher.roverMenu, exact: true }).click();
    const menu = page.getByRole("dialog", { name: en.hud.terminal.title });
    const box = (await menu.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 0.5);
    await expect(menu.getByRole("option")).toHaveCount(8);
    await expect(menu.getByRole("button", { name: en.hud.terminal.close })).toBeInViewport();
    await expect(menu.getByRole("option").last()).toBeInViewport();
  });
}
```

`e2e/ask.spec.ts`: delete "Ask Rover's ask option opens the dock" (and its `e2e/durations.json` entry). `e2e/onboarding.spec.ts`: the replay test opens settings (desktop gear `settings-open`, or `hud-menu` on Corners) and clicks the `setting-replay-tutorial` button; the hints-off step clicks the `setting-hints` switch.

- [ ] **Step 5: Run**

Run: `bunx vitest run tests/hud tests/unit && bunx tsc --noEmit -p .`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(hud): Rover menu with 8 entries that fits the viewport"
```

---

### Task 4: Names everywhere (Rover menu, Ask Rover Assistant)

**Files:**
- Modify: `messages/en.json`, `messages/id.json`; `src/hud/HudLaunchers.tsx`, `src/hud/menu/HudMenu.tsx`, `src/hud/dialog/{onboarding.ts,OnboardingLayer.tsx,hintLines.ts,HintLayer.tsx,DialogBox.tsx,tutorial.ts}`, `src/experience/Experience.tsx`, `src/experience/interact/registry.ts`, `src/experience/floors/lobby/{MissionKiosk.tsx,kiosk.ts,observatoryLayout.ts,VisitsStation.tsx}`, `src/experience/config.ts`, `src/experience/rover/Rover.tsx`, `src/store/useHQStore.ts`, `src/hud/ask/AskChat.tsx` comments, `scripts/readme-hero.ts` comment
- Test: every unit, hud and e2e file that names "Ask Rover", `askRover`, `ask-rover` (spotlight/line key), "Tanya Rover" or the dock title "Ask the HQ"; `tests/unit/label-in-name.test.ts`

**Interfaces:**
- Produces: message keys `hud.launcher.roverMenu`, `dialog.onboarding.roverMenu`, `dialog.hints.object.roverMenu`, `dialog.hints.go.roverMenu`; `HintGoKey` member `"roverMenu"`; spotlight and onboarding line key `"rover-menu"` (`data-onboard="rover-menu"`); `HudLaunchers` part `"roverMenu"`. Unchanged: the registry id `L1:kiosk:ask-rover` (maps to `"roverMenu"` in `HINT_OBJECTS`).

- [ ] **Step 1: Messages (EN / ID)**

| Key | EN | ID |
|---|---|---|
| `hud.kioskTitle` | `rover@hq:~$ ./rover-menu` | `rover@hq:~$ ./rover-menu` |
| `hud.kioskHint` | Select the kiosk or the rover for the Rover menu | Pilih kios atau rover untuk membuka Menu Rover |
| `hud.launcher.roverMenu` (was `askRover`) | Rover menu | Menu Rover |
| `hud.terminal.title` | Rover menu | Menu Rover |
| `hud.terminal.prompt` | `rover@hq:~$ ./rover-menu` | same |
| `hud.terminal.options` | Rover menu options | Pilihan Menu Rover |
| `hud.terminal.close` | Close the Rover menu | Tutup Menu Rover |
| `hud.palette.label` | Search the Rover menu, rooms, years and actions | Cari Menu Rover, ruang, tahun, dan perintah |
| `hud.palette.placeholder` | Find a Rover menu pick, room, year or action | Cari pilihan Menu Rover, ruang, tahun, atau perintah |
| `hud.palette.groups.missions` | Rover menu | Menu Rover |
| `ask.dock.title` | Ask Rover Assistant | Asisten Rover |
| `ask.dock.hq` | Rover | Rover |
| `dialog.onboarding.skipped` | No problem. Replay the tutorial from Settings anytime. | Tidak masalah. Tutorial bisa diputar ulang kapan saja dari Pengaturan. |
| `dialog.onboarding.roverMenu` (was `askRover`) | Not sure where to go? The Rover menu has shortcuts to the best rooms. | Belum tahu mau ke mana? Menu Rover punya jalan pintas ke ruang-ruang terbaik. |
| `dialog.onboarding.closingShort` | That's the basics! Replay the full tutorial from Settings anytime. | Itu dasarnya! Tutorial lengkap bisa diputar ulang dari Pengaturan kapan saja. |
| `dialog.hints.object.roverMenu` (was `askRover`) | The Rover menu kiosk: shortcuts to the best rooms in the HQ. | Kios Menu Rover: jalan pintas ke ruang terbaik di HQ. |
| `dialog.hints.go.roverMenu` (was `askRover`) | Rover menu | Menu Rover |

- [ ] **Step 2: Code**

Rename keys and identifiers listed in Interfaces; `HudLaunchers` default `parts = ["roverMenu", "search"]`; `data-onboard="rover-menu"` on the launcher and the Corners menu button; `onboarding.ts` line `{ key: "rover-menu", text: copy.roverMenu, spotlight: "rover-menu" }`; `OnboardingCopy.roverMenu`. Update comments that say "Ask Rover" (the terminal) to "the Rover menu"; comments that say "Ask the HQ" about the chat UI may stay (internal feature name).

- [ ] **Step 3: Tests**

Update every test: button/dialog names to `en.hud.launcher.roverMenu` / `en.hud.terminal.title` (Playwright keeps `exact: true`), prompt `./rover-menu`, spotlight `rover-menu`, line key `rover-menu`, dock dialog name `en.ask.dock.title`, `id.hud.launcher.roverMenu`. Rename test titles that say "Ask Rover" to "the Rover menu" and keep `e2e/durations.json` keys in sync (rename the keys; durations stay). Add to `tests/unit/label-in-name.test.ts`:

```ts
it("the Rover menu launcher shows its full name", () => {
  expect(messages.hud.launcher.roverMenu).toBe(messages.hud.terminal.title);
});
```

- [ ] **Step 4: Search for leftovers**

Run: `rg -n "Ask Rover|Tanya Rover|askRover|\./ask-rover|\"ask-rover\"" --glob '!docs/superpowers/**' --glob '!node_modules/**' .`
Expected: only the registry id `L1:kiosk:ask-rover` (and its tests). `rg -n "Ask the HQ" messages src/hud e2e tests/hud` returns nothing user-facing.

- [ ] **Step 5: Verify and commit**

Run: `bun run verify:quick`
Expected: PASS.

```bash
git add -A && git commit -m "feat(hud): name the terminal Rover menu and the chat Ask Rover Assistant"
```

---

### Task 5: Docs, decisions and captures

**Files:**
- Modify: `docs/agents/hud-and-drawer.md` (storage keys: drop `hq:visits`; "Ask Rover name" section becomes "Rover menu name"; onboarding replay and hints toggle now in settings; Corners menu actions), `docs/agents/ask.md` (Names: visible "Ask Rover Assistant", ID "Asisten Rover", internal name "Ask the HQ" kept for code, the Function, workflows and the runbook), `docs/agents/styling-and-i18n.md` (Corners spotlight `rover-menu`), `docs/agents/floors.md`, `docs/agents/floor-l1-lobby.md`, `docs/agents/content-style-and-safety.md`, `docs/agents/folder-layout.md` (any "Ask Rover" mention), `docs/features.md` (Rover menu section and mission names, settings rows, Ask Rover Assistant), `README.md` (highlight name only), `docs/decisions.md` (dated row 2026-10-17), `docs/superpowers/README.md` (list this plan)

- [ ] **Step 1: Edit docs** to current state (no history in `docs/agents/`).
- [ ] **Step 2: Decision row**: `| 2026-10-17 | HUD naming | The terminal is the Rover menu (ID Menu Rover, ./rover-menu) with 8 entries (one Explore my work replaces the AI and Product picks and their per-visit alternation; Pick something for me and the Ask option leave it); replay and hints move to the settings panel; the chat panel is Ask Rover Assistant (ID Asisten Rover). Supersedes the Ask Rover naming row. | |`
- [ ] **Step 3: Run** `bunx vitest run tests/unit/agents-md.test.ts tests/unit/no-em-dash*.test.ts` (or the full unit suite).
- [ ] **Step 4: Captures** of the Rover menu and the settings panel at 390x844, 375x667, 834x1194 and 1440x900 (Playwright script in the session folder, not committed); check the menu is fully on screen and axe passes (`e2e/missions.spec.ts` accessibility test).
- [ ] **Step 5: Commit** `docs: Rover menu and Ask Rover Assistant`.

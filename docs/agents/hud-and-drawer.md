# HUD and drawer

Missions and the HUD, the Corners layout, the settings registry, the minimap, the Motion setting, Rover's dialog with onboarding and hint bubbles, and the Glass Drawer room panel. Index: [AGENTS.md](../../AGENTS.md).

## Missions and HUD

### Mission runner

- The runner (`createMissionRunner`) is framework-free and talks to the world only through `MissionHost` (`src/experience/missions/host.ts`).
  - The static tier uses `createStaticHost` (route navigation, one page load per mission).
  - The 3D tier implements the same interface on top of the store.
- Never import React, the store or three.js into `experience/missions/`.

### Room catalog

- Rooms come from `buildRoomCatalog` (`rooms.ts`).
- Every room has a static `path` (open) and `floorPath` (drive).
- Room ids beyond pods, career entries and posts:

| Room | Kind | Static path | Notes |
|---|---|---|---|
| `L1:profile`, `L1:stats`, `L1:skills`, `L1:certifications` | | | |
| `L1:highlights-about`, `L1:highlights-projects`, `L1:highlights-experience`, `L1:highlights-contact` | `highlights` | landing anchors `/#intro`, `/#work`, `/#journey`, `/#contact` | [Highlights Hall](floor-l1-lobby.md) stations |
| `L1:visits` | `visits` | `/contact#visits` (the Classic section), also its floor path | Visitor Observatory, see below |
| `L2:workshop` | | | its keywords list every project and repo |
| `L3:reactor` | `reactor` | `/labs#all-projects` | the [Tech Reactor](floor-l3-labs.md); no route of its own, so it keeps `/labs` like the hall stations |
| `L3:ops` | `ops` | `/contact#production` | the Ops Control Room, see below |
| `L4:research` | `research` | | papers and the thesis, see `isResearch` in `content/selectors.ts` |
| `L4:publications` | | | the models shelf: models and datasets |
| `L4:talks` | | | |
| `L4:topics` | `topics` | `/library#topics` | the [Topic Constellation](floor-l4-library.md); no route of its own, its pick in `#library-topic=<slug>` |
| `RF:contact`, `RF:cv` | | | |

- L2 Workshop bench and skyline rooms (`L2:side-<id>`, `L2:repo-<slug>`, helpers in `@/content/workshop`):
  - They have drawer views but no catalog entry (they would push pods down in Cmd-K; the `L2:workshop` keywords list every project and repo).
  - goToRoom and the drawer work without one.
  - On L2 only career entries have a page (`hasPage` in `Experience.tsx`).
- Retired benches: benches whose project became an L3 pod stay in `RETIRED_SIDE_ROOMS` (`@/content/workshop`).
  - `currentRoom` sends an old `L2:side-<id>` to the pod (the mission runner's `goTo` and the drawer history use it).
- `L1:visits`, the Visitor Observatory in the Lobby's south-west corner (owner decision):
  - The old id was `RF:visits`.
  - No route of its own (`hasPage` false, it keeps `/{locale}`).
  - Deep links `/{locale}#visits` and the old `/{locale}/contact#visits` resolve through `visitsRoomFromHash` (`floors/lobby/visitsRoom.ts`).
  - Drawer body: `VisitsBody`.
- Moved room ids resolve through `canonicalRoom` (`missions/roomAliases.ts`): `RF:visits` to `L1:visits`, then `currentRoom` for retired benches.
  - `openRoom`, `goToRoom` and the drawer history sync apply it, so old history entries, cached drawer links and recent rooms keep working.
- `L3:ops`, the Ops Control Room ("How I run AI in production"):
  - No route of its own (`hasPage` false, it keeps `/labs`).
  - Deep link `/{locale}/contact#production` through `opsRoomFromHash`, which starts the gate on L3 (a hash room on another floor than the route's starts on its own floor).
  - Drawer body: `OpsBody`.

### HUD index

- The HUD index (`HudIndex`: rooms, missions, years; `src/hud/index-data.ts`) is built on the server so zod and the dataset never ship to the client.
- It is exported as a static file (`/data/hud/index.json`, from `src/app/data`), not as a layout prop: every layout client prop is inlined into every HTML file and sits on the LCP path.
- `MissionHud` fetches it on demand (`src/hud/index-client.ts`): when the palette or the Rover menu opens, when `goToRoom` or `runMissionSteps` waits for the runner (`onRunnerRequest` in `missions/bridge.ts`), else once the page is idle after `load` (`scheduleHudIndex`: `requestIdleCallback`, 2 s timeout). It sets `html[data-hydrated]` once the index loaded (or failed).
  - The URL carries `hudIndexVersion`, so the 1 h `/data/*` cache never outlives a deploy.
- `goToRoom` and `runMissionSteps` wait up to 5 s for the runner.
- HUD components get data through props.

### Corners layout

Per-device composition is `hudLayout(viewport, coarse)` in `src/hud/layout.ts` (`useHudLayout`); the pixel layout is in [styling-and-i18n.md](styling-and-i18n.md#3d-hud-layout-owner-decision).

- Owner decision 2026-10-17 (layout A "Corners"): phones and tablets keep the corners for controls, so the canvas stays clear.
  - Phone: at most 5 controls plus the minimap (floor chip, Ask AI, menu, joystick, Reset view).
  - Tablet (any coarse pointer): at most 9 (the phone set plus search; the chip also shows the floor name).
  - `e2e/hud-corners.spec.ts` counts them at 390 x 844, 834 x 1194 and 1194 x 834 (touch) and fails above the cap; a new control needs an owner note and a new cap.
- The elevator rows (rail, floor sheet, floor picker) come from `floorRows` (`src/hud/floorRows.ts`): the five public floors top-down, plus B1 below L1, always listed.
  - Locked, B1 is a padlock row (`aria-disabled`, no ride) reading "Visit all 5 floors (n/5)"; the hint is in its accessible name and its `title` (the compact rail shows the code and the padlock). Floor names go through `useFloorLabel`.
  - During the unlock moment the unlocked row pulses, except under reduced motion.
- `FloorChip` (top left) opens the floor sheet (`floor-sheet`, `FloorButtons` rows named with all of their visible text); picking a floor rides there. It replaces the elevator rail.
- `HudMenu` (top right) opens the menu sheet (`menu-sheet`: profile, actions, `SettingsPanel`). Everything that was a loose button on phones (Classic site, search, Rover menu, view rotation, Map, settings) lives there; keep new phone actions in the sheet.
- `ResetView` is the single bottom-right button on Corners; desktops keep the three view controls.
- Boost on touch is a joystick double tap (`Joystick`, `useBoostToggle` in `src/hud/boost.ts`); there is no Boost button on Corners. See [Boost](3d-experience.md#boost).
- Keys: `,` opens the settings (the menu sheet on Corners, the settings sheet on desktop), `N` opens the map overview (`useHudToggle` in `menu/useHudToggles.ts`; each key is a `{ type: "toggle", what }` intent). World keys pause while any `aria-modal` dialog is open (a sheet, the overview, an open room), so Esc or the close button closes the sheet, and neither key works over an open room.
- The open state lives in a module store (`hudToggles`), not component state: a graphics quality change remounts the HUD (see [Graphics quality](#graphics-quality)) and the open sheet stays open; it closes once nothing holds it after that commit (Classic site).

### Controls hint

- `HintBar` (`src/hud/Hud.tsx`, `data-testid="hint"`) is a plain text panel in the bottom band's center column under point-and-go's status, shown outside the intro and an open room while no Rover line is open: `hud.hintFine` with a fine pointer, `hud.hintCoarse` on touch, `hud.career.scrubHint` on L2 with touch. On phones it leaves after 6 s.
- It mounts with the HUD, under the SSR boot cover on a returning visit, so its first paint is an LCP candidate. Keep it smaller than the boot card's owner block (the game-first LCP, see [performance.md](performance.md#game-first-lcp)); do not merge it into a larger text block.

### Settings registry

- One panel (`SettingsPanel`, shown in the Corners menu sheet and the desktop `settings-sheet`) renders `SETTINGS` from `src/hud/settings/defs/index.ts`.
- Layout (owner request 2026-10-17, "more neat"): each group is a heading plus one rounded card with hairline dividers. Every row has the same anatomy: the label and its one-line note on the left, the control on the right (switch, or a round icon button for an action); choices put a full-width segmented control under the label, the volume slider sits under its label and value. The label is a `<label for>` that names the control (`aria-labelledby`), so a tap on the text works the switch and the accessible name stays exactly the label.
- A setting is data (`defineSetting` in `src/hud/settings/registry.ts`): `id` (the row gets `data-testid="setting-<id>"`), `group` (`general`, `display`, `sound`), `order`, `labelKey` (and `hintKey`) under `hud.settings`, a `control` (`toggle`, `choice` or `range` with `get`/`set`, or `action` with `run` and an optional `closesPanel`), a `subscribe`, and an optional `available` (the panel re-renders when a setting with `available` fires its `subscribe`).
- An `action` is a button; with `closesPanel` the panel calls its `onClose` prop (the menu and settings sheets pass their close) before `run`, so the result is visible. `replay-tutorial` (general, order 30, `action`) and `hints` (general, order 40, a switch on `hq:hints`) live in `defs/tutorial.ts` and show only while the 3D HUD has registered its tutorial host (`tutorialAvailable`).
- The control binds to an external store (the audio engine, `qualityPref`, `minimapPref`, the Motion and language stores); the panel persists nothing itself. Duplicate ids throw.
- `LazySettingsPanel` loads the panel and its registry when a settings sheet first opens, and `Minimap` loads `MapOverview` when the overview first opens, to keep both out of the first-frame 3D path (byte budget in [performance.md](performance.md)). Tests find their content with `findBy*`.
  - Both use `lazyFromChunk`: a failed chunk shows `ChunkFailed` (`hud.loadFailed` and a Retry button, `hud.retry`) and Retry loads it again; the overview's fallback keeps the dialog shell (`map-overview-failed`) so Esc and close work.
  - While the panel loads, a `min-h-[36rem]` placeholder (`settings-loading`) holds the sheet's height.
- To add a setting: one file in `defs/`, one entry in `defs/index.ts`, labels in both `messages/*.json`. Persisted preferences use `createLocalPref` (`src/lib/local-pref.ts`: one key, a validated fallback, same-tab and `storage`-event listeners, an in-memory fallback when storage is blocked).
- Today: language, Default HQ view, Motion, Graphics quality, Day and night, Minimap, Sound, Sound effects, Background music, Floor ambience, Music and ambience volume. The two soundtrack switches are independent; the shared volume scales both, and the master Sound switch retains its existing behavior.

### Graphics quality

- `hq:quality` (`src/lib/quality-pref.ts`) is `auto`, `full` or `lite`. `useQualityTier` (`src/experience/gate-tier.ts`) applies it over the probe through `applyQualityPref`; see [3d-experience.md](3d-experience.md#gate-and-tiers).
- A change remounts the canvas (the gate key is `mount:tier`); `src/experience/qualityRemount.ts` keeps the rover, floor, phase and open room in place.
- The setting (`src/hud/settings/defs/quality.ts`) applies a choice after `QUALITY_APPLY_MS` (400 ms) without another one: the radios show the pending value at once, and arrow keys passing Full on the way to Lite remount once.
- The open sheet survives the remount (`hudToggles`), and its `takeFocus` hook puts focus back on the checked quality radio once the new panel mounts.

### Minimap

- `src/hud/minimap/`: the pure `model.ts` (from `buildFloorLayouts` and `interactRuntime.items`), the round `Minimap`, the `MapOverview` dialog and `pref.ts` (`hq:minimap`). Geometry and sizes: [styling-and-i18n.md](styling-and-i18n.md#3d-hud-layout-owner-decision).
- It is HTML and SVG over the canvas: zero draw calls, updated from the store's 10 Hz rover mirror, never a second frame loop.
- It follows the rover's floor, so on B1 it shows the aisle, the bays' doors and the Return pad like any other floor.
- Places come from `interactRuntime.items` (`subscribe`, `setItems`), so a floor that adds or moves a point-and-go target shows up on the map with no minimap change.
- The overview's room list emits the same `interact` event as clicking in the world (the rover drives there, then the room opens).
- Off in the settings hides the minimap only; `N` still opens the overview.
- The minimap is hidden during boot, intro and the hologram, and on phones while a room is open.

### Opening overlays and modals

- From anywhere, through `src/hud/events.ts` (window `hq:hud` events):
  - `openPalette(filter?)`, `openTerminal()`.
  - The command palette (`PaletteHost`, with `CommandPalette` and `search.ts`) and the Rover menu (`RoverTerminal`) are lazy chunks (`src/hud/lazy-hud.ts`): `MissionHud` mounts each on its first open (React.lazy through `lazyFromChunk`, `Suspense` fallback null, so the closed state renders nothing as before) and keeps it mounted. `HudLaunchers` warms the chunk and the HUD index on hover or focus. Until the index settles the palette shows no "No results" line and keeps an Enter (pressed in it or typed while its chunk loaded) for the first result once the index arrives; the Rover menu waits for the index, at most 2 s (`TERMINAL_INDEX_WAIT_MS`), instead of opening without missions. A failed chunk closes the overlay; the next open retries.
  - The shortcuts work on the first press: keys typed after Ctrl K, Cmd K or `/` while the palette chunk loads are kept (`src/hud/typeahead.ts`) and seed its query on mount; an Enter typed then runs the top result. A window capture listener registered at layout mount takes them first and stops them, so no other key handler (the 3D drive and language keys, Rover's dialog box) sees them.
  - `enterHq()`: Page View to the 3D tower, handled by `ExperienceGate` like Back to 3D.
- `openCv()`, `openPaper(preview)` and `openCert(view)` open the site-wide modals in `DialogHost`.
  - `DialogHost` is mounted in the locale layout outside `#site-shell`, so the modals work over the 3D tower and the room drawer; chunks load on first use.

### Paper previews

- Research rows (`ResearchList` on Page View, `ResearchBody` in the drawer) open `PaperDialog` from the title or the "Abstract and citation" button.
- The dialog gets a `PaperPreview` built on the server by `buildPaperPreview(pub, locale)` (`src/content/papers.ts`):
  - authors, venue, date, abstract, citation count;
  - copyable APA / IEEE / BibTeX, formatted in the dialog by `previewCitations(preview)` (`src/content/citation.ts`; the preview carries only `cite.kind` and `cite.pages` for it, so the citation text never repeats in a page payload);
  - DOI and Google Scholar (title search) links in a new tab with `rel="noopener noreferrer"`.
- No third-party iframes (owner decision: credential, Medium and IEEE pages refuse framing or are paywalled); the CSP keeps `frame-src 'self'`.

### Storage keys

`localStorage` keys owned by the HUD:

| Key | Meaning |
|---|---|
| `hq:terminal-seen` | set when the terminal first opens; nothing opens it on its own |
| `hq:onboarded` | `done` or `skipped`: the first-session tutorial ran |
| `hq:hints` | `off` hides the hint bubbles |
| `hq:recent` | recent rooms on the static tier |
| `hq:floor-intro` | JSON list of floors whose first-visit Rover line was spoken or skipped; a legacy `hq:walk-prompt` list still counts as seen and is never written, stale `hq:walk:<id>` keys are ignored |
| `hq:view` | the remembered "Default HQ view" preference (`page` or `3d`), written by Classic site, Back to 3D and the settings entry; decides new tabs and visits, see [page-view.md](page-view.md#shareable-links) |
| `hq:stats-optout` | `"1"`: "Don't count my visits", see [Public visit stats](stats.md) |
| `hq:sound` | master mute, `"off"` mutes (a missing key is on), see [Audio](ci-and-deploy.md#audio) |
| `hq:sfx` | sound effects, `"off"` disables them (missing is on) |
| `hq:music` | background music, `"off"` disables it (missing is on) |
| `hq:ambience` | floor ambience, `"off"` disables it (missing is on); while on, the floor layer replaces the music, see [Audio](ci-and-deploy.md#audio) |
| `hq:music-volume` | shared music and floor-ambience volume, 0 to 1 (missing is 1) |
| `hq:quality` | graphics quality: `auto` (default), `full` or `lite`, see [Graphics quality](#graphics-quality) |
| `hq:minimap` | `on` (default) or `off`: whether the corner minimap shows, see [Minimap](#minimap) |
| `hq:v1` | the store's persisted slice (owned by `useHQStore`, see [Persistence and storage](3d-experience.md#persistence-and-storage)); `floorsSeen` and `b1Unlocked` there keep the B1 unlock |

`sessionStorage` keys:

| Key | Owner | Meaning |
|---|---|---|
| `hq:intro` | `src/lib/intro-session.ts` | boot and intro played this session |
| `hq:rum` | `src/experience/perf/rumDecision.ts` | performance beacon sampling for this session: `on`, `off` or `sent` |
| `hq:point-hint` | `src/experience/interact/missed.ts` | the one-time point-and-go hint |
| `hq:hall-gate` | `floors/lobby/gateSweep.ts` | the Highlights Hall gateway light curtain swept this session |
| `hq:ask-thread` | Ask dock | chat thread, last 20 messages |
| `hq:ask-teaser` | Ask dock | teaser shown this session |
| `hq:ask-status` | `src/hud/ask/availability.ts` | the last "enabled" `GET /api/ask` status and when it arrived (JSON); stands in for the idle check for 10 minutes, see [Ask availability](ask.md#availability) |
| `hq:ask-seed` | Ask dock | pill sampling seed for this page session (a 32-bit unsigned integer, `readAskSeed` in `src/ask/suggestions.ts`); `order` keeps bank order for tests |

- Tests and screenshots that must not see the tour or the bubbles use `asReturningVisitor` (it sets `hq:onboarded=done` and `hq:hints=off`) or set `hq:onboarded` next to `hq:terminal-seen`.

### Rover menu name

- User-facing name (owner decision): the `>_` button and the terminal are the **Rover menu** (ID **Menu Rover**) wherever a visitor reads them:
  - the desktop 3D top bar, the Corners menu sheet's actions and the Page View header button (`hud.launcher.roverMenu`);
  - the terminal title and prompt (`rover@hq:~$ ./rover-menu`);
  - the Cmd-K group, aria labels and the Lobby kiosk;
  - the onboarding spotlight (`data-onboard="rover-menu"`) and the hint lines (`dialog.onboarding.roverMenu`, `dialog.hints.object.roverMenu`, `dialog.hints.go.roverMenu`).
- Code names stay: `MissionHud`, `RoverTerminal`, `missions`, `hq:terminal-seen`, and the point-and-go id `L1:kiosk:ask-rover` (stored visits use it).
- The chat panel is not the Rover menu: it is **Ask Rover Assistant** (see [ask.md](ask.md#names)).
- The menu has exactly 8 entries, listed in catalog `order` (`orderTerminalMissions`, at most 9 missions): `1` Explore my work (the `work` mission: the elevator to L3, then Rover says to pick a wing: Product Engineering, AI Engineering or Data and ML), `2` See the highlights, `3` Follow my career, 2019 to 2026, `4` Browse my projects, `5` Read my writing, `6` View CV, `7` Discuss a role or project, and "Explore on my own" (`Esc`).
  - No Ask option, no "Pick something for me", no replay or hints (Ask AI has its own entry points; replay and hints are settings). The `surprise` step kind stays supported by the runner.
  - The footer hint is `hud.terminal.hint` with `{last}`.
- Fit: the panel is `max-h-[calc(100dvh-...)]` (safe-area insets removed) with a `flex-col` layout (header, typed lines and footer `shrink-0`, the option list `min-h-0 flex-1 overflow-y-auto`), so it stays on screen on short phones; `e2e/missions.spec.ts` checks 390x844, 375x667 and 667x375.
- Playwright finds the button with `{ name: en.hud.launcher.roverMenu, exact: true }`.

## Motion setting

### Why (owner decision)

- Windows reports `prefers-reduced-motion: reduce` whenever Settings > Accessibility > Visual effects > Animation effects is off.
- Following it made every elevator ride on such a PC the 150 ms cut and ran the whole HQ reduced.
- Hence a Motion setting: System / Full / Reduced (ID Sistem / Penuh / Dikurangi).

### Default Full (owner decision)

- Full is the default for every visitor on every OS. The OS preference (`prefers-reduced-motion`) is not the default.
- The Motion menu restores it: System follows the OS again, Reduced always reduces.
- That menu is the only way to reduce motion, so keep it easy to find: the desktop HUD icon, the settings panel (the Corners menu sheet and the desktop settings sheet) and the three Cmd-K actions.
- Existing visitors: store version 3 migrates a stored `system` (the old default, never a choice) to `full` and keeps `reduced` as is (`migrateMotion`); a System picked from version 3 on stays.
- Without JavaScript the page CSS still follows the OS (no `data-motion` attribute).

### Model

- `src/lib/motion.ts` (pure):
  - `MotionPref`, `DEFAULT_MOTION` (`full`);
  - `resolveReducedMotion(pref, systemReduced)`: System follows the OS, Full and Reduced override it;
  - `migrateMotion(motion, version)`;
  - `storedMotion(raw)`: the head script's value: `full` for new visitors, an old System or unreadable storage, `reduced`, or none under a picked System.
- The store persists `motion` and keeps `reducedMotion` resolved, so every 3D consumer (rides, intro, holograms, boost, camera glides, the dialog typewriter) keeps reading `reducedMotion`.
- `Experience` still feeds the OS flag (`setReducedMotion` plus the `matchMedia` change listener).
- The store hydrates synchronously when it is created, before the first 3D frame, so the intro already follows the setting.
- `RoverTerminal` follows it too.

### Page CSS

- `setMotion` and the head script set `html[data-motion="full|reduced"]` (`full` by default, removed under System).
- `globals.css` redefines Tailwind's `motion-reduce` and `motion-safe` variants on top of it (`@custom-variant`).
  - Every `motion-reduce:` / `motion-safe:` utility and every `@variant motion-reduce { ... }` block (boot log, landing hero and ticker, Page View screenshots) applies under the OS setting unless `full`, and always under `reduced`.
- Write new reduce rules as `.x { @variant motion-reduce { ... } }`, never as a bare `@media (prefers-reduced-motion: reduce)`.
  - Top-level `@variant` blocks compile wrong, and `:is()` drops `::before` / `::after`, so the global duration rule is written out.
- The landing ticker has no pause switch (owner decision); its duplicate track hides and the stats wrap under the effective reduced motion.

### UI

- `MotionMenu` (`src/hud/MotionControl.tsx`): a round icon button right of Sound in the 3D top bar (`data-testid="motion-menu"`, `data-onboard="motion"`).
  - It opens a small popover with `MotionChoices`: a fieldset of three native radios (legend "Motion", arrow keys move and select).
  - Esc and an outside click close it and return focus.
- Phones and tablets (the Corners HUD) set Motion in the menu sheet's settings panel (`setting-motion`); desktops also have it in the settings sheet (gear button or `,`).
- Cmd-K has `motion-system`, `motion-full` and `motion-reduced` on every page (a toast confirms).
- There is no motion hint: the one-time "turn on full motion" Rover line (`MotionHintLayer`, copy `dialog.motion`) was removed with the Full default; do not reintroduce it. A stale `hq:motion-hint` key in old browsers is ignored.

### Tests

- `tests/unit/motion.test.ts`, `tests/unit/boot-first.test.ts`, `tests/hud/Controls.test.tsx`.
- `e2e/motion.spec.ts` (`page.emulateMedia({ reducedMotion: "reduce" })`):
  - `lastRide.distinctY` at least 12 and a moving intro by default;
  - the cut under System and under Reduced;
  - the version 2 migration, axe, the Corners menu, Cmd-K on the Classic site.
- Specs that test reduced motion by emulating the OS flag pick System first with `chooseMotion(page | context, "system")` from `e2e/hq.ts` (it rewrites `hq:v1` before every navigation), so the flag decides as before.

## Rover dialog, onboarding and hints

- Purpose (owner decision): simple first-session guidance as a chat like old Pokemon games. Plan: `docs/superpowers/plans/2026-10-12-onboarding-dialog.md`.

### Engine

- `src/hud/dialog/engine.ts` (pure): `say(lines | line | string, { id?, skip? })` returns `Promise<{ status: "done" | "skipped" | "cancelled", choice }>`; requests queue.
- A line has:
  - `text`;
  - `key` (`data-line`);
  - `face` (portrait emote, a `RoverFace`);
  - `choices` (2 to 3, one may be `cancel` for Esc);
  - `spotlight` (`data-onboard` name of a HUD control to ring);
  - `until` / `fallbackMs` (try-it lines that move on by themselves, with a Continue choice after the fallback).
- `tick(ms)` types at `CHAR_MS` (28 ms); reduced motion sets `instant`.
- Use the singleton from `store.ts` (`say`, `cancelDialog`, `useDialog` slice); never create another engine.

### Dialog box

- `DialogBox` and `DialogLayer` are both in the 3D chunk, which is itself lazy.
  - Never a second dynamic import inside it: that made Turbopack regroup shared modules into the Page View bundle.
- Non-modal `role="dialog"` named "Rover" over the canvas, `.hq-dialog` frame, JetBrains Mono.
- The rover face drawn by `drawFace` is the portrait.
- Input:
  - an A button (keyboard "a" stays the strafe key);
  - Enter and Space through a window capture listener (so the game's Enter does not open the Rover menu);
  - arrows between focused choices.
- A soft `blip` (`audio.play("blip")`, shares the click rate limit).
- It pauses and hides during boot, intro, a room drawer, the hologram, the pad picker, the Ask panel and any `aria-modal` dialog.
- The modal check (`useModalOpen`) is synchronous, from the first render on, and choices never take focus from a text field or another dialog, so typing in Cmd-K is never stolen when a floor line finishes.
- Placement (`placement.ts`), always above the bottom band's center column (point-and-go's `InteractStatus` Go chip and one-time hint, and the controls hint):

| Device | Offset |
|---|---|
| Fine pointers | 128 px above the bottom |
| Touch tablets | 160 px |
| Phones | 168 px, 12 px from both edges: a slim toast above the joystick (120 px plus the 24 px band padding and a 24 px gap) |

- The phone toast (`placement === "phone"`):
  - compact (`p-2.5 text-[13px]`, 32 px portrait), the text clamped to two rows (`line-clamp-2`) until a tap expands it (`data-expanded`); a tap on a short or expanded line advances as before;
  - a finished line with no choices and no try-it task advances by itself after `TOAST_HOLD_MS` (4500 ms, counted from the end of typing, also under reduced motion) only when it fits in the two rows: a clamped line (`scrollHeight > clientHeight` on the text row) waits for a tap (expand, then advance), and an expanded line never moves on by itself;
  - choices and Skip still render (onboarding needs them).
- The Ask teaser (`AskDock`, outside the 3D chunk) never shows while `[data-testid='dialog-box']` exists, and hides within 500 ms when one appears. In the tower it sits at `top-[var(--hq-teaser-top,116px)]`: `Hud` sets `--hq-teaser-top` on `<html>` next to `data-hq-hud` (phone 148 px, tablet 200 px, desktop 124 px below 1024 px wide and 76 px from there) and removes it on unmount.

### Onboarding

- `onboarding.ts`, `OnboardingLayer.tsx`: once per browser after the boot and intro.
- Full form, in order:
  1. welcome with Skip;
  2. moving, with a try-it wait that teaches [point-and-go](floors.md) (desktop: point and click a glowing object; touch: tap twice or use its Go chip; there is no click-the-floor driving);
  3. the camera (look around, zoom, first person; spotlight on the view controls, `data-onboard="view"`);
  4. the Highlights Hall (registry extra `L1:station:highlights-about`, room `L1:highlights-about`) when it is registered;
  5. elevator and call pads;
  6. the Rover menu;
  7. Ask AI when its pill shows;
  8. closing.
- After a deep link: once the continuation ends and the drawer closes, the short form (no Highlights Hall, no elevator).
- Onboarding replaces the Director's first-visit terminal auto-open.
- Replay: the settings panel row "Replay the tutorial", Cmd-K "Replay the tutorial" (`registerTutorial` / `replayTutorial`, only while the 3D HUD is open).

### Floor lines

- `FloorIntroLayer` (`src/hud/dialog/FloorIntroLayer.tsx`, mounted by `Hud`) speaks `dialog.floor.<id>` once on L2, L3, L4 and RF (`FLOOR_LINES`; never L1).
  - After the first-session tour settled, 700 ms after arriving while exploring.
  - As one line without choices (`floorIntroLine` in `floorIntro.ts`).
- Done or skipped marks the floor seen (`floorIntroSeen`, `markFloorIntroSeen` in `storage.ts`, key `hq:floor-intro`).
- Driving, a point-and-go action or a scrub dismisses it and marks it seen.
- A line cancelled from elsewhere (a tutorial replay) waits for its next chance.
- Tests that must not see a floor line call `skipFloorLines(page)` from `e2e/hq.ts`.

### Unlock moment

- `EngineUnlockLayer` (`src/hud/dialog/EngineUnlockLayer.tsx`, mounted by `Hud`, renders nothing) runs the B1 Engine Room unlock; the rules are in [B1 access](floor-b1-engine-room.md#access).
  - When the store's `b1Moment` is set (the fifth public floor reached) and the visitor is free (explore, no ride, no running mission) after the tour settled: the dialog line `b1-unlock` ("Take me there" rides to B1, "Later" ends it). `clearB1Moment()` runs on either answer.
  - One chime (`audio.play("chime")`) plays per moment when the offer line actually starts (the dialog view id is `b1-unlock`), never while the dialog is paused (it waits, then plays once).
  - A cancelled line (a tutorial replay) is offered again at most 3 times, once the dialog queue has been idle for 300 ms (`IDLE_GRACE_MS`) and the visitor is free, so it never queues ahead of the replayed tutorial; a ride, a running mission or the tour waits first. The retry does not chime again.
  - The moment is not persisted, the unlock is: after a reload the row stays lit and the offer is not repeated (B1 is open in every picker).
  - A locked visitor who followed `/{locale}#B1` hears `b1-locked` ("B1 is still locked: visit all 5 floors first (n/5)") once exploring and free, so the progress counts the Lobby; the hash is stripped. Only the Lobby route acts on `#B1` (the gate honours it there): on other routes the hash stays and nothing is said. Nothing is said while a ride, a mission or the intro runs.
  - The flag `?unlock=b1` never starts the moment.
- Cmd-K: while the layer is mounted it registers a "Go to B1 Engine Room" action (both states) through `registerHudAction` (`src/hud/hudActions.ts`, a module store read by `MissionHud` through `useHudActions`; entries `action:<id>`, target `{ type: "hud", id }`). It carries its resolved label, EN and ID keywords (`engineRoomAction.ts`) and, unlocked, rides the elevator to B1; locked, running it says Rover's `engine.lockedLine` with the progress (the same line as the locked `#B1` deep link) and does nothing else. It exists only in the 3D tower; the Classic pages have none (their Cmd-K finds the /build page).
- Strings live in the 3D-only `engine` namespace (`engine.unlock`, `go`, `later`, `lockedLine`, `goTo`, and the picker row texts). The layout namespaces ship to every page and `/en/quick` sits at its HTML budget, so never put B1 strings in `hud`, `floors`, `ask`, `dialog` or another `LAYOUT_NAMESPACES` entry ([Client messages](styling-and-i18n.md#client-messages)); a layout island hands the palette a resolved label instead.
- Tests: `tests/hud/EngineUnlockLayer.test.tsx`, `tests/unit/b1-visits.test.ts`, `b1-deep-link.test.ts`, `dialog-copy.test.ts` (the engine lines); `e2e/b1-unlock.spec.ts` (locked row, progress, the moment with the chime counted by `__hq.audio().played`, Later, deep links, Cmd-K in both states).

### Hint bubbles

- `HintProbe` (in the canvas, no draw calls) picks the nearest point-and-go target within 5 u of its `at` (`nearestHint`, sticky to 6 u).
  - Source: `hintItems()` (`src/experience/hints/source.ts`: `interactRuntime.items`, the only read of the registry here).
  - Targets that share one approach point carry a `group` (the L4 Study Vault's books): `hintTargets` folds them into one bubble under the group's id and label (`L4:vault`, object line `vault`), whose Go only drives to the shared point (an unhandled command, so no book opens). Hover tags and clicks stay per target.
  - Every frame it moves the HUD bubble (`HintLayer`) over `hintAnchor`: above point-and-go's hover label; in first person at most 0.9 u above eye height, so a near target's bubble stays in view.
- Enter, a tap or a click opens `dialog.hints.kind.<kind>` (with the registry `label`) or an object line (`HINT_OBJECTS`, keyed by registry id such as `L1:pad:elevator`, `RF:station:cv`, `L1:station:highlights-about`).
- Go emits point-and-go's `{ type: "interact", item }`, so it drives and acts exactly like a click.
- No bubble during missions, autopilot, rides, beams, pickers, drawers, the Ask panel, while Rover talks or while point-and-go has a hovered or tap-selected target.
- Toggle: the "Hints" switch in the settings panel and Cmd-K ("hints: on/off" toast).

### Copy

- Every spoken line is at most 110 characters (`tests/unit/dialog-copy.test.ts`).
- Lines use the first name from `profile.name` (`firstName`), never a literal.

### E2E

- `e2e/onboarding.spec.ts` (helpers `freshVisit`, `expectLine`, `next`).
- `scripts/e2e-plan.ts` (see [Fast verification](performance.md)) maps:
  - the Ops Control Room files (`floors/labs/{OpsRoom,ops,opsLive,opsHash}`, `OpsBody`, `components/page/Production`, `AlertExcerpt`) to `production`, `labs` and `pageview`;
  - `src/hud/dialog/**` and `src/experience/hints/**` to `onboarding`, `experience` and `camera`.

## Glass Drawer (shared room panel)

### Opening and closing

- Every room on every floor renders through one drawer.
- It shows `store.activeRoom` while the phase is `room` and closes with `closeRoom()`.
- Open rooms with `store.getState().openRoom(id, tab?)`, or the `open` intent, a door trigger, or a mission `open` step.
  - `host3d.openRoom` opens the drawer on READY floors and navigates to the room page elsewhere.

### RoomView content

Content is a serializable, locale-resolved `RoomView` (`src/content/room-views/types.ts`):

| Field | Content |
|---|---|
| header | `code`, `title`, `subtitle`, `meta`, `badges` (optional `type`: career badges draw the type icon in `CAREER_TONE`), `accent` |
| `variant` | `"tabs"` for pods with Overview/Architecture/Results/Stack, `"single"` for everything else |
| `sections` | body, bullets, link items, chips |
| `metrics` | value, label, context |
| `architecture` | |
| `stack` | `{ name, logo? }`, logos from `getTechLogo` via `stackItems` |
| `gallery` | `RoomImage` = `GalleryImage`, rendered with `Gallery` strip and `Lightbox` |
| section `chipLogos` | aligned with `chips`; skills and post tags |
| link item `logo` | Roof channels, research profiles, models |
| header `logo` | career rooms: org logo; career `gallery` holds the linked pod's images or one cover per pod |
| `page` | Full case study / Open page |
| `external` | footer label `externalLabel`, default "Read post" |
| `link` | room on another floor, run with `goToRoom` from `missions/bridge.ts` |
| `hologram`, `prev`/`next` | |

### Builders and data

- One builder per floor in `src/content/room-views/` (`lobby`, `career`, `labs`, `library`, `roof`), aggregated by `buildRoomViews(locale)`.
- Exported at build time as one file per locale and floor, `/data/rooms/{locale}-{floor}.json` (`buildFloorRoomViews`; L1 to RF). A room lives in the file of its id prefix (`roomFloor`: `L1:highlights-about` in L1, `L3:reactor` in L3), and the drawer's prev/next arrows never leave a floor (a unit test checks both).
  - The secret B1 station views (`engine.ts`, `buildEngineRoomViews`) keep their own file, `/data/rooms/b1-{locale}.json`.
  - File names and URLs: `ROOMS_FILE` and `roomsUrl` in `hud/drawer/data-path.ts`, shared by the route and the client.
- Version: every file is fetched with `?v=<hash>`, the first 12 hex chars of the sha256 of its body (`roomDataVersions(locale)`, memoized per locale). The hashes ride in `ExperienceData.roomData`; `Experience` hands them to the loader (`setRoomDataVersions`) during its render, before any child effect fetches. Without one (dev prototypes) the plain path is fetched.
- Client loader (`hud/drawer/data.ts`): `loadFloorViews(locale, floor)` (one fetch per locale and floor, a failed load is forgotten so the next call refetches), `loadRoomView(locale, room)` (its floor's file only), `peekFloorViews` (synchronous, once loaded). There is no all-floors loader: nothing needs every floor.
- What loads when (pages never grow):
  - an open room loads its floor's file at once (deep links before the first frame), through `useFloorViews` in `DrawerHost`;
  - after the first 3D frame on idle: the rover's floor, then a ride's target floor as the rover heads there. Other floors load only on demand. A Lobby session fetches only the L1 file;
  - B1 is reached only through its floor, a ride to it or a `B1:` room, so a locked session never fetches it;
  - the hologram (`HologramOverlay`, `HologramStage`) reads the L3 file, the paper preview (`openPaperFor`) and `#library-topic=` the L4 file, `#labs-tech=` the L3 file.
- A floor phase owns its builder file; a test checks that every catalog room has a view.

### Custom bodies

- Register `({ view, locale }) => JSX` per room kind in `src/hud/drawer/bodies.tsx`.
- Rooms without one use the generic renderer (metrics, sections, stack, gallery).
- Shared blocks (`MetricTiles`, `Sections`, `Chips`) live in `hud/drawer/blocks.tsx`.

| Kind | Body |
|---|---|
| `roof` | `RoofBody`: email mailto plus copy with `click`, channels, the CV kiosk (page-one cover and "View CV" open the CV viewer modal, plus the PDF download with `click`) |
| `highlights` | `HighlightsBody`: cards from `RoomView.cards` ride to their room with `goToRoom`; the contact station reuses `ContactBody` and `CvBody` from `RoofBody` |
| `research` | `ResearchBody`, fed by the optional `RoomView.research`: `items` with authors, venue, DOI, summary, dated citations and `preview` (the paper preview modal data); `self` (the owner's name to highlight); `profiles`; `metrics` |
| `engine` | `EngineBody` (B1 chunk, fed by `RoomView.engine`): the station's own block (blueprint diagram, build rounds, gate list, plan excerpt or dashboard tiles) around the generic sections, plus the link to its Classic `/build` section |
| posts | the generic renderer with a "Read post" footer action (Medium posts: "Read the post" in a new tab) |

### Layout

- Side panel on desktop and landscape tablets at least 900 px wide, else a bottom sheet with snap points at 55% and 92% (`hud/drawer/layout.ts`).
  - Scrolling the body of a half-open sheet expands it.
- The side width is `--hq-drawer-w` in `globals.css`: 480 px, 560 px from 1280 px, 600 px from 1400 px.
  - Mirrored by `SIDE_WIDTHS`/`sideWidth` for the camera (a unit test keeps them equal).
  - While the [Ask](ask.md) side panel is open the drawer narrows to its 420 px so it sits exactly behind it.
- The follow camera shifts the rover into the middle of the uncovered area with `setViewOffset` (`cameraShift(layout, width)`).

### Structure

- A slim bar that stays put: code, prev/next arrows, "..." menu with README and the cross-floor link, close.
- One scrolling region (`drawer-body`): title, badges, subtitle and meta, then the tabs (sticky under the bar), then the tab body.
- A footer row (`drawer-footer`), wrapping on phones:
  1. primary action;
  2. "Visit live site" for pods with `RoomView.live` (new tab, `drawer-live-link`);
  3. the cross-floor link as a secondary amber button;
  4. View architecture.
- The "..." menu offers the cross-floor link too, and "Copy Classic link" and "Copy 3D link" (`ShareLinks`, see [page-view.md](page-view.md#shareable-links)).
- When the title scrolls away the bar condenses (`data-condensed`) and shows it.
- Result cards use `MetricTiles fluid` (two columns by container width).
- A case study's Overview tab opens with the metric strip (`MetricStrip variant="panel"`): the metrics marked `headline`, 3 across from a 22 rem container, stacked below, under the visible "Key results" label; values and labels only, never confidence. The Results tab keeps every result as `MetricTiles`.

### Keyboard

- Focus moves in and is trapped; Esc closes.
  - `DrawerHost` owns Esc for an open room: one window listener, mounted with the HUD, reads the store at key time and closes the room unless another `aria-modal` dialog owns the keyboard or the key was already handled. It works from the moment the store opens a room: while the room data loads (the loading card) and before `RoomDrawer` mounts (its own Esc handler stays for standalone use).
- `t` toggles the README terminal view (`hud/drawer/ascii.ts` renders the architecture with box-drawing characters).
- The drawer is `aria-modal`, so world keys pause while it is open.
- Clicking empty floor closes it; the rover does not move.

### URL

- `hud/drawer/urlSync.ts`, mounted by Experience:
  - opening pushes the room URL;
  - switching rooms and the hologram replace it (`?view=architecture`);
  - closing replaces it with the floor URL;
  - back/forward reopen or close rooms.
- Other query params (`?tier=`) are kept.
- Rooms without their own route (`hasPage`, from Experience: L4 shelves and Medium posts) keep the floor URL and are remembered in the history entry.

### Hologram view

- For hero pods with at least 3 nodes.
- `HologramStage` draws the diagram on the pod's stage by `layer`/`row`: packets on edges at 2 u/s, async edges dashed, a veil dims the world.
- `camera/focus.ts` flies the camera in (`hologramPose`); see [3D experience](3d-experience.md).
- `HologramOverlay` shows the result cards, prev/next hero pods (arrows, buttons, horizontal swipe) and Esc back to the drawer.
- E2E tests run WebGL on SwiftShader (`playwright.config.ts` launch args).

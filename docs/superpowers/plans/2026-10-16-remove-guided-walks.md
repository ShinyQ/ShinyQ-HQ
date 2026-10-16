# Remove Guided Walks Implementation Plan

Status: shipped in #167 (5f4c360), 2026-10-16

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the guided walks (tours) on every floor end to end, while keeping the first-visit onboarding, the "!" hint bubbles, the per-floor first-visit Rover lines, Cmd-K, point-and-go and the missions.

**Architecture:** Owner request 2026-10-16 ("Ive been thinking that we can remove tour things", clarified: the guided walks: "Quick tour" on L1, "Walk my journey" on L2, "Start project tour" on L3, "Start writing tour" on L4, "Meet me" on RF). Missions are separate goals (Ask Rover, Cmd-K) and stay; the four missions whose last step was `{ kind: "walk" }` get ordinary steps instead. The walk engine (`missions/walk.ts`, `missions/walks.ts`), the Walk HUD (`src/hud/walk/`), the `walk` mission step kind, the `walk` message namespace and the `?walk=on|off` flag go away. The first-visit floor line that `WalkLayer` spoke stays, without the walk choice, in a small `FloorIntroLayer`.

**Tech Stack:** Next.js 16 static export, React 19, zustand, next-intl, R3F, Vitest, Playwright.

## Global Constraints

- No em dashes (U+2014) anywhere (a unit test scans the repo).
- Every UI string is in `messages/en.json` and `messages/id.json` with identical keys; Indonesian natural and professional.
- Mission labels at most 40 characters; Rover dialog lines at most 110 characters (`tests/unit/dialog-copy.test.ts`).
- Old links that carried `?walk=on` or `?walk=off` must land on the floor without error (the parameter is simply ignored).
- Floor budgets the same or lower; the 3D main chunk and floor chunks the same or smaller (report bytes).
- No unused exports, messages or files left behind; `CLIENT_NAMESPACES` stays exact (`tests/unit/client-namespaces.test.ts`).
- Do not touch L3 layout geometry (another session owns it); only the walk-specific code and tests.

## Decisions

| Item | Decision |
|---|---|
| Missions | Kept. `highlights` "See the highlights" / "Lihat sorotan utama": elevator L1, drive and open `L1:highlights-about`. `journey` "Follow my career, 2019 to 2026" (label unchanged): elevator L2 only. `projects` "Browse my projects" / "Jelajahi proyek saya": elevator L3, palette `pods`. `blog` "Read my writing" (unchanged): elevator L4, palette `posts`. Static tier behaviour of `projects`, `blog` and `journey` is unchanged; `highlights` opens `/{locale}#intro`. |
| Floor lines | Kept (`dialog.floor.<id>` on the first visit to L2, L3, L4, RF), with no choices (A button / Enter continues). Driving, a point-and-go action or a scrub dismisses the line and marks it seen, like before. |
| Storage | New `localStorage["hq:floor-intro"]` (JSON floor list). `hq:walk-prompt` is still read as "seen" so returning visitors do not get a line again; it is never written. `hq:walk:<id>` keys are ignored. |
| Messages | `walk` namespace deleted. `walk.boardOpen`, `walk.boardCount` move unchanged to `labs.boardOpen`, `labs.boardCount`. `walk.proto` moves to `proto` and `walk.protoLibrary` to `proto.library` (dev prototypes only); `proto.prompt` deleted, `proto.hint` loses the walk sentence; `walk.more` becomes `proto.more` (prototype board label). |
| Prototypes | `FloorsPrototype` and `LibraryPrototype` (dev only) lose their walk UI; `scripts/dev-shots.ts` loses the `walk` shot. |
| Tests | e2e specs that used `?walk=off` or `hq:walk-prompt` to keep the floor line away call `skipFloorLines(page)` from `e2e/hq.ts`. `e2e/walk.spec.ts` is deleted. |

---

### Task 1: Missions without the walk step

**Files:**
- Modify: `content/site-content.json` (missions `highlights`, `journey`, `projects`, `blog`)
- Modify: `src/content/schema.ts` (delete `WalkIdSchema`, the `walk` step and `WalkId`)
- Modify: `src/experience/missions/{host.ts,host3d.ts,staticHost.ts,runner.ts,rooms.ts,bridge.ts}` (delete `walk`, `WALK_FLOOR`, `WALK_PALETTE`, `registerWalkStarter`, `startWalk`; `runMissionSteps` stays only if it still has a caller after Task 2, else delete)
- Modify: `src/hud/MissionHud.tsx` (host adapter `walk`), `src/hud/dialog/tutorial.ts` (comment)
- Test: `tests/unit/missions-runner.test.ts`, `tests/unit/missions-static-host.test.ts`, `tests/unit/missions-host3d.test.ts`, `tests/hud/MissionHud.test.tsx`, `tests/content/dataset.test.ts`

- [x] Step 1: In `tests/content/dataset.test.ts` add a test: no mission step has kind `walk`, and no mission label (en or id) matches `/\btours?\b|\btur\b/i`. Update `tests/hud/MissionHud.test.tsx` so the journey case expects steps `[{ kind: "elevator", floor: "L2" }]` and the highlights case expects `[{ kind: "elevator", floor: "L1" }, { kind: "drive", to: "L1:highlights-about" }, { kind: "open", room: "L1:highlights-about" }]` and navigation to `/en#intro`.
- [x] Step 2: Run `bunx vitest run tests/content/dataset.test.ts tests/hud/MissionHud.test.tsx`; expect FAIL.
- [x] Step 3: Edit the four missions in `content/site-content.json` as in Decisions; delete the walk step from the schema and every host; remove the `walk` host method from test doubles.
- [x] Step 4: `bunx vitest run tests/content tests/hud/MissionHud.test.tsx tests/unit/missions-*.test.ts` and `bun run validate:content`; expect PASS. (`tsc` still fails until Task 2 removes `WalkLayer`.)

### Task 2: Floor lines without walks; delete the walk engine and Walk HUD

**Files:**
- Create: `src/hud/dialog/FloorIntroLayer.tsx`
- Modify: `src/hud/dialog/floorIntro.ts` (`floorIntroLine(text)` returns `{ key: "floor", text, face: "arrived" }`), `src/hud/dialog/storage.ts` (`FLOOR_INTRO_KEY`, `floorIntroSeen(floor, storage?)`, `markFloorIntroSeen(floor, storage?)`, legacy read of `hq:walk-prompt`)
- Modify: `src/hud/Hud.tsx` (mount `FloorIntroLayer`, drop `walking`, `WalkPlacement`, the bottom slot portal), `src/hud/YearChip.tsx`, `src/hud/ask/AskDock.tsx` (drop `walkOnScreen`), `src/hud/ask/availability.ts`, `src/hud/drawer/layout.ts`, `src/hud/dialog/{placement.ts,HintLayer.tsx}`, `src/experience/hints/HintProbe.tsx`, `src/hud/ProfileCard.tsx` (comments), `src/experience/config.ts` (delete `WALK_FLOORS`, `NO_WALK_PROMPT`), `src/experience/Experience.tsx` (`tLabs` for the board strings), `src/i18n/client-messages.ts` (`walk` out, `proto` in), `messages/en.json`, `messages/id.json`, prototypes, `scripts/dev-shots.ts`
- Delete: `src/hud/walk/` (WalkBar, WalkLayer, WalkPrompt), `src/experience/missions/walk.ts`, `src/experience/missions/walks.ts`, `tests/unit/walk.test.ts`, `tests/unit/library-walk.test.ts`, `tests/hud/WalkBar.test.tsx`
- Test: `tests/unit/floor-intro.test.ts`, `tests/unit/dialog-storage.test.ts`, labsWalk cases in `tests/unit/labs-layout.test.ts` and `tests/unit/labs-spine.test.ts` (delete those cases only), `tests/unit/boot-first.test.ts` (example param), `tests/unit/client-namespaces.test.ts`, `tests/unit/ui-copy.test.ts`

- [x] Step 1: Rewrite `tests/unit/floor-intro.test.ts`: `FLOOR_LINES` is `["L2","L3","L4","RF"]`, `floorIntroLine("x")` has no `choices`, key `floor`, face `arrived`. Add to `tests/unit/dialog-storage.test.ts`: `floorIntroSeen` false on empty storage; true after `markFloorIntroSeen("L3")`, which writes `hq:floor-intro` = `["L3"]`; true for a floor listed in legacy `hq:walk-prompt`; blocked storage does not throw.
- [x] Step 2: Run them; expect FAIL.
- [x] Step 3: Implement `floorIntroLine`, the storage helpers and `FloorIntroLayer` (props `data: ExperienceData`): after `useOnboardingSettled()`, while exploring (phase `explore`, no ride, no running mission) on a floor in `FLOOR_LINES` not yet seen, wait 700 ms, then `say(floorIntroLine(t(floor, { name })), { id: "floor:<floor>" })`; `done` or `skipped` marks seen; `cancelled` does not; a `move`, `interact` or `scrub` intent while the line is pending or showing marks it seen and cancels it. Cleanup cancels the dialog id.
- [x] Step 4: Delete the walk files and their references listed above; move the messages per Decisions; update the prototypes (no walk controller, prompt or bar) and `dev-shots.ts`.
- [x] Step 5: `bun run typecheck && bun run lint && bun run test`; expect PASS. `rg -n "WalkLayer|WalkBar|createWalk|WALK_FLOORS|startWalk|WalkId|useTranslations\(\"walk" src tests scripts` returns nothing.

### Task 3: Copy that points at tours

**Files:** `messages/en.json`, `messages/id.json`

- [x] `dialog.onboarding.askRover`: EN "Not sure where to go? Ask Rover has shortcuts to the best rooms." ID "Belum tahu mau ke mana? Tanya Rover punya jalan pintas ke ruang-ruang terbaik."
- [x] `dialog.hints.object.askRover`: EN "The Ask Rover kiosk: shortcuts to the best rooms in the HQ." ID "Kios Tanya Rover: jalan pintas ke ruang terbaik di HQ."
- [x] `bunx vitest run tests/unit/dialog-copy.test.ts tests/unit/ui-copy.test.ts tests/unit/hint-lines.test.ts`; PASS. (Folded into Task 2's commit if done together.)

### Task 4: E2E specs and the e2e plan

**Files:**
- Modify: `e2e/hq.ts` (add `skipFloorLines(page)`: init script that sets `hq:floor-intro` to all five floors)
- Delete: `e2e/walk.spec.ts`; its entries in `e2e/durations.json`
- Modify: every spec that uses `?walk=` or `hq:walk-prompt` (`camera-visual`, `labs-data`, `library-labels`, `delivery-visual`, `pads`, `interact`, `screenshots`, `workshop`, `roof`, `visits`, `labs-paths`, `production`, `labs`, `fast-return`, `spectacle`, `career`); rewrite walk tests: `onboarding.spec.ts` floor lines (no choices; Enter closes; `hq:floor-intro` contains L2; deep-link case ends on the L4 line), `hud.spec.ts` (bottom band without the walk pill), `highlights.spec.ts` (mission rides to L1 and opens `L1:highlights-about`), `roof.spec.ts` (delete the Meet me walk test), `career.spec.ts` (Follow my career rides to L2 and explores), `library-roof.spec.ts` (Read my writing rides to L4 and opens the posts palette), `missions.spec.ts` (title), `experience.spec.ts` (comment)
- Modify: `scripts/e2e-plan.ts` (drop the `walk` spec and its rule), `tests/unit/e2e-plan.test.ts`

- [x] Step 1: Edit specs and the plan; `bunx vitest run tests/unit/e2e-plan.test.ts` PASS; `bunx playwright test --list` lists no `walk.spec.ts`.
- [x] Step 2: Build and run the touched specs: `bun run build && E2E_PORT=<port> bunx playwright test e2e/onboarding.spec.ts e2e/highlights.spec.ts e2e/career.spec.ts e2e/library-roof.spec.ts e2e/roof.spec.ts e2e/hud.spec.ts e2e/missions.spec.ts`; PASS.

### Task 5: Docs

**Files:** `README.md`, `docs/features.md`, `docs/content.md`, `AGENTS.md`

- [x] README: drop the "Guided walks" highlight and the walk mentions in the routes table and structure line.
- [x] features.md: status rows, "Rover's tour, hints and floor lines" (floor lines without the walk choice), the per-floor walk bullets, `?walk=` flag, Highlights Hall "Quick tour"; add a status log row "Guided walks removed (owner request 2026-10-16)".
- [x] content.md: "the project tour" out of the gallery-first list.
- [x] AGENTS.md: delete the "Guided walks" and "Walk HUD" bullets, `hud/walk/`, `walks.ts` in the folder layout, `hq:walk:*` and `hq:walk-prompt` keys (add `hq:floor-intro`), `WalkIdSchema` and the mission `walk` step, the walk glossary entry, walk mentions in Missions, Point-and-go, onboarding and HUD layout sections.
- [x] `rg -n -i "guided walk|walk hud|WalkLayer|\?walk=" README.md docs/features.md docs/content.md AGENTS.md` returns nothing.

### Task 6: Verification and PR

- [x] `bun run verify:quick`; `bun run e2e:changed` (full suite since `e2e/hq.ts` changed: run the floor specs listed in Task 4 plus `experience`, `interact`, `pads` locally, CI runs the rest).
- [x] `E2E_PORT=<port> bun run e2e:perf` (bytes and floors); report main path and floor chunk gzip bytes before and after.
- [x] Classic JS: compare `out/_next/static/chunks` totals for a Classic page before/after.
- [x] After captures (same script as before) for L1 to RF at 1440x900 and 390x844.
- [x] Rebase on `origin/main`, check `gh run list -s in_progress` and `-s queued`, push, open the PR (do not merge), report to the coordinator.

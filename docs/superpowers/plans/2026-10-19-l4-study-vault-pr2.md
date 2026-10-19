# L4 Study Guides, PR2: the 3D Study Vault Implementation Plan

Status: in review

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Study Vault alcove off the L4 end plaza where four giant holo books (exam code on the spine, issuer
tones) slide their covers out as the Rover approaches, and selecting a book opens the in-app study guide reader
shipped in PR1 (#243, plan [2026-10-19-l4-study-guides-pr1.md](2026-10-19-l4-study-guides-pr1.md)).

**Architecture:** The newsroom layout gains a vault (spur road off the ring road, a small round plaza, a stop
`L4:vault`, a camera zone, four book slots and their obstacles) from a new `guides` input. The scene draws the
books with two instanced meshes on the shared holo material, the spines join the end plaza's `FloatingSigns`
group as a new sign kind so the existing screen-space placement keeps every label apart, and each book registers a
point-and-go target that drives to the stop and sends the `hq:hud` `guide` command. Everything lives in the lazy
L4 chunk.

**Tech Stack:** React Three Fiber, three 0.186, troika text via `FloatingSigns`, Zustand store, Vitest,
Playwright perf lane.

Spec: [`docs/superpowers/specs/2026-10-19-l4-study-vault-design.md`](../specs/2026-10-19-l4-study-vault-design.md),
section "3D Study Vault (PR2)". Builds on PR1: `content/study-guides.json`, `guideViews(locale)`
(`src/content/guide-views.ts`), the `{ type: "guide"; slug }` hud command (`sendHudCommand` in `src/hud/events.ts`;
`DialogHost` opens the reader; there is no `openGuide` helper any more).

## Global Constraints

- No em dash (U+2014) anywhere. Bun only. Conventional commits via `rtk git`. Never push from a task.
- Floor chunk rule: never import `Library` or its decor statically from the `Experience.tsx` closure
  (`tests/unit/floor-chunks-graph.test.ts`). New vault code lives under `src/experience/floors/library/`.
- 3D memory: `useDispose(value)` after every memoized geometry, texture or material. Animate with `useFrame`
  deltas only; never start another rAF loop. Reduced motion holds every animation; lite drops halos and additive
  glow.
- No words painted on a floor: words are `FloatingSigns`. In-world targets go through the point-and-go registry
  (`registerExtraInteractables`); no navigation `onClick` on scene objects.
- Budgets (`e2e/budgets.ts`, `e2e/perf/baseline.json`): scene draw calls under 150 on any floor; triangles under
  30k; programs at most baseline plus 2 (L4 lite 43, full 77); L4 chunk under 16 KB gzip (now about 10 KB). The
  vault adds at most 4 draw calls on full and 3 on lite at its own view, under 1k triangles, and no new shader
  program (reuse `createHoloMaterial` modes).
- Space rules (`nav/space.ts`): roads keep their half width clear; 6 u clear floor between obstacles (3 u rover
  radius); pads off roads; every room or stop reachable. The Express Return pad (end + (-4, 15)), the archive board
  (east rim) and the monument (north rim) keep their clearances.
- Labels: no label may cover another (owner decision): the spines go through the end plaza placement
  (`endPlazaFrame`, `placeLabels`), and the L4 label sweep (`tests/unit/library-label-sweep.test.ts`) and
  `e2e/library-labels.spec.ts` / `e2e/topics.spec.ts` stay clean, with a new `vault` pose.
- Strings: new 3D-only strings go in `hud.interact` (en and id, identical keys): `studyGuide` ("Read the {code}
  study guide" / "Baca panduan belajar {code}") and `studyVault` ("Study Vault" / "Study Vault").
- Owner review: desktop 1440x900, tablet 834x1194 and phone 390x844 captures of the vault before merge.

## File map

| File | Responsibility |
|---|---|
| `src/experience/types.ts` (`LibraryData`), `src/content/experience-floors.ts` | `guides: { slug; spine; issuer; code; title }[]` in the floor data |
| `src/experience/floors/library/model.ts` | `LibraryLayoutInput.guides`, `LibraryEnd.vault`, `VaultBook` |
| `src/experience/floors/library/concepts/newsroom.ts` | `NEWSROOM.end.vault` constants, road, plaza, stop, zone, books, obstacles, bounds |
| `src/experience/interact/pick.ts`, `src/experience/scene/Director.tsx`, `src/hud/dialog/hintLines.ts` | `guide:<slug>` command |
| `src/experience/floors/library/decor/StudyVault.tsx`, `decor/vault.ts` | Scene (instanced books, covers, halos) and pure helpers (cover offset by distance, book transforms, tones) |
| `src/experience/floors/library/decor/EndPlaza.tsx`, `decor/signFrame.ts` | `guide` sign kind, spine specs, priorities |
| `src/experience/fx/probes.ts` | `probes.vault` (`books`, `open` per book, `spines` shown) |
| `messages/en.json`, `messages/id.json` | `hud.interact.studyGuide`, `hud.interact.studyVault` |
| Tests | `tests/unit/library-layout.test.ts`, `tests/unit/library-vault.test.ts`, `tests/unit/library-label-sweep.test.ts`, pick/registry tests, `e2e/guides-vault.spec.ts`, `e2e/library-labels.spec.ts`, `e2e/perf/floors.spec.ts` |
| Docs | `docs/agents/floor-l4-library.md`, `docs/features.md`, `docs/decisions/2026-10-19-l4-study-vault.md`, spec status |

---

### Task 1: Vault data and layout

**Interfaces (produces):**

```ts
// floors/library/model.ts
export interface LibraryGuideInput { slug: string; spine: string; issuer: string; code: string | null; title: string }
// LibraryLayoutInput gains: guides?: readonly LibraryGuideInput[]
export interface VaultBook { slug: string; spine: string; issuer: string; code: string | null; title: string; at: Vec2; facing: Vec2; rect: Rect }
export interface LibraryVault { center: Vec2; stop: Vec2; entry: Vec2; books: VaultBook[]; radius: number }
// LibraryEnd gains: vault: LibraryVault | null
```

- `LibraryData` gains `guides`, filled in `buildLibraryData(locale)` from `guideViews(locale)` (keep only the
  fields above; order = file order).
- `libraryLayoutInput` maps them; `EMPTY.guides = []`. No guides: no vault, no road, no stop (the floor is
  unchanged byte for byte: assert the existing layout snapshot/test values hold).
- Geometry (start values; the tests decide the final constants, record them in `NEWSROOM.end.vault`):
  - `entry`: the ring road vertex at 135 degrees (south-east): `ringRoadPoints(end, ring, segments)[6]`.
  - A road `vault` from `entry` outward along (0.7071, 0.7071) to the vault plaza center, width
    `LIBRARY_FLOOR.road`.
  - A round plaza `vault` (diameter about 16, `ROAD.minPlaza`) whose center sits about 22 u from `end` along the
    same diagonal; stop `L4:vault` at the plaza center side nearest the ring (so the rover faces the books).
  - Four books on an arc on the far side of the vault plaza, facing the stop (`facing` = unit vector toward the
    stop), about 3 u apart along the arc; each book's footprint about 1.2 x 2.6 u (`rect`, an obstacle), height
    about 4.2 u (`tall`).
  - Camera zone `L4:vault`: `around(stop, 2.5)`, yaw looking from the stop toward the books, zoom about 1.15;
    `classView.mobile` zoom about 0.95 so all four spines fit a 390 px portrait view.
  - Bounds include the vault plaza and the books plus margin.
- `floor.stops["L4:vault"] = stop`.

- [ ] Tests first (`tests/unit/library-vault.test.ts` plus `library-layout.test.ts` additions): with the real
  content the vault exists with four books in file order; `expectSpaceRules` and `expectPadRules` pass; the
  stop is reachable by `pathBetween` from the arrival point; each book rect is at least 3 u from the Return pad, the
  board, the monument, the ring road edge and the slab edge; books do not overlap each other; the view zone
  contains the stop; with `guides: []` the layout equals the old one (roads, plazas, bounds, stops).
- [ ] Implement; run the L4 layout, ring road, pad and arrivals tests (`bunx vitest run tests/unit/library*
  tests/unit/ring-road.test.ts tests/unit/pad-space.test.ts tests/unit/arrivals.test.ts`).
- [ ] Commit `feat(vault): L4 Study Vault layout off the end plaza`.

### Task 2: The guide command and book targets

- `InteractCommand` gains `{ type: "guide"; slug: string }`; `parseCommand("guide:<slug>")` accepts
  `/^guide:([a-z0-9-]{2,40})$/`; the Director handles it with `sendHudCommand({ type: "guide", slug })`;
  `hintLines` gets a line if commands there are exhaustive.
- Books register through `registerExtraInteractables("L4", items)` from `StudyVault.tsx` (Task 3) or as built-in
  items in `registry.ts` next to `endItems` (choose built-in: the registry already derives L4 end items from the
  layout; one item per book: `id: "L4:vault:<slug>"`, `kind` reuse the station kind used by `endItems`, `label:
  labels.studyGuide(code ?? spine)`, `at: vault.stop`, `bounds: book.rect`, `height: 4.2`, `action: { type:
  "command", command: "guide:<slug>" }`). `InteractLabels` gains `studyGuide: (code: string) => string`, wired
  from `hud.interact.studyGuide` where the other labels are built (`Scene.tsx`).
- [ ] Tests first: parse accepts and rejects; the registry builds four vault items with the right action and
  bounds; performing one drives to the stop then dispatches the `guide` command (follow the existing pick tests).
- [ ] Implement, run the interact tests, commit `feat(vault): book targets open the study guide reader`.

### Task 3: The vault scene and spine signs

- `decor/vault.ts` (pure): `coverOpen(distance: number): number` (0 beyond 8 u, 1 within 3 u, smoothstep
  between), `bookMatrix`/`coverMatrix` helpers (book standing upright, spine toward the stop, cover hinged on the
  spine edge sliding out up to 0.6 u and turning up to 35 degrees when open), `ISSUER_TONE` (Microsoft
  `#22d3ee`, GitHub `#a78bfa`, Google `#fbbf24`, fallback `#f4f4f5`; reuse existing tone constants if L4 or the
  Classic shelf already has them).
- `StudyVault.tsx`: one `instancedMesh` for the four bodies and one for the four covers (box geometry,
  `createHoloMaterial` in an existing mode with per-instance color via `setColorAt` or the existing instance
  color path), a halo ring under the vault plaza only on full (reuse the plaza glow or `HOLO_MODE.dot`), all with
  `raycast={NO_RAYCAST}` (point-and-go handles picking). `useFrame((_, dt) => ...)` eases each cover toward
  `coverOpen(distance(rover, book))` at a fixed rate scaled by `dt`; reduced motion snaps covers open and holds
  any pulse; `useDispose` on every geometry and material. Mounted from `EndPlaza` (or `Library.tsx`) only when
  `layout.end.vault` exists.
- Spines: `endPlazaSigns` pushes one sign per book (`text: spine`, issuer tone, `FONTS.monoBold`, font about
  0.42, upright at the book's spine face, positions relative to the end plaza center) plus one `studyVault` sign
  above the arc; `EndSignMeta.kind` gains `"guide"` and `"vault"`. In `endPlazaFrame`, guide and vault signs are
  not fixed; their priority sits above ordinary topics when the rover is within the vault plaza and below them
  otherwise (so the constellation view stays as it is); `END_SIGN_NEAR.guide = 0`, `vault = 0`; raise
  `END_LABEL_MAX` only if the sweep shows spines starved at the vault view (keep the phone cap reasoning).
- Probe `__hq.probes.vault`: `{ books: string[]; open: number[]; spines: number }`.
- [ ] Tests first: `vault.ts` unit tests (coverOpen bounds and monotonic, matrices keep the spine toward the
  stop); `library-label-sweep.test.ts` gains a `vault` pose (drive to `stops["L4:vault"]`) and still passes at
  every pose and orbit angle; the existing sweep poses keep their numbers (no new overlap).
- [ ] Implement; run the sweep, the floor chunk graph test and `bun run build`; measure the L4 chunk gzip.
- [ ] Commit `feat(vault): holo books with sliding covers and spine signs`.

### Task 4: e2e, perf and budgets

- `e2e/guides-vault.spec.ts` (desktop 1440x900 and phone 390x844, lite tier like the other L4 label specs,
  `/api/guides/**` routed to the PR1 fixture with `routeGuides` from `e2e/fixtures/guide-pdf.ts`): enter
  `/en/library`, drive to `L4:vault` with `driveTo`, wait for `probes.vault.open` all above 0.9 (reduced motion
  off) or snapped (reduced motion on), click a book through `clickablePoint(page, "L4:vault:gh-600")`, the guide
  dialog opens with page 1 rendered, no new page opened, Esc closes and 3D input resumes (the rover moves on a key
  press). Also: point-and-go from the end plaza (click a book while the rover is at `L4:topics`) drives to the stop
  and opens the reader.
- `e2e/library-labels.spec.ts` and `e2e/topics.spec.ts`: add the `vault` pose; overlap stays under the existing
  thresholds.
- `e2e/perf/floors.spec.ts`: add an L4 vault pose; draw calls, triangles and programs within budget on full and
  lite; update `e2e/perf/baseline.json` only if programs change (they must not).
- `bytes-3d`: the L4 chunk stays under 16 KB; record the new size.
- [ ] Write the specs; run them twice green (`E2E_PORT=<random> bunx playwright test e2e/guides-vault.spec.ts
  e2e/library-labels.spec.ts e2e/topics.spec.ts`, `PERF=1 E2E_PORT=<random> bunx playwright test
  e2e/perf/floors.spec.ts e2e/perf/bytes-3d.spec.ts`). Update the e2e planner mapping so vault files run these
  specs.
- [ ] Commit `test(vault): reader from the 3D vault, label sweep pose and floor budgets`.

### Task 5: Owner captures and docs

- Captures (not committed): desktop 1440x900, tablet 834x1194, phone 390x844, each at the vault stop (covers
  open) and from the constellation stop looking at the vault, full tier, plus the reader opened from a book on the
  phone; save under the session files folder `vault-shots/`.
- Docs: `docs/agents/floor-l4-library.md` (Study Vault section: layout constants, scene, signs and placement,
  targets, probe, budgets measured), `docs/features.md` (L4 bullet and status row), the decision file
  `docs/decisions/2026-10-19-l4-study-vault.md`, the spec Status line, the PR1 plan link.
- [ ] Commit `docs(vault): L4 Study Vault rules, features and decision`.

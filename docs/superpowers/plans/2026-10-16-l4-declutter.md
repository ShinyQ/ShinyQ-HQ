# L4 Declutter (Round 7 F) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Normalize the L4 Writing floor's floating text (keep the Newsroom layout): one sign per section, no overlapping labels, year plates as low posts on the road edge, station titles only for the nearest stations, one height rule.

**Architecture:** Pure sign specs (`decor/signs.ts`) build one list of every timeline sign (section signs, post titles, year posts) with metadata; a pure placement rule (`signPlacement.ts`) picks which show each frame by tier (picked titles, sections, years, titles), nearness to the rover and per-kind caps, rejecting any that overlap on screen. A hook projects each plate to the screen every frame (shared `fx/plateProjection.ts`, also used by the end plaza hook), runs the rule and feeds `FloatingSigns` through its `visibility` prop. All timeline text becomes one `FloatingSigns` group (2 draw calls) instead of one troika `Text` per station.

**Tech Stack:** TypeScript, React Three Fiber, three.js, troika (BatchedText via `FloatingSigns`), Vitest, Playwright.

## Global Constraints

- Spec: Round 7 design section 8 (F) and section 2 (shared rules). Owner request (verbatim): "Also in L4 writing i think its too full floating (normalize or revamp it so it can looks better)". Owner chose Normalize.
- One sign per section (Posts, Research, Models and datasets, Talks and workshops) at its entrance; the duplicate floating labels go.
- Section signs and station titles are placed with `src/experience/fx/labelPlacement.ts` rules (nearest and picked first), nothing overlaps.
- Year plates become small markers on the road edge (low posts), not floating billboards. No words painted on a floor (owner rule).
- Station titles: nearest only, at most 6 visible on desktop and 4 on phones (`width < 600`), the rest fade out.
- One height rule for all floating text on the L4 timeline.
- The topic constellation, research monument and Return pad at the end stay as they are (#98).
- Budgets: L4 draw calls and triangles do not increase; no new shader program; L4 chunk cap from #157 (16 KB gzip); ride peaks unchanged.
- Success: e2e label-overlap check over the L4 approach, mid-floor and each zone at 1440x900 full and 390x844 lite, no overlap above 2 percent of the smaller plate.
- No em dashes anywhere. Bilingual strings unchanged (no new copy). Docs: `AGENTS.md`, `docs/features.md`.

---

## File Structure

- Modify `src/experience/floors/library/decor/signs.ts`: the one height rule (`L4_SIGN`), section, title and year-post specs, `librarySigns()` with metadata. Pure.
- Modify `src/experience/floors/library/concepts/newsroom.ts`: year marks move to the road edge in the gap before the first post of the year.
- Create `src/experience/floors/library/signPlacement.ts`: `placeLibraryLabels` (pure).
- Create `src/experience/fx/plateProjection.ts`: `projectPlate` (camera-facing upright plate to a screen box and quad).
- Modify `src/experience/floors/library/decor/useEndSignPlacement.ts`: use `projectPlate`; publish its shown boxes (`endPlazaScreen`) so timeline labels yield to them. Behavior unchanged.
- Create `src/experience/floors/library/decor/useLibrarySignPlacement.ts` and `decor/LibrarySigns.tsx`.
- Modify `src/experience/floors/library/decor/NewsroomDecor.tsx`: `LibrarySigns` replaces `StationLabels` and `ZoneSigns`; year posts join the wall's line batch.
- Modify `src/experience/fx/probes.ts`: `library.labels`.
- Tests: `tests/unit/floor-signs.test.ts`, new `tests/unit/library-sign-placement.test.ts`, new `tests/unit/plate-projection.test.ts`, new `e2e/library-labels.spec.ts`, `scripts/e2e-plan.ts` mapping.

---

### Task 1: Pure sign specs and year posts

**Files:**
- Modify: `src/experience/floors/library/decor/signs.ts`
- Modify: `src/experience/floors/library/concepts/newsroom.ts` (years block)
- Test: `tests/unit/floor-signs.test.ts` (L4 describe)

**Interfaces:**
- Produces:
  - `L4_SIGN = { bottom: 5.6 }`, `ZONE_SIGN = { fontSize: 0.8, letterSpacing: 0.12 }`, `TITLE_SIGN = { fontSize: 0.4, wrap: 22 }`, `YEAR_POST = { fontSize: 0.45, top: 0.9, edge: 0.4 }`
  - `type LibrarySignKind = "section" | "title" | "year"`; `interface LibrarySignMeta { kind: LibrarySignKind; zone: LibraryZone; room?: RoomId }`
  - `zoneSignSpecs(layout, zones): SignSpec[]` (bottom at `L4_SIGN.bottom`)
  - `stationTitleSpecs(stations: readonly LibraryStation[], titles: Map<RoomId, string>): SignSpec[]` (blog stations only, over the station center)
  - `yearPostSpecs(years): SignSpec[]`, `yearPostSegments(years): [number, number, number, number, number, number][]`
  - `librarySigns({ layout, zones, titles, titled }): { signs: SignSpec[]; meta: LibrarySignMeta[] }` (order: sections, years, titles)

- [ ] **Step 1: Write the failing tests** in `tests/unit/floor-signs.test.ts`, replacing the "L4 floating signs" describe:

```ts
describe("L4 floating signs (Round 7 F: one height rule)", () => {
  const titles = stationTitles(data.library, zones);
  const featured = library.stations[0];
  const titled = library.stations.filter((s) => s !== featured);

  it("floats one sign per present zone at its entrance, plate bottom on the one L4 height", () => {
    const signs = zoneSignSpecs(library, zones);
    expect(signs).toHaveLength(new Set(library.stations.map((s) => s.zone)).size);
    for (const s of signs) {
      const zone = (Object.keys(zones) as (keyof typeof zones)[]).find((z) => zones[z].toUpperCase() === s.text)!;
      expect([s.x, s.z]).toEqual([library.signs[zone].at.x, library.signs[zone].at.z]);
      expect(s.color).toBe(ZONE_TONE[zone]);
      expect(s.y - signPlate(s).h / 2).toBeCloseTo(L4_SIGN.bottom);
    }
    expect(L4_SIGN.bottom).toBeGreaterThan(ROVER_HEIGHT);
  });

  it("titles only the post stations (shelves keep their zone sign alone), on the same height", () => {
    const signs = stationTitleSpecs(titled, titles);
    const posts = titled.filter((s) => s.zone === "blog");
    expect(signs).toHaveLength(posts.length);
    signs.forEach((s, i) => {
      expect([s.x, s.z]).toEqual([posts[i].center.x, posts[i].center.z]);
      expect(s.text.replace(/\n/g, " ")).toBe(titles.get(posts[i].room));
      expect(s.text.split("\n").every((l) => l.length <= TITLE_SIGN.wrap || !l.includes(" "))).toBe(true);
      expect(s.y - signPlate(s).h / 2).toBeCloseTo(L4_SIGN.bottom);
    });
  });

  it("puts every year on a low post at the road edge, in the gap before its first post", () => {
    const years = library.extras.years ?? [];
    expect(years.length).toBeGreaterThan(0);
    const signs = yearPostSpecs(years);
    const posts = yearPostSegments(years);
    signs.forEach((s, i) => {
      expect(s.text).toBe(years[i].year);
      expect(Math.abs(s.z)).toBeCloseTo(LIBRARY_FLOOR.road / 2 + YEAR_POST.edge);
      expect(s.y - signPlate(s).h / 2).toBeCloseTo(YEAR_POST.top);
      expect(s.y + signPlate(s).h / 2).toBeLessThan(ROVER_HEIGHT);
      expect(posts[i]).toEqual([s.x, 0, s.z, s.x, YEAR_POST.top, s.z]);
      // Off every station and spur.
      for (const st of library.stations) {
        expect(s.x < st.rect.minX || s.x > st.rect.maxX || s.z < st.rect.minZ || s.z > st.rect.maxZ).toBe(true);
        expect(Math.abs(s.x - st.from.x)).toBeGreaterThan(DOCK.spurWidth / 2);
      }
    });
  });

  it("lists sections, years and titles once each, with their kind; no title repeats a zone name", () => {
    const { signs, meta } = librarySigns({ layout: library, zones, titles, titled });
    expect(signs).toHaveLength(meta.length);
    const texts = signs.map((s) => s.text.replace(/\n/g, " ").toUpperCase());
    expect(new Set(texts).size).toBe(texts.length);
    expect(meta.filter((m) => m.kind === "section")).toHaveLength(zoneSignSpecs(library, zones).length);
    expect(meta.filter((m) => m.kind === "title").every((m) => m.zone === "blog" && m.room)).toBe(true);
    expect(meta.some((m) => m.kind === "title" && m.room === featured.room)).toBe(false);
  });
});
```

Imports to add: `stationTitles` from `@/experience/floors/library/decor/common` is a client module with three imports; instead build titles inline: `new Map(data.library.posts.map((p) => [\`L4:${p.slug}\`, p.title]))` cast to `Map<RoomId, string>`. Import `L4_SIGN, TITLE_SIGN, YEAR_POST, librarySigns, stationTitleSpecs, yearPostSegments, yearPostSpecs, zoneSignSpecs` from signs, `DOCK, LIBRARY_FLOOR` from model.

- [ ] **Step 2: Run** `bunx vitest run tests/unit/floor-signs.test.ts` and expect FAIL (exports missing).

- [ ] **Step 3: Implement `signs.ts`**:

```ts
import type { RoomId } from "@/content/schema";
import { signPlate, wrapSign, type SignSpec } from "../../../fx/signLayout";
import { FONTS } from "../../../tower/primitives";
import type { Vec2 } from "../../../types";
import { LIBRARY_ZONES, ZONE_TONE, type LibraryLayout, type LibraryStation, type LibraryZone } from "../model";

/** One height rule (Round 7 F): every floating plate on the L4 timeline has its bottom here, above the rover and the station icons. */
export const L4_SIGN = { bottom: 5.6 } as const;
export const ZONE_SIGN = { fontSize: 0.8, letterSpacing: 0.12 } as const;
/** Post titles: type size and the wrap width (characters). */
export const TITLE_SIGN = { fontSize: 0.4, wrap: 22 } as const;
/** Year markers: a low post on the road edge (`edge` past it) with a small plate on top (`top` = post height). */
export const YEAR_POST = { fontSize: 0.45, top: 0.9, edge: 0.4 } as const;

export type LibrarySignKind = "section" | "title" | "year";
export interface LibrarySignMeta { kind: LibrarySignKind; zone: LibraryZone; room?: RoomId }

const atBottom = (bottom: number, spec: Omit<SignSpec, "y">): SignSpec => ({ ...spec, y: bottom + signPlate(spec).h / 2 });

export function zoneSignSpecs(layout, zones) { ... same filter, atBottom(L4_SIGN.bottom, {...}) }
export function stationTitleSpecs(stations, titles) { blog stations: atBottom(L4_SIGN.bottom, { text: wrapSign(titles.get(room) ?? room, TITLE_SIGN.wrap), x: center.x, z: center.z, color: ZONE_TONE.blog, fontSize: TITLE_SIGN.fontSize, font: FONTS.monoBold }) }
export function yearPostSpecs(years) { atBottom(YEAR_POST.top, { text: year, x, z, color: ZONE_TONE.blog, fontSize: YEAR_POST.fontSize, font: FONTS.monoBold }) }
export function yearPostSegments(years) { years.map(({ at }) => [at.x, 0, at.z, at.x, YEAR_POST.top, at.z]) }
export function librarySigns({ layout, zones, titles, titled }) { sections (meta zone from LIBRARY_ZONES filter), years (zone "blog"), titles (zone "blog", room) }
```

Remove `YEAR_MARK` and `yearMarkSigns` (no other users).

- [ ] **Step 4: Move the year marks** in `concepts/newsroom.ts` (inside the `timeline.forEach`):

```ts
// A low post on the road edge in the gap before the first post of the year (Round 7 F: no billboard in the camera path).
const s = lane[i];
years.push({ year, at: { x: s.from.x - (STATION_SIZE.blog.along / 2 + DOCK.gap / 2), z: s.from.z + s.facing.z * (LIBRARY_FLOOR.road / 2 + YEAR_POST_EDGE) } });
```

`YEAR_POST_EDGE` must equal `YEAR_POST.edge`: import `YEAR_POST` from `../decor/signs` (pure module, no React) and import `DOCK`, `STATION_SIZE` from `../model`.

- [ ] **Step 5: Run** `bunx vitest run tests/unit/floor-signs.test.ts tests/unit/library-*.test.ts` and expect PASS.
- [ ] **Step 6: Commit** `feat(l4): one height rule for timeline signs, year marks on low posts`.

### Task 2: Pure placement rule

**Files:**
- Create: `src/experience/floors/library/signPlacement.ts`
- Test: `tests/unit/library-sign-placement.test.ts`

**Interfaces:**
- Consumes: `LibrarySignKind` (Task 1), `ScreenBox`, `boxesOverlap`, `LABEL_GAP` from `fx/labelPlacement.ts`.
- Produces:
  - `interface LibraryLabel { kind: LibrarySignKind; box: ScreenBox | null; distance: number; picked?: boolean }`
  - `LIBRARY_LABEL_MAX = { title: { wide: 6, narrow: 4 }, section: 4, year: 3 }`, `TITLE_RANGE = 28`
  - `placeLibraryLabels(labels: readonly LibraryLabel[], opts: { narrow: boolean; fixed?: readonly ScreenBox[] }): boolean[]`

- [ ] **Step 1: Write the failing tests**:

```ts
import { describe, expect, it } from "vitest";
import { boxesOverlap } from "@/experience/fx/labelPlacement";
import { LIBRARY_LABEL_MAX, placeLibraryLabels, TITLE_RANGE, type LibraryLabel } from "@/experience/floors/library/signPlacement";

const box = (x: number, y = 0, w = 100, h = 30) => ({ x0: x, y0: y, x1: x + w, y1: y + h });
const title = (x: number, distance: number, picked = false): LibraryLabel => ({ kind: "title", box: box(x), distance, picked });

describe("placeLibraryLabels", () => {
  it("never shows two overlapping labels and keeps the nearer one", () => {
    const shown = placeLibraryLabels([title(0, 20), title(50, 5)], { narrow: false });
    expect(shown).toEqual([false, true]);
  });
  it("puts sections before years before titles", () => {
    const shown = placeLibraryLabels([title(0, 1), { kind: "year", box: box(10), distance: 9 }, { kind: "section", box: box(20), distance: 30 }], { narrow: false });
    expect(shown).toEqual([false, false, true]);
  });
  it("a picked title wins over a section", () => {
    expect(placeLibraryLabels([{ kind: "section", box: box(0), distance: 1 }, title(10, 20, true)], { narrow: false })).toEqual([false, true]);
  });
  it("caps titles at 6 on desktop and 4 on phones, nearest first", () => {
    const many = Array.from({ length: 9 }, (_, i) => title(i * 200, 9 - i));
    const wide = placeLibraryLabels(many, { narrow: false });
    const narrow = placeLibraryLabels(many, { narrow: true });
    expect(wide.filter(Boolean)).toHaveLength(LIBRARY_LABEL_MAX.title.wide);
    expect(narrow.filter(Boolean)).toHaveLength(LIBRARY_LABEL_MAX.title.narrow);
    expect(narrow.slice(5)).toEqual([true, true, true, true]);
  });
  it("hides titles beyond TITLE_RANGE and labels without a box", () => {
    expect(placeLibraryLabels([title(0, TITLE_RANGE + 1), { kind: "section", box: null, distance: 0 }], { narrow: false })).toEqual([false, false]);
  });
  it("yields to fixed boxes (the end plaza's shown signs)", () => {
    expect(placeLibraryLabels([title(0, 1)], { narrow: false, fixed: [box(20)] })).toEqual([false]);
  });
  it("shown boxes never overlap, whatever the input", () => {
    const labels: LibraryLabel[] = Array.from({ length: 40 }, (_, i) => ({ kind: (["section", "year", "title"] as const)[i % 3], box: box((i * 37) % 400, (i * 53) % 200), distance: (i * 7) % 30 }));
    const shown = placeLibraryLabels(labels, { narrow: false });
    const boxes = labels.filter((_, i) => shown[i]).map((l) => l.box!);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(boxesOverlap(boxes[i], boxes[j])).toBe(false);
  });
});
```

- [ ] **Step 2: Run** `bunx vitest run tests/unit/library-sign-placement.test.ts`, expect FAIL.
- [ ] **Step 3: Implement**:

```ts
import { boxesOverlap, LABEL_GAP, type ScreenBox } from "../../fx/labelPlacement";
import type { LibrarySignKind } from "./decor/signs";

export interface LibraryLabel { kind: LibrarySignKind; box: ScreenBox | null; distance: number; picked?: boolean }
export const LIBRARY_LABEL_MAX = { title: { wide: 6, narrow: 4 }, section: 4, year: 3 } as const;
export const TITLE_RANGE = 28;
const tier = (l: LibraryLabel) => (l.kind === "title" ? (l.picked ? 0 : 3) : l.kind === "section" ? 1 : 2);

export function placeLibraryLabels(labels, { narrow, fixed = [] }) {
  const order = labels.map((_, i) => i).sort((a, b) => tier(labels[a]) - tier(labels[b]) || labels[a].distance - labels[b].distance || a - b);
  const cap = { title: narrow ? LIBRARY_LABEL_MAX.title.narrow : LIBRARY_LABEL_MAX.title.wide, section: LIBRARY_LABEL_MAX.section, year: LIBRARY_LABEL_MAX.year };
  const used = { title: 0, section: 0, year: 0 };
  const placed = [...fixed];
  const shown = labels.map(() => false);
  for (const i of order) {
    const l = labels[i];
    if (!l.box || used[l.kind] >= cap[l.kind]) continue;
    if (l.kind === "title" && !l.picked && l.distance > TITLE_RANGE) continue;
    if (placed.some((p) => boxesOverlap(p, l.box!, LABEL_GAP))) continue;
    shown[i] = true; placed.push(l.box); used[l.kind] += 1;
  }
  return shown;
}
```

- [ ] **Step 4: Run tests**, expect PASS. **Step 5: Commit** `feat(l4): placement rule for timeline signs (tiers, nearest first, caps)`.

### Task 3: Plate projection, the hook, the signs component and the decor wiring

**Files:**
- Create: `src/experience/fx/plateProjection.ts`, test `tests/unit/plate-projection.test.ts`
- Modify: `src/experience/floors/library/decor/useEndSignPlacement.ts` (use `projectPlate`, publish `endPlazaScreen`; same behavior)
- Create: `src/experience/floors/library/decor/useLibrarySignPlacement.ts`, `src/experience/floors/library/decor/LibrarySigns.tsx`
- Modify: `src/experience/floors/library/decor/NewsroomDecor.tsx`, `src/experience/fx/probes.ts`

**Interfaces:**
- Produces:
  - `projectPlate(camera: Camera, at: { x: number; y: number; z: number }, half: { w: number; h: number }, size: { width: number; height: number }, v: Vector3): { box: ScreenBox; quad: [number, number][]; onScreen: boolean } | null` (null: a corner outside the clip depth; `onScreen` false: fully off the viewport). The plate is upright and square to the camera about y.
  - `endPlazaScreen: { boxes: ScreenBox[] }` exported from `useEndSignPlacement.ts`.
  - `sceneProbes.library.labels: { text; kind; x0; y0; x1; y1; quad }[]`.
  - `LibrarySigns({ layout, zones, titles, titled, tier, reducedMotion })`: one `FloatingSigns` group named `library-signs`.

- [ ] **Step 1: Failing test for `projectPlate`** (node, three `PerspectiveCamera`): a plate in front of a camera at the origin looking down -z gives a box centered on screen whose quad has 4 corners and width proportional to `half.w`; a plate behind the camera returns null; one far to the side returns `onScreen: false`.
- [ ] **Step 2: Implement `projectPlate`** by moving the corner loop out of `useEndSignPlacement` (right vector `(cam.z - z, 0, x - cam.x) / d` with `d` the horizontal camera distance; corners `[-1,-1],[1,-1],[1,1],[-1,1]`). Refactor `useEndSignPlacement` to call it; keep its NEAR, priority and probe logic identical; after `placeLabels`, set `endPlazaScreen.boxes` to the boxes of shown signs; clear it on unmount.
- [ ] **Step 3: `useLibrarySignPlacement({ signs, meta, group, reducedMotion })`**: per frame, for each sign: world center from the group origin; horizontal camera distance below `NEAR` (6 u) means no box; `projectPlate` with `BOX_PAD` 1.04; `distance` = horizontal distance from `roverRuntime`; `picked` = the store's picked topic includes `meta.room`; `placeLibraryLabels(candidates, { narrow: width < 600, fixed: endPlazaScreen.boxes })`; ease `alpha` toward shown (rate 8, cut under reduced motion); write `sceneProbes.library.labels` (shown with alpha above 0.5). Returns the alpha ref.
- [ ] **Step 4: `LibrarySigns`** memoizes `librarySigns(...)`, calls the hook with a group ref, renders `<group ref><FloatingSigns signs name="library-signs" tier visibility={alpha} /></group>`.
- [ ] **Step 5: `NewsroomDecor`**: drop `StationLabels` and `ZoneSigns`; render `<LibrarySigns layout zones titles titled={others} tier reducedMotion />`; add `yearPostSegments(layout.extras.years ?? [])` into the wall's `LineBatch` (color `ZONE_TONE.blog`, no new draw call).
- [ ] **Step 6: Run** `bun run typecheck && bunx vitest run tests/unit` and `bun run lint`. Commit `feat(l4): place timeline signs on screen, one sign group for the floor`.

### Task 4: E2E label-overlap gate, captures and budgets

**Files:**
- Create: `e2e/library-labels.spec.ts`
- Modify: `scripts/e2e-plan.ts` (`ALL_SPECS`, the `floors/library` and `FloatingSign` rules)

- [ ] **Step 1:** For `desktop` (1440x900, tier full) and `phone` (390x844 at DPR 2, touch, tier lite): enter `/en/library`, then visit poses `approach` (arrival), `posts` (x 8, z 0), `mid` (x 24, z 0), `research` (research station `from`), `models` (models `from`), `talks` (talks `from`). At each: `waitForCameraSettle`, 30 frames, read `__hq.probes.library.labels` plus `__hq.probes.topics.labels`; assert no pair overlaps by more than 2 percent of the smaller quad (`polygonOverlap`, `polygonArea`), titles shown at most 6 or 4, no text shown twice. At `research`, `models` and `talks` the zone's own sign is in the shown list. `expectRenderBudget` at `mid`.
- [ ] **Step 2:** Opt-in captures and numbers (`L4_SHOTS=<dir>`): screenshot each pose and write `{ pose, sceneCalls, triangles, programs }` to `<dir>/<device>.json`; reading the library probe falls back to `[]` so the block also runs against the old export (`E2E_DIR=out-main`).
- [ ] **Step 3:** Add `library-labels` to `ALL_SPECS` and to the rules for `src/experience/floors/library/` and `fx/(FloatingSign|signLayout|holoFx)` and `fx/labelPlacement|plateProjection`. Run `bunx vitest run tests/unit/e2e-plan.test.ts`.
- [ ] **Step 4:** `bun run verify:quick`, then `E2E_PORT=<port> bunx playwright test e2e/library-labels.spec.ts e2e/spectacle.spec.ts e2e/topics.spec.ts e2e/library-roof.spec.ts e2e/walk.spec.ts`. Commit `test(l4): label overlap gate over the timeline`.

### Task 5: Measurements, docs and PR

- [ ] Before and after: run the capture block against `out-main` and `out`; compare scene calls and triangles per pose (after must not exceed before). Run `PERF=1 E2E_PORT=<port> bunx playwright test e2e/perf/floors.spec.ts -g L4` and `e2e/perf/bytes-3d.spec.ts` (L4 chunk cap once #157 is in).
- [ ] Docs: `AGENTS.md` (L4 Writing paragraph: one sign per section, `LibrarySigns`, placement, year posts, height rule) and `docs/features.md` (L4 section and status log).
- [ ] After #157 merges: rebase on `origin/main`, re-run verify, check `gh run list -s in_progress` and `-s queued`, push, open the PR with captures, overlap results and numbers.

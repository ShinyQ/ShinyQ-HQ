# L1 Skills Wall: Neat and Compact (Round 9 R) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Status: shipped in #195 (5ea6fed), 2026-10-17, revised the same day. Owner follow-up: "No i want it to show all but the space for each can be neat and conmpact": every item shows (the "+N more" lines and `home.skillsMore` are gone); a group with more than 6 items splits into two sub-columns (`SKILLS_SPLIT`) when every item fits half a cell (AI and LLM keeps one column); rows take their tallest cell's height. Owner decision the same day: a new Data science and ML group (`ds`, after AI and LLM) and every group on the wall, split cells sharing one sub-column edge per grid column. Final layout (owner, same day): 4 across by 2 down on a 40 u wall in `SKILLS_WALL_ORDER`, `SKILLS_PAD.column` 0.6 and `SKILLS_SPLIT.gap` 0.2 so Azure and Data science split in 10 u cells; the wall is 11.25 u and its title tops out at about 12.4 u (under one storey, cap 12.5 u); `LOBBY.skillsWall.h` is the measured height (hit box, bounds). Tuned from captures: `itemLine` 1.15, `SKILLS_PAD` `{ rowGap: 0.35, bottom: 1.9 }` (the base row clears the plinth lip); zone zoom 1.7 (phones 1.15), to tune from captures. Spec: Round 9 design, section 8. Owner: "the skill walls was too wide i need you to make it more neat and compact".

**Goal:** The L1 skills wall becomes about 60 percent of today's width (40 u to 24 u) with the four groups in a 2x2 grid, a fixed number of lines per group ("+N more" for long groups), consistent spacing and alignment, same fonts, colors and glow.

**Architecture:** `skillsWallLayout` (`floors/lobby/layout.ts`) becomes a grid layout: it returns one cell per group (origin, shown items, hidden count) plus the wall height, measured so every cell fits. `SkillsWall.tsx` keeps one `BatchedLabels` (title, headings, items, "+N more" lines) and one `LogoQuads`, so draw calls and shader programs do not change. Everything else that depends on the wall (colliders, point-and-go bounds, the camera view zone, the stop, the lane spoke) already derives from `LOBBY.skillsWall`, so changing `w` moves them with it; only the view zone zoom is retuned from captures.

**Tech Stack:** React Three Fiber, troika text through `BatchedLabels`, Vitest, Playwright (SwiftShader).

## Global Constraints

- No em dashes (U+2014) anywhere.
- EN and ID for every user-facing string (`home.skillsMore`: EN "+{count} more", ID "+{count} lainnya", identical keys).
- L1 at most 125 scene draw calls (`FLOOR_SCENE_CAPS`, `e2e/highlights.spec.ts`); no new shader program (same `BatchedLabels` and `LogoQuads`, no new materials).
- Same font (`FONTS.monoBold` headings, `FONTS.sans` items), same group accents (`GROUP_ACCENT`), same glass and plinth glow.
- The wall never grows taller than 9.85 u (`tests/unit/lobby-layout.test.ts`).
- Readable from its stop at 390x844 (lite) and 1440x900 (full); the wall's pad, camera zone and point-and-go keep working.
- 3D rules: `useDispose` for any new memoized geometry, texture or material (none planned); no new rAF loops; no words painted on the floor.
- Before merging: before/after captures (approach and stop, 1440x900 full and 390x844 lite) sent to the coordinator for owner approval.

---

## Numbers

| Constant | Today | New |
|---|---|---|
| `LOBBY.skillsWall.w` | 40 | 24 |
| Columns x rows | 4 x 1 | 2 x 2 (`SKILLS_GRID = { columns: 2, rows: 2 }`) |
| Cell width | 10 | 12 |
| Lines per cell | all items (up to 12) | `SKILLS_MAX_LINES = 6`: up to 6 items, or 5 items and "+N more" |
| `SKILLS_TEXT.itemLine` | 1.3 | 1.2 |
| `SKILLS_PAD` | `{ column: 0.9, top: 0.35, belowLabel: 0.4, bottom: 1.8 }` | `{ column: 0.9, top: 0.35, belowLabel: 0.4, rowGap: 0.5, bottom: 0.9 }` |
| Wall height | 9.3 (min 8.5) | about 9.7: `2 * cellHeight + rowGap + bottom`, `cellHeight = top + labelLines * labelSize * labelLine + belowLabel + 6 * itemSize * itemLine` |

Cell `(col, row)` for group `i`: `col = i % 2`, `row = floor(i / 2)`; left edge `-w/2 + col * cellW + SKILLS_PAD.column`; top (distance from the wall top) `row * (cellHeight + rowGap)`. Group order stays `SKILLS_WALL_GROUPS` (backend, ai on top; azure, devops below).

## File map

| File | Change |
|---|---|
| `src/experience/config.ts` | `skillsWall.w` 40 to 24 |
| `src/experience/floors/lobby/layout.ts` | `SKILLS_GRID`, `SKILLS_MAX_LINES`, new `SKILLS_PAD`, `itemLine` 1.2, grid `skillsWallLayout` |
| `src/experience/floors/lobby/SkillsWall.tsx` | Cells from the layout; "+N more" line; logos for shown items only |
| `src/experience/floors/Lobby.tsx`, `src/experience/Experience.tsx`, `src/experience/types.ts` (if `SceneLabels` lives there) | `skillsMore: (count: number) => string` label |
| `messages/en.json`, `messages/id.json` | `home.skillsMore` |
| `src/experience/camera/orbit.ts` | `L1:skills` zone zoom retuned (comment says 24 u wall) |
| `tests/unit/lobby-layout.test.ts` | Grid tests replace the column tests |
| `docs/agents/floor-l1-lobby.md`, `docs/features.md`, `docs/decisions.md`, `docs/superpowers/README.md` | Current state, owner decision row, plan status |

---

### Task 1: Grid layout for the skills wall

**Files:**
- Modify: `src/experience/config.ts:148`, `src/experience/floors/lobby/layout.ts:100-145`
- Test: `tests/unit/lobby-layout.test.ts:114-143`

**Interfaces:**
- Produces:

```ts
export const SKILLS_GRID = { columns: 2, rows: 2 } as const;
export const SKILLS_MAX_LINES = 6;
export interface SkillsCell {
  /** Left edge of the cell's text, wall-local x. */
  left: number;
  /** Distance from the wall top to the cell's heading. */
  top: number;
  /** Items drawn on the wall (at most SKILLS_MAX_LINES, or one fewer when some are hidden). */
  shown: string[];
  /** Items behind "+N more" (0 when the group fits). */
  more: number;
}
export interface SkillsWallLayout {
  h: number;
  /** Cell width (wall width / columns). */
  column: number;
  textWidth: number;
  labelLines: number;
  /** Distance from a cell's top to its first item line. */
  itemTop: number;
  /** Height of one cell (heading plus SKILLS_MAX_LINES lines). */
  cellHeight: number;
  cells: SkillsCell[];
}
export function skillsWallLayout(groups: readonly { label: string; items: readonly string[] }[]): SkillsWallLayout;
```

- [ ] **Step 1: Replace the skills wall tests with grid tests**

```ts
  it("lays the skills wall out as a compact 2x2 grid that fits (both locales)", () => {
    for (const locale of ["en", "id"] as const) {
      const groups = wallSkillGroups(getSkills()).map((g) => ({ label: tr(g.label, locale), items: g.items }));
      expect(groups).toHaveLength(4);
      const l = skillsWallLayout(groups);
      expect(LOBBY.skillsWall.w).toBe(24);
      expect(l.column).toBe(12);
      expect(l.h).toBeLessThanOrEqual(9.85);
      expect(l.cells).toHaveLength(4);
      // Two columns, two rows, aligned edges.
      expect(new Set(l.cells.map((c) => c.left)).size).toBe(2);
      expect(new Set(l.cells.map((c) => c.top)).size).toBe(2);
      for (const [i, c] of l.cells.entries()) {
        const g = groups[i];
        const lines = c.shown.length + (c.more > 0 ? 1 : 0);
        expect(lines).toBeLessThanOrEqual(SKILLS_MAX_LINES);
        expect(c.shown.length + c.more).toBe(g.items.length);
        expect(c.shown).toEqual(g.items.slice(0, c.shown.length));
        // Every cell ends above the next row or the wall base, with margin.
        const bottom = c.top + l.itemTop + lines * SKILLS_TEXT.itemSize * SKILLS_TEXT.itemLine;
        expect(l.h - bottom, `${locale} ${g.label}`).toBeGreaterThanOrEqual(0.8);
        // Headings fit their cell.
        const charW = SKILLS_TEXT.labelSize * (0.6 + SKILLS_TEXT.labelTracking);
        expect(wrapCount(g.label.toUpperCase(), Math.floor(l.textWidth / charW))).toBeLessThanOrEqual(l.labelLines);
      }
      // A group that fits shows everything; a long one shows SKILLS_MAX_LINES - 1 items and "+N more".
      const azure = l.cells[groups.findIndex((g) => g.items.length > SKILLS_MAX_LINES)];
      expect(azure.shown).toHaveLength(SKILLS_MAX_LINES - 1);
    }
    const fits = skillsWallLayout([{ label: "a", items: ["1", "2", "3", "4", "5", "6"] }]);
    expect(fits.cells[0]).toMatchObject({ more: 0 });
    expect(fits.cells[0].shown).toHaveLength(6);
  });

  it("wraps headings by words", () => {
    expect(wrapCount("CLOUD INFRASTRUCTURE AND DEVOPS", 25)).toBe(2);
    expect(wrapCount("SOFTWARE ENGINEERING", 25)).toBe(1);
  });

  it("keeps each skill cell roomy on a wall about 60 percent of the old width", () => {
    expect(LOBBY.skillsWall.w / SKILLS_GRID.columns).toBeGreaterThanOrEqual(11);
  });
```

(Import `SKILLS_GRID` and `SKILLS_MAX_LINES` from the layout module; drop the old 4-column tests at lines 114-143.)

- [ ] **Step 2: Run them to verify they fail**

Run: `bunx vitest run tests/unit/lobby-layout.test.ts`
Expected: FAIL (`SKILLS_GRID` not exported, width 40).

- [ ] **Step 3: Implement**

`config.ts`: `skillsWall: { x: 6, z: -18.5, w: 24, d: 1, h: 8.5, plinth: 0.35 }`.

`layout.ts`:

```ts
export const SKILLS_TEXT = { itemSize: 0.4, itemLine: 1.2, icon: 0.4, iconGap: 0.55, labelSize: 0.46, labelLine: 1.15, labelTracking: 0.08 } as const;
/** Padding inside each cell, gap above the headings, below them, between the two rows, and under the last row. */
export const SKILLS_PAD = { column: 0.9, top: 0.35, belowLabel: 0.4, rowGap: 0.5, bottom: 0.9 } as const;
/** The four wall groups in a 2x2 grid (owner, 2026-10-17: narrower, neat and compact). */
export const SKILLS_GRID = { columns: 2, rows: 2 } as const;
/** Lines per cell: a longer group shows one fewer item and a "+N more" line. */
export const SKILLS_MAX_LINES = 6;

export function skillsWallLayout(groups: readonly { label: string; items: readonly string[] }[]): SkillsWallLayout {
  const T = SKILLS_TEXT;
  const { columns } = SKILLS_GRID;
  const column = LOBBY.skillsWall.w / columns;
  const textWidth = column - 2 * SKILLS_PAD.column;
  const maxChars = Math.floor(textWidth / (T.labelSize * (MONO_ADVANCE + T.labelTracking)));
  const labelLines = Math.max(1, ...groups.map((g) => wrapCount(g.label.toUpperCase(), maxChars)));
  const itemTop = SKILLS_PAD.top + labelLines * T.labelSize * T.labelLine + SKILLS_PAD.belowLabel;
  const cellHeight = itemTop + SKILLS_MAX_LINES * T.itemSize * T.itemLine;
  const rows = Math.max(1, Math.ceil(groups.length / columns));
  const h = rows * cellHeight + (rows - 1) * SKILLS_PAD.rowGap + SKILLS_PAD.bottom;
  const cells = groups.map((g, i): SkillsCell => {
    const fits = g.items.length <= SKILLS_MAX_LINES;
    const shown = fits ? [...g.items] : g.items.slice(0, SKILLS_MAX_LINES - 1);
    return {
      left: -LOBBY.skillsWall.w / 2 + (i % columns) * column + SKILLS_PAD.column,
      top: Math.floor(i / columns) * (cellHeight + SKILLS_PAD.rowGap),
      shown,
      more: g.items.length - shown.length,
    };
  });
  return { h: Math.round(h * 100) / 100, column, textWidth, labelLines, itemTop, cellHeight, cells };
}
```

Remove the `Math.max(LOBBY.skillsWall.h, ...)` floor (the grid sets its own height). Check `lobbyBounds` (the `skills-wall` box near `layout.ts:177`) and any other user of `LOBBY.skillsWall.h` (`interact/registry.ts:218`, `config.ts:254`) still give sensible bounds; if a bound needs the measured height, leave `LOBBY.skillsWall.h` as the nominal value (8.5) unless a test proves otherwise.

- [ ] **Step 4: Run the tests**

Run: `bunx vitest run tests/unit/lobby-layout.test.ts tests/unit/missions-host3d.test.ts tests/unit/lobby-observatory.test.ts`
Expected: PASS (if a bounds or overlap test fails because the wall is narrower, read it: a narrower wall can only free space; fix the test's expectation only when it encodes the old width).

- [ ] **Step 5: Commit**

```bash
git add src/experience/config.ts src/experience/floors/lobby/layout.ts tests/unit/lobby-layout.test.ts
git commit -m "feat(lobby): skills wall layout as a compact 2x2 grid"
```

### Task 2: Render the grid, "+N more" and the label

**Files:**
- Modify: `src/experience/floors/lobby/SkillsWall.tsx`, `src/experience/floors/Lobby.tsx`, `src/experience/Experience.tsx` (labels), `src/experience/prototype/certs/CertsWorld.tsx` (passes a literal title; give it a literal `more`), `messages/en.json`, `messages/id.json`

**Interfaces:**
- Consumes: `skillsWallLayout`, `SkillsCell`, `SKILLS_TEXT`, `SKILLS_PAD` (Task 1).
- Produces: `SkillsWall({ skills, title, more }: { skills: ExperienceData["skills"]; title: string; more: (count: number) => string })`; `LobbyLabels.skillsMore: (count: number) => string`.

Rendering (all text stays in the one `BatchedLabels`, logos in the one `LogoQuads`):
- Title: unchanged (`position: [0, h + 0.3, 0]`).
- Per cell: heading at `[cell.left, h - cell.top - SKILLS_PAD.top, front]` with the group accent and `maxWidth: textWidth`; items `cell.shown.join("\n")` at `[cell.left + ICON_GAP, h - cell.top - itemTop, front]`.
- "+N more" (when `cell.more > 0`): its own label at `[cell.left + ICON_GAP, h - cell.top - itemTop - cell.shown.length * ITEM_SIZE * ITEM_LINE, front]`, `FONTS.sans`, `fontSize: ITEM_SIZE`, `color: "#a1a1aa"` (the drawer's `ink-2` gray), so it reads as a quieter line aligned with the items.
- Logos: `cell.shown.map((_, j) => group.logos[j])` only, at `y = h - cell.top - itemTop - (j + 0.5) * ITEM_SIZE * ITEM_LINE`, `x = cell.left + ICON / 2`.
- Messages: `home.skillsMore`: EN "+{count} more", ID "+{count} lainnya". `Experience.tsx`: `skillsMore: (count: number) => tHome("skillsMore", { count })` in the lobby labels; `Lobby.tsx` passes `more={labels.skillsMore}`.

- [ ] **Step 1: Add a unit test for the label plumbing** in `tests/unit/lobby-layout.test.ts` (messages exist with identical placeholders):

```ts
  it("has the +N more label in both locales", () => {
    expect(en.home.skillsMore).toBe("+{count} more");
    expect(id.home.skillsMore).toBe("+{count} lainnya");
  });
```

(import `en` from `../../messages/en.json` and `id` from `../../messages/id.json`.)

- [ ] **Step 2: Run it to verify it fails**, then implement the rendering, labels and messages.

- [ ] **Step 3: Verify**

Run: `bunx tsc --noEmit -p .` and `bunx vitest run tests/unit tests/hud`
Expected: PASS. Then `bun run build` and `E2E_PORT=4420 bunx playwright test e2e/highlights.spec.ts e2e/lobby*.spec.ts e2e/interact.spec.ts --retries 0` (L1 budget at most 125 scene calls, point-and-go and the skills stop still work).

- [ ] **Step 4: Commit**

```bash
git add src/experience messages
git commit -m "feat(lobby): compact skills wall with +N more and aligned cells"
```

### Task 3: Camera framing and captures

**Files:**
- Modify: `src/experience/camera/orbit.ts:230-240` (zone zoom, comment)
- Captures: a temporary, uncommitted spec (copy `CV refresh 3D L1 skills wall` from `e2e/screenshots.spec.ts:724`) that saves, for 1440x900 full and 390x844 lite, the stop view (palette "Skills wall", Esc, camera settle) and an approach view (`driveTo` a point 10 u south of the wall's stop from the plaza, then capture mid-drive once the camera settles), into `SHOT_DIR`.

- [ ] **Step 1:** Capture "before" on `main` (`E2E_DIR=out-main` with a main build, or a main worktree) and "after" on the branch, same poses.
- [ ] **Step 2:** Tune `zoom` for `L1:skills` (start at 1.35 for the 24 u by 9.7 u wall) until the whole wall and its title fit the stop view at both sizes with margin, and item text is legible at 390x844.
- [ ] **Step 3:** `E2E_PORT=4420 bunx playwright test e2e/highlights.spec.ts --retries 0` (L1 at most 125 calls) and the perf lane for L1 programs (`E2E_PORT=4421 bun run e2e:perf` or at least the floors spec) to confirm no new program.
- [ ] **Step 4:** Send the before/after captures to the coordinator for owner approval; do not merge before approval.
- [ ] **Step 5: Commit**

```bash
git add src/experience/camera/orbit.ts
git commit -m "feat(camera): frame the compact skills wall from its stop"
```

### Task 4: Docs

- [ ] `docs/agents/floor-l1-lobby.md`: the skills wall section (24 u, 2x2 grid, 6 lines per cell with "+N more", one `BatchedLabels`, zone zoom).
- [ ] `docs/features.md` (L1 bullet), `docs/decisions.md` (row: 2026-10-17, L1 skills wall narrower and compact, owner words), `docs/superpowers/README.md` (this plan, status).
- [ ] Commit: `docs: compact L1 skills wall`.

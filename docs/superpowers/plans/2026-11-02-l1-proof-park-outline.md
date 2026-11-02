# L1 Proof Park, PR 2: One Rectangle (outline) Implementation Plan

Status: in review

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Owner request and decision: [2026-11-02](../../decisions/2026-11-02-l1-proof-park.md). Design:
[`2026-11-02-l1-proof-park-design.md`](../specs/2026-11-02-l1-proof-park-design.md) section 3.

**Goal:** L1 becomes one 93 x 86 u rectangle (x -24 to 69, z -27 to 59) with an arch from the hall plaza into the old
east notch and a road from the office plaza, forming a Lobby, office, park and hall loop; nothing else visible moves
but the hall gateway (2 u west).

**Architecture:** A new pure, import-light module `floors/lobby/parkLayout.ts` (like `officeLayout.ts` and
`hallLayout.ts`) holds the park's zone, arch, plaza and roads, derived from `LOBBY_SLAB`, `OFFICE_WING` and `HALL`.
`config.ts` sets the L1 `bounds` to `LOBBY.slab` (no wings) and merges the arch posts, roads, plaza, road zone and
camera columns. The arch draws with the hall's merged solids and line mesh; the roads with the office wing's
`RoadMarkings` (already drawn by the intro and at the office stop). No new chunk, program or string.

**Tech Stack:** TypeScript, React Three Fiber, Vitest, Playwright, Bun.

## Global Constraints

- No em dashes anywhere; Title Case only in content; no first person in titles or signs.
- Every obstacle pair touches or keeps 6 u, also from slab edges (`SPACE_RULES`); roads 8 u, plazas 16 u.
- The intro orbit and the spawn view stay unchanged; the contact station keeps its place and deep link.
- No new shader program or draw call; L1 stays under 125 scene calls.
- Bun; git via `rtk`; conventional commits.

---

### Task 1: Park layout module and the full-rect slab

**Files:**
- Create: `src/experience/floors/lobby/parkLayout.ts`
- Modify: `src/experience/floors/lobby/hallLayout.ts` (`HALL.gate.x` from `X0 + 5` to `X0 + 3`, comments)
- Modify: `src/experience/config.ts` (`LOBBY.slab`, the L1 layout)
- Test: `tests/unit/l1-proof-park-layout.test.ts`

**Interfaces:**
- Produces: `PARK` (`zone`, `arch` `{ west, east, h, lintel }`, `plaza` `{ x, z, w, d }`, `lead`), `parkArchPosts(): Rect[]`,
  `parkArchLintel(): Box`-like data, `parkRoads(): { roads: Road[]; plaza: Plaza }` (routing),
  `parkRoadsDrawn(): RoadNetwork` (trimmed copies), `parkTall(): TallObstacle[]`, `LOBBY.slab: Rect`.

- [ ] **Step 1: Write the failing tests** (`tests/unit/l1-proof-park-layout.test.ts`)

```ts
const l1 = buildFloorLayouts(5).L1;
it("is one 93 x 86 u rectangle", () => {
  expect(l1.bounds).toEqual({ minX: -24, maxX: 69, minZ: -27, maxZ: 59 });
  expect(l1.wings ?? []).toEqual([]);
  expect(slabRects(l1)).toHaveLength(1);
  expect(slabEdges(l1)).toHaveLength(4);
  expect(slabCorners(l1)).toHaveLength(4);
});
it("meets every space rule", () => {
  expect(spaceViolations({ bounds: l1.bounds, wings: l1.wings, obstacles: l1.obstacles, doors: l1.doors ?? [], network: l1.road!, start: l1.approach, pads: l1.pads })).toEqual([]);
});
// Walkways: the arch opening, the old notches and the arch posts' neighbours keep 6 u; wideGrid reaches the park and the west notch.
// Roads: one part for the office and the park, the hall its own; park routes use the arch and the office lead.
```

- [ ] **Step 2: Run them, expect failures** (`bunx vitest run tests/unit/l1-proof-park-layout.test.ts`)
- [ ] **Step 3: Implement** `parkLayout.ts`, the gate move and the config changes (design section 3).
- [ ] **Step 4: Run the L1 layout tests** (`bunx vitest run tests/unit/l1-proof-park-layout.test.ts tests/unit/highlights-layout.test.ts tests/unit/lobby-office.test.ts tests/unit/lobby-layout.test.ts tests/unit/hall-gallery.test.ts`) and update the tests that pinned the wing or the old gate x.
- [ ] **Step 5: Commit** `feat(l1): one rectangle slab with the Proof Park arch and roads`

### Task 2: Draw the arch and the park roads

**Files:**
- Modify: `src/experience/floors/lobby/hallSolids.ts` (`hallShapes`: the arch posts and lintel)
- Modify: `src/experience/floors/lobby/HighlightsHall.tsx` (`HALL_BOUNDS` over the arch)
- Modify: `src/experience/floors/Lobby.tsx` (the drawn park roads in the office wing's `RoadMarkings`)
- Test: `tests/unit/hall-gallery.test.ts`, `tests/unit/hall-stage.test.ts`

- [ ] **Step 1: Tests** that the solids hold three arch boxes on the posts (no uplights: they would cost the rides about 480 triangles).
- [ ] **Step 2: Implement** and run the hall tests.
- [ ] **Step 3: Commit** `feat(l1): draw the Proof Park arch and roads`

### Task 3: Docs, decision, captures

**Files:**
- Create: `docs/decisions/2026-11-02-l1-proof-park.md`
- Modify: `docs/agents/floor-l1-lobby.md`, `docs/agents/floors.md`, `docs/agents/performance.md`, `docs/features.md`

- [ ] **Step 1:** Document the slab, the arch, the roads, the gate move and the measured numbers.
- [ ] **Step 2:** Captures (desktop and phone, before and after) in the session files folder.
- [ ] **Step 3: Commit** `docs(l1): Proof Park outline`

### Task 4: Verify

- [ ] `bun run verify:quick`, `bun run e2e:changed`, the bytes gate, `E2E_PORT=<port> bun run e2e:perf` (async), `bun scripts/visual-gate.ts --base main --profile strict` (async); explain every pose that differs.
- [ ] Local preview on port 3400 for the owner before any push.

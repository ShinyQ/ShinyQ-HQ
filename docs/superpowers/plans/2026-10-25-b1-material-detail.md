# B1 Material Detail Implementation Plan

Status: shipped in #324 (7b8321e), 2026-10-26

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the B1 Engine Room's surfaces read as dark machined steel with faintly lit seams and vents, inside the B1 chunk, with no new shader program.

**Architecture:** Pure placement data in `floors/engine/scenery.ts` (`plates` plus vent slats in `flows`), one new instanced draw `PlateMesh` on the holo `plate` mode (the program the B1 floating signs already compile), vents inside the existing `FlowMesh`, and a gunmetal retune of the merged solids through the existing `MergedBoxes` props. Spec: [`2026-10-25-b1-material-detail-design.md`](../specs/2026-10-25-b1-material-detail-design.md).

**Tech Stack:** TypeScript, React Three Fiber, three.js, Vitest, Playwright, Bun.

## Global Constraints

- No em dashes (U+2014) anywhere: code, comments, docs, commits.
- Never edit `src/experience/fx/holoFx.ts` (main 3D path) or `src/experience/floors/roof/kit.tsx` (also in the RF chunk, which counts in the session total).
- No new light, texture, shader program, frame loop (`useFrame` or rAF) or `AudioContext`; no words painted on any surface.
- `useDispose` after every memoized geometry and material.
- Plates and slats never raycast (`NO_RAYCAST`).
- B1 settled scene calls stay under `FLOOR_SCENE_CAPS.B1` 100; triangles under 30k; `e2e/perf/baseline.json` unchanged.
- The B1 chunk cap (`BYTES_3D_BUDGET.floors.B1`) is reset once to the measured B1 chunk + 614 B (owner, 2026-10-25), recorded in `docs/decisions/2026-10-25-b1-material-cap.md`; no other budget changes.
- Commits: conventional messages, prefer `rtk git`. Do not push.

## File map

| File | Change |
|---|---|
| `src/experience/floors/engine/reactorFx.ts` | Export `PLINTH_STEPS` (the plinth's two step sizes) and use it in `coreSolids` |
| `src/experience/floors/engine/scenery.ts` | `PlateInstance`, `plates` in `EngineScenery`, wall, bay floor, deck and plinth plates; vent slats in `flows`; `engineDetail` gains `slats` |
| `src/experience/floors/engine/EngineFx.tsx` | Shared `placeQuad`; new `PlateMesh` |
| `src/experience/floors/EngineRoom.tsx` | Mount `PlateMesh`; gunmetal `MergedBoxes` color and emissive |
| `tests/unit/engine-scenery.test.ts` | Plate and vent tests; the draw-kind and size tests updated |
| `e2e/engine-room.spec.ts` | The plate draw mounts with the expected count and `renderOrder` -1 |
| `e2e/budgets.ts` | `floors.B1` reset to measured + 614 |
| Docs | `docs/agents/floor-b1-engine-room.md`, `docs/agents/performance.md`, `AGENTS.md`, `README.md`, `docs/features.md`, the decision file, the spec's two wording fixes, this plan's status |

---

### Task 1: Plate placement (pure data)

**Files:**
- Modify: `src/experience/floors/engine/reactorFx.ts` (`coreSolids`, around line 155)
- Modify: `src/experience/floors/engine/scenery.ts`
- Test: `tests/unit/engine-scenery.test.ts`

**Interfaces:**
- Consumes: `buildEngineLayout()`, `ENGINE`, `EngineBay`, `EngineLayout` from `./layout`; `CORE_FX` from `./reactorFx`.
- Produces:
  - `export const PLINTH_STEPS: readonly [number, number]` in `reactorFx.ts` (`[8, 5.6]`, bottom and top step sizes).
  - `export type PlateInstance = Omit<PanelInstance, "roll">` in `scenery.ts`.
  - `EngineScenery.plates: PlateInstance[]`.
  - `export const PLATE = { lift: 0.02, bayFloor: 0.13, gap: 0.3, tile: 2 } as const` in `scenery.ts`.

- [ ] **Step 1: Write the failing tests**

In `tests/unit/engine-scenery.test.ts`, extend the import from `@/experience/floors/engine/scenery` with `PLATE` and `type PlateInstance`, and the import from `@/experience/floors/engine/reactorFx` with `PLINTH_STEPS`. Change the existing draw-kind test to expect the new key:

```ts
    it(`keeps the same draws: merged solids, one flow, one panel and one plate instancing, the depth mask, no other kind (${tier})`, () => {
      expect(Object.keys(s).sort()).toEqual(["flows", "masks", "panels", "plates", "solids"]);
    });
```

Append this block at the end of the file:

```ts
describe("B1 lit-seam plates", () => {
  const s = engineScenery(layout, "full");
  const flat = s.plates.filter((p) => p.flat);
  const upright = s.plates.filter((p) => !p.flat);
  const plateRect = (p: PlateInstance) => panelRect(p as PanelInstance);
  const overlaps = (a: Rect, r: Rect) => a.minX < r.maxX - 1e-9 && r.minX < a.maxX - 1e-9 && a.minZ < r.maxZ - 1e-9 && r.minZ < a.maxZ - 1e-9;
  const spurRect = (sp: { from: { x: number; z: number }; to: { x: number; z: number }; width: number }): Rect => ({
    minX: Math.min(sp.from.x, sp.to.x) - sp.width / 2,
    maxX: Math.max(sp.from.x, sp.to.x) + sp.width / 2,
    minZ: Math.min(sp.from.z, sp.to.z) - sp.width / 2,
    maxZ: Math.max(sp.from.z, sp.to.z) + sp.width / 2,
  });

  it("draws the same plates on both tiers, all on the slab, in two seam tones", () => {
    expect(engineScenery(layout, "lite").plates).toEqual(s.plates);
    for (const p of s.plates) expect(within(plateRect(p)), JSON.stringify(p)).toBe(true);
    expect(new Set(s.plates.map((p) => p.color))).toEqual(new Set([ENGINE_TONES.tray, ENGINE_TONES.data]));
    expect(s.plates.length).toBeGreaterThan(200);
    expect(s.plates.length).toBeLessThan(400);
  });

  it("clads every bay: 8 back-wall and 4 + 4 side-wall panels behind the screens, and 6 floor plates", () => {
    for (const bay of layout.bays) {
      const walls = upright.filter((p) => inRect(p, bay.rect));
      expect(walls, bay.id).toHaveLength(16);
      const back = walls.filter((p) => Math.abs(Math.sin(p.yaw)) < 0.5);
      expect(back, bay.id).toHaveLength(8);
      for (const p of walls) {
        expect(p.y - p.h / 2, JSON.stringify(p)).toBeGreaterThanOrEqual(-1e-9);
        expect(p.y + p.h / 2, JSON.stringify(p)).toBeLessThanOrEqual(ENGINE.bay.h + 1e-9);
      }
      // Every back-wall screen of the bay stands in front of the back-wall panels (farther from the wall).
      const o = bay.side === "north" ? 1 : -1;
      const backZ = back[0].z;
      for (const screen of s.panels.filter((p) => !p.flat && inRect(p, bay.rect) && Math.abs(Math.sin(p.yaw)) < 0.5)) expect(o * (screen.z - backZ), JSON.stringify(screen)).toBeGreaterThan(0);
      const floor = flat.filter((p) => inRect(p, bay.rect));
      expect(floor, bay.id).toHaveLength(6);
      for (const p of floor) expect(p.y).toBe(PLATE.bayFloor);
    }
  });

  it("lays the deck beside the aisle, never over the aisle, a spur, a door pad, the call pad, the Return pad or the workbench", () => {
    const deck = flat.filter((p) => p.y === PLATE.lift && !layout.bays.some((b) => inRect(p, b.rect)));
    expect(deck.length).toBeGreaterThan(60);
    const aisle: Rect = { minX: ENGINE.approach.x, maxX: ENGINE.aisle.endX, minZ: -ENGINE.aisle.width / 2, maxZ: ENGINE.aisle.width / 2 };
    const pads = layout.floor.doors.map((d) => box({ x: d.at.x, z: d.at.z, w: 2, d: 2 }));
    const ret = box({ x: ENGINE.returnPad.x, z: ENGINE.returnPad.z, w: 3, d: 3 });
    const blocked = [aisle, ...layout.network.spurs.map(spurRect), ...pads, layout.callPad, ret, layout.workbench];
    for (const p of deck) for (const r of blocked) expect(overlaps(plateRect(p), r), `${JSON.stringify(p)} over ${JSON.stringify(r)}`).toBe(false);
  });

  it("clads the reactor plinth's two steps and rings it on the hall floor, off the reactor spur", () => {
    const R = layout.reactor;
    const core = s.plates.filter((p) => inRect(p, { minX: R.minX - 1e-6, maxX: R.maxX + 1e-6, minZ: R.minZ - 1e-6, maxZ: R.maxZ + 1e-6 }));
    expect(core.every((p) => p.color === ENGINE_TONES.data)).toBe(true);
    expect(core.filter((p) => !p.flat)).toHaveLength(24);
    const ring = core.filter((p) => p.flat);
    expect(ring).toHaveLength(18);
    const [bottom] = PLINTH_STEPS;
    const plinth = box({ x: ENGINE.reactor.x, z: ENGINE.reactor.z, w: bottom, d: bottom });
    for (const p of ring) {
      expect(overlaps(plateRect(p), plinth), JSON.stringify(p)).toBe(false);
      expect(inside(plateRect(p), R), JSON.stringify(p)).toBe(true);
    }
    expect(PLINTH_STEPS).toEqual([coreSolids()[0].w, coreSolids()[1].w]);
  });
});
```

Note: `panelRect` treats a flat panel's `h` as its depth along z and an upright panel as a zero-width segment along its face; `PlateInstance` has the same fields, so the cast is safe.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bunx vitest run tests/unit/engine-scenery.test.ts`
Expected: FAIL (`PLATE` and `PLINTH_STEPS` are not exported; `plates` is missing from the scenery keys).

- [ ] **Step 3: Export the plinth steps in `reactorFx.ts`**

Add above `coreSolids`:

```ts
/** The reactor plinth's two steps (square sizes, bottom then top): the bottom to y 0.4, the top to `CORE_FX.plinth`. */
export const PLINTH_STEPS = [8, 5.6] as const;
```

and in `coreSolids` replace the two step lines:

```ts
    at(PLINTH_STEPS[0], 0, 0.4),
    at(PLINTH_STEPS[1], 0.4, CORE_FX.plinth),
```

- [ ] **Step 4: Add the plates to `scenery.ts`**

Change the reactorFx import to `import { CORE_FX, coreSolids, PLINTH_STEPS } from "./reactorFx";`.

After the `PanelInstance` interface add:

```ts
/** A lit-seam panel (holo `plate`): a dark inset panel whose thin rim reads as a glowing seam; placed like a screen. */
export type PlateInstance = Omit<PanelInstance, "roll">;
```

Add `plates: PlateInstance[];` to `EngineScenery` (after `panels`).

After the `PIPE` constant add:

```ts
/**
 * Lit-seam plates: `lift` off their face or the floor, `bayFloor` the y over a bay's 0.12 u floor (under the projector
 * disc at 0.16), `gap` kept from the aisle, spurs and walls, `tile` the target deck plate size.
 */
export const PLATE = { lift: 0.02, bayFloor: 0.13, gap: 0.3, tile: 2 } as const;

/** `n` equal cells across [a, b]: their centers and size. */
function split(a: number, b: number, n: number): { c: number[]; s: number } {
  const s = (b - a) / n;
  return { c: Array.from({ length: n }, (_, i) => a + s * (i + 0.5)), s };
}
/** Cells near `PLATE.tile` across [a, b]. */
const tiles = (a: number, b: number) => split(a, b, Math.max(1, Math.round((b - a) / PLATE.tile)));

/** A grid of plates over [x0, x1] x [z0, z1] (flat, at `y`). */
function deck(x0: number, x1: number, z0: number, z1: number, y: number, color: string, nx?: number, nz?: number): PlateInstance[] {
  const xs = nx ? split(x0, x1, nx) : tiles(x0, x1);
  const zs = nz ? split(Math.min(z0, z1), Math.max(z0, z1), nz) : tiles(Math.min(z0, z1), Math.max(z0, z1));
  return xs.c.flatMap((x) => zs.c.map((z) => ({ x, y, z, w: xs.s, h: zs.s, yaw: 0, flat: true, color })));
}

/** One bay's cladding: its back wall in 4 x 2 panels, each side wall's inner face in 2 x 2, its floor in 3 x 2. */
function bayPlates(bay: EngineBay): PlateInstance[] {
  const o = out(bay);
  const back = backFace(bay);
  const x0 = bay.rect.minX + SIDE;
  const x1 = bay.rect.maxX - SIDE;
  const rows = split(0, ENGINE.bay.h, 2);
  const along = split(Math.min(back, bay.front), Math.max(back, bay.front), 2);
  const cols = split(x0, x1, 4);
  const color = ENGINE_TONES.tray;
  return [
    ...cols.c.flatMap((x) => rows.c.map((y) => ({ x, y, z: back + o * PLATE.lift, w: cols.s, h: rows.s, yaw: faceYaw(bay), color }))),
    ...[
      [x0 + PLATE.lift, Math.PI / 2],
      [x1 - PLATE.lift, -Math.PI / 2],
    ].flatMap(([x, yaw]) => along.c.flatMap((z) => rows.c.map((y) => ({ x, y, z, w: along.s, h: rows.s, yaw, color })))),
    ...deck(x0, x1, back, bay.center.z + (o * (ENGINE.bay.d - WALL)) / 2, PLATE.bayFloor, color, 3, 2),
  ];
}

/**
 * The deck: flat plates on the open floor between the aisle and the bay fronts (both sides of each spur) and between the
 * aisle and the rack rows, `gap` clear of the aisle, the spurs and the faces behind.
 */
function deckPlates(layout: EngineLayout): PlateInstance[] {
  const edge = ENGINE.aisle.width / 2 + PLATE.gap;
  const spur = ENGINE.spurWidth / 2 + PLATE.gap;
  const strip = (x0: number, x1: number, front: number) => {
    const s = Math.sign(front);
    return deck(x0, x1, s * edge, front - s * PLATE.gap, PLATE.lift, ENGINE_TONES.tray);
  };
  return [
    ...layout.bays.flatMap((bay) => [strip(bay.rect.minX, bay.center.x - spur, bay.front), strip(bay.center.x + spur, bay.rect.maxX, bay.front)].flat()),
    ...layout.racks.flatMap((r) => strip(r.minX, r.maxX, r.minZ === ENGINE.bounds.minZ ? r.maxZ : r.minZ)),
  ];
}

/** The reactor plinth: each step's four faces clad upright (4 and 2 panels a face) and a 1 u ring of flat plates round it inside the core's footprint. */
function plinthPlates(layout: EngineLayout): PlateInstance[] {
  const { x, z } = ENGINE.reactor;
  const R = layout.reactor;
  const color = ENGINE_TONES.data;
  const faces = PLINTH_STEPS.flatMap((size, i) => {
    const h = i === 0 ? 0.4 : CORE_FX.plinth - 0.4;
    const y = i === 0 ? 0.2 : 0.4 + h / 2;
    const half = size / 2 + PLATE.lift;
    const cells = split(-size / 2, size / 2, i === 0 ? 4 : 2);
    return cells.c.flatMap((u) => [
      { x: x + half, y, z: z + u, w: cells.s, h, yaw: Math.PI / 2, color },
      { x: x - half, y, z: z + u, w: cells.s, h, yaw: -Math.PI / 2, color },
      { x: x + u, y, z: z + half, w: cells.s, h, yaw: 0, color },
      { x: x + u, y, z: z - half, w: cells.s, h, yaw: Math.PI, color },
    ]);
  });
  const half = PLINTH_STEPS[0] / 2;
  return [
    ...faces,
    ...deck(R.minX, R.maxX, R.minZ, z - half, PLATE.lift, color),
    ...deck(R.minX, R.maxX, z + half, R.maxZ, PLATE.lift, color),
    ...deck(R.minX, x - half, z - half, z + half, PLATE.lift, color),
    ...deck(x + half, R.maxX, z - half, z + half, PLATE.lift, color),
  ];
}
```

In `engineScenery`, declare `const plates: PlateInstance[] = [...deckPlates(layout), ...plinthPlates(layout)];`, push `...bayPlates(bay)` inside the bay loop (`plates.push(...bayPlates(bay));`), and return `{ solids, masks: [endMask(layout)], flows, panels, plates }`.

Check the counts against the tests: per bay 8 + 8 + 6 = 22 (7 bays: 154); deck per bay 2 strips of 1 x 2 (28), per rack 3 x 3 (5 racks: 45); plinth 16 + 8 faces and 5 + 5 + 4 + 4 ring plates (42). Total 269.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bunx vitest run tests/unit/engine-scenery.test.ts tests/unit/engine-reactor-fx.test.ts tests/unit/engine-holo.test.ts`
Expected: PASS. If a count differs, fix the placement, not the test, unless the test's arithmetic is wrong (then say so in the report).

- [ ] **Step 6: Typecheck and commit**

Run: `bun run typecheck`
Expected: no errors (EngineRoom does not read `plates` yet; that is fine).

```bash
rtk git add src/experience/floors/engine/reactorFx.ts src/experience/floors/engine/scenery.ts tests/unit/engine-scenery.test.ts
rtk git commit -m "feat(b1): lit-seam plate placement for the bay walls and floors, the deck and the reactor plinth"
```

---

### Task 2: Vent slats in the flows

**Files:**
- Modify: `src/experience/floors/engine/scenery.ts`
- Test: `tests/unit/engine-scenery.test.ts`

**Interfaces:**
- Consumes: `bayPlates` helpers from Task 1 (`backFace`, `out`, `SIDE`, `ENGINE_TONES`).
- Produces: `engineDetail(tier)` returns `{ leds: number; slats: number }` (full `{ leds: 8, slats: 6 }`, lite `{ leds: 4, slats: 3 }`); `export const VENT = { y: 3, step: 0.18, len: 1.2, h: 0.05, d: 0.04, off: 0.05 } as const`.

- [ ] **Step 1: Write the failing tests**

Add `VENT` and `engineDetail` to the scenery import in `tests/unit/engine-scenery.test.ts`. In the test "draws half the rack LEDs on the lite tier and stays small enough to instance", raise the flow ceiling (the vents add 84 instances on full):

```ts
    expect(full.flows.length).toBeLessThan(300);
```

Append:

```ts
describe("B1 vents", () => {
  const slats = (tier: "full" | "lite") => engineScenery(layout, tier).flows.filter((f) => f.h === VENT.h);

  it("hangs one grille on each side wall of every bay, half the slats on lite", () => {
    expect(engineDetail("full").slats).toBe(2 * engineDetail("lite").slats);
    for (const tier of ["full", "lite"] as const) {
      for (const bay of layout.bays) expect(slats(tier).filter((f) => inRect(f, bay.rect)), `${bay.id} ${tier}`).toHaveLength(2 * engineDetail(tier).slats);
    }
  });

  it("keeps every slat dim cyan, mid-height on its wall's inner face, under the station sign and clear of the rack LEDs", () => {
    for (const f of slats("full")) {
      expect(f.color).toBe(ENGINE_TONES.data);
      expect(f.y).toBeGreaterThanOrEqual(VENT.y - 1e-9);
      expect(f.y + f.h / 2).toBeLessThan(ENGINE.bay.h);
      const bay = layout.bays.find((b) => inRect(f, b.rect))!;
      const face = Math.min(Math.abs(f.x - (bay.rect.minX + 0.3)), Math.abs(f.x - (bay.rect.maxX - 0.3)));
      expect(face).toBeCloseTo(VENT.off);
      expect(f.h).not.toBe(0.08);
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bunx vitest run tests/unit/engine-scenery.test.ts`
Expected: FAIL (`VENT` is not exported; `engineDetail` has no `slats`).

- [ ] **Step 3: Implement**

In `scenery.ts`, replace `engineDetail`:

```ts
/** LEDs per rack cabinet and slats per vent grille; the lite tier draws half. */
export function engineDetail(tier: GpuTier): { leds: number; slats: number } {
  return tier === "full" ? { leds: 8, slats: 6 } : { leds: 4, slats: 3 };
}
```

After `PLATE` add:

```ts
/** A vent grille on each bay side wall: slats from `y` up by `step`, `len` long along the wall, `off` from its inner face (in front of its plates). */
export const VENT = { y: 3, step: 0.18, len: 1.2, h: 0.05, d: 0.04, off: 0.05 } as const;

/** The bay's two vent grilles (dim cyan holo strips; the strip's pulse reads as air moving through them). */
function ventSlats(bay: EngineBay, slats: number): FlowInstance[] {
  const z = (backFace(bay) + bay.front) / 2;
  return [bay.rect.minX + SIDE + VENT.off, bay.rect.maxX - SIDE - VENT.off].flatMap((x) =>
    Array.from({ length: slats }, (_, i) => ({ x, y: VENT.y + i * VENT.step, z, w: VENT.d, h: VENT.h, d: VENT.len, color: ENGINE_TONES.data })),
  );
}
```

In `engineScenery`, read `const { leds, slats } = engineDetail(tier);` and in the bay loop change the flows push to `flows.push(...props.flows, frontStrip(bay), ...ventSlats(bay, slats));`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bunx vitest run tests/unit/engine-scenery.test.ts tests/unit/engine-holo.test.ts`
Expected: PASS (the front-strip test counts flows with `y < 0.1`, the slats sit at y 3 or more; the LED test counts `h === 0.08`).

- [ ] **Step 5: Commit**

```bash
rtk git add src/experience/floors/engine/scenery.ts tests/unit/engine-scenery.test.ts
rtk git commit -m "feat(b1): vent grilles on the bay side walls in the flow draw"
```

---

### Task 3: `PlateMesh`, the gunmetal retune and the e2e check

**Files:**
- Modify: `src/experience/floors/engine/EngineFx.tsx`
- Modify: `src/experience/floors/EngineRoom.tsx`
- Test: `e2e/engine-room.spec.ts`

**Interfaces:**
- Consumes: `PlateInstance` and `EngineScenery.plates` (Task 1).
- Produces: `export function PlateMesh({ items, tier }: { items: readonly PlateInstance[]; tier: GpuTier })`, an `instancedMesh` named `engine-plates` with `renderOrder` -1.

- [ ] **Step 1: Write the failing e2e test**

In `e2e/engine-room.spec.ts` add the import `import { engineScenery } from "../src/experience/floors/engine/scenery";` and change the layout import to `import { buildEngineLayout, ENGINE, ENGINE_STATIONS } from "../src/experience/floors/engine/layout";`. Add this test after the hologram test ("every bay shows its hologram ..."):

```ts
  test("clads the bays, the deck and the reactor plinth in one lit-seam plate draw, drawn first among the transparents", async ({ page }) => {
    type Plates = { count: number; renderOrder: number };
    type SceneWindow = { __hq: { render: { scene: { getObjectByName(name: string): Plates | undefined } | null } } };
    await enterB1Route(page);
    await rideTo(page, "B1");
    const expected = engineScenery(buildEngineLayout(), "full").plates.length;
    const plates = () =>
      page.evaluate(() => {
        const m = (window as unknown as SceneWindow).__hq.render.scene?.getObjectByName("engine-plates");
        return m ? { count: m.count, renderOrder: m.renderOrder } : null;
      });
    await expect.poll(plates, { timeout: 30_000 }).toEqual({ count: expected, renderOrder: -1 });
  });
```

- [ ] **Step 2: Implement `PlateMesh`**

In `src/experience/floors/engine/EngineFx.tsx`:

- extend the three import to `import { BoxGeometry, InstancedBufferAttribute, Object3D, PlaneGeometry } from "three";`;
- import the type: `import type { FlowInstance, PanelInstance, PlateInstance } from "./scenery";`;
- add a shared placer above `FlowMesh`:

```ts
/** A screen or plate: upright facing `yaw` (forward (sin, cos)) or flat on its `y`; YXZ so a roll turns it about its own normal. */
function placeQuad(o: Object3D, p: PlateInstance & { roll?: number }) {
  o.position.set(p.x, p.y, p.z);
  o.rotation.set(p.flat ? -Math.PI / 2 : 0, p.flat ? 0 : p.yaw, p.roll ?? 0, "YXZ");
  o.scale.set(p.w, p.h, 1);
}
```

- in `PanelMesh`, replace the inline placer with `instanceArrays(items, placeQuad, tier)` (behavior identical; the placer it replaces is the same code);
- append:

```tsx
/**
 * Lit-seam cladding (the bay walls and floors, the deck, the reactor plinth): one instanced draw on the holo `plate` mode,
 * the program the floating signs already compile. The panels are almost opaque and write depth, so they draw first
 * among the transparents (`renderOrder` -1) and never cover an additive screen or hologram behind no depth write.
 */
export function PlateMesh({ items, tier }: { items: readonly PlateInstance[]; tier: GpuTier }) {
  const geometry = useMemo(() => new PlaneGeometry(1, 1).setAttribute("aAlpha", new InstancedBufferAttribute(new Float32Array(items.length).fill(1), 1)), [items.length]);
  useDispose(geometry);
  const material = useMemo(() => createHoloMaterial({ mode: HOLO_MODE.plate, depthWrite: true, fade: [40, 110] }), []);
  useDispose(material);
  const { matrices, colors } = useMemo(() => instanceArrays(items, placeQuad, tier), [items, tier]);
  if (items.length === 0) return null;
  return (
    <instancedMesh name="engine-plates" args={[geometry, material, items.length]} renderOrder={-1} raycast={NO_RAYCAST}>
      <instancedBufferAttribute attach="instanceMatrix" args={[matrices, 16]} />
      <instancedBufferAttribute attach="instanceColor" args={[colors, 3]} />
    </instancedMesh>
  );
}
```

Check that `createHoloMaterial` accepts `depthWrite` (it does: `HoloMaterialOptions.depthWrite`) and that plates get normal blending by default (`additive` defaults to false for `plate`).

- [ ] **Step 3: Wire it in `EngineRoom.tsx`**

Change the import to `import { FlowMesh, PanelMesh, PlateMesh } from "./engine/EngineFx";`, retune the solids and mount the plates right after `MergedEdges`:

```tsx
      <MergedBoxes boxes={scene.solids} color="#1c1d22" emissive={ENGINE.accent} emissiveIntensity={0.03} />
      <MergedEdges boxes={scene.solids} color={ENGINE.accent} tier={tier} opacity={0.7} />
      <PlateMesh items={scene.plates} tier={tier} />
```

Update the component's doc comment: the scene draws now include "one plate instancing (`PlateMesh`, the lit-seam cladding)", and the merged solids are gunmetal.

- [ ] **Step 4: Typecheck, lint and unit tests**

Run: `bun run typecheck && bun run lint && bunx vitest run tests/unit/engine-scenery.test.ts tests/unit/floor-chunks-graph.test.ts tests/unit/office-chunk-graph.test.ts`
Expected: PASS.

- [ ] **Step 5: Build and run the B1 e2e**

Run: `bun run build && bunx playwright test e2e/engine-room.spec.ts --grep "lit-seam|hologram"`
Expected: PASS (the new test and the hologram test).

- [ ] **Step 6: Commit**

```bash
rtk git add src/experience/floors/engine/EngineFx.tsx src/experience/floors/EngineRoom.tsx e2e/engine-room.spec.ts
rtk git commit -m "feat(b1): gunmetal solids and the lit-seam plate draw"
```

---

### Task 4: Measure, reset the B1 cap, docs

Run by the controller after Tasks 1 to 3 pass review (it needs the perf lane numbers).

**Files:**
- Modify: `e2e/budgets.ts` (`BYTES_3D_BUDGET.floors.B1`)
- Create: `docs/decisions/2026-10-25-b1-material-cap.md`
- Modify: `docs/agents/floor-b1-engine-room.md`, `docs/agents/performance.md`, `AGENTS.md`, `README.md`, `docs/features.md`
- Modify: `docs/superpowers/specs/2026-10-25-b1-material-detail-design.md` (two wording fixes), this plan (`Status:`)

- [ ] **Step 1: Measure**

Run: `bun run build`, then `E2E_PORT=4431 PERF=1 bunx playwright test e2e/perf/bytes-3d.spec.ts e2e/perf/floors.spec.ts --grep "B1|bytes"` and read `floor chunk B1 (<tier>, unlocked session)` for both tiers and the B1 settled scene calls, triangles and programs.
Expected: the B1 bytes test fails only on the old 16 KB cap; scene calls 57 full and 54 lite (or within 1), programs at the baseline.

- [ ] **Step 2: Reset the cap**

In `e2e/budgets.ts`, set `B1: <max measured over both tiers> + 614` inside `floors` with a one-line comment above `BYTES_3D_BUDGET` or next to it: `B1` measured N B, cap N + 614 B (owner decision 2026-10-25, docs/decisions/2026-10-25-b1-material-cap.md). No other budget changes.

- [ ] **Step 3: Decision file**

Create `docs/decisions/2026-10-25-b1-material-cap.md`:

```markdown
# B1 Engine Room

- Date: 2026-10-25

The B1 material pass (gunmetal solids, lit-seam plates on the bay walls and floors, the deck and the reactor plinth, vent grilles) resets the B1 floor chunk cap once to its measured size plus 0.6 KB (owner, 2026-10-25): measured <N> B (was 16,337 B under the 16,384 B cap), cap <N + 614> B. No new shader program, the main 3D path and the session total unchanged; B1 settled scene calls <full> full and <lite> lite (cap 100), triangles <T> full.
```

Fill the numbers from Step 1 (no placeholder may remain).

- [ ] **Step 4: Docs**

- `docs/agents/floor-b1-engine-room.md`: in Scenery, add bullets for the gunmetal merged mesh (`#1c1d22`, emissive 0.03), `PlateMesh` (`engine/EngineFx.tsx`, `engine-plates`, holo `plate`, `renderOrder` -1, placement from `engineScenery().plates`: walls, bay floors at `PLATE.bayFloor`, deck, plinth and ring) and the vent grilles (`VENT`, `engineDetail().slats`); update "Draw calls" with the measured calls, triangles and the B1 chunk size and cap; add the plates and vents to the floor-only rules line (still no new program).
- `docs/agents/performance.md`: the B1 floor chunk and B1 settled scene-call rows and the "Floor chunks measured" line with the new numbers; the `floors.B1` cap in line 91.
- `AGENTS.md` (Budgets table, "Floor chunks (incremental)") and `README.md` (line with "B1 16 KB"): the new B1 cap in KB with one decimal.
- `docs/features.md`: a status row "B1 material pass" (2026-10-25, gunmetal panels with lit seams, vents, the plinth cladding; B1 cap reset to measured + 0.6 KB) and the B1 budgets bullet (around line 411) with the new chunk size, cap and scene calls; the floor-chunk table row (around line 576).
- The spec: in 3.2, replace "the workbench or a point-and-go target" with "or the workbench (plates never take a raycast, so the point-and-go targets work as before)" and "0.02 u over the 0.12 u bay floor" with "0.01 u over the 0.12 u bay floor (`PLATE.bayFloor`, under the projector discs at 0.16)"; in section 5 replace "or a point-and-go target" the same way.

- [ ] **Step 5: Docs tests and commit**

Run: `bunx vitest run tests/unit/docs-index.test.ts tests/unit/agents-md.test.ts tests/unit/safety.test.ts`
Expected: PASS.

```bash
rtk git add e2e/budgets.ts docs AGENTS.md README.md
rtk git commit -m "docs(b1): material pass rules, the B1 cap reset decision and the measured numbers"
```

### Task 5: Local verification (controller)

- [ ] `bun run verify:quick` passes.
- [ ] `bun run e2e:changed` passes.
- [ ] `E2E_PORT=4431 bun run e2e:perf` passes (bytes, floors, peaks, memory with the B1 round trips).
- [ ] `bun scripts/visual-gate.ts --base origin/main --profile strict` shows zero diff on every pose (no pose is on B1; the branch's commits are the head).
- [ ] Captures: `bun scripts/b1-reactor-shots.ts --base https://kurniadi.pages.dev --out <session>/b1-before` and, on the served export (`bun scripts/serve-static.ts --port 4300 --dir out`), `bun scripts/b1-reactor-shots.ts --base http://127.0.0.1:4300 --out <session>/b1-after`, all sizes and tiers; compare by eye (seams faint, signs, screens and holograms still lead, no panel over a screen, no z-fighting on the deck).
- [ ] Set this plan's `Status:` when the PR exists (`in review`, then `shipped in #N (sha), date`).

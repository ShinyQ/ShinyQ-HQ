# Highlights Hall: One Gate and B4 Premium Implementation Plan

Status: in review

> Recorded as approved. As built: the interiors are one instanced mesh per hall part (`hallPremium/build.ts`, `caseFrame.ts`, `shader.ts`) instead of one file per station; the result bars and win tokens live in the client-safe `src/content/hallBars.ts`; seven ribs phased between the east stations; the B4 rework (owner feedback after the first preview) added the indigo enclosure, the ring door pads and the sans station headers on the main path; the gate rings were dropped later (owner, 2026-11-04). Main path +3.4 KB gzip, accepted by the owner (see the decision).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the L1 Highlights Hall a single entrance from the Lobby and a premium neon (B4 "balanced") hall shell and station interiors, within an owner-approved lazy-chunk budget.

**Architecture:** The one-gate layout and the B4 shell stay on the 3D main path, built from the existing hall layout, solids and the shared holo stage program. The new station interiors live in a new lazy chunk (`floors/lobby/hallPremium/`), loaded like the Agent Office chunk: once per page, at idle on L1 or on a hall intent, with today's station look shown until it arrives.

**Tech Stack:** Next.js static export, React Three Fiber, three.js, `postprocessing` mipmap bloom (full tier), Bun, Vitest, Playwright perf/visual/memory lanes.

## Global Constraints

- Approved spec: `files/highlights-hall-premium-design.md` in the coordinating session (copy to `docs/superpowers/specs/2026-11-04-highlights-hall-premium-design.md`).
- Read root `AGENTS.md` (and `CLAUDE.md`, which points to it) and `docs/agents/floor-l1-lobby.md`, `docs/agents/3d-experience.md`, `docs/agents/performance.md` before changing code.
- Prefer `rtk` for Git; native Git only when exact output is needed.
- Never use em dashes in code comments, docs or copy.
- Exactly one entrance into the hall: the Lobby lead road under the gateway arch (`HALL.gate`, x = 36, lead road z = 21, 8 u wide). Remove `HALL.officeRoad`, `hallOfficeRoad`, `hallOfficeRoadDrawn`.
- Intensity: B4 "balanced". Stations and gate brightest; ribs, runway and walls one step lower. Palette cyan `#6ee7ff` and violet `#a78bfa`; win tiers may use gold, silver, bronze.
- No new content, numbers or claims. Station data only from `pickFeaturedPods`, `highlightEntries`, `winTiers`/`winCounts`, `beforeAfterResults`, `currentRoles`, existing profile stats. Any new visible string goes into both `messages/en.json` and `messages/id.json`.
- Budgets (owner approved 2026-11-04): main 3D path growth at most about 2 KB gzip; new `BYTES_3D_BUDGET.hallPremium` = measured + 614 B, target at most 12 KB gzip, counted in the session totals (session caps rise by the measured chunk); the hall adds at most about 10 scene calls with all parts in view; every L1 settled pose under 125 on both tiers; ride triangle peak not above main's; shader programs within `e2e/perf/baseline.json` + 2 (at most one new program).
- Full tier: existing bloom only (no new passes). Lite: no bloom, no motes, static win tokens, wake = edge brighten. Reduced motion: everything still.
- Every GPU resource disposed (`useDispose`); memory gates flat.
- Classic pages never import hall premium code (`check-client-chunks`).
- Owner reviews an early look before the full gates, and a final local preview before any push. After owner approval: PR, merge only after the required checks pass, then verify main CI, Deploy and the live site.
- Start from current `origin/main`. If PR #400 (English test contracts) is not merged yet, rebase on it once merged before opening this PR, so main CI is green.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/experience/floors/lobby/hallLayout.ts` (modify) | One gate: drop the office road, add `HALL.partition` and `hallPartitions()`; obstacles include partitions. |
| `src/experience/config.ts`, `src/experience/floors/Lobby.tsx` (modify) | Stop wiring the office-to-hall road and its road zone. |
| `src/experience/floors/lobby/hallStage.ts` (modify) | B4 shell instances: ribs, partition rails, runway, packets, gate rings, motes; fountains removed. |
| `src/experience/fx/holoFx.ts` (modify) | New `aStage` kinds for rib, gate ring, runway, packet, mote (same program). |
| `src/experience/floors/lobby/HighlightsHall.tsx`, `hallGallery.ts`, `hallSolids.ts`, `HallFx.tsx` (modify) | Draw partitions and shell; host the premium mount; keep `HallView` hiding. |
| `src/content/highlights.ts` (modify) | Pure data helpers `resultBars` and `winTokens`. |
| `src/experience/floors/lobby/hallPremium/chunk.ts` (create) | Main-path loader: `loadHallPremium`, state store, `shouldLoadHallPremium`. |
| `src/experience/floors/lobby/hallPremium/wake.ts` (create) | Pure wake easing `wakeLevel`. |
| `src/experience/floors/lobby/hallPremium/scene.ts` (create) | Lazy chunk entry exporting `HallPremium`. |
| `src/experience/floors/lobby/hallPremium/HallPremium.tsx` (create) | Mounts the seven station interiors, wake state, tier and motion handling. |
| `src/experience/floors/lobby/hallPremium/caseFrame.ts` (create) | Shared glass case, edge lines, cone and halo for each station. |
| `src/experience/floors/lobby/hallPremium/stations/*.tsx` (create) | One interior per station: `About`, `Projects`, `Work`, `Wins`, `Now`, `Results`, `Contact`. |
| `tests/unit/highlights-layout.test.ts`, `tests/unit/l1-outline-layout.test.ts` (modify) | Enclosure and routing. |
| `tests/unit/hall-stage.test.ts` (modify) | Shell instance counts and kinds. |
| `tests/unit/highlights-data.test.ts` (modify) | `resultBars`, `winTokens`. |
| `tests/unit/hall-premium-chunk.test.ts`, `hall-premium-graph.test.ts`, `hall-premium-wake.test.ts`, `hall-premium-frame.test.ts` (create) | Loader, chunk boundary, wake, case frame. |
| `e2e/budgets.ts`, `e2e/perf/bytes-3d.spec.ts`, `e2e/perf/floors.spec.ts`, `e2e/perf/baseline.json`, `e2e/highlights.spec.ts`, `e2e/visual-gate.spec.ts`, `scripts/visual-gate.ts`, `e2e/memory.spec.ts`, `e2e/perf/memory-full.spec.ts` (modify) | Gates. |
| `docs/agents/floor-l1-lobby.md`, `docs/agents/performance.md`, `docs/features.md`, `docs/decisions/2026-11-04-highlights-hall-one-gate-premium.md`, spec and plan copies | Docs. |

---

### Task 1: One gate

**Files:**
- Modify: `src/experience/floors/lobby/hallLayout.ts` (`HALL.officeRoad`, `hallOfficeRoad`, `hallOfficeRoadDrawn`, `HALL.link`, `buildHighlightsHall` obstacles)
- Modify: `src/experience/config.ts`, `src/experience/floors/Lobby.tsx` (remove office-road wiring and `HALL.link` from the road zone)
- Modify: the minimap layer that draws L1 roads (find with `rg -n "hallOfficeRoad|officeRoad" src`)
- Test: `tests/unit/highlights-layout.test.ts`, `tests/unit/l1-outline-layout.test.ts`

**Interfaces:**
- Produces: `HALL.partition: { x: number; thickness: number; height: number }`; `hallPartitions(): Rect[]` (west-edge segments north and south of the gate opening); `HALL_LAYOUT.obstacles` includes them. `hallOfficeRoad` and `hallOfficeRoadDrawn` no longer exist.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/highlights-layout.test.ts
import * as hall from "@/experience/floors/lobby/hallLayout";
import { HALL, HALL_LAYOUT, hallPartitions } from "@/experience/floors/lobby/hallLayout";

describe("one gate", () => {
  it("has no road from the Agent Office", () => {
    expect("hallOfficeRoad" in hall).toBe(false);
    expect("officeRoad" in HALL).toBe(false);
  });

  it("closes the west edge except the gateway opening", () => {
    const parts = hallPartitions();
    expect(parts).toHaveLength(2);
    const [north, south] = [...parts].sort((a, b) => a.minZ - b.minZ);
    expect(north.minZ).toBe(HALL.zone.minZ);
    expect(south.maxZ).toBe(HALL.zone.maxZ);
    expect(north.maxZ).toBeLessThanOrEqual(HALL.gate.north.maxZ);
    expect(south.minZ).toBeGreaterThanOrEqual(HALL.gate.south.minZ);
    for (const p of parts) expect(HALL_LAYOUT.obstacles).toContainEqual(p);
  });
});
```

```ts
// tests/unit/l1-outline-layout.test.ts: replace the office-road loop assertions with
it("reaches every hall station only through the gate", () => {
  const L1 = layoutOf("L1");
  for (const s of HALL_LAYOUT.stations) {
    const path = L1.navgrid.path(OFFICE_STOP, s.pad);
    expect(path, s.name).not.toBeNull();
    expect(crossesOnlyAtGate(path!), s.name).toBe(true);
  }
});

function crossesOnlyAtGate(path: { x: number; z: number }[]): boolean {
  const x0 = HALL.partition.x;
  const open = { min: HALL.gate.north.maxZ, max: HALL.gate.south.minZ };
  let crossed = false;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    if ((a.x - x0) * (b.x - x0) > 0) continue;
    const z = a.z + ((x0 - a.x) / (b.x - a.x || 1)) * (b.z - a.z);
    if (z < open.min || z > open.max) return false;
    crossed = true;
  }
  return crossed;
}
```

Use the existing helpers in that file for the L1 layout and navgrid (`layoutOf`, the office stop constant); adapt their names, not the behaviour.

- [ ] **Step 2: Run them and confirm they fail**

Run: `bun run test tests/unit/highlights-layout.test.ts tests/unit/l1-outline-layout.test.ts --maxWorkers=2`
Expected: FAIL (`hallPartitions` missing, `officeRoad` still present, office path enters the hall through the link).

- [ ] **Step 3: Implement**

```ts
// hallLayout.ts, inside HALL (officeRoad removed)
/** Low glass partitions on the hall's west edge; the gateway is the only opening. */
partition: { x: X0 - 1, thickness: 0.4, height: 2.4 },

/** The west-edge partitions north and south of the gateway opening (obstacles and navgrid blockers). */
export function hallPartitions(): Rect[] {
  const { x, thickness } = HALL.partition;
  const minX = x - thickness / 2;
  const maxX = x + thickness / 2;
  return [
    { minX, maxX, minZ: HALL.zone.minZ, maxZ: HALL.gate.north.maxZ },
    { minX, maxX, minZ: HALL.gate.south.minZ, maxZ: HALL.zone.maxZ },
  ];
}
```

Add `...hallPartitions()` to `obstacles` in `buildHighlightsHall`. Delete `hallOfficeRoad`, `hallOfficeRoadDrawn` and their usages in `config.ts`, `Lobby.tsx` and the minimap. Remove `HALL.link` from `FloorLayout.roadZone`; delete `HALL.link` if no other reader needs it. Check the partitions do not overlap the certification wall and keep 6 u walkways (`tests/unit/lobby-layout.test.ts` space rules).

- [ ] **Step 4: Run tests**

Run: `bun run test tests/unit/highlights-layout.test.ts tests/unit/l1-outline-layout.test.ts tests/unit/lobby-layout.test.ts tests/unit/lobby-office.test.ts tests/unit/hall-interact.test.ts --maxWorkers=2`
Expected: PASS. Update any test that asserted the office loop to the one-gate expectation; never delete space-rule checks.

- [ ] **Step 5: Commit**

```bash
rtk git add src/experience tests/unit
rtk git commit -m "feat(l1): one gate into the Highlights Hall, the office road goes"
```

---

### Task 2: B4 hall shell

**Files:**
- Modify: `src/experience/fx/holoFx.ts`, `src/experience/floors/lobby/hallStage.ts`, `hallSolids.ts`, `HighlightsHall.tsx`, `HallFx.tsx`
- Test: `tests/unit/hall-stage.test.ts`

**Interfaces:**
- Consumes: `HALL`, `hallPartitions()` (Task 1).
- Produces: `STAGE_KIND.rib | gateRing | runway | packet | mote` in `holoFx.ts`; `hallShellInstances(tier: "full" | "lite"): StageInstance[]` in `hallStage.ts` (use the existing stage instance type; add `tag?: string` if absent).

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/hall-stage.test.ts
import { HALL } from "@/experience/floors/lobby/hallLayout";
import { hallShellInstances } from "@/experience/floors/lobby/hallStage";
import { STAGE_KIND } from "@/experience/fx/holoFx";

describe("B4 shell", () => {
  const full = hallShellInstances("full");
  const lite = hallShellInstances("lite");
  const count = (list: typeof full, kind: number) => list.filter((i) => i.kind === kind).length;

  it("spans the hall with a rib every 12 u", () => {
    const depth = HALL.zone.maxZ - HALL.zone.minZ;
    expect(count(full, STAGE_KIND.rib)).toBe(Math.floor(depth / 12) + 1);
  });
  it("has three gate rings, one runway and two packets", () => {
    expect(count(full, STAGE_KIND.gateRing)).toBe(3);
    expect(count(full, STAGE_KIND.runway)).toBe(1);
    expect(count(full, STAGE_KIND.packet)).toBe(2);
  });
  it("draws motes on the full tier only", () => {
    expect(count(full, STAGE_KIND.mote)).toBe(280);
    expect(count(lite, STAGE_KIND.mote)).toBe(0);
  });
  it("drops the two fountains", () => {
    expect(full.some((i) => i.tag === "fountain")).toBe(false);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun run test tests/unit/hall-stage.test.ts --maxWorkers=2`
Expected: FAIL (`hallShellInstances` or kinds missing).

- [ ] **Step 3: Implement**

- Add the five kinds to the stage shader in `holoFx.ts` (same `HOLO_MODE.stage` program; branch on `aStage`):
  - rib: thin arc; colour alternates cyan/violet by index; brightness `0.78 * (0.9 + 0.25 * max(0, sin(t * 0.7 - i * 0.55)))`.
  - gate ring: brightness `1.2 + 0.6 * max(0, sin(t * 1.2 + i * 0.9))`.
  - runway: cyan at about half of today's lead-road glow, half its width.
  - packet: travels gate to spine every 10 s.
  - mote: rises at 0.4 of the base speed, opacity 0.5.
  - Reduced motion: `t = 0` for every kind.
- `hallShellInstances(tier)` builds instances from `HALL`: ribs every 12 u along z, three rings 1.6 u apart west of the arch on the lead road, the runway from the arch to `hall-spine`, two packets, 280 motes from a fixed seed (deterministic captures). Lite returns no motes.
- Partitions: low glass boxes from `hallPartitions()` in the merged solid mesh (`hallSolids.ts`) with a violet rail in `hallLineBuffer`.
- Remove the two fountains.
- Keep every instance inside the existing three `HallView` parts, so off-view and ride hiding still apply.

- [ ] **Step 4: Run tests**

Run: `bun run test tests/unit/hall-stage.test.ts tests/unit/hall-gallery.test.ts --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add src/experience tests/unit
rtk git commit -m "feat(l1): B4 neon shell for the Highlights Hall"
```

---

### Task 3: Premium data helpers

**Files:**
- Modify: `src/content/highlights.ts`
- Test: `tests/unit/highlights-data.test.ts`

**Interfaces:**
- Produces:
  - `type ResultBar = { before: number; after: number; scale: "linear" | "log" } | null`
  - `resultBars(value: string): ResultBar`
  - `type WinToken = { tier: "first" | "second" | "third" | "honor"; ring: 0 | 1 | 2; angle: number; size: number }`
  - `winTokens(counts: { first: number; second: number; third: number; honor: number }): WinToken[]`

- [ ] **Step 1: Write the failing tests**

```ts
import { resultBars, winCounts, winTokens } from "@/content/highlights";

describe("resultBars", () => {
  it("parses percentages", () => {
    expect(resultBars("90.9% to 36.4%")).toEqual({ before: 90.9, after: 36.4, scale: "linear" });
  });
  it("normalises units before comparing", () => {
    expect(resultBars("11.7 MB → 158 KB")).toEqual({ before: 11_700, after: 158, scale: "log" });
  });
  it("handles approximate seconds", () => {
    expect(resultBars("~2 s to ~0.2 s")).toEqual({ before: 2, after: 0.2, scale: "linear" });
  });
  it("returns null when the sides are not comparable", () => {
    expect(resultBars("6 vs 18")).toBeNull();
    expect(resultBars("4.5 KB → 2.1 s")).toBeNull();
  });
});

describe("winTokens", () => {
  it("makes one token per award and honor, first places larger", () => {
    const c = winCounts();
    const tokens = winTokens(c);
    expect(tokens).toHaveLength(c.first + c.second + c.third + c.honor);
    expect(tokens.filter((t) => t.tier === "first").every((t) => t.size > 1)).toBe(true);
  });
});
```

Adapt the `winCounts()` call to its real signature and field names; the total must equal today's award and honor count (24).

- [ ] **Step 2: Run and confirm failure**

Run: `bun run test tests/unit/highlights-data.test.ts --maxWorkers=2`
Expected: FAIL (`resultBars`, `winTokens` missing).

- [ ] **Step 3: Implement**

```ts
const UNIT: Record<string, { dim: string; factor: number }> = {
  "%": { dim: "pct", factor: 1 },
  ms: { dim: "time", factor: 0.001 },
  s: { dim: "time", factor: 1 },
  B: { dim: "size", factor: 0.001 },
  KB: { dim: "size", factor: 1 },
  MB: { dim: "size", factor: 1000 },
};

function side(raw: string): { value: number; dim: string } | null {
  const m = raw.trim().match(/^~?\s*([\d.,]+)\s*(%|ms|s|B|KB|MB)?$/);
  if (!m) return null;
  const unit = UNIT[m[2] ?? ""] ?? { dim: "count", factor: 1 };
  return { value: Number(m[1].replace(/,/g, "")) * unit.factor, dim: unit.dim };
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export type ResultBar = { before: number; after: number; scale: "linear" | "log" } | null;

export function resultBars(value: string): ResultBar {
  const parts = value.split(/\s*(?:→|\bto\b)\s*/);
  if (parts.length !== 2) return null;
  const [a, b] = parts.map(side);
  if (!a || !b || a.dim !== b.dim || a.value <= 0 || b.value <= 0) return null;
  const ratio = Math.max(a.value, b.value) / Math.min(a.value, b.value);
  return { before: round(a.value), after: round(b.value), scale: ratio > 20 ? "log" : "linear" };
}

export type WinToken = { tier: "first" | "second" | "third" | "honor"; ring: 0 | 1 | 2; angle: number; size: number };

export function winTokens(c: { first: number; second: number; third: number; honor: number }): WinToken[] {
  const groups = [
    { tier: "first", n: c.first, ring: 0, size: 1.4 },
    { tier: "second", n: c.second, ring: 1, size: 1 },
    { tier: "third", n: c.third, ring: 1, size: 1 },
    { tier: "honor", n: c.honor, ring: 2, size: 0.6 },
  ] as const;
  return groups.flatMap((g, gi) =>
    Array.from({ length: g.n }, (_, i) => ({
      tier: g.tier,
      ring: g.ring,
      size: g.size,
      angle: (i / Math.max(g.n, 1)) * Math.PI * 2 + gi * 0.4,
    })),
  );
}
```

- [ ] **Step 4: Run tests**

Run: `bun run test tests/unit/highlights-data.test.ts --maxWorkers=2`
Expected: PASS. Add one test case running `resultBars` over every current `beforeAfterResults` value and asserting at least 8 of the 10 parse; list any text-only results in the PR description.

- [ ] **Step 5: Commit**

```bash
rtk git add src/content/highlights.ts tests/unit/highlights-data.test.ts
rtk git commit -m "feat(highlights): result bars and win tokens for the hall interiors"
```

---

### Task 4: Premium chunk loader and boundary

**Files:**
- Create: `src/experience/floors/lobby/hallPremium/chunk.ts`, `wake.ts`, `scene.ts` (stub)
- Modify: `src/experience/floors/lobby/HighlightsHall.tsx` (load trigger and mount point), the file that registers `__hq.office` hooks (find with `rg -n "office: \{|__hq.office" src`)
- Test: `tests/unit/hall-premium-chunk.test.ts`, `tests/unit/hall-premium-wake.test.ts`, `tests/unit/hall-premium-graph.test.ts`

**Interfaces:**
- Consumes: `HALL.lazyX`, the current floor, rover x, the first-frame idle signal used by the office watch loader, the hall intent signals (gate start room, interactable target, Cmd-K selection).
- Produces: `loadHallPremium(): Promise<HallPremiumModule>`; `hallPremiumModule(): HallPremiumModule | null`; `hallPremiumState(): HallPremiumState`; `useHallPremium(): HallPremiumModule | null`; `shouldLoadHallPremium(i: { floor: FloorId; x: number; idle: boolean; intent: boolean }): boolean`; `wakeLevel(prev: number, docked: boolean, dt: number, reduced: boolean): number`; hooks `__hq.hall.loadPremium()` and `__hq.probes.hallPremium`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/hall-premium-chunk.test.ts
import { HALL } from "@/experience/floors/lobby/hallLayout";
import { shouldLoadHallPremium } from "@/experience/floors/lobby/hallPremium/chunk";

describe("hall premium trigger", () => {
  it("loads at idle on L1", () => {
    expect(shouldLoadHallPremium({ floor: "L1", x: 0, idle: true, intent: false })).toBe(true);
  });
  it("loads on a hall intent or near the hall before idle", () => {
    expect(shouldLoadHallPremium({ floor: "L1", x: 0, idle: false, intent: true })).toBe(true);
    expect(shouldLoadHallPremium({ floor: "L1", x: HALL.lazyX + 1, idle: false, intent: false })).toBe(true);
  });
  it("waits otherwise and never loads off L1", () => {
    expect(shouldLoadHallPremium({ floor: "L1", x: 0, idle: false, intent: false })).toBe(false);
    expect(shouldLoadHallPremium({ floor: "L3", x: 99, idle: true, intent: true })).toBe(false);
  });
});
```

```ts
// tests/unit/hall-premium-wake.test.ts
import { wakeLevel } from "@/experience/floors/lobby/hallPremium/wake";

it("rises to 1 in about 0.8 s when docked and settles back", () => {
  let w = 0;
  for (let i = 0; i < 48; i++) w = wakeLevel(w, true, 1 / 60, false);
  expect(w).toBeCloseTo(1, 1);
  for (let i = 0; i < 120; i++) w = wakeLevel(w, false, 1 / 60, false);
  expect(w).toBeLessThan(0.05);
});

it("jumps without animation under reduced motion", () => {
  expect(wakeLevel(0, true, 1 / 60, true)).toBe(1);
  expect(wakeLevel(1, false, 1 / 60, true)).toBe(0);
});
```

```ts
// tests/unit/hall-premium-graph.test.ts
import { describe, expect, it } from "vitest";
import { staticClosure } from "../helpers/import-graph";

const DIR = "src/experience/floors/lobby/hallPremium";
const MAIN_ENTRIES = ["src/experience/Experience.tsx", "src/experience/ExperienceGate.tsx", "src/hud/Hud.tsx"];
const MAIN_ALLOWED = [`${DIR}/chunk.ts`, `${DIR}/wake.ts`];

describe("hall premium chunk boundary", { timeout: 30_000 }, () => {
  it("keeps the interiors out of the main 3D path", () => {
    for (const entry of MAIN_ENTRIES) {
      const main = staticClosure(entry);
      expect([...main].filter((f) => f.startsWith(DIR) && !MAIN_ALLOWED.includes(f)), entry).toEqual([]);
    }
  });
  it.todo("reaches HallPremium.tsx from the scene entry (enabled in Task 5)");
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun run test tests/unit/hall-premium-chunk.test.ts tests/unit/hall-premium-wake.test.ts tests/unit/hall-premium-graph.test.ts --maxWorkers=2`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement**

```ts
// chunk.ts (mirrors office/chunk.ts)
import { useSyncExternalStore } from "react";
import type { FloorId } from "@/content/schema";
import { HALL } from "../hallLayout";
import type * as HallPremiumChunk from "./scene";

export type HallPremiumModule = typeof HallPremiumChunk;
export type HallPremiumState = "idle" | "loading" | "ready" | "failed";

let pending: Promise<HallPremiumModule> | null = null;
let loaded: HallPremiumModule | null = null;
let state: HallPremiumState = "idle";
const listeners = new Set<() => void>();
const set = (next: HallPremiumState) => {
  state = next;
  for (const listener of listeners) listener();
};

/** Loads the hall interiors once per page; a failed import is forgotten so the next request retries. */
export function loadHallPremium(): Promise<HallPremiumModule> {
  if (!pending) {
    set("loading");
    pending = import("./scene").then(
      (mod) => {
        loaded = mod;
        set("ready");
        return mod;
      },
      (error: unknown) => {
        pending = null;
        set("failed");
        throw error;
      },
    );
  }
  return pending;
}

export const hallPremiumModule = () => loaded;
export const hallPremiumState = () => state;
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const useHallPremium = () => useSyncExternalStore(subscribe, hallPremiumModule, () => null);

export function shouldLoadHallPremium({ floor, x, idle, intent }: { floor: FloorId; x: number; idle: boolean; intent: boolean }): boolean {
  if (floor !== "L1") return false;
  return idle || intent || x > HALL.lazyX;
}
```

```ts
// wake.ts
const RISE = 1 / 0.8;
const FALL = 1 / 1.6;

export function wakeLevel(prev: number, docked: boolean, dt: number, reduced: boolean): number {
  if (reduced) return docked ? 1 : 0;
  const next = docked ? prev + RISE * dt : prev - FALL * dt;
  return Math.min(1, Math.max(0, next));
}
```

```ts
// scene.ts (stub until Task 5)
export const HallPremium = () => null;
```

In `HighlightsHall.tsx`: an effect calls `loadHallPremium()` when `shouldLoadHallPremium` is true (intent from the existing gate start room, point-and-go target or Cmd-K selection of an `L1:highlights-*` room; idle from the office watch's first-frame idle signal). Render `<mod.HallPremium />` inside the hall group when `useHallPremium()` is non-null. Register `__hq.hall.loadPremium` and `__hq.probes.hallPremium` beside the office hooks.

- [ ] **Step 4: Run tests**

Run: `bun run test tests/unit/hall-premium-chunk.test.ts tests/unit/hall-premium-wake.test.ts tests/unit/hall-premium-graph.test.ts tests/unit/office-chunk-graph.test.ts --maxWorkers=2`
Expected: PASS (the entry test stays `todo`).

- [ ] **Step 5: Commit**

```bash
rtk git add src/experience tests/unit
rtk git commit -m "feat(l1): lazy loader for the Highlights Hall interiors"
```

---

### Task 5: Station interiors

**Files:**
- Create: `src/experience/floors/lobby/hallPremium/HallPremium.tsx`, `caseFrame.ts`, `stations/About.tsx`, `stations/Projects.tsx`, `stations/Work.tsx`, `stations/Wins.tsx`, `stations/Now.tsx`, `stations/Results.tsx`, `stations/Contact.tsx`
- Modify: `hallPremium/scene.ts` (`export { HallPremium } from "./HallPremium";`), `HighlightsHall.tsx` (hide the base props an interior replaces once ready), `hallContent.ts` if a selector is needed
- Test: `tests/unit/hall-premium-frame.test.ts` (create), `tests/unit/hall-premium-graph.test.ts` (enable the entry test)

**Interfaces:**
- Consumes: `HALL_LAYOUT.stations` (`name`, `rect`, `pad`, `face`), `wakeLevel`, `resultBars`, `winTokens`, `winCounts`, the content selectors in `hallContent.ts`, `HOLO_MODE.stage`, `BatchedLabels`, `useDispose`, the tier and reduced-motion hooks `HighlightsHall.tsx` already uses.
- Produces: `HallPremium(): JSX.Element`; `caseFrame(station: HallStation): { glass: BufferGeometry; edges: Float32Array; cone: StageInstance; halo: StageInstance }`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/hall-premium-frame.test.ts
import { HALL_LAYOUT } from "@/experience/floors/lobby/hallLayout";
import { caseFrame } from "@/experience/floors/lobby/hallPremium/caseFrame";

it("fits every case inside its station footprint and keeps the door pad clear", () => {
  for (const s of HALL_LAYOUT.stations) {
    const f = caseFrame(s);
    f.glass.computeBoundingBox();
    const b = f.glass.boundingBox!;
    expect(b.min.x).toBeGreaterThanOrEqual(s.rect.minX - 1e-6);
    expect(b.max.x).toBeLessThanOrEqual(s.rect.maxX + 1e-6);
    expect(b.min.z).toBeGreaterThanOrEqual(s.rect.minZ - 1e-6);
    expect(b.max.z).toBeLessThanOrEqual(s.rect.maxZ + 1e-6);
    const padInside = s.pad.x >= b.min.x && s.pad.x <= b.max.x && s.pad.z >= b.min.z && s.pad.z <= b.max.z;
    expect(padInside, s.name).toBe(false);
  }
});
```

In `hall-premium-graph.test.ts`, replace the `todo` with:

```ts
it("reaches HallPremium.tsx from the scene entry", () => {
  expect(staticClosure(`${DIR}/scene.ts`).has(`${DIR}/HallPremium.tsx`)).toBe(true);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun run test tests/unit/hall-premium-frame.test.ts tests/unit/hall-premium-graph.test.ts --maxWorkers=2`
Expected: FAIL (`caseFrame` and `HallPremium.tsx` missing).

- [ ] **Step 3: Implement the frame and mount**

- `caseFrame(s)`: a glass box from `s.rect` inset 0.3 u, 8.6 u tall; its edge segments; a cone instance (top light) and a halo instance (floor ring) in the station accent (cyan for odd station numbers, violet for even).
- `HallPremium` merges all seven glass boxes into one mesh, all edges into one line mesh, and adds cones and halos as stage instances: the shared frame costs at most 3 draws. One reusable tinted glass material (transparent, `depthWrite: false`); this is the only new program allowed.
- Wake: keep one level per station, updated each frame with `wakeLevel(prev, dockedStation === s.name, dt, reduced)`, from the existing pad/door state. Feed it to edge brightness and to each interior.
- Base props: a small store read by `HighlightsHall.tsx` hides the base station props that an interior replaces once the chunk is ready (door pads, spurs, labels, deep links unchanged).
- Precompile the new material through `HallReady` when the chunk mounts; dispose everything with `useDispose`.

- [ ] **Step 4: Implement the seven interiors (each at most two draws)**

| File | Build |
|---|---|
| `About.tsx` | Two gyroscope rings as stage instances (0.15 rad/s), the existing portrait disc; stat numbers count up with wake through `BatchedLabels`. |
| `Projects.tsx` | Screenshot quads reuse the existing atlas with a scan shimmer term; a frame trace instance per slab; headline metric glows below. |
| `Work.tsx` | Light curtain plane inside the arch; one light bar per `highlightEntries` row (newest top) with org and period labels. |
| `Wins.tsx` | `winTokens(winCounts())` as one instanced mesh in three tilted rings (12°, -18°, 26°), 0.12 to 0.2 rad/s; first places gold with a highlight sweep; "24" floats above. |
| `Now.tsx` | Two cards from `currentRoles`, each with a breathing dot and its start date. |
| `Results.tsx` | Per shown result, `resultBars(value)`: non-null draws a faint before bar and a solid after bar grown by wake (log lengths when `scale === "log"`); null shows text only. "+N more" kept. |
| `Contact.tsx` | Floor ripple rings (stage instances); card text unchanged. |

Lite: no shimmer, sweep or orbit; wake only brightens edges. Reduced motion: wake jumps, nothing moves.

- [ ] **Step 5: Run tests**

Run: `bun run test tests/unit/hall-premium-frame.test.ts tests/unit/hall-premium-graph.test.ts tests/unit/hall-premium-wake.test.ts tests/unit/hall-content.test.ts tests/unit/highlights-stations.test.ts --maxWorkers=2`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
rtk git add src/experience tests/unit
rtk git commit -m "feat(l1): premium interiors for the seven Highlights Hall stations"
```

---

### Task 6: Early look for the owner

**Files:** session artifacts only.

- [ ] **Step 1:** `bun run build` once; serve the static export on a free port; confirm HTTP 200.
- [ ] **Step 2:** Capture desktop (1440 x 900, full tier) and phone (390 x 844, lite): the gate from the Lobby, the walk in through the rings, an overview, each of the seven stations before and after wake, and the office plaza showing no hall road. Save under the session `files/captures/hall-premium/`.
- [ ] **Step 3:** Report the captures and preview URL to the coordinator and stop. Apply owner feedback and repeat. Do not run the full gates or push until the owner approves the look.

---

### Task 7: Budgets and gates

**Files:** `e2e/budgets.ts`, `e2e/perf/bytes-3d.spec.ts`, `e2e/perf/floors.spec.ts`, `e2e/perf/baseline.json`, `e2e/highlights.spec.ts`, `e2e/visual-gate.spec.ts`, `scripts/visual-gate.ts`, `e2e/memory.spec.ts`, `e2e/perf/memory-full.spec.ts`

- [ ] **Step 1: Bytes.** In `bytes-3d.spec.ts`, after the office chunks, call `__hq.hall.loadPremium()` and measure the chunk; add `BYTES_3D_BUDGET.hallPremium` (measured + 614 B) and count it in both session totals. Re-measure the main path and set `failAt` and the session caps to measured + 614 B. Confirm the chunk is at most 12 KB gzip and main-path growth at most about 2 KB; if not, reduce before continuing.
- [ ] **Step 2: Highlights E2E.** Every station deep link opens; point-and-go from the office stop to each station crosses `HALL.partition.x` only inside the gate opening; no road joins the office plaza to the hall; L1 stays under 125 scene calls on both tiers from the plaza, the gate and every station with the chunk ready.
- [ ] **Step 3: Perf lane.** Add settled poses `settled-L1-hall-gate` and `settled-L1-hall-<station>` with the chunk ready; update `baseline.json` (programs at most +1); confirm ride peaks (`peaks.spec.ts`) are not above main's.
- [ ] **Step 4: Visual gate.** New poses: gate from the Lobby, overview, each station after wake (fixed clock, seeded motes). Regenerate baselines only for the intended hall changes.
- [ ] **Step 5: Memory.** Load `__hq.hall.loadPremium()` in the warm-up of `memory.spec.ts` and `memory-full.spec.ts`; geometries, textures and programs return to baseline.
- [ ] **Step 6: Run** `bun run verify:quick`, then the full functional E2E suite (one worker if the host is loaded), then the perf lane and strict visual gate per `docs/agents/performance.md`. Treat a timeout as contention only after an unchanged isolated one-worker rerun passes.
- [ ] **Step 7: Commit**

```bash
rtk git add e2e scripts
rtk git commit -m "test(l1): budgets, perf poses, visual poses and memory for the hall interiors"
```

---

### Task 8: Docs and decision

- [ ] **Step 1:** Update `docs/agents/floor-l1-lobby.md` (one gate and partitions, B4 shell, interiors, the premium chunk and trigger, rendering costs, tiers and motion), `docs/agents/performance.md` (the `hallPremium` cap and session totals), `docs/features.md`.
- [ ] **Step 2:** Add `docs/decisions/2026-11-04-highlights-hall-one-gate-premium.md` (owner choices: one Lobby gate, B4 balanced, lazy chunk about 12 KB); copy the spec to `docs/superpowers/specs/2026-11-04-highlights-hall-premium-design.md` and this plan to `docs/superpowers/plans/2026-11-04-highlights-hall-premium.md`.
- [ ] **Step 3:** `rg -n "\u2014" docs src` (the em dash) shows nothing new.
- [ ] **Step 4: Commit**

```bash
rtk git add docs
rtk git commit -m "docs(l1): one-gate premium Highlights Hall"
```

---

### Task 9: Final review, publish and verify

- [ ] **Step 1:** Rebase on current `origin/main` (including PR #400), rebuild, rerun `verify:quick` and the hall E2E, refresh captures.
- [ ] **Step 2:** Report the final local preview and captures to the coordinator; wait for owner approval.
- [ ] **Step 3:** After approval: push the branch, open a PR to `main`, merge only after the required checks pass (no bypass, no force push).
- [ ] **Step 4:** Confirm the push CI on `main` is green, Deploy deployed the merge SHA, no rollback ran, and the live 3D site serves the new hall (the deployed assets contain the hall premium chunk). Report the PR URL, merge SHA, run IDs and the live check.

---

## Execution

One coding session in ShinyQ-HQ, tasks in order (they share the L1 hall files), using subagent-driven development per task. The coordinator relays the early look (Task 6) and final preview (Task 9) to the owner.

## Self-review

- Spec coverage: one gate (Task 1), B4 shell (Task 2), interiors (Tasks 3 and 5), lazy chunk and trigger (Task 4), budgets, tiers and motion (Tasks 2, 4, 5, 7), early look and verification (Tasks 6, 7, 9), docs (Task 8). Out-of-scope items untouched.
- Names used consistently: `hallPartitions`, `HALL.partition`, `hallShellInstances`, `STAGE_KIND`, `resultBars`, `winTokens`, `loadHallPremium`, `useHallPremium`, `shouldLoadHallPremium`, `wakeLevel`, `caseFrame`, `HallPremium`, `BYTES_3D_BUDGET.hallPremium`, `__hq.hall.loadPremium`, `__hq.probes.hallPremium`.
- Verify before Task 1: helper names in `l1-outline-layout.test.ts`, the `winCounts` signature, the stage instance type in `hallStage.ts`, and where `__hq.office` hooks are registered. Adapt names, not behaviour.

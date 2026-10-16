# Round 5 P3: CPU, lifecycle and memory Implementation Plan

Status: shipped in #81 (7336303), 2026-10-13

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 3D HQ cheaper on the CPU, the GPU clock and memory without changing a single visible pixel of the look: no geometry leaks across floor round trips (with a deterministic memory e2e), no frames while an opaque panel hides the world, at most 60 fps on 90/120/144 Hz displays, a bounded `findPath`, a palette search that does not re-normalize ~1.4k strings per keystroke, store and `localStorage` writes only on real changes, no `backdrop-filter` under near-opaque panels, and a WebGL crash path that retries once and offers "Retry 3D" instead of stranding visitors on the static page.

**Architecture:** Every change keeps the current runtime design: per-frame state stays in mutable runtime objects (`roverRuntime`, plus a new ride/beam motion clock), the store mirrors it only on change, floors keep mounting and unmounting (no keep-alive). The canvas switches to `frameloop="never"` and a small `FrameLoop` component calls R3F `advance` from its own `requestAnimationFrame` loop through a pure frame pacer (60 fps cap, pause while a `data-hq-cover` panel hides more than 90% of the canvas). Pure helpers (pacer, cover math, recovery state machine, ride clock, navgrid search, palette scoring, PNG diff) are unit tested in node; behaviour is proven with Playwright specs (`e2e/memory.spec.ts`, `e2e/lifecycle.spec.ts`) and an opt-in visual gate (`e2e/visual-gate.spec.ts` + `scripts/shot-diff.ts`) that compares main's build with the branch.

**Tech Stack:** Next.js 16 static export, React 19 (React Compiler lint rules on), @react-three/fiber 9.8 (`advance`, `frameloop="never"`), three r186, zustand 5.0.15 (`persist`), Vitest 5 (unit, jsdom, `vitest bench`), Playwright 1.64 on SwiftShader, Bun 1.4, TypeScript compiler API (already a dev dependency) for a disposal lint test.

## Global Constraints

- Aesthetic is fixed (owner, round 5): never remove or dim the rover, the neon look, bloom, holograms, missions or the intro. Allowed: invisible quality tricks only.
- Every task that can change pixels runs the visual gate (Task 1) on desktop full 1440x900, desktop full 2560x1440 and phone lite 390x844 at the same camera poses: a pixel "differs" when any RGB channel moves by more than 8/255; a capture passes when its differing share is at most the baseline build's own run-to-run noise plus 1% (pattern captures: at most 1% absolute). Each such task carries a rollback note.
- Keep the rover state architecture: per-frame state lives in runtime objects mutated in `useFrame` and never read in render; the store is a mirror.
- Keep floor mount/unmount (`nearFloors`); fix the leaks, no keep-alive (coordinator default).
- Pause rendering only while an opaque panel hides more than 90% of the canvas (full-screen phone palette, full-screen phone modals, the drawer sheet at its 92% snap, the lightbox). The desktop side drawer and the 55% sheet keep the world animated (main spec 2.6).
- Cap rendering at 60 fps on 90/120/144 Hz displays. No idle 30 fps cap (coordinator default: motion stays smooth).
- WebGL context loss or crash: one automatic remount (after the tab is visible again), then the static page with a "Retry 3D" button; a retry never loops.
- Budgets stay green: Lighthouse CI LCP 2000 ms, CLS 0.01, TBT 200 ms, JS 240 KB, CSS 20 KB, fonts 60 KB, HTML 80 KB; render budgets < 150 draw calls and < 30k triangles per floor, L1 cap 140 (`e2e/highlights.spec.ts`), RF cap 80 (`e2e/roof.spec.ts`).
- No new runtime or dev dependencies (the PNG decoder, the pacer and the lint test are written here; `typescript`, `jsdom` and `@testing-library/react` already exist).
- No em dashes (U+2014) anywhere: code, comments, docs, commits, PR text. UI strings are `{ en, id }` in `messages/en.json` and `messages/id.json` with identical keys.
- Pure modules stay free of React and three side effects (AGENTS.md "Pure modules").
- React Compiler lint (`eslint-plugin-react-hooks` 7.1 recommended): no synchronous `setState` in an effect body, no ref writes during render, `useMemo` callbacks inline with literal deps.
- e2e tests wait on state, never on time; `page.waitForTimeout` only to prove that nothing happens; `?tier=lite` unless the test is about the full tier.
- Local e2e port for this workstream: 4432 (`E2E_PORT=4432`). Never run two e2e suites at once on one machine; Playwright workers stay at 2.
- Measure before and after with the same method (Task 10 table) and put the numbers in the PR body.
- Update README, AGENTS.md and the spec appendices touched by each task in that task.
- Package manager Bun; conventional commits (`feat:`, `fix:`, `perf:`, `test:`, `docs:`, `ci:`, `chore:`); prefer the `rtk` git wrapper.

---

## Evidence this plan implements

Report ids from `files/perf-report/REPORT.md` and the area reports:

| Item | Evidence | Task |
|---|---|---|
| ~11 geometries leak per L1 to RF round trip; `useMemo` geometries passed as props are never disposed (R3F disposes only JSX children) | C F7.1 (`CareerRooms.tsx:61-62,104-141`, `WorkshopAnnex.tsx:24,76-82`, `YearGates.tsx:60-71`, `ProfileHologram.tsx:35-36`, `tower/primitives.tsx:105-121` `FloorLine`, `Sky.tsx:41-42`) | 2 |
| Deterministic memory test (`renderer.info` geometries, textures, programs; no material count) | SP8, C F7.2, F7.7, spec gap 9 | 2 |
| `frameloop` always on, also under the full-screen phone palette, modals and the 92% sheet | D 8.3, C F5.8, SP7, spec gap 20 | 4 |
| 90/120 Hz displays render 2x frames | D 8.4, SP7 | 3 |
| `findPath` floods the whole grid per call; `nearestCell` full scan; generator tuples; `unshift` | D 6.3, SP11 | 5 |
| Palette fuzzy search re-normalizes every string per keystroke | D 6.8, SP11 | 6 |
| Idle 10 Hz `setRover`, per-frame `setRide`/`setBeam`, `persist` writes on every set | D 6.2, spec gap 5, G1, G2 | 7 |
| `backdrop-filter` under 94% opaque panels, terminal blur on phones, scrim blur hidden behind full-screen phone panels | D 9.1-9.3, SP7 blur A/B | 8 |
| Context loss is a dead end; creation crash uncaught | C F7.5, D 8.7, main 4.6, spec gap 22, open question 10 | 9 |

---

## Cross-workstream conflicts and rebase notes

| File | Other workstreams | Their change | Rebase note |
|---|---|---|---|
| `src/experience/scene/Director.tsx` | P6 (ride clock per-frame cap, hold `moving` until the destination is ready), P7 (input), P4 (scene vs post-pass draw-call split at lines 204-210) | P6 changes the `dt` fed to `advanceRide` and adds a readiness gate; P4 splits `frameCalls` | P3 only touches the beam block (lines 245-254) and the ride write (lines 269-306): the ride and beam progress go to `tower/rideClock.ts`, the store is written on stage changes. Merge: keep P6's capped `dt` and readiness gate around `advanceRide(...)`, keep P3's `keepRide`/`clearRide` write split after it. P6's throttled e2e must sample live progress with `__hq.motion().ride` (or the car mesh), not `store.ride.t` (now the stage start, 0). |
| `src/experience/Experience.tsx` | P2 (Canvas `dpr`/`gl`, composer), P4 (`__hq` probes, `?perf=1` overlay), P6 (precompile in `onCreated`), P1 (boot) | Canvas props, `onCreated`, `__hq` | P3 adds `frameloop="never"`, `<FrameLoop />`, `<CanvasBoundary>`, `trackRenderer(gl)`, an `onCrash` prop, and `memory`/`frames`/`motion` on `__hq`. Merge by union; P6's precompile in `onCreated` stays before or after `trackRenderer(gl)`, order does not matter. P4's overlay should read `framePacer.frames` and `memoryCounts()` instead of adding its own counters. |
| Render loop (`scene/FrameLoop.tsx`, new) | P2 runtime monitor (SP5) | Samples frame times and steps DPR/MSAA/bloom | P2's monitor must (1) use `useFrame` deltas, which exclude paused time, or reset its sample window on `onPacerChange(false)`; (2) treat `FRAME_CAP_FPS` (60) as the ceiling, never the display refresh rate (drei `PerformanceMonitor` bounds must be `[50, 60]`-style, not refresh-derived, or a 120 Hz screen capped at 60 reads as "slow"). |
| `src/experience/ExperienceGate.tsx` | P1 (boot card "Page view" link, quiet boot), P6 (Page view icon is in `hud/Controls.tsx`, not here) | Boot release, prefetch | P3 adds recovery state, the remount key and the Retry 3D notice. Keep P1's boot logic untouched; both edit different blocks. |
| `src/store/useHQStore.ts` | P7 (camera/first-person state may be added), P6 | New fields/actions | P3 changes `setRover`, the `persist` storage and adds `recover(tier)`. Union merge. Any new per-frame field P7 adds must follow the new store-write rule (runtime object, store on change). |
| `src/experience/tower/ElevatorShaft.tsx`, `tower/elevator.ts` | P6 | Ride timing | P3 changes two read sites in `ElevatorShaft.tsx` to `rideNow(...)`; `elevator.ts` is untouched by P3. |
| `src/app/globals.css` | P1, P6 | Boot card / top bar styles | P3 edits only `.glass-solid`. |
| `messages/en.json`, `messages/id.json` | P5 (CV text), P6, P7 (hint text) | New keys | P3 adds `hud.retry3d`. Union merge. |
| `scripts/e2e-plan.ts`, `tests/unit/e2e-plan.test.ts` | P4, P6, P7 (new specs) | `ALL_SPECS`, rules | Union merge; keep `ALL_SPECS` sorted. |
| `playwright.config.ts`, `package.json`, `vitest.config.mts` | P4 | Scripts and CI gates | P3 adds `visual-gate` to the ignored opt-in specs, `bench` script and `benchmark.include`. |
| `scripts/shot-diff.ts`, `e2e/visual-gate.spec.ts` (new) | P2 (screenshot-diff gate) | Same need | Whichever of P2/P3 merges first owns them; the other rebases and reuses (add poses, never a second tool). |
| `e2e/memory.spec.ts` (new) | P4 ("programs/memory gates") | Memory gate | P3 owns the memory e2e and `__hq.memory()`; P4 wires it into CI summaries instead of writing a second test. |
| `README.md`, `AGENTS.md`, `docs/superpowers/specs/agent-hq/08-quality-acceptance.md`, `06-data-contracts.md`, main spec | P1, P2, P4 (spec 08 budgets, spec 06 section 4 RUM) | Docs | P3 edits spec 08 section 2 rows "Frame rate" and "Memory" only, and spec 06 section 2 only. Union merge. |

---

## File Structure

New files:

| File | Responsibility |
|---|---|
| `scripts/shot-diff.ts` | Dependency-free PNG decoder, per-pixel diff ratio, gate table CLI |
| `e2e/visual-gate.spec.ts` | Opt-in (VISUAL_GATE=dir) captures of fixed poses, live scene and pattern background |
| `src/experience/scene/memoryProbe.ts` | Holds the current renderer; `memoryCounts()` for `__hq.memory()` |
| `src/experience/fx/useDispose.ts` | `useDispose(resource)`: disposes a memoized three.js resource on replace/unmount |
| `e2e/memory.spec.ts` | SP8: 10 L1 to RF trips and 5 Page View toggles keep geometries, textures, programs flat |
| `src/experience/scene/framePacer.ts` | Pure 60 fps pacer, pause/resume, `framePacer` singleton, change listeners |
| `src/experience/scene/FrameLoop.tsx` | rAF loop calling R3F `advance`; mounts the cover watcher |
| `src/experience/scene/cover.ts` | Pure: share of the viewport hidden by the largest opaque panel |
| `src/experience/scene/coverWatch.ts` | DOM: observes `[data-hq-cover]` panels and reports covered/uncovered |
| `e2e/lifecycle.spec.ts` | Paced loop, pause under covers, store-write probes, crash recovery |
| `src/store/persist-storage.ts` | `skipUnchanged`: persist writes only when a persisted key changed |
| `src/experience/tower/rideClock.ts` | Live per-frame ride and beam progress, keyed by the store object |
| `src/experience/recovery.ts` | Pure recovery state machine and `whenVisible` |
| `src/experience/CanvasBoundary.tsx` | Error boundary around the R3F canvas |
| `tests/helpers/real-layouts.ts` | Real floor layouts for tests and benches, `farthestWalkable` |
| `tests/helpers/navgrid-legacy.ts`, `tests/helpers/search-legacy.ts` | Frozen copies of the pre-change implementations (oracles for equivalence tests and benches) |
| `tests/bench/navgrid.bench.ts`, `tests/bench/search.bench.ts` | `vitest bench` on real layouts and the real HUD index |
| `tests/unit/shot-diff.test.ts`, `use-dispose.test.tsx`, `three-disposal.test.ts`, `frame-pacer.test.ts`, `cover.test.ts`, `navgrid-bounded.test.ts`, `search-equivalence.test.ts`, `persist-storage.test.ts`, `ride-clock.test.ts`, `recovery.test.ts`; `tests/hud/CanvasBoundary.test.tsx` | Unit tests |

Modified files: `src/experience/Experience.tsx`, `src/experience/ExperienceGate.tsx`, `src/experience/scene/Director.tsx`, `src/experience/tower/ElevatorShaft.tsx`, `src/experience/fx/TeleportBeam.tsx`, `src/experience/nav/navgrid.ts`, `src/hud/search.ts`, `src/store/useHQStore.ts`, the nine disposal sites (`floors/career/CareerRooms.tsx`, `floors/career/WorkshopAnnex.tsx`, `floors/career/YearGates.tsx`, `floors/lobby/ProfileHologram.tsx`, `tower/primitives.tsx`, `floors/roof/Sky.tsx`, `rover/Rover.tsx`, `fx/Motes.tsx`, `tower/FloorLevel.tsx`), the cover panels (`src/hud/CommandPalette.tsx`, `src/components/Modal.tsx`, `src/hud/drawer/RoomDrawer.tsx`, `src/components/Lightbox.tsx`), `src/hud/RoverTerminal.tsx`, `src/app/globals.css`, `messages/en.json`, `messages/id.json`, `e2e/experience.spec.ts`, `scripts/e2e-plan.ts`, `tests/unit/e2e-plan.test.ts`, `tests/unit/store.test.ts`, `playwright.config.ts`, `vitest.config.mts`, `package.json`, `.gitignore`, `README.md`, `AGENTS.md`, `docs/superpowers/specs/2026-10-09-agent-hq-design.md`, `docs/superpowers/specs/agent-hq/02-interaction-and-states.md`, `05-visual-audio-tokens.md`, `06-data-contracts.md`, `08-quality-acceptance.md`.

Setup before Task 1 (once):

```bash
cd <repo root of ShinyQ/ShinyQ-HQ>
rtk git fetch origin main
rtk git worktree add ../hq-r5-p3 -b r5-p3-cpu-lifecycle-memory origin/main
cd ../hq-r5-p3 && bun install --frozen-lockfile
# Baseline build of the same commit for before/after numbers and the visual gate.
rtk git worktree add ../hq-r5-p3-base origin/main
cd ../hq-r5-p3-base && bun install --frozen-lockfile && bun run build
```

Expected: both worktrees at the same commit (`git -C ../hq-r5-p3 rev-parse HEAD` equals `git -C ../hq-r5-p3-base rev-parse HEAD`), `../hq-r5-p3-base/out/en.html` exists. All later commands run in `../hq-r5-p3` unless stated.

---
### Task 1: Visual gate (screenshot diff against main)

The gate every pixel-sensitive task uses. It captures fixed poses from any build served on `E2E_PORT` (it only reads `window.__hq.store`, which main already exposes), so main's build and the branch are captured with the same spec. The live scene animates (holograms, the rover blinking), so main is captured twice and its own run-to-run difference is the noise floor. "Pattern" captures hide the canvas behind a fixed high-contrast stripe pattern, so panel blur changes are measured strictly.

**Files:**
- Create: `scripts/shot-diff.ts`
- Create: `e2e/visual-gate.spec.ts`
- Create: `tests/unit/shot-diff.test.ts`
- Modify: `playwright.config.ts:9-10,20` (ignore the opt-in spec like the screenshot specs)
- Modify: `scripts/e2e-plan.ts` (rules for the new spec and script)
- Modify: `tests/unit/e2e-plan.test.ts:77-78`
- Modify: `.gitignore`
- Modify: `AGENTS.md` ("Fast verification")

**Interfaces:**
- Consumes: `asReturningVisitor`, `waitForHQ`, `waitForSceneLive`, `waitForCameraSettle`, `waitForFrames` from `e2e/hq.ts`; `heroPod` from `e2e/routes.ts`.
- Produces: `decodePng(file: Uint8Array): Rgba`, `diffRatio(a: Rgba, b: Rgba, tolerance?: number): number`, `gate(base, base2, head, max?, tolerance?): GateRow[]` in `scripts/shot-diff.ts`; CLI `bun scripts/shot-diff.ts --base <dir> --base2 <dir> --head <dir> [--max 0.01] [--tolerance 8]` (exit 1 on any FAIL); capture names `desktop-*`, `wide-*`, `phone-*`, `pattern-*` written by `VISUAL_GATE=<dir> bunx playwright test e2e/visual-gate.spec.ts`.

- [x] **Step 1: Write the failing unit test**

Create `tests/unit/shot-diff.test.ts`:

```ts
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { decodePng, diffRatio, gate, type Rgba } from "../../scripts/shot-diff";

const paeth = (a: number, b: number, c: number) => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

function chunk(type: string, body: Uint8Array): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, "ascii");
  // The decoder does not check CRCs, so a zero CRC keeps this test encoder short.
  return Buffer.concat([head, Buffer.from(body), Buffer.alloc(4)]);
}

/** Minimal PNG encoder for the test: one filter type for every row, 8-bit RGB or RGBA. */
function encodePng(width: number, height: number, rgba: Uint8Array, filter: number, channels: 3 | 4): Buffer {
  const px = new Uint8Array(width * height * channels);
  for (let i = 0; i < width * height; i++) for (let c = 0; c < channels; c++) px[i * channels + c] = rgba[i * 4 + c];
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = filter;
    for (let x = 0; x < stride; x++) {
      const v = px[y * stride + x];
      const a = x >= channels ? px[y * stride + x - channels] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? px[(y - 1) * stride + x - channels] : 0;
      const pred = [0, a, b, (a + b) >> 1, paeth(a, b, c)][filter];
      raw[y * (stride + 1) + 1 + x] = (v - pred) & 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = channels === 4 ? 6 : 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", new Uint8Array(0))]);
}

function image(width: number, height: number, seed: number): Rgba {
  const data = new Uint8Array(width * height * 4);
  let s = seed;
  for (let i = 0; i < data.length; i++) data[i] = (s = (s * 16807) % 2147483647) & 255;
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  return { width, height, data };
}

describe("decodePng", () => {
  it.each([0, 1, 2, 3, 4])("decodes filter %i in RGBA and RGB", (filter) => {
    const src = image(7, 5, 11 + filter);
    expect(decodePng(encodePng(7, 5, src.data, filter, 4))).toEqual(src);
    expect(decodePng(encodePng(7, 5, src.data, filter, 3))).toEqual(src);
  });

  it("rejects files that are not 8-bit non-interlaced RGB or RGBA PNGs", () => {
    expect(() => decodePng(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toThrow("not a PNG");
  });
});

describe("diffRatio", () => {
  it("counts pixels whose largest channel change exceeds the tolerance", () => {
    const a = image(2, 2, 3);
    const b: Rgba = { ...a, data: a.data.slice() };
    expect(diffRatio(a, b)).toBe(0);
    b.data[0] = (a.data[0] + 8) % 256 === a.data[0] + 8 ? a.data[0] + 8 : a.data[0] - 8;
    expect(diffRatio(a, b)).toBe(0);
    b.data[4] = a.data[4] > 127 ? a.data[4] - 9 : a.data[4] + 9;
    expect(diffRatio(a, b)).toBe(0.25);
    expect(diffRatio(a, image(3, 2, 3))).toBe(1);
  });
});

describe("gate", () => {
  it("allows the baseline's own noise plus the margin and fails missing captures", () => {
    const a = image(10, 10, 5);
    const noisy: Rgba = { ...a, data: a.data.slice() };
    for (let i = 0; i < 5; i++) noisy.data[i * 4] ^= 0x80;
    const rows = gate(new Map([["one", a], ["two", a]]), new Map([["one", noisy]]), new Map([["one", noisy]]), 0.01);
    expect(rows).toEqual([
      { name: "one", noise: 0.05, diff: 0.05, limit: 0.060000000000000005, pass: true },
      { name: "two", noise: 0, diff: 1, limit: 0.01, pass: false },
    ]);
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `bun run test tests/unit/shot-diff.test.ts`
Expected: FAIL, `Failed to resolve import "../../scripts/shot-diff"`.

- [x] **Step 3: Write `scripts/shot-diff.ts`**

```ts
/**
 * Screenshot diff for the round 5 visual gate, without dependencies: decodes the 8-bit RGB or RGBA
 * PNGs Chromium writes and reports the share of pixels whose largest channel difference exceeds a
 * tolerance. A capture passes when diff(base, head) <= diff(base, base2) + max: base2 is a second
 * capture of the baseline build, so animation noise in the live scene never counts against a change.
 * Usage: bun scripts/shot-diff.ts --base <dir> --base2 <dir> --head <dir> [--max 0.01] [--tolerance 8]
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { inflateSync } from "node:zlib";

export interface Rgba {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel, rows top to bottom. */
  data: Uint8Array;
}

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

export function decodePng(file: Uint8Array): Rgba {
  if (file.length < 8 || SIGNATURE.some((byte, i) => file[i] !== byte)) throw new Error("not a PNG");
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  let width = 0;
  let height = 0;
  let depth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat: Buffer[] = [];
  for (let pos = 8; pos + 8 <= file.length; ) {
    const length = view.getUint32(pos);
    const type = String.fromCharCode(file[pos + 4], file[pos + 5], file[pos + 6], file[pos + 7]);
    if (type === "IHDR") {
      width = view.getUint32(pos + 8);
      height = view.getUint32(pos + 12);
      depth = file[pos + 16];
      colorType = file[pos + 17];
      interlace = file[pos + 20];
    } else if (type === "IDAT") idat.push(Buffer.from(file.buffer, file.byteOffset + pos + 8, length));
    else if (type === "IEND") break;
    pos += 12 + length;
  }
  if (depth !== 8 || interlace !== 0 || (colorType !== 6 && colorType !== 2)) {
    throw new Error(`unsupported PNG (depth ${depth}, color type ${colorType}, interlace ${interlace})`);
  }
  const channels = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const data = new Uint8Array(width * height * 4);
  let prev = new Uint8Array(stride);
  let cur = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const row = y * (stride + 1);
    const filter = raw[row];
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let v = raw[row + 1 + x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = v & 255;
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      data[o] = cur[x * channels];
      data[o + 1] = cur[x * channels + 1];
      data[o + 2] = cur[x * channels + 2];
      data[o + 3] = channels === 4 ? cur[x * channels + 3] : 255;
    }
    [prev, cur] = [cur, prev];
  }
  return { width, height, data };
}

/** Share of pixels (0 to 1) whose largest RGB channel difference exceeds `tolerance`; 1 when the sizes differ. */
export function diffRatio(a: Rgba, b: Rgba, tolerance = 8): number {
  if (a.width !== b.width || a.height !== b.height) return 1;
  let differ = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const d = Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2]));
    if (d > tolerance) differ += 1;
  }
  return differ / (a.width * a.height);
}

export interface GateRow {
  name: string;
  noise: number;
  diff: number;
  limit: number;
  pass: boolean;
}

export function gate(base: Map<string, Rgba>, base2: Map<string, Rgba>, head: Map<string, Rgba>, max = 0.01, tolerance = 8): GateRow[] {
  return [...base.keys()].sort().map((name) => {
    const a = base.get(name)!;
    const again = base2.get(name);
    const b = head.get(name);
    const noise = again ? diffRatio(a, again, tolerance) : 0;
    const diff = b ? diffRatio(a, b, tolerance) : 1;
    const limit = noise + max;
    return { name, noise, diff, limit, pass: diff <= limit };
  });
}

function loadDir(dir: string): Map<string, Rgba> {
  const out = new Map<string, Rgba>();
  if (!existsSync(dir)) return out;
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".png"))) out.set(file.replace(/\.png$/, ""), decodePng(readFileSync(path.join(dir, file))));
  return out;
}

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

if (import.meta.main) {
  const base = arg("base");
  const head = arg("head");
  if (!base || !head) {
    console.error("usage: bun scripts/shot-diff.ts --base <dir> --base2 <dir> --head <dir> [--max 0.01] [--tolerance 8]");
    process.exit(2);
  }
  const base2 = arg("base2");
  const rows = gate(loadDir(base), base2 ? loadDir(base2) : new Map(), loadDir(head), Number(arg("max", "0.01")), Number(arg("tolerance", "8")));
  const pct = (x: number) => `${(x * 100).toFixed(2)}%`;
  console.log("| capture | noise | diff | limit | result |\n|---|---|---|---|---|");
  for (const r of rows) console.log(`| ${r.name} | ${pct(r.noise)} | ${pct(r.diff)} | ${pct(r.limit)} | ${r.pass ? "pass" : "FAIL"} |`);
  if (rows.length === 0 || rows.some((r) => !r.pass)) process.exit(1);
}
```

- [x] **Step 4: Run the unit test to verify it passes**

Run: `bun run test tests/unit/shot-diff.test.ts`
Expected: PASS (8 tests). If the `gate` row's `limit` float differs in the last digit on your Node, compare with `toBeCloseTo` for `limit` only; the other fields stay exact.

- [x] **Step 5: Write the opt-in capture spec**

Create `e2e/visual-gate.spec.ts`:

```ts
import { mkdirSync } from "node:fs";
import path from "node:path";
import { test, type Browser, type Page } from "@playwright/test";
import { asReturningVisitor, waitForCameraSettle, waitForFrames, waitForHQ, waitForSceneLive } from "./hq";
import { heroPod } from "./routes";

/**
 * Round 5 visual gate (opt-in: VISUAL_GATE=<dir>). Captures fixed poses of the build served on
 * E2E_PORT into <dir>; `bun scripts/shot-diff.ts` compares a baseline build (captured twice for the
 * animation noise) with the branch. It reads only `window.__hq.store`, so it runs against main too.
 */
const OUT = process.env.VISUAL_GATE ?? "";
test.skip(!OUT, "Set VISUAL_GATE=<dir> to capture the visual gate");
test.describe.configure({ timeout: 180_000 });

type Overlay = "drawer" | "palette" | "terminal" | "cv" | "lightbox";
interface Pose {
  name: string;
  path: string;
  width: number;
  height: number;
  tier: "full" | "lite";
  phone: boolean;
  overlay?: Overlay;
  /** Hide the canvas behind a fixed stripe pattern: panel blur changes show up undiluted by animation. */
  pattern?: boolean;
}

/** A pod with a gallery (the lightbox pose), as in e2e/gallery.spec.ts. */
const GALLERY_POD = "voice-ai-contact-center";
const DESKTOP = { width: 1440, height: 900, tier: "full", phone: false } as const;
const WIDE = { width: 2560, height: 1440, tier: "full", phone: false } as const;
const PHONE = { width: 390, height: 844, tier: "lite", phone: true } as const;
const POD = `/en/labs/${heroPod.slug}`;

const POSES: Pose[] = [
  { name: "desktop-l1", path: "/en", ...DESKTOP },
  { name: "desktop-l2", path: "/en/journey", ...DESKTOP },
  { name: "desktop-l3", path: "/en/labs", ...DESKTOP },
  { name: "desktop-l4", path: "/en/library", ...DESKTOP },
  { name: "desktop-rf", path: "/en/contact", ...DESKTOP },
  { name: "desktop-drawer", path: POD, ...DESKTOP, overlay: "drawer" },
  { name: "desktop-palette", path: "/en", ...DESKTOP, overlay: "palette" },
  { name: "wide-l1", path: "/en", ...WIDE },
  { name: "wide-l3", path: "/en/labs", ...WIDE },
  { name: "wide-drawer", path: POD, ...WIDE, overlay: "drawer" },
  { name: "phone-l1", path: "/en", ...PHONE },
  { name: "phone-l2", path: "/en/journey", ...PHONE },
  { name: "phone-l3", path: "/en/labs", ...PHONE },
  { name: "phone-drawer", path: POD, ...PHONE, overlay: "drawer" },
  { name: "phone-terminal", path: "/en", ...PHONE, overlay: "terminal" },
  { name: "pattern-desktop-drawer", path: POD, ...DESKTOP, overlay: "drawer", pattern: true },
  { name: "pattern-desktop-palette", path: "/en", ...DESKTOP, overlay: "palette", pattern: true },
  { name: "pattern-desktop-terminal", path: "/en", ...DESKTOP, overlay: "terminal", pattern: true },
  { name: "pattern-desktop-lightbox", path: `/en/labs/${GALLERY_POD}`, ...DESKTOP, overlay: "lightbox", pattern: true },
  { name: "pattern-wide-drawer", path: POD, ...WIDE, overlay: "drawer", pattern: true },
  { name: "pattern-phone-drawer", path: POD, ...PHONE, overlay: "drawer", pattern: true },
  { name: "pattern-phone-terminal", path: "/en", ...PHONE, overlay: "terminal", pattern: true },
  { name: "pattern-phone-palette", path: "/en", ...PHONE, overlay: "palette", pattern: true },
  { name: "pattern-phone-cv", path: "/en", ...PHONE, overlay: "cv", pattern: true },
];

const PATTERN = `
  [data-testid="hq-world"] canvas { visibility: hidden !important; }
  [data-testid="hq-world"] { background: repeating-linear-gradient(45deg, #22d3ee 0 6px, #a78bfa 6px 10px, #0a0a12 10px 22px) !important; }
`;

async function openOverlay(page: Page, overlay: Overlay | undefined) {
  if (!overlay) return;
  if (overlay === "drawer" || overlay === "lightbox") {
    await page.getByTestId("room-drawer").waitFor({ timeout: 90_000 });
    if (overlay === "lightbox") {
      await page.getByTestId("room-drawer").getByTestId("gallery").getByRole("button").first().click();
      await page.getByTestId("lightbox").waitFor();
    }
    return;
  }
  await page.evaluate((type) => window.dispatchEvent(new CustomEvent("hq:hud", { detail: { type } })), overlay);
  await page.getByRole("dialog").last().waitFor();
}

async function capture(browser: Browser, pose: Pose) {
  const context = await browser.newContext({
    viewport: { width: pose.width, height: pose.height },
    deviceScaleFactor: 1,
    isMobile: pose.phone,
    hasTouch: pose.phone,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await asReturningVisitor(page);
  await page.goto(`${pose.path}?tier=${pose.tier}`);
  await waitForHQ(page);
  await waitForSceneLive(page);
  await openOverlay(page, pose.overlay);
  await waitForCameraSettle(page);
  if (pose.pattern) await page.addStyleTag({ content: PATTERN });
  await page.evaluate(() => document.fonts.ready);
  await waitForFrames(page, 10);
  await page.screenshot({ path: path.join(OUT, `${pose.name}.png`), animations: "disabled", caret: "hide" });
  await context.close();
}

for (const pose of POSES) {
  test(pose.name, async ({ browser }) => {
    mkdirSync(OUT, { recursive: true });
    await capture(browser, pose);
  });
}
```

- [x] **Step 6: Keep the gate out of the default suite and the change plan**

In `playwright.config.ts` replace lines 9-10 and 20:

```ts
/** Opt-in specs: screenshots run only with SCREENSHOTS=1, the round 5 visual gate only with VISUAL_GATE=<dir>. */
const SCREENSHOT_SPECS = ["**/screenshots.spec.ts", "**/pageview-visual.spec.ts", "**/visual-gate.spec.ts"];
```

```ts
  testIgnore: SCREENSHOTS || process.env.VISUAL_GATE ? [] : SCREENSHOT_SPECS,
```

In `scripts/e2e-plan.ts` change the two `RULES` entries:

```ts
  { test: /^e2e\/screenshots\.spec\.ts$|^e2e\/pageview-visual\.spec\.ts$|^e2e\/visual-gate\.spec\.ts$/, specs: [] },
  // Not part of the site or the e2e suite.
  { test: /^(docs|tests|\.github)\/|\.md$|^scripts\/(e2e-|validate-|floor-thumbs|shot-diff)|^lighthouserc\.json$|^eslint\.config\.mjs$|^vitest\.config\.mts$/, specs: [] },
```

In `tests/unit/e2e-plan.test.ts` replace line 78:

```ts
      .filter((f) => f.endsWith(".spec.ts") && !["screenshots.spec.ts", "pageview-visual.spec.ts", "visual-gate.spec.ts"].includes(f))
```

Append to `.gitignore`:

```
# Round 5 visual gate captures (bun scripts/shot-diff.ts)
/.visual/
```

- [x] **Step 7: Capture the baseline from main twice**

Run (two terminals or async shells; the server keeps running):

```bash
bun scripts/serve-static.ts --port 4432 --dir ../hq-r5-p3-base/out
```

```bash
VISUAL_GATE=.visual/base-a E2E_PORT=4432 bunx playwright test e2e/visual-gate.spec.ts --workers=1
VISUAL_GATE=.visual/base-b E2E_PORT=4432 bunx playwright test e2e/visual-gate.spec.ts --workers=1
bun scripts/shot-diff.ts --base .visual/base-a --base2 .visual/base-b --head .visual/base-b
```

Expected: 24 passed per capture run (Playwright reuses the server on 4432 because `reuseExistingServer` is on locally); the diff prints 24 rows, all `pass`, and the `noise` column is the animation floor (expect `pattern-*` near 0.00%, live poses a few percent at most). Then stop the base server (`stop_bash`/Ctrl+C). Keep `.visual/base-a` and `.visual/base-b` for every later gate run.

- [x] **Step 8: Document the gate**

In `AGENTS.md` "Fast verification", add after the "Screenshots" bullet:

```markdown
- Visual gate (round 5, opt-in): for any change that may move pixels of the 3D view or the HUD over it. Build the base commit in a second worktree and serve it (`bun scripts/serve-static.ts --port 4432 --dir ../base/out`), capture it twice (`VISUAL_GATE=.visual/base-a E2E_PORT=4432 bunx playwright test e2e/visual-gate.spec.ts --workers=1`, then `.visual/base-b`), stop it, build the branch and capture `.visual/head` the same way, then `bun scripts/shot-diff.ts --base .visual/base-a --base2 .visual/base-b --head .visual/head`. A capture passes when at most 1% more pixels differ (any RGB channel by more than 8/255) than between the two base runs; `pattern-*` captures hide the canvas behind a fixed stripe pattern so panel changes are measured strictly. Poses: desktop full 1440x900 and 2560x1440, phone lite 390x844, reduced motion. Paste the table into the PR.
```

- [x] **Step 9: Run the plan tests and lint**

Run: `bun run test tests/unit/e2e-plan.test.ts tests/unit/shot-diff.test.ts && bun run lint`
Expected: PASS, no lint errors.

- [x] **Step 10: Commit**

```bash
rtk git add scripts/shot-diff.ts e2e/visual-gate.spec.ts tests/unit/shot-diff.test.ts playwright.config.ts scripts/e2e-plan.ts tests/unit/e2e-plan.test.ts .gitignore AGENTS.md
rtk git commit -m "test: visual gate that diffs fixed 3D poses against the base build"
```

---

### Task 2: Dispose memoized geometries and gate memory round trips (F7.1, SP8)

R3F disposes only what it creates from JSX. A geometry built in `useMemo` and passed as `geometry={g}` or in `args` stays in `renderer.info.memory` (and in three's `WebGLGeometries`) after its floor unmounts, so every L1 to RF round trip leaks about 11 geometries (L1 3, L2 6, RF 2). This task writes the memory e2e first (it fails on main), adds `useDispose`, a TypeScript-AST lint test that finds every undisposed memoized geometry or texture, and fixes the six F7.1 files plus three canvas-lifetime sites the lint also finds (`Rover.tsx`, `Motes.tsx`, `FloorLevel.tsx`; they never leak across trips but leak on every Page View toggle or crash remount).

No pixels change (disposal runs only on unmount), so no visual gate.

**Files:**
- Create: `src/experience/scene/memoryProbe.ts`
- Create: `src/experience/fx/useDispose.ts`
- Create: `e2e/memory.spec.ts`
- Create: `tests/unit/use-dispose.test.tsx`
- Create: `tests/unit/three-disposal.test.ts`
- Modify: `src/experience/Experience.tsx:107,344-356` (track the renderer, `__hq.memory`)
- Modify: `src/experience/floors/career/CareerRooms.tsx:61-62,141`
- Modify: `src/experience/floors/career/WorkshopAnnex.tsx:24,82`
- Modify: `src/experience/floors/career/YearGates.tsx:71`
- Modify: `src/experience/floors/lobby/ProfileHologram.tsx:35-36`
- Modify: `src/experience/tower/primitives.tsx:105-121` (`FloorLine`)
- Modify: `src/experience/floors/roof/Sky.tsx:41-42`
- Modify: `src/experience/rover/Rover.tsx:116-120`
- Modify: `src/experience/fx/Motes.tsx:10-23`
- Modify: `src/experience/tower/FloorLevel.tsx:35`
- Modify: `scripts/e2e-plan.ts` (`memory` spec and its rule)
- Modify: `AGENTS.md`, `README.md`, `docs/superpowers/specs/agent-hq/08-quality-acceptance.md`

**Interfaces:**
- Consumes: Task 1 nothing; `enterHQ`, `waitForFloor`, `waitForFrames`, `waitForHQ`, `waitForSceneLive` from `e2e/hq.ts`.
- Produces: `trackRenderer(gl: WebGLRenderer | null): void`, `memoryCounts(): MemoryCounts | null` with `MemoryCounts = { geometries: number; textures: number; programs: number }` (`scene/memoryProbe.ts`); `window.__hq.memory()`; `useDispose(resource: { dispose(): void } | null | undefined): void` (`fx/useDispose.ts`); spec name `memory` in `ALL_SPECS`.

- [x] **Step 1: Add the renderer probe**

Create `src/experience/scene/memoryProbe.ts`:

```ts
import type { WebGLRenderer } from "three";

/** `renderer.info` counts the memory e2e compares (three has no material count, so programs stand in). */
export interface MemoryCounts {
  geometries: number;
  textures: number;
  programs: number;
}

let renderer: WebGLRenderer | null = null;

/** The canvas registers its renderer on creation and clears it on unmount (Page view, crash remount). */
export function trackRenderer(gl: WebGLRenderer | null): void {
  renderer = gl;
}

/** Live GPU resource counts of the current canvas, or null while no canvas exists (test and overlay probe). */
export function memoryCounts(): MemoryCounts | null {
  if (!renderer) return null;
  const { memory, programs } = renderer.info;
  return { geometries: memory.geometries, textures: memory.textures, programs: programs?.length ?? 0 };
}
```

In `src/experience/Experience.tsx` add the import next to the other `./scene/*` imports:

```ts
import { memoryCounts, trackRenderer } from "./scene/memoryProbe";
```

Replace line 107:

```ts
  (window as unknown as { __hq?: unknown }).__hq = {
    store,
    rover: roverRuntime,
    camera: () => [...roverRuntime.cameraPosition],
    layouts,
    interact: interactRuntime,
    memory: memoryCounts,
  };
```

In `onCreated` (lines 344-347), register the renderer right after the exposure line:

```ts
          onCreated={({ gl }) => {
            gl.toneMapping = ACESFilmicToneMapping;
            gl.toneMappingExposure = sceneSettings(tier).exposure;
            trackRenderer(gl);
            const canvas = gl.domElement;
```

and add this effect after the "Cover the page" effect (after line 166):

```ts
  // The memory probe must not read a renderer that unmounted with this canvas.
  useEffect(() => () => trackRenderer(null), []);
```

- [x] **Step 2: Write the failing memory e2e**

Create `e2e/memory.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";
import { enterHQ, waitForFloor, waitForFrames, waitForHQ, waitForSceneLive } from "./hq";

/**
 * Appendix 08 memory budget (perf report SP8): floor round trips and Page View toggles must leave
 * the renderer's geometries, textures and shader programs at their baseline. Reduced motion makes
 * every ride a 150 ms cut; a warm-up tour first builds what exists once by design (programs, the
 * troika glyph atlas, the Highlights Hall).
 */
interface Counts {
  geometries: number;
  textures: number;
  programs: number;
}
type MemoryWindow = Window & {
  __hq: { store: { getState: () => { goToFloor: (floor: string) => void } }; memory: () => Counts | null };
};

const TRIPS = 10;
const TOGGLES = 5;
const HEAP_SLACK = 2 * 1024 * 1024;

test.describe.configure({ timeout: 420_000 });
test.use({ reducedMotion: "reduce" });

const read = (page: Page) => page.evaluate(() => (window as unknown as MemoryWindow).__hq.memory());

/** Counts once the floor settled: neighbours mount on idle and troika typesets asynchronously, so two equal reads in a row. */
async function settledCounts(page: Page): Promise<Counts> {
  let last = "";
  for (let i = 0; i < 40; i++) {
    await page.evaluate(() => new Promise<void>((resolve) => requestIdleCallback(() => resolve(), { timeout: 1000 })));
    await waitForFrames(page, 10);
    const now = await read(page);
    const key = JSON.stringify(now);
    if (now && key === last) return now;
    last = key;
  }
  throw new Error(`renderer memory never settled, last read ${last}`);
}

async function heapUsed(page: Page): Promise<number> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("HeapProfiler.collectGarbage");
  const { usedSize } = await cdp.send("Runtime.getHeapUsage");
  await cdp.detach();
  return usedSize;
}

async function ride(page: Page, floor: string) {
  await page.evaluate((f) => (window as unknown as MemoryWindow).__hq.store.getState().goToFloor(f), floor);
  await waitForFloor(page, floor, 90_000);
}

test("10 Lobby to Roof round trips leave renderer memory at its baseline", async ({ page }) => {
  await enterHQ(page);
  for (const floor of ["L2", "L3", "L4", "RF", "L1"]) await ride(page, floor);
  const base = await settledCounts(page);
  const heapBase = await heapUsed(page);
  const perTrip: string[] = [];
  for (let i = 0; i < TRIPS; i++) {
    await ride(page, "RF");
    await ride(page, "L1");
    perTrip.push(JSON.stringify(await settledCounts(page)));
  }
  const after = await settledCounts(page);
  const heapGrowth = (await heapUsed(page)) - heapBase;
  test.info().annotations.push({ type: "measure", description: `base ${JSON.stringify(base)}, after ${TRIPS} trips ${JSON.stringify(after)}, heap +${(heapGrowth / 1024).toFixed(0)} KB` });
  expect(after, `after each trip: ${perTrip.join(" ")}`).toEqual(base);
  expect(heapGrowth).toBeLessThan(HEAP_SLACK);
});

test("5 Page View and 3D toggles leave renderer memory and the JS heap flat", async ({ page }) => {
  await enterHQ(page);
  const toggle = async () => {
    await page.getByTestId("page-view").click();
    await page.getByTestId("back-to-3d").click();
    await waitForHQ(page);
    await waitForSceneLive(page);
  };
  await toggle();
  const base = await settledCounts(page);
  const heapBase = await heapUsed(page);
  for (let i = 1; i < TOGGLES; i++) await toggle();
  const after = await settledCounts(page);
  const heapGrowth = (await heapUsed(page)) - heapBase;
  test.info().annotations.push({ type: "measure", description: `base ${JSON.stringify(base)}, after ${TOGGLES} toggles ${JSON.stringify(after)}, heap +${(heapGrowth / 1024).toFixed(0)} KB` });
  expect(after).toEqual(base);
  expect(heapGrowth).toBeLessThan(HEAP_SLACK);
});
```

Register the spec in `scripts/e2e-plan.ts`: add `"memory",` to `ALL_SPECS` between `"library-roof"` and `"missions"`, and add this rule right before `{ test: /^src\/experience\/floors\/labs\//, ...}`:

```ts
  // Renderer memory: the probe, the disposal hook and floor mounting (round 5, SP8).
  { test: /^src\/experience\/(fx\/useDispose\.ts|scene\/memoryProbe\.ts|tower\/(Tower|near|FloorLevel)\.tsx?)$/, specs: ["experience", "memory"] },
```

- [x] **Step 3: Run it to verify it fails (and record the "before" numbers)**

Run: `bun run build && E2E_PORT=4432 bunx playwright test e2e/memory.spec.ts`
Expected: the round-trip test FAILS with `geometries` about 110 above the baseline (`+~11` per trip, the per-trip list grows by about 11 each entry); `textures` and `programs` equal. The toggle test is expected to PASS already (each toggle builds a fresh renderer); it guards the remount path. Copy the `measure` annotation lines (shown in the list reporter output) into your notes as the "before" row of the Task 10 table.

- [x] **Step 4: Write the failing hook test**

Create `tests/unit/use-dispose.test.tsx`:

```tsx
// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useDispose } from "@/experience/fx/useDispose";

const resource = () => ({ dispose: vi.fn() });

describe("useDispose", () => {
  it("disposes the old resource when it is replaced and the last one on unmount", () => {
    const a = resource();
    const b = resource();
    const { rerender, unmount } = renderHook(({ r }) => useDispose(r), { initialProps: { r: a } });
    expect(a.dispose).not.toHaveBeenCalled();
    rerender({ r: b });
    expect(a.dispose).toHaveBeenCalledTimes(1);
    expect(b.dispose).not.toHaveBeenCalled();
    unmount();
    expect(b.dispose).toHaveBeenCalledTimes(1);
  });

  it("accepts a missing resource", () => {
    const { unmount } = renderHook(() => useDispose(null));
    expect(() => unmount()).not.toThrow();
  });
});
```

Run: `bun run test tests/unit/use-dispose.test.tsx`
Expected: FAIL, `Failed to resolve import "@/experience/fx/useDispose"`.

- [x] **Step 5: Write the hook**

Create `src/experience/fx/useDispose.ts`:

```ts
"use client";

import { useEffect } from "react";

/**
 * Disposes a three.js resource built in `useMemo` when it is replaced or the component unmounts.
 * R3F disposes only what it creates from JSX (`<boxGeometry />`); a geometry, texture or material
 * passed as a prop (`geometry={g}`) or in `args` stays in `renderer.info.memory` until someone calls
 * `dispose()`, so every floor remount would leak it (perf report F7.1). Call it right after the memo.
 */
export function useDispose(resource: { dispose(): void } | null | undefined): void {
  useEffect(() => () => resource?.dispose(), [resource]);
}
```

Run: `bun run test tests/unit/use-dispose.test.tsx`
Expected: PASS (2 tests).

- [x] **Step 6: Write the disposal lint test**

Create `tests/unit/three-disposal.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/** Builders of GPU resources: `new XGeometry(...)`, `new XTexture(...)`, helpers named `...Geometry(...)`, `LineBatch.build()`. */
const PRODUCER = /(Geometry|Texture)$/;

function buildsGpuResource(node: ts.Node): boolean {
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (ts.isNewExpression(n) && ts.isIdentifier(n.expression) && PRODUCER.test(n.expression.text)) found = true;
    else if (ts.isCallExpression(n)) {
      const callee = n.expression;
      if (ts.isIdentifier(callee) && PRODUCER.test(callee.text)) found = true;
      else if (ts.isPropertyAccessExpression(callee) && callee.name.text === "build") found = true;
    }
    if (!found) ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

function enclosingFunction(node: ts.Node): ts.Node {
  let n: ts.Node | undefined = node.parent;
  while (n && !ts.isFunctionLike(n)) n = n.parent;
  return n ?? node.getSourceFile();
}

/** Names of `useMemo` results that build a geometry or texture and are never disposed in the same component. */
function undisposedMemos(source: string, file = "component.tsx"): string[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const missing: string[] = [];
  const visit = (n: ts.Node): void => {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.initializer &&
      ts.isCallExpression(n.initializer) &&
      ts.isIdentifier(n.initializer.expression) &&
      n.initializer.expression.text === "useMemo" &&
      n.initializer.arguments.length > 0 &&
      buildsGpuResource(n.initializer.arguments[0])
    ) {
      const name = n.name.text;
      const scope = enclosingFunction(n).getText(sf);
      if (!new RegExp(`\\b${name}\\??\\.dispose\\(|\\buseDispose\\(\\s*${name}\\s*\\)`).test(scope)) missing.push(name);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return missing;
}

function components(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    // The walkable floors prototype is dev-only and never in the export.
    if (statSync(full).isDirectory()) return name === "prototype" ? [] : components(full);
    return full.endsWith(".tsx") ? [full] : [];
  });
}

describe("three.js disposal lint", () => {
  it("flags a memoized geometry that is never disposed and accepts the disposed forms", () => {
    expect(undisposedMemos("function A() { const g = useMemo(() => new BoxGeometry(1, 1, 1), []); return g; }")).toEqual(["g"]);
    expect(undisposedMemos("function A() { const g = useMemo(() => hexGeometry(2), []); return g; }")).toEqual(["g"]);
    expect(undisposedMemos("function A() { const g = useMemo(() => { const b = new LineBatch(); return b.build(); }, []); return g; }")).toEqual(["g"]);
    expect(undisposedMemos("function A() { const t = useMemo(() => new CanvasTexture(c), [c]); return t; }")).toEqual(["t"]);
    expect(undisposedMemos("function A() { const g = useMemo(() => new BoxGeometry(), []); useDispose(g); return g; }")).toEqual([]);
    expect(undisposedMemos("function A() { const g = useMemo(() => new BoxGeometry(), []); useEffect(() => () => g.dispose(), [g]); }")).toEqual([]);
    expect(undisposedMemos("function A() { const g = useMemo(() => new BoxGeometry(), []); useEffect(() => () => g?.dispose(), [g]); }")).toEqual([]);
    expect(undisposedMemos("function A() { const c = useMemo(() => new Color(), []); return c; }")).toEqual([]);
    // Another component disposing a value of the same name does not count.
    expect(undisposedMemos("function A() { const g = useMemo(() => new BoxGeometry(), []); } function B() { const g = useMemo(() => new BoxGeometry(), []); useDispose(g); }")).toEqual(["g"]);
  });

  it("finds no undisposed memoized geometry or texture in src/experience", () => {
    const offenders = components("src/experience").flatMap((file) => undisposedMemos(readFileSync(file, "utf8"), file).map((name) => `${file}: ${name}`));
    expect(offenders).toEqual([]);
  });
});
```

Run: `bun run test tests/unit/three-disposal.test.ts`
Expected: the first test PASSES; the second FAILS listing these 14 offenders (paths with `/`):

```
src/experience/floors/career/CareerRooms.tsx: plane
src/experience/floors/career/CareerRooms.tsx: pedestal
src/experience/floors/career/CareerRooms.tsx: geometry
src/experience/floors/career/WorkshopAnnex.tsx: geometry
src/experience/floors/career/WorkshopAnnex.tsx: sight
src/experience/floors/career/YearGates.tsx: arches
src/experience/floors/lobby/ProfileHologram.tsx: outer
src/experience/floors/lobby/ProfileHologram.tsx: inner
src/experience/floors/roof/Sky.tsx: stars
src/experience/floors/roof/Sky.tsx: clouds
src/experience/fx/Motes.tsx: geometry
src/experience/rover/Rover.tsx: pennant
src/experience/tower/FloorLevel.tsx: edges
src/experience/tower/primitives.tsx: geometry
```

If the list holds an entry not named here, fix it the same way as Step 7 (add `useDispose(<name>)` right after its `useMemo`) and mention it in the PR.

- [x] **Step 7: Dispose every flagged resource**

Each edit adds one import and one `useDispose` call per resource, directly after the `useMemo` (before any early `return`).

`src/experience/floors/career/CareerRooms.tsx`: add `import { useDispose } from "../../fx/useDispose";` after line 10, then

```ts
  const plane = useMemo(() => new BoxGeometry(1, 0.04, 1), []);
  const pedestal = useMemo(() => new CylinderGeometry(0.95, 1.05, 0.55, 6), []);
  useDispose(plane);
  useDispose(pedestal);
```

and in `Frames`, after the `geometry` memo (`}, [rooms]);` at line 141):

```ts
  }, [rooms]);
  useDispose(geometry);
  return (
    <lineSegments geometry={geometry} raycast={() => null}>
```

`src/experience/floors/career/WorkshopAnnex.tsx`: add `import { useDispose } from "../../fx/useDispose";` after line 7, then in `Benches`

```ts
  const geometry = useMemo(() => new BoxGeometry(BENCH.w, BENCH_H, BENCH.d), []);
  useDispose(geometry);
```

and after the `sight` memo (`}, [d, windowX, labs.maxX, labs.maxZ]);`):

```ts
  }, [d, windowX, labs.maxX, labs.maxZ]);
  useDispose(sight);
```

`src/experience/floors/career/YearGates.tsx`: add `import { useDispose } from "../../fx/useDispose";` after line 10, then after the `arches` memo (`}, [years, H]);`):

```ts
  }, [years, H]);
  useDispose(arches);
```

`src/experience/floors/lobby/ProfileHologram.tsx`: add `import { useDispose } from "../../fx/useDispose";` after line 9, then

```ts
  const outer = useMemo(() => hexGeometry(HOLOGRAM.hexRadius), []);
  const inner = useMemo(() => hexGeometry(1.8), []);
  useDispose(outer);
  useDispose(inner);
```

`src/experience/tower/primitives.tsx`: add `import { useDispose } from "../fx/useDispose";` after line 7, then in `FloorLine` after its memo (`}, [points, closed]);`):

```ts
  }, [points, closed]);
  useDispose(geometry);
```

`src/experience/floors/roof/Sky.tsx`: add `import { useDispose } from "../../fx/useDispose";` after line 7, then

```ts
  const stars = useMemo(() => starGeometry(tier === "full" ? 900 : 500), [tier]);
  const clouds = useMemo(() => cloudGeometry(tier === "full" ? 260 : 120), [tier]);
  useDispose(stars);
  useDispose(clouds);
```

`src/experience/rover/Rover.tsx`: add `import { useDispose } from "../fx/useDispose";` after line 22, then after the `pennant` memo (`}, []);` at line 120):

```ts
  }, []);
  useDispose(pennant);
```

`src/experience/fx/Motes.tsx`: add `import { useDispose } from "./useDispose";` after the React import, then after the `geometry` memo (`}, [count, area, height]);`):

```ts
  }, [count, area, height]);
  useDispose(geometry);
```

`src/experience/tower/FloorLevel.tsx`: add `import { useDispose } from "../fx/useDispose";` after line 12, then

```ts
  const edges = useMemo(() => new EdgesGeometry(new BoxGeometry(w, SLAB_THICKNESS, d)), [w, d]);
  useDispose(edges);
```

- [x] **Step 8: Run the unit tests, the memory e2e and the floor specs**

Run: `bun run test tests/unit/three-disposal.test.ts tests/unit/use-dispose.test.tsx && bun run build && E2E_PORT=4432 bunx playwright test e2e/memory.spec.ts e2e/career.spec.ts e2e/roof.spec.ts e2e/highlights.spec.ts`
Expected: all PASS. The memory annotation shows `after` equal to `base` and heap growth under 2048 KB; record it as the "after" row. If `after` still differs, the per-trip list shows which counter grows: open the floor that mounts in that trip in a dev build, call `__hq.memory()` before and after `goToFloor`, and look for a `useMemo` resource the lint missed (for example a material with a texture map); dispose it with `useDispose` and add its pattern to `PRODUCER` with a unit case.

- [x] **Step 9: Document the rule**

In `AGENTS.md` "3D experience", add after the "Pure modules" bullet:

```markdown
- Disposal (round 5): a geometry, texture or material built in `useMemo` and passed as a prop or in `args` must be disposed: call `useDispose(value)` (`src/experience/fx/useDispose.ts`) right after the `useMemo`. R3F disposes only what it creates from JSX. `tests/unit/three-disposal.test.ts` fails on a memoized geometry or texture that is never disposed, and `e2e/memory.spec.ts` checks that 10 Lobby to Roof round trips and 5 Page View toggles keep `renderer.info` geometries, textures and programs at their baseline (`__hq.memory()`) with under 2 MB of JS heap growth.
```

In `AGENTS.md`, in the `window.__hq` bullet, change `exposes { store, rover, layouts, interact }` to `exposes { store, rover, layouts, interact, memory }` and append: "`memory()` returns the live `renderer.info` geometries, textures and program count (null without a canvas)."

In `docs/superpowers/specs/agent-hq/08-quality-acceptance.md` section 2 replace the Memory row:

```markdown
| Memory | No growth after 10 Lobby to Roof round trips and 5 Page View toggles | `e2e/memory.spec.ts`: `renderer.info` geometries, textures and `programs.length` equal their baseline (three has no material count), JS heap growth < 2 MB |
```

In `README.md` "Performance", append to the 3D paragraph: "Floor content is disposed when it unmounts: `e2e/memory.spec.ts` drives 10 Lobby to Roof round trips and 5 Page View toggles and expects the renderer's geometries, textures and shader programs back at their baseline."

- [x] **Step 10: Lint, typecheck and commit**

Run: `bun run typecheck && bun run lint && bun run test`
Expected: PASS.

```bash
rtk git add src/experience/scene/memoryProbe.ts src/experience/fx/useDispose.ts src/experience/Experience.tsx src/experience/floors/career/CareerRooms.tsx src/experience/floors/career/WorkshopAnnex.tsx src/experience/floors/career/YearGates.tsx src/experience/floors/lobby/ProfileHologram.tsx src/experience/tower/primitives.tsx src/experience/floors/roof/Sky.tsx src/experience/rover/Rover.tsx src/experience/fx/Motes.tsx src/experience/tower/FloorLevel.tsx e2e/memory.spec.ts tests/unit/use-dispose.test.tsx tests/unit/three-disposal.test.ts scripts/e2e-plan.ts AGENTS.md README.md docs/superpowers/specs/agent-hq/08-quality-acceptance.md
rtk git commit -m "fix: dispose memoized floor geometries and gate 10 round trips on renderer memory"
```

---
### Task 3: Paced frame loop with a 60 fps cap (D 8.4, SP7)

R3F's default loop renders on every `requestAnimationFrame`, so a 120 Hz phone or a 144 Hz monitor does 2x to 2.4x the GPU and CPU work of a 60 Hz one for no visible gain (all motion is `dt`-based). The canvas switches to `frameloop="never"`; `FrameLoop` runs its own rAF loop and calls R3F `advance(seconds)` only when the pure pacer says so. The pacer keeps a steady 60 fps cadence on 90/120/144/240 Hz, renders every refresh at 60 Hz, never caps idle motion (owner default), and hands R3F a clock that excludes paused time (Task 4), so nothing jumps on resume.

Pixel impact: none for a still frame (the same scene renders at the same poses); motion is sampled at 60 fps instead of the display rate on high-refresh screens. Gate: run the visual gate (Step 8). Rollback: revert this commit (the Canvas falls back to `frameloop` "always").

**Files:**
- Create: `src/experience/scene/framePacer.ts`
- Create: `src/experience/scene/FrameLoop.tsx`
- Create: `tests/unit/frame-pacer.test.ts`
- Create: `e2e/lifecycle.spec.ts`
- Modify: `src/experience/Experience.tsx` (Canvas `frameloop`, `<FrameLoop />`, `__hq.frames`)
- Modify: `scripts/e2e-plan.ts` (`lifecycle` spec and its rule)
- Modify: `AGENTS.md`, `README.md`, `docs/superpowers/specs/agent-hq/08-quality-acceptance.md`

**Interfaces:**
- Consumes: Task 2's `__hq` object shape (adds a key).
- Produces (`scene/framePacer.ts`): `FRAME_CAP_FPS = 60`, `FRAME_INTERVAL_MS`, `FRAME_SLACK_MS = 2`, `interface Pacer { last; next; elapsed; paused; frames }`, `createPacer(): Pacer`, `resetPacer(p: Pacer): void`, `pacerTick(p: Pacer, now: number): number | null` (seconds for R3F, or null to skip), `setPacerPaused(p: Pacer, paused: boolean, now: number): boolean`, singleton `framePacer`, `pauseFrames(paused: boolean, now?: number): void`, `onPacerChange(listener: (paused: boolean) => void): () => void`. `FrameLoop` component (no props). `window.__hq.frames(): number`. Spec name `lifecycle`.

- [x] **Step 1: Write the failing pacer test**

Create `tests/unit/frame-pacer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createPacer, FRAME_INTERVAL_MS, pacerTick, resetPacer, setPacerPaused, type Pacer } from "@/experience/scene/framePacer";

/** Feeds `seconds` of rAF timestamps at `hz` (optionally jittered) and returns the R3F clock values of rendered frames. */
function run(p: Pacer, hz: number, seconds: number, { start = 1000, jitter = 0 } = {}) {
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const times: number[] = [];
  for (let i = 0; i <= hz * seconds; i++) {
    const now = start + (i * 1000) / hz + (jitter ? (rand() - 0.5) * 2 * jitter : 0);
    const t = pacerTick(p, now);
    if (t !== null) times.push(t);
  }
  return times;
}

const gaps = (times: number[]) => times.slice(1).map((t, i) => t - times[i]);

describe("pacerTick", () => {
  it.each([60, 75, 90, 120, 144, 165, 240])("renders a %i Hz display at 60 fps without a visible hitch", (hz) => {
    const times = run(createPacer(), hz, 10);
    expect(times.length).toBeGreaterThanOrEqual(595);
    expect(times.length).toBeLessThanOrEqual(605);
    // 75 and 90 Hz alternate one and two refreshes to average 60 fps; no gap ever reaches two cap intervals.
    expect(Math.max(...gaps(times))).toBeLessThan((2 * FRAME_INTERVAL_MS) / 1000);
    expect(Math.min(...gaps(times))).toBeGreaterThanOrEqual(1 / hz - 1e-9);
  });

  it("renders every frame of a jittery 60 Hz display", () => {
    expect(run(createPacer(), 60, 10, { jitter: 1 }).length).toBe(601);
  });

  it("starts the clock at 0 and advances it by the time between rendered frames", () => {
    const p = createPacer();
    expect(pacerTick(p, 500)).toBe(0);
    expect(pacerTick(p, 508)).toBeNull();
    expect(pacerTick(p, 516.7)).toBeCloseTo(0.0167, 4);
  });

  it("does not catch up after a stall: the next frame comes one interval later", () => {
    const p = createPacer();
    pacerTick(p, 0);
    expect(pacerTick(p, 400)).toBeCloseTo(0.4, 6);
    expect(pacerTick(p, 408)).toBeNull();
    expect(pacerTick(p, 416.7)).not.toBeNull();
  });

  it("renders nothing while paused and resumes with a one-frame delta, not the paused time", () => {
    const p = createPacer();
    const before = run(p, 120, 1, { start: 0 });
    const last = before[before.length - 1];
    expect(setPacerPaused(p, true, 1000)).toBe(true);
    expect(run(p, 120, 5, { start: 1000 })).toEqual([]);
    expect(setPacerPaused(p, false, 6000)).toBe(true);
    const t = pacerTick(p, 6001)!;
    expect(t - last).toBeGreaterThan(0.016);
    expect(t - last).toBeLessThan(0.02);
    expect(setPacerPaused(p, false, 6002)).toBe(false);
  });

  it("counts rendered frames across canvases; a reset restarts only the clock", () => {
    const p = createPacer();
    run(p, 60, 1);
    const frames = p.frames;
    resetPacer(p);
    expect(pacerTick(p, 99_999)).toBe(0);
    expect(p.frames).toBe(frames + 1);
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `bun run test tests/unit/frame-pacer.test.ts`
Expected: FAIL, `Failed to resolve import "@/experience/scene/framePacer"`.

- [x] **Step 3: Write the pacer**

Create `src/experience/scene/framePacer.ts`:

```ts
/**
 * Frame pacing for the 3D canvas (perf report D 8.3, 8.4; round 5 P3). The canvas runs with
 * `frameloop="never"`; `FrameLoop` asks `pacerTick` on every animation frame whether to render: at
 * most FRAME_CAP_FPS (90, 120 and 144 Hz displays skip refreshes, 60 Hz displays render every one,
 * and there is no idle cap), and nothing while paused (a panel covers the canvas, coverWatch.ts).
 * The clock handed to R3F counts rendered time only, so a pause never shows up as one long frame.
 * Pure (no React, no three), so Vitest runs it in node.
 */
export const FRAME_CAP_FPS = 60;
export const FRAME_INTERVAL_MS = 1000 / FRAME_CAP_FPS;
/** rAF timestamps jitter by about a millisecond; a frame this early still counts as on time. */
export const FRAME_SLACK_MS = 2;

export interface Pacer {
  /** rAF timestamp (ms) of the last rendered frame, -1 before the first. */
  last: number;
  /** Earliest timestamp (ms) of the next rendered frame. */
  next: number;
  /** R3F clock (seconds): rendered time only. */
  elapsed: number;
  paused: boolean;
  /** Frames rendered since the page loaded (test and overlay probe; survives canvas remounts). */
  frames: number;
}

export function createPacer(): Pacer {
  return { last: -1, next: 0, elapsed: 0, paused: false, frames: 0 };
}

/** A new canvas starts its R3F clock at 0 (`setFrameloop("never")` resets it); the frame count keeps going. */
export function resetPacer(p: Pacer): void {
  p.last = -1;
  p.next = 0;
  p.elapsed = 0;
  p.paused = false;
}

/** Whether the rAF tick at `now` (ms) renders: the R3F clock time in seconds, or null to skip. */
export function pacerTick(p: Pacer, now: number): number | null {
  if (p.paused) return null;
  if (p.last < 0) {
    p.last = now;
    p.next = now + FRAME_INTERVAL_MS;
    p.frames += 1;
    return p.elapsed;
  }
  if (now < p.next - FRAME_SLACK_MS) return null;
  p.elapsed += (now - p.last) / 1000;
  p.last = now;
  // A steady cadence; after a stall (or a hidden tab) start a fresh one instead of catching up.
  p.next = now - p.next >= FRAME_INTERVAL_MS ? now + FRAME_INTERVAL_MS : p.next + FRAME_INTERVAL_MS;
  p.frames += 1;
  return p.elapsed;
}

/** Pauses or resumes; a resume renders on the next tick with a one-frame delta. True when the state changed. */
export function setPacerPaused(p: Pacer, paused: boolean, now: number): boolean {
  if (p.paused === paused) return false;
  p.paused = paused;
  if (!paused && p.last >= 0) {
    p.last = now - FRAME_INTERVAL_MS;
    p.next = now;
  }
  return true;
}

/** The pacer of the page's canvas (one 3D view at a time). */
export const framePacer = createPacer();

type PacerListener = (paused: boolean) => void;
const listeners = new Set<PacerListener>();

/** Pause and resume notifications, e.g. for a runtime quality monitor that must drop the sample window across a pause. */
export function onPacerChange(listener: PacerListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function pauseFrames(paused: boolean, now = performance.now()): void {
  if (setPacerPaused(framePacer, paused, now)) for (const listener of listeners) listener(paused);
}
```

- [x] **Step 4: Run the pacer test to verify it passes**

Run: `bun run test tests/unit/frame-pacer.test.ts`
Expected: PASS (12 tests).

- [x] **Step 5: Drive the canvas from the pacer**

Create `src/experience/scene/FrameLoop.tsx`:

```tsx
"use client";

import { advance, useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { framePacer, pacerTick, resetPacer } from "./framePacer";

/**
 * Drives the canvas (`frameloop="never"`): one R3F `advance` per paced frame, so `useFrame`
 * callbacks, the composer and the render run at most FRAME_CAP_FPS (framePacer.ts). Mount it once,
 * inside the Canvas.
 */
export function FrameLoop() {
  const get = useThree((s) => s.get);
  useEffect(() => {
    resetPacer(framePacer);
    let raf = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const t = pacerTick(framePacer, now);
      if (t !== null) advance(t, true, get());
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [get]);
  return null;
}
```

In `src/experience/Experience.tsx` add the imports:

```ts
import { FrameLoop } from "./scene/FrameLoop";
import { framePacer } from "./scene/framePacer";
```

Add `frames` to the `__hq` object from Task 2:

```ts
    memory: memoryCounts,
    frames: () => framePacer.frames,
```

On the `<Canvas>` add the prop after `dpr={budget.dpr}`:

```tsx
          frameloop="never"
```

and mount the loop next to `FirstFrame`:

```tsx
          <Scene data={data} tier={tier} labels={labels} held={held} onToggleLang={toggleLang} />
          <FirstFrame onFrame={onFirstFrame} />
          <FrameLoop />
```

- [x] **Step 6: Write the lifecycle spec with the first loop test**

Create `e2e/lifecycle.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";
import { enterHQ, waitForFrames } from "./hq";

/**
 * Round 5 P3 lifecycle: the paced frame loop, pauses under covering panels, store write rates and
 * crash recovery. Draw calls are counted on the 3D canvas's own WebGL context (not troika's glyph
 * canvas) by wrapping the draw functions, which works on any build, so before and after numbers
 * come from one method.
 */
type LifeWindow = Window & {
  __glDraws: number;
  __hq: { frames: () => number };
};

async function countDraws(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __glDraws: number };
    w.__glDraws = 0;
    const hq = new WeakSet<object>();
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: unknown[]) {
      const ctx = (getContext as (...a: unknown[]) => unknown).apply(this, args);
      if (ctx && this.closest("[data-testid=hq]")) hq.add(ctx as object);
      return ctx;
    } as typeof getContext;
    const proto = WebGL2RenderingContext.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
    for (const name of ["drawElements", "drawArrays", "drawElementsInstanced", "drawArraysInstanced", "drawRangeElements"]) {
      const original = proto[name];
      proto[name] = function (this: object, ...args: unknown[]) {
        if (hq.has(this)) w.__glDraws += 1;
        return original.apply(this, args);
      };
    }
  });
}

const draws = (page: Page) => page.evaluate(() => (window as unknown as LifeWindow).__glDraws);

/** Waits until the canvas draws again (rendering continues or resumed). */
async function expectDrawing(page: Page) {
  const before = await draws(page);
  await expect.poll(() => draws(page), { timeout: 15_000 }).toBeGreaterThan(before);
}

test.describe("paced frame loop", () => {
  test("the canvas renders through the paced loop", async ({ page }) => {
    await countDraws(page);
    await enterHQ(page);
    const frames = () => page.evaluate(() => (window as unknown as LifeWindow).__hq.frames());
    const before = await frames();
    await waitForFrames(page, 30);
    expect(await frames()).toBeGreaterThan(before + 5);
    await expectDrawing(page);
  });
});
```

Register the spec in `scripts/e2e-plan.ts`: add `"lifecycle",` to `ALL_SPECS` between `"library-roof"` and `"memory"`, and add this rule right after the memory rule from Task 2:

```ts
  // Frame loop, cover pauses, crash recovery and the ride/beam clock (round 5).
  { test: /^src\/experience\/(scene\/(FrameLoop|framePacer|cover|coverWatch)\.tsx?|CanvasBoundary\.tsx|recovery\.ts|tower\/rideClock\.ts)$/, specs: ["experience", "lifecycle", "pads"] },
```

- [x] **Step 7: Build and run the loop test plus the specs that render most**

Run: `bun run test && bun run build && E2E_PORT=4432 bunx playwright test e2e/lifecycle.spec.ts e2e/experience.spec.ts e2e/highlights.spec.ts e2e/roof.spec.ts e2e/pads.spec.ts`
Expected: all PASS (render budgets unchanged: L1 under 140, RF under 80; the elevator, intro and beam tests pass because `useFrame` deltas are unchanged at 60 Hz).

- [x] **Step 8: Run the visual gate**

Run (no server on 4432 must be running; Playwright serves `out/`):

```bash
VISUAL_GATE=.visual/head E2E_PORT=4432 bunx playwright test e2e/visual-gate.spec.ts --workers=1
bun scripts/shot-diff.ts --base .visual/base-a --base2 .visual/base-b --head .visual/head
```

Expected: every row `pass`. Keep the table for the PR. If a live pose fails, rerun `.visual/head` once (a failing pose that passes on rerun was animation phase); a pose that fails twice is a real change: stop and inspect the two PNGs.

- [x] **Step 9: Document**

In `AGENTS.md` "3D experience", add after the Disposal bullet:

```markdown
- Frame loop (round 5): the canvas runs `frameloop="never"`; `FrameLoop` (`scene/FrameLoop.tsx`) calls R3F `advance` from its own rAF loop through `framePacer` (`scene/framePacer.ts`): at most 60 fps (`FRAME_CAP_FPS`; 90, 120 and 144 Hz displays skip refreshes, 60 Hz displays render every one, no idle cap). Animate with `useFrame` deltas; never start another rAF loop or rely on `invalidate` in the scene. `__hq.frames()` counts rendered frames. A runtime quality monitor must take 60 fps as the ceiling and reset its sample window on `onPacerChange`.
```

In `docs/superpowers/specs/agent-hq/08-quality-acceptance.md` section 2, replace the Frame rate row:

```markdown
| Frame rate | ≥ 55 fps desktop (full), ≥ 30 fps mid-range phone (lite); rendering is capped at 60 fps on high-refresh displays (no idle cap) | Manual check plus a Playwright perf probe that samples `requestAnimationFrame` deltas; the cap is unit-tested (`tests/unit/frame-pacer.test.ts`) |
```

(The row already contains `≥`, which is in the file today; keep it.)

In `README.md` "Performance", append: "The canvas renders at most 60 frames per second (`scene/framePacer.ts`), so 90 to 144 Hz screens do not do twice the work."

- [x] **Step 10: Commit**

```bash
rtk git add src/experience/scene/framePacer.ts src/experience/scene/FrameLoop.tsx src/experience/Experience.tsx tests/unit/frame-pacer.test.ts e2e/lifecycle.spec.ts scripts/e2e-plan.ts AGENTS.md README.md docs/superpowers/specs/agent-hq/08-quality-acceptance.md
rtk git commit -m "perf: pace the 3D canvas at 60 fps on high-refresh displays"
```

---

### Task 4: Pause rendering while an opaque panel covers the canvas (D 8.3, SP7)

Under the full-screen phone palette, the full-screen phone modals (CV, paper, cert viewers), the drawer sheet at its 92% snap and the lightbox, the world is not visible, yet it renders at full rate (battery, heat, and every frame re-blurs any `backdrop-filter`). Panels that can cover the canvas get a `data-hq-cover` attribute; a watcher measures them after DOM or size changes and pauses the pacer while one hides more than 90% of the viewport. The 55% sheet, the desktop side drawer, the desktop palette and desktop modals cover much less, so the world keeps animating there (main spec 2.6). Engine rumble is set to 0 on pause so a moving rover does not leave the hum on.

Pixel impact: none while visible; the covered frame stays as it was (the panels are 94% to 100% opaque). Gate: visual gate (Step 9). Rollback: revert this commit (the attributes are inert without the watcher).

**Files:**
- Create: `src/experience/scene/cover.ts`
- Create: `src/experience/scene/coverWatch.ts`
- Create: `tests/unit/cover.test.ts`
- Modify: `src/experience/scene/FrameLoop.tsx` (mount the watcher)
- Modify: `src/hud/CommandPalette.tsx:147-152` (panel), `src/components/Modal.tsx:78-90` (panel), `src/hud/drawer/RoomDrawer.tsx:466-480` (panel), `src/components/Lightbox.tsx:109-115` (root)
- Modify: `e2e/lifecycle.spec.ts` (pause tests)
- Modify: `scripts/e2e-plan.ts`, `tests/unit/e2e-plan.test.ts:52`
- Modify: `AGENTS.md`, `docs/superpowers/specs/2026-10-09-agent-hq-design.md` (2.6)

**Interfaces:**
- Consumes: `pauseFrames(paused, now?)` from Task 3; `audio.setRumble(level: number)` from `@/lib/audio`.
- Produces: `COVER_ATTR = "data-hq-cover"`, `COVER_PAUSE = 0.9`, `interface Box { left; top; right; bottom }`, `coveredFraction(width: number, height: number, boxes: readonly Box[]): number`, `isCovered(width, height, boxes): boolean` (`scene/cover.ts`); `watchCover(onChange: (covered: boolean) => void): () => void` (`scene/coverWatch.ts`). Rule for every future opaque full-screen panel: add `data-hq-cover`.

- [x] **Step 1: Write the failing cover test**

Create `tests/unit/cover.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { COVER_PAUSE, coveredFraction, isCovered } from "@/experience/scene/cover";

const box = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom });

describe("coveredFraction", () => {
  it("is the largest share of the viewport one panel hides, clipped to the viewport", () => {
    expect(coveredFraction(390, 844, [])).toBe(0);
    expect(coveredFraction(390, 844, [box(0, 0, 390, 844)])).toBe(1);
    expect(coveredFraction(100, 100, [box(-50, -50, 50, 50)])).toBe(0.25);
    expect(coveredFraction(100, 100, [box(0, 0, 10, 10), box(0, 0, 100, 50)])).toBe(0.5);
    expect(coveredFraction(0, 0, [box(0, 0, 10, 10)])).toBe(0);
  });

  it("pauses for the 92% sheet and full-screen panels, not for the 55% sheet or a desktop panel", () => {
    expect(COVER_PAUSE).toBe(0.9);
    expect(isCovered(390, 844, [box(0, 844 * 0.08, 390, 844)])).toBe(true);
    expect(isCovered(390, 844, [box(0, 844 * 0.45, 390, 844)])).toBe(false);
    expect(isCovered(1440, 900, [box(824, 76, 1424, 884)])).toBe(false);
    expect(isCovered(1440, 900, [box(400, 108, 1040, 700)])).toBe(false);
    expect(isCovered(1440, 900, [box(0, 0, 1440, 900)])).toBe(true);
  });
});
```

Run: `bun run test tests/unit/cover.test.ts`
Expected: FAIL, `Failed to resolve import "@/experience/scene/cover"`.

- [x] **Step 2: Write the cover math and the watcher**

Create `src/experience/scene/cover.ts`:

```ts
/**
 * Whether opaque HUD panels hide the 3D canvas (round 5 P3, perf report D 8.3). Panels that can
 * cover the world carry `data-hq-cover`; rendering pauses while one of them hides more than
 * COVER_PAUSE of the viewport (the canvas is full-viewport). Pure: unit-tested in node.
 */
export const COVER_ATTR = "data-hq-cover";
/** Main spec 2.6: the world stays animated behind the side panel and the 55% sheet; the 92% sheet and full-screen panels pause it. */
export const COVER_PAUSE = 0.9;

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Largest share (0 to 1) of a `width` x `height` viewport that one box hides. */
export function coveredFraction(width: number, height: number, boxes: readonly Box[]): number {
  const area = width * height;
  if (area <= 0) return 0;
  let best = 0;
  for (const b of boxes) {
    const w = Math.max(0, Math.min(b.right, width) - Math.max(b.left, 0));
    const h = Math.max(0, Math.min(b.bottom, height) - Math.max(b.top, 0));
    best = Math.max(best, (w * h) / area);
  }
  return best;
}

export function isCovered(width: number, height: number, boxes: readonly Box[]): boolean {
  return coveredFraction(width, height, boxes) > COVER_PAUSE;
}
```

Create `src/experience/scene/coverWatch.ts`:

```ts
"use client";

import { COVER_ATTR, isCovered } from "./cover";

/**
 * Watches the panels marked `data-hq-cover` and reports whether one hides more than COVER_PAUSE of
 * the canvas. Layout is read in one animation frame after a DOM change (a panel opens or closes),
 * a size change of a watched panel (the sheet snaps) or a window resize; it never polls per frame.
 */
export function watchCover(onChange: (covered: boolean) => void): () => void {
  let raf = 0;
  let last: boolean | null = null;
  const sized = new Set<Element>();
  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(check);
  };
  const resize = new ResizeObserver(schedule);
  function check() {
    raf = 0;
    const panels = Array.from(document.querySelectorAll(`[${COVER_ATTR}]`));
    for (const el of panels) {
      if (sized.has(el)) continue;
      sized.add(el);
      resize.observe(el);
    }
    for (const el of sized) {
      if (el.isConnected) continue;
      sized.delete(el);
      resize.unobserve(el);
    }
    const covered = isCovered(window.innerWidth, window.innerHeight, panels.map((el) => el.getBoundingClientRect()));
    if (covered === last) return;
    last = covered;
    onChange(covered);
  }
  const mutations = new MutationObserver(schedule);
  mutations.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: [COVER_ATTR, "class", "hidden"] });
  window.addEventListener("resize", schedule);
  schedule();
  return () => {
    mutations.disconnect();
    resize.disconnect();
    window.removeEventListener("resize", schedule);
    if (raf) cancelAnimationFrame(raf);
  };
}
```

Run: `bun run test tests/unit/cover.test.ts`
Expected: PASS (2 tests).

- [x] **Step 3: Mount the watcher in the frame loop**

Replace `src/experience/scene/FrameLoop.tsx` with:

```tsx
"use client";

import { advance, useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { audio } from "@/lib/audio";
import { watchCover } from "./coverWatch";
import { framePacer, pacerTick, pauseFrames, resetPacer } from "./framePacer";

/**
 * Drives the canvas (`frameloop="never"`): one R3F `advance` per paced frame, so `useFrame`
 * callbacks, the composer and the render run at most FRAME_CAP_FPS (framePacer.ts), and nothing
 * runs while a `data-hq-cover` panel hides the world (coverWatch.ts). Mount it once, inside the Canvas.
 */
export function FrameLoop() {
  const get = useThree((s) => s.get);
  useEffect(() => {
    resetPacer(framePacer);
    let raf = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const t = pacerTick(framePacer, now);
      if (t !== null) advance(t, true, get());
    };
    raf = requestAnimationFrame(loop);
    const stopWatching = watchCover((covered) => {
      pauseFrames(covered);
      // The Director sets the rumble every frame; while it is paused the engine hum must not hang on.
      if (covered) audio.setRumble(0);
    });
    return () => {
      cancelAnimationFrame(raf);
      stopWatching();
      pauseFrames(false);
    };
  }, [get]);
  return null;
}
```

- [x] **Step 4: Mark the covering panels**

`src/hud/CommandPalette.tsx`, the panel `div` (line 147-152): add the attribute after `onKeyDown={onDialogKeyDown}`:

```tsx
        onKeyDown={onDialogKeyDown}
        data-hq-cover=""
```

`src/components/Modal.tsx`, the panel `div` with `role="dialog"` (after `data-sheet={sheet ? "bottom" : undefined}`):

```tsx
        data-sheet={sheet ? "bottom" : undefined}
        data-hq-cover=""
```

`src/hud/drawer/RoomDrawer.tsx`, the drawer panel (after `data-condensed={condensed ? "true" : undefined}`):

```tsx
      data-condensed={condensed ? "true" : undefined}
      data-hq-cover=""
```

`src/components/Lightbox.tsx`, the root `div` with `data-testid="lightbox"`:

```tsx
      data-testid="lightbox"
      data-hq-cover=""
```

Only the measured rectangle decides: the desktop palette (640 px), desktop modals, the side drawer and the 55% sheet stay under 90% and never pause.

- [x] **Step 5: Write the failing pause e2e tests**

In `e2e/lifecycle.spec.ts` change the imports at the top to:

```ts
import { expect, test, type Browser, type Page } from "@playwright/test";
import { asReturningVisitor, enterHQ, waitForFrames, waitForHQ, waitForSceneLive } from "./hq";
import { heroPod } from "./routes";
```

and append:

```ts
/** Draw calls over `ms` of wall time: only for proving that the canvas stays idle. */
async function drawsOver(page: Page, ms: number) {
  const before = await draws(page);
  await page.waitForTimeout(ms);
  return (await draws(page)) - before;
}

const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };

async function phonePage(browser: Browser) {
  const context = await browser.newContext(PHONE);
  return { context, page: await context.newPage() };
}

const POD_ROUTE = `/en/labs/${heroPod.slug}`;

/** A pod deep link opens its drawer at once (phase "room"), so wait for the scene, not for "explore". */
async function openPodRoute(page: Page) {
  await asReturningVisitor(page);
  await page.goto(`${POD_ROUTE}?tier=lite`);
  await waitForHQ(page);
  await waitForSceneLive(page);
}
const openHud = (page: Page, type: string) => page.evaluate((t) => window.dispatchEvent(new CustomEvent("hq:hud", { detail: { type: t } })), type);
const sheetPercent = async (page: Page) => Math.round((((await page.getByTestId("room-drawer").boundingBox())?.height ?? 0) / 844) * 100);

test.describe("rendering pauses while an opaque panel covers the canvas", () => {
  test("phone: the full-screen palette pauses the world, closing it resumes", async ({ browser }) => {
    const { context, page } = await phonePage(browser);
    await countDraws(page);
    await enterHQ(page);
    await expectDrawing(page);
    await openHud(page, "palette");
    await expect(page.getByRole("dialog")).toBeVisible();
    await waitForFrames(page, 3);
    expect(await drawsOver(page, 1000)).toBe(0);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expectDrawing(page);
    await context.close();
  });

  test("phone: the full-screen CV viewer pauses the world", async ({ browser }) => {
    const { context, page } = await phonePage(browser);
    await countDraws(page);
    await enterHQ(page);
    await openHud(page, "cv");
    await expect(page.getByTestId("cv-dialog")).toBeVisible();
    await waitForFrames(page, 3);
    expect(await drawsOver(page, 1000)).toBe(0);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("cv-dialog")).toBeHidden();
    await expectDrawing(page);
    await context.close();
  });

  test("phone: the world animates behind the 55% sheet and pauses at the 92% snap", async ({ browser }) => {
    const { context, page } = await phonePage(browser);
    await countDraws(page);
    await openPodRoute(page);
    await expect(page.getByTestId("room-drawer")).toBeVisible({ timeout: 90_000 });
    await expect.poll(() => sheetPercent(page)).toBe(55);
    await expectDrawing(page);
    await page.getByTestId("sheet-handle").click();
    await expect.poll(() => sheetPercent(page)).toBe(92);
    await waitForFrames(page, 3);
    expect(await drawsOver(page, 1000)).toBe(0);
    await page.getByTestId("sheet-handle").click();
    await expect.poll(() => sheetPercent(page)).toBe(55);
    await expectDrawing(page);
    await context.close();
  });

  test("desktop: the side drawer and the palette keep the world animated", async ({ page }) => {
    await countDraws(page);
    await openPodRoute(page);
    await expect(page.getByTestId("room-drawer")).toBeVisible({ timeout: 90_000 });
    await expectDrawing(page);
    await openHud(page, "palette");
    await expect(page.getByRole("dialog").last()).toBeVisible();
    await expectDrawing(page);
  });
});
```

Run: `bun run build && E2E_PORT=4432 bunx playwright test e2e/lifecycle.spec.ts -g "pauses"` against a build WITHOUT Step 3 and Step 4 if you want to see it fail first (stash them: `rtk git stash push src/experience/scene/FrameLoop.tsx src/hud src/components`, build, run, `rtk git stash pop`).
Expected without the watcher: the three phone tests FAIL with `drawsOver` well above 0 (record this number per second as the "before" for frames under covers); the desktop test passes.

- [x] **Step 6: Run the pause tests and the HUD specs**

Run: `bun run build && E2E_PORT=4432 bunx playwright test e2e/lifecycle.spec.ts e2e/labs.spec.ts e2e/gallery.spec.ts e2e/hud.spec.ts e2e/drawer-solid.spec.ts e2e/missions.spec.ts`
Expected: all PASS.

- [x] **Step 7: Map the paths to the lifecycle spec**

In `scripts/e2e-plan.ts`:

```ts
  { test: /^src\/hud\/drawer\//, specs: ["labs", "gallery", "career", "library-roof", "drawer-solid", "hud", "lifecycle"] },
  { test: /^src\/hud\/(RoverTerminal|MissionHud|CommandPalette)\.tsx$|^src\/hud\/(search|events|palette-types)\.ts$/, specs: ["ask", "experience", "missions", "drawer-solid", "lifecycle"] },
```

and add before the `Gallery|Lightbox|Chip` rule:

```ts
  // Full-screen panels that pause the canvas (data-hq-cover).
  { test: /^src\/components\/(Modal|Lightbox)\.tsx$/, specs: ["gallery", "lifecycle", "pageview"] },
```

In `tests/unit/e2e-plan.test.ts` line 52:

```ts
    expect(specsForChanges(["src/hud/CommandPalette.tsx"]).specs).toEqual(["ask", "drawer-solid", "experience", "lifecycle", "missions"]);
```

Run: `bun run test tests/unit/e2e-plan.test.ts`
Expected: PASS.

- [x] **Step 8: Document**

In `AGENTS.md`, extend the Frame loop bullet from Task 3 with: "Rendering pauses while an opaque panel marked `data-hq-cover` hides more than 90% of the canvas (`scene/cover.ts`, `scene/coverWatch.ts`): the full-screen phone palette and modals, the drawer sheet at its 92% snap and the lightbox. The desktop side drawer, the 55% sheet and desktop overlays keep the world animated. Mark any new opaque full-screen panel with `data-hq-cover`; the rumble drops to 0 on pause."

In `docs/superpowers/specs/2026-10-09-agent-hq-design.md` section 2.6, append to the Glass Drawer bullet: "Rendering pauses only while an opaque panel hides more than 90% of the canvas (the 92% sheet, the full-screen phone palette and modals, the lightbox); the side panel and the 55% sheet keep the pod animated."

- [x] **Step 9: Run the visual gate**

Run:

```bash
bun run build
VISUAL_GATE=.visual/head E2E_PORT=4432 bunx playwright test e2e/visual-gate.spec.ts --workers=1
bun scripts/shot-diff.ts --base .visual/base-a --base2 .visual/base-b --head .visual/head
```

Expected: every row `pass` (`pattern-phone-palette` and `pattern-phone-cv` are paused on the branch; their panels are opaque, so they match).

- [x] **Step 10: Lint and commit**

Run: `bun run typecheck && bun run lint && bun run test`
Expected: PASS.

```bash
rtk git add src/experience/scene/cover.ts src/experience/scene/coverWatch.ts src/experience/scene/FrameLoop.tsx src/hud/CommandPalette.tsx src/components/Modal.tsx src/hud/drawer/RoomDrawer.tsx src/components/Lightbox.tsx tests/unit/cover.test.ts e2e/lifecycle.spec.ts scripts/e2e-plan.ts tests/unit/e2e-plan.test.ts AGENTS.md docs/superpowers/specs/2026-10-09-agent-hq-design.md
rtk git commit -m "perf: pause the 3D canvas while an opaque panel covers more than 90% of it"
```

---
### Task 5: Bounded `findPath` (D 6.3, SP11)

Today every `findPath` call floods the whole grid before A* (`navgrid.ts:225`, about 25k cells on L2), runs a generator that allocates a tuple per neighbour, scans every cell for the nearest reachable one when the target is blocked (`nearestCell`, `:97-110`) and rebuilds the path with `unshift`. The new version labels each grid's connected regions once (cached per grid, so reachability is a lookup), snaps blocked starts and targets with a ring search that stops as soon as no closer cell can exist, runs A* with an inline neighbour function and a typed-array heap, and rebuilds the path with `push` + `reverse`. Results are identical to the old implementation: the same heap order, neighbour order and tie-breaking (an equivalence test against a frozen copy proves it on every real floor).

No pixels change (same paths). No visual gate.

**Files:**
- Create: `tests/helpers/navgrid-legacy.ts` (frozen copy, generated)
- Create: `tests/helpers/real-layouts.ts`
- Create: `tests/unit/navgrid-bounded.test.ts`
- Create: `tests/bench/navgrid.bench.ts`
- Modify: `src/experience/nav/navgrid.ts:14-23,82-251`
- Modify: `vitest.config.mts`, `package.json` (`bench` script)
- Modify: `scripts/e2e-plan.ts` (navgrid rule)
- Modify: `README.md` (Scripts), `AGENTS.md` (Fast verification)

**Interfaces:**
- Consumes: `buildExperienceData`, `buildFloorLayouts`, `careerLayoutInput`, `libraryLayoutInput`, `ROVER`, `buildRoadGraph`, `roadRoute`, `roadZAt`.
- Produces: unchanged public API (`buildNavGrid`, `isWalkable`, `nearestWalkable`, `segmentWalkable`, `findPath`), plus `componentsOf(g: NavGrid): Int32Array` (region label per cell, -1 when blocked, cached per grid; grids are immutable after `buildNavGrid`) and `pathStats: { expanded: number; scanned: number }` (work of the last `findPath`). Test helpers `realLayouts(): Record<FloorId, FloorLayout>` and `farthestWalkable(g: NavGrid, from: Vec2): Vec2`. Script `bun run bench`.

- [x] **Step 1: Freeze the current implementation as the oracle**

Run (before touching `navgrid.ts`):

```bash
{ echo '// Frozen copy of src/experience/nav/navgrid.ts before round 5 P3: the oracle for tests/unit/navgrid-bounded.test.ts and tests/bench/navgrid.bench.ts. Do not edit.'; rtk git show HEAD:src/experience/nav/navgrid.ts | sed -e 's#"\.\./types"#"@/experience/types"#' -e 's#"\./collision"#"@/experience/nav/collision"#'; } > tests/helpers/navgrid-legacy.ts
bun run typecheck
```

Expected: typecheck passes; `tests/helpers/navgrid-legacy.ts` exports `buildNavGrid`, `isWalkable`, `nearestWalkable`, `segmentWalkable`, `findPath`.

- [x] **Step 2: Add the real-layout helper**

Create `tests/helpers/real-layouts.ts`:

```ts
import type { FloorId } from "@/content/schema";
import { buildExperienceData } from "@/content/experience";
import { buildFloorLayouts } from "@/experience/config";
import { careerLayoutInput } from "@/experience/floors/career/layout";
import { libraryLayoutInput } from "@/experience/floors/library/model";
import type { NavGrid } from "@/experience/nav/navgrid";
import type { FloorLayout, Vec2 } from "@/experience/types";

/** The floor layouts the 3D chunk builds from the real content (as in Experience.tsx). */
export function realLayouts(): Record<FloorId, FloorLayout> {
  const data = buildExperienceData("en", { L1: "", L2: "", L3: "", L4: "", RF: "" });
  return buildFloorLayouts(data.years.length, { labs: data.labs.pods, career: careerLayoutInput(data.career), library: libraryLayoutInput(data.library) });
}

/** The walkable cell center farthest (in a straight line) from `from`: the worst autopilot target on a floor. */
export function farthestWalkable(g: NavGrid, from: Vec2): Vec2 {
  let best: Vec2 = { x: from.x, z: from.z };
  let bestD = -1;
  for (let idx = 0; idx < g.walkable.length; idx++) {
    if (!g.walkable[idx]) continue;
    const x = g.minX + ((idx % g.cols) + 0.5) * g.cell;
    const z = g.minZ + (Math.floor(idx / g.cols) + 0.5) * g.cell;
    const d = (x - from.x) ** 2 + (z - from.z) ** 2;
    if (d > bestD) {
      bestD = d;
      best = { x, z };
    }
  }
  return best;
}
```

- [x] **Step 3: Write the failing tests**

Create `tests/unit/navgrid-bounded.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { FloorId } from "@/content/schema";
import { ROVER } from "@/experience/config";
import { buildNavGrid, componentsOf, findPath, nearestWalkable, pathStats } from "@/experience/nav/navgrid";
import type { Vec2 } from "@/experience/types";
import * as legacy from "../helpers/navgrid-legacy";
import { realLayouts } from "../helpers/real-layouts";

const rng = (seed: number) => {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
};

describe("findPath returns exactly what the pre-round-5 implementation returned", () => {
  const layouts = realLayouts();
  for (const id of Object.keys(layouts) as FloorId[]) {
    it(`on ${id}: 60 seeded pairs (some off the slab or inside obstacles), spawn, approach and every door`, () => {
      const layout = layouts[id];
      const grid = buildNavGrid(layout, ROVER.radius);
      const { minX, maxX, minZ, maxZ } = layout.bounds;
      const rand = rng(id.charCodeAt(0) * 131 + id.charCodeAt(1));
      const point = (): Vec2 => ({ x: minX - 3 + rand() * (maxX - minX + 6), z: minZ - 3 + rand() * (maxZ - minZ + 6) });
      const pairs: [Vec2, Vec2][] = [
        [layout.spawn, layout.approach],
        [layout.approach, layout.spawn],
      ];
      for (const door of layout.doors ?? []) pairs.push([layout.approach, door.at]);
      for (let k = 0; k < 60; k++) pairs.push([point(), point()]);
      for (const [a, b] of pairs) expect(findPath(grid, a, b), `${id} ${JSON.stringify([a, b])}`).toEqual(legacy.findPath(grid, a, b));
      for (let k = 0; k < 20; k++) {
        const p = point();
        expect(nearestWalkable(grid, p)).toEqual(legacy.nearestWalkable(grid, p));
      }
    }, 120_000);
  }
});

describe("findPath does bounded work", () => {
  const bounds = { minX: -200, maxX: 200, minZ: -200, maxZ: 200 };

  it("labels a grid's regions once and reuses the labels", () => {
    const grid = buildNavGrid({ bounds, obstacles: [] }, 0.5);
    expect(componentsOf(grid)).toBe(componentsOf(grid));
  });

  it("expands only cells near a short hop on a 160k cell grid", () => {
    const grid = buildNavGrid({ bounds, obstacles: [] }, 0.5);
    componentsOf(grid);
    expect(findPath(grid, { x: 0.5, z: 0.5 }, { x: 10.5, z: 4.5 })?.at(-1)).toEqual({ x: 10.5, z: 4.5 });
    expect(pathStats.expanded).toBeLessThan(200);
    expect(pathStats.scanned).toBe(0);
  });

  it("snaps a blocked target with a local ring search, not a whole-grid scan", () => {
    const grid = buildNavGrid({ bounds, obstacles: [{ minX: 8, maxX: 12, minZ: -2, maxZ: 2 }] }, 0.5);
    componentsOf(grid);
    expect(findPath(grid, { x: 0.5, z: 0.5 }, { x: 10, z: 0 })).not.toBeNull();
    expect(pathStats.scanned).toBeLessThan(400);
    expect(pathStats.expanded).toBeLessThan(400);
  });
});
```

Run: `bun run test tests/unit/navgrid-bounded.test.ts`
Expected: FAIL, `componentsOf` and `pathStats` are not exported (`TypeError: ... is not a function` or a missing export error).

- [x] **Step 4: Implement the bounded search**

In `src/experience/nav/navgrid.ts` replace the `DIRS` constant (lines 14-23) with:

```ts
/** Neighbour offsets: 4 orthogonal, then 4 diagonal. A* visits them in this order, which fixes its tie-breaking. */
const DI = [1, -1, 0, 0, 1, 1, -1, -1];
const DJ = [0, 0, 1, -1, 1, -1, 1, -1];
```

and replace everything from `function* neighbors` (line 82) to the end of the file with:

```ts
/** Neighbour `d` (0 to 7) of cell (i, j), or -1 when it is off the grid, blocked, or a diagonal that would cut a corner. */
function neighbor(g: NavGrid, i: number, j: number, d: number): number {
  const ni = i + DI[d];
  const nj = j + DJ[d];
  if (ni < 0 || nj < 0 || ni >= g.cols || nj >= g.rows) return -1;
  const n = nj * g.cols + ni;
  if (!g.walkable[n]) return -1;
  if (d >= 4 && (!g.walkable[j * g.cols + ni] || !g.walkable[nj * g.cols + i])) return -1;
  return n;
}

/** Work done by the last `findPath` call (unit tests and benches): A* pops and cells looked at while snapping. */
export const pathStats = { expanded: 0, scanned: 0 };

const components = new WeakMap<NavGrid, Int32Array>();

/**
 * Connected region of every cell (-1 when blocked), labelled once per grid: reachability becomes a
 * lookup instead of a whole-grid flood on every `findPath` (perf report D 6.3). Grids never change
 * after `buildNavGrid`.
 */
export function componentsOf(g: NavGrid): Int32Array {
  const cached = components.get(g);
  if (cached) return cached;
  const labels = new Int32Array(g.walkable.length).fill(-1);
  const queue = new Int32Array(g.walkable.length);
  let label = 0;
  for (let seed = 0; seed < labels.length; seed++) {
    if (!g.walkable[seed] || labels[seed] !== -1) continue;
    let head = 0;
    let tail = 0;
    labels[seed] = label;
    queue[tail++] = seed;
    while (head < tail) {
      const idx = queue[head++];
      const i = idx % g.cols;
      const j = (idx - i) / g.cols;
      for (let d = 0; d < 8; d++) {
        const n = neighbor(g, i, j, d);
        if (n >= 0 && labels[n] === -1) {
          labels[n] = label;
          queue[tail++] = n;
        }
      }
    }
    label += 1;
  }
  components.set(g, labels);
  return labels;
}

/**
 * Nearest allowed cell center to `p` (ties: the lowest index, as a full scan in index order would
 * pick). Searches square rings around `p`'s cell and stops once a ring cannot hold a closer cell.
 */
function nearestCell(g: NavGrid, p: Vec2, allowed: (idx: number) => boolean): number | null {
  const u = (p.x - g.minX) / g.cell - 0.5;
  const v = (p.z - g.minZ) / g.cell - 0.5;
  const bi = Math.min(g.cols - 1, Math.max(0, Math.round(u)));
  const bj = Math.min(g.rows - 1, Math.max(0, Math.round(v)));
  // Every cell on ring r is at least (r - off) cells from p (Chebyshev, so also Euclidean).
  const off = Math.max(Math.abs(bi - u), Math.abs(bj - v));
  const maxR = Math.max(bi, g.cols - 1 - bi, bj, g.rows - 1 - bj);
  let best = -1;
  let bestD = Infinity;
  const consider = (i: number, j: number) => {
    pathStats.scanned += 1;
    const idx = j * g.cols + i;
    if (!allowed(idx)) return;
    const c = center(g, idx);
    const d = (c.x - p.x) ** 2 + (c.z - p.z) ** 2;
    if (d < bestD || (d === bestD && idx < best)) {
      bestD = d;
      best = idx;
    }
  };
  for (let r = 0; r <= maxR; r++) {
    const reach = (r - off) * g.cell;
    if (best >= 0 && reach > 0 && reach * reach > bestD * (1 + 1e-12) + 1e-12) break;
    const i0 = bi - r;
    const i1 = bi + r;
    const j0 = bj - r;
    const j1 = bj + r;
    for (let i = Math.max(0, i0); i <= Math.min(g.cols - 1, i1); i++) {
      if (j0 >= 0) consider(i, j0);
      if (r > 0 && j1 < g.rows) consider(i, j1);
    }
    for (let j = Math.max(0, j0 + 1); j <= Math.min(g.rows - 1, j1 - 1); j++) {
      if (i0 >= 0) consider(i0, j);
      if (r > 0 && i1 < g.cols) consider(i1, j);
    }
  }
  return best < 0 ? null : best;
}

/** Nearest walkable point to `p` (the point itself when it is walkable). */
export function nearestWalkable(g: NavGrid, p: Vec2): Vec2 | null {
  if (isWalkable(g, p)) return p;
  const idx = nearestCell(g, p, (i) => g.walkable[i] === 1);
  return idx === null ? null : center(g, idx);
}

/** Binary min-heap of (f, cell) on typed arrays; the same sift order as the tuple heap it replaces, so A* breaks ties the same way. */
class MinHeap {
  private f = new Float64Array(256);
  private id = new Int32Array(256);
  size = 0;
  /** Priority of the item the last `pop` returned. */
  topF = 0;

  push(f: number, id: number) {
    if (this.size === this.f.length) {
      const nf = new Float64Array(this.size * 2);
      nf.set(this.f);
      this.f = nf;
      const ni = new Int32Array(this.size * 2);
      ni.set(this.id);
      this.id = ni;
    }
    const F = this.f;
    const I = this.id;
    let i = this.size++;
    F[i] = f;
    I[i] = id;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (F[p] <= F[i]) break;
      const tf = F[p];
      F[p] = F[i];
      F[i] = tf;
      const ti = I[p];
      I[p] = I[i];
      I[i] = ti;
      i = p;
    }
  }

  pop(): number {
    const F = this.f;
    const I = this.id;
    this.topF = F[0];
    const top = I[0];
    this.size -= 1;
    if (this.size > 0) {
      F[0] = F[this.size];
      I[0] = I[this.size];
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.size && F[l] < F[m]) m = l;
        if (r < this.size && F[r] < F[m]) m = r;
        if (m === i) break;
        const tf = F[m];
        F[m] = F[i];
        F[i] = tf;
        const ti = I[m];
        I[m] = I[i];
        I[i] = ti;
        i = m;
      }
    }
    return top;
  }
}

function aStar(g: NavGrid, start: number, goal: number): number[] | null {
  const cols = g.cols;
  const gx = goal % cols;
  const gz = Math.floor(goal / cols);
  const h = (idx: number) => {
    const dx = Math.abs((idx % cols) - gx);
    const dz = Math.abs(Math.floor(idx / cols) - gz);
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
  };
  const cost = new Float64Array(g.walkable.length).fill(Infinity);
  const from = new Int32Array(g.walkable.length).fill(-1);
  const open = new MinHeap();
  cost[start] = 0;
  open.push(h(start), start);
  while (open.size) {
    const cur = open.pop();
    const f = open.topF;
    pathStats.expanded += 1;
    if (cur === goal) break;
    if (f - h(cur) > cost[cur] + 1e-9) continue;
    const i = cur % cols;
    const j = (cur - i) / cols;
    for (let d = 0; d < 8; d++) {
      const n = neighbor(g, i, j, d);
      if (n < 0) continue;
      const c = cost[cur] + (d >= 4 ? Math.SQRT2 : 1);
      if (c < cost[n]) {
        cost[n] = c;
        from[n] = cur;
        open.push(c + h(n), n);
      }
    }
  }
  if (!Number.isFinite(cost[goal])) return null;
  const path: number[] = [];
  for (let c = goal; ; c = from[c]) {
    path.push(c);
    if (c === start) break;
  }
  return path.reverse();
}

/** Whether the straight segment from `a` to `b` stays on walkable cells (sampled every 0.25 u). */
export function segmentWalkable(g: NavGrid, a: Vec2, b: Vec2): boolean {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const steps = Math.max(1, Math.ceil(len / 0.25));
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    if (!isWalkable(g, { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })) return false;
  }
  return true;
}

/**
 * A* on the navgrid with 8-way movement, then string-pulled. Unreachable or
 * blocked targets snap to the nearest reachable cell. Returns waypoints
 * excluding `from`, or null when the start has no walkable cell at all.
 */
export function findPath(g: NavGrid, from: Vec2, to: Vec2): Vec2[] | null {
  pathStats.expanded = 0;
  pathStats.scanned = 0;
  const rawStart = cellIndex(g, from);
  const start = rawStart !== null && g.walkable[rawStart] ? rawStart : nearestCell(g, from, (i) => g.walkable[i] === 1);
  if (start === null) return null;
  const labels = componentsOf(g);
  const region = labels[start];
  const targetCell = cellIndex(g, to);
  const exact = targetCell !== null && labels[targetCell] === region;
  const goal = exact ? targetCell : nearestCell(g, to, (i) => labels[i] === region);
  if (goal === null) return null;
  const cells = aStar(g, start, goal);
  if (!cells) return null;

  const final = exact ? to : center(g, goal);
  const points = [from, ...cells.slice(1, -1).map((c) => center(g, c)), final];
  if (rawStart !== start) points.splice(1, 0, center(g, start));

  const out: Vec2[] = [];
  let anchor = 0;
  while (anchor < points.length - 1) {
    let next = anchor + 1;
    for (let k = points.length - 1; k > anchor + 1; k--) {
      if (segmentWalkable(g, points[anchor], points[k])) {
        next = k;
        break;
      }
    }
    out.push(points[next]);
    anchor = next;
  }
  return out;
}
```

`center`, `cellIndex`, `isWalkable` and `buildNavGrid` (lines 25-80) stay as they are.

- [x] **Step 5: Run the navgrid tests**

Run: `bun run test tests/unit/navgrid-bounded.test.ts tests/unit/navgrid.test.ts tests/unit/road.test.ts tests/unit/walk.test.ts tests/unit/missions-host3d.test.ts`
Expected: PASS. An equivalence failure prints the floor and the pair; the usual cause is a changed tie-break (check `consider` keeps the lowest index on equal distance and `neighbor` keeps the `DI`/`DJ` order).

- [x] **Step 6: Add the bench**

In `vitest.config.mts`, inside `test`:

```ts
    include: ["tests/**/*.test.{ts,tsx}"],
    benchmark: { include: ["tests/bench/**/*.bench.ts"] },
    environment: "node",
```

In `package.json` scripts, after `"test:watch"`:

```json
    "bench": "vitest bench --run",
```

Create `tests/bench/navgrid.bench.ts`:

```ts
import { bench, describe } from "vitest";
import type { FloorId } from "@/content/schema";
import { ROVER } from "@/experience/config";
import { roadZAt } from "@/experience/floors/career/layout";
import { buildNavGrid, componentsOf, findPath } from "@/experience/nav/navgrid";
import { buildRoadGraph, roadRoute } from "@/experience/nav/road";
import type { Vec2 } from "@/experience/types";
import * as legacy from "../helpers/navgrid-legacy";
import { farthestWalkable, realLayouts } from "../helpers/real-layouts";

/** Perf report SP11: findPath on the real layouts; pass when every `current` mean is at most 2 ms (8 ms at 4x CPU). */
const layouts = realLayouts();

for (const id of Object.keys(layouts) as FloorId[]) {
  const layout = layouts[id];
  const grid = buildNavGrid(layout, ROVER.radius);
  componentsOf(grid);
  const from = layout.approach;
  const far = farthestWalkable(grid, from);
  describe(`${id} findPath, ${grid.cols}x${grid.rows} cells: elevator approach to the farthest cell`, () => {
    bench("current", () => {
      findPath(grid, from, far);
    });
    bench("legacy", () => {
      legacy.findPath(grid, from, far);
    });
  });
  if (layout.obstacles.length) {
    const largest = layout.obstacles.reduce((a, b) => ((b.maxX - b.minX) * (b.maxZ - b.minZ) > (a.maxX - a.minX) * (a.maxZ - a.minZ) ? b : a));
    const inside: Vec2 = { x: (largest.minX + largest.maxX) / 2, z: (largest.minZ + largest.maxZ) / 2 };
    describe(`${id} findPath: to the center of the largest obstacle (snapped)`, () => {
      bench("current", () => {
        findPath(grid, from, inside);
      });
      bench("legacy", () => {
        legacy.findPath(grid, from, inside);
      });
    });
  }
  if (layout.scrubStops?.length) {
    const x = layout.scrubStops[Math.min(2, layout.scrubStops.length - 1)];
    const stop: Vec2 = { x, z: roadZAt(layout.road?.roads[0]?.points ?? [], x) };
    describe(`${id} findPath: one swipe to a year stop (Director scrub)`, () => {
      bench("current", () => {
        findPath(grid, from, stop);
      });
      bench("legacy", () => {
        legacy.findPath(grid, from, stop);
      });
    });
  }
  if (layout.road) {
    const road = layout.road;
    const graph = buildRoadGraph(road);
    describe(`${id} roadRoute: elevator approach to the farthest cell`, () => {
      bench("current", () => {
        roadRoute(road, grid, from, far, graph);
      });
    });
  }
}
```

Run: `bun run bench tests/bench/navgrid.bench.ts`
Expected: a table per group; in every `findPath` group `current` is faster than `legacy` (vitest prints "current ... x faster than legacy"). Pass rule (SP11): every `current` mean at most 2 ms on an M-class laptop, which is 8 ms at 4x CPU. If the farthest-cell `findPath` on L2 or L3 is above 2 ms while the scrub and roadRoute rows are under it, record it: A* over a whole floor is inherent, and no autopilot drive uses an unroaded whole-floor path (L2 to L4 drives follow `roadRoute`). Paste the table into the PR.

- [x] **Step 7: Map the path and document**

In `scripts/e2e-plan.ts`, add before the road rule:

```ts
  { test: /^src\/experience\/nav\/navgrid\.ts$/, specs: ["career", "experience", "missions", "walk"] },
```

In `README.md` Scripts table, add after the `bun run test` row:

```markdown
| `bun run bench` | Vitest benches (`tests/bench/`): `findPath` on the real floor layouts and palette typing, each against the pre-round-5 implementation; numbers for PR bodies, never a CI gate |
```

In `AGENTS.md` "Fast verification", add: "`bun run bench` runs the Vitest benches in `tests/bench/` (path finding on the real layouts, palette typing) against frozen copies of the old code in `tests/helpers/*-legacy.ts`; use it for CPU changes and paste the table into the PR."

- [x] **Step 8: Verify and commit**

Run: `bun run typecheck && bun run lint && bun run test && bun run build && E2E_PORT=4432 bunx playwright test e2e/missions.spec.ts e2e/walk.spec.ts e2e/career.spec.ts`
Expected: PASS.

```bash
rtk git add src/experience/nav/navgrid.ts tests/helpers/navgrid-legacy.ts tests/helpers/real-layouts.ts tests/unit/navgrid-bounded.test.ts tests/bench/navgrid.bench.ts vitest.config.mts package.json scripts/e2e-plan.ts README.md AGENTS.md
rtk git commit -m "perf: label navgrid regions once and snap targets with a ring search instead of a flood per path"
```

---

### Task 6: Palette search pre-normalization (D 6.8, SP11)

`fuzzyScore` normalizes the query and the text (NFD, three regexes) on every call: about 1.3k to 1.5k calls per query token, every keystroke, plus a Unicode regex per character in the subsequence DP. The texts of an entry never change, so they are normalized once (cached per entry object) together with their word-start flags; the query tokens are normalized once per search; the subsequence DP is skipped when no in-order match exists. Results are identical (equivalence test against a frozen copy over a generated query corpus). No `useDeferredValue`: Enter must act on the query as typed ("copy email" then Enter runs the action), and the cost drops well under a frame.

No pixels change. No visual gate.

**Files:**
- Create: `tests/helpers/search-legacy.ts` (frozen copy, generated)
- Create: `tests/unit/search-equivalence.test.ts`
- Create: `tests/bench/search.bench.ts`
- Modify: `src/hud/search.ts:85-178,239-242`
- Modify: `docs/superpowers/specs/agent-hq/02-interaction-and-states.md` (section 5)

**Interfaces:**
- Consumes: `buildHudIndex`, `getContent`, `buildPaletteEntries`.
- Produces: unchanged exports `normalize`, `fuzzyScore(query, text)`, `scoreEntry(entry, tokens)`, `searchPalette(entries, query, options)`, `looksLikeQuestion`, `askEntry`, `buildPaletteEntries`. Internal: `prepare(text): Prepared`, `prepared(entry): PreparedEntry` (WeakMap cache), `scoreText(q, prepared)`, `scoreTokens(entry, normalizedTokens)`.

- [x] **Step 1: Freeze the current search as the oracle**

```bash
{ echo '// Frozen copy of src/hud/search.ts before round 5 P3: the oracle for tests/unit/search-equivalence.test.ts and tests/bench/search.bench.ts. Do not edit.'; rtk git show HEAD:src/hud/search.ts | sed -e 's#"\./index-data"#"@/hud/index-data"#' -e 's#"\./palette-types"#"@/hud/palette-types"#'; } > tests/helpers/search-legacy.ts
bun run typecheck
```

Expected: typecheck passes.

- [x] **Step 2: Write the equivalence test**

Create `tests/unit/search-equivalence.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getContent } from "@/content/load";
import type { RoomId } from "@/content/schema";
import { buildHudIndex } from "@/hud/index-data";
import { buildPaletteEntries, fuzzyScore, searchPalette } from "@/hud/search";
import * as legacy from "../helpers/search-legacy";

const index = buildHudIndex(getContent());
const entries = buildPaletteEntries(index, ["view-cv", "copy-email", "toggle-language", "quick-view"]);

/** Every word of every entry, prefixes, a dropped-letter typo, word pairs, diacritics and questions. */
function corpus(): string[] {
  const words = new Set<string>();
  for (const e of entries) {
    for (const text of [e.title.en, e.title.id, ...e.keywords, e.subtitle?.en ?? "", e.subtitle?.id ?? ""]) for (const w of text.split(/\s+/)) if (w) words.add(w);
  }
  const list = [...words].sort();
  const queries = ["", "   ", "voice ai contact center", "tur singkat", "kontak", "Caf\u00e9 ", "what did you build?", "siapa kamu", "copy email", "2021", "zz", "qxj", "a", "ai ml", "rag llm azure", "View CV!"];
  list.forEach((w, i) => {
    if (i % 3 === 0) queries.push(w, w.slice(0, 2), w.slice(0, 4), w.toUpperCase());
    if (i % 5 === 0 && w.length > 3) queries.push(w.slice(0, 1) + w.slice(2));
    if (i % 7 === 0) queries.push(`${w} ${list[(i * 13) % list.length]}`);
  });
  return queries;
}

describe("palette search returns exactly what the pre-round-5 implementation returned", () => {
  const queries = corpus();

  it(`for ${queries.length} queries with Ask enabled`, () => {
    for (const q of queries) expect(searchPalette(entries, q, { ask: true }), q).toEqual(legacy.searchPalette(entries, q, { ask: true }));
  }, 120_000);

  it("with the pods and posts filters and recent rooms", () => {
    const recent = entries.filter((e) => e.target.type === "room").slice(0, 4).map((e) => (e.target as { id: RoomId }).id);
    for (const q of queries.slice(0, 300)) {
      for (const filter of ["pods", "posts", null] as const) {
        expect(searchPalette(entries, q, { filter, recent }), `${filter} ${q}`).toEqual(legacy.searchPalette(entries, q, { filter, recent }));
      }
    }
  }, 120_000);

  it("scores single texts the same", () => {
    const texts = entries.flatMap((e) => [e.title.en, e.title.id, ...e.keywords]).slice(0, 80);
    for (const q of queries.slice(0, 200)) for (const t of texts) expect(fuzzyScore(q, t), `${q} / ${t}`).toBe(legacy.fuzzyScore(q, t));
  }, 120_000);
});
```

Run: `bun run test tests/unit/search-equivalence.test.ts`
Expected: PASS already (both are the same code at this point); it becomes the guard for Step 3. Note the query count printed in the test name.

- [x] **Step 3: Pre-normalize**

In `src/hud/search.ts` replace lines 95-178 (from `const isWordChar` through the end of `scoreEntry`) with:

```ts
const isWordChar = (char: string | undefined) => char !== undefined && /[\p{L}\p{N}]/u.test(char);
const isWordStart = (text: string, i: number) => i === 0 || (isWordChar(text[i]) && !isWordChar(text[i - 1]));

/** A normalized text and its word starts, computed once per palette entry instead of on every keystroke (perf report D 6.8). */
interface Prepared {
  text: string;
  starts: Uint8Array;
}

function prepare(text: string): Prepared {
  const t = normalize(text);
  const starts = new Uint8Array(t.length);
  for (let i = 0; i < t.length; i++) starts[i] = isWordStart(t, i) ? 1 : 0;
  return { text: t, starts };
}

interface PreparedEntry {
  title: Prepared[];
  keywords: Prepared[];
  subtitle: Prepared[];
}

const preparedEntries = new WeakMap<PaletteEntry, PreparedEntry>();

function prepared(entry: PaletteEntry): PreparedEntry {
  let p = preparedEntries.get(entry);
  if (!p) {
    p = { title: texts(entry.title).map(prepare), keywords: entry.keywords.map(prepare), subtitle: texts(entry.subtitle).map(prepare) };
    preparedEntries.set(entry, p);
  }
  return p;
}

/** Best in-order alignment of `query` inside `text`, or 0. Rewards word starts and runs; penalizes gaps. */
function subsequenceScore(query: string, { text, starts }: Prepared): number {
  const m = query.length;
  const n = text.length;
  if (m === 0 || m > n) return 0;
  // No in-order match at all: the alignment below would find none either.
  let k = 0;
  for (let j = 0; j < n && k < m; j++) if (text[j] === query[k]) k += 1;
  if (k < m) return 0;
  const NONE = Number.NEGATIVE_INFINITY;
  // prev[j]: best score with query[0..i-1] matched and query[i-1] at text[j].
  let prev = new Array<number>(n).fill(NONE);
  for (let j = 0; j < n; j++) {
    if (text[j] === query[0]) prev[j] = 1 + (starts[j] ? 2 : 0) - j * 0.05;
  }
  for (let i = 1; i < m; i++) {
    const next = new Array<number>(n).fill(NONE);
    let bestBefore = NONE;
    let bestBeforeAt = -1;
    for (let j = 0; j < n; j++) {
      if (j > 0 && prev[j - 1] !== NONE) {
        // Track the best predecessor adjusted for the gap it would leave before j.
        const candidate = prev[j - 1] + (j - 1) * 0.25;
        if (candidate > bestBefore) {
          bestBefore = candidate;
          bestBeforeAt = j - 1;
        }
      }
      if (text[j] !== query[i]) continue;
      const base = 1 + (starts[j] ? 2 : 0);
      let score = NONE;
      if (j > 0 && prev[j - 1] !== NONE) score = prev[j - 1] + base + 3;
      if (bestBeforeAt >= 0) {
        const gapped = bestBefore - (j - 1) * 0.25 + base - 0.5;
        if (gapped > score) score = gapped;
      }
      next[j] = score;
    }
    prev = next;
  }
  const raw = Math.max(...prev);
  if (raw === NONE || raw <= 0) return 0;
  const max = m * 6;
  return Math.max(1, Math.min(29, (raw / max) * 30));
}

/** `fuzzyScore` for a normalized query and a prepared text. */
function scoreText(q: string, prepared: Prepared): number {
  const t = prepared.text;
  if (!q || !t) return 0;
  if (q === t) return 100;
  const shortness = q.length / t.length;
  if (t.startsWith(q)) return 80 + shortness * 10;
  const firstAt = t.indexOf(q);
  let at = firstAt;
  while (at > 0 && !prepared.starts[at]) at = t.indexOf(q, at + 1);
  if (at > 0) return 60 + shortness * 10 - Math.min(at, 50) * 0.05;
  if (firstAt >= 0) return 40 + shortness * 10 - Math.min(firstAt, 50) * 0.05;
  return subsequenceScore(q, prepared);
}

/**
 * Match quality of one query token against a text. 0 means no match.
 * Tiers: exact 100, prefix 80+, word-start substring 60+, substring 40+, subsequence 1 to 29.
 */
export function fuzzyScore(query: string, text: string): number {
  return scoreText(normalize(query), prepare(text));
}

const texts = (value: LocalizedText | undefined) => (value ? [value.en, value.id] : []);

/** Best weighted field score of one normalized token. */
function tokenScore(entry: PaletteEntry, token: string): number {
  const p = prepared(entry);
  let best = 0;
  for (const text of p.title) best = Math.max(best, scoreText(token, text) * FIELD_WEIGHT.title);
  for (const text of p.keywords) best = Math.max(best, scoreText(token, text) * FIELD_WEIGHT.keywords);
  for (const text of p.subtitle) best = Math.max(best, scoreText(token, text) * FIELD_WEIGHT.subtitle);
  return best;
}

function scoreTokens(entry: PaletteEntry, tokens: readonly string[]): number {
  let total = 0;
  for (const token of tokens) {
    const score = tokenScore(entry, token);
    if (score <= 0) return 0;
    total += score;
  }
  return total > 0 ? total + (entry.roomKind ? (KIND_BONUS[entry.roomKind] ?? 0) : 0) : 0;
}

/** Sum of token scores; 0 unless every token matches some field (AND). */
export function scoreEntry(entry: PaletteEntry, tokens: string[]): number {
  return scoreTokens(entry, tokens.map(normalize));
}
```

In `searchPalette` (the `scored` block, lines 239-242) normalize the tokens once:

```ts
  const normalized = tokens.map(normalize);
  const scored = pool
    .map((entry, order) => ({ entry, order, score: scoreTokens(entry, normalized) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order);
```

(`texts` moves above `tokenScore` but stays after `prepared`; it is only called at search time, after the module initialized.)

- [x] **Step 4: Run the search tests**

Run: `bun run test tests/unit/search-equivalence.test.ts tests/unit/search.test.ts tests/hud/CommandPalette.test.tsx`
Expected: PASS.

- [x] **Step 5: Bench typing**

Create `tests/bench/search.bench.ts`:

```ts
import { bench, describe } from "vitest";
import { getContent } from "@/content/load";
import { buildHudIndex } from "@/hud/index-data";
import { buildPaletteEntries, searchPalette } from "@/hud/search";
import * as legacy from "../helpers/search-legacy";

/** Perf report SP11: one search per keystroke while typing a three-word query. Pass: current at most 4 ms per key (16 ms at 4x CPU). */
const entries = buildPaletteEntries(buildHudIndex(getContent()), ["view-cv", "copy-email", "toggle-language", "quick-view"]);
const typed = "voice ai contact center";
const keys = Array.from({ length: typed.length }, (_, i) => typed.slice(0, i + 1));

describe(`palette: typing "${typed}" (${keys.length} searches per iteration)`, () => {
  bench("current", () => {
    for (const q of keys) searchPalette(entries, q, { ask: true });
  });
  bench("legacy", () => {
    for (const q of keys) legacy.searchPalette(entries, q, { ask: true });
  });
});
```

Run: `bun run bench tests/bench/search.bench.ts`
Expected: `current` faster than `legacy`; `current` mean divided by 23 keys at most 4 ms. Paste the table into the PR.

- [x] **Step 6: Document**

In `docs/superpowers/specs/agent-hq/02-interaction-and-states.md` section 5, append to the Search bullet: "Entry texts are normalized once per index; a keystroke normalizes only the query (budget: p95 under 16 ms per keystroke at 4x CPU, `tests/bench/search.bench.ts`)."

- [x] **Step 7: Verify and commit**

Run: `bun run typecheck && bun run lint && bun run test && bun run build && E2E_PORT=4432 bunx playwright test e2e/missions.spec.ts e2e/ask.spec.ts`
Expected: PASS.

```bash
rtk git add src/hud/search.ts tests/helpers/search-legacy.ts tests/unit/search-equivalence.test.ts tests/bench/search.bench.ts docs/superpowers/specs/agent-hq/02-interaction-and-states.md
rtk git commit -m "perf: normalize palette entries once instead of on every keystroke"
```

---
### Task 7: Store and `localStorage` writes only on change (D 6.2, spec gaps 5, G1, G2)

Today the store is set 10 times a second while the rover is parked (`Director.tsx:408-420`, no change check), every frame during an elevator ride (`setRide`, `:305`) and an L2 beam (`setBeam`, `:253`), and zustand 5.0.15 `persist` serializes and writes `localStorage` on every one of those sets (`api.setState` calls `setItem`). Each set also runs ~81 selector hooks and ~8 vanilla listeners. Fix, keeping the runtime-object architecture: `setRover` ignores a patch within 1e-4 of the mirror; the ride's and the beam's per-frame `t` moves to a motion clock (`tower/rideClock.ts`, keyed by the store object it belongs to) and the store changes only when a stage starts, the rover jumps or the motion ends; `persist` gets a storage wrapper that writes only when `visited`, `firstVisit` or `locale` (or the version) changed.

No pixels change (the car, doors and beam read the same progress through `rideNow`/`beamNow`). The elevator and beam e2e specs cover the motion.

**Files:**
- Create: `src/store/persist-storage.ts`
- Create: `src/experience/tower/rideClock.ts`
- Create: `tests/unit/persist-storage.test.ts`
- Create: `tests/unit/ride-clock.test.ts`
- Modify: `src/store/useHQStore.ts:1-3,202,231-233`
- Modify: `tests/unit/store.test.ts` (two tests)
- Modify: `src/experience/scene/Director.tsx:26,245-254,269-306`
- Modify: `src/experience/tower/ElevatorShaft.tsx:13,39,59`
- Modify: `src/experience/fx/TeleportBeam.tsx:35` (+ import)
- Modify: `src/experience/Experience.tsx` (`__hq.motion`)
- Modify: `e2e/lifecycle.spec.ts` (store probes)
- Modify: `scripts/e2e-plan.ts` (`src/store/` rule)
- Modify: `AGENTS.md`, `docs/superpowers/specs/agent-hq/06-data-contracts.md` (section 2)

**Interfaces:**
- Consumes: `advanceRide`, `Ride` (`tower/elevator.ts`), `advanceBeam`, `startBeam`, `Beam` (`nav/teleport.ts`), `PersistStorage`, `StorageValue` (`zustand/middleware`).
- Produces: `skipUnchanged<S extends object>(inner: PersistStorage<S> | undefined): PersistStorage<S> | undefined`; `rideNow(stored: Ride): Ride`, `keepRide(stored: Ride, next: Ride): void`, `clearRide(): void`, `beamNow(stored: Beam): Beam`, `keepBeam(stored: Beam, next: Beam): void`, `clearBeam(): void`; `sameRover(current: RoverState, patch: Partial<RoverState>): boolean` and `POSE_EPSILON = 1e-4` exported from `useHQStore.ts`; `window.__hq.motion(): { ride: Ride | null; beam: Beam | null }` (live progress for tests, P6's throttled ride e2e and P4's overlay). `store.ride.t` and `store.beam.t` now hold the value at the last stage change, not live progress.

- [x] **Step 1: Write the failing storage and store tests**

Create `tests/unit/persist-storage.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createJSONStorage } from "zustand/middleware";
import { skipUnchanged } from "@/store/persist-storage";

function memory() {
  const data = new Map<string, string>();
  const counter = { writes: 0 };
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      counter.writes += 1;
      data.set(key, value);
    },
    removeItem: (key: string) => void data.delete(key),
  };
  return { data, counter, storage };
}

describe("skipUnchanged", () => {
  it("writes only when a persisted key (shallow) or the version changed", () => {
    const m = memory();
    const s = skipUnchanged(createJSONStorage<{ visited: string[]; locale: string }>(() => m.storage))!;
    const visited = ["L3:a"];
    s.setItem("k", { state: { visited, locale: "en" }, version: 1 });
    s.setItem("k", { state: { visited, locale: "en" }, version: 1 });
    expect(m.counter.writes).toBe(1);
    s.setItem("k", { state: { visited: [...visited, "L3:b"], locale: "en" }, version: 1 });
    expect(m.counter.writes).toBe(2);
    s.setItem("k", { state: { visited, locale: "id" }, version: 1 });
    s.setItem("k", { state: { visited, locale: "id" }, version: 2 });
    expect(m.counter.writes).toBe(4);
    expect(JSON.parse(m.data.get("k")!)).toEqual({ state: { visited: ["L3:a"], locale: "id" }, version: 2 });
  });

  it("treats what it read as written, so hydration does not write the same value back", () => {
    const m = memory();
    m.data.set("k", JSON.stringify({ state: { locale: "en" }, version: 1 }));
    const s = skipUnchanged(createJSONStorage<{ locale: string }>(() => m.storage))!;
    const read = s.getItem("k") as { state: { locale: string }; version: number };
    s.setItem("k", { state: { locale: read.state.locale }, version: 1 });
    expect(m.counter.writes).toBe(0);
  });

  it("writes again after removeItem, and passes an unavailable storage through", () => {
    const m = memory();
    const s = skipUnchanged(createJSONStorage<{ locale: string }>(() => m.storage))!;
    s.setItem("k", { state: { locale: "en" }, version: 1 });
    s.removeItem("k");
    s.setItem("k", { state: { locale: "en" }, version: 1 });
    expect(m.counter.writes).toBe(2);
    expect(skipUnchanged(undefined)).toBeUndefined();
  });
});
```

Append to `tests/unit/store.test.ts` inside `describe("HQ store", ...)` (the file already has `memoryStorage`, `storage`, `store`; add `import type { RoomId } from "@/content/schema";` if it is not imported yet):

```ts
  it("ignores a rover patch that matches the mirror (the 10 Hz sync while parked)", () => {
    let sets = 0;
    store.subscribe(() => (sets += 1));
    const { x, z, heading } = store.getState().rover;
    store.getState().setRover({ x, z, heading, speed: 0, face: "idle", status: undefined });
    store.getState().setRover({ x: x + 5e-5 });
    expect(sets).toBe(0);
    store.getState().setRover({ x: x + 0.01 });
    store.getState().setRover({ status: "to L2" });
    expect(sets).toBe(2);
  });

  it("writes localStorage only when visited, firstVisit or locale change", () => {
    const counted = memoryStorage();
    let writes = 0;
    const write = counted.setItem;
    counted.setItem = (key, value) => {
      writes += 1;
      return write(key, value);
    };
    const st = createHQStore(counted);
    st.getState().setPhase("explore");
    const base = writes;
    for (let i = 1; i <= 20; i++) st.getState().setRover({ x: i });
    st.getState().setDevice({ coarse: true });
    st.getState().setHover(null);
    expect(writes).toBe(base);
    st.getState().markVisited("L3:a" as RoomId);
    st.getState().setLocale("id");
    expect(writes).toBe(base + 2);
    expect(JSON.parse(counted.data.get(STORE_KEY)!).state).toEqual({ visited: ["L3:a"], firstVisit: true, locale: "id" });
  });
```

Run: `bun run test tests/unit/persist-storage.test.ts tests/unit/store.test.ts`
Expected: FAIL: `@/store/persist-storage` cannot be resolved; in the store test `sets` is 2 instead of 0 and `writes` is base + 22 instead of base.

- [x] **Step 2: Implement the storage wrapper and the rover check**

Create `src/store/persist-storage.ts`:

```ts
import type { PersistStorage, StorageValue } from "zustand/middleware";

/**
 * zustand 5 `persist` writes on every `set`, whatever changed (`api.setState` calls `setItem`), so
 * per-frame and 10 Hz store updates would serialize and write localStorage each time. This wrapper
 * writes only when a persisted key (shallow, `Object.is`) or the version changed since the last read
 * or write (perf report D 6.2).
 */
export function skipUnchanged<S extends object>(inner: PersistStorage<S> | undefined): PersistStorage<S> | undefined {
  if (!inner) return inner;
  const last = new Map<string, StorageValue<S>>();
  const same = (a: StorageValue<S>, b: StorageValue<S>) => {
    if (a.version !== b.version) return false;
    const keys = Object.keys(a.state) as (keyof S)[];
    return keys.length === Object.keys(b.state).length && keys.every((key) => Object.is(a.state[key], b.state[key]));
  };
  const remember = (name: string, value: StorageValue<S> | null) => {
    if (value) last.set(name, value);
    else last.delete(name);
    return value;
  };
  return {
    getItem: (name) => {
      const value = inner.getItem(name);
      return value instanceof Promise ? value.then((v) => remember(name, v)) : remember(name, value);
    },
    setItem: (name, value) => {
      const previous = last.get(name);
      if (previous && same(previous, value)) return undefined;
      last.set(name, value);
      return inner.setItem(name, value);
    },
    removeItem: (name) => {
      last.delete(name);
      return inner.removeItem(name);
    },
  };
}
```

In `src/store/useHQStore.ts`:

Add after line 3:

```ts
import { skipUnchanged } from "./persist-storage";
```

Add after `export const STORE_KEY = "hq:v1";`:

```ts
/** Keys the store persists (appendix 06 section 2); `sound` is persisted by the audio engine. */
type Persisted = Pick<HQState, "visited" | "firstVisit" | "locale">;

/** Mirror tolerance for rover numbers (world units, radians, u/s): far below anything a reader shows. */
export const POSE_EPSILON = 1e-4;

/** True when `patch` would not change the mirrored rover (the Director's 10 Hz sync while it is parked). */
export function sameRover(current: RoverState, patch: Partial<RoverState>): boolean {
  for (const key of Object.keys(patch) as (keyof RoverState)[]) {
    const a = current[key];
    const b = patch[key];
    if (typeof a === "number" && typeof b === "number" ? Math.abs(a - b) > POSE_EPSILON : a !== b) return false;
  }
  return true;
}
```

Replace line 202:

```ts
        setRover: (rover) => {
          const current = get().rover;
          if (!sameRover(current, rover)) set({ rover: { ...current, ...rover } });
        },
```

Replace lines 231-233:

```ts
        storage: skipUnchanged(createJSONStorage<Persisted>(() => storage ?? localStorage)),
        // `sound` is owned and persisted by the audio engine (localStorage "hq:sound"); the store mirrors it.
        partialize: ({ visited, firstVisit, locale }): Persisted => ({ visited, firstVisit, locale }),
```

Run: `bun run test tests/unit/persist-storage.test.ts tests/unit/store.test.ts`
Expected: PASS.

- [x] **Step 3: Write the failing ride clock test**

Create `tests/unit/ride-clock.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { advanceBeam, startBeam, type Beam } from "@/experience/nav/teleport";
import { advanceRide, type Ride } from "@/experience/tower/elevator";
import { beamNow, clearBeam, clearRide, keepBeam, keepRide, rideNow } from "@/experience/tower/rideClock";

const DT = 1 / 60;

beforeEach(() => {
  clearRide();
  clearBeam();
});

describe("ride clock", () => {
  it("drives a whole ride with one store write per stage and the same progress as per-frame writes", () => {
    let stored: Ride | null = { from: "L1", to: "L2", stage: "toDoor", t: 0 };
    let perFrame: Ride | null = stored;
    let writes = 0;
    for (let frame = 0; frame < 600 && stored; frame++) {
      const atDoor = frame > 2;
      const ride = rideNow(stored);
      expect(ride).toEqual(perFrame);
      const next = advanceRide(ride, DT, { atDoor, reduced: false });
      perFrame = perFrame && advanceRide(perFrame, DT, { atDoor, reduced: false });
      if (next && next.stage === ride.stage) keepRide(stored, next);
      else {
        clearRide();
        stored = next;
        writes += 1;
      }
    }
    expect(stored).toBeNull();
    expect(writes).toBe(6);
  });

  it("starts a new store object (retarget, cancel, a new ride) from its own t", () => {
    const stored: Ride = { from: "L1", to: "L2", stage: "moving", t: 0 };
    keepRide(stored, { ...stored, t: 0.4 });
    expect(rideNow(stored).t).toBe(0.4);
    const retargeted: Ride = { ...stored, to: "L3" };
    expect(rideNow(retargeted)).toBe(retargeted);
    clearRide();
    expect(rideNow(stored)).toBe(stored);
  });
});

describe("beam clock", () => {
  it("writes the store when the rover jumps and when the beam ends", () => {
    let stored: Beam | null = startBeam({ x: 0, z: 0 }, { id: "teleport:2021", kind: "teleport", at: { x: 40, z: 6 }, year: 2021, face: 0 });
    let writes = 0;
    let jumps = 0;
    for (let frame = 0; frame < 120 && stored; frame++) {
      const beam = beamNow(stored);
      const step = advanceBeam(beam, DT, false);
      if (step.jump) jumps += 1;
      if (step.beam && !step.jump) keepBeam(stored, step.beam);
      else {
        clearBeam();
        stored = step.beam;
        writes += 1;
      }
    }
    expect(stored).toBeNull();
    expect(jumps).toBe(1);
    expect(writes).toBe(2);
  });
});
```

Run: `bun run test tests/unit/ride-clock.test.ts`
Expected: FAIL, `Failed to resolve import "@/experience/tower/rideClock"`.

- [x] **Step 4: Implement the clock and switch the readers**

Create `src/experience/tower/rideClock.ts`:

```ts
import type { Beam } from "../nav/teleport";
import type { Ride } from "./elevator";

/**
 * Live progress of the elevator ride and the L2 teleport beam (perf report D 6.2). The store holds
 * the ride and the beam and changes only when a stage starts, the rover jumps or the motion ends; the
 * Director keeps the per-frame `t` here, keyed by the store object it belongs to, so a retarget, a
 * cancel or a new ride (a new store object) starts from that object's own `t`. Per-frame readers use
 * `rideNow` / `beamNow`; React and the store keep seeing stage changes only. Pure.
 */
const clock = {
  rideOf: null as Ride | null,
  ride: null as Ride | null,
  beamOf: null as Beam | null,
  beam: null as Beam | null,
};

export function rideNow(stored: Ride): Ride {
  return clock.rideOf === stored && clock.ride ? clock.ride : stored;
}

export function keepRide(stored: Ride, next: Ride): void {
  clock.rideOf = stored;
  clock.ride = next;
}

export function clearRide(): void {
  clock.rideOf = null;
  clock.ride = null;
}

export function beamNow(stored: Beam): Beam {
  return clock.beamOf === stored && clock.beam ? clock.beam : stored;
}

export function keepBeam(stored: Beam, next: Beam): void {
  clock.beamOf = stored;
  clock.beam = next;
}

export function clearBeam(): void {
  clock.beamOf = null;
  clock.beam = null;
}
```

Run: `bun run test tests/unit/ride-clock.test.ts`
Expected: PASS (3 tests).

In `src/experience/scene/Director.tsx`, add after line 26:

```ts
import { beamNow, clearBeam, clearRide, keepBeam, keepRide, rideNow } from "../tower/rideClock";
```

Replace the beam block (lines 247-254):

```ts
    if (s.beam) {
      const beam = beamNow(s.beam);
      const step = advanceBeam(beam, dt, s.reducedMotion);
      if (step.jump) {
        controller.teleport(beam.to, beam.heading);
        roverRuntime.cameraSnap = true;
      }
      // Progress stays in the motion clock; the store changes when the rover jumps and when the beam ends.
      if (step.beam && !step.jump) keepBeam(s.beam, step.beam);
      else {
        clearBeam();
        s.setBeam(step.beam);
      }
    }
```

Replace lines 270-271:

```ts
    const stored = s.ride;
    const ride = stored ? rideNow(stored) : null;
    if (ride && stored) {
```

Replace lines 303-306:

```ts
      if (store.getState().ride) {
        const next = advanceRide(ride, dt, { atDoor, reduced: s.reducedMotion });
        // Progress within a stage stays in the motion clock; the store changes when a stage starts or the ride ends.
        if (next && next.stage === ride.stage) keepRide(stored, next);
        else if (next) {
          clearRide();
          s.setRide(next);
        } else {
          clearRide();
```

(the rest of the `else` branch, from `controller.teleport(to.approach, Math.PI / 2);` to `y = floorY(ride.to);` and its closing braces, is unchanged).

In `src/experience/tower/ElevatorShaft.tsx` add `import { rideNow } from "./rideClock";` after line 13, then line 39:

```ts
    if (ref.current) ref.current.position.y = s.ride ? carY(rideNow(s.ride), s.reducedMotion) : floorY(s.floor);
```

and line 59:

```ts
    const open = doorsOpen(s.ride ? rideNow(s.ride) : null, floor, s.reducedMotion);
```

In `src/experience/fx/TeleportBeam.tsx` add `import { beamNow } from "../tower/rideClock";` with the other relative imports, then line 35:

```ts
    const glow = beamGlow(s.beam ? beamNow(s.beam) : null, s.reducedMotion);
```

In `src/experience/Experience.tsx` add `import { beamNow, rideNow } from "./tower/rideClock";` and extend `__hq`:

```ts
    frames: () => framePacer.frames,
    motion: () => {
      const s = store.getState();
      return { ride: s.ride ? rideNow(s.ride) : null, beam: s.beam ? beamNow(s.beam) : null };
    },
```

- [x] **Step 5: Write the store-write e2e probes**

Append to `e2e/lifecycle.spec.ts` (add `waitForCameraSettle` to the `./hq` import):

```ts
/** Counts writes of the persisted store key (works on any build). */
async function countPersistWrites(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __persistWrites: number };
    w.__persistWrites = 0;
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (this: Storage, key: string, value: string) {
      if (key === "hq:v1") w.__persistWrites += 1;
      return setItem.call(this, key, value);
    };
  });
}

type StoreWindow = Window & {
  __persistWrites: number;
  __hq: {
    store: {
      subscribe: (listener: (s: { ride: { stage: string } | null }) => void) => () => void;
      getState: () => { goToFloor: (floor: string) => void };
    };
  };
};

test.describe("store writes", () => {
  test("a parked rover writes neither the store nor localStorage", async ({ page }) => {
    await countPersistWrites(page);
    await enterHQ(page);
    await waitForCameraSettle(page);
    const result = await page.evaluate(
      () =>
        new Promise<{ sets: number; writes: number }>((resolve) => {
          const w = window as unknown as StoreWindow;
          let sets = 0;
          const off = w.__hq.store.subscribe(() => {
            sets += 1;
          });
          const writes = w.__persistWrites;
          setTimeout(() => {
            off();
            resolve({ sets, writes: w.__persistWrites - writes });
          }, 3000);
        }),
    );
    test.info().annotations.push({ type: "measure", description: `parked 3 s: ${result.sets} store sets, ${result.writes} hq:v1 writes` });
    expect(result.writes).toBe(0);
    expect(result.sets).toBeLessThanOrEqual(2);
  });

  test("an elevator ride writes the store per stage, not per frame", async ({ page }) => {
    // The rover first drives to the shaft on SwiftShader.
    test.setTimeout(120_000);
    await countPersistWrites(page);
    await enterHQ(page);
    const result = await page.evaluate(
      () =>
        new Promise<{ sets: number; writes: number }>((resolve) => {
          const w = window as unknown as StoreWindow;
          let sets = 0;
          let riding = false;
          let writes = 0;
          const off = w.__hq.store.subscribe((s) => {
            if (s.ride && s.ride.stage !== "toDoor" && !riding) {
              riding = true;
              writes = w.__persistWrites;
            }
            if (riding) sets += 1;
            if (riding && !s.ride) {
              off();
              resolve({ sets, writes: w.__persistWrites - writes });
            }
          });
          w.__hq.store.getState().goToFloor("L2");
        }),
    );
    test.info().annotations.push({ type: "measure", description: `one L1 to L2 ride from boarding to arrival: ${result.sets} store sets, ${result.writes} hq:v1 writes` });
    expect(result.sets).toBeLessThanOrEqual(30);
    expect(result.writes).toBe(0);
  });
});
```

- [x] **Step 6: Record "before" on main, then verify on the branch**

Run the probes against main's build first (they fail there and print the before numbers):

```bash
bun scripts/serve-static.ts --port 4432 --dir ../hq-r5-p3-base/out
```

```bash
E2E_PORT=4432 bunx playwright test e2e/lifecycle.spec.ts -g "store writes"
```

Expected on main: both FAIL; the `measure` annotations read about 30 store sets and 30 writes for 3 parked seconds, and 60 or more sets for one ride (SwiftShader frame rate dependent). Record them. Stop the base server, then:

Run: `bun run typecheck && bun run lint && bun run test && bun run build && E2E_PORT=4432 bunx playwright test e2e/lifecycle.spec.ts e2e/pads.spec.ts e2e/experience.spec.ts e2e/career.spec.ts e2e/missions.spec.ts`
Expected: PASS; the annotations read 0 to 2 parked sets with 0 writes, and about 15 to 25 ride sets with 0 writes. Record them.

- [x] **Step 7: Map the store path and document**

In `scripts/e2e-plan.ts` change the store rule:

```ts
  { test: /^src\/store\//, specs: ["experience", "lifecycle"] },
```

In `AGENTS.md` "3D experience", replace the sentence "Per-frame pose lives in `rover/runtime.ts` (mutated in `useFrame`, never read in render)." in the Data flow bullet with:

```markdown
Per-frame pose lives in `rover/runtime.ts` (mutated in `useFrame`, never read in render). Store writes (round 5): per-frame state lives in runtime objects and the store changes only on a real change: `setRover` ignores a patch within `POSE_EPSILON` of the mirror, the ride and the beam are written when a stage starts, the rover jumps or the motion ends (live progress: `rideNow`/`beamNow` from `tower/rideClock.ts`, `__hq.motion()` in tests; `store.ride.t` is the stage start), and `persist` writes `localStorage` only when `visited`, `firstVisit` or `locale` change (`skipUnchanged`, `src/store/persist-storage.ts`).
```

and in the `window.__hq` bullet change `interact, memory }` to `interact, memory, frames, motion }`.

In `docs/superpowers/specs/agent-hq/06-data-contracts.md` section 2, after the "Actions:" paragraph add:

```markdown
Update rate (round 5): per-frame state (rover pose, ride and beam progress) lives in runtime objects mutated in `useFrame`; the store mirrors the rover at most every 100 ms and only when a value changed (tolerance 1e-4), and stores the ride and the beam only when a stage starts or ends. `persist` writes `localStorage` only when a persisted key changed; `sound` is persisted by the audio engine (`localStorage["hq:sound"]`), not by the store.
```

- [x] **Step 8: Commit**

```bash
rtk git add src/store/persist-storage.ts src/store/useHQStore.ts src/experience/tower/rideClock.ts src/experience/scene/Director.tsx src/experience/tower/ElevatorShaft.tsx src/experience/fx/TeleportBeam.tsx src/experience/Experience.tsx tests/unit/persist-storage.test.ts tests/unit/ride-clock.test.ts tests/unit/store.test.ts e2e/lifecycle.spec.ts scripts/e2e-plan.ts AGENTS.md docs/superpowers/specs/agent-hq/06-data-contracts.md
rtk git commit -m "perf: write the store and localStorage on change only, keep ride and beam progress in a runtime clock"
```

---

### Task 8: No `backdrop-filter` under near-opaque panels and hidden scrims (D 9.1-9.3, SP7)

`backdrop-filter` over a live canvas is recomputed every frame. `.glass-solid` panels (every HUD panel over the world) are 94% opaque on fine pointers and keep `blur(18px)`; the Rover Terminal (95% opaque) blurs on phones too, through a Tailwind utility the coarse rule does not reach; the lightbox is 95% opaque; the palette scrim and the modal scrim blur the whole viewport on phones even where a full-screen opaque panel hides them. Remove exactly those, gated by the visual gate:

| Element | Fill | Change |
|---|---|---|
| `.glass-solid` (HUD panels, drawer, palette panel, hologram cards) | 94% (fine), 100% (coarse) | `backdrop-filter: none` |
| Rover Terminal panel | 95% | drop `backdrop-blur-[18px]` |
| Lightbox | 95% | drop `backdrop-blur-sm` |
| Palette scrim | 70%, hidden by the full-screen panel below 640 px | `sm:backdrop-blur-sm` (blur only where the panel is a centered modal) |
| Modal scrim | 80%, hidden by the full-screen panel below 640 px unless `sheet` | `sm:backdrop-blur-sm` when not a sheet; sheets keep `backdrop-blur-sm` |

`.glass` (64% fill) keeps its blur on fine pointers, where it is visible.

Rollback: revert this commit (CSS and class names only).

**Files:**
- Modify: `src/app/globals.css:135-137`
- Modify: `src/hud/RoverTerminal.tsx:230`
- Modify: `src/components/Lightbox.tsx:114`
- Modify: `src/hud/CommandPalette.tsx:146`
- Modify: `src/components/Modal.tsx:76`
- Modify: `AGENTS.md` (Styling), `docs/superpowers/specs/agent-hq/05-visual-audio-tokens.md` (section 1)

**Interfaces:**
- Consumes: the visual gate from Task 1 (`pattern-*` captures).
- Produces: the blur policy: no `backdrop-filter` under a panel at least 94% opaque, none on a scrim hidden behind a full-screen panel, none on coarse pointers.

- [x] **Step 1: Write the failing CSS assertion**

Append to `e2e/lifecycle.spec.ts`:

```ts
test.describe("no backdrop blur under near-opaque panels", () => {
  test("desktop: the drawer does not blur the canvas", async ({ page }) => {
    await openPodRoute(page);
    const drawer = page.getByTestId("room-drawer");
    await expect(drawer).toBeVisible({ timeout: 90_000 });
    expect(await drawer.evaluate((el) => getComputedStyle(el).backdropFilter)).toBe("none");
  });

  test("desktop: the Rover Terminal does not blur the canvas", async ({ page }) => {
    await enterHQ(page);
    await openHud(page, "terminal");
    const terminal = page.getByRole("dialog").last();
    await expect(terminal).toBeVisible();
    expect(await terminal.evaluate((el) => getComputedStyle(el).backdropFilter)).toBe("none");
  });

  test("phone: the full-screen palette's scrim does not blur", async ({ browser }) => {
    const { context, page } = await phonePage(browser);
    await enterHQ(page);
    await openHud(page, "palette");
    await expect(page.getByRole("dialog")).toBeVisible();
    const scrim = page.locator("[aria-hidden='true'].bg-void\\/70");
    expect(await scrim.evaluate((el) => getComputedStyle(el).backdropFilter)).toBe("none");
    await context.close();
  });
});
```

Run: `bun run build && E2E_PORT=4432 bunx playwright test e2e/lifecycle.spec.ts -g "backdrop"`
Expected: the three tests FAIL with a `blur(...)` value instead of `"none"` (18 px for the drawer and the terminal, 4 px for the scrim).

- [x] **Step 2: Remove the blurs**

`src/app/globals.css`, replace the `.glass-solid` block (lines 135-137):

```css
  .glass-solid {
    background: rgb(10 10 18 / 0.94);
    /* 94% opaque: blurring the live canvas behind it costs GPU every frame for 6% show-through (perf report 9.1). */
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
```

`src/hud/RoverTerminal.tsx` line 230: delete ` backdrop-blur-[18px]` from the default class string (the rest of the string is unchanged):

```tsx
          "w-full rounded-t-2xl border border-terminal-fg/40 bg-terminal-bg/95 pb-[env(safe-area-inset-bottom)] font-mono text-[13px] leading-5 text-terminal-fg shadow-[0_12px_40px_rgb(0_0_0/0.45),0_0_32px_rgb(52_211_153/0.18),inset_0_1px_0_rgb(255_255_255/0.05)] sm:w-[360px] sm:rounded-2xl sm:pb-0"
```

`src/components/Lightbox.tsx` line 114:

```tsx
      className="fixed inset-0 z-[60] flex flex-col bg-void/95 text-ink"
```

`src/hud/CommandPalette.tsx` line 146:

```tsx
      <div aria-hidden="true" className="absolute inset-0 bg-void/70 sm:backdrop-blur-sm" onClick={onClose} />
```

`src/components/Modal.tsx` line 76:

```tsx
      <div aria-hidden="true" className={`absolute inset-0 bg-void/80 ${sheet ? "backdrop-blur-sm" : "sm:backdrop-blur-sm"}`} onClick={() => close.current()} />
```

- [x] **Step 3: Run the assertions and the HUD specs**

Run: `bun run build && E2E_PORT=4432 bunx playwright test e2e/lifecycle.spec.ts e2e/drawer-solid.spec.ts e2e/hud.spec.ts e2e/gallery.spec.ts e2e/pageview.spec.ts`
Expected: PASS (`drawer-solid` checks the drawer fill, which is unchanged).

- [x] **Step 4: Run the visual gate**

Run:

```bash
VISUAL_GATE=.visual/head E2E_PORT=4432 bunx playwright test e2e/visual-gate.spec.ts --workers=1
bun scripts/shot-diff.ts --base .visual/base-a --base2 .visual/base-b --head .visual/head
```

Expected: every row `pass`; the `pattern-desktop-drawer`, `pattern-desktop-palette`, `pattern-desktop-terminal`, `pattern-desktop-lightbox` and `pattern-wide-drawer` rows show the blur removal as a small non-zero diff under 1.00% (the 5 to 6% show-through changes by less than 8/255 per channel). If one of those rows fails, restore the blur for that element only (put its utility back), rerun, and list it in the PR as kept.

- [x] **Step 5: Document**

In `AGENTS.md` "Styling", replace the `.glass-solid` bullet's first sentence with: "`.glass-solid` (add next to `.glass`) makes a panel near-opaque (`rgb(10 10 18 / .94)`, solid on coarse pointers) while keeping the glass edge, and drops the backdrop blur." and add a bullet:

```markdown
- Blur policy (round 5): no `backdrop-filter` under a panel that is at least 94% opaque (`.glass-solid`, the Rover Terminal, the lightbox), none on a scrim that a full-screen panel hides (the palette and non-sheet modals below 640 px use `sm:backdrop-blur-sm`), none on coarse pointers. `.glass` (64% fill) keeps its 18 px blur on fine pointers. Verify blur changes with the visual gate (`pattern-*` captures).
```

In `docs/superpowers/specs/agent-hq/05-visual-audio-tokens.md` section 1, after "All HUD text must meet WCAG AA contrast against `glass.bg`." add:

```markdown
Blur: translucent `.glass` panels (64% fill) blur the canvas behind them on fine pointers only. Panels at least 94% opaque (`.glass-solid`, the terminal, the lightbox) and scrims hidden behind full-screen phone panels use no `backdrop-filter`, because a blur over the live canvas is recomputed every frame.
```

- [x] **Step 6: Commit**

```bash
rtk git add src/app/globals.css src/hud/RoverTerminal.tsx src/components/Lightbox.tsx src/hud/CommandPalette.tsx src/components/Modal.tsx e2e/lifecycle.spec.ts AGENTS.md docs/superpowers/specs/agent-hq/05-visual-audio-tokens.md
rtk git commit -m "perf: drop backdrop blur under near-opaque HUD panels and hidden phone scrims"
```

---
### Task 9: WebGL crash recovery: one remount, then "Retry 3D" (C F7.5, D 8.7, main 4.6)

Today `webglcontextlost` sets the tier to static for the rest of the visit (`Experience.tsx:348-354`): an iOS tab switch that reclaims GPU memory strands the visitor on the HTML page, and a `WebGLRenderer` that cannot be created throws with no error boundary. New behaviour: an error boundary around the R3F canvas (R3F rethrows creation and render errors into its parent) and the context-loss listener both report a crash to the gate; the gate remounts the 3D view once on a fresh canvas (after the tab is visible again), and a second failure shows the static notice with a "Retry 3D" button. A manual retry that fails goes straight back to the notice, so nothing can loop.

Pixel impact: the static notice gains a button (new UI, shown only after a failure); nothing else changes. The test attaches a screenshot of the notice for the PR. Rollback: revert this commit (context loss goes back to static at once).

**Files:**
- Create: `src/experience/recovery.ts`
- Create: `src/experience/CanvasBoundary.tsx`
- Create: `tests/unit/recovery.test.ts`
- Create: `tests/hud/CanvasBoundary.test.tsx`
- Modify: `src/store/useHQStore.ts` (`recover` action)
- Modify: `tests/unit/store.test.ts` (one test)
- Modify: `src/experience/Experience.tsx:122-129,340-364` (`onCrash`, boundary)
- Modify: `src/experience/ExperienceGate.tsx:1-111`
- Modify: `messages/en.json`, `messages/id.json` (`hud.retry3d`)
- Modify: `e2e/experience.spec.ts:441-451`
- Modify: `e2e/lifecycle.spec.ts` (creation failure)
- Modify: `scripts/e2e-plan.ts` (ExperienceGate rule)
- Modify: `AGENTS.md`, `docs/superpowers/specs/2026-10-09-agent-hq-design.md` (4.6), `docs/superpowers/specs/agent-hq/08-quality-acceptance.md` (section 1)

**Interfaces:**
- Consumes: `GpuTier`, `useGateTier()`, `releaseBootCover`, the `lost` derivation in the gate.
- Produces: `type RecoveryStatus = "ok" | "retrying" | "failed"`, `interface Recovery { failures: number; status: RecoveryStatus }`, `AUTO_RETRIES = 1`, `RECOVERY_START`, `afterFailure(r): Recovery`, `manualRetry(r): Recovery`, `settled(r): Recovery`, `interface VisibilitySource`, `whenVisible(run: () => void, doc?: VisibilitySource): () => void` (`recovery.ts`); `CanvasBoundary` (`{ onError: () => void; children: ReactNode }`); store action `recover(tier: GpuTier): void`; `Experience` prop `onCrash: () => void`; message key `hud.retry3d`; test id `retry-3d`.

- [x] **Step 1: Write the failing unit tests**

Create `tests/unit/recovery.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { afterFailure, AUTO_RETRIES, manualRetry, RECOVERY_START, settled, whenVisible, type Recovery } from "@/experience/recovery";

function fakeDocument(hidden: boolean) {
  const listeners = new Set<() => void>();
  return {
    hidden,
    addEventListener: (_type: "visibilitychange", listener: () => void) => void listeners.add(listener),
    removeEventListener: (_type: "visibilitychange", listener: () => void) => void listeners.delete(listener),
    fire: () => {
      for (const listener of [...listeners]) listener();
    },
    listeners,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("recovery", () => {
  it("remounts once automatically, then fails to the static page", () => {
    expect(AUTO_RETRIES).toBe(1);
    const first = afterFailure(RECOVERY_START);
    expect(first).toEqual({ failures: 1, status: "retrying" });
    const running = settled(first);
    expect(running).toEqual({ failures: 1, status: "ok" });
    expect(afterFailure(running)).toEqual({ failures: 2, status: "failed" });
  });

  it("counts one crash once while a retry or the static page is already showing", () => {
    const retrying = afterFailure(RECOVERY_START);
    expect(afterFailure(retrying)).toBe(retrying);
    const failed = afterFailure(settled(retrying));
    expect(afterFailure(failed)).toBe(failed);
  });

  it("a manual retry that fails again goes straight back to the static page", () => {
    const failed: Recovery = { failures: 2, status: "failed" };
    const retry = manualRetry(failed);
    expect(retry.status).toBe("retrying");
    expect(afterFailure(settled(retry)).status).toBe("failed");
    expect(afterFailure(settled(manualRetry(RECOVERY_START))).status).toBe("failed");
  });
});

describe("whenVisible", () => {
  it("runs on the next task when the tab is visible and can be cancelled", () => {
    vi.useFakeTimers();
    const doc = fakeDocument(false);
    const run = vi.fn();
    whenVisible(run, doc);
    expect(run).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(run).toHaveBeenCalledTimes(1);
    const later = vi.fn();
    whenVisible(later, doc)();
    vi.runAllTimers();
    expect(later).not.toHaveBeenCalled();
  });

  it("waits until the tab is visible again", () => {
    vi.useFakeTimers();
    const doc = fakeDocument(true);
    const run = vi.fn();
    whenVisible(run, doc);
    vi.runAllTimers();
    expect(run).not.toHaveBeenCalled();
    doc.fire();
    vi.runAllTimers();
    expect(run).not.toHaveBeenCalled();
    doc.hidden = false;
    doc.fire();
    vi.runAllTimers();
    expect(run).toHaveBeenCalledTimes(1);
    expect(doc.listeners.size).toBe(0);
  });
});
```

Create `tests/hud/CanvasBoundary.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CanvasBoundary } from "@/experience/CanvasBoundary";

function Broken(): never {
  throw new Error("Error creating WebGL context.");
}

describe("CanvasBoundary", () => {
  it("renders the canvas while it works", () => {
    render(
      <CanvasBoundary onError={vi.fn()}>
        <p>world</p>
      </CanvasBoundary>,
    );
    expect(screen.getByText("world")).toBeTruthy();
  });

  it("hands a crash to the gate once and renders nothing", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const onError = vi.fn();
    const { container } = render(
      <CanvasBoundary onError={onError}>
        <Broken />
      </CanvasBoundary>,
    );
    expect(onError).toHaveBeenCalledTimes(1);
    expect(container.innerHTML).toBe("");
    quiet.mockRestore();
  });
});
```

Append to `tests/unit/store.test.ts` inside `describe("HQ store", ...)`:

```ts
  it("recovers from the static tier to explore with the detected tier", () => {
    store.getState().requestElevator("up");
    store.getState().setTier("static");
    expect(store.getState().phase).toBe("static");
    store.getState().recover("lite");
    expect(store.getState()).toMatchObject({ tier: "lite", phase: "explore", ride: null, beam: null, picker: null });
  });
```

Run: `bun run test tests/unit/recovery.test.ts tests/hud/CanvasBoundary.test.tsx tests/unit/store.test.ts`
Expected: FAIL: `@/experience/recovery` and `@/experience/CanvasBoundary` cannot be resolved; `recover is not a function`.

- [x] **Step 2: Implement the pure recovery module, the boundary and the store action**

Create `src/experience/recovery.ts`:

```ts
/**
 * Recovery after a WebGL context loss or a crash in the 3D view (main spec 4.6, perf report F7.5):
 * one automatic remount on a fresh canvas, then the static page with a "Retry 3D" button. A manual
 * retry that fails goes straight back to the static page, so nothing loops. Pure state, plus
 * `whenVisible` (iOS drops the contexts of background tabs; remounting while hidden would fail again).
 */
export type RecoveryStatus = "ok" | "retrying" | "failed";

export interface Recovery {
  failures: number;
  status: RecoveryStatus;
}

export const AUTO_RETRIES = 1;
export const RECOVERY_START: Recovery = { failures: 0, status: "ok" };

/** A crash report. While a retry or the static page is already showing, a second report of the same crash is ignored. */
export function afterFailure(r: Recovery): Recovery {
  if (r.status !== "ok") return r;
  const failures = r.failures + 1;
  return { failures, status: failures <= AUTO_RETRIES ? "retrying" : "failed" };
}

/** The visitor pressed "Retry 3D": one more mount; if it fails, back to the static page at once. */
export function manualRetry(r: Recovery): Recovery {
  return { failures: Math.max(r.failures, AUTO_RETRIES), status: "retrying" };
}

/** The remount happened. */
export function settled(r: Recovery): Recovery {
  return r.status === "retrying" ? { ...r, status: "ok" } : r;
}

export interface VisibilitySource {
  hidden: boolean;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}

/** Runs `run` on the next task once the tab is visible (at once if it is). Returns a cancel function. */
export function whenVisible(run: () => void, doc: VisibilitySource = document): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const go = () => {
    timer = setTimeout(run, 0);
  };
  const onVisible = () => {
    if (doc.hidden) return;
    doc.removeEventListener("visibilitychange", onVisible);
    go();
  };
  if (doc.hidden) doc.addEventListener("visibilitychange", onVisible);
  else go();
  return () => {
    doc.removeEventListener("visibilitychange", onVisible);
    if (timer !== undefined) clearTimeout(timer);
  };
}
```

Create `src/experience/CanvasBoundary.tsx`:

```tsx
"use client";

import { Component, type ReactNode } from "react";

/**
 * Catches a crash while the WebGL canvas is created or rendered (R3F rethrows its errors, including
 * "Error creating WebGL context.", into its parent) and hands it to the gate's recovery.
 */
export class CanvasBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
```

In `src/store/useHQStore.ts` add to `HQState` after `setTier`:

```ts
  /** After a WebGL crash, right before the canvas remounts: explore again with the tier the gate detected. */
  recover: (tier: GpuTier) => void;
```

and the action after `setTier: ...`:

```ts
        recover: (tier) => {
          const { phase } = get();
          set({ tier, ride: null, beam: null, picker: null, phase: phase === "static" || phase === "elevator" ? "explore" : phase });
        },
```

Run: `bun run test tests/unit/recovery.test.ts tests/hud/CanvasBoundary.test.tsx tests/unit/store.test.ts`
Expected: PASS.

- [x] **Step 3: Report crashes from the 3D view**

In `src/experience/Experience.tsx`:

Add `import { CanvasBoundary } from "./CanvasBoundary";`.

Change the props (lines 122-129):

```tsx
export default function Experience({
  data,
  tier,
  onExit,
  onFirstFrame,
  onCrash,
  startFloor,
  startRoom,
}: { data: ExperienceData; tier: GpuTier; onExit: () => void; onFirstFrame?: () => void; onCrash: () => void } & ExperienceStart) {
```

Wrap the `<Canvas>` (lines 340-364) in the boundary and replace the context-loss listener:

```tsx
        <CanvasBoundary onError={onCrash}>
          <Canvas
            dpr={budget.dpr}
            frameloop="never"
            gl={{ antialias: false, powerPreference: "high-performance" }}
            camera={{ fov: 40, near: 0.5, far: 600, position: [60, 50, 60] }}
            onCreated={({ gl }) => {
              gl.toneMapping = ACESFilmicToneMapping;
              gl.toneMappingExposure = sceneSettings(tier).exposure;
              trackRenderer(gl);
              const canvas = gl.domElement;
              canvas.addEventListener("webglcontextlost", (event) => {
                event.preventDefault();
                // Unmounting (Page view) also loses the context on purpose; only a canvas that is still on
                // the page has really crashed. The gate remounts once, then shows the static page.
                window.setTimeout(() => {
                  if (canvas.isConnected) onCrash();
                }, 0);
              });
            }}
            role="img"
            aria-label={t("canvasLabel")}
            aria-describedby="hq-desc"
            onPointerMissed={onWorldMissed}
          >
            <Scene data={data} tier={tier} labels={labels} held={held} onToggleLang={toggleLang} />
            <FirstFrame onFrame={onFirstFrame} />
            <FrameLoop />
          </Canvas>
        </CanvasBoundary>
```

`getHQStore` stays imported (other effects use it).

- [x] **Step 4: Recover in the gate**

In `src/experience/ExperienceGate.tsx`:

Replace the store import (line 12) and add the recovery import:

```ts
import { afterFailure, manualRetry, RECOVERY_START, settled, whenVisible, type Recovery } from "./recovery";
import { getHQStore, useHQStore } from "@/store/useHQStore";
```

Inside `ExperienceGate`, after the `hashRoom` state (line 45), add:

```tsx
  // WebGL context loss or a crash: one automatic remount on a fresh canvas, then the static page with "Retry 3D".
  const [recovery, setRecovery] = useState<Recovery>(RECOVERY_START);
  const [mount, setMount] = useState(0);
  const onCrash = useCallback(() => setRecovery(afterFailure), []);
  const retry3D = useCallback(() => setRecovery(manualRetry), []);
```

After the `claimAutoOpen` effect (line 68), add:

```tsx
  useEffect(() => {
    if (recovery.status === "failed") {
      getHQStore().getState().setTier("static");
      return;
    }
    if (recovery.status !== "retrying" || !detectedTier || detectedTier === "static") return;
    // Remount once the tab is visible again (iOS drops background contexts), on a fresh canvas.
    return whenVisible(() => {
      getHQStore().getState().recover(detectedTier);
      setMount((m) => m + 1);
      setRecovery(settled);
    });
  }, [recovery.status, detectedTier]);
```

Replace the render from `if (!tier) return null;` through the `lost` notice (lines 79-87):

```tsx
  if (!tier) return null;

  // Between a crash and the remount: cover the page so the HTML does not flash under the dead canvas.
  if (recovery.status === "retrying") return createPortal(<div aria-hidden="true" className="fixed inset-0 z-[35] bg-void" />, document.body);

  if (lost) {
    return (
      <div role="status" className="glass no-print fixed right-4 bottom-4 z-40 flex items-center gap-3 px-4 py-3 text-sm text-ink">
        <span>{t("staticNotice")}</span>
        <button
          type="button"
          onClick={retry3D}
          data-testid="retry-3d"
          className="min-h-11 shrink-0 rounded-full bg-cyan px-4 font-semibold text-void transition hover:bg-cyan/85 focus-visible:outline-offset-4"
        >
          {t("retry3d")}
        </button>
      </div>
    );
  }
```

and give the portalled `Experience` the key and the handler:

```tsx
  return createPortal(
    <Experience
      key={mount}
      data={data}
      tier={tier}
      startFloor={startFloor}
      startRoom={startRoom ?? hashRoom}
      onFirstFrame={onFirstFrame}
      onCrash={onCrash}
      onExit={() => {
```

(the rest of `onExit` is unchanged).

In `messages/en.json` add, directly above the `"staticNotice"` line in the `hud` object:

```json
    "retry3d": "Retry 3D",
```

In `messages/id.json`, directly above its `"staticNotice"` line:

```json
    "retry3d": "Coba 3D lagi",
```

- [x] **Step 5: Update the context-loss e2e and add the creation-failure e2e**

In `e2e/experience.spec.ts` replace the test at lines 441-451 (add `waitForFrames`, `waitForHQ` and `waitForPhase` to its `./hq` import if they are missing):

```ts
  test("a WebGL context loss remounts the 3D view once, then shows the static page with Retry 3D", async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __hqMounts: number };
      w.__hqMounts = 0;
      new MutationObserver((records) => {
        for (const record of records) for (const node of record.addedNodes) if (node instanceof HTMLElement && node.matches("[data-testid=hq]")) w.__hqMounts += 1;
      }).observe(document.documentElement, { childList: true, subtree: true });
    });
    await enterHQ(page);
    const mounts = () => page.evaluate(() => (window as unknown as { __hqMounts: number }).__hqMounts);
    const loseContext = () =>
      page.evaluate(() => {
        document.querySelector<HTMLCanvasElement>("[data-testid=hq] canvas")?.getContext("webgl2")?.getExtension("WEBGL_lose_context")?.loseContext();
      });
    expect(await mounts()).toBe(1);
    await loseContext();
    await expect.poll(mounts, { timeout: 20_000 }).toBe(2);
    await waitForHQ(page);
    await page.locator("[data-testid=hq] canvas").waitFor();
    await waitForFrames(page, 10);
    await loseContext();
    await expect(page.getByRole("status").filter({ hasText: en.hud.staticNotice })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("hq")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Back to 3D" })).toHaveCount(0);
    await page.getByTestId("retry-3d").click();
    await waitForHQ(page);
    await waitForPhase(page, "explore");
    expect(await mounts()).toBe(3);
  });
```

Append to `e2e/lifecycle.spec.ts` (add `import en from "../messages/en.json";` at the top):

```ts
async function countHqMounts(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __hqMounts: number };
    w.__hqMounts = 0;
    new MutationObserver((records) => {
      for (const record of records) for (const node of record.addedNodes) if (node instanceof HTMLElement && node.matches("[data-testid=hq]")) w.__hqMounts += 1;
    }).observe(document.documentElement, { childList: true, subtree: true });
  });
}

const hqMounts = (page: Page) => page.evaluate(() => (window as unknown as { __hqMounts: number }).__hqMounts);

test.describe("WebGL crash recovery", () => {
  test("a context that cannot be created retries once, then offers Retry 3D without looping", async ({ page }) => {
    await countHqMounts(page);
    await page.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (type.startsWith("webgl") && this.closest("[data-testid=hq]")) return null;
        return (getContext as (...a: unknown[]) => unknown).call(this, type, ...rest);
      } as typeof getContext;
    });
    await asReturningVisitor(page);
    await page.goto("/en?tier=lite");
    const notice = page.getByRole("status").filter({ hasText: en.hud.staticNotice });
    await expect(notice).toBeVisible({ timeout: 30_000 });
    expect(await hqMounts(page)).toBe(2);
    await test.info().attach("static notice with Retry 3D (desktop)", { body: await page.screenshot(), contentType: "image/png" });
    await page.getByTestId("retry-3d").click();
    await expect.poll(() => hqMounts(page)).toBe(3);
    await expect(notice).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(2000);
    expect(await hqMounts(page)).toBe(3);
  });
});
```

In `scripts/e2e-plan.ts` add before the shared gate rule (`ExperienceGate\.tsx|gate-tier\.ts|introContinue\.ts`):

```ts
  { test: /^src\/experience\/ExperienceGate\.tsx$/, specs: ["boot-first", "experience", "lifecycle", "onboarding"] },
```

- [x] **Step 6: Run the recovery tests and the gate specs**

Run: `bun run typecheck && bun run lint && bun run test && bun run build && E2E_PORT=4432 bunx playwright test e2e/lifecycle.spec.ts e2e/experience.spec.ts e2e/boot-first.spec.ts e2e/onboarding.spec.ts e2e/static-routes.spec.ts`
Expected: PASS. Against main's build (serve `../hq-r5-p3-base/out` on 4432 as in Task 1) the two recovery tests FAIL (main shows the notice after the first loss and has no Retry 3D button): that is the "before".

- [x] **Step 7: Document**

In `AGENTS.md` "3D experience", add after the Frame loop bullet:

```markdown
- Crash recovery (round 5): `CanvasBoundary` (around the R3F canvas, which rethrows creation and render errors) and the `webglcontextlost` listener call `onCrash`; `ExperienceGate` remounts the 3D view once on a fresh canvas (after the tab is visible again, `whenVisible`), and a second failure sets the static tier and shows the notice with a "Retry 3D" button (`recovery.ts`: `afterFailure`, `manualRetry`, `settled`; store `recover(tier)`). A failed manual retry goes straight back to the notice, so nothing loops. Page View exits lose the context on purpose and are ignored (the canvas is disconnected).
```

In `docs/superpowers/specs/2026-10-09-agent-hq-design.md` section 4.6, replace the first bullet:

```markdown
- A WebGL context loss or crash remounts the 3D view once on a fresh canvas (after the tab is visible again); a second failure falls back to the `static` tier with a small notice and a "Retry 3D" button, which tries once more.
```

In `docs/superpowers/specs/agent-hq/08-quality-acceptance.md` section 1, in the `static` row, change "or a WebGL error" to "or a WebGL error that survives one automatic remount (the notice offers Retry 3D)".

- [x] **Step 8: Commit**

```bash
rtk git add src/experience/recovery.ts src/experience/CanvasBoundary.tsx src/store/useHQStore.ts src/experience/Experience.tsx src/experience/ExperienceGate.tsx messages/en.json messages/id.json tests/unit/recovery.test.ts tests/hud/CanvasBoundary.test.tsx tests/unit/store.test.ts e2e/experience.spec.ts e2e/lifecycle.spec.ts scripts/e2e-plan.ts AGENTS.md docs/superpowers/specs/2026-10-09-agent-hq-design.md docs/superpowers/specs/agent-hq/08-quality-acceptance.md
rtk git commit -m "feat: remount the 3D view once after a WebGL crash, then offer Retry 3D"
```

---

### Task 10: Full verification, before/after numbers and the PR

**Files:**
- Modify: `AGENTS.md` ("Fast verification": the new specs in the change plan)
- No code changes; this task produces the PR.

**Interfaces:**
- Consumes: every earlier task; the base build in `../hq-r5-p3-base/out`; `.visual/base-a`, `.visual/base-b`.
- Produces: PR `r5-p3-cpu-lifecycle-memory` with the measurement table, the visual gate table and the bench tables.

- [x] **Step 1: Mention the new specs in the change-plan docs**

In `AGENTS.md` "Fast verification", in the `e2e:changed` bullet's list of examples, add: "`src/experience/scene/{FrameLoop,framePacer,cover,coverWatch}`, `CanvasBoundary`, `recovery` and `tower/rideClock` to `lifecycle`, `experience` and `pads`, `fx/useDispose`, `scene/memoryProbe` and floor mounting to `memory` and `experience`". Commit:

```bash
rtk git add AGENTS.md
rtk git commit -m "docs: map the round 5 lifecycle and memory specs in the change plan"
```

- [x] **Step 2: Quick verification**

Run: `rm -rf .next && bun run verify:quick`
Expected: typecheck, lint, all unit tests and `next build` pass.

- [x] **Step 3: The e2e suite**

Run: `E2E_PORT=4432 bun run e2e:changed`
Expected: the plan is "all" (this branch changes `playwright.config.ts` and `package.json`), every spec passes, including `memory`, `lifecycle`, the render budgets (`highlights` L1 under 140, `roof` under 80, `expectRenderBudget` under 150 calls and 30k triangles) and the elevator, beam and mission specs.

- [x] **Step 4: Benches**

Run: `bun run bench`
Expected: every `current` row faster than its `legacy` row; `findPath` scrub and `roadRoute` rows at most 2 ms; palette typing at most 4 ms per key. Save the output for the PR.

- [x] **Step 5: Visual gate on the final branch**

Run:

```bash
VISUAL_GATE=.visual/head E2E_PORT=4432 bunx playwright test e2e/visual-gate.spec.ts --workers=1
bun scripts/shot-diff.ts --base .visual/base-a --base2 .visual/base-b --head .visual/head
```

Expected: 24 rows, all `pass`. Save the table.

- [x] **Step 6: Initial JS and CSS of the Page View**

Run:

```bash
bun -e '
const fs = require("fs"), zlib = require("zlib");
const refs = (dir, ext) => [...new Set([...fs.readFileSync(dir + "/en.html", "utf8").matchAll(new RegExp("/_next/static/[^\"\x27\\s)]+\\." + ext, "g"))].map((m) => m[0]))];
const gz = (dir, ext) => refs(dir, ext).reduce((sum, ref) => sum + zlib.gzipSync(fs.readFileSync(dir + ref)).length, 0);
for (const ext of ["js", "css"]) {
  const base = gz("../hq-r5-p3-base/out", ext), head = gz("out", ext);
  console.log(`${ext} on /en: base ${(base / 1024).toFixed(1)} KB gz, head ${(head / 1024).toFixed(1)} KB gz, delta ${((head - base) / 1024).toFixed(2)} KB`);
}'
```

Expected: JS delta at most +1.0 KB gz (the gate's recovery state and notice button; everything else is in the lazy 3D chunk), CSS delta within +0.2 KB. CI's Lighthouse job stays the authority for the 240 KB JS and 20 KB CSS budgets; if this branch rebases onto P1 (zod off the client) the headroom grows by about 34 KB.

- [x] **Step 7: Manual check of the 60 fps cap on a high-refresh display**

On a 120 Hz device (ProMotion MacBook in Chrome, or a 120 Hz Android phone through remote DevTools), open the production-like build (`bun run serve`, then `http://<host>:4173/en?tier=lite`) and run in the console, parked on L1:

```js
(() => { const a = __hq.frames(); setTimeout(() => console.log(((__hq.frames() - a) / 10).toFixed(1), "fps"), 10_000); })();
```

Expected: about 60 fps (main renders at the display rate; read main's rate from DevTools > Rendering > Frame Rendering Stats on the base build). Then open the palette on the phone and confirm the Frame Rendering Stats show no new frames. Record both.

- [x] **Step 8: Fill in the measurement table and open the PR**

Run: `rtk git push -u origin r5-p3-cpu-lifecycle-memory`, then open the PR with this body (fill every value from Tasks 2 to 9; "before" comes from main's build `../hq-r5-p3-base/out` measured with the same spec or bench):

```markdown
## Round 5 P3: CPU, lifecycle and memory

Fixes perf report F7.1/SP8 (geometry leaks), D 8.3/8.4/SP7 (pause when covered, 60 fps cap), D 6.3/6.8/SP11 (findPath, palette), D 6.2 (store and persist writes), D 9.1-9.3 (backdrop blur), F7.5/D 8.7 (crash recovery). The look is unchanged: visual gate below.

| Metric | Method | Before (main) | After |
|---|---|---|---|
| Geometries / textures / programs after 10 L1 to RF trips | `e2e/memory.spec.ts` | +<n> / +0 / +0 | +0 / +0 / +0 |
| JS heap growth over 10 trips, 5 Page View toggles | same, CDP after GC | <n> KB, <n> KB | <n> KB, <n> KB |
| Draw calls per second under the phone palette / CV viewer / 92% sheet | `e2e/lifecycle.spec.ts` GL draw counter | <n> | 0 |
| Rendered fps on a 120 Hz display, parked | `__hq.frames()` / DevTools frame stats | ~120 | ~60 |
| Store sets and `hq:v1` writes, 3 s parked | lifecycle probe | <n> / <n> | <n> / 0 |
| Store sets and writes during one L1 to L2 ride | lifecycle probe | <n> / <n> | <n> / 0 |
| `findPath` L2 swipe / L2 farthest cell / L3 farthest cell (mean) | `bun run bench` | <ms> | <ms> |
| Palette typing "voice ai contact center" (per key) | `bun run bench` | <ms> | <ms> |
| `backdrop-filter` under 94% panels, terminal, lightbox, hidden phone scrims | computed style | blur | none |
| Context loss | `e2e/experience.spec.ts` | static for the visit | 1 remount, then static + Retry 3D |
| Initial JS / CSS on `/en` | gz of referenced chunks | <KB> / <KB> | <KB> / <KB> |

### Visual gate (desktop full 1440x900 and 2560x1440, phone lite 390x844)

<paste the shot-diff table>

### Benches

<paste the bench tables>

### Rebase notes for P2, P4, P6, P7

See "Cross-workstream conflicts" in `files/plans/r5-p3-cpu-lifecycle-memory.md`: P6 samples ride progress with `__hq.motion()`; P2's monitor treats 60 fps as the ceiling and resets on `onPacerChange`; P4 reuses `__hq.memory()`, `__hq.frames()` and `e2e/memory.spec.ts`.

### Rollback

Each commit reverts on its own: disposal (no pixel effect), frame loop and cover pause (back to `frameloop` "always"), navgrid and palette (oracles in `tests/helpers/*-legacy.ts`), store writes, blur CSS, crash recovery.
```

Expected: CI green (`Build, CV and e2e`, `Lighthouse CI`).

- [x] **Step 9: Clean up**

Run: `rtk git worktree remove ../hq-r5-p3-base && rm -rf .visual`
Expected: the base worktree is gone; `.visual/` was never committed (`.gitignore`).

---

## Self-review

**Spec coverage (task request and plan.md P3 row):**

| Requirement | Task |
|---|---|
| Fix ~11 geometries leaked per L1 to RF round trip; all 6 files from F7.1 (`CareerRooms`, `WorkshopAnnex`, `YearGates`, `ProfileHologram`, `FloorLine` in `tower/primitives`, `Sky`) | 2 (plus `Rover`, `Motes`, `FloorLevel` found by the lint) |
| Deterministic memory round-trip e2e, SP8: 10 trips + 5 3D/Page toggles, delta geometries/textures/programs = 0 | 2 |
| Pause rendering when > 90% of the canvas is covered (phone palette, full-screen modals, 92% sheet) | 4 (lightbox included) |
| Cap at 60 fps on 120 Hz displays, no idle 30 fps cap | 3 |
| Bounded `findPath` (no whole-grid flood) with a vitest bench on real layouts | 5 |
| Palette search pre-normalization | 6 |
| Store mirror only on change; elevator/beam store updates not every frame; persist writes only for persisted keys | 7 |
| `backdrop-filter` removed where panels are >= 94% opaque and on phones, gated by screenshot diff < 1% | 8 (+ gate in 1) |
| WebGL context-loss error boundary with one retry and a "Retry 3D" button | 9 |
| Keep the rover runtime-object architecture | 7 (extends it to ride/beam), constraint |
| Coordinate with P6 (Director ride timing), P7 (camera/input), P2 (render loop/monitor) | Cross-workstream table, Tasks 3 and 7 interfaces |
| Port 4432 | every e2e command |
| Before/after with the same method, numbers in the PR | Tasks 2, 4, 6, 7, 9 "before" runs against main's build; Task 10 table |
| Screenshot diff at 1440x900, 2560x1440, 390x844 with a threshold and rollback notes | Task 1 gate, Tasks 3, 4, 8 (9: new button only, attached screenshot) |
| README, AGENTS.md, spec appendices | Tasks 2 to 10 |

**Placeholder scan:** every code step has complete code; the only angle-bracket values are the PR body's measured numbers, filled from the runs named in the same table. Conditional steps (an unexpected lint offender in Task 2, a failing blur row in Task 8) give the exact fix.

**Type consistency:** `framePacer`, `pacerTick`, `pauseFrames`, `onPacerChange`, `FRAME_CAP_FPS` (Task 3) are what Task 4 and the P2 note use; `watchCover`/`isCovered`/`COVER_ATTR` (Task 4); `memoryCounts`/`trackRenderer` (Task 2) and `__hq.memory`, `__hq.frames`, `__hq.motion` are added in Tasks 2, 3 and 7 to the same object; `rideNow`/`keepRide`/`clearRide`/`beamNow`/`keepBeam`/`clearBeam` (Task 7) match the Director, `ElevatorShaft`, `TeleportBeam` and the P6 note; `skipUnchanged`, `sameRover`, `POSE_EPSILON` (Task 7); `afterFailure`/`manualRetry`/`settled`/`whenVisible`/`RECOVERY_START`, `CanvasBoundary`, `recover(tier)`, `onCrash` (Task 9); lifecycle spec helpers (`countDraws`, `draws`, `expectDrawing` in Task 3; `drawsOver`, `PHONE`, `phonePage`, `openPodRoute`, `openHud`, `sheetPercent` in Task 4; `countPersistWrites` in Task 7; `countHqMounts`, `hqMounts` in Task 9) are each defined once before use. Task 9's `Experience` Canvas block already contains Task 2's `trackRenderer(gl)` and Task 3's `frameloop="never"` and `<FrameLoop />`.

**Open risks:**
- `vitest bench` farthest-cell `findPath` on L2/L3 may stay above 2 ms (A* over a whole floor is inherent); the autopilot uses `roadRoute` there, and the bench records it rather than failing.
- The memory e2e takes 2 to 4 minutes on SwiftShader (20 reduced-motion rides plus a warm-up tour); if CI shard time matters, P4 can move it to a nightly job, keeping it in `e2e:changed` for floor and lifecycle changes.
- JS heap growth under 2 MB is the SP8 target; troika's glyph atlas and React internals can wobble. If CI flakes on the heap assertion (never on the counts), record the observed spread over 10 runs and raise the slack to the maximum observed plus 1 MB, never above 4 MB, in the same PR that reports it.
- `frameloop="never"` relies on R3F 9's `advance(timestamp)` clock semantics (`update()` sets `clock.elapsedTime = timestamp` in seconds when the frameloop is "never", `events-9ce18a08.esm.js` lines 17400-17425); an R3F major upgrade must re-run `tests/unit/frame-pacer.test.ts` and the lifecycle spec.
- iOS Low Power Mode caps rAF at 30 fps; the pacer then renders every tick (no extra cap) and P2's monitor must not read that as a slow GPU.

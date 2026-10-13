# L3 Tech Reactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the decorative L3 Reactor core into a project filter: six selectable tech rings (the CV skill groups), a "Tech Reactor" drawer listing every tech with its project count, pod and road highlights, a floating count sign, Clear, Surprise me, a `#labs-tech=<slug>` deep link and Cmd-K entries.

**Architecture:** A pure tech index (`src/content/tech-index.ts`) is built on the server at build time from `pods[].stack` and the CV skill groups, with an explicit ring map and a misc allowlist for techs outside the CV. It feeds the drawer view (`/data/rooms/{locale}.json`, room `L3:reactor`, kind `reactor`) and the HUD index (Cmd-K). The selection lives in the store (`reactor`: ring, selected tech with its pod slugs, a spin counter); the 3D floor reads it and draws instanced highlights on the shared holo shader. Pure geometry and selection rules live in `src/experience/floors/labs/techReactor.ts`.

**Tech Stack:** Next.js 16 static export, React Three Fiber, three.js, zustand, next-intl, Vitest, Playwright.

## Global Constraints

- Design: `/Users/shinyq/.copilot/session-state/d439b68f-b2e6-4b77-9feb-f9099e8cd824/files/plans/2026-10-14-functional-floor-ends-design.md` section 2 (owner approved 2026-10-14).
- Rings: AI and LLM, Azure, Backend, Frontend, Data, DevOps, mapped from the CV skill groups (languages fold into Backend or Frontend by tech).
- Budgets: L3 settled scene calls under 150, triangles under 30k at every peak, programs within `e2e/perf/baseline.json` + 2 (reuse `fx/holoFx.ts`), highlights instanced (one draw for all pod glows, one for road glow), precompiled with the floor.
- Lite tier simpler; reduced motion static (no spin, no flow).
- No em dashes; EN and ID for every label; no new content; no client company names in 3D.
- `E2E_PORT=4451` for local e2e, never 4173.
- Keep work inside `src/experience/floors/labs/*`, the drawer, content generation and messages; touch shared code only where the feature needs a hook (store slice, pick volume base, room stops, palette target).

## File map

| File | Responsibility |
| --- | --- |
| `src/content/tech-rings.ts` (new) | Ring ids, CV group to ring, language and extra tech to ring, aliases, misc allowlist (pure data) |
| `src/content/tech-index.ts` (new) | `buildTechIndex(pods, skills)`, `techSlug`, `getTechIndex()` (pure plus a cached loader) |
| `src/experience/floors/labs/techReactor.ts` (new) | Ring geometry and colors, reactor stop, ring pick bands, lit pods, road glow segments, surprise pick, hash parse and format, count sign text (pure) |
| `src/experience/floors/labs/layout.ts` | Reactor stop and its view zone, `FloorLayout.stops` |
| `src/experience/floors/labs/ReactorCore.tsx` | Six tech rings, selection glow, Surprise spin, ring labels and count sign |
| `src/experience/floors/labs/ReactorHighlights.tsx` (new) | Pod beacons (one instanced draw) and road glow (one instanced draw) |
| `src/experience/floors/labs/Pods.tsx` | Dims holograms of pods outside the selection |
| `src/experience/floors/labs/reactorUrl.ts` (new) | Hash read on load, hash write on change (`useReactorHash`) |
| `src/store/useHQStore.ts` | `reactor` slice: `setReactorRing`, `selectReactorTech`, `clearReactorTech`, `spinReactor` |
| `src/experience/interact/{registry,pick,runtime,InteractLayer}` | Ring targets (`L3:station:reactor-<ring>`), `Interactable.base`, `reactor:<ring>` command |
| `src/experience/missions/{rooms,host3d}.ts`, `src/experience/types.ts` | Room `L3:reactor` (kind `reactor`), `FloorLayout.stops` |
| `src/content/room-views/labs.ts`, `types.ts` | Reactor view with `RoomView.reactor` |
| `src/hud/drawer/ReactorBody.tsx` (new), `bodies.tsx` | Drawer body: ring tabs, tech list, projects, Clear, Surprise me |
| `src/hud/{index-data,palette-types,search,MissionHud}.ts(x)` | Cmd-K "Show projects using X" |
| `messages/{en,id}.json` | `labs.reactor.*`, `hud.rooms.reactor`, `hud.palette.tech` |
| `e2e/reactor.spec.ts` (new), `scripts/e2e-plan.ts` | E2E and its path mapping |

### Task 1: Tech index

**Files:** Create `src/content/tech-rings.ts`, `src/content/tech-index.ts`; Test `tests/unit/tech-index.test.ts`.

**Interfaces (produces):**

```ts
export const REACTOR_RINGS = ["ai", "azure", "backend", "frontend", "data", "devops"] as const;
export type ReactorRingId = (typeof REACTOR_RINGS)[number];
export interface TechEntry { slug: string; name: string; ring: ReactorRingId; pods: string[] }
export interface TechIndex { rings: { id: ReactorRingId; techs: TechEntry[] }[]; misc: string[] }
export function techKey(name: string): string;   // alias-resolved normalized key
export function techSlug(name: string): string;  // "Azure OpenAI" to "azure-openai", "Next.js" to "next-js"
export function ringOf(name: string, skills: readonly SkillGroup[]): ReactorRingId | null;
export function buildTechIndex(pods: readonly Pick<Pod, "slug" | "stack">[], skills: readonly SkillGroup[]): TechIndex;
export function getTechIndex(): TechIndex; // server only, cached
```

- [ ] Step 1: failing tests: every pod tech resolves to a ring or is in `MISC_TECH`; CV group mapping (`ai` to ai, `languages` per tech); aliases merge (`Next.js 15` with `Next.js`, `App Service` with `Azure App Service`); counts equal distinct pods; techs sorted by count then name; every `EXTRA_RING` and alias key is used by some pod (no stale entries); misc and mapped sets are disjoint; slugs unique.
- [ ] Step 2: run `bunx vitest run tests/unit/tech-index.test.ts`, expect failure (module missing).
- [ ] Step 3: implement (CV skill items win over `EXTRA_RING`; display name is the most used spelling, ties alphabetical; pods in site order via `orderPods`).
- [ ] Step 4: tests pass. Commit `feat(content): build-time tech index for the L3 Tech Reactor`.

### Task 2: Reactor model and layout

**Files:** Create `src/experience/floors/labs/techReactor.ts`; Modify `layout.ts`, `src/experience/types.ts` (`FloorLayout.stops?: Partial<Record<RoomId, Vec2>>`); Test `tests/unit/tech-reactor.test.ts`, existing `tests/unit/labs-layout.test.ts` still passes (space rules).

**Interfaces (produces):**

```ts
export const REACTOR_ROOM: RoomId = "L3:reactor";
export const TECH_RINGS: readonly { id: ReactorRingId; y: number; r: number; tilt: number; color: string }[];
export function reactorStop(center: Vec2): Vec2;            // east point of the ring road, the rover faces west
export function ringBands(): { id: ReactorRingId; base: number; top: number }[]; // pick volume y range per ring, bottom band reaches the floor
export function litPods(placed: readonly PlacedPod[], slugs: readonly string[]): PlacedPod[];
export function roadGlow(layout: LabsLayout, lit: readonly PlacedPod[]): { a: Vec2; b: Vec2 }[];
export function surprisePod(candidates: readonly string[], current: string | null, rand: () => number): string | null;
export const TECH_HASH = "labs-tech";
export function techFromHash(hash: string): string | null;
export function techHash(slug: string | null): string;       // "" when null
```

- [ ] Step 1: failing tests: stop lies on the ring road and outside the core; bands are ordered, contiguous, top under the core height; `litPods` keeps only placed pods; `roadGlow` covers the wing road from the ring entry to the westmost lit spur plus each lit spur, every segment on the road network (`onNetwork`), none for an empty selection; `surprisePod` never returns `current` when another exists; hash round trip, rejects bad slugs.
- [ ] Step 2: run, expect failure.
- [ ] Step 3: implement; layout adds `stops: { "L3:reactor": stop }` and a view zone `L3:reactor` at the stop (camera east of the rover, looking west over the core to both wings).
- [ ] Step 4: tests pass (plus `tests/unit/labs-*.test.ts`). Commit.

### Task 3: Store slice

**Files:** Modify `src/store/useHQStore.ts`; Test `tests/unit/store.test.ts` (or a new `tests/unit/reactor-store.test.ts`).

```ts
export interface ReactorTech { slug: string; name: string; count: number; pods: string[] }
reactor: { ring: ReactorRingId; tech: ReactorTech | null; spin: number };
setReactorRing(ring); selectReactorTech(tech: ReactorTech, ring?: ReactorRingId); clearReactorTech(); spinReactor();
```

Not persisted. Steps: failing test, implement, pass, commit.

### Task 4: Room, view, drawer body, messages

**Files:** `src/experience/missions/rooms.ts` (kind `reactor`, structural `reactor`, catalog entry path `/labs`, floorPath `/labs`, keywords: ring labels and tech names), `src/content/room-views/{types,labs}.ts` (`RoomView.reactor = { rings: { id, label, accent, techs: { slug, name, logo?, count, pods }[] }[]; pods: Record<slug, { title, wing }> }`), `src/hud/drawer/ReactorBody.tsx`, `bodies.tsx`, messages, Experience labels for `hud.rooms.reactor`. Tests: `tests/hud/ReactorBody.test.tsx` (ring tabs switch, tech pick writes the store, project buttons call `goToRoom`, Clear, Surprise me picks a docked pod and bumps `spin`), room-view and catalog tests.

### Task 5: Point-and-go ring targets and the reactor stop

**Files:** `src/experience/interact/{registry,pick,runtime,InteractLayer}`, `src/experience/missions/host3d.ts` (`layout.stops`), `src/experience/Experience.tsx` (`doorOf` falls back to `stops`), `src/experience/scene/Director.tsx` (command `reactor`). Tests: `tests/unit/interact-registry.test.ts` (six ring targets plus their bands), `tests/unit/interact-pick.test.ts` (`base`, `parseCommand("reactor:azure")`).

### Task 6: 3D rendering

**Files:** `ReactorCore.tsx` (six tech rings on the existing instanced ring mesh, selected ring brighter, Surprise spin burst, ring labels and the count sign on one `FloatingSigns` group), `ReactorHighlights.tsx` (pod beacons: holo `pillar` on open cylinders, one instanced mesh; road glow: holo `strip` planes, one instanced mesh; both mounted from the start with zero visible instances so the floor precompile covers them), `Pods.tsx` (dim others), `Labs.tsx`, `src/experience/fx/probes.ts` (`sceneProbes.reactor`). Lite: shorter beacons, no base ring flow. Reduced motion: no spin.

### Task 7: URL hash, gate deep link, Cmd-K

**Files:** `reactorUrl.ts` (`useReactorHash`, mounted by `Experience`), `src/experience/floors/lobby/stations.ts` (`gateStartRoom` returns `L3:reactor` for `/labs#labs-tech=<slug>`), `src/hud/{index-data,palette-types,search,MissionHud}`. Tests: `tests/unit/gate-start-room` style test, `tests/unit/search.test.ts` (tech entries only on a query), MissionHud select sets the store and goes to `L3:reactor` in 3D, `/labs?stack=<name>` otherwise.

### Task 8: E2E, docs, verification, PR

- `e2e/reactor.spec.ts`: pick a tech in the drawer (pods lit through `__hq.probes.reactor`, sign text, URL hash), ring click through point-and-go, Surprise me drives to a pod, deep link `/en/labs#labs-tech=<slug>`, reduced motion (spin frozen), Cmd-K entry. Map `src/experience/floors/labs/**` and `src/hud/drawer/ReactorBody.tsx` to `reactor` in `scripts/e2e-plan.ts`.
- Docs: README (L3 paragraph), spec 01 (Reactor row), spec 02 (Tech Reactor interaction), spec 08 (budgets row), AGENTS.md (store slice, `FloorLayout.stops`, `Interactable.base`, tech index).
- Verify: `bun run verify:quick`, `bun run e2e:changed`, `E2E_PORT=4451 bun run e2e:perf`, `bun scripts/visual-gate.ts --base origin/main` for L3, captures at 1440x900 full, 2560x1440 full, 390x844 lite.
- Rebase onto F1 once it merges (move the L3 return pad coordinate if it collides with the reactor stop or ring targets), open one PR, get every required check green, report back.

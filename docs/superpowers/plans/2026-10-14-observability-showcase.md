# Observability Showcase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show how Kurniadi runs AI in production: an owner-approved "How I run AI in production" section on the About page (`/{locale}/contact#production`), a Cmd-K room row, an Ask the HQ chunk, and an Ops Control Room on L3 with three panel screens and a live panel of this site's own telemetry.

**Architecture:** The text and proof tiles live in `content/site-content.json` under a new top-level `production` key (schema `ProductionSchema`). Page View renders it as a server component (no new client JS). The 3D floor gets one more L3 room (`L3:ops`, kind `ops`) placed by `buildLabsLayout` in the inner pocket between the AI wing's last inner pod and the reactor's wing road leg, with a door pad, spur, view zone and tall column; the scene draws it with existing programs (merged boxes, one instanced holo plate mesh, one `BatchedLabels`, `FloatingSigns`). The live panel reads a new optional `perf` block of the daily stats snapshot, aggregated by the `hq-stats` Worker from Analytics Engine `perf_events`.

**Tech Stack:** Next.js 16 static export, React Three Fiber, troika text, zod, Cloudflare Worker (Analytics Engine SQL API, KV), Vitest, Playwright.

## Global Constraints

- No em dashes (U+2014) anywhere.
- EN and ID for every user-facing string; UI strings in `messages/{en,id}.json` with identical keys.
- Never name client companies; nothing from the "PRIVATE (do not publish)" section of the Azure survey; no hosts, subscription ids, resource or project names.
- Approved text is the source of truth (`observability-review.md`); only typo fixes. Factual correction: the TEMMPAT probe tile says 10 endpoints (the current `prometheus.yml` has 10 targets; 11 was an older revision). Reported in the PR.
- Classic JS budget 240 KB; L3 under 150 scene calls, under 30k triangles at every peak, programs within `e2e/perf/baseline.json` + 2; lite simpler; reduced motion static.
- Live numbers only from real data; hide the live panel when the snapshot is missing, invalid, older than 7 days, or has no `perf` block.
- E2E_PORT 4456. Never deploy the Worker.
- Ask pack under 200 KB (`PACK_MAX_BYTES`); trim per runbook deviation 8 if needed and report it.

---

### Task 1: Content model and data

**Files:**
- Modify: `src/content/schema.ts` (add `ProductionSchema`, `production` on `SiteContentSchema`, types)
- Modify: `content/site-content.json` (new `production` key)
- Modify: `src/content/load.ts` (`getProduction()`)
- Test: `tests/content/production.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const ProductionPanelSchema = z.enum(["metrics", "traces", "alerts"]);
  export const ProductionSchema = z.strictObject({
    title: LocalizedTextSchema,
    intro: LocalizedTextSchema,
    points: z.array(z.strictObject({ id: SlugSchema, lead: LocalizedTextSchema, text: LocalizedTextSchema })).min(2).max(6),
    outro: LocalizedTextSchema,
    tiles: z.array(z.strictObject({ id: SlugSchema, label: LocalizedTextSchema, value: LocalizedTextSchema, detail: LocalizedTextSchema, panel: ProductionPanelSchema })).min(3).max(6),
    alerts: z.array(LocalizedTextSchema).min(1).max(6),
    caseStudies: z.array(SlugSchema).min(1).max(6),
    alertExcerpt: z.strictObject({ caption: LocalizedTextSchema, code: nonEmpty }).optional(),
    dashboard: AssetSchema.optional(),
  });
  export type Production = z.infer<typeof ProductionSchema>;
  // load.ts
  export function getProduction(): Production;
  ```

- [ ] Step 1: failing test: schema parses the dataset; every `caseStudies` slug resolves to a pod; tiles cover all three panels; the text contains no GUIDs, Azure hostnames or blocklisted names (`loadBlocklist`).
- [ ] Step 2: run `bunx vitest run tests/content/production.test.ts`, expect FAIL.
- [ ] Step 3: add schema, data (approved text verbatim, 10 endpoints), `getProduction`.
- [ ] Step 4: run the test plus `tests/content` and `bun run validate:content`, expect PASS.
- [ ] Step 5: commit `feat(content): add the production observability section`.

### Task 2: Classic site section and Cmd-K room

**Files:**
- Create: `src/components/page/Production.tsx` (server component: points, outro, proof tiles, figure, Bicep excerpt, case study links)
- Modify: `src/app/[locale]/contact/page.tsx` (section `#production` after `#how`)
- Modify: `messages/{en,id}.json` (`production` namespace, `hud.rooms.ops`)
- Modify: `src/experience/missions/rooms.ts` (`RoomKind` `ops`, `StructuralRoom` `ops`, catalog entry `L3:ops`, path `/contact#production`)
- Modify: `src/experience/Experience.tsx` (`rooms.ops` label, `hasPage` false for `L3:ops`)
- Test: `tests/unit/rooms*.test.ts` additions, `e2e/production.spec.ts`

- [ ] Step 1: failing unit test: catalog has `L3:ops` with kind `ops` and path `/contact#production`.
- [ ] Step 2: implement catalog entry and labels; the section component; run unit tests.
- [ ] Step 3: e2e: `/en/contact#production` shows the section after `#how`, five case study links resolve, Cmd-K "Ops Control Room" on the Classic site lands on `#production`.
- [ ] Step 4: commit `feat(pageview): How I run AI in production section and Cmd-K room`.

### Task 3: Ask chunk

**Files:**
- Modify: `functions/_lib/types.ts` (chunk type `production`), `functions/_lib/tags.ts` (`production: ["ai", "work"]`), `src/ask/pack.ts` (chunk after `principles`, url `/contact#production`)
- Modify: `tests/ask/pack.test.ts`, `tests/ask/golden.json`, `content/ask/suggestions.json`
- Docs: `docs/ask-runbook.md` (pack size), bump nothing in the prompt.

- [ ] Step 1: failing test: chunk `production` exists with the section text, url `/contact#production`, tags `ai`, `work`; pack under `PACK_MAX_BYTES` with every perspective approved.
- [ ] Step 2: implement; measure; trim per deviation 8 if over.
- [ ] Step 3: golden question about observability (facts "OpenTelemetry", "Bicep") and a curated pill in topic `ai`; run `tests/ask`.
- [ ] Step 4: commit `feat(ask): production observability chunk`.

### Task 4: Stats `perf` block (Worker, contract, model) [parallel subagent]

**Files:**
- Modify: `src/lib/stats/protocol.ts` (optional `perf`, validator), `src/lib/stats/fixtures.ts`
- Modify: `workers/stats/src/{types,sources,rollup,run}.ts`
- Modify: `src/lib/visits/model.ts` (`perfView`)
- Tests: `tests/stats/protocol.test.ts`, `tests/stats/rollup.test.ts`, `tests/stats/worker-run.test.ts`, `tests/unit/visits-model.test.ts`
- Docs: appendix 06 section 4.1, `workers/stats/README.md`

**Interfaces:**
- Produces:
  ```ts
  export interface StatsPerf { sessions: number; measured: number; fps55: number; explore: RumTime | null }
  // StatsSnapshotV1.perf?: Record<StatsPeriod, StatsPerf>
  export function perfView(s: StatsSnapshotV1, period: StatsPeriod): { sessions: number; fpsShare: number | null; explore: RumTime | null } | null;
  ```
  `RumTime` excludes `"na"` in `explore`. Day rollups carry `perf?: { sessions; measured; fps55; explore: Partial<Record<RumTime, number>> }`. Days without `perf` inside the Analytics Engine retention (90 days) get it filled once.

### Task 5: L3 Ops Control Room layout

**Files:**
- Create: `src/experience/floors/labs/ops.ts` (pure: `OPS`, `OPS_ROOM`, `opsPlacement(...)`, screen and tile layout)
- Modify: `src/experience/floors/labs/layout.ts` (room rect, door, spur, view zone, tall, obstacle; `LabsLayout.ops`)
- Modify: `src/experience/interact/registry.ts` (STRUCTURAL + footprint)
- Tests: `tests/unit/labs-ops.test.ts`, existing `labs-layout`, `labs-reactor` (tall count), `interact-registry`

**Interfaces:**
- Produces:
  ```ts
  export const OPS_ROOM: RoomId = "L3:ops";
  export interface OpsPlacement { rect: Rect; center: Vec2; door: Vec2; facing: -1 | 1; side: Wing }
  export function opsPlacement(input: { placed: readonly PlacedPod[]; loopEnd: Vec2; turnX: (w: Wing) => number }): OpsPlacement | null;
  // LabsLayout.ops: OpsPlacement | null
  ```

- [ ] Step 1: failing tests: real layout has `ops` on the AI side within x 91..103, |z| 9..20, `expectSpaceRules` passes for real, lopsided and empty pods; door, spur, tall (h 5.6) and view zone exist; registry has `L3:door:ops`.
- [ ] Step 2: implement; run `bunx vitest run tests/unit/labs-*.test.ts tests/unit/interact-registry.test.ts`.
- [ ] Step 3: commit `feat(l3): place the Ops Control Room`.

### Task 6: L3 Ops Control Room scene and drawer

**Files:**
- Create: `src/experience/floors/labs/OpsRoom.tsx` (merged solids, one instanced holo plate mesh, one `BatchedLabels`, `FloatingSigns`, live rows via `useStats`)
- Modify: `src/experience/floors/Labs.tsx`, `src/content/experience.ts` (`labs.ops` data), `src/experience/types.ts`
- Create: `src/hud/drawer/OpsBody.tsx`; modify `bodies.tsx`, `src/content/room-views/{labs,types}.ts`
- Create: `src/experience/floors/labs/opsHash.ts` (import-free `#production` deep link), modify `ExperienceGate.tsx`
- Modify: `src/hud/dialog/hintLines.ts` + `dialog.hints.object.ops`

- [ ] Step 1: unit tests for room view (`L3:ops` view has sections, metrics, case study cards, code), hash helper.
- [ ] Step 2: implement; `bun run typecheck`; check troika glyph coverage (`tests/content/troika-fonts.test.ts`).
- [ ] Step 3: e2e `e2e/production.spec.ts`: drive to the room via point-and-go, drawer opens with the section, reduced motion holds the panel still; `/en/contact#production` in 3D opens the room.
- [ ] Step 4: perf lane for L3 (`floors`, `peaks`), update baseline only if programs grew (they must not).
- [ ] Step 5: commit `feat(l3): Ops Control Room scene, live panel and drawer`.

### Task 7: Visuals

- [ ] Grafana Blackbox dashboard rendered locally (temp folder outside both repos, TEMMPAT's prometheus, blackbox and Grafana provisioning, neutral demo target `demo-api` with 10 endpoints); capture, crop, convert to webp (`public/media/production/01-probe-dashboard.webp`, thumb, w1200); alt text EN and ID; `redacted: true` after review.
- [ ] Masked Bicep excerpt (`production.alertExcerpt`): neutral names only.

### Task 8: Docs, safety, verification, PR

- [ ] README, AGENTS.md (schema additions, room ids, folder layout, e2e plan), specs 01 (L3 room), 06 (perf block), 08 (L3 budget note), ask runbook (pack size).
- [ ] `bun run verify:quick`, `bun run e2e:changed`, perf lane, visual gate on L3 poses, captures at 1440x900 full, 2560x1440 full, 390x844 lite.
- [ ] Security review of the diff; PR; CI green.

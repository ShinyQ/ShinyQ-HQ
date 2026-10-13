# Public Visit Stats, Layer 1: Display (S2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the daily public visit snapshot (`StatsSnapshotV1` from `GET /api/stats`, built by S1) in the 3D tower (RF "Visitor Observatory" station, one L1 stats ring tile) and on the Classic site (home ticker item, a lazy "Visits" section on Contact), with Topic and Period filters and a "Don't count my visits" toggle.

**Architecture:** One pure model module (`src/lib/visits/model.ts`) turns a snapshot plus the two filters into a view (numbers, shares, chips, freshness) that every surface renders. One client store (`src/lib/visits/store.ts`) fetches `/api/stats` once per page (idle after the first 3D frame, or after hydration on the Classic site), validates it, and decides fresh, delayed or hidden. The 3D station reuses the one holo-fx program (two new `uMode` patterns: globe body and dots) and the roof's merged solids and label batch, so RF adds about 5 draw calls and at most 1 program. The drawer body and the Classic section share one React panel (`VisitsPanel`) with native radio groups.

**Tech Stack:** Next.js 16 static export, React 19, R3F and three, troika BatchedText, next-intl, Vitest, Playwright, Bun.

## Global Constraints

- No em dashes (U+2014) anywhere. No first person in titles ("Visitor Observatory", "Visits").
- Every user-facing string in EN and ID (`messages/en.json`, `messages/id.json`, identical keys).
- Label "visits" / "kunjungan", never visitors. Numbers show now, no thresholds. Countries are dots only, never per-country numbers.
- Every stat block shows the window ("Last 30 complete days" or "Since <date>"), the source ("Cloudflare Web Analytics, sampled estimates") and "Updated daily".
- Snapshot older than 48 h: a "delayed" note. Older than 7 days, invalid, 204 or a failed fetch: every surface hides (the RF station shows its offline state: land only, "Stats offline").
- Contract: `StatsSnapshotV1` exactly as in the owner plan; S1 exports `parseStatsSnapshot(value): StatsSnapshotV1 | null`, `STATS_FIXTURE`, `STATS_FIXTURE_EMPTY` from `src/lib/stats/protocol.ts` and `src/lib/stats/fixtures.ts`. Until S1 merges, S2 uses a temporary copy (`src/lib/visits/protocol-s1.ts`, `src/lib/visits/fixtures-s1.ts`) behind one re-export (`src/lib/visits/contract.ts`); after S1 merges, `contract.ts` re-exports S1's files and the copies are deleted.
- Opt-out: `localStorage["hq:stats-optout"] === "1"` means opted out; turning counting back on removes the key; every change dispatches `window` event `hq:stats-optout` (agreed with S1). S2 never edits S1's pipeline files or `footer.privacy`.
- Budgets: RF at most 79 scene calls (`FLOOR_SCENE_CAPS.RF`), triangles under 30k at every peak, programs within `e2e/perf/baseline.json` + 2, 3D JS under 450 KB gzip, Classic JS under 240 KB (Lighthouse `resource-summary:script:size` 245,760 B), CSS under 20 KB. Lite simpler, reduced motion static.
- Static export: no new routes, no server runtime. Data assets are public domain (Natural Earth), committed as generated TypeScript.
- E2E port 4449 (`E2E_PORT=4449`), never 4173.

## File map

| File | Responsibility |
|---|---|
| `src/lib/visits/protocol-s1.ts`, `fixtures-s1.ts` | Temporary copy of S1's contract, validator and fixtures (deleted after S1 merges) |
| `src/lib/visits/contract.ts` | The one import point for the contract (`StatsSnapshotV1`, `StatsPeriod`, `StatsTopic`, `parseStatsSnapshot`, fixtures) |
| `src/lib/visits/model.ts` | Pure: `freshness`, `formatCount`, `formatCountLong`, `largestRemainder`, `visitsView`, `TOPIC_FILTERS`, `PERIODS` |
| `src/lib/visits/store.ts` | Client: `requestStats()`, `useStats()`, `statsState()`, test reset |
| `src/lib/visits/geo-data.ts` | Generated: land grid bitset (equirect 96 x 48) and country label points (Natural Earth, public domain) |
| `src/lib/visits/geo.ts` | Pure: `landCells()`, `countryPoint(code)`, `latLonToVec3`, `dotMapPath(width)` |
| `scripts/visits-geo.ts` | Generator for `geo-data.ts` (downloads Natural Earth GeoJSON once, point-in-polygon, no new dependency) |
| `src/components/stats/optOutStore.ts` | `isStatsOptedOut`, `setStatsOptOut`, `useStatsOptOut` |
| `src/components/stats/OptOutToggle.tsx` | Client switch "Don't count my visits" (footer, drawer) |
| `src/components/stats/VisitsPanel.tsx` | Client panel: radios, live status, counters, dot map, split bar, top floor, topic shares, chips, "View as table", scope line |
| `src/components/stats/DotMap.tsx` | Single-path SVG dot map plus highlighted country dots |
| `src/components/stats/VisitsSection.tsx`, `VisitsLazy.tsx` | Contact page section (server) and its lazy client loader |
| `src/components/stats/TickerVisits.tsx` | Home ticker item island |
| `src/experience/floors/roof/layout.ts` | `ROOF_DECK.visits`, door, spur, stop, view zone, `tall`, `roofActive` "visits" |
| `src/experience/floors/roof/VisitsStation.tsx` | Globe (body, land dots, country dots) and panel (plates and labels) |
| `src/experience/floors/roof/visitsPanel.ts` | Pure: panel label rows and globe instance data |
| `src/experience/fx/holoFx.ts` | Two new modes (`globe`, `dot`) and the `vC` center varying |
| `src/experience/floors/Lobby.tsx`, `floors/Roof.tsx` | Live visits tile; station mount |
| `src/experience/visits3d.ts` | `StatsLoader` (fetch after first frame) and the L1 tile builder |
| `src/experience/missions/rooms.ts`, `content/room-views/roof.ts`, `lobby.ts`, `interact/registry.ts`, `hud/drawer/bodies.tsx`, `hud/drawer/VisitsBody.tsx` | Room `RF:visits`: catalog (Cmd-K), view, point-and-go, drawer body (the "Meet me" walk stays about the owner: no stop added) |
| `src/experience/ExperienceGate.tsx` | `/{locale}/contact#visits` deep link |
| `src/components/page/StatTicker.tsx`, `src/app/[locale]/page.tsx`, `contact/page.tsx`, `src/components/SiteFooter.tsx` | Classic placements |

---

### Task 1: Contract copy, model and formatting

**Files:** Create `src/lib/visits/{protocol-s1,fixtures-s1,contract,model}.ts`; Test `tests/unit/visits-model.test.ts`

**Interfaces (produces):**
```ts
export type StatsPeriod = "d30" | "all";
export type StatsTopic = "work" | "ai" | "career" | "contact" | "perspectives";
export type TopicFilter = "all" | "work" | "ai" | "career";
export type Freshness = "fresh" | "delayed" | "hidden";
export function freshness(s: StatsSnapshotV1 | null, now: number): Freshness; // delayed > 48 h after updatedAt, hidden > 7 days
export function formatCount(n: number, locale: Locale): string; // exact grouped < 10,000, compact above ("12.3K", "12,3 rb")
export function formatCountLong(n: number, locale: Locale): string; // compactDisplay long for aria-label
export function largestRemainder(values: readonly number[]): number[]; // whole percents summing to 100 (all zero stays zero)
export interface VisitsView { period; topic; visits; pageViews; countries: string[]; topFloor; mode: { threeD; classic; threeDShare; classicShare }; asks: { total; topics: { topic: StatsTopic; n: number; share: number }[]; chips: { id; topic; n }[] } }
export function visitsView(s: StatsSnapshotV1, period: StatsPeriod, topic: TopicFilter): VisitsView;
```
Topic "all" lists every topic share of `asks.total` (shares from `largestRemainder` over topic counts) and every chip; a single topic narrows `asks.total` to that topic's count and its chips. Visits, countries, floor and mode ignore the topic.

- [ ] Write failing tests: freshness at 47 h, 49 h, 8 days and for null; `formatCount` EN/ID at 950, 1234, 12345, 1234567; `largestRemainder([1,1,1])` sums to 100; `visitsView(STATS_FIXTURE, "d30", "work")` narrows chips; `parseStatsSnapshot` rejects `{v:2}`, missing keys, `countries` with `XX`.
- [ ] Run `bun x vitest run tests/unit/visits-model.test.ts` (fail), implement, pass, commit `feat(stats): snapshot model, formatting and freshness`.

### Task 2: Geo data (land grid and country points)

**Files:** Create `scripts/visits-geo.ts`, generated `src/lib/visits/geo-data.ts`, `src/lib/visits/geo.ts`; Test `tests/unit/visits-geo.test.ts`

**Interfaces:** `LAND = { cols: 96, rows: 48, bits: string /* base64 */ }`, `COUNTRY_POINTS: Record<string, [lat: number, lon: number]>`; `landCells(step = 1): { lat: number; lon: number }[]`, `countryPoint(code): [number, number] | null`, `latLonToVec3(lat, lon, r): [x, y, z]` (y up, lon 0 at +x... matching the globe), `dotMapPath(w, h): string` (`M x yh0` per land cell).

- [ ] Script: fetch `ne_110m_land.geojson` and `ne_50m_admin_0_countries.geojson` from the Natural Earth vector repo (public domain), even-odd point-in-polygon per cell center, `ISO_A2_EH` (fallback `ISO_A2`) with `LABEL_Y/LABEL_X` rounded to 1 dp, Indonesia override `[-2.5, 118]`, write the TS module with a header naming the source and license.
- [ ] Tests: about 30 to 45% of cells are land, Jakarta and Paris cells are land, mid-Pacific is not; `COUNTRY_POINTS` has at least 230 codes including every fixture country; `dotMapPath` count of `h0` equals land cells.
- [ ] Commit `feat(stats): Natural Earth land grid and country points`.

### Task 3: Client store and opt-out

**Files:** Create `src/lib/visits/store.ts`, `src/components/stats/optOutStore.ts`, `OptOutToggle.tsx`; Test `tests/unit/visits-store.test.ts`, `tests/hud/OptOutToggle.test.tsx`

**Interfaces:** `requestStats(): Promise<StatsState>` (one fetch per page; `cache: "no-cache"` is not needed, the ETag and max-age are S1's), `type StatsState = { status: "idle" | "loading" | "ready" | "hidden"; snapshot: StatsSnapshotV1 | null; freshness: Freshness }`, `useStats(): StatsState`, `__resetStatsForTests()`. 204, non-2xx, network error, invalid JSON, invalid contract, freshness "hidden" all give `hidden`. `isStatsOptedOut()`, `setStatsOptOut(on)`, `useStatsOptOut()` (`useSyncExternalStore` over the `storage` and `hq:stats-optout` events).

- [ ] Tests with a mocked `fetch`: 200 fresh, 200 stale 3 days (delayed), 200 stale 8 days (hidden), 204, 500, bad JSON; one fetch for two calls. Toggle test: checking writes `"1"` and fires the event, unchecking removes the key.
- [ ] Commit `feat(stats): stats store and the "Don't count my visits" toggle`.

### Task 4: Shared panel (Classic section and drawer body)

**Files:** Create `src/components/stats/{VisitsPanel,DotMap}.tsx`; Modify `messages/{en,id}.json` (`stats` namespace); Test `tests/hud/VisitsPanel.test.tsx`

**Interfaces:** `VisitsPanel({ locale, labels: VisitsLabels, chipLabels: Record<string,string>, floorLabels: Record<FloorId,string>, compact?: boolean, optOut?: ReactNode })`. Renders: scope line (window, source, "Updated daily", delayed note), two `<fieldset>` radio groups (Topic: All, Work, AI, Career; Period: Last 30 days, Since launch), a polite `role="status"` line, counters (visits, countries, questions asked, top floor), `DotMap`, the 3D vs Classic bar, topic shares (bars with whole percents), chip counts, `<details>` "View as table" (country names via `Intl.DisplayNames`, never numbers per country). Hidden state renders nothing; loading renders a skeleton line.

- [ ] Tests (jsdom, store primed with the fixture): arrow keys move between radios and the status text changes; Topic "Work" filters chips; Period "Since launch" shows "Since 12 Oct 2026"-style window; the table lists country names and no per-country numbers; delayed note appears for a 3-day-old snapshot; hidden renders null.
- [ ] Commit `feat(stats): visits panel with Topic and Period radio groups`.

### Task 5: Classic placements

**Files:** Create `src/components/stats/{VisitsSection,VisitsLazy,TickerVisits}.tsx`; Modify `StatTicker.tsx` (optional `live` item slot), `src/app/[locale]/page.tsx`, `contact/page.tsx`, `SiteFooter.tsx`; Test `e2e/visits.spec.ts` (Classic part)

- `VisitsSection` (server): `SectionSplit id="visits"`, chip labels from `content/ask/suggestions.json` for the locale, floor labels, renders `VisitsLazy` which loads `VisitsPanel` with `import()` after hydration on idle (or when `#visits` is in the URL) and calls `requestStats()`. The section hides itself (`hidden`) when the store says hidden.
- `TickerVisits` (client): one `<li className="hx-tick-item">` per track once ready: value `formatCount(visits.d30)`, label "visits, last 30 days", the `hx-tick-live` marker; nothing otherwise.
- Footer: `OptOutToggle` after the privacy sentence.
- [ ] e2e (route `/api/stats` mocked with the fixture): Contact shows the section, radios change the status, "View as table" opens; 204 hides it; footer toggle writes the key. Home ticker shows the visits item.
- [ ] Commit `feat(stats): Classic ticker item, Contact "Visits" section and footer toggle`.

### Task 6: Room `RF:visits` (catalog, Cmd-K, deep link, drawer, walk)

**Files:** Modify `missions/rooms.ts` (`StructuralRoom` "visits", `RoomKind` "visits", catalog entry with keywords visits/kunjungan/stats/statistik/analytics), `Experience.tsx` and test label maps, `content/room-views/roof.ts` (view with `visits` payload: chip and floor labels), `room-views/types.ts` (`RoomView.visits?`), `room-views/lobby.ts` (L1:stats `link` to RF:visits), `hud/drawer/bodies.tsx` + new `VisitsBody.tsx` (panel compact plus `OptOutToggle`), `ExperienceGate.tsx` (+ pure `visitsRoomFromHash` in `floors/roof/visitsRoom.ts`), `messages` `hud.rooms.visits`, `walk` copy; Tests `tests/unit/missions-rooms.test.ts`, `room-views` test, `walks` test.

- [ ] Commit `feat(stats): RF:visits room, drawer body, deep link and Cmd-K entry`.

### Task 7: RF layout and station geometry

**Files:** Modify `floors/roof/layout.ts`, `interact/registry.ts`; Test `tests/unit/roof-layout.test.ts`, `interact-registry.test.ts`

Layout: `ROOF_DECK.visits = { minX: 14, maxX: 22, minZ: -20, maxZ: -14 }` (flush with the north and east slab edges, 6 u from comms, 11 u from the CV station), door pad 1.1 u south (`{x: 18, z: -12.9}`, facing north), spur from the plaza rim, stop `visits`, view zone `RF:visits` (camera south-west, yaw -PI/4), `tall: [{ ...visits, h: 8 }]` for the globe column, `roofActive` returns "visits". Registry: `RF:station:visits` footprint height 8.

- [ ] Tests: `expectSpaceRules` still passes with the station, the corner rect does not overlap the call pad, plaza, comms, CV or about; the door has a facing; the registry lists `RF:station:visits`.
- [ ] Commit `feat(stats): RF Visitor Observatory footprint, door and view zone`.

### Task 8: 3D station rendering and L1 tile

**Files:** Modify `fx/holoFx.ts` (modes `globe` 9, `dot` 10; `vC` varying), create `floors/roof/VisitsStation.tsx`, `floors/roof/visitsPanel.ts`, `src/experience/visits3d.ts`; Modify `Roof.tsx`, `SignalGarden.tsx` (pedestal solids, drone target for visits), `Lobby.tsx`, `fx/holoIcons.ts` (`ROOF_ICONS.visits`), `Experience.tsx` (mount `StatsLoader`, labels); Tests `tests/unit/visits-panel3d.test.ts`, `floating-sign.test.ts` stays green.

- Globe: body `HoloMesh` on `IcosahedronGeometry(2.2, 3)` (1,280 triangles), land dots one instanced plane per land cell (full every cell, lite every other column; under 2,600 triangles), country dots one instanced mesh (count from the snapshot, 0 when hidden), all `createHoloMaterial` (one program). Rotation 0.12 rad/s, static under reduced motion (Indonesia toward the plaza), faster while `RF:visits` is open.
- Panel: one instanced holo `plate` mesh (backing and the 3D vs Classic bar) and one `BatchedLabels` (title, visits 30 days, since launch, countries, questions asked, top floor, 3D vs Classic, source and updated line; "Stats offline" when hidden; "Delayed" note).
- L1: `useVisitsTile(label)` appends `{ id: "visits", value, label }` to the ring stats when ready; `StatsRing` keyed by tile count.
- [ ] Commit `feat(stats): Visitor Observatory globe and panel, L1 visits tile`.

### Task 9: E2E, budgets, docs, evidence

**Files:** `e2e/visits.spec.ts` (3D: point-and-go to the station opens the drawer, radios change the status, reduced motion freezes the globe, deep link `/en/contact#visits?tier=lite`), `scripts/e2e-plan.ts` rules, `README.md`, `docs/superpowers/specs/agent-hq/01-*.md` (RF layout), `08-*.md` (budgets), `AGENTS.md` (layout and content notes).

- [ ] `bun run verify:quick`, `E2E_PORT=4449 bun run e2e:changed`, `E2E_PORT=4449 bun run e2e:perf`, visual gate for RF and L1 (`scripts/visual-gate.ts --profile strict` expecting changes only at the station and the ring), captures at 1440x900 full, 2560x1440 full, 390x844 lite with the fixture.
- [ ] Open the PR (draft until S1 merges), post the evidence comment, get the four required checks green.

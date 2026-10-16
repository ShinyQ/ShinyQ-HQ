# Public visit stats

Public visit stats (Layer 1): the snapshot contract, the `hq-stats` pipeline and beacons, then the display on the site.

Index: [AGENTS.md](../../AGENTS.md).

## Pipeline

### Design and owner rules

- Design: appendix 06 section 4.1; Worker runbook `workers/stats/README.md`; deploy [`docs/deploy.md`](../deploy.md) section 13.
- Owner decisions:
  - public numbers with no thresholds;
  - updated daily from complete UTC days;
  - countries as dots only (ISO alpha-2, never `XX` or `T1`);
  - the label "visits" / "kunjungan" (never visitors);
  - a "Don't count my visits" switch.

### Contract

- `StatsSnapshotV1` in `src/lib/stats/protocol.ts`.
  - Periods `d30` and `all`.
  - Fields `visits`, `pageViews`, `countries`, `topFloor`, `mode`, `asks`.
  - An optional, backward-compatible `perf` block: `sessions`, `measured`, `fps55` and the median `explore` bucket per period.
    - From Analytics Engine `perf_events` weighted by `SUM(_sample_interval)`.
    - An invalid `perf` block is dropped alone, the rest of the snapshot stays.
    - Ledger days without `perf` inside the 90-day Analytics Engine retention are filled once, nothing else on them changes.
    - Read it through `perfView` in `@/lib/visits/model` (appendix 06 section 4.1).
- Clients validate with `parseStatsSnapshot` (hand-written, no zod) and hide on null.
- `GET /api/stats` (no parameters) answers 200 with the snapshot or 204.
- Change the contract only with a new version (`v: 2`) and both sides in one PR.

### Cron Worker

- The Cron Worker `hq-stats` (`workers/stats/`, `17 */4 * * *` UTC, scheduled only, `workers_dev = false`) reads:
  - Web Analytics: GraphQL `rumPageloadEventsAdaptiveGroups`, filtered by siteTag, `bot: 0` and `WA_HOSTS`;
  - Analytics Engine: `ask_events`, `visit_events`, `SUM(_sample_interval)`.
- It appends one rollup per finalized UTC day to the KV ledger `stats:days:v1` and writes `stats:v1` (today so far included, never stored).
- A stored day is never recomputed, so it is stored only from an exact Web Analytics answer.
  - `waExact`: unsampled, groups adding up; else the day stays provisional for up to 3 days.
- A failed run writes nothing and the next one catches up.
- Pure math in `workers/stats/src/rollup.ts`; paths map to floors with `floorOfPath` (the site's `parseHQUrl`).

### One beacon only

- Pages Web Analytics (project Metrics tab) must stay off: its injected beacon wins over the site's and ignores the opt-out.
- Checked by `scripts/injected-analytics.ts` in deploy-smoke and uptime ([`docs/deploy.md`](../deploy.md) section 13).

### Abuse caps

Security S7.

- `/api/rum` and `/api/visit` read bodies with `readCapped` (`functions/_lib/security.ts`, also used by `/api/ask`), which stops streaming at the byte cap even without `Content-Length`.
- The Worker freezes a day's 3D vs Classic split (`MODE_FREEZE`) and its `perf` block (`PERF_FREEZE`) when beacon points or RUM sessions exceed `max(30, 3 x page views)`, so forged beacons cannot set public numbers.

### Ask events

- Ask events carry blob8 `topic` and blob9 `chip` (`functions/_lib/askStats.ts`).
- The client sends `chip` (the curated id, `useAskThread`); the server keeps it only when the question is that chip's text.
- Ids only, never question text. See [ask.md](ask.md).

### Visit beacon

- `src/lib/stats/visitClient.ts` (mounted by `VisitBeacon` in the locale layout) sends one `{ v: 1, mode }` per page lifetime on the first hide or `pagehide`.
  - `3d` when `html[data-hq]` was set, `classic` after 3 s on screen, `both`.
- Memory only.
- Never under Do Not Track, GPC, the opt-out, automation or crawlers (`?visit=1` forces it in tests, `?visit=0` opts out).

### Opt-out

- `localStorage["hq:stats-optout"] === "1"` (`src/lib/stats/optout.ts`; the display writes it and dispatches `hq:stats-optout`).
- It stops:
  - the visit beacon;
  - the RUM beacon (`decideRum`);
  - the Cloudflare Web Analytics beacon, which `Analytics.tsx` injects from an inline guard (CSP unchanged).
- Keep it that way: never render the beacon tag directly.

### Kill switch and tokens

- Kill switch `STATS_ENABLED` in `wrangler.toml`.
- The Worker's `WA_TOKEN` comes from the `production` environment secret `CF_STATS_TOKEN` (Account Analytics Read only, 90 days; `CF_EVAL_TOKEN` until it exists).
- `WA_ACCOUNT_ID` comes from `CLOUDFLARE_ACCOUNT_ID`.
- Both are set by `deploy.yml` after `scripts/stats-token-check.ts` passes; never log or print either.

### Pipeline tests

- `tests/stats/`: protocol, rollup, Worker run with mocked APIs, Functions, beacon client, guard, token checks.
- `tests/ask/ask-stats.test.ts`, `e2e/visit.spec.ts`.

## Display

Owner plan "Public visit stats, Layer 1", S2.

### Data and freshness

- Data: the daily snapshot `StatsSnapshotV1` from `GET /api/stats` (S1's pipeline; 200 with the snapshot, or 204).
- Display code imports the contract through `@/lib/visits/contract` (it re-exports S1's `@/lib/stats/protocol` and `@/lib/stats/fixtures`).
- A 204 means no snapshot yet (before the first cron run) and hides quietly.
- `requestStats()` fetches once per page:
  - idle after the first 3D frame (`useStatsAfterFirstFrame` in `src/experience/visits3d.ts`);
  - after hydration for the home ticker;
  - when the Contact section nears the viewport (never under the 3D tower).
- Freshness (`freshness` in `model.ts`):
  - invalid bodies, a 204, errors and snapshots older than 7 days are `hidden` everywhere;
  - older than 48 hours shows the "delayed" note.

### Owner rules for the copy

- Numbers show now (no thresholds).
- Countries are dots only (never a number per country, the table lists names).
- The label is "visits" / "kunjungan".
- Every stat block shows the window ("Last 30 complete days" or "Since <date>"), the source ("Cloudflare Web Analytics, sampled estimates") and "Updated daily".
- Copy lives in `messages/*.json` `stats`.
- Numbers go through `formatCount` (exact below 10,000, CLDR compact above: "12.3K", "12,3 rb"; ID uses a no-break space) and `formatCountLong` for screen readers.

### Filters

- Topic (All, Work, AI, Career) and Period (Last 30 days, Since launch) are native radio groups in fieldsets, never tabs.
- One polite `role="status"` line (`VisitsPanel`).
- Every combination is answered from the one snapshot (`visitsView`).

### Placements

- L1 Visitor Observatory (owner decision), see [floor-l1-lobby.md](floor-l1-lobby.md):
  - the Lobby's south-west corner, `LOBBY.observatory` x -24 to -18, z 14 to 21;
  - station `L1:station:visits` in `lobbyItems`, door pad on its north side;
  - globe and panel in `floors/lobby/VisitsStation.tsx`, pure parts in `floors/lobby/observatory.ts`, door and view zones in `floors/lobby/observatoryLayout.ts`;
  - seven draw calls: the plinth and its outline on the hall's merged solid and line materials, five on the holo-fx program, modes `globe` and `dot`;
  - probes `__hq.probes.spectacle.observatory`, `observatoryCountries`.
- RF keeps its deck without the observatory.
- The L1 ring tile (`useRingStats`, appended when ready; the L1:stats drawer links to L1:visits; probe `ringTiles`).
- The home ticker (`StatTicker` `extra`, `TickerVisits` with the live marker).
- The Contact "Visits" section (`VisitsSection`, lazy `VisitsPanel` chunk).

### Opt-out toggle

- `OptOutToggle` lives in the L1:visits drawer, labelled `stats.optOut`.
- The Classic site footer shows neither it nor a privacy line (owner decision).
- It writes S1's key through `optOutStore` (`STATS_OPTOUT_KEY`, `STATS_OPTOUT_VALUE`, `STATS_OPTOUT_EVENT` from `@/lib/stats/optout`): `"1"` or removed, then the `hq:stats-optout` window event.
- The key stops the visit beacon, the Cloudflare beacon and the RUM beacon (see [Opt-out](#opt-out)).

### Display tests

- `tests/unit/visits-{model,store,geo}.test.ts`, `tests/unit/lobby-observatory.test.ts`.
- `tests/hud/{VisitsPanel,OptOutToggle}.test.tsx`.
- `e2e/visits.spec.ts` (mocks `/api/stats`).

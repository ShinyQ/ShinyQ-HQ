# Public visit stats

Public visit stats (Layer 1): the snapshot contract, the `hq-stats` pipeline and beacons, then the display on the site.

Index: [AGENTS.md](../../AGENTS.md).

## Pipeline

### Design and owner rules

- Design: appendix 06 section 4.1; Worker runbook `workers/stats/README.md`; deploy [`docs/deploy.md`](../deploy.md) section 13.
- Owner decisions:
  - public numbers with no thresholds;
  - updated every 2 hours (cron `17 */2 * * *` UTC): finalized complete UTC days plus today so far;
  - countries as dots only (ISO alpha-2, never `XX` or `T1`);
  - the label "visits" / "kunjungan" (never visitors);
  - no "Don't count my visits" switch (removed 2026-10-23): Do Not Track, GPC, automation and crawlers are the only skips.

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
- `GET /api/stats` (no parameters; `functions/_lib/stats.ts`) validates the KV value again and answers 200 with the snapshot (ETag, 304 on a match, `max-age=600, stale-while-revalidate=3600`; KV read cached 300 s) or 204 (`max-age=300`) when the kill switch is off or nothing valid is stored. `HEAD` works the same; other methods get 405.
- `POST /api/visit` writes one `visit_events` point per page lifetime (`functions/_lib/visit.ts`; 204 and no point when the kill switch is off); other methods get 405.
- Change the contract only with a new version (`v: 2`) and both sides in one PR.

### Cron Worker

- The Cron Worker `hq-stats` (`workers/stats/`, `17 */2 * * *` UTC, scheduled only, `workers_dev = false`) reads:
  - Web Analytics: GraphQL `rumPageloadEventsAdaptiveGroups`, filtered by siteTag, `bot: 0` and `WA_HOSTS`;
  - Analytics Engine: `ask_events` (Turnstile rejects and blob13 `auto` left out), `visit_events`, `SUM(_sample_interval)`.
- It appends one rollup per finalized UTC day to the KV ledger `stats:days:v1` and writes `stats:v1` (today so far included, never stored).
- A stored day is never recomputed, so it is stored only from an exact Web Analytics answer.
  - `waExact`: unsampled, groups adding up; else the day stays provisional for up to 3 days.
- A failed run writes nothing and the next one catches up.
- Pure math in `workers/stats/src/rollup.ts`; paths map to floors with `floorOfPath` (the site's `parseHQUrl`).

### One beacon only

- Pages Web Analytics (project Metrics tab) must stay off: its injected beacon wins over the site's and ignores the automation guard.
- Checked by `scripts/injected-analytics.ts` in deploy-smoke and uptime ([`docs/deploy.md`](../deploy.md) section 13).

### Abuse caps

Security S7.

- `/api/rum` and `/api/visit` read bodies with `readCapped` (`functions/_lib/security.ts`, also used by `/api/ask`), which stops streaming at the byte cap even without `Content-Length`.
- The Worker freezes a day's 3D vs Classic split (`MODE_FREEZE`) and its `perf` block (`PERF_FREEZE`) when beacon points or RUM sessions exceed `max(30, 3 x page views)`, so forged beacons cannot set public numbers.

### Ask events

- Ask events carry blob8 `topic` and blob9 `chip` (`functions/_lib/askStats.ts`).
- The client sends `chip` (the curated id, `useAskThread`); the server keeps it only when the question is that chip's text.
- Automated browsers: the client sends `auto: true` when `navigator.webdriver` is set (`src/ask/client.ts`); the handler logs blob13 `auto` (only a literal `true`, anything else is ignored) and the Worker leaves those rows out of the question counts.
  - Counting only: the flag never changes an answer, a limit, Turnstile or any safety check (a forged flag can only hide a question from the public count).
- Ids only, never question text. See [ask.md](ask.md).

### Cloudflare Web Analytics beacon

- `src/components/Analytics.tsx` renders an inline loader (only when `NEXT_PUBLIC_CF_BEACON_TOKEN` is set at build) that injects `beacon.min.js` with `defer`, `data-cf-beacon` and `spa: true`.
- It waits for the `load` event, then for the app chunk requests (the defer-scripts loader inserts every chunk script in one loop after first paint, often after `load`; a MutationObserver waits for one `/_next/static/chunks/` script, `nomodule` polyfills excluded, at most `CHUNK_WAIT_MS` = 1 s), then for idle (`requestIdleCallback`, `IDLE_TIMEOUT_MS` = 500 ms deadline).
- Never in an automated browser (`navigator.webdriver`: Playwright, Lighthouse, headless checks), checked at inject time; Cloudflare's own `bot: 0` filter does not catch every headless browser.
- Page views are kept: the beacon sends the page load at once when the document is already complete (from the Navigation Timing entry), and `spa: true` records later History navigations. Only a visit that leaves before the beacon loads is not counted.
- The loader must never contain the text `data-hq-defer`: `scripts/defer-scripts.ts` skips a page that carries it (`tests/stats/analytics-guard.test.ts`).
- Its sha256 is added to the page's script policy at build (`scripts/csp-hashes.ts`); the beacon host is in script-src.

### Visit beacon

- `src/lib/stats/visitClient.ts` (mounted by `VisitBeacon` in the locale layout) sends one `{ v: 1, mode }` per page lifetime on the first hide or `pagehide`.
  - `3d` when `html[data-hq]` was set, `classic` after 3 s on screen, `both`.
- Memory only.
- Never under Do Not Track, GPC, automation or crawlers (`?visit=1` forces it in tests, `?visit=0` turns it off).

### Skips

- There is no visitor opt-out (owner decision 2026-10-23). On start the visit client (`startVisitBeacon`) removes a stale `localStorage["hq:stats-optout"]` left by the retired switch (`clearLegacyOptOut`, errors ignored), so a visitor who once opted out is counted again; no beacon reads that key.
- Do Not Track and GPC stop the visit beacon and the RUM beacon (`decideRum`), even when forced; not the Cloudflare loader.
- Automation (`navigator.webdriver`) stops the visit beacon, the RUM beacon and the Cloudflare Web Analytics beacon (`Analytics.tsx` checks it at inject time), plus counts Ask questions out (blob13 `auto`): only `?visit=1` and `?rum=1` force the first-party beacons in tests; nothing forces the Cloudflare beacon.
- Keep it that way: never render the beacon tag directly.

### Kill switch and tokens

- Kill switch `STATS_ENABLED` in `wrangler.toml`.
- The Worker's `WA_TOKEN` comes from the `production` environment secret `CF_STATS_TOKEN` (Account Analytics Read only, 90 days; `CF_EVAL_TOKEN` until it exists).
- `WA_ACCOUNT_ID` comes from `CLOUDFLARE_ACCOUNT_ID`.
- Both are set by `deploy.yml` after `scripts/stats-token-check.ts` passes; never log or print either.

### Pipeline tests

- `tests/stats/`: protocol, rollup, Worker run with mocked APIs, Functions, beacon client, guard, token checks.
- `tests/ask/ask-stats.test.ts`, `e2e/visit.spec.ts` (an automated session sends no visit or RUM beacon and never loads the Cloudflare beacon).

## Display

Owner plan "Public visit stats, Layer 1", S2.

### Data and freshness

- Data: the 2-hour snapshot `StatsSnapshotV1` from `GET /api/stats` (S1's pipeline; 200 with the snapshot, or 204).
- Display code imports the contract through `@/lib/visits/contract` (it re-exports S1's `@/lib/stats/protocol` and `@/lib/stats/fixtures`).
- A 204 means no snapshot yet (before the first cron run) and hides quietly.
- `requestStats()` fetches once per page:
  - idle after the first 3D frame (`useStatsAfterFirstFrame` in `src/experience/visits3d.ts`);
  - after hydration for the home ticker;
  - when the Contact section nears the viewport (never under the 3D tower).
- Freshness (`freshness` in `model.ts`):
  - invalid bodies, a 204, errors and snapshots older than 7 days are `hidden` everywhere;
  - older than 6 hours (`DELAYED_AFTER_MS`, 3 missed runs) shows the "delayed" note.

### Owner rules for the copy

- Numbers show now (no thresholds).
- Countries are dots only (never a number per country, the table lists names). A country counts with at least one sampled page view (the Worker keeps a country with page views or visits), so the captions say "page view", not "visit".
- The label is "visits" / "kunjungan".
- Every stat block shows the window ("Last 30 complete days" or "Since <date>"), the source ("Cloudflare Web Analytics, sampled, rounded to tens": Web Analytics samples page loads, so small counts move in steps of 10 and a quiet day can read 0) and "Updated every 2 hours" (`stats.updated`).
- Copy lives in `messages/*.json` `stats`.
- Counts in sentences use ICU plurals with the number as the selector and the formatted text as a separate argument (`{count, plural, one {{n} pick} other {{n} picks}}`); Indonesian has no plural forms.
- The 3D vs Classic split's note says it is the share of visits the site's own beacon saw (it skips Do Not Track and automation), so its base is smaller than the Web Analytics visit total.
- Numbers go through `formatCount` (exact below 10,000, CLDR compact above: "12.3K", "12,3 rb"; ID uses a no-break space) and `formatCountLong` for screen readers.

### Filters

- Topic (All, Work, AI, Career) and Period (Last 30 days, Since launch) are native radio groups in fieldsets, never tabs.
- One polite `role="status"` line (`VisitsPanel`).
- Every combination is answered from the one snapshot (`visitsView`).
- Suggested questions: `visitsView` sorts the chips by count (desc, ties by id) after the Topic filter and keeps the top `TOP_CHIPS` = 5 (owner decision 2026-10-23), in both placements (the L1:visits drawer and the Contact section share `VisitsPanel`); `stats.chipsNote` says "up to five".

### Placements

- L1 Visitor Observatory (owner decision), see [floor-l1-lobby.md](floor-l1-lobby.md):
  - the Lobby's south-west corner, `LOBBY.observatory` x -24 to -18, z 20 to 27;
  - station `L1:station:visits` in `lobbyItems`, door pad on its north side;
  - globe and panel in `floors/lobby/VisitsStation.tsx`, pure parts in `floors/lobby/observatory.ts`, door and view zones in `floors/lobby/observatoryLayout.ts`;
  - seven draw calls: the plinth and its outline on the hall's merged solid and line materials, five on the holo-fx program, modes `globe` and `dot`;
  - probes `__hq.probes.spectacle.observatory`, `observatoryCountries`.
- RF keeps its deck without the observatory.
- The L1 ring tile (`useRingStats`, appended when ready; the L1:stats drawer links to L1:visits; probe `ringTiles`).
- The home ticker (`StatTicker` `extra`, `TickerVisits` with the live marker).
- The Contact "Visits" section (`VisitsSection`, lazy `VisitsPanel` chunk).

### Display tests

- `tests/unit/visits-{model,store,geo}.test.ts`, `tests/unit/lobby-observatory.test.ts`.
- `tests/hud/VisitsPanel.test.tsx`.
- `e2e/visits.spec.ts` (mocks `/api/stats`).

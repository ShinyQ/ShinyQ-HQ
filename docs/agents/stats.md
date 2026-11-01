# Public visit stats

Public visit stats (Layer 1): the snapshot contract, the `hq-stats` pipeline and beacons, then the display on the site.

Index: [AGENTS.md](../../AGENTS.md).

## Pipeline

### Design and owner rules

- Design: appendix 06 section 4.1; Worker runbook `workers/stats/README.md`; deploy [`docs/deploy.md`](../deploy.md) section 13.
- Owner decisions:
  - public numbers with no thresholds;
  - visits are the site's own count (decision 2026-10-24): one visit ping per browser tab session, Do Not Track and GPC counted, automation and crawlers skipped; Web Analytics gives countries, page views and visits before the cutover;
  - today is live (`/api/stats` adds the pings since the last run, about a minute behind); the snapshot runs every hour (cron `17 * * * *` UTC): finalized complete UTC days plus today so far;
  - countries as dots only (ISO alpha-2, never `XX` or `T1`);
  - the label "visits" / "kunjungan" (never visitors);
  - no "Don't count my visits" switch (removed 2026-10-23): automation and crawlers are the only skips of the visit beacon (Do Not Track and GPC still stop the RUM beacon).

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
- `GET /api/stats` (no parameters; `functions/_lib/stats.ts`) validates the KV value again and answers 200 with the snapshot (ETag, 304 on a match, `max-age=30, stale-while-revalidate=30`; KV reads cached 60 s) or 204 (`max-age=60`) when the kill switch is off or nothing valid is stored. `HEAD` works the same; other methods get 405.
  - Live today: it reads the live tail `stats:live:v1` (`src/lib/stats/live.ts`: `from`, the pings the snapshot already counted since then, the snapshot's `updatedAt`) and asks the hq-stats Worker through the `STATS` service binding for the pings since `from`; the difference is added to `visits.d30` and `visits.all`.
  - Skipped (snapshot served as it is) when the tail is missing, from another run, `from` is null, the Worker fails or takes over `LIVE_TIMEOUT_MS` (1.5 s), or the difference is not between 1 and `LIVE_MAX_DELTA` (300). One isolate reuses a count for `LIVE_MEMO_MS` (30 s).
- `POST /api/visit` writes one `visit_events` point per visit ping (`{ v: 1, kind: "visit" }`, blob2 `visit`; with an allowlisted `src`, blob3 the tag), mode ping (`{ v: 1, mode }`) or intent ping (`{ v: 1, intent }`, blob2 `intent`, blob3 the intent) (`functions/_lib/visit.ts`; 204 and no point when the kill switch is off); other methods get 405. The Worker reads only blob2 `visit` and the modes, so tags and intents never change a public number.
- Change the contract only with a new version (`v: 2`) and both sides in one PR.

### Cron Worker

- The Cron Worker `hq-stats` (`workers/stats/`, `17 * * * *` UTC, `workers_dev = false`, no route) reads:
  - Web Analytics: GraphQL `rumPageloadEventsAdaptiveGroups`, filtered by siteTag, `bot: 0` and `WA_HOSTS`;
  - Analytics Engine: `ask_events` (Turnstile rejects and blob13 `auto` left out), `visit_events`, `SUM(_sample_interval)`.
- It appends one rollup per finalized UTC day to the KV ledger `stats:days:v1` and writes `stats:v1` (today so far included, never stored), then the live tail `stats:live:v1` once a cutover exists.
- Visit source per UTC day (`buildRollups`, `VisitSource`):
  - the cutover is the first visit ping (`min(timestamp)` per group in the visits query, no extra query), kept in the ledger's `cutover` once seen;
  - days before the cutover day: Web Analytics visits (stored history never changes);
  - the cutover day: Web Analytics visits before the cutover time (one days-only GraphQL query until the day is stored) plus that day's pings (`visitSource: "mixed"`);
  - later days: pings only (`visitSource: "first-party"`, `firstParty` kept for audits);
  - `VISIT_FREEZE`: a day with more pings than `max(50, 5 x page views)` keeps its Web Analytics visits (`visitsFrozen`) and writes a live tail with `from: null`.
- Fetch handler `GET /live?from=<ISO seconds>` (`workers/stats/src/live.ts`): one fixed Analytics Engine count of visit pings since `from` (not in the future, at most 8 days old); reachable only through the Pages `STATS` service binding (no route, no workers.dev URL).
- Live read budget (owner cost guard): at most one live Analytics Engine query a minute across every instance, about 1,440 a day whatever the traffic.
  - Layer 1: the Cache API (`caches.default`, key from `from`, `LIVE_CACHE_SECONDS` = 60). It is per data center, so it saves calls but is not the cap.
  - Layer 2, the cap: one `LiveGate` Durable Object (SQLite-backed, free plan; binding `LIVE_GATE`, `idFromName("live")`) keeps the last count and query time in its storage and queries only when the last query is at least `LIVE_QUERY_EVERY_MS` (60 s) old; concurrent callers share one query, another `from` inside the window answers 503, and a failure uses the slot too (no retry queries).
  - Not KV: a KV timestamp guard would write up to 1,440 times a day, over the account's free 1,000 writes shared with Ask.
  - Any non-200 from `/live` makes `/api/stats` serve the hourly snapshot as it is.
  - Daily Analytics Engine read queries: about 72 from the hourly runs plus at most 1,440 live, under the 10,000 a day of the Workers Free plan.
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
- `/api/visit` caps points per isolate and minute (`VISIT_ISOLATE_CAP`) and per visitor and hour (`VISIT_IP_CAP`: 20 visit pings, 60 mode pings, 20 intent pings), keyed by the salted, daily-rotating IP hash (`visitorHash` with `ASK_IP_SALT_SEED`) in memory only; over the per-visitor cap it still answers 204 with no point.
- The Worker keeps a day's Web Analytics visits when its pings outrun its page views (`VISIT_FREEZE`), and `/api/stats` adds at most `LIVE_MAX_DELTA` live pings.
- The Worker freezes a day's 3D vs Classic split (`MODE_FREEZE`) and its `perf` block (`PERF_FREEZE`) when beacon points or RUM sessions exceed `max(30, 3 x page views)`, so a forged flood is capped: below the ceiling forged beacons count like real ones (an accepted tolerance, security audit 2026-10-24); above it the day keeps zero.

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

- `src/lib/stats/visitClient.ts` (mounted by `VisitBeacon` in the locale layout) sends two pings with `sendBeacon`:
  - the visit ping `{ v: 1, kind: "visit" }` as soon as the page is visible (and not prerendering), once per browser tab session: `sessionStorage["hq:visit"]` is set after an accepted beacon (a memory flag when storage is blocked; a refused beacon retries on the next show);
  - the mode ping `{ v: 1, mode }` once per page lifetime on the first hide or `pagehide`: `3d` when `html[data-hq]` was set, `classic` after 3 s on screen, `both`. It never counts as a visit.
  - the visit ping carries the landing's `?src=` tag when it is one of `VISIT_SOURCES` (`li` LinkedIn, `gh` GitHub, `cv` the CV, `mail` an email signature; `visitSource`); any other value is dropped, so no free text reaches a point.

### Intent counts (private)

Owner decision 2026-11-01: how many visitors take a step toward hiring him, never shown on the site.

- The intent ping `{ v: 1, intent }` (`VISIT_INTENTS`: `cv`, `email`, `linkedin`, `github`), once per browser tab session and intent (`sessionStorage["hq:intent:<intent>"]`), with the same skips as the visit ping (automation and crawlers; `?visit=1` forces it in tests).
- `cv`: `countIntent("cv")` in `DialogHost` when the CV reader opens, so every entry point counts (Classic buttons, the boot card, the 3D Rover menu and kiosk).
- `email`, `linkedin`, `github`: a capture click listener (`intentOf` in `visitClient.ts`) on `mailto:` links, `[data-hq-intent="email"]` controls (the About copy email button) and `https://linkedin.com/` or `https://github.com/` links. It stays on for the whole page lifetime, also after the mode ping.
- Report, owner only: `CF_EVAL_TOKEN=... CF_ACCOUNT_ID=... bun scripts/stats-intents.ts [--days 30]` prints every intent and every `?src=` channel (zeros and untagged visits included). It refuses to run in CI.
- Tests: `tests/stats/shared.test.ts`, `tests/stats/visit-endpoint.test.ts`, `tests/stats/visit-client.test.ts`, `tests/stats/stats-intents.test.ts`, `e2e/visit.spec.ts`.
- No cookie, no identifier, no URL.
- Never under automation or crawlers (`?visit=1` forces it in tests, `?visit=0` turns it off); Do Not Track and GPC are counted (decision 2026-10-24).

### Skips

- There is no visitor opt-out (owner decision 2026-10-23). On start the visit client (`startVisitBeacon`) removes a stale `localStorage["hq:stats-optout"]` left by the retired switch (`clearLegacyOptOut`, errors ignored), so a visitor who once opted out is counted again; no beacon reads that key.
- Do Not Track and GPC stop the RUM beacon (`decideRum`), even when forced; not the visit beacon (decision 2026-10-24) nor the Cloudflare loader.
- Automation (`navigator.webdriver`) stops the visit beacon, the RUM beacon and the Cloudflare Web Analytics beacon (`Analytics.tsx` checks it at inject time), plus counts Ask questions out (blob13 `auto`): only `?visit=1` and `?rum=1` force the first-party beacons in tests; nothing forces the Cloudflare beacon.
- Keep it that way: never render the beacon tag directly.

### Kill switch and tokens

- Kill switch `STATS_ENABLED` in `wrangler.toml`.
- The Worker's `WA_TOKEN` comes from the `production` environment secret `CF_STATS_TOKEN` (Account Analytics Read only, 90 days; `CF_EVAL_TOKEN` until it exists).
- `WA_ACCOUNT_ID` comes from `CLOUDFLARE_ACCOUNT_ID`.
- Both are set by `deploy.yml` after `scripts/stats-token-check.ts` passes; never log or print either.

### Pipeline tests

- `tests/stats/`: protocol, rollup, Worker run with mocked APIs (cutover, live tail, `GET /live`), Functions (live merge, per-visitor cap), beacon client, guard, token checks.
- `tests/ask/ask-stats.test.ts`, `e2e/visit.spec.ts` (an automated session sends no visit or RUM beacon and never loads the Cloudflare beacon; the visit ping goes out on show, once per tab session).
- `e2e/visit-live.spec.ts`: the real visit and stats Functions behind a page over in-memory stand-ins; a fresh tab raises the shown number, a reload in the same tab does not.

## Display

Owner plan "Public visit stats, Layer 1", S2.

### Data and freshness

- Data: the hourly snapshot `StatsSnapshotV1` (with today's live pings added) from `GET /api/stats` (S1's pipeline; 200 with the snapshot, or 204).
- Display code imports the contract through `@/lib/visits/contract` (it re-exports S1's `@/lib/stats/protocol` and `@/lib/stats/fixtures`).
- A 204 means no snapshot yet (before the first cron run) and hides quietly.
- `requestStats()` fetches once per page:
  - idle after the first 3D frame (`useStatsAfterFirstFrame` in `src/experience/visits3d.ts`);
  - after hydration for the home stats ledger;
  - when the Contact section nears the viewport (never under the 3D tower).
- Freshness (`freshness` in `model.ts`):
  - invalid bodies, a 204, errors and snapshots older than 7 days are `hidden` everywhere;
  - older than 3 hours (`DELAYED_AFTER_MS`, 3 missed hourly runs) shows the "delayed" note.

### Owner rules for the copy

- Numbers show now (no thresholds).
- Countries are dots only (never a number per country, the table lists names). A country counts with at least one sampled page view (the Worker keeps a country with page views or visits), so the captions say "page view", not "visit".
- The label is "visits" / "kunjungan".
- The default window is since launch (`all`, owner decision 2026-10-23): every visits number on the site reads `visits.all` (and `asks.all`, `perf.all` where shown); only the Period radio's "Last 30 days" and the observatory panel's 30-day row show `d30`.
- Every stat block shows the window ("Since <date>", "since launch" or "Last 30 days, including today"), the source (`stats.source`: visits from the site's own anonymous counter, one per browser tab, no cookies, Web Analytics estimates before late October 2026; countries and page views from Cloudflare Web Analytics, sampled) and "Today live, earlier days every hour" (`stats.updated`). The 3D observatory panel uses the short `stats.panel.source`.
- Copy lives in `messages/*.json` `stats`.
- Counts in sentences use ICU plurals with the number as the selector and the formatted text as a separate argument (`{count, plural, one {{n} pick} other {{n} picks}}`); Indonesian has no plural forms.
- The 3D vs Classic split's note says it is the share of page loads (mode pings) that used each view, from the site's own beacon (automation skipped); its base is page loads, not visits.
- Numbers go through `formatCount` (exact below 10,000, CLDR compact above: "12.3K", "12,3 rb"; ID uses a no-break space) and `formatCountLong` for screen readers.

### Filters

- Topic (All, Work, AI, Career) and Period (Since launch, then Last 30 days: `PERIODS` lists the default first) are native radio groups in fieldsets, never tabs. `VisitsPanel` opens on Since launch in both placements.
- One polite `role="status"` line (`VisitsPanel`).
- Every combination is answered from the one snapshot (`visitsView`).
- Suggested questions: `visitsView` sorts the chips by count (desc, ties by id) after the Topic filter and keeps the top `TOP_CHIPS` = 5 (owner decision 2026-10-23), in both placements (the L1:visits drawer and the Contact section share `VisitsPanel`); `stats.chipsNote` says "up to five".

### Placements

- Every placement shows the since-launch total by default (owner decision 2026-10-23), with its window in the copy:
  - `VisitsPanel` (the L1:visits drawer and the Contact section): opens on Since launch, window "Since <date>";
  - the L1 observatory panel: visits since launch in large type ("visits since launch", `stats.panel.visitsAll`), then the 30-day total ("in the last 30 days", `stats.panel.visits30`); countries, questions, top floor and split since launch;
  - the L1 ring tile and the home stats ledger: `stats.tile` ("visits since launch (estimate)"); the ledger item's title starts with `stats.periods.all`;
  - the `/build` tile and the B1 drawer tile: `build.tiles.visits` ("Visits since launch");
  - the L3 Ops live panel: `production.live.visits`, with the perf block since launch;
  - B1: the counter plate (`engine.reactor.visits`), the reactor pulse and its drawer (`build.reactor.visits`, `build.reactor.asks`).
- L1 Visitor Observatory (owner decision), see [floor-l1-lobby.md](floor-l1-lobby.md):
  - the Lobby's south-west corner, `LOBBY.observatory` x -24 to -18, z 20 to 27;
  - station `L1:station:visits` in `lobbyItems`, door pad on its north side;
  - globe and panel in `floors/lobby/VisitsStation.tsx`, pure parts in `floors/lobby/observatory.ts`, door and view zones in `floors/lobby/observatoryLayout.ts`;
  - seven draw calls: the plinth and its outline on the hall's merged solid and line materials, five on the holo-fx program, modes `globe` and `dot`;
  - probes `__hq.probes.spectacle.observatory`, `observatoryCountries`.
- RF keeps its deck without the observatory.
- The L1 ring tile (`useRingStats`, appended when ready; the L1:stats drawer links to L1:visits; probe `ringTiles`).
- The home stats ledger (`StatTicker` `extra`, `TickerVisits` with the live marker).
- The Contact "Visits" section (`VisitsSection`, lazy `VisitsPanel` chunk).

### Display tests

- `tests/unit/visits-{model,store,geo}.test.ts`, `tests/unit/lobby-observatory.test.ts`.
- `tests/hud/VisitsPanel.test.tsx`.
- `e2e/visits.spec.ts` (mocks `/api/stats`).

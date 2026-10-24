# hq-stats: public visit stats Cron Worker

Job every hour (`17 * * * *`, UTC: 17 minutes past every hour; owner decision 2026-10-24, was every 2 hours) behind
the public visit stats (Layer 1). It reads two sources with one read-only Account Analytics token, keeps one rollup
per finalized UTC day, and writes the public snapshot (days so far, today included) and its live tail that
`GET /api/stats` (Pages Function, `functions/api/stats.ts`) serves. Its fetch handler (`GET /live`) counts today's
visit pings for `/api/stats`; it has no route and no workers.dev URL, so only the Pages `STATS` service binding
reaches it.

```mermaid
flowchart LR
  WA[Web Analytics GraphQL<br/>visits before the cutover, page views, countries, paths] --> W[hq-stats<br/>hourly cron]
  AE[Analytics Engine SQL<br/>ask_events, visit_events, perf_events] --> W
  W -->|stats:days:v1 ledger + cutover| KV[(KV STATS_KV)]
  W -->|stats:v1 snapshot, stats:live:v1 tail| KV
  KV --> F[GET /api/stats] --> C[3D HQ and Classic site]
  F -->|STATS binding: GET /live?from=| L[hq-stats fetch handler] -->|visit pings since from| AE
```

- Contract: `StatsSnapshotV1` in `src/lib/stats/protocol.ts` (validated before every write and again
  in the Function).
- Sources: `src/sources.ts`. Web Analytics `rumPageloadEventsAdaptiveGroups` filtered by siteTag,
  `bot: 0` and the production hosts (`WA_HOSTS`; local `127.0.0.1` traffic shares the siteTag), grouped
  by `date`, each group with `avg { sampleInterval }`. Analytics Engine `ask_events` (blob8 topic, blob9 chip, Turnstile rejects excluded),
  `visit_events` (blob2 `visit` for the visit ping, else the mode; each group's `min(timestamp)` gives the cutover) and `perf_events` (the RUM beacon: blob4 median FPS bucket, blob6
  explore time bucket, `blob1 = '1'`), counted with `SUM(_sample_interval)`. Bucket strings outside the
  RUM contract (`src/lib/rum/protocol.ts`) are ignored.
- Visits (owner decision 2026-10-24): the cutover is the first visit ping, stored once in the ledger (`cutover`).
  Days before the cutover day keep Web Analytics visits; the cutover day is Web Analytics visits before the cutover
  time (one days-only GraphQL query, `fetchWaVisitsBetween`, until the day is stored) plus its pings
  (`visitSource: "mixed"`); later days are pings only (`"first-party"`). No visit is counted twice. A day with more
  pings than `max(50, 5 x page views)` keeps its Web Analytics visits (`VISIT_FREEZE`, `visitsFrozen`).
- Live tail: `stats:live:v1` (`src/lib/stats/live.ts`), written after the snapshot once a cutover exists: the start of
  the unstored days (or the cutover when later), the pings the snapshot counted since then and the snapshot's
  `updatedAt` (`from: null` when a tail day is frozen). `GET /api/stats` adds the pings since then.
- `GET /live?from=<ISO seconds>` (`src/live.ts`): one fixed SQL count of visit pings since `from` (not in the future,
  at most 8 days old; anything else 400), 502 with no detail on an error. Cost cap: the Cache API (60 s, per data
  center) first, then the single `LiveGate` Durable Object (binding `LIVE_GATE`, SQLite-backed, migration `v1`), which
  runs the query at most once a minute across every instance (about 1,440 a day at most; a different `from` inside
  the minute answers 503, failures use the slot too). A KV guard was not used: up to 1,440 writes a day would exceed
  the account's free 1,000.
- Math: `src/rollup.ts` (pure, `tests/stats/rollup.test.ts`). Floors come from Web Analytics paths via
  `floorOfPath` (the site's own route parser). Countries are ISO alpha-2 only (no `XX`, no `T1`),
  without counts. A day whose beacon points exceed `max(30, 3 x page views)` keeps a zero 3D vs Classic
  split (`frozen`); a day whose RUM sessions exceed the same `max(30, 3 x page views)` keeps a zero
  `perf` (`PERF_FREEZE`, `frozen`), so forged beacons cannot set the public numbers (security S7). The optional snapshot `perf` block (sampled 3D sessions, sessions with a median FPS
  bucket, sessions at "55+", median explore bucket) sums each day's `perf` over the period; the median
  is weighted (the first bucket where the running count reaches half the total).
- Run: `src/run.ts`. The first run backfills 183 days (Web Analytics keeps 184, Analytics Engine 3
  months) and starts the ledger at the first day with data, which becomes `since`. An empty ledger
  fetches the whole backfill window again on every run until the first day finalizes (bootstrap only).
- Finalized and provisional days: a UTC day is finalized (`finalizedThrough(now)`) once it ended at least
  `SETTLE_MS` (1 hour) ago, so late events land first. Finalized days are appended to the ledger once and
  never recomputed, so a finalized day is stored only from an exact Web Analytics answer (`waExact` in
  `src/rollup.ts`): every row unsampled (average `sampleInterval` 1) and the totals, countries and paths
  groups adding up to the same page views. Otherwise the day (and every later day, the ledger stays
  contiguous) stays provisional and is fetched again on the next runs; after `EXACT_GRACE_DAYS` (3) it
  is stored anyway and the run log says so. Why: on 2026-10-16 the 04:00 run got a coarse answer (700
  page views, 0 visits, 1000 per floor) for a day that had 333 page views and 36 visits, and kept it;
  the 12:00 run got the same answer and held the day back, a run at 12:15 got the exact one, so the cron
  runs 17 minutes past the hour. Every run also rolls up the days after that from the same queries: yesterday during
  the 00:00 run (it is not settled yet) and today so far. These provisional days enter the public
  snapshot but are never stored; the next run recomputes them. `d30` is the 30 days ending today (today
  partial) and `updatedAt` is the run time. A failed run writes nothing, so the last good snapshot stays,
  and the next one catches up every missed day.
- Perf backfill: stored days without `perf` (rolled up before it existed) that are inside the Analytics
  Engine retention (90 days) get `perf` filled once from one extra `perf_events` query; nothing else of
  those days changes, and older days stay without it (no data).
- Run budget (routine run): 1 Web Analytics GraphQL request (2 while the cutover day is unstored), 3 Analytics Engine
  SQL queries (asks, visits, perf; plus one perf backfill query at most), 2 KV reads (ledger and extra rows), and the
  snapshot and live tail writes every run. The ledger is written only when a day finalizes, perf is filled or the
  cutover is first seen, so at most 3 KV writes per run.
- Live budget: `GET /api/stats` asks `GET /live` at most once per Pages isolate every 30 s; the Cache API answers
  repeats per data center for 60 s and the `LiveGate` Durable Object allows one SQL query a minute globally.

Limits checked 2026-10-24 (hourly cadence):

| Limit | Value | This Worker |
|---|---|---|
| GraphQL Analytics API | 300 queries per 5 minutes per user | 1 to 2 per run, at most 48 a day |
| Cron Triggers | several schedules per Worker | 1 schedule |
| Workers KV (free plan) | 1,000 writes a day | 2 per run, 48 a day, plus one ledger write a day (the quota is per account, so it is shared with the Ask Function, see `docs/ask-runbook.md`) |
| Analytics Engine SQL API | 10,000 read queries a day on the Workers Free plan (not billed today) | 3 per run (72 a day) plus at most 1 live count a minute (1,440 a day), about 1,512 at most |
| Durable Objects (free plan, SQLite) | 100,000 requests a day | at most 1 `LiveGate` request per Pages isolate per 30 s on a cache miss |

## Configuration

| Name | Kind | Value |
|---|---|---|
| `STATS_KV` | KV binding | namespace `STATS_KV` (same id as the Pages binding) |
| `WA_SITE_TAG` | var | Web Analytics siteTag of kurniadi.pages.dev |
| `WA_HOSTS` | var | `kurniadi.pages.dev,kurniadi.dev` |
| `WA_TOKEN` | secret | read-only Account Analytics token (GitHub environment secret `CF_STATS_TOKEN`, analytics only, 90 days; `CF_EVAL_TOKEN` until it exists) |
| `WA_ACCOUNT_ID` | secret | Cloudflare account id (GitHub secret `CLOUDFLARE_ACCOUNT_ID`) |

`deploy.yml` (job "hq-stats Worker", after the Pages deploy, in the `production` environment) first proves the
analytics token can read Web Analytics and query Analytics Engine (`bun scripts/stats-token-check.ts analytics`) and
that the deploy token can deploy Workers (`stats-token-check.ts deploy`), failing loudly otherwise, then deploys
this folder with `cloudflare/wrangler-action` and sets both secrets. The deploy token (`CLOUDFLARE_API_TOKEN`) needs
Workers Scripts Edit on the account.

## Operations

- Dry run against production data (in-memory KV, prints the snapshot, writes nothing):
  `WA_TOKEN="$(bunx wrangler auth token)" WA_ACCOUNT_ID=<account id> bun scripts/stats-dry-run.ts`.
  The token stays in the environment; the script never prints it.
- Deploys run in CI: `deploy.yml` deploys this Worker on every production deploy, and `rollback.yml` redeploys it
  from the rollback target when `workers/stats/` differs (the production `CLOUDFLARE_API_TOKEN` has Workers Scripts
  Edit). The optional repository variable `STATS_WORKER_DEPLOY` (unset) skips both when set to `"false"`. Check the
  run's "hq-stats Worker" job, and the cron in the dashboard (Workers > hq-stats > Settings > Triggers).
- Manual deploy (fallback only, with the owner's wrangler login and `STATS_WORKER_DEPLOY=false` set so CI
  does not fight it): from this folder, `bunx wrangler deploy` (this also
  registers the cron schedule from `wrangler.toml`), then check `bunx wrangler deployments list`; after the next hourly slot,
  `curl -s https://kurniadi.pages.dev/api/stats | jq .updatedAt` shows that slot's time. Set the
  secrets only on a first deploy or after a rotation: `bunx wrangler secret put WA_TOKEN` and
  `bunx wrangler secret put WA_ACCOUNT_ID` (each reads the value from a hidden prompt).
- Cadence changes: the uptime check and the site's "delayed" note allow a snapshot at most 3 h old
  (3 missed hourly runs). A faster cadence is safe in either order; the merge's deploy redeploys this Worker;
  confirm its "hq-stats Worker" job ran and the Worker's cron trigger shows the new schedule. A slower cadence needs the
  Worker first or a larger threshold.
- Redeploy after a code change (for example the `perf` block): from this folder, `bunx wrangler deploy`.
  The `perf` block needs no new secret or binding: `perf_events` is read over the same Analytics Engine
  SQL API with the existing `WA_TOKEN`, and `scripts/stats-token-check.ts` already checks that it can
  query Analytics Engine. The first run after the deploy fills `perf` for the stored days of the last
  90 days.
- Kill switch: `STATS_ENABLED` in the root `wrangler.toml` (anything but `"true"` makes `/api/stats`
  answer 204 and `/api/visit` drop points). The Worker can keep running; it only writes KV.
- Reset (never needed in normal operation): deleting `stats:days:v1` makes the next run backfill again
  from the sources, which by then only keep the last 6 months (Web Analytics) and 3 months (Analytics
  Engine), so older history would be lost.
- Logs: Workers Logs (observability on) show one line per run with dates and counts only (and the days
  held back or stored after the grace period).
- One beacon only: Pages Web Analytics (project Metrics tab) and zone automatic setups must stay off.
  Cloudflare injects its own beacon tag into every HTML page, only one beacon per page reports, and the
  injected one wins: from 2026-10-15 19:35 UTC to 2026-10-16 about 12:00 UTC every page load went to a
  second site (`ee28fc...`), so `WA_SITE_TAG` saw none, and that beacon ignored "Don't count my visits".
  `scripts/deploy-smoke.ts` and the hourly uptime check fail on an injected beacon
  (`scripts/injected-analytics.ts`). To turn it off: Workers & Pages > kurniadi > Metrics > Web
  Analytics > Disable, or `PATCH /accounts/<id>/pages/projects/kurniadi` with
  `{"build_config":{"web_analytics_tag":null,"web_analytics_token":null}}`; either way the injection
  stops with the next deployment.
- Repair a bad finalized day: save the ledger (`bunx wrangler kv key get stats:days:v1 --namespace-id
  <id> --remote`), put it back without that day and every later day, and the next run rolls them up
  again from the sources (Web Analytics 184 days, Analytics Engine 90). Preview first with a copy of the
  repaired ledger in an in-memory KV (like `scripts/stats-dry-run.ts`).
- Extra rows (`stats:wa-extra:v1`, `WaExtra` in `src/types.ts`): Web Analytics rows of a retired site,
  added to the fetched rows of the days they cover while those days are rolled up (never again once
  stored). Used once: the rows of the Pages-injected site for 2026-10-15 and 2026-10-16 (its page loads
  are not in `WA_SITE_TAG`; both sites saw disjoint page loads, so nothing is counted twice; they include
  visitors who had opted out, because that beacon ignored the switch). A malformed value stops the run
  before anything is written.
- Days before the ledger's first day: the Worker only appends, so older days are prepended by hand to
  `stats:days:v1` (never rebuild the whole ledger: a fresh long-window Web Analytics answer does not
  reproduce stored days, for example 2026-10-18 came back with 0 visits instead of 65). Build them with
  `buildRollups` from `src/rollup.ts` (Analytics Engine rows empty, `perf` zeros), keep the days
  contiguous with the stored first day, check `buildSnapshot` and a dry run of `runStats` on an
  in-memory copy, then put the ledger and the snapshot. Query a retired site day by day: a long window
  is sampled more coarsely and drops countries. Used once (owner, 2026-10-23): the previous portfolio
  site's Web Analytics rows (site `21d90569...`, 2026-04-25 to 2026-10-09; 40 visits, 340 page views,
  ID, FR, US, DE), so `since` reads 2026-04-25.

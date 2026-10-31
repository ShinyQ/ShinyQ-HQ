# Accurate Visit Counting Plan

Status: shipped in #312 (857e567), 2026-10-24

Owner decision 2026-10-24 ([decision](../../decisions/2026-10-24-stats-first-party-visits.md)). Rules:
[`docs/agents/stats.md`](../../agents/stats.md).

**Goal:** a visit shows on the site within about a minute, counted by the site itself (once per browser tab session,
Do Not Track and GPC included, automation and crawlers skipped), with no visit counted twice across the switch from
Cloudflare Web Analytics.

## Diagnosis (2026-10-23 UTC)

- Web Analytics saw the visits (tablet 7 page views / 7 visits, desktop 3 / 2, mobile 4 / 0), but counts a visit only
  for an external or empty referrer, samples, and loses ad-blocked and quick-bounce loads.
- The snapshot was rebuilt every 2 hours and `/api/stats` was cached 10 minutes (plus an hour stale), so a visit took
  2 to 3 hours to show.
- The first-party beacon sent on leave (`pagehide`), which mobile browsers often drop: it saw 3 of 9 visits.

## Tasks

1. Client (`src/lib/stats/visit.ts`, `visitClient.ts`): a visit ping `{ v: 1, kind: "visit" }` as soon as the page is
   shown, once per tab session (`sessionStorage["hq:visit"]`, memory when blocked); the mode ping stays on leave and
   never counts as a visit; Do Not Track and GPC no longer skip.
2. `/api/visit` (`functions/_lib/visit.ts`): accepts the visit ping; a per-visitor hourly cap in memory (salted,
   daily-rotating IP hash, never stored), on top of the same-origin check, the 128-byte cap and the isolate cap.
3. hq-stats Worker: the cutover is the first visit ping (min `timestamp` from the visits query, kept in the ledger);
   per-day visit source with `VISIT_FREEZE`; the live tail `stats:live:v1` next to the snapshot; hourly cron; a
   `GET /live` fetch handler reachable only through the Pages `STATS` service binding, capped at one Analytics
   Engine query a minute globally (the Cache API per data center, then the single `LiveGate` Durable Object).
4. `/api/stats`: adds the pings since the run (same `updatedAt`, at most `LIVE_MAX_DELTA`, 1.5 s timeout, 30 s memo),
   `max-age=30`; the public contract is unchanged.
5. Copy (EN and ID) and freshness: the source line names the site's own counter, "Today live, earlier days every
   hour", the delayed note after 3 hours, a short source line on the 3D observatory panel.
6. Tests: unit (client, endpoint, rollup and run, `/live`, stats merge) and `e2e/visit-live.spec.ts` (the real
   Functions behind a page: a fresh tab raises the shown number, a reload in the same tab does not).
7. Docs: `docs/agents/stats.md`, `workers/stats/README.md`, `docs/deploy.md` section 13, `docs/features.md`, README.

## Verify after deploy

Open the site on a fresh phone tab, then reload the Contact page's Visits section on another device within 2 minutes:
the since-launch number is one higher. `wrangler tail hq-stats` shows the hourly run line with
`first-party visits since <time>`.

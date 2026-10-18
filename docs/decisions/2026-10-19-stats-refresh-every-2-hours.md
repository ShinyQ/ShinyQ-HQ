# Stats

- Date: 2026-10-19

The public visit stats refresh every 2 hours instead of every 4 (owner request): the `hq-stats` cron moves from `17 */4 * * *` to `17 */2 * * *` UTC (still 17 minutes past the hour), the copy says "Updated every 2 hours" / "Diperbarui setiap 2 jam", and the "delayed" threshold (`DELAYED_AFTER_MS`, also the uptime limit) drops from 12 h to 6 h, still 3 missed runs. Free-tier budget at 12 runs a day: KV at most 2 writes per run, 24 a day (usually 13: the snapshot every run plus one ledger write when a day finalizes) of the 1,000 free per account; Web Analytics GraphQL 1 query per run, 12 a day (limit 300 per 5 minutes); Analytics Engine SQL 3 queries per run (4 with a perf backfill), 36 to 48 a day of 10,000. `GET /api/stats` stays `max-age=600, stale-while-revalidate=3600`, so a visitor sees a snapshot at most about 3 h old. This replaces the 4-hour cadence that replaced the daily one from 2026-10-13.

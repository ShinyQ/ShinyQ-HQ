# Public Visit Stats Every 4 Hours Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The `hq-stats` Cron Worker runs every 4 hours and the public snapshot includes the current UTC day so far, with the UI copy saying so honestly in EN and ID.

**Architecture:** The ledger stays append-only for finalized days. A UTC day is finalized once it has been over for `SETTLE_MS` (1 hour, so late Web Analytics events land first); every run also rolls up the provisional days after the last finalized one (yesterday during the 00:00 UTC run, and today so far) from the same queries, never stores them, and builds the snapshot over ledger plus provisional days with `updatedAt` = the run time. One Web Analytics request and three Analytics Engine SQL queries per run, as today.

**Tech Stack:** Cloudflare Workers (Cron Triggers, KV), Web Analytics GraphQL, Analytics Engine SQL, Bun, Vitest.

## Global Constraints

- No em dashes (U+2014) anywhere.
- Owner request (verbatim): "can you make the analytics change every 4 hours".
- Cron `0 */4 * * *` (UTC: 00, 04, 08, 12, 16, 20).
- Earlier owner decisions stay: public numbers, no thresholds, countries as dots only (ISO alpha-2, never `XX` or `T1`), the label "visits" / "kunjungan", the "Don't count my visits" opt-out, the abuse freezes (`MODE_FREEZE`, `PERF_FREEZE`).
- Contract `StatsSnapshotV1` does not change shape (`updatedAt` already accepts any ISO time). No `v: 2`.
- Copy is EN and ID, honest: today is included and partial; "updated every 4 hours".
- Limits (checked 2026-10-16, Cloudflare docs): GraphQL Analytics API 300 queries per 5 minutes per user (6 runs a day use 6); Cron Triggers: one schedule on this Worker; KV free plan 1,000 writes a day (at most 2 per run, 12 a day); Analytics Engine SQL API has no per-query charge on this plan. No cost change worth noting.
- Deploy stays manual (`STATS_WORKER_DEPLOY=false`): `cd workers/stats && bunx wrangler deploy` with the owner's wrangler login, after merge.

---

### Task 1: Worker: 4-hour cron with provisional days

**Files:**
- Modify: `workers/stats/src/run.ts`
- Modify: `workers/stats/src/rollup.ts` (`buildSnapshot` gets `updatedAt`)
- Modify: `workers/stats/src/index.ts`, `workers/stats/wrangler.toml` (cron and comments)
- Test: `tests/stats/worker-run.test.ts`, `tests/stats/rollup.test.ts`

**Interfaces:**
- Produces: `SETTLE_MS = 3_600_000` and `finalizedThrough(now: number): string` (last UTC day that ended at least `SETTLE_MS` ago, YYYY-MM-DD) exported from `run.ts`; `buildSnapshot(days, lastDay, chipTopics, updatedAt?: string)` where `updatedAt` defaults to the old value (`${addDays(lastDay, 1)}T00:00:00.000Z`); `RunResult` gains `provisional: string[]` (dates rolled up but not stored).

- [ ] **Step 1: Write the failing tests.** In `tests/stats/rollup.test.ts`:

```ts
it("stamps the snapshot with the given run time and covers the partial last day", () => {
  const days = [day("2026-11-14", { visits: 10 }), day("2026-11-15", { visits: 3 })];
  const snap = buildSnapshot(days, "2026-11-15", CHIPS, "2026-11-15T08:00:00.000Z")!;
  expect(snap.updatedAt).toBe("2026-11-15T08:00:00.000Z");
  expect(snap.visits).toEqual({ d30: 13, all: 13 });
});
```

(reuse the file's existing day factory and chip map; adapt names to what the file defines.) In `tests/stats/worker-run.test.ts` add, using the file's mocked fetcher and in-memory KV helpers:

```ts
it("finalizes a day only an hour after it ends", () => {
  expect(finalizedThrough(Date.parse("2026-11-16T00:00:00Z"))).toBe("2026-11-14");
  expect(finalizedThrough(Date.parse("2026-11-16T00:59:59Z"))).toBe("2026-11-14");
  expect(finalizedThrough(Date.parse("2026-11-16T01:00:00Z"))).toBe("2026-11-15");
  expect(finalizedThrough(Date.parse("2026-11-16T04:00:00Z"))).toBe("2026-11-15");
});

it("includes today so far in the snapshot every 4 hours without storing it", async () => {
  // Ledger up to 2026-11-15; run at 2026-11-16T08:00Z with Web Analytics rows for 2026-11-16.
  // Expect: ledger unchanged (no 2026-11-16 day), snapshot visits include today's rows,
  // updatedAt "2026-11-16T08:00:00.000Z", result.provisional ["2026-11-16"].
});

it("keeps yesterday provisional during the 00:00 UTC run and stores it at 04:00", async () => {
  // Ledger up to 2026-11-14. Run at 2026-11-16T00:00Z: ledger still ends 2026-11-14,
  // snapshot includes 2026-11-15 and 2026-11-16 rows, provisional ["2026-11-15", "2026-11-16"].
  // Run again at 2026-11-16T04:00Z: ledger gains exactly 2026-11-15; provisional ["2026-11-16"].
});

it("queries the provisional days in the same requests: one Web Analytics call and three SQL queries", async () => {
  // Count fetcher calls by URL for a routine run; the WA variables end at tomorrow's midnight.
});
```

Write the bodies concretely with the file's existing helpers (`kv()`, `fetcherFor(...)`, `waBody(...)` or equivalents). Replace the old tests that assumed one run per day: "does nothing more the same day..." becomes "a second run the same day rebuilds the snapshot from fresh provisional rows and never rewrites a finalized day"; "rewrites a missing or stale snapshot from the ledger without fetching" is removed (every run fetches the provisional days now); "fills perf once for stored days ... when the ledger is up to date" keeps its assertion that perf is filled once and only `perf` changes.

- [ ] **Step 2: Run** `bunx vitest run tests/stats`. Expected: the new tests FAIL.

- [ ] **Step 3: Implement.** In `run.ts`:

```ts
/** A UTC day is finalized (written to the ledger once, never recomputed) an hour after it ends, so late events land first. */
export const SETTLE_MS = 3_600_000;

/** The last UTC day that ended at least `SETTLE_MS` before `now`. */
export function finalizedThrough(now: number): string {
  return addDays(new Date(now - SETTLE_MS).toISOString().slice(0, 10), -1);
}
```

Rewrite `runStats` as one path:

1. `today = date(now)`, `lastFinal = finalizedThrough(now)`, read the ledger, `from = last ? addDays(last, 1) : addDays(today, -BACKFILL_DAYS)`, `end = addDays(today, 1)`.
2. Fetch Web Analytics in `WA_WINDOW_DAYS` windows over `[from, end)` and Analytics Engine over `[from, end)` (unchanged functions), plus `backfillPerf` for stored days missing `perf` (unchanged rule).
3. `rolled = buildRollups(dayRange(from, today), wa, ae, CHIP_TOPICS)`; when the ledger is empty, `rolled = trimLeadingEmpty(rolled)`.
4. `added = rolled.filter((d) => d.date <= lastFinal)`, `provisional = rolled.filter((d) => d.date > lastFinal)`.
5. If `stored.length + rolled.length === 0`: log and return `{ added: [], provisional: [], days: 0, snapshot: false }`.
6. `snapshot = buildSnapshot([...stored, ...added, ...provisional], today, CHIP_TOPICS, new Date(now).toISOString())`; validate (throw before any write when invalid).
7. Write the ledger only when `added.length` or perf was filled; always write the snapshot.
8. Log dates and counts only: `hq-stats: added N days (...), provisional A to B, ledger M days`.

Keep the "API error throws before anything is written" property. Update the `runStats` doc comment (cron `0 */4 * * *`, provisional days, settle lag). In `rollup.ts` add the optional `updatedAt` parameter to `buildSnapshot` and update its doc (d30 = the 30 days ending on `lastDay`, which may be today so far). Set `crons = ["0 */4 * * *"]` in `workers/stats/wrangler.toml` with the comment "Every 4 hours (UTC): finalizes days an hour after they end and refreshes the snapshot with today so far." and update `index.ts`'s comment.

- [ ] **Step 4: Run** `bunx vitest run tests/stats` and `bun scripts/stats-dry-run.ts --help 2>/dev/null || true` (the dry-run script must still type check: `bunx tsc --noEmit -p .` or `bun run typecheck`). Expected: PASS.

- [ ] **Step 5: Commit** `feat(stats): refresh the public visit stats every 4 hours, today included`.

### Task 2: Site copy and freshness thresholds

**Files:**
- Modify: `messages/en.json`, `messages/id.json` (`stats.intro`, `stats.window.d30`, `stats.updated`, and the perf `source` line that says "Updated daily")
- Modify: `src/lib/visits/model.ts` (`DELAYED_AFTER_MS`, doc of `lastUpdatedDay`)
- Modify: `scripts/uptime.ts` (`STATS_MAX_AGE_MS`, message)
- Modify: comments that say "daily snapshot" or "complete days" in `src/experience/visits3d.ts`, `src/experience/floors/labs/opsLive.ts`, `src/experience/floors/labs/OpsRoom.tsx`, `src/components/stats/TickerVisits.tsx`, `functions/api/stats.ts`
- Test: `tests/unit/visits-model.test.ts`, `tests/unit/uptime.test.ts`, `tests/unit/lobby-observatory.test.ts`, any e2e that asserts the old copy (`grep -rn "Updated daily\|complete days" e2e tests`)

- [ ] **Step 1: Copy (exact strings).**

| Key | EN | ID |
|---|---|---|
| `stats.intro` | `Visits and AI questions are counted anonymously and updated every 4 hours, including today so far.` | `Jumlah kunjungan dan pertanyaan ke AI dihitung secara anonim dan diperbarui setiap 4 jam, termasuk data hari ini.` |
| `stats.window.d30` | `Last 30 days, including today` | `30 hari terakhir, termasuk hari ini` |
| `stats.updated` | `Updated every 4 hours` | `Diperbarui setiap 4 jam` |
| perf `source` | `Anonymous performance beacon and Cloudflare Web Analytics. Updated every 4 hours.` | `Beacon performa anonim dan Cloudflare Web Analytics. Diperbarui setiap 4 jam.` |

Keep key names; check the 3D observatory panel still fits (`tests/unit/lobby-observatory.test.ts` measures lines).

- [ ] **Step 2: Thresholds.** `DELAYED_AFTER_MS = 12 * HOUR` (three missed 4-hour runs) with the doc "After this the stats show a "delayed" note (the snapshot refreshes every 4 hours)."; `HIDDEN_AFTER_MS` stays 7 days. `STATS_MAX_AGE_MS` in `scripts/uptime.ts` stays equal to it (`12 * 3_600_000`, message "limit 12 h"). `lastUpdatedDay` doc: "The UTC day of the snapshot's last data (`updatedAt` is the run time; a midnight run reports the previous day)." Update tests that pinned 48 h.

- [ ] **Step 3: Run** `bunx vitest run tests/unit/visits-model.test.ts tests/unit/uptime.test.ts tests/unit/lobby-observatory.test.ts tests/hud tests/stats`. Expected: PASS.

- [ ] **Step 4: Commit** `feat(stats): say the visit stats update every 4 hours and include today`.

### Task 3: Docs

**Files:**
- Modify: `workers/stats/README.md` (cadence, settle lag, provisional days, run budget, limits table, manual deploy `bunx wrangler deploy`)
- Modify: `docs/deploy.md` (sections 13 and 16: cron, the uptime 12 h threshold and the missed-run paragraph at about line 395)
- Modify: `docs/superpowers/specs/agent-hq/06-data-contracts.md` section 4.1 (rollup cadence, `d30` now ends today, `updatedAt` is the run time; owner decision line: "the snapshot updates every 4 hours and includes today so far (owner 2026-10-16; was daily from complete UTC days)")
- Modify: `AGENTS.md` ("Public visit stats" sections: cron and the owner decision), `docs/features.md` if it says daily

- [ ] **Step 1:** Edit the docs; no em dashes (`bunx vitest run tests/unit/no-em-dash*` or the repo's em dash test).
- [ ] **Step 2:** `bun run verify:quick`, then `E2E_PORT=<port> bun run e2e:changed` (visits, pageview).
- [ ] **Step 3: Commit** `docs(stats): 4-hour cadence`.

### After merge (owner wrangler login on this machine)

- `cd workers/stats && bunx wrangler deploy`, then `bunx wrangler deployments list` shows the new version; wait for the next 4-hour slot (or `bunx wrangler triggers`/dashboard "Trigger" on the cron) and confirm `curl -s https://kurniadi.pages.dev/api/stats | jq .updatedAt` shows that slot's time.

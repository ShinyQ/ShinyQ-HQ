import { createStatsHandler } from "../_lib/stats";
import type { PagesContext, StatsEnv } from "../_lib/types";

/**
 * Public visit stats: `GET /api/stats` serves the hourly snapshot from KV `STATS_KV` (written by the
 * hq-stats Cron Worker in workers/stats/), plus today's visit pings since that run through the
 * `STATS` service binding. 204 when the kill switch is off or no snapshot exists yet.
 */
const handler = createStatsHandler();

export const onRequest = (context: PagesContext<StatsEnv>) => handler(context);

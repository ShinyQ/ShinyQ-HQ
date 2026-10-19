import { createStatsHandler } from "../_lib/stats";
import type { PagesContext, StatsEnv } from "../_lib/types";

/**
 * Public visit stats: `GET /api/stats` serves the 2-hour snapshot from KV `STATS_KV` (written by the
 * hq-stats Cron Worker in workers/stats/). 204 when the kill switch is off or no snapshot exists yet.
 */
const handler = createStatsHandler();

export const onRequest = (context: PagesContext<StatsEnv>) => handler(context);

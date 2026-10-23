import { handleLive } from "./live";
import { runStats } from "./run";
import type { ScheduledControllerLike, StatsWorkerEnv } from "./types";

/**
 * hq-stats: the public visit stats Cron Worker (every hour, UTC: finalizes days an hour after they end and
 * refreshes the snapshot with today so far) and the live count of visit pings behind `GET /api/stats`. No
 * route and no workers.dev URL: its fetch handler is reachable only through the Pages project's `STATS`
 * service binding. Runbook: workers/stats/README.md.
 */
const worker = {
  async scheduled(controller: ScheduledControllerLike, env: StatsWorkerEnv): Promise<void> {
    await runStats(env, controller.scheduledTime);
  },
  async fetch(request: Request, env: StatsWorkerEnv): Promise<Response> {
    return handleLive(request, env, Date.now());
  },
};

export default worker;

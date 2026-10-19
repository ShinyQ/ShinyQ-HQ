import { runStats } from "./run";
import type { ScheduledControllerLike, StatsWorkerEnv } from "./types";

/**
 * hq-stats: the public visit stats Cron Worker (every 2 hours, UTC: finalizes days an hour after they end
 * and refreshes the snapshot with today so far). Scheduled handler only: no fetch handler, no route and no
 * workers.dev URL, so it has no public surface. Runbook: workers/stats/README.md.
 */
const worker = {
  async scheduled(controller: ScheduledControllerLike, env: StatsWorkerEnv): Promise<void> {
    await runStats(env, controller.scheduledTime);
  },
};

export default worker;

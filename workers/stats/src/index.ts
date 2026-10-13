import { runStats } from "./run";
import type { ScheduledControllerLike, StatsWorkerEnv } from "./types";

/**
 * hq-stats: the public visit stats Cron Worker (`0 1 * * *`, UTC). Scheduled handler only: no fetch
 * handler, no route and no workers.dev URL, so it has no public surface. Runbook: workers/stats/README.md.
 */
const worker = {
  async scheduled(controller: ScheduledControllerLike, env: StatsWorkerEnv): Promise<void> {
    await runStats(env, controller.scheduledTime);
  },
};

export default worker;

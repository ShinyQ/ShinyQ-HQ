import type { Locale } from "@/content/locales";
import type { StatsSnapshotV1 } from "@/lib/stats/protocol";
import { formatCount, perfView } from "@/lib/visits/model";
import type { StatsStatus } from "@/lib/visits/store";
import type { OpsData, OpsLiveRow } from "./ops";

/**
 * The Ops Control Room's live panel: this site's own telemetry from the hourly stats snapshot (visits since
 * launch, today included, the share of sampled 3D sessions at 55+ FPS, the median time to explore, all since launch), then
 * "Nightly performance runs" as text (their results stay in CI artifacts). Null hides the whole panel: no
 * snapshot, an invalid one or one older than 7 days (the store's `hidden`, like every visits widget).
 */
export function opsLiveRows(status: StatsStatus, snapshot: StatsSnapshotV1 | null, live: OpsData["live"], locale: Locale): OpsLiveRow[] | null {
  if (status !== "ready" || !snapshot) return null;
  const rows: OpsLiveRow[] = [{ label: live.visits, value: formatCount(snapshot.visits.all, locale) }];
  const perf = perfView(snapshot, "all");
  if (perf?.fpsShare != null) rows.push({ label: live.fps, value: `${Math.round(perf.fpsShare * 100)}%` });
  if (perf?.explore) rows.push({ label: live.explore, value: live.buckets[perf.explore] ?? "" });
  rows.push({ label: live.nightly, value: "" });
  return rows;
}

import type { Locale } from "@/content/locales";
import type { StatsSnapshotV1 } from "@/lib/stats/protocol";
import { formatCount, perfView } from "@/lib/visits/model";
import type { StatsStatus } from "@/lib/visits/store";
import type { OpsData, OpsLiveRow } from "./ops";

/**
 * The Ops Control Room's live panel: this site's own telemetry from the 2-hour stats snapshot (visits in the
 * last 30 days, today included, the share of sampled 3D sessions at 55+ FPS, the median time to explore), then
 * "Nightly performance runs" as text (their results stay in CI artifacts). Null hides the whole panel: no
 * snapshot, an invalid one or one older than 7 days (the store's `hidden`, like every visits widget).
 */
export function opsLiveRows(status: StatsStatus, snapshot: StatsSnapshotV1 | null, live: OpsData["live"], locale: Locale): OpsLiveRow[] | null {
  if (status !== "ready" || !snapshot) return null;
  const rows: OpsLiveRow[] = [{ label: live.visits, value: formatCount(snapshot.visits.d30, locale) }];
  const perf = perfView(snapshot, "d30");
  if (perf?.fpsShare != null) rows.push({ label: live.fps, value: `${Math.round(perf.fpsShare * 100)}%` });
  if (perf?.explore) rows.push({ label: live.explore, value: live.buckets[perf.explore] ?? "" });
  rows.push({ label: live.nightly, value: "" });
  return rows;
}

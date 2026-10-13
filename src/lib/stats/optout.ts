/**
 * "Don't count my visits": the visitor's own choice, stored as `localStorage["hq:stats-optout"] = "1"`
 * (removed when counting is turned back on). It stops the first-party visit beacon and keeps the
 * Cloudflare Web Analytics beacon from loading (src/components/Analytics.tsx). After a change the toggle
 * dispatches `window` event `hq:stats-optout`, so a loaded page can react. No other value opts out.
 */
export const STATS_OPTOUT_KEY = "hq:stats-optout";
export const STATS_OPTOUT_EVENT = "hq:stats-optout";
export const STATS_OPTOUT_VALUE = "1";

export function isStatsOptedOut(storage: Pick<Storage, "getItem"> | null | undefined): boolean {
  try {
    return storage?.getItem(STATS_OPTOUT_KEY) === STATS_OPTOUT_VALUE;
  } catch {
    return false;
  }
}

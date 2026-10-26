import type { ReactNode } from "react";
import type { Locale, Stat } from "@/content/schema";

export interface StatTickerProps {
  stats: readonly Stat[];
  locale: Locale;
  /** Stat ids whose value comes from the weekly live facts (`DYNAMIC_STATS`). */
  liveIds: readonly string[];
  title: string;
  live: string;
  /** A live item appended to the list: the public visits island. */
  extra?: ReactNode;
}

/**
 * The landing's stats (`#stats`, the L1:stats room) as a still, ruled ledger under "In short": each value in the
 * display face beside its label, the live ones marked. It replaced the marquee ticker (owner decision 2026-10-27,
 * Hallmark Floor 18: nothing on the page moves on its own, so it needs no pause control). Server-rendered.
 */
export function StatTicker({ stats, locale, liveIds, title, live, extra }: StatTickerProps) {
  return (
    <section id="stats" aria-labelledby="stats-title" className="mt-24">
      <h3 id="stats-title" className="pv-h3">
        {title}
      </h3>
      <ul className="hx-ledger mt-6">
        {stats.map((stat) => (
          <li key={stat.id} data-stat={stat.id}>
            <span className="pv-num hx-ledger-value">{stat.value}</span>
            <span className="text-ink-2">
              {stat.label[locale]}
              {liveIds.includes(stat.id) && <span className="pv-meta hx-live">{live}</span>}
            </span>
          </li>
        ))}
        {extra}
      </ul>
    </section>
  );
}

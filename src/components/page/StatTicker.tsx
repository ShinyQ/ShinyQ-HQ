import type { ReactNode } from "react";
import type { Locale, Stat } from "@/content/schema";

export interface StatTickerProps {
  stats: readonly Stat[];
  locale: Locale;
  /** Stat ids whose value comes from the weekly live facts (`DYNAMIC_STATS`). */
  liveIds: readonly string[];
  title: string;
  live: string;
  /** Live items appended to both copies of the track (`copy` is the aria-hidden duplicate): the public visits island. */
  extra?: (copy: boolean) => ReactNode;
}

/**
 * The landing's stats as a ticker band at the bottom of the first screen (`#stats`, the L1:stats room).
 * CSS only (src/app/landing.css): a plain marquee (owner request 2026-10-15: no date stamp, no pause
 * switch). Two copies of the list scroll on the compositor and the second is aria-hidden; hover or
 * keyboard focus holds it; under reduced motion the copy hides and the first list wraps, still.
 */
export function StatTicker({ stats, locale, liveIds, title, live, extra }: StatTickerProps) {
  const track = (hidden: boolean) => (
    <ul className="hx-tick-track" aria-hidden={hidden || undefined}>
      {stats.map((stat) => (
        <li key={stat.id} className="hx-tick-item">
          <span className="pv-num hx-tick-value">{stat.value}</span>
          <span className="hx-tick-label">{stat.label[locale]}</span>
          {liveIds.includes(stat.id) && <span className="pv-data hx-tick-live">{live}</span>}
        </li>
      ))}
      {extra?.(hidden)}
    </ul>
  );
  return (
    <section id="stats" aria-labelledby="stats-title" className="hx-tick">
      <h2 id="stats-title" className="sr-only">
        {title}
      </h2>
      <div className="pv-wrap hx-tick-bar">
        <div className="hx-tick-view">
          {track(false)}
          {track(true)}
        </div>
      </div>
    </section>
  );
}

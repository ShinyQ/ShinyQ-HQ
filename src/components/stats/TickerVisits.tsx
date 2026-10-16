"use client";

import { useEffect } from "react";
import type { Locale } from "@/content/locales";
import { Link } from "@/i18n/navigation";
import { whenIdle } from "@/lib/visits/idle";
import { formatCount, formatCountLong } from "@/lib/visits/model";
import { requestStats, useStats } from "@/lib/visits/store";

/**
 * The home ticker's visits item (a `StatTicker` live item): visits in the last 30 days, today included, once
 * the snapshot arrives after hydration. It links to the Contact page's "Visits" section, which shows
 * the window, the source and the update cadence in full (the item carries them as its title).
 * Nothing renders while the stats are loading or hidden. `copy` is the ticker's aria-hidden duplicate.
 */
export function TickerVisits({ locale, label, live, scope, copy = false }: { locale: Locale; label: string; live: string; scope: string; copy?: boolean }) {
  const stats = useStats();
  useEffect(() => {
    if (!copy) return whenIdle(() => void requestStats());
  }, [copy]);
  if (stats.status !== "ready" || !stats.snapshot) return null;
  const n = stats.snapshot.visits.d30;
  return (
    <li className="hx-tick-item" data-stat="visits" title={scope}>
      <Link href="/contact#visits" prefetch={false} tabIndex={copy ? -1 : undefined} className="contents">
        <span className="pv-num hx-tick-value" aria-label={formatCountLong(n, locale)}>
          {formatCount(n, locale)}
        </span>
        <span className="hx-tick-label">
          {label}
          <span className="sr-only"> ({scope})</span>
        </span>
        <span className="pv-data hx-tick-live">{live}</span>
      </Link>
    </li>
  );
}

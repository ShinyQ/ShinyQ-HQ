"use client";

import { useEffect } from "react";
import type { Locale } from "@/content/locales";
import { Link } from "@/i18n/navigation";
import { whenIdle } from "@/lib/visits/idle";
import { formatCount, formatCountLong } from "@/lib/visits/model";
import { requestStats, useStats } from "@/lib/visits/store";

/**
 * The home stats ledger's visits item (a `StatTicker` live item): visits since launch, today included, once
 * the snapshot arrives after hydration. It links to the Contact page's "Visits" section, which shows
 * the window, the source and the update cadence in full (the item carries them as its title).
 * Nothing renders while the stats are loading or hidden.
 */
export function TickerVisits({ locale, label, live, scope }: { locale: Locale; label: string; live: string; scope: string }) {
  const stats = useStats();
  useEffect(() => whenIdle(() => void requestStats()), []);
  if (stats.status !== "ready" || !stats.snapshot) return null;
  const n = stats.snapshot.visits.all;
  return (
    <li data-stat="visits" title={scope}>
      <span className="pv-num hx-ledger-value" aria-label={formatCountLong(n, locale)}>
        {formatCount(n, locale)}
      </span>
      <span className="text-ink-2">
        <Link href="/contact#visits" prefetch={false} className="pv-uline transition-colors hover:text-ink">
          {label}
          <span className="sr-only"> ({scope})</span>
        </Link>
        <span className="pv-meta hx-live">{live}</span>
      </span>
    </li>
  );
}

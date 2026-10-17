"use client";

import { useEffect } from "react";
import type { Locale } from "@/content/locales";
import { Link } from "@/i18n/navigation";
import { whenIdle } from "@/lib/visits/idle";
import { formatCount, formatCountLong } from "@/lib/visits/model";
import { requestStats, useStats } from "@/lib/visits/store";
import { TILE, TILE_LABEL, TILE_VALUE } from "./tile";

/**
 * The build dashboard's visits tile: visits in the last 30 days from the public stats snapshot, once it
 * arrives after hydration. Links to About's "Visits" section (window, source and cadence in full).
 * Nothing renders while the stats are loading or hidden, so the tile never shows a guessed number.
 */
export function BuildVisits({ locale, label }: { locale: Locale; label: string }) {
  const stats = useStats();
  useEffect(() => whenIdle(() => void requestStats()), []);
  if (stats.status !== "ready" || !stats.snapshot) return null;
  const n = stats.snapshot.visits.d30;
  return (
    <li className={TILE} data-tile="visits">
      <Link href="/contact#visits" prefetch={false} className="flex flex-col gap-2 hover:text-cyan">
        <span className={TILE_VALUE} aria-hidden="true">
          {formatCount(n, locale)}
        </span>
        <span className="sr-only">{formatCountLong(n, locale)}</span>
        <span className={TILE_LABEL}>{label}</span>
      </Link>
    </li>
  );
}

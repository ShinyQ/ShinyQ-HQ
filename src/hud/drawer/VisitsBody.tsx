"use client";

import { useTranslations } from "next-intl";
import { lazy, Suspense, useEffect } from "react";
import { OptOutToggle } from "@/components/stats/OptOutToggle";
import { requestStats, useStats } from "@/lib/visits/store";
import type { RoomBodyProps } from "./bodies";

const VisitsPanel = lazy(() => import("@/components/stats/VisitsPanel").then((m) => ({ default: m.VisitsPanel })));

/**
 * L1:visits, the Visitor Observatory: the shared visits panel (Topic and Period radio groups, counters,
 * dot map, topic shares, chip counts) in the drawer's narrow layout, then "Don't count my visits". When
 * the stats are hidden (invalid, 204 or older than 7 days) the drawer says so and keeps the switch.
 */
export function VisitsBody({ view, locale }: RoomBodyProps) {
  const t = useTranslations("stats");
  const { status } = useStats();
  useEffect(() => {
    void requestStats();
  }, []);
  if (!view.visits) return null;
  return (
    <div className="grid gap-6" data-testid="visits-body">
      {status === "hidden" && (
        <p className="pv-small text-ink-2" data-testid="visits-offline">
          {t("offline")}
        </p>
      )}
      <Suspense fallback={<p className="pv-small text-ink-2" role="status">{t("loading")}</p>}>
        <VisitsPanel locale={locale} chipLabels={view.visits.chipLabels} floorLabels={view.visits.floorLabels} compact />
      </Suspense>
      <OptOutToggle label={t("optOut")} hint={t("optOutHint")} className="pv-small border-t border-line pt-4 text-ink-2" />
    </div>
  );
}

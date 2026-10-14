"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo } from "react";
import { AlertExcerpt } from "@/components/AlertExcerpt";
import { Gallery } from "@/components/Gallery";
import { opsLiveRows } from "@/experience/floors/labs/opsLive";
import { goToRoom } from "@/experience/missions/bridge";
import { requestStats, useStats } from "@/lib/visits/store";
import type { RoomBodyProps } from "./bodies";
import { MetricTiles } from "./blocks";

/** This site's own telemetry (the same rows as the room's live panel); nothing when the stats are hidden. */
function LiveRows({ locale }: { locale: RoomBodyProps["locale"] }) {
  const t = useTranslations("production");
  const { status, snapshot } = useStats();
  useEffect(() => {
    void requestStats();
  }, []);
  const live = useMemo(
    () => ({ title: t("live.title"), visits: t("live.visits"), fps: t("live.fps"), explore: t("live.explore"), nightly: t("live.nightly"), buckets: t.raw("explore") as Record<string, string> }),
    [t],
  );
  const rows = opsLiveRows(status, snapshot, live, locale);
  if (!rows) return null;
  return (
    <section className="space-y-2" data-testid="ops-live">
      <h3 className="label text-ink-2">{live.title}</h3>
      <dl className="grid gap-2 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label} className="card flex items-baseline justify-between gap-3 p-3">
            <dt className="text-[13px] leading-5 text-ink-2">{row.label}</dt>
            {row.value && <dd className="pv-num text-lg text-ink">{row.value}</dd>}
          </div>
        ))}
      </dl>
      <p className="text-xs text-ink-3">{t("live.source")}</p>
    </section>
  );
}

/**
 * L3:ops, the Ops Control Room: "How I run AI in production" (owner approved 2026-10-14), its proof
 * tiles, this site's live telemetry, the masked dashboard and alert rule, and the case studies, each a
 * card that rides to its pod.
 */
export function OpsBody({ view, locale }: RoomBodyProps) {
  const t = useTranslations("production");
  const ops = view.ops;
  if (!ops) return null;
  return (
    <div className="grid gap-6" data-testid="ops-body">
      <div className="space-y-3 text-[15px] leading-6 text-ink-2">
        <p>{ops.intro}</p>
        <ul className="space-y-2">
          {ops.points.map((p) => (
            <li key={p.lead}>
              <strong className="font-semibold text-ink">{p.lead}</strong> {p.text}
            </li>
          ))}
        </ul>
        <p>{ops.outro}</p>
      </div>
      <section className="space-y-2">
        <h3 className="label text-ink-2">{t("proof")}</h3>
        <MetricTiles metrics={view.metrics} fluid />
      </section>
      <LiveRows locale={locale} />
      {view.gallery.length > 0 && <Gallery images={view.gallery} label={view.gallery[0].alt} layout="strip" />}
      {ops.excerpt && <AlertExcerpt label={t("excerpt")} caption={ops.excerpt.caption} code={ops.excerpt.code} />}
      <section className="space-y-2">
        <h3 className="label text-ink-2">{t("cases")}</h3>
        <ul className="grid gap-2">
          {(view.cards ?? []).map((card) => (
            <li key={card.room}>
              <button
                type="button"
                onClick={() => goToRoom(card.room)}
                className="glass glass-solid flex min-h-11 w-full flex-col gap-0.5 p-3 text-left hq-glow"
                data-testid="ops-case"
                data-room={card.room}
              >
                <span className="text-sm font-semibold text-ink">{card.title}</span>
                {card.subtitle && <span className="text-[13px] leading-5 text-ink-2">{card.subtitle}</span>}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

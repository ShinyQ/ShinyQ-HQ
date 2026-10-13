"use client";

import { useTranslations } from "next-intl";
import { useId, useMemo, useState, type ReactNode } from "react";
import type { Locale } from "@/content/locales";
import { formatDate, intlLocale } from "@/lib/format";
import type { StatsFloor, StatsPeriod } from "@/lib/visits/contract";
import { formatCount, formatCountLong, lastUpdatedDay, PERIODS, TOPIC_FILTERS, visitsView, type TopicFilter } from "@/lib/visits/model";
import { useStats } from "@/lib/visits/store";
import { DotMap } from "./DotMap";

export interface VisitsPanelProps {
  locale: Locale;
  /** Curated chip id to its question in this locale (`content/ask/suggestions.json`). */
  chipLabels: Readonly<Record<string, string>>;
  /** Floor names (`hud.floorLabel`). */
  floorLabels: Readonly<Record<StatsFloor, string>>;
  /** Narrow layout (the room drawer): one column. */
  compact?: boolean;
  /** Rendered under the panel (the drawer's "Don't count my visits" switch). */
  footer?: ReactNode;
}

function Radios<T extends string>({ legend, name, values, value, label, onChange }: { legend: string; name: string; values: readonly T[]; value: T; label: (v: T) => string; onChange: (v: T) => void }) {
  return (
    <fieldset className="min-w-0">
      <legend className="label mb-2">{legend}</legend>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <label key={v} className="relative">
            <input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} className="peer sr-only" />
            <span className="pv-data inline-flex min-h-11 cursor-pointer items-center rounded-full border border-line-2 px-3.5 text-ink-2 transition-colors peer-checked:border-cyan peer-checked:bg-cyan peer-checked:text-void peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-cyan hover:border-ink-3">
              {label(v)}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Bar({ share, tone }: { share: number; tone: "cyan" | "violet" }) {
  return (
    <span className="block h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
      <span className={`block h-full rounded-full ${tone === "cyan" ? "bg-cyan" : "bg-violet"}`} style={{ width: `${share}%` }} />
    </span>
  );
}

/**
 * The public visit stats with the owner's two filters (Topic: All, Work, AI, Career; Period: Last 30
 * days, Since launch) as native radio groups and one polite status line. Shared by the Classic Contact
 * section and the RF:visits drawer. Renders nothing when the stats are hidden (invalid, 204 or older
 * than 7 days) and a "delayed" note after 48 hours.
 */
export function VisitsPanel({ locale, chipLabels, floorLabels, compact = false, footer }: VisitsPanelProps) {
  const t = useTranslations("stats");
  const stats = useStats();
  const [topic, setTopic] = useState<TopicFilter>("all");
  const [period, setPeriod] = useState<StatsPeriod>("d30");
  const id = useId();
  const names = useMemo(() => new Intl.DisplayNames([intlLocale(locale)], { type: "region" }), [locale]);
  if (stats.status === "hidden") return null;
  if (stats.status !== "ready" || !stats.snapshot) {
    return (
      <p className="pv-data text-ink-3" data-testid="visits-loading">
        {t("loading")}
      </p>
    );
  }
  const s = stats.snapshot;
  const v = visitsView(s, period, topic);
  const count = (n: number) => formatCount(n, locale);
  const windowText = period === "d30" ? t("window.d30") : t("window.all", { date: formatDate(s.since, locale) });
  const topicName = t(`topics.${topic}`);
  const long = (n: number) => formatCountLong(n, locale);
  const status = t("status", { period: t(`periods.${period}`), topic: topicName, visits: long(v.visits), countries: long(v.countries.length), questions: long(v.asks.total) });
  const counters: { key: string; label: string; value: string; long?: string }[] = [
    { key: "visits", label: t("counters.visits"), value: count(v.visits), long: formatCountLong(v.visits, locale) },
    { key: "countries", label: t("counters.countries"), value: count(v.countries.length) },
    { key: "questions", label: topic === "all" ? t("counters.questions") : t("counters.questionsTopic", { topic: topicName }), value: count(v.asks.total), long: formatCountLong(v.asks.total, locale) },
    { key: "floor", label: t("counters.topFloor"), value: v.topFloor ? `${floorLabels[v.topFloor]} · ${v.topFloor}` : t("counters.none") },
  ];
  const grid = compact ? "grid-cols-2" : "grid-cols-2 md:grid-cols-4";

  return (
    <div className="grid gap-8" data-testid="visits-panel" data-period={period} data-topic={topic}>
      <p className="pv-data flex flex-wrap gap-x-3 gap-y-1 text-ink-3" data-testid="visits-scope">
        <span>{windowText}</span>
        <span aria-hidden="true">·</span>
        <span>{t("source")}</span>
        <span aria-hidden="true">·</span>
        <span>{t("updated")}</span>
        {stats.freshness === "delayed" && (
          <span className="text-amber" data-testid="visits-delayed">
            {t("delayed", { date: formatDate(lastUpdatedDay(s), locale) })}
          </span>
        )}
      </p>

      <div className="flex flex-wrap gap-x-8 gap-y-5">
        <Radios legend={t("topicLegend")} name={`${id}-topic`} values={TOPIC_FILTERS} value={topic} label={(x) => t(`topics.${x}`)} onChange={setTopic} />
        <Radios legend={t("periodLegend")} name={`${id}-period`} values={PERIODS} value={period} label={(x) => t(`periods.${x}`)} onChange={setPeriod} />
      </div>
      <p role="status" aria-live="polite" className="pv-small -mt-4 text-ink-2" data-testid="visits-status">
        {status}
      </p>

      <dl className={`grid gap-px overflow-hidden rounded-lg border border-line bg-line ${grid}`}>
        {counters.map((c) => (
          <div key={c.key} className="bg-void p-4" data-counter={c.key}>
            <dt className="label">{c.label}</dt>
            <dd className="pv-num mt-2 text-2xl text-ink" aria-label={c.long}>
              {c.value}
            </dd>
          </div>
        ))}
      </dl>

      <figure className="grid gap-3">
        <DotMap countries={v.countries} label={t("map.label", { n: v.countries.length })} />
        <figcaption className="pv-small text-ink-3">{t("map.caption", { window: windowText })}</figcaption>
        <details className="pv-small">
          <summary className="pv-data inline-flex min-h-11 cursor-pointer items-center text-ink-2">{t("table.open")}</summary>
          <table className="mt-2 w-full text-left" data-testid="visits-table">
            <caption className="sr-only">{t("table.caption", { window: windowText })}</caption>
            <thead>
              <tr className="label">
                <th scope="col" className="py-1.5 font-normal">
                  {t("table.country")}
                </th>
                <th scope="col" className="py-1.5 font-normal">
                  {t("table.code")}
                </th>
              </tr>
            </thead>
            <tbody>
              {v.countries.map((code) => (
                <tr key={code} className="border-t border-line">
                  <td className="py-1.5 text-ink-2">{names.of(code) ?? code}</td>
                  <td className="pv-data py-1.5 text-ink-3">{code}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </figure>

      <section className="grid gap-3" aria-labelledby={`${id}-split`} data-testid="visits-split">
        <h3 id={`${id}-split`} className="label">
          {t("split.title")}
        </h3>
        <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
          <span className="block h-full bg-cyan" style={{ width: `${v.mode.threeDShare}%` }} />
          <span className="block h-full bg-violet" style={{ width: `${v.mode.classicShare}%` }} />
        </div>
        <p className="pv-small flex flex-wrap justify-between gap-2 text-ink-2">
          <span>
            {t("split.threeD")} <span className="pv-num text-ink">{v.mode.threeDShare}%</span>
          </span>
          <span>
            {t("split.classic")} <span className="pv-num text-ink">{v.mode.classicShare}%</span>
          </span>
        </p>
        <p className="pv-small text-ink-3">{t("split.note")}</p>
      </section>

      <div className={`grid gap-8 ${compact ? "" : "md:grid-cols-2"}`}>
        <section className="grid content-start gap-3" aria-labelledby={`${id}-topics`} data-testid="visits-topics">
          <h3 id={`${id}-topics`} className="label">
            {t("topicsTitle")}
          </h3>
          <ul className="grid gap-3">
            {v.asks.topics.map((x) => (
              <li key={x.topic} className="grid gap-1.5" data-topic={x.topic}>
                <span className="pv-small flex justify-between gap-3 text-ink-2">
                  <span>{t(`topics.${x.topic}`)}</span>
                  <span className="pv-num text-ink">{x.share}%</span>
                </span>
                <Bar share={x.share} tone="cyan" />
              </li>
            ))}
          </ul>
          <p className="pv-small text-ink-3">{t("topicsNote")}</p>
        </section>

        <section className="grid content-start gap-3" aria-labelledby={`${id}-chips`} data-testid="visits-chips">
          <h3 id={`${id}-chips`} className="label">
            {t("chipsTitle")}
          </h3>
          {v.asks.chips.length ? (
            <ul className="grid gap-2">
              {v.asks.chips.map((c) => (
                <li key={c.id} className="pv-small flex items-baseline justify-between gap-3 border-t border-line pt-2" data-chip={c.id}>
                  <span className="text-ink-2">{chipLabels[c.id] ?? c.id}</span>
                  <span className="pv-data shrink-0 text-ink-3">{t("chipCount", { n: count(c.n) })}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="pv-small text-ink-3">{t("noChips")}</p>
          )}
          <p className="pv-small text-ink-3">{t("chipsNote")}</p>
        </section>
      </div>

      {footer}
    </div>
  );
}

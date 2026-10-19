"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { RoomView } from "@/content/room-views/types";
import type { Locale } from "@/content/schema";
import type { RoomBodyProps } from "@/hud/drawer/bodies";
import { External, MetricTiles } from "@/hud/drawer/blocks";
import { sinceLabel } from "@/lib/office/model";
import type { OfficeFeed } from "@/lib/office/poll";
import type { OfficeGithubItem } from "@/lib/office/protocol";
import { getHQStore } from "@/store/useHQStore";
import { officeDeskRoom } from "../officeLayout";
import { loadOffice } from "./chunk";
import { officeLive, useOfficeFeed } from "./live";
import { chipLines, officeView, safeGithubUrl, safeRepoUrl, type OfficeRoverView, type OfficeView } from "./officeModel";
import { OFFICE_STATE_STYLE, STATUS_COLOR } from "./officeVisual";

// Existing classes only (no new Tailwind utilities: the CSS budget rides on every page).
const HEAD = "label text-ink-2";
const ROW = "rounded-xl border border-glass-border bg-white/[0.03] p-3";
const NOTE = "text-[13px] leading-5 text-ink-2";

type OfficePanel = NonNullable<RoomView["office"]>["panel"];

function useNow(ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

/** A state or status dot (never an edge stripe). */
function Dot({ color }: { color: string }) {
  return <span aria-hidden="true" className="hq-dot hq-dot-md" style={{ color }} />;
}

function Field({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="text-ink" data-testid={testId}>
        {children}
      </dd>
    </div>
  );
}

function DeskPanel({ rover, updatedAt, locale, now }: { rover: OfficeRoverView; updatedAt: number | null; locale: Locale; now: number }) {
  const t = useTranslations("office");
  const repo = safeRepoUrl(rover.repo);
  // A public repository without a title is not a client project: say the title was not shared instead.
  const task = !rover.agent ? t("3d.drawer.none") : (rover.title ?? (rover.state === "asleep" ? t("3d.drawer.none") : repo ? t("3d.drawer.untitled") : t("3d.clientPrivate")));
  return (
    <>
      <p className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-glass-border px-2.5 text-[13px] text-ink-2" data-testid="office-state">
        <Dot color={OFFICE_STATE_STYLE[rover.state].color} />
        {t(`state.${rover.state}`)}
      </p>
      <dl className="space-y-2 text-[15px] leading-6">
        <Field label={t("3d.drawer.agent")}>{rover.agent ? t(`3d.agentFull.${rover.agent}`) : t("3d.offDuty")}</Field>
        <Field label={t("3d.drawer.activity")}>{t(`activity.${rover.activity}`)}</Field>
        <Field label={t("3d.drawer.task")} testId="office-task">
          {task}
        </Field>
        {repo && (
          <Field label={t("3d.drawer.repo")}>
            <External href={repo} testId="office-repo">
              {rover.repo}
            </External>
          </Field>
        )}
        {rover.since !== null && <Field label={t("3d.drawer.since")}>{sinceLabel(rover.since, locale, now)}</Field>}
        {updatedAt !== null && <Field label={t("3d.drawer.updated")}>{sinceLabel(updatedAt, locale, now)}</Field>}
      </dl>
      {rover.recent.length > 0 && (
        <section className="space-y-2">
          <h3 className={HEAD}>{t("3d.drawer.recent")}</h3>
          <ul className="space-y-2">
            {rover.recent.map((e, i) => (
              <li key={i} className="flex items-center gap-2 text-[13px] leading-5 text-ink-2" data-testid="office-recent">
                <Dot color={OFFICE_STATE_STYLE[e.state].color} />
                <span className="text-ink">{t(`activity.${e.activity}`)}</span>
                <span>{sinceLabel(e.at, locale, now)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function SummaryPanel({ office }: { office: OfficeView }) {
  const t = useTranslations("office");
  const today = office.today;
  return (
    <>
      <section className="space-y-2">
        <h3 className={HEAD}>{t("3d.drawer.agents")}</h3>
        <ul className="space-y-2">
          {office.rovers.map((r) => {
            const line = chipLines(r, t);
            return (
              <li key={r.slot}>
                <button type="button" className={`${ROW} hq-glow flex w-full items-center gap-2 text-left`} onClick={() => getHQStore().getState().openRoom(officeDeskRoom(r.slot))} data-testid="office-agent">
                  <Dot color={OFFICE_STATE_STYLE[r.state].color} />
                  <span className="text-ink">{t("3d.target.desk", { n: r.slot + 1, agent: line.head })}</span>
                  {line.task && <span className="text-xs text-ink-3">{line.task}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      {today && (
        <section className="space-y-2">
          <h3 className={HEAD}>{t("3d.drawer.today")}</h3>
          <MetricTiles
            fluid
            metrics={[
              { value: String(today.tasksDone), label: t("3d.drawer.tasksDone") },
              { value: String(today.prsMerged), label: t("3d.drawer.prsMerged") },
              { value: `${today.ciGreen}/${today.ciRuns}`, label: t("3d.drawer.ciGreen") },
            ]}
          />
        </section>
      )}
    </>
  );
}

function GithubRow({ item, locale, now }: { item: OfficeGithubItem; locale: Locale; now: number }) {
  const t = useTranslations("office");
  const url = safeGithubUrl(item.url);
  const color = STATUS_COLOR[item.status];
  const progress = item.progress && item.progress.total > 0 ? item.progress : null;
  return (
    <li className={ROW} data-testid="office-feed-row" data-status={item.status}>
      <p className="flex items-center gap-2 text-ink">
        <Dot color={color} />
        {url ? (
          <External href={url}>{item.title}</External>
        ) : (
          item.title
        )}
      </p>
      <p className="text-xs text-ink-3">{`${item.repo} · ${t(`3d.github.kind.${item.kind}`)} · ${t(`3d.github.status.${item.status}`)} · ${sinceLabel(item.at, locale, now)}`}</p>
      {progress && (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.done}
          aria-label={t("3d.jobs", { done: progress.done, total: progress.total })}
          style={{ marginTop: 6, height: 4, borderRadius: 2, background: "rgb(255 255 255 / 0.08)", overflow: "hidden" }}
        >
          <div style={{ width: `${Math.round((progress.done / progress.total) * 100)}%`, height: "100%", background: color }} />
        </div>
      )}
    </li>
  );
}

function GithubPanel({ items, locale, now }: { items: readonly OfficeGithubItem[]; locale: Locale; now: number }) {
  const t = useTranslations("office");
  return items.length ? (
    <ul className="space-y-2" data-testid="office-feed">
      {items.map((item, i) => (
        <GithubRow key={`${item.url}-${i}`} item={item} locale={locale} now={now} />
      ))}
    </ul>
  ) : (
    <p className="text-[15px] leading-6 text-ink-2">{t("3d.wall.empty")}</p>
  );
}

/** The panel's standing notes (how the data arrives, what never leaves the machine), shown in every feed state. */
function PanelNotes({ panel }: { panel: OfficePanel }) {
  const t = useTranslations("office");
  if (panel === "github") return <p className={NOTE}>{t("3d.githubNote")}</p>;
  return (
    <>
      {panel === "summary" && <p className={NOTE}>{t("3d.hooks")}</p>}
      <p className={NOTE}>{t("privacy")}</p>
    </>
  );
}

/** No data to show yet or any more: the first fetch is pending or failed, or the live office is switched off. */
function feedNotice(feed: OfficeFeed): "loading" | "offlineEmpty" | "disabled" | null {
  if (feed.status === "disabled") return "disabled";
  if (feed.snapshot) return null;
  return feed.status === "offline" ? "offlineEmpty" : "loading";
}

/**
 * Agent Office drawer bodies (chunk; registered as the `office` kind in hud/drawer/bodies.tsx): the summary half
 * of the wall, the GitHub half, or one Rover's desk, from the live feed. Opening any of them polls (reason
 * "drawer") until it closes. Only protocol fields: no prompt, no path, no private title.
 */
export function OfficeBody({ view, locale }: RoomBodyProps) {
  const t = useTranslations("office");
  const feed = useOfficeFeed();
  const office = useMemo(() => officeView(feed), [feed]);
  const now = useNow(5000);
  useEffect(() => {
    officeLive.want("drawer", true);
    // Opening a drawer is a user action: start (or retry) the 3D office too, even with `?prefetch=off`.
    void loadOffice().catch(() => null);
    return () => officeLive.want("drawer", false);
  }, []);
  const panel = view.office;
  if (!panel) return null;
  const notice = feedNotice(feed);
  const rover = panel.panel === "desk" ? office.rovers[panel.slot ?? 0] : undefined;
  return (
    <div className="grid gap-6" data-testid="office-body" data-panel={panel.panel}>
      {notice ? (
        <p className="text-[15px] leading-6 text-ink-2" role="status" data-testid="office-notice">
          {t(`3d.drawer.${notice}`)}
        </p>
      ) : (
        <>
          {feed.status === "offline" && (
            <p className={NOTE} role="status" data-testid="office-offline">
              {t("3d.drawer.offline")}
            </p>
          )}
          {panel.panel === "desk" ? (
            rover && <DeskPanel rover={rover} updatedAt={office.updatedAt} locale={locale} now={now} />
          ) : panel.panel === "github" ? (
            <GithubPanel items={office.github} locale={locale} now={now} />
          ) : (
            <SummaryPanel office={office} />
          )}
        </>
      )}
      <PanelNotes panel={panel.panel} />
    </div>
  );
}

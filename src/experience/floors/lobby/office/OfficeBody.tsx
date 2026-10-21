"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { RoomView } from "@/content/room-views/types";
import type { Locale } from "@/content/schema";
import type { RoomBodyProps } from "@/hud/drawer/bodies";
import { External, MetricTiles } from "@/hud/drawer/blocks";
import { sinceLabel } from "@/lib/office/model";
import type { OfficeFeed } from "@/lib/office/poll";
import type { OfficeGithubItem, OfficePipeline } from "@/lib/office/protocol";
import { getHQStore } from "@/store/useHQStore";
import { officeDeskRoom, type OfficeTranslate } from "../officeLayout";
import { loadOffice, useOfficeModule, type OfficeModule } from "./chunk";
import { crewAnnouncement, crewLines } from "./crewSummary";
import { chipLines, helpersText, officeView, safeGithubUrl, safeRepoUrl, type OfficeRoverView, type OfficeView } from "./officeModel";
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
  const helpers = rover.agent ? helpersText(rover, t) : null;
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
        <Field label={t("3d.drawer.activity")} testId="office-activity">
          {helpers ? `${t(`activity.${rover.activity}`)} · ${helpers}` : t(`activity.${rover.activity}`)}
        </Field>
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

/** The live region's text: the state changes since the last announcement, at most one announcement per 10 s. */
function useCrewNews(office: OfficeView, t: OfficeTranslate): string {
  const [news, setNews] = useState("");
  const s = useRef({ said: office, next: office, at: 0, timer: 0 });
  useEffect(() => {
    const r = s.current;
    r.next = office;
    if (r.timer) return;
    r.timer = window.setTimeout(() => {
      r.timer = 0;
      const text = crewAnnouncement(r.said, r.next, t);
      if (!text) return;
      r.said = r.next;
      r.at = Date.now();
      setNews(text);
    }, Math.max(0, r.at + 10_000 - Date.now()));
  }, [office, t]);
  useEffect(() => {
    const r = s.current;
    return () => {
      window.clearTimeout(r.timer);
      r.timer = 0;
    };
  }, []);
  return news;
}

function SummaryPanel({ office, locale }: { office: OfficeView; locale: Locale }) {
  const t = useTranslations("office");
  const news = useCrewNews(office, t);
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
      <section className="sr-only" data-testid="office-crew">
        <h3>{t("3d.crew.title")}</h3>
        <ul>
          {crewLines(office, t, locale).map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
        <p className="sr-only" role="status" aria-live="polite" data-testid="office-crew-news">
          {news}
        </p>
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

const JOB_COLOR = { queued: "#8a93b5", running: STATUS_COLOR.running, done: STATUS_COLOR.success, failed: STATUS_COLOR.failure } as const;

/** A shipped production deploy: the feed title the Worker gives the production environment (as `officeSignal.ts`; a preview never ships). */
const shipped = (g: OfficeGithubItem) => (g.kind === "pr" && g.status === "merged") || (g.kind === "deploy" && g.status === "success" && g.title === "Deploy · production");

/**
 * The CI tower's text alternative: the latest runs with their lanes (the last snapshot's while offline, under the
 * offline note; for a snapshot without a pipeline, a rollback to v3, the running run's anonymous progress), then the
 * latest merges and production deploys that succeeded.
 */
function CiPanel({ office, pipeline, locale, now }: { office: OfficeView; pipeline: OfficePipeline | undefined; locale: Locale; now: number }) {
  const t = useTranslations("office");
  const runs = pipeline?.runs ?? [];
  const ships = office.github.filter(shipped);
  const anonymous = pipeline ? undefined : office.github.find((g) => g.kind === "run" && g.status === "running");
  if (runs.length === 0 && ships.length === 0 && !anonymous) return <p className={NOTE}>{t("3d.ci.none")}</p>;
  return (
    <dl className="grid gap-6" data-testid="office-ci">
      {(anonymous || runs.length > 0) && (
        <Field label={t("3d.ci.runs")}>
          <ul className="space-y-2">
            {anonymous && <GithubRow item={anonymous} locale={locale} now={now} />}
            {runs.map((r) => {
              const url = safeGithubUrl(r.url);
              return (
                <li key={r.id} className={ROW} data-testid="office-ci-run" data-status={r.status}>
                  <p className="flex items-center gap-2 text-ink">
                    <Dot color={STATUS_COLOR[r.status]} />
                    {url ? <External href={url}>{r.title}</External> : r.title}
                  </p>
                  <p className="text-xs text-ink-3">{[r.repo, t(`3d.github.status.${r.status}`), r.slot !== undefined && t("3d.ci.desk", { n: r.slot + 1 }), sinceLabel(r.at, locale, now)].filter(Boolean).join(" · ")}</p>
                  <ol className="mt-2 grid gap-1 text-[13px] leading-5 text-ink-2">
                    {r.jobs.map((j, k) => (
                      <li key={k} className="flex items-center gap-2" data-status={j.status}>
                        <Dot color={JOB_COLOR[j.status]} />
                        {`${j.name}: ${t(`3d.ci.job.${j.status}`)}`}
                      </li>
                    ))}
                  </ol>
                </li>
              );
            })}
          </ul>
        </Field>
      )}
      {ships.length > 0 && (
        <Field label={t("3d.ci.ships")}>
          <ul className="space-y-2">
            {ships.map((item, i) => (
              <GithubRow key={`${item.url}-${i}`} item={item} locale={locale} now={now} />
            ))}
          </ul>
        </Field>
      )}
    </dl>
  );
}

/** The panel's standing note (how the data arrives), shown in every feed state. */
function PanelNotes({ panel }: { panel: OfficePanel }) {
  const t = useTranslations("office");
  return <p className={NOTE}>{t(panel === "github" || panel === "ci" ? "3d.githubNote" : "3d.hooks")}</p>;
}

type FeedNotice = "loading" | "offlineEmpty" | "disabled";

/** No data to show yet or any more: the first fetch is pending or failed, or the live office is switched off. */
function feedNotice(feed: OfficeFeed): FeedNotice | null {
  if (feed.status === "disabled") return "disabled";
  if (feed.snapshot) return null;
  return feed.status === "offline" ? "offlineEmpty" : "loading";
}

function Notice({ notice }: { notice: FeedNotice }) {
  const t = useTranslations("office");
  return (
    <p className="text-[15px] leading-6 text-ink-2" role="status" data-testid="office-notice">
      {t(`3d.drawer.${notice}`)}
    </p>
  );
}

/**
 * Agent Office drawer bodies (chunk; registered as the `office` kind in hud/drawer/bodies.tsx): the summary half
 * of the wall, the GitHub half, the CI tower, or one Rover's desk, from the live feed. The feed is the scene chunk's one poller
 * (`./live.ts`, read through the loaded `./scene.ts`, so this chunk carries no poller or protocol validators): until
 * that chunk is here the drawer shows its loading note, or the offline note when the chunk fails to load (the next
 * open retries). Opening any of them polls (reason "drawer") until it closes. Only protocol fields: no prompt, no
 * path, no private title.
 */
export function OfficeBody({ view, locale }: RoomBodyProps) {
  const office = useOfficeModule();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    // Opening a drawer is a user action: start (or retry) the 3D office, even with `?prefetch=off`; its feed lives there.
    void loadOffice().catch(() => setFailed(true));
  }, []);
  const panel = view.office;
  if (!panel) return null;
  if (office) return <LiveBody live={office} panel={panel} locale={locale} />;
  return (
    <div className="grid gap-6" data-testid="office-body" data-panel={panel.panel}>
      <Notice notice={failed ? "offlineEmpty" : "loading"} />
      <PanelNotes panel={panel.panel} />
    </div>
  );
}

function LiveBody({ live, panel, locale }: { live: OfficeModule; panel: NonNullable<RoomView["office"]>; locale: Locale }) {
  const t = useTranslations("office");
  const feed = live.useOfficeFeed();
  const office = useMemo(() => officeView(feed), [feed]);
  const now = useNow(5000);
  const { officeLive } = live;
  useEffect(() => {
    officeLive.want("drawer", true);
    return () => officeLive.want("drawer", false);
  }, [officeLive]);
  const notice = feedNotice(feed);
  const rover = panel.panel === "desk" ? office.rovers[panel.slot ?? 0] : undefined;
  return (
    <div className="grid gap-6" data-testid="office-body" data-panel={panel.panel}>
      {notice ? (
        <Notice notice={notice} />
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
          ) : panel.panel === "ci" ? (
            <CiPanel office={office} pipeline={feed.snapshot?.pipeline} locale={locale} now={now} />
          ) : (
            <SummaryPanel office={office} locale={locale} />
          )}
        </>
      )}
      <PanelNotes panel={panel.panel} />
    </div>
  );
}

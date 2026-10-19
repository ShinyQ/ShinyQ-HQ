"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Locale } from "@/content/locales";
import { deskTitle, officeCounts, sinceLabel, STATE_TONE, type OfficeCounts } from "@/lib/office/model";
import { createOfficePoller, type OfficeFeed, type OfficeFeedStatus, type OfficePoller } from "@/lib/office/poll";
import type { OfficeGithubStatus } from "@/lib/office/protocol";
import { fill, type OfficeCardLabels } from "./labels";

export interface OfficePanelProps {
  locale: Locale;
  labels: OfficeCardLabels;
  onStatus?: (status: OfficeFeedStatus) => void;
  /** Tests inject a poller and a clock. */
  poller?: OfficePoller;
  now?: () => number;
}

const GITHUB_SHOWN = 4;
const COUNTS: readonly (keyof OfficeCounts)[] = ["active", "thinking", "waiting", "asleep"];
const ICON: Record<OfficeGithubStatus, string> = { running: "\u25cc", success: "\u2713", failure: "\u2715", merged: "\u2713", opened: "\u25cb", pushed: "\u2191" };
const ICON_TONE: Record<OfficeGithubStatus, string> = {
  running: "text-cyan",
  success: "text-green",
  failure: "text-pink",
  merged: "text-violet",
  opened: "text-ink-2",
  pushed: "text-ink-2",
};

/** The local time of the last good fetch, for "updated 15:04". */
function clock(locale: Locale, at: number): string {
  return new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-GB", { hour: "2-digit", minute: "2-digit" }).format(at);
}

function Dot({ tone }: { tone: string }) {
  return <span aria-hidden="true" className="inline-block size-2 shrink-0 rounded-full" style={{ backgroundColor: tone }} />;
}

/**
 * The Classic home card (lazy chunk): counts, the desks, the latest public GitHub events, today and the privacy note
 * (spec section 4.2). Polls only while the card is within a screen of the viewport; the poller skips hidden tabs,
 * stops after 10 min without input, and keeps the last snapshot 60 s before reporting offline.
 */
export function OfficePanel({ locale, labels, onStatus, poller: injected, now = Date.now }: OfficePanelProps) {
  const poller = useMemo(() => injected ?? createOfficePoller(), [injected]);
  const [feed, setFeed] = useState<OfficeFeed>(() => poller.feed());
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const off = poller.subscribe(setFeed);
    const touch = () => poller.touch();
    window.addEventListener("pointerdown", touch, { passive: true });
    window.addEventListener("keydown", touch);
    window.addEventListener("scroll", touch, { passive: true });
    const el = root.current;
    const observer =
      el && typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver((entries) => (entries.some((e) => e.isIntersecting) ? poller.start() : poller.stop()), { rootMargin: "100% 0px" })
        : null;
    if (observer && el) observer.observe(el);
    else poller.start();
    return () => {
      off();
      observer?.disconnect();
      window.removeEventListener("pointerdown", touch);
      window.removeEventListener("keydown", touch);
      window.removeEventListener("scroll", touch);
      poller.stop();
    };
  }, [poller]);

  useEffect(() => {
    onStatus?.(feed.status);
  }, [feed.status, onStatus]);

  const snap = feed.snapshot;
  const desks = snap?.desks ?? [];
  const counts = officeCounts(desks);
  const t = now();
  const live = feed.status === "ready" && snap?.mode === "live";
  const line =
    feed.status === "offline"
      ? labels.offline
      : !snap
        ? labels.loading
        : snap.mode === "semi-live"
          ? labels.semiLive
          : snap.mode === "off"
            ? labels.resting
            : `${labels.live} \u00b7 ${fill(labels.updated, { time: clock(locale, feed.fetchedAt) })}`;

  return (
    <div ref={root} className="min-h-80">
      <p data-testid="office-live" role="status" className="pv-date flex items-center gap-2">
        <Dot tone={live ? STATE_TONE.done : STATE_TONE.asleep} />
        {line}
      </p>
      {snap && (
        <>
          <dl className="mt-6 grid grid-cols-4 border-y border-line">
            {COUNTS.map((key, i) => (
              <div key={key} data-testid={`office-count-${key}`} className={`flex flex-col-reverse gap-2.5 py-4 ${i > 0 ? "border-l border-line pl-4" : ""}`}>
                <dt className="pv-data">{labels.counts[key]}</dt>
                <dd className="pv-num text-[28px] leading-none">{counts[key]}</dd>
              </div>
            ))}
          </dl>

          <h3 className="pv-data mt-8">{labels.agents}</h3>
          {desks.length === 0 ? (
            <p className="mt-3 text-ink-2">{labels.noAgents}</p>
          ) : (
            <ul className="pv-rows pv-rows-closed mt-3">
              {desks.map((d) => (
                <li key={d.slot} data-testid="office-desk" className="grid grid-cols-[auto_1fr_auto] items-baseline gap-3 py-3">
                  <Dot tone={STATE_TONE[d.state]} />
                  <span className="min-w-0">
                    <span className="text-ink">
                      {labels.agentNames[d.agent]} {"\u00b7"} {labels.activities[d.activity]}
                    </span>
                    <span className="block truncate text-sm text-ink-2">{deskTitle(d) ?? labels.clientProject}</span>
                  </span>
                  <span className="pv-data">{labels.states[d.state]}</span>
                </li>
              ))}
            </ul>
          )}
          {snap.extra > 0 && <p className="pv-date mt-2">{fill(labels.extra, { count: snap.extra })}</p>}

          <h3 className="pv-data mt-8">{labels.github}</h3>
          {snap.github.length === 0 ? (
            <p className="mt-3 text-ink-2">{labels.noGithub}</p>
          ) : (
            <ul className="pv-rows pv-rows-closed mt-3">
              {snap.github.slice(0, GITHUB_SHOWN).map((g) => (
                <li key={`${g.kind}-${g.url}-${g.at}`} data-testid="office-github" className="grid grid-cols-[auto_1fr_auto] items-baseline gap-3 py-3">
                  <span aria-hidden="true" className={ICON_TONE[g.status]}>
                    {ICON[g.status]}
                  </span>
                  <a href={g.url} rel="noopener noreferrer" target="_blank" className="pv-row-title min-w-0 truncate text-ink">
                    {g.title}
                  </a>
                  <span className="pv-date">
                    {labels.status[g.status]} {"\u00b7"} {sinceLabel(g.at, locale, t)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <p data-testid="office-today" className="mt-6 text-sm text-ink-2">
            {fill(labels.today, { tasks: snap.today.tasksDone, prs: snap.today.prsMerged, green: snap.today.ciGreen, runs: snap.today.ciRuns })}
          </p>
        </>
      )}
      <p data-testid="office-privacy" className="mt-6 text-sm text-ink-3">
        {labels.privacy}
      </p>
    </div>
  );
}

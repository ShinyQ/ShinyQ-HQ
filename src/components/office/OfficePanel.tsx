"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Locale } from "@/content/locales";
import { deskTitle, officeCounts, safeGithubUrl, sinceLabel, STATE_TONE, withSeats, type OfficeCounts } from "@/lib/office/model";
import { createOfficePoller, OFFICE_V3_PATH, POLL, type OfficeFeed, type OfficeFeedStatus, type OfficePoller } from "@/lib/office/poll";
import { OFFICE_SEATS, parseOfficeResponseV3, type OfficeDeskV2, type OfficeGithubItem, type OfficeGithubStatus } from "@/lib/office/protocol";
import { fill } from "./fill";
import { OFFICE_RESERVE, type OfficeCardLabels } from "./labels";

export interface OfficePanelProps {
  locale: Locale;
  labels: OfficeCardLabels;
  onStatus?: (status: OfficeFeedStatus) => void;
  /** Tests inject a poller and a clock. */
  poller?: OfficePoller;
  now?: () => number;
}

const GITHUB_SHOWN = 4;
/** Desk rows: the card keeps five whatever the seat count (ten in snapshot v3); past five active desks the fifth says "+N more". */
const ROWS = 5;
const COUNTS: readonly (keyof OfficeCounts)[] = ["active", "thinking", "waiting", "asleep"];
/** Hairline rules of the counts strip: 2 by 2 below `md` (the Indonesian labels do not fit four across), one row from `md`. */
const COUNT_RULES = ["", "border-l pl-4", "border-t md:border-t-0 md:border-l md:pl-4", "border-l border-t pl-4 md:border-t-0"];
const ICON: Record<OfficeGithubStatus, string> = { running: "\u25d0", success: "\u2713", failure: "\u2715", merged: "\u2713", opened: "\u25cb", pushed: "\u2191" };
const ICON_TONE: Record<OfficeGithubStatus, string> = {
  running: "text-cyan",
  success: "text-green",
  failure: "text-pink",
  merged: "text-violet",
  opened: "text-ink-2",
  pushed: "text-ink-2",
};
/**
 * Keeps an empty line's height (the card draws every slot in every state, so its height never changes). Below `md`
 * the status line and today's line may wrap, so they hold two lines there (`min-h-8`, `min-h-10`).
 */
const EMPTY = "\u00a0";
/** Input that resets the poller's 10 min idle stop (and restarts it after one). */
const INPUT = ["pointerdown", "pointermove", "keydown", "scroll"] as const;

/** The local time of the last good fetch, for "updated 15:04". */
function clock(locale: Locale, at: number): string {
  return new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-GB", { hour: "2-digit", minute: "2-digit" }).format(at);
}

/** The rows' awake desks (any state but asleep), front row first (by seat); asleep and empty seats count on the idle line. */
function activeDesks(desks: readonly OfficeDeskV2[]): OfficeDeskV2[] {
  return desks.filter((d) => d.state !== "asleep").sort((a, b) => a.slot - b.slot);
}

function Dot({ tone, className = "" }: { tone: string; className?: string }) {
  return <span aria-hidden="true" className={`inline-block size-2 shrink-0 rounded-full ${className}`} style={{ backgroundColor: tone }} />;
}

/** "Copilot · Editing", plus " · 3 helpers" while an awake desk has helpers (one line that truncates, so the row keeps its height). */
function deskHead(desk: OfficeDeskV2, labels: OfficeCardLabels, locale: Locale): string {
  const head = `${labels.agentNames[desk.agent]} \u00b7 ${labels.activities[desk.activity]}`;
  const helpers = desk.state === "asleep" ? 0 : (desk.helpers ?? 0);
  return helpers > 0 ? `${head} \u00b7 ${fill(labels.helpers, { n: helpers }, locale)}` : head;
}

const ROW = "grid grid-cols-[auto_1fr_auto] items-baseline gap-3 py-3";

/** An awake desk: agent, activity (and helpers), its task (the title, else "Client project") and state. */
function DeskRow({ desk, labels, locale }: { desk: OfficeDeskV2; labels: OfficeCardLabels; locale: Locale }) {
  return (
    <li data-testid="office-desk" data-state={desk.state} className={ROW}>
      <Dot tone={STATE_TONE[desk.state]} />
      <span className="min-w-0">
        <span className="block truncate text-ink">{deskHead(desk, labels, locale)}</span>
        <span data-testid="office-task" className="block truncate text-sm text-ink-2">
          {deskTitle(desk) ?? labels.clientProject}
        </span>
      </span>
      <span className="pv-data">{labels.states[desk.state]}</span>
    </li>
  );
}

/**
 * A desk row without a desk, with the same two lines (so every row has one height): "+N more active desks", "Every
 * Rover is asleep." when no desk is awake, or an empty slot.
 */
function QuietRow({ text, testId }: { text?: string; testId: string }) {
  return (
    <li data-testid={testId} aria-hidden={text ? undefined : true} className={ROW}>
      <span aria-hidden="true" className="inline-block size-2" />
      <span className="min-w-0">
        <span className="block truncate text-ink-2">{text ?? EMPTY}</span>
        <span aria-hidden="true" className="block text-sm">
          {EMPTY}
        </span>
      </span>
    </li>
  );
}

function GithubRow({ item, locale, labels, t }: { item: OfficeGithubItem; locale: Locale; labels: OfficeCardLabels; t: number }) {
  const href = safeGithubUrl(item.url);
  return (
    <li data-testid="office-github" className="grid grid-cols-[auto_1fr_auto] items-baseline gap-3 py-3">
      <span aria-hidden="true" className={ICON_TONE[item.status]}>
        {ICON[item.status]}
      </span>
      {href ? (
        <a href={href} rel="noopener noreferrer" target="_blank" className="pv-row-title min-w-0 truncate text-ink">
          {item.title}
        </a>
      ) : (
        <span className="min-w-0 truncate text-ink">{item.title}</span>
      )}
      <span className="pv-date">
        {labels.status[item.status]} {"\u00b7"} {sinceLabel(item.at, locale, t)}
      </span>
    </li>
  );
}

/**
 * The Classic home card (lazy chunk): counts over the ten seats of snapshot v3, five desk rows (the awake desks, front
 * row first, with their helpers; past five the fifth row is "+N more active desks"), the idle summary (asleep and empty
 * seats, plus sessions past ten), the latest public GitHub events and today (spec sections 4.2 and 5.10). Every state
 * draws the same rows (quiet rows fill the desk and GitHub slots, offline keeps the last known rows dimmed), so the
 * card keeps one height (`OFFICE_RESERVE`). Polls only
 * while the card is within a screen of the viewport; the poller skips hidden tabs, stops after 10 min without input,
 * and keeps the last snapshot 60 s before reporting offline. A disabled office hides the section only once it is off
 * screen, so the switch never moves what the visitor is reading.
 */
export function OfficePanel({ locale, labels, onStatus, poller: injected, now = Date.now }: OfficePanelProps) {
  const poller = useMemo(() => injected ?? createOfficePoller({ path: OFFICE_V3_PATH, parse: parseOfficeResponseV3 }), [injected]);
  const [feed, setFeed] = useState<OfficeFeed>(() => poller.feed());
  const [onScreen, setOnScreen] = useState(false);
  const [, setTick] = useState(0);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const off = poller.subscribe(setFeed);
    const touch = () => poller.touch();
    let near = false;
    // The tab coming back counts as input and fetches at once (as the 3D office does).
    const onVisible = () => {
      if (document.visibilityState !== "visible" || !near) return;
      poller.stop();
      poller.touch();
      poller.start({ now: true });
    };
    for (const type of INPUT) window.addEventListener(type, touch, { passive: true });
    document.addEventListener("visibilitychange", onVisible);
    const el = root.current;
    const hasObserver = el && typeof IntersectionObserver !== "undefined";
    const nearby = hasObserver
      ? new IntersectionObserver(
          (entries) => {
            near = entries.some((e) => e.isIntersecting);
            if (near) poller.start();
            else poller.stop();
          },
          { rootMargin: "100% 0px" },
        )
      : null;
    const visible = hasObserver ? new IntersectionObserver((entries) => setOnScreen(entries.some((e) => e.isIntersecting))) : null;
    if (nearby && visible && el) {
      nearby.observe(el);
      visible.observe(el);
    } else {
      near = true;
      poller.start();
    }
    return () => {
      off();
      nearby?.disconnect();
      visible?.disconnect();
      for (const type of INPUT) window.removeEventListener(type, touch);
      document.removeEventListener("visibilitychange", onVisible);
      poller.stop();
    };
  }, [poller]);

  // Held while the card is on screen: the shell hides a disabled office once it scrolls away.
  const reported = feed.status === "disabled" && onScreen ? null : feed.status;
  useEffect(() => {
    if (reported) onStatus?.(reported);
  }, [reported, onStatus]);

  const snap = feed.status === "disabled" || !feed.snapshot ? null : withSeats(feed.snapshot, OFFICE_SEATS);
  const t = now();
  const fresh = feed.status === "ready" && t - feed.fetchedAt < POLL.keepLastMs;
  // Live turns into Paused once the snapshot is older than the keep-last window (no poll since: idle stop, hidden tab).
  useEffect(() => {
    if (!fresh) return;
    const id = setTimeout(() => setTick((n) => n + 1), feed.fetchedAt + POLL.keepLastMs - t + 50);
    return () => clearTimeout(id);
  }, [fresh, feed.fetchedAt, t]);

  const offline = feed.status === "offline";
  const live = fresh && snap?.mode === "live";
  const line =
    feed.status === "disabled"
      ? labels.disabled
      : offline
        ? snap
          ? labels.offline
          : labels.offlineEmpty
        : !snap
          ? labels.loading
          : snap.mode === "semi-live"
            ? labels.semiLive
            : snap.mode === "off"
              ? labels.resting
              : live
                ? labels.live
                : labels.paused;
  const time = snap ? clock(locale, feed.fetchedAt) : "";
  const note = !snap ? null : offline ? fill(labels.asOf, { time }) : snap.mode === "live" ? fill(labels.updated, { time }) : null;
  const body = snap !== null || offline;
  const desks = snap?.desks ?? [];
  const github = (snap?.github ?? []).slice(0, GITHUB_SHOWN);
  // Empty seats count as asleep, as on the 3D wall, so the idle line is the Asleep count.
  const counts = officeCounts(desks, OFFICE_SEATS);
  const active = activeDesks(desks);
  const shown = active.length > ROWS ? active.slice(0, ROWS - 1) : active;
  const more = active.length - shown.length;
  const quiet = ROWS - shown.length - (more > 0 ? 1 : 0) - (snap && active.length === 0 ? 1 : 0);
  const idle = snap ? fill(labels.idle, { n: counts.asleep }, locale) : null;
  const extra = idle && snap && snap.extra > 0 ? `${idle} \u00b7 ${fill(labels.extra, { count: snap.extra }, locale)}` : idle;
  const today = snap ? fill(snap.today.ciRuns > 0 ? labels.today : labels.todayNoCi, { tasks: snap.today.tasksDone, prs: snap.today.prsMerged, green: snap.today.ciGreen, runs: snap.today.ciRuns }, locale) : null;
  const placeholders = GITHUB_SHOWN - github.length - (snap && github.length === 0 ? 1 : 0);

  return (
    <div ref={root} data-testid="office-panel" data-feed={feed.status} className={`flex flex-col ${OFFICE_RESERVE[locale]}`}>
      <p data-testid="office-live" className="pv-date flex min-h-8 items-start gap-2 md:min-h-0">
        <Dot tone={live ? STATE_TONE.done : STATE_TONE.asleep} className="mt-1" />
        <span>
          {/* Only the state is announced: the minute clock would re-announce the line on every poll. */}
          <span role="status">{line}</span>
          {/* Keyed by the line: a new node when the state changes, so the time never counts as a moved element (CLS). */}
          {note && <span key={line} data-testid="office-time">{` \u00b7 ${note}`}</span>}
        </span>
      </p>
      {body && (
        // Offline: the last known rows stay in place, dimmed, under the "Offline ... as of" line.
        <div data-testid="office-body" className={offline ? "opacity-60" : undefined}>
          <dl className="mt-6 grid grid-cols-2 border-y border-line md:grid-cols-4">
            {COUNTS.map((key, i) => (
              <div key={key} data-testid={`office-count-${key}`} className={`flex flex-col-reverse gap-2.5 border-line py-4 ${COUNT_RULES[i]}`}>
                <dt className="pv-data">{labels.counts[key]}</dt>
                <dd className="pv-num text-[28px] leading-none">{counts[key]}</dd>
              </div>
            ))}
          </dl>

          <h3 className="pv-data mt-8">{labels.agents}</h3>
          <ul data-testid="office-desks" className="pv-rows pv-rows-closed mt-3">
            {shown.map((desk) => (
              <DeskRow key={desk.slot} desk={desk} labels={labels} locale={locale} />
            ))}
            {more > 0 && <QuietRow testId="office-more" text={fill(labels.moreActive, { n: more }, locale)} />}
            {snap && active.length === 0 && <QuietRow testId="office-none" text={labels.noAgents} />}
            {Array.from({ length: quiet }, (_, i) => (
              <QuietRow key={i} testId="office-desk-empty" />
            ))}
          </ul>
          <p data-testid="office-extra" aria-hidden={extra ? undefined : true} className="pv-date mt-2 truncate">
            {extra ?? EMPTY}
          </p>

          <h3 className="pv-data mt-8">{labels.github}</h3>
          <ul className="pv-rows pv-rows-closed mt-3">
            {github.map((g) => (
              <GithubRow key={`${g.kind}-${g.url}-${g.at}`} item={g} locale={locale} labels={labels} t={t} />
            ))}
            {snap && github.length === 0 && (
              <li data-testid="office-github-empty" className="py-3 text-ink-2">
                {labels.noGithub}
              </li>
            )}
            {Array.from({ length: placeholders }, (_, i) => (
              <li key={i} aria-hidden="true" className="py-3">
                {EMPTY}
              </li>
            ))}
          </ul>

          <p data-testid="office-today" aria-hidden={today ? undefined : true} className="mt-6 min-h-10 text-sm text-ink-2 md:min-h-0">
            {today ?? EMPTY}
          </p>
        </div>
      )}
    </div>
  );
}

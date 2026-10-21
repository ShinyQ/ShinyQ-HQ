/**
 * Frozen copy of the seat and view rules of the hq-office Worker from before ten seats (`workers/office/src/state.ts`
 * at dcc99c74): what a Worker rolled back to five desks does with a document the current Worker stored. Never update
 * it to follow the current Worker; it stands for code already deployed.
 */
import { OFFICE_DESKS, OFFICE_FEED_TITLE_MAX, wibDay } from "@/lib/office/protocol";
import type { OfficeDesk, OfficeGithubItem, OfficeProgress, OfficeSnapshotV1, OfficeSnapshotV2, OfficeToday } from "@/lib/office/protocol";
import { effective, effectiveHelpers, type Effective, type FeedRecord, type OfficeDoc, type RunRecord, type SessionRecord } from "../../workers/office/src/state";

const zeroToday = (now: number): OfficeToday => ({ day: wibDay(now), tasksDone: 0, prsMerged: 0, ciRuns: 0, ciGreen: 0 });
const rollToday = (today: OfficeToday, now: number): OfficeToday => (today.day === wibDay(now) ? today : zeroToday(now));
const isAsleep = (s: SessionRecord, now: number) => effective(s, now)?.state === "asleep";

export function legacyAssignSlots(sessions: SessionRecord[], now: number): SessionRecord[] {
  const out = sessions.map((s) => ({ ...s }));
  const taken = new Set<number>();
  for (const s of out) {
    if (s.slot !== null && s.slot >= 0 && s.slot < OFFICE_DESKS && !taken.has(s.slot)) taken.add(s.slot);
    else s.slot = null;
  }
  const waiting = out.filter((s) => s.slot === null).sort((a, b) => a.firstSeen - b.firstSeen || (a.id < b.id ? -1 : 1));
  for (const s of waiting) {
    const free = Array.from({ length: OFFICE_DESKS }, (_, n) => n).find((n) => !taken.has(n));
    if (free !== undefined) {
      s.slot = free;
      taken.add(free);
      continue;
    }
    if (isAsleep(s, now)) continue;
    const sleeper = out.filter((o) => o.slot !== null && isAsleep(o, now)).sort((a, b) => a.lastBeat - b.lastBeat)[0];
    if (sleeper) {
      s.slot = sleeper.slot;
      sleeper.slot = null;
    }
  }
  return out;
}

function progressOf(run: RunRecord): OfficeProgress | undefined {
  const states = Object.values(run.jobs);
  if (states.length === 0) return undefined;
  return { done: states.filter((s) => s === "done" || s === "failed").length, total: states.length };
}

function deskOf(doc: OfficeDoc, s: SessionRecord, e: Effective): OfficeDesk {
  const sameBranch = <T extends { repo: string; branch: string }>(r: T) => s.repo !== undefined && r.repo === s.repo && r.branch === s.branch;
  const run = s.branch ? doc.runs.find(sameBranch) : undefined;
  const pr = s.branch ? doc.prs.find(sameBranch) : undefined;
  const title = (pr?.title ?? s.title)?.slice(0, OFFICE_FEED_TITLE_MAX);
  const progress = e.state === "ci" && run?.status === "running" ? progressOf(run) : undefined;
  const job = e.state === "failed" ? run?.failedJob : undefined;
  return {
    slot: s.slot ?? 0,
    agent: s.agent,
    state: e.state,
    activity: e.activity,
    since: e.since,
    ...(s.repo ? { repo: s.repo } : {}),
    ...(title ? { title } : {}),
    ...(progress ? { progress } : {}),
    ...(job ? { job } : {}),
    recent: s.recent,
  };
}

const feedItem = (f: FeedRecord): OfficeGithubItem => ({ kind: f.kind, status: f.status, repo: f.repo, title: f.title, at: f.at, url: f.url, ...(f.progress ? { progress: f.progress } : {}) });

function seats(doc: OfficeDoc, now: number) {
  const live = doc.sessions.flatMap((s) => {
    const e = effective(s, now);
    return e ? [{ s, e }] : [];
  });
  const seated = live.filter(({ s }) => s.slot !== null).sort((a, b) => (a.s.slot ?? 0) - (b.s.slot ?? 0));
  return { live, seated };
}

export function legacyView(doc: OfficeDoc, now: number): OfficeSnapshotV1 {
  const { live, seated } = seats(doc, now);
  return {
    v: 1,
    enabled: true,
    mode: live.length > 0 ? "live" : "semi-live",
    updatedAt: now,
    desks: seated.map(({ s, e }) => deskOf(doc, s, e)),
    extra: live.length - seated.length,
    github: doc.feed.map(feedItem),
    today: rollToday(doc.today, now),
  };
}

export function legacyViewV2(doc: OfficeDoc, now: number): OfficeSnapshotV2 {
  const { seated } = seats(doc, now);
  const v1 = legacyView(doc, now);
  return {
    ...v1,
    v: 2,
    desks: v1.desks.map((d, i) => {
      const { s, e } = seated[i];
      const h = effectiveHelpers(s, e, now);
      return h > 0 ? { ...d, helpers: h } : d;
    }),
  };
}

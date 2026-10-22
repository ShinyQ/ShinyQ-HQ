import { OFFICE_ACTIVITIES, OFFICE_STATES, type OfficeActivity, type OfficeAgent, type OfficeBeatV1, type OfficeState } from "@/lib/office/protocol";
import { dayStart, parseOfficeHistory, type OfficeHistoryDeploy, type OfficeHistoryPr, type OfficeHistoryRun, type OfficeHistoryV1 } from "@/lib/office/protocolHistory";
import { emptyLog, historyDay, logDoc } from "../../workers/office/src/history";
import { applyBeat, effective, effectiveHelpers, emptyDoc, TIMING, type Effective, type SessionRecord } from "../../workers/office/src/state";

export interface HistoryOptions {
  /** Sessions live at once (a churned session may overlap its successor, so an eleventh can wait). */
  seats: number;
  hours: number;
  /** State changes per hour across the office. */
  changesPerHour: number;
  /** Office-wide quiet stretches (no beats) of 25 to 60 min, spread over the day. */
  quietGaps?: number;
  /** Beats carry helper counts (0 to 9). */
  helpers?: boolean;
  prs?: number;
  /** How many of the `prs` merges are on non-public repositories (repo and title ""). */
  privatePrs?: number;
  runs?: number;
  deploys?: number;
  seed?: number;
}

const DAY = "2026-10-21";
const BASE = dayStart(DAY);
const START_S = 8 * 3600;
const STEP_S = 20;
const PUBLIC = "ShinyQ/ShinyQ-HQ";
const PAIRS: [OfficeState, OfficeActivity][] = [
  ["working", "editing"],
  ["working", "reading"],
  ["working", "shell"],
  ["working", "git"],
  ["thinking", "planning"],
  ["reviewing", "reading"],
  ["testing", "testing"],
  ["ci", "ci"],
  ["input", "asking"],
  ["done", "finished"],
  ["failed", "failed"],
];
const AGENTS: OfficeAgent[] = ["copilot", "claude", "codex"];

/** mulberry32: a small seeded generator, so every run builds the same day. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

interface Sim {
  id: string;
  agent: OfficeAgent;
  pair: [OfficeState, OfficeActivity];
  helpers: number;
  repo?: string;
  title?: string;
  /** Day second until which this session sends no beats (a pause); Infinity once it has ended. */
  pausedUntil: number;
}

/**
 * A valid `OfficeHistoryV1` day, built by the real Worker: seeded beats run through `applyBeat` and `logDoc` (so seats,
 * seat moves, quiet gaps and helper decay are what the Durable Object would log), served through `historyDay`. Merges,
 * runs and deploys are placed at seeded times outside the quiet stretches. Validated with `parseOfficeHistory`.
 */
export function makeHistory(o: HistoryOptions): OfficeHistoryV1 {
  const r = rng(o.seed ?? 7);
  const pick = <T>(list: readonly T[]) => list[Math.floor(r() * list.length)];
  const hex = () => Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(r() * 16)]).join("");
  const endS = START_S + o.hours * 3600;
  const span = endS - START_S;
  const gaps: [number, number][] = [];
  const nGaps = o.quietGaps ?? 0;
  for (let i = 1; i <= nGaps; i++) {
    const mid = START_S + (i * span) / (nGaps + 1);
    const len = Math.min(1500 + r() * 2100, (0.6 * span) / (nGaps + 1));
    gaps.push([Math.round(mid - len / 2), Math.round(mid + len / 2)]);
  }
  const quiet = (s: number) => gaps.some(([a, b]) => s >= a && s < b);
  const doc0 = emptyDoc(BASE + START_S * 1000);
  let doc = { ...doc0, publicRepos: [PUBLIC] };
  let log = emptyLog(DAY);
  const born = (): Sim => {
    const own = r() < 0.6;
    return { id: hex(), agent: pick(AGENTS), pair: pick(PAIRS), helpers: 0, ...(own ? { repo: PUBLIC, title: `Task ${Math.floor(r() * 100)}` } : { repo: "acme/private" }), pausedUntil: 0 };
  };
  const sims: Sim[] = o.hours > 0 ? Array.from({ length: Math.min(10, o.seats) }, born) : [];
  const beat = (s: Sim, sec: number) => {
    const now = BASE + sec * 1000;
    const b: OfficeBeatV1 = { v: 1, agent: s.agent, session: s.id, state: s.pair[0], activity: s.pair[1], ...(s.repo ? { repo: s.repo, branch: "feat/x" } : {}), ...(s.title ? { title: s.title } : {}), ...(o.helpers ? { helpers: s.helpers } : {}), ts: now };
    const before = doc;
    doc = applyBeat(doc, b, now);
    log = logDoc(log, before, doc, now);
  };
  const perStep = (o.changesPerHour * STEP_S) / 3600;
  for (let sec = START_S; sec < endS && sims.length; sec += STEP_S) {
    if (quiet(sec)) continue;
    let k = Math.floor(perStep) + (r() < perStep % 1 ? 1 : 0);
    const live = () => sims.filter((s) => s.pausedUntil <= sec);
    while (k-- > 0) {
      const s = pick(live());
      if (!s) break;
      s.pair = pick(PAIRS);
      if (o.helpers && r() < 0.5) s.helpers = r() < 0.3 ? 0 : 1 + Math.floor(r() * 9);
      beat(s, sec);
    }
    for (const s of live()) {
      if (r() < 0.004) s.pausedUntil = sec + 200 + r() * 2400;
      else if (r() < 0.002) {
        s.pausedUntil = Infinity;
        sims.push(born());
      } else if (r() < 0.85) beat(s, sec);
    }
  }
  const served = historyDay(log, doc);
  const times = (n: number, from: number, to: number) => {
    const out: number[] = [];
    while (out.length < n) {
      const t = Math.round(from + r() * Math.max(0, to - from));
      if (!quiet(t) || to <= from) out.push(t);
    }
    return out.sort((a, b) => a - b);
  };
  const nPrs = o.prs ?? 0;
  const priv = new Set<number>();
  while (priv.size < Math.min(nPrs, o.privatePrs ?? 0)) priv.add(Math.floor(r() * nPrs));
  const prs = times(nPrs, START_S + 60, endS).map((t, i): OfficeHistoryPr => (priv.has(i) ? [t, Math.floor(r() * 11) - 1, "", i + 1, ""] : [t, Math.floor(r() * 11) - 1, PUBLIC, i + 1, `Merge Number ${i + 1}`]));
  const runs = times(o.runs ?? 0, START_S + 60, endS - 600)
    .map((t): OfficeHistoryRun => [t, t + 120 + Math.round(r() * 480), Math.floor(r() * 11) - 1, r() < 0.7 ? 1 : 0, 2 + Math.floor(r() * 11)])
    .sort((a, b) => a[1] - b[1]);
  const deploys = times(o.deploys ?? 0, START_S + 60, endS).map((t): OfficeHistoryDeploy => [t, r() < 0.7 ? 1 : 0]);
  const h = parseOfficeHistory({ ...served, prs, runs, deploys });
  if (!h || !("events" in h)) throw new Error("makeHistory built an invalid day");
  return h;
}

export interface Expected extends Effective {
  helpers: number;
}

/**
 * Ordinal `n`'s record at day second `T` rebuilt from the day (state and activity of its latest event, `since` its
 * first event of the same state and activity back to a removal, `lastBeat` `min(T, until)`), read with the Worker's
 * own `effective` and `effectiveHelpers`; null before its first event, once removed, or for a null ordinal.
 */
export function expectedState(h: OfficeHistoryV1, n: number | null, T: number): Expected | null {
  if (n === null) return null;
  const mine = h.events.filter((e) => e[1] === n && e[0] <= T);
  const e = mine.at(-1);
  if (!e) return null;
  let first = mine.length - 1;
  while (first > 0) {
    const p = mine[first - 1];
    if (p[3] !== e[3] || p[4] !== e[4] || p[5] + TIMING.removeAfter / 1000 <= mine[first][0]) break;
    first--;
  }
  const s: SessionRecord = {
    id: String(n),
    agent: h.agents[n],
    slot: e[2] >= 0 ? e[2] : null,
    firstSeen: mine[0][0] * 1000,
    lastBeat: Math.min(T, e[5]) * 1000,
    state: OFFICE_STATES[e[3]],
    activity: OFFICE_ACTIVITIES[e[4]],
    since: mine[first][0] * 1000,
    ...(e[6] ? { helpers: e[6] } : {}),
    recent: [],
  };
  const eff = effective(s, T * 1000);
  return eff ? { ...eff, helpers: effectiveHelpers(s, eff, T * 1000) } : null;
}

/** The live ordinal whose latest event at or before `T` sits on `slot` (the latest such event; the lower ordinal on a tie). */
export function ordinalAt(h: OfficeHistoryV1, slot: number, T: number): number | null {
  let best: number | null = null;
  let bestT = -Infinity;
  h.agents.forEach((_, n) => {
    const e = h.events.filter((x) => x[1] === n && x[0] <= T).at(-1);
    if (e && e[2] === slot && e[0] > bestT && expectedState(h, n, T)) [best, bestT] = [n, e[0]];
  });
  return best;
}

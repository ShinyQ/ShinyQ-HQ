import type { OfficeFeedSnapshot } from "@/lib/office/poll";
import { OFFICE_HISTORY_PATH, parseOfficeHistory, parseOfficeHistoryIndex, type OfficeHistoryDay, type OfficeHistoryV1 } from "@/lib/office/protocolHistory";
import { dayTime, planReplay, playTime, REPLAY, snapshotAt, type ReplayPlan } from "./replay";
import { REPLAY_OFF } from "./replayLink";

export type ReplayStatus = "off" | "loading" | "playing" | "resting" | "paused" | "unavailable";
export interface ReplayState {
  status: ReplayStatus;
  day: string | null;
  /** The 8-day index once fetched (newest first), for the drawer's day buttons. */
  days: OfficeHistoryDay[];
  playS: number;
  duration: number;
  /** Day seconds at `playS` (the banner's and the scrubber's time). */
  dayS: number;
  /** The idle loop (true) or a visitor's choice in the drawer (false, held until "Back to live"). */
  auto: boolean;
  truncated: boolean;
  /** No day in the window has anything to play. */
  empty: boolean;
  /** Bumped on every play, seek and loop restart: the scene's pipeline queue takes a silent baseline. */
  seq: number;
}
export interface ReplayController {
  /** The idle loop: the latest day with anything to play, looping; a no-op while loading, playing, resting or paused. */
  auto(): Promise<void>;
  /** A visitor's day (auto false); starts paused under reduced motion. */
  play(day: string): Promise<void>;
  pause(): void;
  resume(): void;
  seek(playS: number): void;
  /** To the next whole hour of day time (reduced motion's step). */
  nextHour(): void;
  /** Back to live. */
  stop(): void;
  /** From the scene's frame (scaled, LOD-stepped seconds). */
  step(dt: number, reduced: boolean): void;
  state(): ReplayState;
}

/** What a snapshot shows: each desk's slot, state, activity and helpers, each run's id, status and jobs done, each ship's key and status, and today's counts. */
export const snapKey = (x: OfficeFeedSnapshot): string =>
  JSON.stringify([
    x.desks.map((d) => [d.slot, d.state, d.activity, d.helpers]),
    x.pipeline?.runs.map((r) => [r.id, r.status, r.jobs.filter((j) => j.status === "done").length]),
    x.pipeline?.ships.map((s) => [s.key, s.status]),
    x.today,
  ]);

/** A copy younger than this is played again without a fetch (the browser's HTTP cache revalidates older ones with the ETag). */
const FRESH_MS = 60_000;

/**
 * The day replay's feed (replay chunk): fetches the 8-day index and one day (`/api/office/history`), plans it
 * (`planReplay`) and publishes the snapshot at the playback time (`snapshotAt`) when its content changed, at most once
 * per `REPLAY.tickS` of playback. The clock steps only from the scene's frame (`step`): no timer, no rAF. A later play
 * or `stop` drops a load still in flight.
 */
export function createReplayFeed(deps: { fetch: (url: string) => Promise<Response>; now: () => number; reduced: () => boolean; publish: (state: ReplayState, snapshot: OfficeFeedSnapshot | null) => void }): ReplayController {
  let s: ReplayState = { ...REPLAY_OFF };
  let h: OfficeHistoryV1 | null = null;
  let plan: ReplayPlan | null = null;
  let epoch = 0;
  let tick = -1;
  let key = "";
  let rest = 0;
  let gen = 0;
  let snap: OfficeFeedSnapshot | null = null;
  const days = new Map<string, { h: OfficeHistoryV1; at: number }>();
  let index: { days: OfficeHistoryDay[]; at: number } | null = null;

  const set = (patch: Partial<ReplayState>, next: OfficeFeedSnapshot | null = snap) => {
    s = { ...s, ...patch };
    snap = next;
    deps.publish(s, snap);
  };
  async function get<T>(url: string, parse: (raw: unknown) => T | null): Promise<T | null> {
    try {
      const res = await deps.fetch(url);
      return res.status === 200 ? parse(await res.json()) : null;
    } catch {
      return null;
    }
  }
  /** The snapshot at the current playback time, published when its content changed (or `force`), else only a new `dayS`. */
  function render(force = false): void {
    if (!h || !plan) return;
    const next = snapshotAt(h, plan, s.playS, epoch);
    const k = snapKey(next);
    const dayS = Math.round(dayTime(plan, s.playS));
    if (force || k !== key) {
      key = k;
      set({ dayS }, next);
    } else if (dayS !== s.dayS) set({ dayS });
  }
  async function load(day: string | null, auto: boolean): Promise<void> {
    const my = ++gen;
    set({ status: "loading", auto });
    const now = deps.now();
    if (!index || now - index.at > FRESH_MS) {
      const got = await get(OFFICE_HISTORY_PATH, parseOfficeHistoryIndex);
      if (my !== gen) return;
      if (!got || !("days" in got)) return set({ status: "unavailable" }, null);
      index = { days: got.days, at: now };
    }
    const pick = day ?? index.days.find((d) => d.events + d.prs + d.runs + d.deploys > 0)?.day;
    if (!pick) return set({ status: "off", days: index.days, empty: true }, null);
    let cached = days.get(pick);
    if (!cached || (pick === index.days[0].day && now - cached.at > FRESH_MS)) {
      const got = await get(`${OFFICE_HISTORY_PATH}?day=${pick}`, parseOfficeHistory);
      if (my !== gen) return;
      if (!got || !("events" in got)) return set({ status: "unavailable", days: index.days }, null);
      days.set(pick, (cached = { h: got, at: now }));
    }
    h = cached.h;
    plan = planReplay(h);
    if (!plan) return set({ status: "off", day: null, days: index.days, empty: true }, null);
    const reduced = deps.reduced();
    const start = reduced ? playTime(plan, plan.spans[0].from) : 0;
    epoch = deps.now() - start * 1000;
    tick = -1;
    set({ status: reduced ? "paused" : "playing", day: pick, days: index.days, playS: start, duration: plan.duration, truncated: h.truncated, empty: false, seq: s.seq + 1 });
    render(true);
  }
  const ctl: ReplayController = {
    auto: () => (s.status === "off" || s.status === "unavailable" ? load(null, true) : Promise.resolve()),
    play: (day) => load(day, false),
    pause() {
      if (s.status === "playing") set({ status: "paused" });
    },
    resume() {
      if (s.status !== "paused" || deps.reduced()) return;
      epoch = deps.now() - s.playS * 1000;
      set({ status: "playing", seq: s.seq + 1 });
    },
    seek(playS) {
      if (!plan) return;
      const p = Math.max(0, Math.min(plan.duration, playS));
      epoch = deps.now() - p * 1000;
      set({ playS: p, seq: s.seq + 1 });
      render(true);
    },
    nextHour() {
      if (plan) ctl.seek(playTime(plan, (Math.floor(s.dayS / REPLAY.stepS) + 1) * REPLAY.stepS));
    },
    stop() {
      gen++;
      h = plan = null;
      key = "";
      set({ ...REPLAY_OFF, days: s.days, seq: s.seq + 1 }, null);
    },
    step(dt, reduced) {
      if (reduced || !plan) return;
      if (s.status === "resting") {
        if ((rest -= dt) > 0) return;
        // Today grows: a copy over a minute old is fetched again before the next loop.
        const copy = s.day && days.get(s.day);
        if (copy && s.day === index?.days[0].day && deps.now() - copy.at > FRESH_MS) return void load(s.day, true);
        epoch = deps.now();
        set({ status: "playing", playS: 0, seq: s.seq + 1 });
        return render(true);
      }
      if (s.status !== "playing") return;
      const playS = Math.min(plan.duration, s.playS + dt);
      s = { ...s, playS };
      if (playS >= plan.duration) {
        if (s.auto) {
          rest = REPLAY.restS;
          set({ status: "resting" });
        } else set({ status: "paused" });
        return render();
      }
      const t = Math.floor(playS / REPLAY.tickS);
      if (t !== tick) {
        tick = t;
        render();
      }
    },
    state: () => s,
  };
  return ctl;
}

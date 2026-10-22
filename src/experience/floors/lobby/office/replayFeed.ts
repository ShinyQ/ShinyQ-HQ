import type { OfficeFeed, OfficeFeedSnapshot } from "@/lib/office/poll";
import { OFFICE_SEATS } from "@/lib/office/protocol";
import { OFFICE_HISTORY_PATH, parseOfficeHistory, parseOfficeHistoryIndex, type OfficeHistoryDay, type OfficeHistoryV1 } from "@/lib/office/protocolHistory";
import { clockOf, dayLabel, dayTime, planReplay, playable, playTime, REPLAY, snapshotAt, type ReplayPlan } from "./replay";
import type { officeLive } from "./live";
import { officeReplay } from "./replayLink";

export type ReplayStatus = "off" | "loading" | "playing" | "resting" | "paused" | "unavailable";
export interface ReplayState {
  status: ReplayStatus;
  day: string | null;
  /** The 8-day index once fetched (newest first), for the drawer's day buttons. */
  days: OfficeHistoryDay[];
  playS: number;
  duration: number;
  /** Day seconds at `playS` (the scrubber's time). */
  dayS: number;
  /** `dayS` as "14:05" and the day as "Mon 19 Oct" / "Sen 19 Okt", formatted here so the scene chunk only reads strings (the wall's banner, the chips, the pill). */
  clock: string;
  label: { en: string; id: string } | null;
  /** The idle loop (true) or a visitor's choice in the drawer (false, held until "Back to live"). */
  auto: boolean;
  truncated: boolean;
  /** No day in the window has anything to play. */
  empty: boolean;
  /** Bumped on every play, seek and loop restart: the scene's pipeline queue takes a silent baseline. */
  seq: number;
}
export interface ReplayController {
  /** The drawer's controls: fetches the 8-day index (days and `empty` only; a no-op unless the replay is off or unavailable). */
  open(): Promise<void>;
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
  /** From the scene's frame (scaled, LOD-stepped seconds); reduced motion ends an `auto` replay. */
  step(dt: number, reduced: boolean): void;
  state(): ReplayState;
}

/** The replay off, every field (the scene chunk's `REPLAY_OFF` carries the `status` it reads before this chunk loads). */
export const REPLAY_STATE_OFF: ReplayState = { status: "off", day: null, days: [], playS: 0, duration: 0, dayS: 0, clock: "", label: null, auto: false, truncated: false, empty: false, seq: 0 };

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
  let s: ReplayState = { ...REPLAY_STATE_OFF };
  /** The playback time, copied into `s` on a publish (or a `state()` read) only: no state copy per frame. */
  let playS = 0;
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
    s = { ...s, playS, ...patch };
    playS = s.playS;
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
    const next = snapshotAt(h, plan, playS, epoch);
    const k = snapKey(next);
    const dayS = Math.round(dayTime(plan, playS));
    if (force || k !== key) {
      key = k;
      set({ dayS, clock: clockOf(dayS) }, next);
    } else if (dayS !== s.dayS) set({ dayS, clock: clockOf(dayS) });
  }
  /** The 8-day index (a copy younger than `FRESH_MS` is not fetched again), or null when unavailable. */
  async function fresh(): Promise<OfficeHistoryDay[] | null> {
    const now = deps.now();
    if (!index || now - index.at > FRESH_MS) {
      const got = await get(OFFICE_HISTORY_PATH, parseOfficeHistoryIndex);
      if (!got || !("days" in got)) return null;
      index = { days: got.days, at: now };
    }
    return index.days;
  }
  async function load(day: string | null, auto: boolean): Promise<void> {
    const my = ++gen;
    set({ status: "loading", auto });
    const now = deps.now();
    const list = await fresh();
    if (my !== gen) return;
    if (!list) return set({ status: "unavailable" }, null);
    const pick = day ?? list.find(playable)?.day;
    if (!pick) return set({ status: "off", days: list, empty: true }, null);
    let cached = days.get(pick);
    if (!cached || (pick === list[0].day && now - cached.at > FRESH_MS)) {
      const got = await get(`${OFFICE_HISTORY_PATH}?day=${pick}`, parseOfficeHistory);
      if (my !== gen) return;
      if (!got || !("events" in got)) return set({ status: "unavailable", days: list }, null);
      days.set(pick, (cached = { h: got, at: now }));
    }
    h = cached.h;
    plan = planReplay(h);
    if (!plan) return set({ status: "off", day: null, days: list, empty: true }, null);
    const reduced = deps.reduced();
    const start = reduced ? playTime(plan, plan.spans[0].from) : 0;
    epoch = deps.now() - start * 1000;
    tick = -1;
    set({ status: reduced ? "paused" : "playing", day: pick, label: { en: dayLabel(pick, "en"), id: dayLabel(pick, "id") }, days: list, playS: start, duration: plan.duration, truncated: h.truncated, empty: false, seq: s.seq + 1 });
    render(true);
  }
  const ctl: ReplayController = {
    async open() {
      if (s.status !== "off" && s.status !== "unavailable") return;
      const my = gen;
      const list = await fresh();
      if (my === gen && (s.status === "off" || s.status === "unavailable")) set(list ? { status: "off", days: list, empty: !list.some(playable) } : { status: "unavailable" }, null);
    },
    auto: () => (s.status === "off" || s.status === "unavailable" ? load(null, true) : Promise.resolve()),
    play: (day) => load(day, false),
    pause() {
      if (s.status === "playing") set({ status: "paused" });
    },
    resume() {
      if (s.status !== "paused" || deps.reduced()) return;
      epoch = deps.now() - playS * 1000;
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
      set({ ...REPLAY_STATE_OFF, days: s.days, seq: s.seq + 1 }, null);
    },
    step(dt, reduced) {
      if (reduced) {
        if (s.auto && s.status !== "off") ctl.stop();
        return;
      }
      if (!plan) return;
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
      playS = Math.min(plan.duration, playS + dt);
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
    state: () => (s.playS === playS ? s : (s = { ...s, playS })),
  };
  return ctl;
}

/** Per desk slot of a live snapshot: 0 asleep or off duty, 1 awake, 2 asking (Needs Kurniadi); and its latest successful production deploy (epoch ms, 0 for none). */
export function liveMark(x: OfficeFeedSnapshot): { levels: number[]; deployAt: number } {
  const levels: number[] = Array(OFFICE_SEATS).fill(0);
  if (x.mode !== "off") for (const d of x.desks) levels[d.slot] = d.state === "asleep" ? 0 : d.state === "input" ? 2 : 1;
  let deployAt = 0;
  for (const p of x.pipeline?.ships ?? []) if (p.kind === "deploy" && p.status === "success") deployAt = Math.max(deployAt, p.at);
  return { levels, deployAt };
}

const IDLE_MS = REPLAY.idleS * 1000;

/**
 * Ties the controller to the live feed and the scene's idle bookkeeping (replay chunk; owner decision: a live event ends
 * any replay at once). A live event between two ready answers (a desk waking or starting to ask, a newer production
 * deploy; on the first answer, a deploy under `REPLAY.idleS` old) or an awake desk restarts the quiet timer; an event
 * ends any replay, an awake desk an `auto` one. Its `auto()` checks the idle rule again (the scene mounted, motion on,
 * `REPLAY.idleS` quiet: a live answer may have landed or the scene left during the import) and sets `failedAt` on an
 * unavailable history, nothing to play or a throw.
 */
export function linkReplay(ctl: ReplayController, live: Pick<typeof officeLive, "now" | "feed" | "subscribe">, reduced: () => boolean): ReplayController {
  const r = officeReplay;
  let last: { levels: number[]; deployAt: number } | null = null;
  const see = (f: OfficeFeed) => {
    if (f.status !== "ready" || !f.snapshot) return;
    const m = liveMark(f.snapshot);
    const was = last;
    const event = was ? m.levels.some((l, i) => l > was.levels[i]) || m.deployAt > was.deployAt : f.snapshot.updatedAt - m.deployAt < IDLE_MS;
    const awake = m.levels.some(Boolean);
    last = m;
    if (event || awake) r.quietSince = live.now();
    if (ctl.state().status !== "off" && (event || (awake && ctl.state().auto))) ctl.stop();
  };
  see(live.feed());
  live.subscribe(see);
  const auto = ctl.auto;
  ctl.auto = async () => {
    if (!r.mounted || reduced() || live.now() - r.quietSince < IDLE_MS) return;
    let failed = false;
    try {
      await auto();
    } catch {
      failed = true;
    }
    if (failed || ctl.state().status === "unavailable" || ctl.state().empty) r.failedAt = live.now();
  };
  return ctl;
}

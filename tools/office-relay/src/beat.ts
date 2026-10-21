import type { OfficeActivity, OfficeAgent, OfficeBeatV1, OfficeState } from "../../../src/lib/office/protocol";
import { repoAllowed } from "../../../workers/office/src/ingest";
import type { GitInfo } from "./git";
import type { Mapped } from "./map";
import { branchTitle } from "./title";

/** While a session is awake and its events keep coming, a beat goes out at least this often (the office shows thinking after 20 s without one). */
export const KEEPALIVE_MS = 15_000;

/**
 * At most one change per session goes out per window: a change inside it waits for a trailing send at its end, which
 * carries the newest state. Equal to the visitors' active poll (`POLL.activeMs`), so nothing a visitor could see is lost.
 */
export const COALESCE_MS = 10_000;

/** A final state (stop, session end, failure, Needs Kurniadi) goes out at once and gets no keepalive. */
const FINAL: ReadonlySet<OfficeState> = new Set<OfficeState>(["done", "asleep", "failed", "input"]);
export const isFinal = (state: OfficeState) => FINAL.has(state);

/** The branch pattern `parseOfficeBeat` accepts. */
const BRANCH = /^[A-Za-z0-9._/-]{1,120}$/;

/** A beat without its time: what waits for a trailing send. */
export type PendingBeat = Omit<OfficeBeatV1, "ts">;

/** A session's throttle record (`~/.office-relay/sessions/<hash>.json`): the last sent beat, and what waits. */
export interface Sent {
  state: OfficeState;
  activity: OfficeActivity;
  repo?: string;
  title?: string;
  /** The helper count of the last sent beat (absent means 0). */
  helpers?: number;
  sentAt: number;
  /** The agent and branch of the last sent beat, so a trailing keepalive can repeat it (absent in records written before the throttle). */
  agent?: OfficeAgent;
  branch?: string;
  /** The newest beat that differs from the last sent one, waiting for the end of the window. */
  next?: PendingBeat;
  /** The newest event of the session (a keepalive is due when it is newer than `sentAt`). */
  seenAt?: number;
  /** When the session's trailing sender wakes, and its token (one owner per session). */
  due?: number;
  dueBy?: string;
}

/** The only object that leaves the machine: enums, a hashed session, and allowlisted public names. */
export function buildBeat(input: { agent: OfficeAgent; session: string; mapped: Mapped; git: GitInfo | null; allow: readonly string[]; now: number; helpers?: number }): OfficeBeatV1 {
  const { agent, session, mapped, git, allow, now, helpers } = input;
  const beat: OfficeBeatV1 = { v: 1, agent, session, state: mapped.state, activity: mapped.activity, ...(helpers !== undefined ? { helpers } : {}), ts: now };
  if (!git || !repoAllowed(git.repo, allow)) return beat;
  // A branch the beat schema would reject is dropped (with its title) so the beat itself stays valid.
  const branch = git.branch && BRANCH.test(git.branch) ? git.branch : undefined;
  const title = branch ? branchTitle(branch) : null;
  return { ...beat, repo: git.repo, ...(branch ? { branch } : {}), ...(title ? { title } : {}) };
}

/** Whether a beat shows something the last sent one did not (state, activity, repository, title or helper count). */
export function differs(prev: Sent, beat: PendingBeat): boolean {
  if (prev.state !== beat.state || prev.activity !== beat.activity || prev.repo !== beat.repo || prev.title !== beat.title) return true;
  // An absent count means 0: beats stop carrying it once a 0 has been sent.
  return (prev.helpers ?? 0) !== (beat.helpers ?? 0);
}

/**
 * What a hook does with a new beat: send it now, queue it for the trailing send at the end of the window, or skip it.
 * A final state goes out at once; any other change at most once per `coalesceMs`; a repeat only as the keepalive.
 */
export function decide(prev: Sent | null, beat: OfficeBeatV1, coalesceMs: number = COALESCE_MS): "send" | "queue" | "skip" {
  if (!prev) return "send";
  const quiet = beat.ts - prev.sentAt;
  const changed = differs(prev, beat);
  if (isFinal(beat.state)) return changed || quiet >= KEEPALIVE_MS ? "send" : "skip";
  if (changed) return quiet >= coalesceMs ? "send" : "queue";
  return quiet >= KEEPALIVE_MS ? "send" : "skip";
}

/** When the trailing sender must wake: the end of the window for a queued change, else the keepalive of an awake session that had events since. */
export function dueOf(rec: Sent, coalesceMs: number = COALESCE_MS): number | undefined {
  if (rec.next) return rec.sentAt + coalesceMs;
  if (rec.agent && rec.seenAt !== undefined && rec.seenAt > rec.sentAt && !isFinal(rec.state)) return rec.sentAt + KEEPALIVE_MS;
  return undefined;
}

/** The keepalive: the last sent beat again, with a new time. */
export function repeatBeat(rec: Sent, session: string, now: number): OfficeBeatV1 | null {
  if (!rec.agent) return null;
  return {
    v: 1,
    agent: rec.agent,
    session,
    state: rec.state,
    activity: rec.activity,
    ...(rec.helpers ? { helpers: rec.helpers } : {}),
    ...(rec.repo ? { repo: rec.repo } : {}),
    ...(rec.branch ? { branch: rec.branch } : {}),
    ...(rec.title ? { title: rec.title } : {}),
    ts: now,
  };
}

/** The record of a beat that just went out (nothing waits after it). */
export function sentRecord(beat: OfficeBeatV1): Sent {
  return { state: beat.state, activity: beat.activity, repo: beat.repo, title: beat.title, helpers: beat.helpers, sentAt: beat.ts, agent: beat.agent, branch: beat.branch, seenAt: beat.ts };
}

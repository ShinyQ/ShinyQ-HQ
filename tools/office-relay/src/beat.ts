import type { OfficeActivity, OfficeAgent, OfficeBeatV1, OfficeState } from "../../../src/lib/office/protocol";
import { repoAllowed } from "../../../workers/office/src/ingest";
import type { GitInfo } from "./git";
import type { Mapped } from "./map";
import { branchTitle } from "./title";

/** While events keep coming in one state, resend at most this often so the office does not show thinking. */
export const KEEPALIVE_MS = 15_000;

/** The branch pattern `parseOfficeBeat` accepts. */
const BRANCH = /^[A-Za-z0-9._/-]{1,120}$/;

export interface Sent {
  state: OfficeState;
  activity: OfficeActivity;
  repo?: string;
  title?: string;
  sentAt: number;
}

/** The only object that leaves the machine: enums, a hashed session, and allowlisted public names. */
export function buildBeat(input: { agent: OfficeAgent; session: string; mapped: Mapped; git: GitInfo | null; allow: readonly string[]; now: number }): OfficeBeatV1 {
  const { agent, session, mapped, git, allow, now } = input;
  const beat: OfficeBeatV1 = { v: 1, agent, session, state: mapped.state, activity: mapped.activity, ts: now };
  if (!git || !repoAllowed(git.repo, allow)) return beat;
  // A branch the beat schema would reject is dropped (with its title) so the beat itself stays valid.
  const branch = git.branch && BRANCH.test(git.branch) ? git.branch : undefined;
  const title = branch ? branchTitle(branch) : null;
  return { ...beat, repo: git.repo, ...(branch ? { branch } : {}), ...(title ? { title } : {}) };
}

export function shouldSend(prev: Sent | null, beat: OfficeBeatV1, now: number): boolean {
  if (!prev) return true;
  if (prev.state !== beat.state || prev.activity !== beat.activity || prev.repo !== beat.repo || prev.title !== beat.title) return true;
  return now - prev.sentAt >= KEEPALIVE_MS;
}

import { deskTitle, officeCounts, type OfficeCounts } from "@/lib/office/model";
import type { OfficeFeed } from "@/lib/office/poll";
import { OFFICE_DESKS, type OfficeActivity, type OfficeAgent, type OfficeGithubItem, type OfficeProgress, type OfficeRecent, type OfficeState, type OfficeToday } from "@/lib/office/protocol";
import type { OfficeTranslate } from "../officeLayout";
import type { ScreenInput } from "./officeAtlas";
import { OFFICE_STATE_STYLE } from "./officeVisual";

/**
 * The 3D office's view of a feed: always five Rovers (a slot without a session is an off-duty Rover asleep),
 * every Rover asleep when the office is off, disabled or offline, and only protocol fields (owner decision D3).
 */
export type OfficeViewMode = "live" | "semi-live" | "off" | "offline";

export interface OfficeRoverView {
  slot: number;
  /** null: off duty (no session at this desk). */
  agent: OfficeAgent | null;
  state: OfficeState;
  activity: OfficeActivity;
  title: string | null;
  repo: string | null;
  progress: OfficeProgress | null;
  job: string | null;
  since: number | null;
  recent: readonly OfficeRecent[];
}

export interface OfficeView {
  mode: OfficeViewMode;
  rovers: OfficeRoverView[];
  counts: OfficeCounts;
  extra: number;
  github: readonly OfficeGithubItem[];
  today: OfficeToday | null;
  updatedAt: number | null;
}

const offDuty = (slot: number): OfficeRoverView => ({ slot, agent: null, state: "asleep", activity: "resting", title: null, repo: null, progress: null, job: null, since: null, recent: [] });

export function officeView(feed: Pick<OfficeFeed, "status" | "snapshot">): OfficeView {
  const snap = feed.status === "disabled" ? null : feed.snapshot;
  const mode: OfficeViewMode = feed.status === "offline" ? "offline" : snap ? snap.mode : "off";
  const sleeping = mode === "off" || mode === "offline";
  const rovers = Array.from({ length: OFFICE_DESKS }, (_, slot): OfficeRoverView => {
    const desk = snap?.desks.find((d) => d.slot === slot);
    if (!desk) return offDuty(slot);
    if (sleeping) return { ...offDuty(slot), agent: desk.agent };
    return {
      slot,
      agent: desk.agent,
      state: desk.state,
      activity: desk.activity,
      title: deskTitle(desk),
      repo: desk.repo ?? null,
      progress: desk.state === "ci" ? (desk.progress ?? null) : null,
      job: desk.state === "failed" ? (desk.job ?? null) : null,
      since: desk.since,
      recent: desk.recent,
    };
  });
  const live = snap && !sleeping ? snap : null;
  return {
    mode,
    rovers,
    counts: officeCounts(live ? live.desks : []),
    extra: live ? live.extra : 0,
    github: snap ? snap.github : [],
    today: live ? live.today : null,
    updatedAt: snap ? snap.updatedAt : null,
  };
}

/** Chip text: "<Agent> · <activity>", then the title or "Client project" (not for sleeping Rovers), then CI progress. */
export function chipLines(r: OfficeRoverView, t: OfficeTranslate): { head: string; task: string | null; progress: number | null } {
  const head = r.agent ? `${t(`agent.${r.agent}`)} · ${t(`activity.${r.activity}`)}` : t("3d.offDuty");
  const task = r.agent && r.state !== "asleep" ? (r.title ?? t("clientProject")) : null;
  const progress = r.progress && r.progress.total > 0 ? Math.min(1, r.progress.done / r.progress.total) : null;
  return { head, task, progress };
}

export function screenInput(r: OfficeRoverView, t: OfficeTranslate): ScreenInput {
  const style = OFFICE_STATE_STYLE[r.state];
  return { kind: style.screen, color: style.color, activity: r.agent ? t(`activity.${r.activity}`) : t("3d.offDuty"), progress: r.progress, job: r.job };
}

const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/** The repository page for an allowlisted public repository ("owner/name"), checked again on the client. */
export function safeRepoUrl(repo: string | null): string | null {
  if (!repo || !REPO.test(repo) || repo.split("/").some((part) => /^\.+$/.test(part))) return null;
  return `https://github.com/${repo}`;
}

/** A GitHub feed link, only when it is an https URL on github.com. */
export function safeGithubUrl(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === "github.com" ? u.href : null;
  } catch {
    return null;
  }
}

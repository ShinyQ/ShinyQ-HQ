import { deskTitle, officeCounts, type OfficeCounts } from "@/lib/office/model";
import type { OfficeFeed } from "@/lib/office/poll";
import { OFFICE_DESKS, type OfficeActivity, type OfficeAgent, type OfficeGithubItem, type OfficeProgress, type OfficeRecent, type OfficeState, type OfficeToday } from "@/lib/office/protocol";
import type { OfficeTranslate } from "../officeLayout";
import type { ScreenInput } from "./officeAtlas";
import { OFFICE_STATE_STYLE } from "./officeVisual";

// The link checks live in the shared model, so the Classic card uses them without this floor module.
export { safeGithubUrl, safeRepoUrl } from "@/lib/office/model";

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

/**
 * Chip text: the agent's name ("Off duty" without one), "<Agent> · <activity>", the title or "Client project" (not for
 * sleeping Rovers), CI progress (0 to 1), and the full text for the chip's label: "Desk <n>: <head>, <task>, <done> of
 * <total> jobs".
 */
export function chipLines(r: OfficeRoverView, t: OfficeTranslate): { name: string; head: string; task: string | null; progress: number | null; label: string } {
  const name = r.agent ? t(`agent.${r.agent}`) : t("3d.offDuty");
  const head = r.agent ? `${name} · ${t(`activity.${r.activity}`)}` : name;
  const task = r.agent && r.state !== "asleep" ? (r.title ?? t("clientProject")) : null;
  const ci = r.progress && r.progress.total > 0 ? r.progress : null;
  const progress = ci ? Math.min(1, ci.done / ci.total) : null;
  const label = [t("3d.target.desk", { n: r.slot + 1, agent: head }), task, ci && t("3d.jobs", { done: ci.done, total: ci.total })].filter(Boolean).join(", ");
  return { name, head, task, progress, label };
}

export function screenInput(r: OfficeRoverView, t: OfficeTranslate): ScreenInput {
  const style = OFFICE_STATE_STYLE[r.state];
  return { kind: style.screen, color: style.color, activity: r.agent ? t(`activity.${r.activity}`) : t("3d.offDuty"), progress: r.progress, job: r.job };
}

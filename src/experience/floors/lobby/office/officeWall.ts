import { sinceLabel } from "@/lib/office/model";
import type { OfficeGithubStatus } from "@/lib/office/protocol";
import { COLORS } from "../../../config";
import type { OfficeTranslate } from "../officeLayout";
import { circlePath, type CanvasFonts } from "./officeAtlas";
import { chipLines, type OfficeView, type OfficeViewMode } from "./officeModel";
import { OFFICE_STATE_STYLE, STATUS_COLOR } from "./officeVisual";

/**
 * The screen wall (owner decision D1): as seen from the plaza, mission control on the left half (the mode with
 * the snapshot's age, four counters, up to two awake desks, today, a "+N" chip for sessions beyond five) and the
 * public GitHub board on the right half. Drawn in 1280 x 392 base units (the 17 x 5.2 u screen's aspect, 75 px per u
 * on the full tier), scaled to the tier's canvas.
 */
export const WALL_BASE = { w: 1280, h: 392 } as const;
export const WALL_CANVAS = { full: { w: 1280, h: 392 }, lite: { w: 1024, h: 314 } } as const;

const MODE_COLOR: Record<OfficeViewMode, string> = { live: COLORS.green, "semi-live": COLORS.violet, off: "#8a93b5", offline: "#f87171" };

export interface WallRow {
  color: string;
  head: string;
  sub: string;
}

export interface WallGithubRow {
  status: OfficeGithubStatus;
  title: string;
  meta: string;
  progress: number | null;
}

export interface WallModel {
  control: string;
  status: string;
  statusColor: string;
  extra: string | null;
  tiles: { value: number; label: string; color: string }[];
  nowTitle: string;
  now: WallRow[];
  resting: string | null;
  today: string | null;
  github: string;
  githubSub: string;
  rows: WallGithubRow[];
  empty: string;
}

export function wallModel(view: OfficeView, t: OfficeTranslate, locale: "en" | "id", now: number): WallModel {
  const c = view.counts;
  const awake = view.rovers.filter((r) => r.agent && r.state !== "asleep");
  const label = t(`3d.mode.${view.mode === "semi-live" ? "semi" : view.mode}`);
  return {
    control: t("3d.wall.control"),
    status: view.mode === "live" && view.updatedAt !== null ? `${label} · ${sinceLabel(view.updatedAt, locale, now)}` : label,
    statusColor: MODE_COLOR[view.mode],
    extra: view.extra > 0 ? `+${view.extra}` : null,
    tiles: [
      { value: c.active, label: t("3d.wall.active"), color: COLORS.cyan },
      { value: c.thinking, label: t("3d.wall.thinking"), color: COLORS.amber },
      { value: c.waiting, label: t("3d.wall.waiting"), color: COLORS.violet },
      { value: c.asleep, label: t("3d.wall.asleep"), color: "#8a93b5" },
    ],
    nowTitle: t("3d.wall.now"),
    now: awake.slice(0, 2).map((r) => ({ color: OFFICE_STATE_STYLE[r.state].color, head: chipLines(r, t).head, sub: r.title ?? t("clientProject") })),
    resting: awake.length ? null : t("3d.wall.resting"),
    today: view.today ? t("3d.wall.today", { tasks: view.today.tasksDone, prs: view.today.prsMerged, green: view.today.ciGreen, runs: view.today.ciRuns }) : null,
    github: t("3d.wall.github"),
    githubSub: t("3d.wall.githubSub"),
    rows: view.github.slice(0, 4).map((g) => ({
      status: g.status,
      title: g.title,
      meta: `${g.repo} · ${t(`3d.github.status.${g.status}`)} · ${sinceLabel(g.at, locale, now)}`,
      progress: g.progress && g.progress.total > 0 ? Math.min(1, g.progress.done / g.progress.total) : null,
    })),
    empty: t("3d.wall.empty"),
  };
}

/** The spinner frame (2 fps) while a run is running, else 0. */
export function wallSpin(m: WallModel, t: number): number {
  return m.rows.some((r) => r.status === "running") ? Math.floor(t * 2) : 0;
}

/** Redraw key: the content, plus a 2 fps spinner frame while a run is running. */
export function wallKey(m: WallModel, t: number): string {
  return `${JSON.stringify(m)}|${wallSpin(m, t)}`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function statusIcon(ctx: CanvasRenderingContext2D, status: OfficeGithubStatus, x: number, y: number, color: string, t: number): void {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  switch (status) {
    case "running":
      ctx.arc(x, y, 10, t * 3, t * 3 + 4.6);
      ctx.stroke();
      break;
    case "success":
      ctx.moveTo(x - 9, y);
      ctx.lineTo(x - 2, y + 7);
      ctx.lineTo(x + 10, y - 8);
      ctx.stroke();
      break;
    case "failure":
      ctx.moveTo(x - 8, y - 8);
      ctx.lineTo(x + 8, y + 8);
      ctx.moveTo(x + 8, y - 8);
      ctx.lineTo(x - 8, y + 8);
      ctx.stroke();
      break;
    case "merged":
      circlePath(ctx, x, y, 8);
      ctx.fill();
      break;
    default:
      circlePath(ctx, x, y, 7);
      ctx.stroke();
  }
}

export function drawWall(ctx: CanvasRenderingContext2D, size: { w: number; h: number }, m: WallModel, t: number, fonts: CanvasFonts): void {
  ctx.save();
  ctx.setTransform(size.w / WALL_BASE.w, 0, 0, size.h / WALL_BASE.h, 0, 0);
  ctx.fillStyle = "#05070f";
  ctx.fillRect(0, 0, WALL_BASE.w, WALL_BASE.h);
  roundRect(ctx, 8, 8, 624, 376, 18);
  ctx.fillStyle = "rgba(18, 11, 42, 0.92)";
  ctx.fill();
  ctx.strokeStyle = COLORS.violet;
  ctx.lineWidth = 3;
  ctx.stroke();
  roundRect(ctx, 648, 8, 624, 376, 18);
  ctx.fillStyle = "rgba(6, 14, 20, 0.92)";
  ctx.fill();
  ctx.strokeStyle = COLORS.green;
  ctx.stroke();
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  ctx.fillStyle = "#d8c8ff";
  ctx.font = `700 32px ${fonts.mono}`;
  ctx.fillText(m.control, 28, 54);
  ctx.fillStyle = m.statusColor;
  ctx.beginPath();
  circlePath(ctx, 35, 84, 7);
  ctx.fill();
  ctx.font = `500 20px ${fonts.mono}`;
  ctx.fillText(m.status, 50, 91);
  if (m.extra) {
    ctx.fillStyle = COLORS.amber;
    ctx.font = `700 26px ${fonts.mono}`;
    ctx.textAlign = "right";
    ctx.fillText(m.extra, 612, 54);
    ctx.textAlign = "left";
  }
  m.tiles.forEach((tile, k) => {
    const x = 28 + k * 150;
    ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
    roundRect(ctx, x, 110, 136, 100, 12);
    ctx.fill();
    ctx.fillStyle = tile.color;
    ctx.font = `800 52px ${fonts.sans}`;
    ctx.fillText(String(tile.value), x + 14, 170);
    ctx.font = `500 14px ${fonts.mono}`;
    ctx.fillText(tile.label, x + 14, 196, 112);
  });
  ctx.fillStyle = "#cfd6f5";
  ctx.font = `500 18px ${fonts.mono}`;
  ctx.fillText(m.nowTitle, 28, 240);
  if (m.resting) {
    ctx.font = `400 18px ${fonts.sans}`;
    ctx.fillText(m.resting, 28, 272, 584);
  }
  m.now.forEach((row, k) => {
    const y = 272 + k * 30;
    ctx.fillStyle = row.color;
    ctx.beginPath();
    circlePath(ctx, 35, y - 6, 6);
    ctx.fill();
    ctx.fillStyle = "#eef0ff";
    ctx.font = `600 18px ${fonts.sans}`;
    ctx.fillText(row.head, 50, y, 290);
    ctx.fillStyle = "#98a2c8";
    ctx.font = `400 15px ${fonts.mono}`;
    ctx.fillText(row.sub.slice(0, 28), 350, y);
  });
  if (m.today) {
    ctx.fillStyle = "#98a2c8";
    ctx.font = `400 15px ${fonts.mono}`;
    ctx.fillText(m.today, 28, 362, 584);
  }

  ctx.fillStyle = "#cdeee2";
  ctx.font = `700 32px ${fonts.mono}`;
  ctx.fillText(m.github, 668, 54);
  ctx.fillStyle = "#8a93b5";
  ctx.font = `500 17px ${fonts.mono}`;
  ctx.fillText(m.githubSub, 668, 82);
  if (!m.rows.length) {
    ctx.fillStyle = "#cfd6f5";
    ctx.font = `400 19px ${fonts.sans}`;
    ctx.fillText(m.empty, 668, 140);
  }
  m.rows.forEach((row, k) => {
    const y = 136 + k * 62;
    const color = STATUS_COLOR[row.status];
    statusIcon(ctx, row.status, 686, y - 7, color, t);
    ctx.fillStyle = "#eef0ff";
    ctx.font = `600 19px ${fonts.sans}`;
    ctx.fillText(row.title.slice(0, 40), 712, y, row.progress === null ? 540 : 336);
    ctx.fillStyle = "#98a2c8";
    ctx.font = `400 14px ${fonts.mono}`;
    ctx.fillText(row.meta.slice(0, 60), 712, y + 22, 540);
    if (row.progress !== null) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
      ctx.fillRect(1060, y - 12, 190, 7);
      ctx.fillStyle = color;
      ctx.fillRect(1060, y - 12, 190 * row.progress, 7);
    }
  });
  ctx.restore();
}

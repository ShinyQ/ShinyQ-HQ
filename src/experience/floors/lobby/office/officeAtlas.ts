import type { OfficeProgress } from "@/lib/office/protocol";
import { FACE_H, FACE_W } from "../../../rover/faceTexture";
import { OFFICE_SEAT_COUNT } from "../officeLayout";
import type { FaceKind, ScreenKind } from "./officeVisual";

/**
 * The office's one canvas atlas: ten Rover faces (128 x 96, like the player Rover's face), ten desk screens (256 x 160)
 * and the flag plate, drawn by the pure functions below (any CanvasRenderingContext2D; tests use a recording fake).
 * Faces and screens are a port of the approved mock's eyes() and drawMonitor(), except the input screen, which
 * shows a generic card ("Waiting for Kurniadi"), never a question or prompt (owner decision D3).
 * The atlas is uploaded whole once (the first paint); after that the caller compares frame keys (`dirtyCells`) and
 * uploads only the changed cells at `uploadOrigin` (the texture has no mipmaps: LinearFilter, generateMipmaps false).
 *
 * Layout (1024 x 576, every cell at full size): faces 0 to 7 along the top row; the desk screens four to a row under
 * it (rows 1 to 3, the last holding screens 8 and 9); faces 8 and 9 and the flag right of screens 8 and 9. A WebGL2
 * texture need not be a power of two (no mipmaps here), so the atlas grows only by the 64 rows it needs.
 */
export const ATLAS = { w: 1024, h: 576 } as const;
export const SCREEN_CELL = { w: 256, h: 160 } as const;
/** Faces on the top row, desk screens per row. */
const FACE_ROW = ATLAS.w / FACE_W;
const SCREEN_ROW = ATLAS.w / SCREEN_CELL.w;

export interface Cell {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function screenCell(slot: number): Cell {
  return { x: (slot % SCREEN_ROW) * SCREEN_CELL.w, y: FACE_H + Math.floor(slot / SCREEN_ROW) * SCREEN_CELL.h, w: SCREEN_CELL.w, h: SCREEN_CELL.h };
}

/** Where the desk screens end: the faces past the top row (and the flag) continue there. */
const TAIL = screenCell(OFFICE_SEAT_COUNT);

export function faceCell(slot: number): Cell {
  if (slot < FACE_ROW) return { x: slot * FACE_W, y: 0, w: FACE_W, h: FACE_H };
  return { x: TAIL.x + (slot - FACE_ROW) * FACE_W, y: TAIL.y, w: FACE_W, h: FACE_H };
}

/** UV rect [u0, v0, u1, v1] of a cell; a CanvasTexture flips Y, so v runs from the bottom. */
export function cellUv(c: Cell): [number, number, number, number] {
  return [c.x / ATLAS.w, 1 - (c.y + c.h) / ATLAS.h, (c.x + c.w) / ATLAS.w, 1 - c.y / ATLAS.h];
}

/** Cells in upload order: the ten faces (0 to 9), then the ten desk screens (10 to 19). */
export const ATLAS_CELLS = 2 * OFFICE_SEAT_COUNT;

export function atlasCell(index: number): Cell {
  return index < OFFICE_SEAT_COUNT ? faceCell(index) : screenCell(index - OFFICE_SEAT_COUNT);
}

/** The flag plate (one cell shared by every Rover): right of the last face. */
export const FLAG_CELL: Cell = faceCell(OFFICE_SEAT_COUNT);

/** Texel origin of a cell for a partial upload into the flipY atlas texture (rows count from the bottom). */
export function uploadOrigin(c: Cell): { x: number; y: number } {
  return { x: c.x, y: ATLAS.h - c.y - c.h };
}

/** Indices of the cells whose frame key changed (a missing previous key counts as changed): upload only these. */
export function dirtyCells(prevKeys: readonly string[], nextKeys: readonly string[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < nextKeys.length; i++) if (prevKeys[i] !== nextKeys[i]) out.push(i);
  return out;
}

/** A full circle on the current path (moveTo first, so several circles never join). */
export function circlePath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.moveTo(x + r, y);
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

/** Invented code for the working screen: generic snippets, never real data. */
export const CODE_LINES: readonly string[] = [
  "const rover = await boot(hq)",
  "export function plan(steps) {",
  "  return steps.map(run)",
  "if (ready) render(scene)",
  "test(\"desk lights up\", go)",
  "await build({ fast: true })",
  "for (const d of desks) d.wake()",
];

const FACE_BG = "#0b1020";

export function drawFace(ctx: CanvasRenderingContext2D, cell: Cell, kind: FaceKind, color: string, t: number, phase: number, font: string, alpha = 1, still = false): void {
  ctx.save();
  ctx.translate(cell.x, cell.y);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = FACE_BG;
  ctx.fillRect(0, 0, cell.w, cell.h);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  const blink = !still && Math.sin(t * 1.7 + phase) > 0.97;
  switch (kind) {
    case "focus":
      if (blink) ctx.fillRect(28, 46, 72, 4);
      else {
        ctx.fillRect(28, 36, 22, 14);
        ctx.fillRect(78, 36, 22, 14);
      }
      ctx.fillRect(48, 66, 32, 4);
      break;
    case "look": {
      const dx = Math.sin(t * 1.6 + phase) * 8;
      ctx.beginPath();
      circlePath(ctx, 40 + dx, 38, 9);
      circlePath(ctx, 88 + dx, 38, 9);
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(56, 70);
      ctx.quadraticCurveTo(64, 66, 72, 70);
      ctx.stroke();
      break;
    }
    case "scan": {
      const k = (t * 1.3 + phase) % 2;
      const dx = (k < 1 ? k : 2 - k) * 16 - 8;
      ctx.fillRect(24, 34, 36, 18);
      ctx.fillRect(68, 34, 36, 18);
      ctx.fillRect(60, 40, 8, 4);
      ctx.fillStyle = FACE_BG;
      ctx.fillRect(38 + dx, 38, 10, 10);
      ctx.fillRect(82 + dx, 38, 10, 10);
      ctx.fillStyle = color;
      ctx.fillRect(52, 68, 24, 3);
      break;
    }
    case "watch": {
      const p = (t * 0.8 + phase) % 1;
      ctx.beginPath();
      circlePath(ctx, 40, 40, 10);
      circlePath(ctx, 88, 40, 10);
      ctx.fill();
      ctx.fillStyle = FACE_BG;
      ctx.beginPath();
      circlePath(ctx, 36 + p * 8, 42, 4);
      circlePath(ctx, 84 + p * 8, 42, 4);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.fillRect(30, 66, 68, 5);
      ctx.fillStyle = FACE_BG;
      ctx.fillRect(30 + 68 * p, 66, 68 * (1 - p), 5);
      break;
    }
    case "wait": {
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(40, 44, 9, Math.PI, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(88, 44, 9, Math.PI, 0);
      ctx.stroke();
      const a = t * 3;
      ctx.beginPath();
      ctx.arc(64, 70, 6, a, a + 4.5);
      ctx.stroke();
      break;
    }
    case "ask":
      ctx.beginPath();
      circlePath(ctx, 40, 42, 10);
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(78, 34);
      ctx.lineTo(98, 30);
      ctx.stroke();
      ctx.beginPath();
      circlePath(ctx, 88, 44, 8);
      ctx.fill();
      ctx.font = `700 22px ${font}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillText("?", 64, 84);
      break;
    case "happy":
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(28, 46);
      ctx.lineTo(40, 34);
      ctx.lineTo(52, 46);
      ctx.moveTo(76, 46);
      ctx.lineTo(88, 34);
      ctx.lineTo(100, 46);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(64, 62, 12, 0, Math.PI);
      ctx.stroke();
      break;
    case "oops":
      ctx.lineWidth = 6;
      ctx.beginPath();
      for (const x of [40, 88]) {
        ctx.moveTo(x - 9, 33);
        ctx.lineTo(x + 9, 51);
        ctx.moveTo(x + 9, 33);
        ctx.lineTo(x - 9, 51);
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(48, 74);
      ctx.quadraticCurveTo(56, 66, 64, 74);
      ctx.quadraticCurveTo(72, 82, 80, 74);
      ctx.stroke();
      break;
    case "sleep":
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(26, 46);
      ctx.quadraticCurveTo(38, 52, 50, 46);
      ctx.moveTo(78, 46);
      ctx.quadraticCurveTo(90, 52, 102, 46);
      ctx.stroke();
      break;
  }
  ctx.restore();
}

/** The flag: the input tone with a white "!" mark (a symbol, not a word). */
export function drawFlag(ctx: CanvasRenderingContext2D, c: Cell, color: string): void {
  ctx.clearRect(c.x, c.y, c.w, c.h);
  ctx.fillStyle = color;
  ctx.fillRect(c.x + 4, c.y + 4, c.w - 8, c.h - 8);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(c.x + c.w / 2 - 6, c.y + 18, 12, 40);
  ctx.fillRect(c.x + c.w / 2 - 6, c.y + 66, 12, 12);
}

export interface ScreenInput {
  kind: ScreenKind;
  color: string;
  /** The localized activity label (the screen's header). */
  activity: string;
  progress: OfficeProgress | null;
  job: string | null;
}

export interface ScreenTexts {
  waiting: string;
  jobs: (done: number, total: number) => string;
  sleep: string;
}

export interface CanvasFonts {
  mono: string;
  sans: string;
}

export function drawScreen(ctx: CanvasRenderingContext2D, cell: Cell, s: ScreenInput, texts: ScreenTexts, t: number, phase: number, fonts: CanvasFonts, alpha = 1): void {
  const W = cell.w;
  const H = cell.h;
  ctx.save();
  ctx.translate(cell.x, cell.y);
  ctx.globalAlpha = alpha;
  ctx.textBaseline = "alphabetic";
  if (s.kind === "off") {
    ctx.fillStyle = "#0a0e1c";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#3a4166";
    ctx.font = `700 22px ${fonts.mono}`;
    ctx.textAlign = "center";
    ctx.fillText(texts.sleep, W / 2, H / 2 + 8);
    ctx.restore();
    return;
  }
  ctx.fillStyle = "#060a18";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = s.color;
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, W - 3, H - 3);
  ctx.textAlign = "left";
  ctx.font = `500 13px ${fonts.mono}`;
  ctx.fillStyle = s.color;
  ctx.fillText(s.activity, 12, 22);
  switch (s.kind) {
    case "code": {
      const off = Math.floor(t * 2.2 + phase);
      for (let k = 0; k < 6; k++) {
        const line = CODE_LINES[(off + k) % CODE_LINES.length];
        const last = k === 5;
        ctx.fillStyle = last ? "#34d399" : "rgba(160, 230, 255, 0.75)";
        ctx.fillText(last ? line.slice(0, (Math.floor(t * 18) % line.length) + 1) : line, 12, 46 + k * 18);
      }
      break;
    }
    case "dots":
      for (let k = 0; k < 3; k++) {
        ctx.globalAlpha = alpha * (0.25 + 0.75 * Math.max(0, Math.sin(t * 3 - k * 0.6)));
        ctx.fillStyle = s.color;
        ctx.beginPath();
        circlePath(ctx, 98 + k * 30, 92, 9);
        ctx.fill();
      }
      ctx.globalAlpha = alpha;
      break;
    case "diff":
      for (let k = 0; k < 6; k++) {
        const add = k % 3 === 1;
        const del = k % 3 === 2;
        ctx.fillStyle = add ? "rgba(52, 211, 153, 0.85)" : del ? "rgba(248, 113, 113, 0.75)" : "rgba(160, 230, 255, 0.5)";
        const line = CODE_LINES[(k + 2) % CODE_LINES.length];
        ctx.fillText(add || del ? line.slice(0, 28) : line.slice(0, 30), 12, 46 + k * 18);
      }
      break;
    case "progress": {
      // Indeterminate: no test counts (the relay never sends them).
      const span = W - 24;
      const x = (((t * 0.4) % 1.3) - 0.3) * span;
      ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
      ctx.fillRect(12, 70, span, 14);
      ctx.fillStyle = s.color;
      const a = Math.max(0, x);
      const b = Math.min(span, x + span * 0.3);
      if (b > a) ctx.fillRect(12 + a, 70, b - a, 14);
      break;
    }
    case "ci": {
      const span = W - 24;
      ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
      ctx.fillRect(12, 70, span, 14);
      ctx.fillStyle = s.color;
      if (s.progress && s.progress.total > 0) {
        ctx.fillRect(12, 70, span * Math.min(1, s.progress.done / s.progress.total), 14);
        ctx.fillStyle = "#cfd6f5";
        ctx.fillText(texts.jobs(s.progress.done, s.progress.total), 12, 112);
      } else {
        const a = t * 3;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(W / 2, 112, 10, a, a + 4.5);
        ctx.stroke();
      }
      break;
    }
    case "question":
      ctx.fillStyle = "#fde2f0";
      ctx.font = `700 16px ${fonts.sans}`;
      ctx.fillText(texts.waiting, 12, 70);
      ctx.fillStyle = s.color;
      ctx.font = `700 40px ${fonts.sans}`;
      ctx.fillText("?", W - 44, 124);
      break;
    case "check":
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(W / 2 - 30, 84);
      ctx.lineTo(W / 2 - 8, 106);
      ctx.lineTo(W / 2 + 32, 60);
      ctx.stroke();
      break;
    case "cross":
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(W / 2 - 24, 48);
      ctx.lineTo(W / 2 + 24, 96);
      ctx.moveTo(W / 2 + 24, 48);
      ctx.lineTo(W / 2 - 24, 96);
      ctx.stroke();
      if (s.job) {
        ctx.font = `500 13px ${fonts.mono}`;
        ctx.textAlign = "center";
        ctx.fillText(s.job.slice(0, 32), W / 2, 130);
      }
      break;
  }
  ctx.restore();
}

const ANIMATED_FACES: ReadonlySet<FaceKind> = new Set<FaceKind>(["look", "scan", "watch", "wait"]);
const ANIMATED_SCREENS: ReadonlySet<ScreenKind> = new Set<ScreenKind>(["code", "dots", "progress"]);

/** Faces redraw at most this often on both tiers, whatever rate the caller passes (performance review). */
export const FACE_FPS_MAX = 5;

/** Redraw key of a face: changes at `fps` (capped at FACE_FPS_MAX) for the moving kinds, on blinks for the focused face, never when still. */
export function faceKey(kind: FaceKind, t: number, phase: number, fps: number, still: boolean): string {
  if (still) return kind;
  if (ANIMATED_FACES.has(kind)) return `${kind}:${Math.floor(t * Math.min(fps, FACE_FPS_MAX))}`;
  return kind === "focus" && Math.sin(t * 1.7 + phase) > 0.97 ? `${kind}:blink` : kind;
}

/** Redraw key of a screen: its content, plus time at `fps` for the moving kinds (and a CI wait without numbers), never when still. */
export function screenKey(s: ScreenInput, t: number, fps: number, still: boolean): string {
  const base = `${s.kind}|${s.activity}|${s.progress ? `${s.progress.done}/${s.progress.total}` : ""}|${s.job ?? ""}`;
  if (still) return base;
  return ANIMATED_SCREENS.has(s.kind) || (s.kind === "ci" && !s.progress) ? `${base}|${Math.floor(t * fps)}` : base;
}

import { describe, expect, it } from "vitest";
import { FACE_H, FACE_W } from "@/experience/rover/faceTexture";
import {
  ATLAS,
  ATLAS_CELLS,
  atlasCell,
  cellUv,
  CODE_LINES,
  dirtyCells,
  drawFace,
  drawFlag,
  drawScreen,
  FACE_FPS_MAX,
  faceCell,
  faceKey,
  FLAG_CELL,
  screenCell,
  screenKey,
  uploadOrigin,
  type Cell,
  type ScreenInput,
} from "@/experience/floors/lobby/office/officeAtlas";
import { OFFICE_STATE_STYLE } from "@/experience/floors/lobby/office/officeVisual";
import { OFFICE_SLOTS } from "@/experience/floors/lobby/officeShell";
import { OFFICE_STATES } from "@/lib/office/protocol";
import { recordingContext } from "../helpers/fake-canvas";

const FONTS = { mono: "monospace", sans: "sans-serif" };
const TEXTS = { waiting: "Waiting for Kurniadi", jobs: (d: number, t: number) => `${d} of ${t} jobs`, sleep: "z Z" };
const input = (state: (typeof OFFICE_STATES)[number], extra: Partial<ScreenInput> = {}): ScreenInput => ({
  kind: OFFICE_STATE_STYLE[state].screen,
  color: OFFICE_STATE_STYLE[state].color,
  activity: "Editing",
  progress: null,
  job: null,
  ...extra,
});

describe("Agent Office atlas", () => {
  it("packs ten 128 x 96 faces, ten 256 x 160 desk screens and the flag cell into one 1024 x 576 canvas without overlap", () => {
    expect(ATLAS).toEqual({ w: 1024, h: 576 });
    const slots = OFFICE_SLOTS.map((s) => s.slot);
    expect(slots).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const cells = [...slots.flatMap((slot) => [faceCell(slot), screenCell(slot)]), FLAG_CELL];
    for (const slot of slots) {
      expect(faceCell(slot)).toMatchObject({ w: FACE_W, h: FACE_H });
      expect(screenCell(slot)).toMatchObject({ w: 256, h: 160 });
    }
    expect(FLAG_CELL).toMatchObject({ w: FACE_W, h: FACE_H });
    for (const c of cells) {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.x + c.w).toBeLessThanOrEqual(ATLAS.w);
      expect(c.y + c.h).toBeLessThanOrEqual(ATLAS.h);
    }
    // No row to spare: the atlas is as tall as its cells need.
    expect(Math.max(...cells.map((c) => c.y + c.h))).toBe(ATLAS.h);
    // Every cell is a whole number of texels (the partial uploads land on texel edges).
    for (const c of cells) for (const v of [c.x, c.y, c.w, c.h]) expect(Number.isInteger(v)).toBe(true);
    for (let i = 0; i < cells.length; i++)
      for (let k = i + 1; k < cells.length; k++) {
        const a = cells[i];
        const b = cells[k];
        expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true);
      }
    expect(cellUv(faceCell(0))).toEqual([0, 1 - FACE_H / ATLAS.h, FACE_W / ATLAS.w, 1]);
  });

  it("draws every face kind inside its cell, background first", () => {
    for (const state of OFFICE_STATES) {
      const rec = recordingContext();
      const cell = faceCell(3);
      drawFace(rec.ctx, cell, OFFICE_STATE_STYLE[state].face, OFFICE_STATE_STYLE[state].color, 1.2, 0.4, "monospace");
      expect(rec.named("translate")[0].args).toEqual([cell.x, cell.y]);
      expect(rec.named("fillRect")[0].args).toEqual([0, 0, FACE_W, FACE_H]);
      expect(rec.named("restore")).toHaveLength(1);
    }
  });

  it("shows a generic question card for input, never prompt text", () => {
    const rec = recordingContext();
    drawScreen(rec.ctx, screenCell(0), input("input", { activity: "Asking Kurniadi" }), TEXTS, 1, 0, FONTS);
    expect(rec.texts()).toEqual(["Asking Kurniadi", "Waiting for Kurniadi", "?"]);
  });

  it("shows CI progress as done of total jobs, and an indeterminate bar with no counts while tests run", () => {
    const ci = recordingContext();
    drawScreen(ci.ctx, screenCell(1), input("ci", { progress: { done: 7, total: 12 } }), TEXTS, 1, 0, FONTS);
    expect(ci.texts()).toContain("7 of 12 jobs");
    expect(ci.named("fillRect").some((c) => Math.abs((c.args[2] as number) - (256 - 24) * (7 / 12)) < 1e-6)).toBe(true);
    const testing = recordingContext();
    drawScreen(testing.ctx, screenCell(2), input("testing", { activity: "Testing" }), TEXTS, 3.3, 0, FONTS);
    expect(testing.texts()).toEqual(["Testing"]);
  });

  it("names the failed job, sleeps with z Z, and scrolls only the invented code lines", () => {
    const failed = recordingContext();
    drawScreen(failed.ctx, screenCell(3), input("failed", { job: "Build, CV and e2e" }), TEXTS, 1, 0, FONTS);
    expect(failed.texts()).toContain("Build, CV and e2e");
    const asleep = recordingContext();
    drawScreen(asleep.ctx, screenCell(4), input("asleep"), TEXTS, 1, 0, FONTS);
    expect(asleep.texts()).toEqual(["z Z"]);
    const working = recordingContext();
    drawScreen(working.ctx, screenCell(0), input("working"), TEXTS, 7.7, 1.3, FONTS);
    const lines = working.texts().slice(1);
    expect(lines).toHaveLength(6);
    for (const line of lines) expect(CODE_LINES.some((code) => code.startsWith(line))).toBe(true);
  });

  it("changes frame keys with time only for animated kinds and never under reduced motion", () => {
    expect(faceKey("sleep", 1, 0, 10, false)).toBe(faceKey("sleep", 2, 0, 10, false));
    expect(faceKey("look", 1, 0, 10, false)).not.toBe(faceKey("look", 1.2, 0, 10, false));
    expect(faceKey("look", 1, 0, 10, true)).toBe(faceKey("look", 9, 0, 10, true));
    const code = input("working");
    expect(screenKey(code, 1, 10, false)).not.toBe(screenKey(code, 1.2, 10, false));
    expect(screenKey(code, 1, 10, true)).toBe(screenKey(code, 5, 10, true));
    const ci = input("ci", { progress: { done: 3, total: 12 } });
    expect(screenKey(ci, 1, 10, false)).toBe(screenKey(ci, 4, 10, false));
    expect(screenKey(ci, 1, 10, false)).not.toBe(screenKey({ ...ci, progress: { done: 4, total: 12 } }, 1, 10, false));
  });

  it("caps face redraws at 5 fps whatever rate the caller asks for", () => {
    expect(FACE_FPS_MAX).toBe(5);
    for (const kind of ["look", "scan", "watch", "wait"] as const) {
      const keys = new Set<string>();
      for (let i = 0; i < 600; i++) keys.add(faceKey(kind, i / 60, 0.4, 10, false));
      expect(keys.size).toBeLessThanOrEqual(FACE_FPS_MAX * 10 + 1);
      expect(keys.size).toBeGreaterThan(1);
    }
  });

  it("lists only the changed cells for a partial upload, and maps each cell to its upload origin", () => {
    expect(ATLAS_CELLS).toBe(20);
    for (let slot = 0; slot < 10; slot++) {
      expect(atlasCell(slot)).toEqual(faceCell(slot));
      expect(atlasCell(10 + slot)).toEqual(screenCell(slot));
    }
    const prev = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
    expect(dirtyCells(prev, [...prev])).toEqual([]);
    const next = [...prev];
    next[2] = "c2";
    next[7] = "h2";
    expect(dirtyCells(prev, next)).toEqual([2, 7]);
    expect(dirtyCells([], prev)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (let i = 0; i < ATLAS_CELLS; i++) {
      const cell = atlasCell(i);
      const [u0, v0] = cellUv(cell);
      expect(uploadOrigin(cell)).toEqual({ x: u0 * ATLAS.w, y: Math.round(v0 * ATLAS.h) });
    }
    expect(uploadOrigin(faceCell(0))).toEqual({ x: 0, y: ATLAS.h - FACE_H });
  });

  it("keeps the flag cell clear of the faces and screens", () => {
    const cells = Array.from({ length: ATLAS_CELLS }, (_, i) => atlasCell(i));
    const overlap = (a: Cell, b: Cell) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    expect(cells.some((c) => overlap(c, FLAG_CELL))).toBe(false);
    expect(FLAG_CELL.x + FLAG_CELL.w).toBeLessThanOrEqual(ATLAS.w);
  });

  it("draws the flag inside its cell as a mark, never text", () => {
    const rec = recordingContext();
    drawFlag(rec.ctx, FLAG_CELL, OFFICE_STATE_STYLE.input.color);
    expect(rec.named("clearRect")[0].args).toEqual([FLAG_CELL.x, FLAG_CELL.y, FLAG_CELL.w, FLAG_CELL.h]);
    for (const { args } of rec.named("fillRect")) {
      const [x, y, w, h] = args as number[];
      expect(x).toBeGreaterThanOrEqual(FLAG_CELL.x);
      expect(y).toBeGreaterThanOrEqual(FLAG_CELL.y);
      expect(x + w).toBeLessThanOrEqual(FLAG_CELL.x + FLAG_CELL.w);
      expect(y + h).toBeLessThanOrEqual(FLAG_CELL.y + FLAG_CELL.h);
    }
    expect(rec.named("fillText")).toHaveLength(0);
  });
});

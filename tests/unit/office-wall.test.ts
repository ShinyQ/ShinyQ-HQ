import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import type { OfficeTranslate } from "@/experience/floors/lobby/officeLayout";
import { officeView } from "@/experience/floors/lobby/office/officeModel";
import { drawWall, WALL_BASE, WALL_CANVAS, wallKey, wallModel } from "@/experience/floors/lobby/office/officeWall";
import en from "../../messages/en.json";
import id from "../../messages/id.json";
import { statesA, statesB } from "../../e2e/office-fixtures";
import { recordingContext } from "../helpers/fake-canvas";

const NOW = 1_800_000_000_000;
const tEn = createTranslator({ locale: "en", messages: en, namespace: "office" }) as unknown as OfficeTranslate;
const tId = createTranslator({ locale: "id", messages: id, namespace: "office" }) as unknown as OfficeTranslate;
const FONTS = { mono: "monospace", sans: "sans-serif" };

describe("Agent Office screen wall", () => {
  it("summarizes the counts, the mode with its age, the +N chip, the awake desks and today", () => {
    const m = wallModel(officeView({ status: "ready", snapshot: statesA(NOW) }), tEn, "en", NOW + 20_000);
    expect(m.tiles.map((x) => [x.label, x.value])).toEqual([["ACTIVE", 3], ["THINKING", 1], ["WAITING", 1], ["ASLEEP", 5]]);
    expect(m.status).toBe("LIVE · just now");
    expect(m.extra).toBe("+2");
    expect(m.now.map((r) => r.head)).toEqual(["Copilot · Editing", "Claude · Planning"]);
    expect(m.now[1].sub).toBe("Client project");
    expect(m.resting).toBeNull();
    expect(m.today).toBe("Today: tasks done 3 · PRs merged 2 · CI green 5 of 6");
    expect(m.rows.map((r) => r.meta)).toEqual(["ShinyQ/ShinyQ-HQ · running · just now", "ShinyQ/ShinyQ-HQ · merged · 10 min"]);
    expect(m.rows[0].progress).toBeCloseTo(7 / 12);
  });

  it("rests when offline: every desk asleep, no today line, the last GitHub events kept", () => {
    const m = wallModel(officeView({ status: "offline", snapshot: statesB(NOW) }), tEn, "en", NOW);
    expect(m.status).toBe("OFFLINE");
    expect(m.tiles.map((x) => x.value)).toEqual([0, 0, 0, 10]);
    expect(m.resting).toBe(en.office["3d"].wall.resting);
    expect(m.today).toBeNull();
    expect(m.rows).toHaveLength(2);
    expect(wallModel(officeView({ status: "idle", snapshot: null }), tId, "id", NOW).status).toBe("ISTIRAHAT");
  });

  it("draws both halves at the tier's canvas size", () => {
    const rec = recordingContext();
    const m = wallModel(officeView({ status: "ready", snapshot: statesA(NOW) }), tEn, "en", NOW);
    drawWall(rec.ctx, WALL_CANVAS.lite, m, 0, FONTS);
    expect(rec.named("setTransform")[0].args).toEqual([WALL_CANVAS.lite.w / WALL_BASE.w, 0, 0, WALL_CANVAS.lite.h / WALL_BASE.h, 0, 0]);
    const texts = rec.texts();
    for (const s of ["MISSION CONTROL", "LIVE · just now", "+2", "3", "GITHUB", "Public repositories", "CI", "feat: agent office"]) expect(texts).toContain(s);
  });

  it("changes its frame key for content, and for the spinner only while a run is running", () => {
    const running = wallModel(officeView({ status: "ready", snapshot: statesA(NOW) }), tEn, "en", NOW);
    expect(wallKey(running, 0)).not.toBe(wallKey(running, 1));
    const idle = { ...running, rows: running.rows.filter((r) => r.status !== "running") };
    expect(wallKey(idle, 0)).toBe(wallKey(idle, 1));
    expect(wallKey(idle, 0)).not.toBe(wallKey({ ...idle, extra: "+3" }, 0));
  });
});

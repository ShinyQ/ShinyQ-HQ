import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import type { ViewportClass } from "@/experience/types";
import { OFFICE_CHIP_TOP } from "@/experience/floors/lobby/officeShell";
import { cameraClass, viewportClass } from "@/lib/viewport";
import type { OfficeTranslate } from "@/experience/floors/lobby/officeLayout";
import { chipLines, officeView, safeGithubUrl, safeRepoUrl, screenInput } from "@/experience/floors/lobby/office/officeModel";
import * as shared from "@/lib/office/model";
import { OFFICE_FIXTURES } from "@/lib/office/fixtures";
import en from "../../messages/en.json";
import { STATES_A, STATES_B, statesA, statesB } from "../../e2e/office-fixtures";
import { SIZES } from "../helpers/office-cameras";
import { officeFrame } from "../helpers/office-frame";

const NOW = 1_800_000_000_000;
const t = createTranslator({ locale: "en", messages: en, namespace: "office" }) as unknown as OfficeTranslate;
const ready = (snapshot: ReturnType<typeof statesA>) => officeView({ status: "ready", snapshot });

describe("Agent Office view model", () => {
  it("always shows five Rovers in slot order, live desks with their state, title only when public", () => {
    const view = ready(statesA(NOW));
    expect(view.mode).toBe("live");
    expect(view.rovers.map((r) => r.state)).toEqual(STATES_A);
    expect(view.rovers.map((r) => r.title)).toEqual(["Agent office scene", null, null, null, "Office chips"]);
    expect(view.rovers[4].progress).toEqual({ done: 7, total: 12 });
    expect(view.rovers[0].progress).toBeNull();
    expect(view.counts).toEqual({ active: 3, thinking: 1, waiting: 1, asleep: 0 });
    expect(view.extra).toBe(2);
  });

  it("fills a slot without a session with an off-duty Rover and keeps a failed desk's job", () => {
    const view = ready(statesB(NOW));
    expect(view.rovers.map((r) => r.state)).toEqual(STATES_B);
    expect(view.rovers[4]).toMatchObject({ agent: null, state: "asleep", activity: "resting", title: null });
    expect(view.rovers[2].job).toBe("Build, CV and e2e");
  });

  it("puts every Rover to sleep when offline (keeping agents and the last GitHub events), off, disabled or before data", () => {
    const offline = officeView({ status: "offline", snapshot: statesA(NOW) });
    expect(offline.mode).toBe("offline");
    expect(offline.rovers.every((r) => r.state === "asleep")).toBe(true);
    expect(offline.rovers[0].agent).toBe("copilot");
    expect(offline.github).toHaveLength(2);
    expect(offline.counts).toEqual({ active: 0, thinking: 0, waiting: 0, asleep: 5 });
    expect(offline.extra).toBe(0);
    for (const feed of [{ status: "disabled", snapshot: null }, { status: "idle", snapshot: null }, { status: "loading", snapshot: null }] as const) {
      const view = officeView(feed);
      expect(view.mode).toBe("off");
      expect(view.rovers.every((r) => r.agent === null && r.state === "asleep")).toBe(true);
    }
    const semi = officeView({ status: "ready", snapshot: OFFICE_FIXTURES.semiLive as ReturnType<typeof statesA> });
    expect(semi.mode).toBe("semi-live");
    expect(semi.rovers.every((r) => r.state === "asleep")).toBe(true);
    const off = officeView({ status: "ready", snapshot: OFFICE_FIXTURES.off as ReturnType<typeof statesA> });
    expect(off.mode).toBe("off");
    expect(off.rovers.every((r) => r.state === "asleep")).toBe(true);
  });

  it("writes chip lines: agent and activity, the title or Client project, CI progress", () => {
    const view = ready(statesA(NOW));
    expect(chipLines(view.rovers[0], t)).toEqual({ head: "Copilot · Editing", task: "Agent office scene", progress: null });
    expect(chipLines(view.rovers[1], t)).toEqual({ head: "Claude · Planning", task: "Client project", progress: null });
    expect(chipLines(view.rovers[4], t).progress).toBeCloseTo(7 / 12);
    expect(chipLines(ready(statesB(NOW)).rovers[4], t)).toEqual({ head: "Off duty", task: null, progress: null });
  });

  it("feeds the desk screen the state's kind, the activity label and only protocol fields", () => {
    const [input, , failed] = ready(statesB(NOW)).rovers;
    expect(screenInput(input, t)).toEqual({ kind: "question", color: "#f472b6", activity: "Asking Kurniadi", progress: null, job: null });
    expect(screenInput(failed, t)).toMatchObject({ kind: "cross", job: "Build, CV and e2e" });
  });

  it("links through the shared, Classic-safe URL checks (src/lib/office/model.ts)", () => {
    expect(safeRepoUrl).toBe(shared.safeRepoUrl);
    expect(safeGithubUrl).toBe(shared.safeGithubUrl);
  });
});

/**
 * How the office fills the frame from the office stop (Task 19, coordinator request 2026-10-20: the wall's top 12% to 15%
 * from the top edge, the console and the Rovers 45% to 85% down, the CI tower column and the dock pad in frame on desktop
 * sizes, the visitor's Rover in frame). `OFFICE.view` takes, per camera class, the view closest to those targets that keeps
 * every chip check of tests/unit/office-chip-placement.test.ts (far at the stop, the middle three near one zoom step in,
 * clear of the wall, the desk screens, the rover, one another and the HUD, also on every frame of the zoom).
 * The wall-top target is out of reach with chips hung over the wall: on a desktop a 15% wall top leaves 42 px (1280 x 720)
 * for the two chip rows under the 66 px top bar, puts the camera 35 to 37.5 u from the anchors (inside the 37 u near band,
 * so the chips are not far at the stop), and one zoom step (the pivot is the rover's look-ahead, in the console) lifts the
 * wall's top to 47 to 59 px, under the top bar. A portrait screen is width bound (the whole wall and the five desks fit
 * 390 px), so its console cannot drop to 45% with the wall's top over 18%. The measured fractions are pinned here.
 */
describe("the office stop frame", () => {
  /** Wall top, console top and bottom (fractions of the height from the top edge), per camera class. */
  const MEASURED: Record<ViewportClass, readonly [number, number, number]> = {
    desktop: [0.363, 0.572, 0.685],
    tablet: [0.3, 0.502, 0.612],
    mobile: [0.218, 0.367, 0.459],
  };
  /**
   * The near pose (one zoom step, two on a portrait screen) still leaves a chip's height between the HUD's top bar and the
   * wall's top: a near chip (task line, 68 px) on the desktop camera, a one-line chip or a phone's dot (32 px) elsewhere.
   */
  const NEAR_STEPS: Record<ViewportClass, number> = { desktop: 1, tablet: 1, mobile: 2 };

  it.each(SIZES)("frames the office on $id ($width x $height): wall top, console band, the tower, the dock and the visitor's Rover", ({ width, height }) => {
    const cls = cameraClass(width, height);
    const f = officeFrame(width, height);
    const [wallTop, consoleTop, consoleBottom] = MEASURED[cls];
    expect(f.wallTop, "wall top").toBeCloseTo(wallTop, 3);
    expect(f.console.top, "console top").toBeCloseTo(consoleTop, 3);
    expect(f.console.bottom, "console bottom").toBeCloseTo(consoleBottom, 3);
    // The console and the Rovers sit under the wall, inside the lower-middle band's bottom edge.
    expect(f.console.top).toBeGreaterThan(f.wallTop);
    expect(f.console.bottom).toBeLessThanOrEqual(0.85);
    expect(f.rover, "the visitor's Rover").toBe(true);
    if (cls !== "mobile") expect([f.tower, f.dock], "the CI tower column and the dock pad").toEqual([true, true]);
  });

  it.each(SIZES)("leaves a chip's height between the top bar and the wall at the near pose on $id ($width x $height)", ({ width, height }) => {
    const cls = cameraClass(width, height);
    const near = officeFrame(width, height, NEAR_STEPS[cls]);
    const top = OFFICE_CHIP_TOP[viewportClass(width, height) === "mobile" ? "mobile" : "desktop"];
    expect(near.wallTop * height - top).toBeGreaterThanOrEqual(cls === "desktop" ? 68 : 32);
  });
});

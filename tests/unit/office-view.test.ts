import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import type { ViewportClass } from "@/experience/types";
import { cameraClass } from "@/lib/viewport";
import type { OfficeTranslate } from "@/experience/floors/lobby/officeLayout";
import { chipLines, officeView, safeGithubUrl, safeRepoUrl, screenInput } from "@/experience/floors/lobby/office/officeModel";
import * as shared from "@/lib/office/model";
import { OFFICE_FIXTURES, OFFICE_FIXTURES_V2 } from "@/lib/office/fixtures";
import type { OfficeFeedSnapshot } from "@/lib/office/poll";
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

  it("writes chip lines: the name, agent and activity, the title or Client project, CI progress, and the full label", () => {
    const view = ready(statesA(NOW));
    expect(chipLines(view.rovers[0], t)).toEqual({ name: "Copilot", base: "Copilot · Editing", head: "Copilot · Editing", helpers: null, task: "Agent office scene", progress: null, label: "Desk 1: Copilot · Editing, Agent office scene" });
    expect(chipLines(view.rovers[1], t)).toEqual({ name: "Claude", base: "Claude · Planning", head: "Claude · Planning", helpers: null, task: "Client project", progress: null, label: "Desk 2: Claude · Planning, Client project" });
    expect(chipLines(view.rovers[4], t).progress).toBeCloseTo(7 / 12);
    expect(chipLines(view.rovers[4], t).label).toMatch(/^Desk 5: .+, Office chips, 7 of 12 jobs$/);
    const helpers = officeView({ status: "ready", snapshot: OFFICE_FIXTURES_V2.busy as OfficeFeedSnapshot });
    expect(chipLines(helpers.rovers[0], t)).toMatchObject({ base: "Copilot · Editing", head: "Copilot · Editing · 3 helpers", helpers: "3 helpers" });
    expect(chipLines(helpers.rovers[0], t).label).toMatch(/^Desk 1: Copilot · Editing · 3 helpers, /);
    expect(chipLines(ready(statesB(NOW)).rovers[4], t)).toEqual({ name: "Off duty", base: "Off duty", head: "Off duty", helpers: null, task: null, progress: null, label: "Desk 5: Off duty" });
  });

  it("feeds the desk screen the state's kind, the activity label and only protocol fields", () => {
    const [input, , failed] = ready(statesB(NOW)).rovers;
    expect(screenInput(input, t)).toEqual({ kind: "question", color: "#f472b6", activity: "Asking Kurniadi", progress: null, job: null });
    expect(screenInput(failed, t)).toMatchObject({ kind: "cross", job: "Build, CV and e2e" });
  });

  it("maps desk helpers to the Rover's drones, 0 without helpers, asleep, off duty, off or offline", () => {
    const busy = OFFICE_FIXTURES_V2.busy as OfficeFeedSnapshot;
    const live = officeView({ status: "ready", snapshot: busy });
    expect(live.rovers.map((r) => r.helpers)).toEqual([3, 0, 6, 0, 0]);
    expect(ready(statesB(NOW)).rovers[4].helpers).toBe(0);
    const sleepy = officeView({ status: "ready", snapshot: { ...busy, desks: busy.desks.map((d) => (d.slot === 0 ? { ...d, state: "asleep", activity: "resting" } : d)) } });
    expect(sleepy.rovers[0].helpers).toBe(0);
    expect(officeView({ status: "offline", snapshot: busy }).rovers.every((r) => r.helpers === 0)).toBe(true);
    expect(officeView({ status: "ready", snapshot: { ...busy, mode: "off" } }).rovers.every((r) => r.helpers === 0)).toBe(true);
    expect(officeView({ status: "disabled", snapshot: null }).rovers.every((r) => r.helpers === 0)).toBe(true);
  });

  it("links through the shared, Classic-safe URL checks (src/lib/office/model.ts)", () => {
    expect(safeRepoUrl).toBe(shared.safeRepoUrl);
    expect(safeGithubUrl).toBe(shared.safeGithubUrl);
  });
});

/**
 * How the office fills the frame from the office stop (owner decision 2026-10-20: the wall's top 12% to 15% from the top
 * edge, the console and the Rovers 45% to 85% down, the CI tower column and the dock pad in frame on desktop sizes, the
 * visitor's Rover in frame; the chips moved to a row under the HUD's top bar to free that band). `OFFICE.view` takes, per
 * camera class, the view closest to those targets (`tests/helpers/office-frame.ts`; the search behind it is in the Task 19
 * report):
 * - desktop: no view keeps the tower and the dock in frame on 1180 x 820 (the narrowest desktop) with the console top under
 *   42.8% at a 15% wall top: the Rovers' heads start at 42.4%;
 * - tablet: the console from 45.8% down, the tower and the dock in frame; the wall's top at 17.7%, lower than the 15%
 *   target on purpose: there it clears the HUD's 62 px top bar on 844 x 390 (69 px) and the chip row's 32 px names on
 *   960 x 640 (114 px against the row's bottom at 98 px);
 * - portrait: width bound (the whole wall and the five desks across 390 px, every Rover in frame from the zone's corners),
 *   so the office spans under a third of the height: the console 31% to 43% down.
 */
describe("the office stop frame", () => {
  /** The measured wall top, console top and bottom (fractions of the height from the top edge), per camera class. */
  const MEASURED: Record<ViewportClass, readonly [number, number, number]> = {
    desktop: [0.15, 0.424, 0.618],
    tablet: [0.177, 0.458, 0.664],
    mobile: [0.149, 0.314, 0.426],
  };
  /** The lowest console top each class reaches (the 45% target where it can). */
  const CONSOLE_TOP: Record<ViewportClass, number> = { desktop: 0.42, tablet: 0.45, mobile: 0.31 };
  /**
   * The lowest the wall's top may stand: 15% (the target), but 18% on the tablet camera, whose screens are short: measured
   * clear of the HUD's top bar (62 px) on 844 x 390 and of the chip row (66 px plus a 32 px chip) on 960 x 640.
   */
  const WALL_TOP_MAX: Record<ViewportClass, number> = { desktop: 0.15, tablet: 0.18, mobile: 0.15 };

  it.each(SIZES)("frames the office on $id ($width x $height): wall top, console band, the tower, the dock and the visitor's Rover", ({ width, height }) => {
    const cls = cameraClass(width, height);
    const f = officeFrame(width, height);
    const [wallTop, consoleTop, consoleBottom] = MEASURED[cls];
    expect(f.wallTop, "wall top").toBeCloseTo(wallTop, 3);
    expect(f.console.top, "console top").toBeCloseTo(consoleTop, 3);
    expect(f.console.bottom, "console bottom").toBeCloseTo(consoleBottom, 3);
    expect(f.wallTop, "wall top 12% down or lower").toBeGreaterThanOrEqual(0.12);
    expect(f.wallTop, "wall top 15% down or higher (18% on the tablet camera)").toBeLessThanOrEqual(WALL_TOP_MAX[cls] + 5e-4);
    if (cls === "tablet") {
      expect(f.wallTop * height, "wall top under the HUD's top bar").toBeGreaterThanOrEqual(62 + 4);
      if (height > 390) expect(f.wallTop * height, "wall top under the chip row's names").toBeGreaterThanOrEqual(66 + 32 + 8);
    }
    expect(f.console.top, "console top").toBeGreaterThanOrEqual(CONSOLE_TOP[cls]);
    expect(f.console.bottom, "console bottom").toBeLessThanOrEqual(0.85);
    expect(f.rover, "the visitor's Rover").toBe(true);
    if (cls !== "mobile") expect([f.tower, f.dock], "the CI tower column and the dock pad").toEqual([true, true]);
  });
});

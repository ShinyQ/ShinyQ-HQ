import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import type { ViewportClass } from "@/experience/types";
import { cameraClass } from "@/lib/viewport";
import type { OfficeTranslate } from "@/experience/floors/lobby/officeLayout";
import { chipLines, nearDropsFor, nearParts, officeView, safeGithubUrl, safeRepoUrl, screenInput } from "@/experience/floors/lobby/office/officeModel";
import * as shared from "@/lib/office/model";
import { OFFICE_FIXTURES, OFFICE_FIXTURES_V2, OFFICE_FIXTURES_V3, OFFICE_FIXTURES_V4 } from "@/lib/office/fixtures";
import type { OfficeFeedSnapshot } from "@/lib/office/poll";
import en from "../../messages/en.json";
import { STATES_A, STATES_B, statesA, statesB } from "../../e2e/office-fixtures";
import { SIZES } from "../helpers/office-cameras";
import { officeFrame } from "../helpers/office-frame";

const NOW = 1_800_000_000_000;
const t = createTranslator({ locale: "en", messages: en, namespace: "office" }) as unknown as OfficeTranslate;
const ready = (snapshot: ReturnType<typeof statesA>) => officeView({ status: "ready", snapshot });
/** The back row of a five-desk snapshot: five off-duty Rovers asleep. */
const BACK_ASLEEP = ["asleep", "asleep", "asleep", "asleep", "asleep"];

describe("Agent Office view model", () => {
  it("reads a ten-desk v3 snapshot as ten Rovers over both rows (slots 0 to 9), extra only past ten", () => {
    const v3 = OFFICE_FIXTURES_V3.busy as OfficeFeedSnapshot;
    const view = officeView({ status: "ready", snapshot: v3 });
    const v2 = officeView({ status: "ready", snapshot: OFFICE_FIXTURES_V2.busy as OfficeFeedSnapshot });
    expect(view.rovers.map((r) => r.slot)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(view.rovers.slice(0, 5)).toEqual(v2.rovers.slice(0, 5));
    expect(view.rovers.slice(5).map((r) => [r.agent, r.state, r.helpers])).toEqual([
      ["codex", "reviewing", 2],
      ["copilot", "testing", 0],
      ["claude", "input", 0],
      ["codex", "asleep", 0],
      ["copilot", "working", 4],
    ]);
    expect(view.rovers[7].title).toBe("Ten Rovers in the live scene");
    expect(view.counts).toEqual({ active: v2.counts.active + 3, thinking: v2.counts.thinking, waiting: v2.counts.waiting + 1, asleep: v2.counts.asleep - 5 + 1 });
    expect(view.extra).toBe(1);
    // A five-desk v2 snapshot leaves the back row off duty.
    expect(v2.rovers.slice(5).every((r) => r.agent === null && r.state === "asleep")).toBe(true);
    expect(shared.withSeats(v3)).toEqual({ ...v3, desks: v3.desks.slice(0, 5), extra: 6 });
    expect(shared.withSeats(v3, 10)).toBe(v3);
  });


  it("keeps the pipeline of a live v4 feed; null offline, off, disabled, before data or for a snapshot without one", () => {
    const busy = OFFICE_FIXTURES_V4.busy;
    if (!busy.enabled) throw new Error("busy is enabled");
    expect(busy.pipeline.runs.length).toBeGreaterThan(0);
    expect(officeView({ status: "ready", snapshot: busy }).pipeline).toEqual(busy.pipeline);
    expect(officeView({ status: "ready", snapshot: OFFICE_FIXTURES_V4.semiLive as OfficeFeedSnapshot }).pipeline).toEqual({ runs: [], ships: [] });
    expect(officeView({ status: "offline", snapshot: busy }).pipeline).toBeNull();
    expect(officeView({ status: "ready", snapshot: OFFICE_FIXTURES_V4.off as OfficeFeedSnapshot }).pipeline).toBeNull();
    expect(officeView({ status: "disabled", snapshot: null }).pipeline).toBeNull();
    expect(officeView({ status: "idle", snapshot: null }).pipeline).toBeNull();
    expect(officeView({ status: "ready", snapshot: OFFICE_FIXTURES_V3.busy as OfficeFeedSnapshot }).pipeline).toBeNull();
  });

  it("marks a replay's view with its day, seq and truncation (null for the live feed), the rest read the same way", () => {
    const snapshot = OFFICE_FIXTURES_V4.busy as OfficeFeedSnapshot;
    const live = officeView({ status: "ready", snapshot });
    expect(live.replay).toBeNull();
    const replay = officeView({ status: "ready", snapshot }, { day: "2026-10-18", seq: 2, truncated: false, label: "Sun 18 Oct" });
    expect(replay.replay).toEqual({ day: "2026-10-18", seq: 2, truncated: false, label: "Sun 18 Oct" });
    expect({ ...replay, replay: null }).toEqual(live);
  });

  it("always shows ten Rovers in slot order, live desks with their state, title only when public", () => {
    const view = ready(statesA(NOW));
    expect(view.mode).toBe("live");
    expect(view.rovers.map((r) => r.state)).toEqual([...STATES_A, ...BACK_ASLEEP]);
    expect(view.rovers.map((r) => r.title)).toEqual(["Agent office scene", null, null, null, "Office chips", null, null, null, null, null]);
    expect(view.rovers[4].progress).toEqual({ done: 7, total: 12 });
    expect(view.rovers[0].progress).toBeNull();
    // The five empty back-row seats count as asleep.
    expect(view.counts).toEqual({ active: 3, thinking: 1, waiting: 1, asleep: 5 });
    expect(view.extra).toBe(2);
  });

  it("fills a slot without a session with an off-duty Rover and keeps a failed desk's job", () => {
    const view = ready(statesB(NOW));
    expect(view.rovers.map((r) => r.state)).toEqual([...STATES_B, ...BACK_ASLEEP]);
    expect(view.rovers[4]).toMatchObject({ agent: null, state: "asleep", activity: "resting", title: null });
    expect(view.rovers[2].job).toBe("Build, CV and e2e");
  });

  it("puts every Rover to sleep when offline (keeping agents and the last GitHub events), off, disabled or before data", () => {
    const offline = officeView({ status: "offline", snapshot: statesA(NOW) });
    expect(offline.mode).toBe("offline");
    expect(offline.rovers.every((r) => r.state === "asleep")).toBe(true);
    expect(offline.rovers[0].agent).toBe("copilot");
    expect(offline.github).toHaveLength(2);
    expect(offline.counts).toEqual({ active: 0, thinking: 0, waiting: 0, asleep: 10 });
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
    expect(chipLines(view.rovers[0], t)).toEqual({ name: "Copilot", activity: "Editing", base: "Copilot · Editing", head: "Copilot · Editing", helpers: null, task: "Agent office scene", progress: null, label: "Desk 1: Copilot · Editing, Agent office scene" });
    expect(chipLines(view.rovers[1], t)).toEqual({ name: "Claude", activity: "Planning", base: "Claude · Planning", head: "Claude · Planning", helpers: null, task: "Client project", progress: null, label: "Desk 2: Claude · Planning, Client project" });
    expect(chipLines(view.rovers[4], t).progress).toBeCloseTo(7 / 12);
    expect(chipLines(view.rovers[4], t).label).toMatch(/^Desk 5: .+, Office chips, 7 of 12 jobs$/);
    const helpers = officeView({ status: "ready", snapshot: OFFICE_FIXTURES_V2.busy as OfficeFeedSnapshot });
    expect(chipLines(helpers.rovers[0], t)).toMatchObject({ base: "Copilot · Editing", head: "Copilot · Editing · 3 helpers", helpers: "3 helpers" });
    expect(chipLines(helpers.rovers[0], t).label).toMatch(/^Desk 1: Copilot · Editing · 3 helpers, /);
    expect(chipLines(ready(statesB(NOW)).rovers[4], t)).toEqual({ name: "Off duty", activity: null, base: "Off duty", head: "Off duty", helpers: null, task: null, progress: null, label: "Desk 5: Off duty" });
  });

  it("splits a near chip's head into the name, the activity (the part an ellipsis cuts) and the helpers, whose word alone may go", () => {
    const helpers = chipLines(officeView({ status: "ready", snapshot: OFFICE_FIXTURES_V2.busy as OfficeFeedSnapshot }).rovers[0], t);
    expect(nearParts(helpers, 3, 0)).toEqual({ name: "Copilot", activity: "Editing", helpers: "3 helpers" });
    expect(nearParts(helpers, 3, 1)).toEqual({ name: "Copilot", activity: "Editing", helpers: "3" });
    expect(nearDropsFor(helpers)).toBe(1);
    const plain = chipLines(ready(statesA(NOW)).rovers[1], t);
    expect([0, 1].map((d) => nearParts(plain, 0, d))).toEqual([0, 1].map(() => ({ name: "Claude", activity: "Planning", helpers: null })));
    expect(nearDropsFor(plain)).toBe(0);
    const off = chipLines(ready(statesB(NOW)).rovers[4], t);
    expect(nearParts(off, 0, 1)).toEqual({ name: "Off duty", activity: null, helpers: null });
    expect(nearDropsFor(off)).toBe(0);
  });

  it("feeds the desk screen the state's kind, the activity label and only protocol fields", () => {
    const [input, , failed] = ready(statesB(NOW)).rovers;
    expect(screenInput(input, t)).toEqual({ kind: "question", color: "#f472b6", activity: "Asking Kurniadi", progress: null, job: null });
    expect(screenInput(failed, t)).toMatchObject({ kind: "cross", job: "Build, CV and e2e" });
  });

  it("maps desk helpers to the Rover's drones, 0 without helpers, asleep, off duty, off or offline", () => {
    const busy = OFFICE_FIXTURES_V2.busy as OfficeFeedSnapshot;
    const live = officeView({ status: "ready", snapshot: busy });
    expect(live.rovers.map((r) => r.helpers)).toEqual([3, 0, 6, 0, 0, 0, 0, 0, 0, 0]);
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
 * How the office fills the frame from the office stop (owner decisions 2026-10-20 and 2026-10-21: the wall's top 12% to
 * 15% from the top edge, both console rows and their Rovers lower down, the CI tower column and the dock pad in frame on
 * desktop sizes, the visitor's Rover in frame, the portrait screens' top-band fill accepted; the ten chips in a row under
 * the HUD's top bar). `OFFICE.view` takes, per camera class, the view closest to those targets at the elevation the view
 * had before the second row (`tests/helpers/office-frame.ts`):
 * - desktop: the wall's top at 15%, under the chip row (66 px plus a 32 px chip) by 8 px or more from 720 px tall, so
 *   the leader lines end on it with a tick; both rows 38.6% to 68.7% down;
 * - tablet: both rows from 37.7% down, the tower and the dock in frame; the wall's top at 17.7%, lower than the 15% target
 *   on purpose: there it clears the HUD's 62 px top bar on 844 x 390 (69 px) and the chip row's 32 px chips on 960 x 640
 *   (113 px against the row's bottom at 98 px);
 * - portrait: width bound (the whole wall and both rows across 390 px, every Rover in frame from the zone's corners), so
 *   the office spans under half of the height: both rows 29.5% to 46.9% down.
 */
describe("the office stop frame", () => {
  /** The measured wall top and both rows' top and bottom (fractions of the height from the top edge), per camera class. */
  const MEASURED: Record<ViewportClass, readonly [number, number, number]> = {
    desktop: [0.15, 0.386, 0.687],
    tablet: [0.177, 0.377, 0.629],
    mobile: [0.149, 0.295, 0.469],
  };
  /** The front row's top (its Rovers' heads), measured at the same view: the back row on its riser stands higher. */
  const FRONT_TOP: Record<ViewportClass, number> = { desktop: 0.492, tablet: 0.467, mobile: 0.358 };
  /**
   * The lowest the wall's top may stand: 15% (the target), but 18% on the tablet camera, whose screens are short: measured
   * clear of the HUD's top bar (62 px) on 844 x 390 and of the chip row (66 px plus a 32 px chip) on 960 x 640.
   */
  const WALL_TOP_MAX: Record<ViewportClass, number> = { desktop: 0.15, tablet: 0.18, mobile: 0.15 };

  it.each(SIZES)("frames the office on $id ($width x $height): wall top, both rows, the tower, the dock and the visitor's Rover", ({ width, height }) => {
    const cls = cameraClass(width, height);
    const f = officeFrame(width, height);
    const [wallTop, top, bottom] = MEASURED[cls];
    expect(f.wallTop, "wall top").toBeCloseTo(wallTop, 3);
    expect(f.wallTop, "wall top 12% down or lower").toBeGreaterThanOrEqual(0.12);
    expect(f.wallTop, "wall top 15% down or higher (18% on the tablet camera)").toBeLessThanOrEqual(WALL_TOP_MAX[cls] + 5e-4);
    if (cls === "desktop") expect(f.wallTop * height, "wall top under the chip row by 8 px").toBeGreaterThanOrEqual(66 + 32 + 8);
    if (cls === "tablet") {
      expect(f.wallTop * height, "wall top under the HUD's top bar").toBeGreaterThanOrEqual(62 + 4);
      if (height > 390) expect(f.wallTop * height, "wall top under the chip row").toBeGreaterThanOrEqual(66 + 32 + 8);
    }
    expect(f.console.top, "both rows' top").toBeCloseTo(top, 3);
    expect(f.console.bottom, "both rows' bottom").toBeCloseTo(bottom, 3);
    expect(f.rows[0].bottom, "the front row's bottom").toBeCloseTo(bottom, 3);
    expect(f.rows[0].top, "the front row's top").toBeCloseTo(FRONT_TOP[cls], 3);
    expect(f.rows[1].top, "the back row stands higher").toBeLessThan(f.rows[0].top);
    expect(f.console.top, "the back row under the wall's top").toBeGreaterThan(f.wallTop);
    expect(f.console.bottom, "console bottom").toBeLessThanOrEqual(0.85);
    expect(f.rover, "the visitor's Rover").toBe(true);
    if (cls !== "mobile") expect([f.tower, f.dock], "the CI tower column and the dock pad").toEqual([true, true]);
  });

  /**
   * The near pose (one zoom key step in, `OFFICE.view.desktop.lookOffset.near`): the look target rises so the wall's top
   * stands at 15.9%, under the near chip row (its top at 66 px plus a 40 px chip with its CI bar) by 8 px or more on every
   * desktop size, both rows and the visitor's Rover still in frame (the Rover low, over the bottom edge).
   */
  it.each(SIZES.filter((s) => cameraClass(s.width, s.height) === "desktop"))("aims the desktop near pose under the chip row on $id ($width x $height)", ({ width, height }) => {
    const f = officeFrame(width, height, 1);
    expect(f.wallTop, "wall top").toBeCloseTo(0.159, 3);
    expect(f.wallTop * height, "wall top under the near chip row").toBeGreaterThanOrEqual(66 + 40 + 8);
    expect(f.console.top, "both rows' top").toBeCloseTo(0.444, 3);
    expect(f.console.top, "the back row under the wall's top").toBeGreaterThan(f.wallTop);
    expect(f.console.bottom, "console bottom").toBeLessThanOrEqual(0.85);
    expect(f.rover, "the visitor's Rover").toBe(true);
  });
});

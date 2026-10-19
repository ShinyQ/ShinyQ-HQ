import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import type { OfficeTranslate } from "@/experience/floors/lobby/officeLayout";
import { chipLines, officeView, safeGithubUrl, safeRepoUrl, screenInput } from "@/experience/floors/lobby/office/officeModel";
import { OFFICE_FIXTURES } from "@/lib/office/fixtures";
import en from "../../messages/en.json";
import { STATES_A, STATES_B, statesA, statesB } from "../../e2e/office-fixtures";

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

  it("links only well-formed public GitHub repositories and github.com URLs", () => {
    expect(safeRepoUrl("ShinyQ/ShinyQ-HQ")).toBe("https://github.com/ShinyQ/ShinyQ-HQ");
    expect(safeRepoUrl("ShinyQ/../x")).toBeNull();
    expect(safeRepoUrl("ShinyQ/..")).toBeNull();
    expect(safeRepoUrl("javascript:alert(1)")).toBeNull();
    expect(safeRepoUrl(null)).toBeNull();
    expect(safeGithubUrl("https://github.com/ShinyQ/ShinyQ-HQ/pull/1")).toBe("https://github.com/ShinyQ/ShinyQ-HQ/pull/1");
    expect(safeGithubUrl("http://github.com/x")).toBeNull();
    expect(safeGithubUrl("https://evil.example/github.com")).toBeNull();
    expect(safeGithubUrl("not a url")).toBeNull();
  });
});

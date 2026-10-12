import { describe, expect, it, vi } from "vitest";
import type { StateStorage } from "zustand/middleware";
import type { Interactable } from "@/experience/hints/source";
import { linesOf, type DialogLine, type SayInput, type SayOptions, type SayResult } from "@/hud/dialog/engine";
import {
  firstName,
  HIGHLIGHTS_ID,
  HIGHLIGHTS_ROOM,
  highlightsTarget,
  ONBOARDING_ID,
  runOnboarding,
  TRY_IT_MS,
  waitForRoverMove,
  type OnboardingCopy,
  type OnboardingDeps,
} from "@/hud/dialog/onboarding";
import { createHQStore } from "@/store/useHQStore";

const copy: OnboardingCopy = {
  welcome: "welcome",
  start: "start",
  skip: "skip",
  skipped: "skipped",
  moveFine: "moveFine",
  moveCoarse: "moveCoarse",
  pointGoFine: "pointGoFine",
  pointGoCoarse: "pointGoCoarse",
  moved: "moved",
  cameraFine: "cameraFine",
  cameraCoarse: "cameraCoarse",
  highlights: "highlights",
  showMe: "showMe",
  later: "later",
  elevator: "elevator",
  askRover: "askRover",
  askAi: "askAi",
  closing: "closing",
  closingShort: "closingShort",
};

/** Records every line Rover says; answers a request from the first line whose key has an answer. */
function fakeSay(answers: Record<string, Partial<SayResult>> = {}) {
  const said: { lines: DialogLine[]; options?: SayOptions }[] = [];
  const say = vi.fn(async (input: SayInput, options?: SayOptions): Promise<SayResult> => {
    const lines = linesOf(input);
    said.push({ lines, options });
    for (const line of lines) {
      const answer = line.key ? answers[line.key] : undefined;
      if (answer) return { status: "done", choice: null, ...answer };
    }
    return { status: "done", choice: null };
  });
  const keys = () => said.flatMap((s) => s.lines.map((line) => line.key));
  const line = (key: string) => said.flatMap((s) => s.lines).find((l) => l.key === key)!;
  return { say, said, keys, line };
}

function deps(over: Partial<OnboardingDeps> = {}): OnboardingDeps {
  return {
    say: fakeSay().say,
    copy,
    coarse: false,
    variant: "full",
    waitForMove: () => Promise.resolve(),
    highlights: () => ({ floor: "L1", at: { x: 20, z: 0 } }),
    showMe: vi.fn(async () => {}),
    askAi: () => true,
    ...over,
  };
}

const item = (over: Partial<Interactable>): Interactable => ({
  id: "L1:station:profile",
  floor: "L1",
  kind: "station",
  label: "Profile",
  at: { x: 0, z: 0 },
  bounds: { minX: -1, maxX: 1, minZ: -1, maxZ: 1 },
  action: { type: "open-room", room: "L1:profile" },
  ...over,
});

const memoryStorage: StateStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("runOnboarding", () => {
  it("walks the full tour in order and offers Skip after the first line", async () => {
    const fake = fakeSay({ welcome: { choice: "start" } });
    const outcome = await runOnboarding(deps({ say: fake.say }));
    expect(outcome).toBe("done");
    expect(fake.keys()).toEqual(["welcome", "move", "point-go", "moved", "camera", "highlights", "elevator", "ask-rover", "ask-ai", "closing"]);
    expect(fake.said[0].options).toEqual({ id: ONBOARDING_ID });
    expect(fake.said[1].options).toEqual({ id: ONBOARDING_ID, skip: { label: "skip" } });
    expect(fake.line("welcome").choices?.map((c) => c.id)).toEqual(["start", "skip"]);
    expect(fake.line("elevator").spotlight).toBe("elevator");
    expect(fake.line("ask-rover").spotlight).toBe("ask-rover");
    expect(fake.line("ask-ai").spotlight).toBe("ask-ai");
    expect(fake.line("closing").text).toBe("closing");
    expect(fake.line("camera").spotlight).toBe("view");
    expect(fake.line("camera").text).toBe("cameraFine");
  });

  it("makes the moving step a try-it line with a Continue fallback", async () => {
    const fake = fakeSay();
    const waitForMove = vi.fn(() => Promise.resolve());
    await runOnboarding(deps({ say: fake.say, waitForMove }));
    const tryIt = fake.line("point-go");
    expect(tryIt.until).toBe(waitForMove);
    expect(tryIt.fallbackMs).toBe(TRY_IT_MS);
  });

  it("speaks touch controls on coarse pointers", async () => {
    const fake = fakeSay();
    await runOnboarding(deps({ say: fake.say, coarse: true }));
    expect(fake.line("move").text).toBe("moveCoarse");
    expect(fake.line("camera").text).toBe("cameraCoarse");
    expect(fake.line("point-go").text).toBe("pointGoCoarse");
  });

  it("stops after the welcome when the visitor skips", async () => {
    const fake = fakeSay({ welcome: { choice: "skip" } });
    expect(await runOnboarding(deps({ say: fake.say }))).toBe("skipped");
    expect(fake.keys()).toEqual(["welcome", "skipped"]);
  });

  it("stops when the skip button is pressed mid-tour", async () => {
    const fake = fakeSay({ move: { status: "skipped" } });
    expect(await runOnboarding(deps({ say: fake.say }))).toBe("skipped");
    expect(fake.keys()).toEqual(["welcome", "move", "point-go", "moved", "camera", "skipped"]);
  });

  it("ends quietly when cancelled", async () => {
    const fake = fakeSay({ move: { status: "cancelled" } });
    expect(await runOnboarding(deps({ say: fake.say }))).toBe("cancelled");
    expect(fake.keys()).not.toContain("closing");
    expect(fake.keys()).not.toContain("skipped");
  });

  it("skips the Highlights Hall step when the hall is not there", async () => {
    const fake = fakeSay();
    await runOnboarding(deps({ say: fake.say, highlights: () => null }));
    expect(fake.keys()).not.toContain("highlights");
  });

  it("drives to the Highlights Hall on Take me there, before the elevator line", async () => {
    const fake = fakeSay({ highlights: { choice: "show" } });
    const order: string[] = [];
    const showMe = vi.fn(async () => {
      order.push(`drive:${fake.keys().length}`);
    });
    await runOnboarding(deps({ say: fake.say, showMe }));
    expect(showMe).toHaveBeenCalledWith({ floor: "L1", at: { x: 20, z: 0 } });
    expect(order).toEqual([`drive:${fake.keys().indexOf("highlights") + 1}`]);
  });

  it("runs the short tour after a deep link: no Highlights Hall, no elevator", async () => {
    const fake = fakeSay();
    await runOnboarding(deps({ say: fake.say, variant: "short" }));
    expect(fake.keys()).toEqual(["welcome", "move", "point-go", "moved", "camera", "ask-rover", "ask-ai", "closing"]);
    expect(fake.line("closing").text).toBe("closingShort");
  });

  it("leaves out Ask AI when its button is not shown", async () => {
    const fake = fakeSay();
    await runOnboarding(deps({ say: fake.say, askAi: () => false }));
    expect(fake.keys()).not.toContain("ask-ai");
  });
});

describe("highlightsTarget", () => {
  it("finds the Highlights Hall's first station by registry id, else by its room", () => {
    expect(HIGHLIGHTS_ID).toBe("L1:station:highlights-about");
    const projects = item({ id: "L1:station:highlights-projects", at: { x: 40, z: 6 }, action: { type: "open-room", room: "L1:highlights-projects" } });
    const about = item({ id: HIGHLIGHTS_ID, at: { x: 38, z: -6 }, action: { type: "open-room", room: HIGHLIGHTS_ROOM } });
    expect(highlightsTarget([projects, about])).toEqual({ floor: "L1", at: { x: 38, z: -6 } });
    const renamed = item({ id: "L1:station:hall-about", at: { x: 1, z: 2 }, action: { type: "open-room", room: HIGHLIGHTS_ROOM } });
    expect(highlightsTarget([renamed])?.at).toEqual({ x: 1, z: 2 });
    expect(highlightsTarget([item({}), projects])).toBeNull();
  });
});

describe("waitForRoverMove", () => {
  it("resolves after 2 u of driving, a floor change or an abort", async () => {
    const store = createHQStore(memoryStorage);
    const moved = vi.fn();
    void waitForRoverMove(store, new AbortController().signal).then(moved);
    const start = store.getState().rover;
    store.getState().setRover({ x: start.x + 1 });
    await flush();
    expect(moved).not.toHaveBeenCalled();
    store.getState().setRover({ x: start.x + 2.5 });
    await flush();
    expect(moved).toHaveBeenCalledTimes(1);

    const rode = vi.fn();
    void waitForRoverMove(store, new AbortController().signal).then(rode);
    store.setState({ floor: "L2" });
    await flush();
    expect(rode).toHaveBeenCalledTimes(1);

    const aborted = vi.fn();
    const controller = new AbortController();
    void waitForRoverMove(store, controller.signal).then(aborted);
    controller.abort();
    await flush();
    expect(aborted).toHaveBeenCalledTimes(1);
  });
});

describe("firstName", () => {
  it("keeps the first word of the profile name", () => {
    expect(firstName("Kurniadi Ahmad Wijaya")).toBe("Kurniadi");
    expect(firstName("  Single  ")).toBe("Single");
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { StateStorage } from "zustand/middleware";
import { linesOf, type DialogLine, type SayInput, type SayOptions, type SayResult } from "@/hud/dialog/engine";
import {
  COPY_KEYS,
  onboardingCopy,
  ONBOARDING_ID,
  runOnboarding,
  TILT_ID,
  type TiltDeps,
  TRY_IT_MS,
  waitForRoverMove,
  type OnboardingCopy,
  type OnboardingDeps,
} from "@/hud/dialog/onboarding";
import { firstName } from "@/hud/dialog/names";
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
  elevator: "elevator",
  roverMenu: "roverMenu",
  askAi: "askAi",
  closing: "closing",
  closingShort: "closingShort",
  pointGoPhone: "pointGoPhone",
  movedPhone: "movedPhone",
  floorChip: "floorChip",
  tilt: "tilt",
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
    phone: false,
    variant: "full",
    waitForMove: () => Promise.resolve(),
    askAi: () => true,
    tilt: null,
    ...over,
  };
}

const memoryStorage: StateStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("runOnboarding", () => {
  it("walks the full tour in order and offers Skip after the first line", async () => {
    const fake = fakeSay({ welcome: { choice: "start" } });
    const outcome = await runOnboarding(deps({ say: fake.say }));
    expect(outcome).toBe("done");
    expect(fake.keys()).toEqual(["welcome", "move", "point-go", "moved", "camera", "elevator", "rover-menu", "ask-ai", "closing"]);
    expect(fake.said[0].options).toEqual({ id: ONBOARDING_ID });
    expect(fake.said[1].options).toEqual({ id: ONBOARDING_ID, skip: { label: "skip" } });
    expect(fake.line("welcome").choices?.map((c) => c.id)).toEqual(["start", "skip"]);
    expect(fake.line("elevator").spotlight).toBe("elevator");
    expect(fake.line("rover-menu").spotlight).toBe("rover-menu");
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

  it("never offers to drive the rover anywhere: no line with a choice past the welcome (owner decision 2026-10-27)", async () => {
    for (const phone of [false, true]) {
      for (const variant of ["full", "short"] as const) {
        const fake = fakeSay({ welcome: { choice: "start" } });
        await runOnboarding(deps({ say: fake.say, phone, coarse: phone, variant }));
        const withChoices = fake.said.flatMap((s) => s.lines).filter((l) => l.choices?.length).map((l) => l.key);
        expect(withChoices, `${phone ? "phone" : "desktop"} ${variant}`).toEqual(["welcome"]);
        expect(fake.keys()).not.toContain("highlights");
      }
    }
  });

  it("runs the short tour after a deep link: no Highlights Hall, no elevator", async () => {
    const fake = fakeSay();
    await runOnboarding(deps({ say: fake.say, variant: "short" }));
    expect(fake.keys()).toEqual(["welcome", "move", "point-go", "moved", "camera", "rover-menu", "ask-ai", "closing"]);
    expect(fake.line("closing").text).toBe("closingShort");
  });

  it("runs the phone tour: tap-to-go, the floor chip, the menu and Ask, no camera or pad lines", async () => {
    const fake = fakeSay();
    const waitForMove = vi.fn(() => Promise.resolve());
    await runOnboarding(deps({ say: fake.say, phone: true, coarse: true, waitForMove }));
    expect(fake.keys()).toEqual(["welcome", "point-go", "moved", "floor-chip", "rover-menu", "ask-ai", "closing"]);
    expect(fake.line("point-go").text).toBe("pointGoPhone");
    expect(fake.line("point-go").until).toBe(waitForMove);
    expect(fake.line("moved").text).toBe("movedPhone");
    expect(fake.line("floor-chip").spotlight).toBe("elevator");
    expect(fake.line("floor-chip").text).toBe("floorChip");
    expect(fake.line("rover-menu").spotlight).toBe("rover-menu");
    expect(fake.line("ask-ai").spotlight).toBe("ask-ai");
  });

  it("runs the short phone tour without Ask AI and closes short", async () => {
    const fake = fakeSay();
    await runOnboarding(deps({ say: fake.say, phone: true, variant: "short", askAi: () => false }));
    expect(fake.keys()).toEqual(["welcome", "point-go", "moved", "floor-chip", "rover-menu", "closing"]);
    expect(fake.line("closing").text).toBe("closingShort");
  });

  it("leaves out Ask AI when its button is not shown", async () => {
    const fake = fakeSay();
    await runOnboarding(deps({ say: fake.say, askAi: () => false }));
    expect(fake.keys()).not.toContain("ask-ai");
  });
});

describe("the tilt hint (spec 2026-10-29)", () => {
  function fakeTilt(due = true) {
    let turn = () => {};
    const tilt: TiltDeps & { seenCount: number; cancelled: string[] } = {
      seenCount: 0,
      cancelled: [],
      due: () => due,
      seen: () => void tilt.seenCount++,
      rotated: (signal) => new Promise<void>((resolve) => {
        turn = resolve;
        signal.addEventListener("abort", () => resolve(), { once: true });
      }),
      cancel: (id) => void tilt.cancelled.push(id),
    };
    return { tilt, turn: () => turn() };
  }

  it("follows the closing line once on a portrait touch screen, as its own toast with no choices, phones and tablets alike", async () => {
    for (const phone of [true, false]) {
      const fake = fakeSay({ welcome: { choice: "start" } });
      const { tilt } = fakeTilt();
      expect(await runOnboarding(deps({ say: fake.say, coarse: true, phone, tilt }))).toBe("done");
      expect(fake.keys().slice(-2)).toEqual(["closing", "tilt"]);
      const last = fake.said.at(-1)!;
      expect(last.options).toEqual({ id: TILT_ID });
      expect(last.lines[0]).toEqual({ key: "tilt", text: "tilt" });
      expect(tilt.seenCount).toBe(1);
      expect(tilt.cancelled).toEqual([]);
    }
  });

  it("is skipped when not due (a landscape screen, a fine pointer, already had), or when the tour is skipped or cancelled", async () => {
    const quiet = fakeSay({ welcome: { choice: "start" } });
    const { tilt } = fakeTilt(false);
    await runOnboarding(deps({ say: quiet.say, coarse: true, tilt }));
    expect(quiet.keys()).not.toContain("tilt");
    expect(tilt.seenCount).toBe(0);
    for (const answer of [{ welcome: { choice: "skip" } }, { closing: { status: "cancelled" as const } }]) {
      const fake = fakeSay({ welcome: { choice: "start" }, ...answer });
      const due = fakeTilt();
      await runOnboarding(deps({ say: fake.say, coarse: true, tilt: due.tilt }));
      expect(fake.keys()).not.toContain("tilt");
    }
  });

  it("ends the line when the screen turns", async () => {
    let release: (r: SayResult) => void = () => {};
    const said: string[] = [];
    const say = vi.fn((input: SayInput, options?: SayOptions): Promise<SayResult> => {
      const lines = linesOf(input);
      said.push(...lines.map((l) => l.key ?? ""));
      if (options?.id === TILT_ID) return new Promise((resolve) => (release = resolve));
      return Promise.resolve({ status: "done", choice: lines[0].key === "welcome" ? "start" : null });
    });
    const { tilt, turn } = fakeTilt();
    const done = runOnboarding(deps({ say, coarse: true, tilt }));
    await flush();
    expect(said.at(-1)).toBe("tilt");
    turn();
    await flush();
    expect(tilt.cancelled).toEqual([TILT_ID]);
    release({ status: "cancelled", choice: null });
    expect(await done).toBe("done");
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

describe("onboardingCopy", () => {
  it("resolves every copy key with the name", () => {
    const built = onboardingCopy((k, v) => `${k}:${v.name}`, "Ana");
    expect(Object.keys(built).sort()).toEqual([...COPY_KEYS].sort());
    expect(built.welcome).toBe("welcome:Ana");
  });

  it("covers every key of dialog.onboarding in the messages", () => {
    const en = JSON.parse(readFileSync(join(__dirname, "../../messages/en.json"), "utf8")) as { dialog: { onboarding: Record<string, string> } };
    expect([...COPY_KEYS].sort()).toEqual(Object.keys(en.dialog.onboarding).sort());
  });
});

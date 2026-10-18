// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import id from "../../messages/id.json";
import { EngineUnlockLayer } from "@/hud/dialog/EngineUnlockLayer";
import { markOnboarded, resetFlagMemory } from "@/hud/dialog/storage";
import * as dialog from "@/hud/dialog/store";
import { hudActions } from "@/hud/hudActions";
import { audio } from "@/lib/audio";
import { getHQStore } from "@/store/useHQStore";

const mount = () =>
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <EngineUnlockLayer />
    </NextIntlClientProvider>,
  );

beforeEach(() => {
  dialog.dialog.setInstant(true);
  markOnboarded("done");
  getHQStore().setState({ phase: "explore", floor: "RF", ride: null, b1Unlocked: true, b1Moment: true, floorsSeen: ["L1", "L2", "L3", "L4", "RF"] });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
  dialog.cancelAllDialogs();
  dialog.dialog.setInstant(false);
  getHQStore().setState({ b1Unlocked: false, b1Moment: false, floorsSeen: [] });
});

describe("EngineUnlockLayer", () => {
  it("chimes and asks once; Take me there rides to B1 and clears the moment", async () => {
    const play = vi.spyOn(audio, "play").mockImplementation(() => {});
    const say = vi.spyOn(dialog, "say");
    const request = vi.spyOn(getHQStore().getState(), "requestElevator");
    mount();
    await act(async () => {});
    expect(dialog.dialog.view.id).toBe("b1-unlock");
    expect(play).toHaveBeenCalledWith("chime");
    expect(say).toHaveBeenCalledTimes(1);
    const line = say.mock.calls[0][0] as { key: string; text: string; choices: { id: string; label: string }[] };
    expect(line).toMatchObject({ key: "b1-unlock", text: en.engine.unlock });
    expect(line.choices.map((c) => c.label)).toEqual([en.engine.go, en.engine.later]);
    await act(async () => dialog.dialog.choose("go"));
    expect(play).toHaveBeenCalledTimes(1);
    expect(getHQStore().getState().b1Moment).toBe(false);
    expect(request).toHaveBeenCalledWith("B1");
  });

  it("Later keeps B1 unlocked and rides nowhere", async () => {
    vi.spyOn(audio, "play").mockImplementation(() => {});
    vi.spyOn(dialog, "say").mockResolvedValue({ status: "done", choice: "later" });
    mount();
    await act(async () => {});
    expect(getHQStore().getState()).toMatchObject({ b1Moment: false, b1Unlocked: true, ride: null });
  });

  it("never speaks during a ride, then offers the line once free", async () => {
    vi.spyOn(audio, "play").mockImplementation(() => {});
    const say = vi.spyOn(dialog, "say").mockReturnValue(new Promise(() => {}));
    getHQStore().setState({ ride: { from: "L4", to: "RF", stage: "moving", t: 0 } });
    mount();
    await act(async () => {});
    expect(say).not.toHaveBeenCalled();
    act(() => getHQStore().setState({ ride: null }));
    await act(async () => {});
    expect(say).toHaveBeenCalledTimes(1);
    expect(getHQStore().getState().b1Moment).toBe(true);
  });

  it("holds the offer while a mission runs and offers it once the mission ends", async () => {
    const play = vi.spyOn(audio, "play").mockImplementation(() => {});
    const say = vi.spyOn(dialog, "say").mockReturnValue(new Promise(() => {}));
    getHQStore().setState({ mission: { id: "tour", step: 0, status: "running" } });
    mount();
    await act(async () => {});
    expect(say).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
    act(() => getHQStore().setState({ mission: { id: "tour", step: 1, status: "done" } }));
    await act(async () => {});
    expect(say).toHaveBeenCalledTimes(1);
    act(() => getHQStore().setState({ mission: null }));
  });

  it("tells a locked visitor who followed #B1 how to unlock it, and drops the hash", async () => {
    getHQStore().setState({ b1Unlocked: false, b1Moment: false, floorsSeen: ["L1", "L2"] });
    window.history.replaceState(null, "", "/en#B1");
    const say = vi.spyOn(dialog, "say").mockResolvedValue({ status: "done", choice: null });
    mount();
    await act(async () => {});
    expect(say.mock.calls[0][0]).toMatchObject({ key: "b1-locked", text: "B1 is still locked: visit all 5 floors first (2/5)." });
    expect(window.location.hash).toBe("");
  });

  it("waits for the free explore state before the locked #B1 line, keeping the hash until then", async () => {
    getHQStore().setState({ phase: "intro", ride: { from: "L1", to: "L2", stage: "moving", t: 0 }, b1Unlocked: false, b1Moment: false, floorsSeen: ["L1"] });
    window.history.replaceState(null, "", "/en#B1");
    const say = vi.spyOn(dialog, "say").mockResolvedValue({ status: "done", choice: null });
    mount();
    await act(async () => {});
    expect(say).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("#B1");
    act(() => getHQStore().setState({ phase: "explore" }));
    await act(async () => {});
    expect(say).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("#B1");
    act(() => getHQStore().setState({ ride: null }));
    await act(async () => {});
    expect(say).toHaveBeenCalledTimes(1);
    expect(say.mock.calls[0][0]).toMatchObject({ key: "b1-locked", text: "B1 is still locked: visit all 5 floors first (1/5)." });
    expect(window.location.hash).toBe("");
  });

  it("chimes once per moment: a locale change or a ride in between does not replay it", async () => {
    const play = vi.spyOn(audio, "play").mockImplementation(() => {});
    const view = (locale: "en" | "id") => (
      <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : id}>
        <EngineUnlockLayer />
      </NextIntlClientProvider>
    );
    const { rerender } = render(view("en"));
    await act(async () => {});
    rerender(view("id"));
    await act(async () => {});
    act(() => getHQStore().setState({ ride: { from: "RF", to: "L1", stage: "moving", t: 0 } }));
    act(() => getHQStore().setState({ ride: null }));
    await act(async () => {});
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("does not chime while the dialog is paused, then chimes once when it resumes", async () => {
    const play = vi.spyOn(audio, "play").mockImplementation(() => {});
    dialog.dialog.setPaused(true);
    try {
      mount();
      await act(async () => {});
      expect(play).not.toHaveBeenCalled();
      act(() => dialog.dialog.setPaused(false));
      await act(async () => {});
      expect(play).toHaveBeenCalledTimes(1);
    } finally {
      dialog.dialog.setPaused(false);
    }
  });

  it("offers the line again after a cancel (a tutorial replay) without chiming twice", async () => {
    vi.useFakeTimers();
    try {
      const play = vi.spyOn(audio, "play").mockImplementation(() => {});
      const say = vi.spyOn(dialog, "say");
      mount();
      await act(async () => {});
      expect(say).toHaveBeenCalledTimes(1);
      expect(play).toHaveBeenCalledTimes(1);
      await act(async () => dialog.cancelDialog("b1-unlock"));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(400);
      });
      expect(say).toHaveBeenCalledTimes(2);
      expect(getHQStore().getState().b1Moment).toBe(true);
      expect(play).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("speaks the offer only after a replayed tutorial line resolves", async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(audio, "play").mockImplementation(() => {});
      const spoken: string[] = [];
      const realSay = dialog.say;
      vi.spyOn(dialog, "say").mockImplementation((input, options) => {
        spoken.push(options?.id ?? "?");
        return realSay(input, options);
      });
      dialog.dialog.setInstant(true);
      mount();
      await act(async () => {});
      expect(dialog.dialog.view.id).toBe("b1-unlock");
      let tutorial: ReturnType<typeof dialog.say> | undefined;
      await act(async () => {
        dialog.cancelAllDialogs();
        tutorial = realSay({ text: "Tutorial", choices: [{ id: "ok", label: "OK" }] }, { id: "tutorial" });
        await vi.advanceTimersByTimeAsync(1000);
      });
      expect(spoken).toEqual(["b1-unlock"]);
      expect(dialog.dialog.view.id).toBe("tutorial");
      await act(async () => {
        dialog.dialog.choose("ok");
        await tutorial;
        await vi.advanceTimersByTimeAsync(400);
      });
      expect(spoken).toEqual(["b1-unlock", "b1-unlock"]);
      expect(dialog.dialog.view.id).toBe("b1-unlock");
    } finally {
      dialog.cancelAllDialogs();
      dialog.dialog.setInstant(false);
      vi.useRealTimers();
    }
  });

  it("stops re-offering after three retries in one moment", async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(audio, "play").mockImplementation(() => {});
      const say = vi.spyOn(dialog, "say").mockResolvedValue({ status: "cancelled", choice: null });
      mount();
      for (let i = 0; i < 6; i += 1) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(400);
        });
      }
      expect(say).toHaveBeenCalledTimes(4);
      expect(getHQStore().getState().b1Moment).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("holds the locked line until the tour is settled", async () => {
    getHQStore().setState({ b1Unlocked: false, b1Moment: false, floorsSeen: ["L1"] });
    window.history.replaceState(null, "", "/en#B1");
    localStorage.clear();
    resetFlagMemory();
    const say = vi.spyOn(dialog, "say").mockResolvedValue({ status: "done", choice: null });
    mount();
    await act(async () => {});
    expect(say).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("#B1");
    act(() => markOnboarded("done"));
    await act(async () => {});
    expect(say).toHaveBeenCalledTimes(1);
  });

  it("registers Go to B1 Engine Room in Cmd-K in both states while mounted", async () => {
    vi.spyOn(dialog, "say").mockReturnValue(new Promise(() => {}));
    vi.spyOn(audio, "play").mockImplementation(() => {});
    getHQStore().setState({ b1Unlocked: false, b1Moment: false, floorsSeen: ["L1"] });
    const view = mount();
    await act(async () => {});
    expect(hudActions().map((a) => [a.id, a.label])).toEqual([["engine-room", en.engine.goTo]]);
    act(() => getHQStore().setState({ b1Unlocked: true }));
    expect(hudActions().map((a) => [a.id, a.label])).toEqual([["engine-room", en.engine.goTo]]);
    view.rerender(
      <NextIntlClientProvider locale="id" messages={id}>
        <EngineUnlockLayer />
      </NextIntlClientProvider>,
    );
    expect(hudActions().map((a) => [a.id, a.label])).toEqual([["engine-room", id.engine.goTo]]);
    view.unmount();
    expect(hudActions()).toEqual([]);
  });

  it("locked, running the Cmd-K action says the locked line with the progress and rides nowhere", async () => {
    const say = vi.spyOn(dialog, "say").mockResolvedValue({ status: "done", choice: null });
    getHQStore().setState({ b1Unlocked: false, b1Moment: false, floorsSeen: ["L1", "L2"] });
    mount();
    await act(async () => {});
    expect(say).not.toHaveBeenCalled();
    await act(async () => hudActions()[0].run());
    expect(say).toHaveBeenCalledTimes(1);
    expect(say.mock.calls[0][0]).toMatchObject({ key: "b1-locked", text: "B1 is still locked: visit all 5 floors first (2/5)." });
    expect(getHQStore().getState()).toMatchObject({ ride: null, mission: null, floor: "RF" });
  });

  it("ignores #B1 off the Lobby route: no line, the hash stays", async () => {
    getHQStore().setState({ b1Unlocked: false, b1Moment: false, floorsSeen: ["L1"] });
    window.history.replaceState(null, "", "/en/projects#B1");
    const say = vi.spyOn(dialog, "say").mockResolvedValue({ status: "done", choice: null });
    mount();
    await act(async () => {});
    expect(say).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("#B1");
  });
});

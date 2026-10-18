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
import { audio } from "@/lib/audio";
import { getHQStore } from "@/store/useHQStore";

const mount = () =>
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <EngineUnlockLayer />
    </NextIntlClientProvider>,
  );

beforeEach(() => {
  markOnboarded("done");
  getHQStore().setState({ phase: "explore", floor: "RF", ride: null, b1Unlocked: true, b1Moment: true, floorsSeen: ["L1", "L2", "L3", "L4", "RF"] });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
  getHQStore().setState({ b1Unlocked: false, b1Moment: false, floorsSeen: [] });
});

describe("EngineUnlockLayer", () => {
  it("chimes and asks once; Take me there rides to B1 and clears the moment", async () => {
    const play = vi.spyOn(audio, "play").mockImplementation(() => {});
    const say = vi.spyOn(dialog, "say").mockResolvedValue({ status: "done", choice: "go" });
    const request = vi.spyOn(getHQStore().getState(), "requestElevator");
    mount();
    await act(async () => {});
    expect(play).toHaveBeenCalledWith("chime");
    expect(say).toHaveBeenCalledTimes(1);
    const line = say.mock.calls[0][0] as { key: string; text: string; choices: { id: string; label: string }[] };
    expect(line).toMatchObject({ key: "b1-unlock", text: en.engine.unlock });
    expect(line.choices.map((c) => c.label)).toEqual([en.engine.go, en.engine.later]);
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

  it("tells a locked visitor who followed #B1 how to unlock it, and drops the hash", async () => {
    getHQStore().setState({ b1Unlocked: false, b1Moment: false, floorsSeen: ["L1", "L2"] });
    window.history.replaceState(null, "", "/en#B1");
    const say = vi.spyOn(dialog, "say").mockResolvedValue({ status: "done", choice: null });
    mount();
    await act(async () => {});
    expect(say.mock.calls[0][0]).toMatchObject({ key: "b1-locked", text: "B1 is still locked: visit all 5 floors first (2/5)." });
    expect(window.location.hash).toBe("");
  });

  it("chimes once per moment: a locale change or a ride in between does not replay it", async () => {
    const play = vi.spyOn(audio, "play").mockImplementation(() => {});
    vi.spyOn(dialog, "say").mockReturnValue(new Promise(() => {}));
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
    vi.spyOn(dialog, "say").mockReturnValue(new Promise(() => {}));
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
    const play = vi.spyOn(audio, "play").mockImplementation(() => {});
    const say = vi
      .spyOn(dialog, "say")
      .mockResolvedValueOnce({ status: "cancelled", choice: null })
      .mockReturnValue(new Promise(() => {}));
    mount();
    await act(async () => {});
    expect(say).toHaveBeenCalledTimes(2);
    expect(getHQStore().getState().b1Moment).toBe(true);
    expect(play).toHaveBeenCalledTimes(1);
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
});

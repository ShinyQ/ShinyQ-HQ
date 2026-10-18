// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import { EngineUnlockLayer } from "@/hud/dialog/EngineUnlockLayer";
import { markOnboarded } from "@/hud/dialog/storage";
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

  it("waits for the next chance when the line is cancelled, and never speaks during a ride", async () => {
    vi.spyOn(audio, "play").mockImplementation(() => {});
    const say = vi.spyOn(dialog, "say").mockResolvedValue({ status: "cancelled", choice: null });
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
});

// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import { endContinuation, setIntroTarget, takeIntroTarget } from "@/experience/introContinue";
import type { ExperienceData } from "@/experience/types";
import { OnboardingLayer } from "@/hud/dialog/OnboardingLayer";
import { markOnboarded, ONBOARDED_KEY, resetFlagMemory } from "@/hud/dialog/storage";
import { cancelAllDialogs, dialog } from "@/hud/dialog/store";
import { replayTutorial, tutorialAvailable } from "@/hud/dialog/tutorial";
import { getHQStore } from "@/store/useHQStore";

// No Highlights Hall registered: the full tour goes from the try-it step straight to the elevator.
vi.mock("@/experience/hints/source", () => ({ hintItems: () => [], extraItems: () => [] }));

const data = { profile: { name: "Kurniadi Ahmad Wijaya" } } as unknown as ExperienceData;

function renderLayer() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <OnboardingLayer data={data} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  resetFlagMemory();
  getHQStore().setState({ phase: "boot", floor: "L1", ride: null, activeRoom: null });
});

afterEach(() => {
  act(() => cancelAllDialogs());
  cleanup();
  setIntroTarget(null);
  endContinuation();
  vi.useRealTimers();
});

describe("OnboardingLayer", () => {
  it("starts the full tour 600 ms after the intro hands over in the Lobby, with the first name", () => {
    renderLayer();
    act(() => void vi.advanceTimersByTime(2000));
    expect(dialog.view.id).toBeNull();
    act(() => void getHQStore().setState({ phase: "explore" }));
    act(() => void vi.advanceTimersByTime(600));
    expect(dialog.view.id).toBe("onboarding");
    expect(dialog.view.line?.key).toBe("welcome");
    expect(dialog.view.line?.text).toContain("Kurniadi");
    expect(dialog.view.line?.text).not.toContain("Wijaya");
  });

  it("stays quiet for a visitor who finished or skipped it before", () => {
    markOnboarded("done");
    renderLayer();
    act(() => void getHQStore().setState({ phase: "explore" }));
    act(() => void vi.advanceTimersByTime(1000));
    expect(dialog.view.id).toBeNull();
  });

  it("remembers a skip", async () => {
    getHQStore().setState({ phase: "explore" });
    renderLayer();
    act(() => void vi.advanceTimersByTime(600));
    await act(async () => {
      dialog.advance();
      dialog.choose("skip");
    });
    await vi.waitFor(() => expect(dialog.view.line?.key).toBe("skipped"));
    await act(async () => {
      dialog.advance();
      dialog.advance();
    });
    await vi.waitFor(() => expect(localStorage.getItem(ONBOARDED_KEY)).toBe("skipped"));
  });

  it("waits for a deep link to arrive, then runs the short tour (no Highlights Hall, no elevator)", async () => {
    setIntroTarget({ floor: "L4" });
    renderLayer();
    act(() => void getHQStore().setState({ phase: "explore" }));
    act(() => void vi.advanceTimersByTime(1000));
    expect(dialog.view.id).toBeNull();
    act(() => {
      takeIntroTarget();
      getHQStore().setState({ floor: "L4" });
      endContinuation();
    });
    act(() => void vi.advanceTimersByTime(600));
    expect(dialog.view.line?.key).toBe("welcome");
    await act(async () => {
      dialog.advance();
      dialog.choose("start");
    });
    await vi.waitFor(() => expect(dialog.view.line?.key).toBe("move"));
    await act(async () => {
      dialog.advance();
      dialog.advance();
    });
    expect(dialog.view.line?.key).toBe("point-go");
    await act(async () => {
      const rover = getHQStore().getState().rover;
      getHQStore().getState().setRover({ x: rover.x + 3 });
    });
    await act(async () => void dialog.advance());
    await vi.waitFor(() => expect(dialog.view.line?.key).toBe("moved"));
    await act(async () => {
      dialog.advance();
      dialog.advance();
    });
    await vi.waitFor(() => expect(dialog.view.line?.key).toBe("camera"));
    await act(async () => {
      dialog.advance();
      dialog.advance();
    });
    await vi.waitFor(() => expect(dialog.view.line?.key).toBe("rover-menu"));
  });

  it("replays the full tour on request, even when onboarded", () => {
    markOnboarded("done");
    getHQStore().setState({ phase: "explore" });
    renderLayer();
    expect(tutorialAvailable()).toBe(true);
    act(() => {
      replayTutorial();
      vi.advanceTimersByTime(1);
    });
    expect(dialog.view.line?.key).toBe("welcome");
  });
});

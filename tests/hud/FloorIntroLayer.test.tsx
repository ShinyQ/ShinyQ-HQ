// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import { intents } from "@/experience/input/intents";
import type { Ride } from "@/experience/tower/elevator";
import type { ExperienceData } from "@/experience/types";
import { FloorIntroLayer } from "@/hud/dialog/FloorIntroLayer";
import { FLOOR_INTRO_KEY, markOnboarded, resetFlagMemory } from "@/hud/dialog/storage";
import { cancelAllDialogs, cancelDialog, dialog } from "@/hud/dialog/store";
import { getHQStore } from "@/store/useHQStore";

const data = { profile: { name: "Kurniadi Ahmad Wijaya" } } as unknown as ExperienceData;
const ride: Ride = { from: "L1", to: "L2", stage: "moving", t: 0 };

function renderLayer() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <FloorIntroLayer data={data} />
    </NextIntlClientProvider>,
  );
}

const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
const seenFloors = () => JSON.parse(localStorage.getItem(FLOOR_INTRO_KEY) ?? "[]") as string[];

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  resetFlagMemory();
  markOnboarded("done");
  getHQStore().setState({ phase: "explore", floor: "L2", ride: null, mission: null, activeRoom: null });
});

afterEach(() => {
  act(() => cancelAllDialogs());
  cleanup();
  vi.useRealTimers();
});

describe("FloorIntroLayer", () => {
  it("speaks the floor line 700 ms after arriving on L2 while exploring", () => {
    renderLayer();
    advance(699);
    expect(dialog.view.id).toBeNull();
    advance(1);
    expect(dialog.view.id).toBe("floor:L2");
    expect(dialog.view.line?.key).toBe("floor");
    expect(dialog.view.line?.text).toBe(en.dialog.floor.L2.replace("{name}", "Kurniadi"));
  });

  it("marks the floor seen and stays quiet when the visitor drives during the wait", () => {
    renderLayer();
    advance(300);
    act(() => intents.emit({ type: "move", x: 0, y: 1 }));
    advance(2000);
    expect(dialog.view.id).toBeNull();
    expect(seenFloors()).toEqual(["L2"]);
  });

  it("does not mark a line cancelled from elsewhere as seen", async () => {
    renderLayer();
    advance(700);
    expect(dialog.view.id).toBe("floor:L2");
    await act(async () => cancelDialog("floor:L2"));
    expect(dialog.view.id).toBeNull();
    expect(seenFloors()).toEqual([]);
  });

  it("does not speak at once on return after a floor change mid-line, only after the delay again", async () => {
    renderLayer();
    advance(700);
    expect(dialog.view.id).toBe("floor:L2");
    await act(async () => void getHQStore().setState({ floor: "L1" }));
    expect(dialog.view.id).toBeNull();
    await act(async () => void getHQStore().setState({ floor: "L2" }));
    expect(dialog.view.id).toBeNull();
    advance(699);
    expect(dialog.view.id).toBeNull();
    advance(1);
    expect(dialog.view.id).toBe("floor:L2");
    expect(seenFloors()).toEqual([]);
  });

  it("waits for a ride and a running mission to end before speaking on return", async () => {
    renderLayer();
    advance(700);
    expect(dialog.view.id).toBe("floor:L2");
    // Ride away mid-line: the line is cut, not seen.
    await act(async () => void getHQStore().setState({ ride: { ...ride, from: "L2", to: "L1" } }));
    expect(dialog.view.id).toBeNull();
    await act(async () => void getHQStore().setState({ floor: "L1", ride: null }));
    advance(2000);
    // Ride back: no line while the car moves.
    await act(async () => void getHQStore().setState({ ride, floor: "L2" }));
    advance(2000);
    expect(dialog.view.id).toBeNull();
    // A mission runs on arrival: still quiet.
    await act(async () => void getHQStore().setState({ ride: null, phase: "autopilot", mission: { id: "journey", step: 1, status: "running" } }));
    advance(2000);
    expect(dialog.view.id).toBeNull();
    await act(async () => void getHQStore().setState({ phase: "explore", mission: { id: "journey", step: 2, status: "done" } }));
    advance(699);
    expect(dialog.view.id).toBeNull();
    advance(1);
    expect(dialog.view.id).toBe("floor:L2");
    expect(seenFloors()).toEqual([]);
  });

  it("never speaks on a floor seen before, including the legacy hq:walk-prompt list", () => {
    localStorage.setItem(FLOOR_INTRO_KEY, JSON.stringify(["L2"]));
    localStorage.setItem("hq:walk-prompt", JSON.stringify(["L3"]));
    renderLayer();
    advance(2000);
    expect(dialog.view.id).toBeNull();
    act(() => void getHQStore().setState({ floor: "L3" }));
    advance(2000);
    expect(dialog.view.id).toBeNull();
  });
});

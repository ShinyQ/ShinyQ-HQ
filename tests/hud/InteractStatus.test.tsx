// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import { intents, type Intent } from "@/experience/input/intents";
import type { Interactable } from "@/experience/interact/registry";
import { InteractStatus, POINT_HINT_MS } from "@/hud/InteractStatus";
import { getHQStore } from "@/store/useHQStore";

const pod: Interactable = {
  id: "L3:door:demo",
  floor: "L3",
  kind: "door",
  label: "Demo Pod",
  at: { x: 1, z: 2 },
  bounds: { minX: 0, maxX: 2, minZ: 3, maxZ: 6 },
  height: 2.6,
  action: { type: "open-room", room: "L3:demo" },
};
let emitted: Intent[] = [];
let off: () => void = () => {};

beforeEach(() => {
  emitted = [];
  off = intents.on((intent) => {
    emitted.push(intent);
  });
  getHQStore().setState({ phase: "explore", hover: null, pointHint: false });
});

afterEach(() => {
  off();
  cleanup();
  vi.useRealTimers();
  getHQStore().setState({ hover: null, pointHint: false });
});

function mount(coarse = false) {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <InteractStatus coarse={coarse} />
    </NextIntlClientProvider>,
  );
}

describe("InteractStatus", () => {
  it("announces the hovered target and offers no Go button to a mouse", () => {
    mount();
    expect(screen.getByTestId("interact-live")).toBeEmptyDOMElement();
    act(() => getHQStore().getState().setHover({ item: pod, via: "pointer" }));
    expect(screen.getByTestId("interact-live")).toHaveTextContent("Demo Pod. Click to go there.");
    expect(screen.getByTestId("interact-live")).toHaveAttribute("aria-live", "polite");
    expect(screen.queryByTestId("interact-go")).toBeNull();
  });

  it("offers Go after a first tap; Go emits the interact intent and clears the selection", async () => {
    mount(true);
    act(() => getHQStore().getState().setHover({ item: pod, via: "tap" }));
    expect(screen.getByTestId("interact-live")).toHaveTextContent("Demo Pod selected. Tap it again or use the Go button.");
    await userEvent.click(screen.getByRole("button", { name: "Go to Demo Pod" }));
    expect(emitted).toEqual([{ type: "interact", item: pod }]);
    expect(getHQStore().getState().hover).toBeNull();
  });

  it("shows the one-time hint for the pointer type and hides it after a few seconds", () => {
    vi.useFakeTimers();
    mount(true);
    act(() => getHQStore().getState().setPointHint(true));
    expect(screen.getByTestId("point-hint")).toHaveTextContent(en.hud.interact.hintCoarse);
    act(() => vi.advanceTimersByTime(POINT_HINT_MS));
    expect(getHQStore().getState().pointHint).toBe(false);
    expect(screen.queryByTestId("point-hint")).toBeNull();
  });
});

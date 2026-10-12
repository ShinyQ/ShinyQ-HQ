// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import type { Interactable } from "@/experience/hints/source";
import { setHintTarget } from "@/experience/hints/runtime";
import { intents, type Intent } from "@/experience/input/intents";
import { HintLayer } from "@/hud/dialog/HintLayer";
import { resetFlagMemory, setHintsOn } from "@/hud/dialog/storage";
import { cancelAllDialogs, dialog } from "@/hud/dialog/store";
import { getHQStore } from "@/store/useHQStore";

const pad: Interactable = {
  id: "L1:pad:elevator",
  floor: "L1",
  kind: "elevator-pad",
  label: "Elevator",
  at: { x: -22, z: 0 },
  bounds: { minX: -23.4, maxX: -20.6, minZ: -1.4, maxZ: 1.4 },
  action: { type: "elevator-picker" },
};

function renderLayer(suppressed = false) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <HintLayer suppressed={suppressed} name="Kurniadi" />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  resetFlagMemory();
  localStorage.clear();
  dialog.setInstant(true);
  getHQStore().setState({ phase: "explore", picker: null, ride: null, beam: null, mission: null, hover: null, floor: "L1" });
});

afterEach(() => {
  act(() => {
    cancelAllDialogs();
    setHintTarget(null);
  });
  cleanup();
});

describe("HintLayer", () => {
  it("shows one bubble for the picked target, opens its line on Enter, and Go hands the target to point-and-go", async () => {
    const seen: Intent[] = [];
    const off = intents.on((intent) => seen.push(intent));
    renderLayer();
    act(() => setHintTarget({ item: pad, anchor: { x: -22, y: 3.2, z: 0 } }));
    const bubble = screen.getByTestId("hint-bubble");
    expect(bubble).toHaveAttribute("data-hint", "L1:pad:elevator");
    expect(bubble).toHaveAttribute("data-kind", "elevator-pad");
    expect(bubble).toHaveAccessibleName(en.dialog.hints.bubble.replace("{label}", "Elevator"));
    act(() => void fireEvent.keyDown(document.body, { key: "Enter" }));
    expect(dialog.view.id).toBe("hint:L1:pad:elevator");
    expect(dialog.view.line?.text).toBe(en.dialog.hints.kind["elevator-pad"]);
    expect(dialog.view.line?.choices?.[0].label).toBe(en.dialog.hints.go.pickFloor);
    expect(screen.queryByTestId("hint-bubble")).toBeNull();
    await act(async () => dialog.choose("go"));
    expect(seen).toEqual([{ type: "interact", item: pad }]);
    off();
  });

  it("Not now does nothing", async () => {
    const seen: Intent[] = [];
    const off = intents.on((intent) => seen.push(intent));
    renderLayer();
    act(() => setHintTarget({ item: pad, anchor: { x: 0, y: 0, z: 0 } }));
    act(() => void fireEvent.click(screen.getByTestId("hint-bubble")));
    await act(async () => void dialog.escape());
    expect(seen).toEqual([]);
    off();
  });

  it("hides while hints are off, during walks, outside explore and while point-and-go has a target", () => {
    const view = renderLayer(true);
    act(() => setHintTarget({ item: pad, anchor: { x: 0, y: 0, z: 0 } }));
    expect(screen.queryByTestId("hint-bubble")).toBeNull();
    view.unmount();
    renderLayer();
    act(() => setHintsOn(false));
    expect(screen.queryByTestId("hint-bubble")).toBeNull();
    act(() => setHintsOn(true));
    expect(screen.getByTestId("hint-bubble")).toBeInTheDocument();
    act(() => void getHQStore().setState({ hover: { item: pad, via: "tap" } }));
    expect(screen.queryByTestId("hint-bubble")).toBeNull();
    act(() => void getHQStore().setState({ hover: null, phase: "room" }));
    expect(screen.queryByTestId("hint-bubble")).toBeNull();
  });
});

// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import { joystick, setBoost } from "@/experience/input/joystick";
import { BoostButton } from "@/hud/BoostButton";
import { getHQStore } from "@/store/useHQStore";

function renderButton() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <BoostButton />
    </NextIntlClientProvider>,
  );
}

const button = () => screen.getByRole("button", { name: en.hud.boost });

function tap() {
  fireEvent.pointerDown(button());
  fireEvent.pointerUp(button());
  fireEvent.click(button(), { detail: 1 });
}

function expectOn(on: boolean) {
  expect(button()).toHaveAttribute("aria-pressed", on ? "true" : "false");
  expect(joystick.boost).toBe(on);
  if (on) expect(button()).toHaveAttribute("data-active", "true");
  else expect(button()).not.toHaveAttribute("data-active");
}

beforeEach(() => {
  getHQStore().setState({ floor: "L1", ride: null, phase: "explore" });
});

afterEach(() => {
  cleanup();
  setBoost(false);
});

describe("BoostButton", () => {
  it("is a toggle button with the boost label and a lit dot when on", () => {
    renderButton();
    expect(button()).toHaveAttribute("type", "button");
    expect(button()).not.toHaveAttribute("aria-hidden");
    expect(button()).toHaveAttribute("data-testid", "boost");
    expect(button()).toHaveTextContent(en.hud.boost);
    expectOn(false);
    expect(button().querySelector("[data-accent-dot='line']")).not.toBeNull();
    tap();
    expectOn(true);
    expect(button()).toHaveClass("text-cyan");
    const dot = button().querySelector("[data-accent-dot='cyan']");
    expect(dot).not.toBeNull();
    expect(dot).toHaveClass("hq-dot-glow");
  });

  it("turns on with one tap and off with the next", () => {
    renderButton();
    tap();
    expectOn(true);
    tap();
    expectOn(false);
  });

  it("toggles on pointer down, so a second finger works while the joystick is held", () => {
    renderButton();
    fireEvent.pointerDown(button());
    expectOn(true);
    fireEvent.pointerUp(button());
    expectOn(true);
  });

  it("does not toggle twice on the click that follows a pointer tap", () => {
    renderButton();
    fireEvent.pointerDown(button());
    fireEvent.click(button(), { detail: 1 });
    expectOn(true);
  });

  it("toggles from the keyboard (a click with detail 0)", () => {
    renderButton();
    fireEvent.click(button(), { detail: 0 });
    expectOn(true);
    fireEvent.click(button(), { detail: 0 });
    expectOn(false);
  });

  it("turns off when the floor changes", () => {
    renderButton();
    tap();
    expectOn(true);
    act(() => getHQStore().getState().arriveFloor("L2"));
    expectOn(false);
  });

  it("turns off when an elevator ride starts", () => {
    renderButton();
    tap();
    act(() => getHQStore().getState().setRide({ from: "L1", to: "L3", stage: "toDoor", t: 0 }));
    expectOn(false);
  });

  it("stays on through other store changes", () => {
    renderButton();
    tap();
    act(() => getHQStore().setState({ reducedMotion: true }));
    expectOn(true);
    act(() => getHQStore().setState({ reducedMotion: false }));
  });

  it("never leaves the boost on when it unmounts", () => {
    const { unmount } = renderButton();
    tap();
    expect(joystick.boost).toBe(true);
    unmount();
    expect(joystick.boost).toBe(false);
  });
});

// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setBoost } from "@/experience/input/joystick";
import { DOUBLE_TAP_MS, Joystick } from "@/hud/Joystick";
import { getHQStore } from "@/store/useHQStore";

vi.mock("@/experience/input/joystick", () => ({ setBoost: vi.fn(), setJoystick: vi.fn() }));

const stick = () => screen.getByTestId("joystick");

function tapAt(ms: number) {
  vi.setSystemTime(ms);
  fireEvent.pointerDown(stick(), { pointerId: 1 });
  fireEvent.pointerUp(stick(), { pointerId: 1 });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(setBoost).mockClear();
  getHQStore().setState({ floor: "L1", ride: null, phase: "explore" });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Joystick double-tap boost", () => {
  it("exports a 300 ms double-tap window", () => {
    expect(DOUBLE_TAP_MS).toBe(300);
  });

  it("toggles boost on with two taps 100 ms apart, and off with the next double tap", () => {
    render(<Joystick boost />);
    expect(stick()).toHaveAttribute("aria-hidden", "true");
    expect(stick()).not.toHaveAttribute("data-boost", "on");
    tapAt(10_000);
    expect(stick()).not.toHaveAttribute("data-boost", "on");
    tapAt(10_100);
    expect(stick()).toHaveAttribute("data-boost", "on");
    expect(setBoost).toHaveBeenLastCalledWith(true);
    tapAt(20_000);
    tapAt(20_100);
    expect(stick()).not.toHaveAttribute("data-boost", "on");
    expect(setBoost).toHaveBeenLastCalledWith(false);
  });

  it("does not toggle for taps 400 ms apart", () => {
    render(<Joystick boost />);
    tapAt(10_000);
    tapAt(10_400);
    expect(stick()).not.toHaveAttribute("data-boost", "on");
    expect(setBoost).not.toHaveBeenCalledWith(true);
  });

  it("never toggles without the boost prop", () => {
    render(<Joystick />);
    tapAt(10_000);
    tapAt(10_100);
    expect(stick()).not.toHaveAttribute("data-boost");
    expect(setBoost).not.toHaveBeenCalledWith(true);
  });

  it("turns boost off when the floor changes", () => {
    render(<Joystick boost />);
    tapAt(10_000);
    tapAt(10_100);
    expect(stick()).toHaveAttribute("data-boost", "on");
    act(() => getHQStore().getState().arriveFloor("L2"));
    expect(stick()).not.toHaveAttribute("data-boost", "on");
    expect(setBoost).toHaveBeenLastCalledWith(false);
  });
});

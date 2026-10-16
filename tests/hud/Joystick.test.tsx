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

/** A press held `hold` ms (and dragged `dx` px) before release. */
function pressAt(ms: number, hold: number, dx = 0) {
  vi.setSystemTime(ms);
  fireEvent.pointerDown(stick(), { pointerId: 1, clientX: 0, clientY: 0 });
  if (dx) fireEvent.pointerMove(stick(), { pointerId: 1, clientX: dx, clientY: 0 });
  vi.setSystemTime(ms + hold);
  fireEvent.pointerUp(stick(), { pointerId: 1, clientX: dx, clientY: 0 });
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

  it("counts the window from the first tap's release", () => {
    render(<Joystick boost />);
    pressAt(10_000, 200);
    tapAt(10_450);
    expect(stick()).toHaveAttribute("data-boost", "on");
  });

  it("does not toggle when a long press is followed by a quick down", () => {
    render(<Joystick boost />);
    pressAt(10_000, 400);
    tapAt(10_450);
    expect(stick()).not.toHaveAttribute("data-boost", "on");
    expect(setBoost).not.toHaveBeenCalledWith(true);
  });

  it("does not toggle when the first touch was a drag", () => {
    render(<Joystick boost />);
    pressAt(10_000, 100, 30);
    tapAt(10_200);
    expect(stick()).not.toHaveAttribute("data-boost", "on");
    expect(setBoost).not.toHaveBeenCalledWith(true);
  });

  it("the tap that completes a pair never starts the next one", () => {
    render(<Joystick boost />);
    tapAt(10_000);
    tapAt(10_100);
    tapAt(10_200);
    expect(stick()).toHaveAttribute("data-boost", "on");
    tapAt(10_300);
    expect(stick()).not.toHaveAttribute("data-boost", "on");
  });

  it("a cancelled pointer is not a tap", () => {
    render(<Joystick boost />);
    vi.setSystemTime(10_000);
    fireEvent.pointerDown(stick(), { pointerId: 1 });
    fireEvent.pointerCancel(stick(), { pointerId: 1 });
    tapAt(10_100);
    expect(stick()).not.toHaveAttribute("data-boost", "on");
  });

  it("a boost-less joystick never touches boost (a separate Boost button keeps its state)", () => {
    const { unmount } = render(<Joystick />);
    act(() => getHQStore().getState().arriveFloor("L2"));
    unmount();
    expect(setBoost).not.toHaveBeenCalled();
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

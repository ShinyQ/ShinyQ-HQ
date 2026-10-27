// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, createEvent, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setBoost, setJoystick } from "@/experience/input/joystick";
import { DOUBLE_TAP_MS, Joystick } from "@/hud/Joystick";
import { getHQStore } from "@/store/useHQStore";

vi.mock("@/experience/input/joystick", () => ({ setBoost: vi.fn(), setJoystick: vi.fn() }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

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
  vi.mocked(setJoystick).mockClear();
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

  it("times the gesture with the events' own times, so a slow frame between them does not break it", () => {
    render(<Joystick boost />);
    /** A pointer event created at `stamp` (input time) and handled at `handled` (the clock when the handler runs). */
    const at = (type: "pointerDown" | "pointerUp", stamp: number, handled: number) => {
      vi.setSystemTime(handled);
      const event = type === "pointerDown" ? createEvent.pointerDown(stick(), { pointerId: 1 }) : createEvent.pointerUp(stick(), { pointerId: 1 });
      Object.defineProperty(event, "timeStamp", { value: stamp });
      fireEvent(stick(), event);
    };
    // Input 50 ms apart, but a 400 ms frame ran before the release was handled.
    at("pointerDown", 1_000, 10_000);
    at("pointerUp", 1_050, 10_400);
    at("pointerDown", 1_170, 10_800);
    expect(stick()).toHaveAttribute("data-boost", "on");
  });

  it("a cancelled pointer is not a tap", () => {
    render(<Joystick boost />);
    vi.setSystemTime(10_000);
    fireEvent.pointerDown(stick(), { pointerId: 1 });
    fireEvent.pointerCancel(stick(), { pointerId: 1 });
    tapAt(10_100);
    expect(stick()).not.toHaveAttribute("data-boost", "on");
  });

  it("a boost-less joystick never touches boost", () => {
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

  it("turns boost off when an elevator ride starts", () => {
    render(<Joystick boost />);
    tapAt(10_000);
    tapAt(10_100);
    expect(stick()).toHaveAttribute("data-boost", "on");
    act(() => getHQStore().getState().setRide({ from: "L1", to: "L3", stage: "toDoor", t: 0 }));
    expect(stick()).not.toHaveAttribute("data-boost", "on");
    expect(setBoost).toHaveBeenLastCalledWith(false);
  });

  it("stays on through other store changes", () => {
    render(<Joystick boost />);
    tapAt(10_000);
    tapAt(10_100);
    act(() => getHQStore().setState({ reducedMotion: true }));
    expect(stick()).toHaveAttribute("data-boost", "on");
    act(() => getHQStore().setState({ reducedMotion: false }));
  });

  it("never leaves the boost on when it unmounts", () => {
    const { unmount } = render(<Joystick boost />);
    tapAt(10_000);
    tapAt(10_100);
    expect(setBoost).toHaveBeenLastCalledWith(true);
    unmount();
    expect(setBoost).toHaveBeenLastCalledWith(false);
  });
});

describe("Boost button", () => {
  const button = () => screen.getByTestId("boost");

  it("shows next to a boost joystick and not next to a plain one", () => {
    const { unmount } = render(<Joystick boost />);
    expect(button()).toHaveAccessibleName("boost");
    expect(button()).toHaveAttribute("aria-pressed", "false");
    unmount();
    render(<Joystick />);
    expect(screen.queryByTestId("boost")).toBeNull();
  });

  it("toggles boost with one tap each, sharing the joystick's state", () => {
    render(<Joystick boost />);
    fireEvent.click(button());
    expect(button()).toHaveAttribute("aria-pressed", "true");
    expect(stick()).toHaveAttribute("data-boost", "on");
    expect(setBoost).toHaveBeenLastCalledWith(true);
    tapAt(10_000);
    tapAt(10_100);
    expect(button()).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(button());
    fireEvent.click(button());
    expect(button()).toHaveAttribute("aria-pressed", "false");
    expect(setBoost).toHaveBeenLastCalledWith(false);
  });

  it("turns off with a floor change", () => {
    render(<Joystick boost />);
    fireEvent.click(button());
    act(() => getHQStore().getState().arriveFloor("L2"));
    expect(button()).toHaveAttribute("aria-pressed", "false");
  });
});

describe("Joystick stepping aside", () => {
  it("lets go of a held stick when the band steps aside", () => {
    const { rerender } = render(<Joystick boost aside={false} />);
    fireEvent.pointerDown(stick(), { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(stick(), { pointerId: 1, clientX: 40, clientY: 0 });
    expect(vi.mocked(setJoystick)).toHaveBeenLastCalledWith(expect.any(Number), expect.any(Number), true);
    expect(stick().firstElementChild).not.toHaveStyle({ transform: "translate(calc(-50% + 0px), calc(-50% + 0px))" });
    rerender(<Joystick boost aside />);
    expect(vi.mocked(setJoystick)).toHaveBeenLastCalledWith(0, 0, false);
    expect(stick().firstElementChild).toHaveStyle({ transform: "translate(calc(-50% + 0px), calc(-50% + 0px))" });
  });

  it("does nothing when nothing is held", () => {
    const { rerender } = render(<Joystick boost aside={false} />);
    rerender(<Joystick boost aside />);
    expect(setJoystick).not.toHaveBeenCalled();
  });
});

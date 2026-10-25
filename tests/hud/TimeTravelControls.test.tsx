// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STEP_MS, TimeTravelControls } from "@/components/time-travel/TimeTravelControls";

const STOPS = ["Before 2019", "2019", "2020", "2021"];

function mount() {
  document.body.innerHTML = `
    <section id="tt">
      <svg>${STOPS.map((_, i) => `<a href="#y${2019 + i}" data-tt-link="${i}"><g data-tt-stop="${i}" opacity="1"></g><rect data-tt-outline="${i}" visibility="${i === STOPS.length - 1 ? "visible" : "hidden"}"></rect></a>`).join("")}</svg>
      ${STOPS.map((s, i) => `<div data-tt-panel ${i === STOPS.length - 1 ? "" : "hidden"}>${s}</div>`).join("")}
      <div id="controls"></div>
    </section>`;
  return render(<TimeTravelControls rootId="tt" labels={{ slider: "Year", play: "Play the journey", pause: "Pause", stops: STOPS }} />, { container: document.getElementById("controls")! });
}

const visiblePanel = () => document.querySelector<HTMLElement>("[data-tt-panel]:not([hidden])")?.textContent;
const opacity = (i: number) => document.querySelector(`[data-tt-stop="${i}"]`)?.getAttribute("opacity");
const outline = (i: number) => document.querySelector(`[data-tt-outline="${i}"]`)?.getAttribute("visibility");

let animate: ReturnType<typeof vi.fn>;
beforeEach(() => {
  animate = vi.fn();
  (Element.prototype as unknown as { animate: unknown }).animate = animate;
  document.documentElement.setAttribute("data-motion", "full");
  document.documentElement.removeAttribute("data-hq-still");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("TimeTravelControls", () => {
  it("opens on the last stop with a labelled slider", () => {
    mount();
    const slider = screen.getByRole("slider", { name: "Year" });
    expect(slider).toHaveValue("3");
    expect(slider).toHaveAttribute("aria-valuetext", "2021");
    expect(visiblePanel()).toBe("2021");
  });

  it("scrubs to a stop: panels, ghosts and the outline follow", () => {
    mount();
    fireEvent.change(screen.getByRole("slider"), { target: { value: "1" } });
    expect(visiblePanel()).toBe("2019");
    expect([opacity(0), opacity(1), opacity(2), opacity(3)]).toEqual(["1", "1", "0.15", "0.15"]);
    expect([outline(1), outline(3)]).toEqual(["visible", "hidden"]);
    expect(screen.getByText("2019", { selector: "[aria-live]" })).toBeInTheDocument();
  });

  it("selects a stop when a building is clicked instead of jumping", () => {
    mount();
    const link = document.querySelector<HTMLAnchorElement>('[data-tt-link="2"]')!;
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.querySelector("g")!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(visiblePanel()).toBe("2020");
  });

  it("plays from the prologue to now, one stop per step, then offers Play again", () => {
    vi.useFakeTimers();
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Play the journey" }));
    expect(visiblePanel()).toBe("Before 2019");
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(STEP_MS));
    expect(visiblePanel()).toBe("2019");
    act(() => vi.advanceTimersByTime(STEP_MS * 2));
    expect(visiblePanel()).toBe("2021");
    expect(screen.getByRole("button", { name: "Play the journey" })).toBeInTheDocument();
  });

  it("pauses and resumes from the held stop; input stops play", () => {
    vi.useFakeTimers();
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Play the journey" }));
    act(() => vi.advanceTimersByTime(STEP_MS));
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    act(() => vi.advanceTimersByTime(STEP_MS * 3));
    expect(visiblePanel()).toBe("2019");
    fireEvent.click(screen.getByRole("button", { name: "Play the journey" }));
    act(() => vi.advanceTimersByTime(STEP_MS));
    expect(visiblePanel()).toBe("2020");
    fireEvent.change(screen.getByRole("slider"), { target: { value: "0" } });
    act(() => vi.advanceTimersByTime(STEP_MS * 3));
    expect(visiblePanel()).toBe("Before 2019");
  });

  it("animates the rise under full motion only", () => {
    mount();
    fireEvent.change(screen.getByRole("slider"), { target: { value: "1" } });
    expect(animate).toHaveBeenCalled();
    animate.mockClear();
    document.documentElement.setAttribute("data-motion", "reduced");
    fireEvent.change(screen.getByRole("slider"), { target: { value: "2" } });
    expect(animate).not.toHaveBeenCalled();
    document.documentElement.setAttribute("data-motion", "full");
    document.documentElement.setAttribute("data-hq-still", "");
    fireEvent.change(screen.getByRole("slider"), { target: { value: "0" } });
    expect(animate).not.toHaveBeenCalled();
  });

  it.each(["Home", "End", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PageUp", "PageDown"])("%s on the slider stops play even when the value cannot change", (key) => {
    vi.useFakeTimers();
    mount();
    fireEvent.change(screen.getByRole("slider"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Play the journey" }));
    expect(visiblePanel()).toBe("Before 2019");
    fireEvent.keyDown(screen.getByRole("slider"), { key });
    expect(screen.getByRole("button", { name: "Play the journey" })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(STEP_MS * 3));
    expect(visiblePanel()).toBe("Before 2019");
  });

  it("keeps playing on Tab", () => {
    vi.useFakeTimers();
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Play the journey" }));
    fireEvent.keyDown(screen.getByRole("slider"), { key: "Tab" });
    act(() => vi.advanceTimersByTime(STEP_MS));
    expect(visiblePanel()).toBe("2019");
  });

  it("stops play on a press of the slider thumb without a drag", () => {
    vi.useFakeTimers();
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Play the journey" }));
    fireEvent.pointerDown(screen.getByRole("slider"));
    act(() => vi.advanceTimersByTime(STEP_MS * 3));
    expect(visiblePanel()).toBe("Before 2019");
  });

  it("stops play when a building is clicked and holds the picked stop", () => {
    vi.useFakeTimers();
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Play the journey" }));
    fireEvent.click(document.querySelector('[data-tt-link="2"] g')!);
    expect(visiblePanel()).toBe("2020");
    act(() => vi.advanceTimersByTime(STEP_MS * 3));
    expect(visiblePanel()).toBe("2020");
    expect(screen.getByRole("button", { name: "Play the journey" })).toBeInTheDocument();
  });

  it.each([
    ["a middle click", { button: 1 }],
    ["Ctrl-click", { ctrlKey: true }],
    ["Cmd-click", { metaKey: true }],
    ["Shift-click", { shiftKey: true }],
    ["Alt-click", { altKey: true }],
  ])("leaves %s on a building to the browser", (_name, init) => {
    vi.useFakeTimers();
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Play the journey" }));
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, ...init });
    document.querySelector('[data-tt-link="2"] g')!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(visiblePanel()).toBe("Before 2019");
    act(() => vi.advanceTimersByTime(STEP_MS));
    expect(visiblePanel()).toBe("2019");
  });
});

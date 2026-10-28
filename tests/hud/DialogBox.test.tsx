// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import type { SayResult } from "@/hud/dialog/engine";
import { DialogBox, TOAST_HOLD_MS } from "@/hud/dialog/DialogBox";
import type { DialogPlacement } from "@/hud/dialog/placement";
import { cancelAllDialogs, dialog, say } from "@/hud/dialog/store";

function renderBox(placement: DialogPlacement = "bottom") {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <DialogBox placement={placement} reducedMotion />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  // jsdom has no 2D canvas; the portrait simply stays blank.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  dialog.setPaused(false);
  dialog.setInstant(true);
});

afterEach(() => {
  act(() => cancelAllDialogs());
  cleanup();
  vi.restoreAllMocks();
});

describe("DialogBox", () => {
  it("renders nothing while Rover is quiet", () => {
    renderBox();
    expect(screen.queryByTestId("dialog-box")).toBeNull();
  });

  it("shows Rover's name, the line and the A button, and a click on A advances", async () => {
    renderBox();
    let result: Promise<SayResult> = Promise.resolve({ status: "done", choice: null });
    act(() => {
      result = say({ text: "Hello there", key: "hello" }, { id: "test" });
    });
    const box = screen.getByRole("dialog", { name: en.dialog.name });
    expect(box).toHaveAttribute("data-dialog", "test");
    expect(box).toHaveAttribute("data-line", "hello");
    expect(box).toHaveAttribute("data-typing", "false");
    expect(box).toHaveTextContent("Hello there");
    act(() => fireEvent.click(screen.getByRole("button", { name: en.dialog.next })));
    await expect(result).resolves.toEqual({ status: "done", choice: null });
    expect(screen.queryByTestId("dialog-box")).toBeNull();
  });

  it("completes a typing line on the first Enter and advances on the second, without reaching the game", async () => {
    dialog.setInstant(false);
    renderBox();
    const game = vi.fn();
    window.addEventListener("keydown", game);
    let result: Promise<SayResult> = Promise.resolve({ status: "done", choice: null });
    act(() => {
      result = say("A longer line that types");
    });
    expect(screen.getByTestId("dialog-box")).toHaveAttribute("data-typing", "true");
    act(() => void fireEvent.keyDown(document.body, { key: "Enter" }));
    expect(screen.getByTestId("dialog-box")).toHaveAttribute("data-typing", "false");
    act(() => void fireEvent.keyDown(document.body, { key: "Enter" }));
    await expect(result).resolves.toMatchObject({ status: "done" });
    expect(game).not.toHaveBeenCalled();
    window.removeEventListener("keydown", game);
  });

  it("advances on a tap anywhere on the box", async () => {
    renderBox();
    let result: Promise<SayResult> = Promise.resolve({ status: "done", choice: null });
    act(() => {
      result = say("Tap me");
    });
    act(() => void fireEvent.click(screen.getByTestId("dialog-box")));
    await expect(result).resolves.toMatchObject({ status: "done" });
  });

  it("leaves Enter alone in text fields", () => {
    renderBox();
    act(() => void say("Hi"));
    const input = document.body.appendChild(document.createElement("input"));
    act(() => void fireEvent.keyDown(input, { key: "Enter" }));
    expect(screen.getByTestId("dialog-box")).toBeInTheDocument();
    input.remove();
  });

  it("focuses the first choice, moves with the arrows and resolves the clicked one", async () => {
    renderBox();
    let result: Promise<SayResult> = Promise.resolve({ status: "done", choice: null });
    act(() => {
      result = say({ text: "Pick one", choices: [{ id: "a", label: "Alpha" }, { id: "b", label: "Beta" }] });
    });
    const alpha = screen.getByRole("button", { name: "Alpha" });
    expect(alpha).toHaveFocus();
    act(() => void fireEvent.keyDown(alpha, { key: "ArrowDown" }));
    expect(screen.getByRole("button", { name: "Beta" })).toHaveFocus();
    expect(screen.queryByTestId("dialog-next")).toBeNull();
    act(() => void fireEvent.click(screen.getByRole("button", { name: "Beta" })));
    await expect(result).resolves.toEqual({ status: "done", choice: "b" });
  });

  it("never takes focus from a text field or another dialog, so typing in Cmd-K is never stolen", () => {
    const palette = document.createElement("div");
    palette.setAttribute("role", "dialog");
    palette.setAttribute("aria-modal", "true");
    const input = document.createElement("input");
    palette.append(input);
    document.body.append(palette);
    input.focus();
    renderBox();
    act(() => void say({ text: "Pick one", choices: [{ id: "a", label: "Alpha" }, { id: "b", label: "Beta" }] }));
    expect(input).toHaveFocus();
    palette.remove();
  });

  it("shows the try-it hint, then Continue after the fallback, and the skip button", async () => {
    renderBox();
    let tour: Promise<SayResult> = Promise.resolve({ status: "done", choice: null });
    act(() => {
      tour = say([{ text: "Drive", until: () => new Promise(() => {}), fallbackMs: 100 }, "Next"], { id: "tour", skip: { label: "Skip tutorial" } });
    });
    expect(screen.getByTestId("dialog-try")).toHaveTextContent(en.dialog.tryIt);
    expect(screen.queryByRole("button", { name: en.dialog.continue })).toBeNull();
    act(() => void dialog.tick(100));
    act(() => void fireEvent.click(screen.getByRole("button", { name: en.dialog.continue })));
    expect(screen.getByTestId("dialog-box")).toHaveTextContent("Next");
    act(() => void fireEvent.click(screen.getByTestId("dialog-skip")));
    await expect(tour).resolves.toEqual({ status: "skipped", choice: null });
  });

  it("hides while paused", () => {
    renderBox();
    act(() => {
      void say("Hi");
      dialog.setPaused(true);
    });
    expect(screen.queryByTestId("dialog-box")).toBeNull();
  });

  it("renders a compact three-row toast at the top on phones, clear of the joystick and Boost", () => {
    renderBox("phone");
    act(() => void say("Hi"));
    const box = screen.getByTestId("dialog-box");
    expect(box.className).toContain("portrait:top-[calc(144px");
    expect(box.className).toContain("right-3");
    expect(box.className).not.toContain("bottom-");
    expect(box).toHaveAttribute("data-expanded", "false");
    expect(box.querySelector(".line-clamp-3")).not.toBeNull();
  });

  it("expands a clamped toast on the first tap and advances on the second", async () => {
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(80);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(40);
    renderBox("phone");
    let result: Promise<SayResult> = Promise.resolve({ status: "done", choice: null });
    act(() => {
      result = say("A long line that needs more than two rows on a narrow phone screen");
    });
    const box = screen.getByTestId("dialog-box");
    act(() => void fireEvent.click(box));
    expect(box).toHaveAttribute("data-expanded", "true");
    expect(box.querySelector(".line-clamp-3")).toBeNull();
    expect(box).toBeInTheDocument();
    act(() => void fireEvent.click(box));
    await expect(result).resolves.toMatchObject({ status: "done" });
  });

  it("advances a short toast on the first tap", async () => {
    renderBox("phone");
    let result: Promise<SayResult> = Promise.resolve({ status: "done", choice: null });
    act(() => {
      result = say("Short");
    });
    act(() => void fireEvent.click(screen.getByTestId("dialog-box")));
    await expect(result).resolves.toMatchObject({ status: "done" });
  });

  describe("auto-advance", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("moves a choiceless phone toast on after the hold", async () => {
      renderBox("phone");
      let result: Promise<SayResult> = Promise.resolve({ status: "done", choice: null });
      act(() => {
        result = say("Short");
      });
      act(() => void vi.advanceTimersByTime(TOAST_HOLD_MS - 1));
      expect(screen.getByTestId("dialog-box")).toBeInTheDocument();
      act(() => void vi.advanceTimersByTime(1));
      await expect(result).resolves.toMatchObject({ status: "done" });
      expect(screen.queryByTestId("dialog-box")).toBeNull();
    });

    it("never moves a clamped line on by itself: a tap expands it and the next one advances", async () => {
      vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(80);
      vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(40);
      renderBox("phone");
      let result: Promise<SayResult> = Promise.resolve({ status: "done", choice: null });
      act(() => {
        result = say("A floor intro line that runs well past the two rows a phone toast can show");
      });
      act(() => void vi.advanceTimersByTime(TOAST_HOLD_MS * 3));
      const box = screen.getByTestId("dialog-box");
      expect(box).toHaveAttribute("data-expanded", "false");
      act(() => void fireEvent.click(box));
      expect(box).toHaveAttribute("data-expanded", "true");
      act(() => void vi.advanceTimersByTime(TOAST_HOLD_MS * 3));
      expect(screen.getByTestId("dialog-box")).toBeInTheDocument();
      act(() => void fireEvent.click(box));
      await expect(result).resolves.toMatchObject({ status: "done" });
    });

    it("still moves a line that fits in the two rows on after the hold", async () => {
      vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(40);
      vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(40);
      renderBox("phone");
      let result: Promise<SayResult> = Promise.resolve({ status: "done", choice: null });
      act(() => {
        result = say("Nice driving!");
      });
      act(() => void vi.advanceTimersByTime(TOAST_HOLD_MS));
      await expect(result).resolves.toMatchObject({ status: "done" });
      expect(screen.queryByTestId("dialog-box")).toBeNull();
    });

    it("never auto-advances on the bottom or raised placements", () => {
      for (const placement of ["bottom", "raised"] as const) {
        renderBox(placement);
        act(() => void say("Short"));
        act(() => void vi.advanceTimersByTime(TOAST_HOLD_MS * 3));
        expect(screen.getByTestId("dialog-box")).toBeInTheDocument();
        act(() => cancelAllDialogs());
        cleanup();
      }
    });

    it("waits for choices, a pending until line and an expanded toast", () => {
      vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(80);
      vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(40);
      renderBox("phone");
      act(() => void say({ text: "Pick", choices: [{ id: "a", label: "Alpha" }] }));
      act(() => void vi.advanceTimersByTime(TOAST_HOLD_MS * 2));
      expect(screen.getByTestId("dialog-box")).toHaveTextContent("Pick");
      act(() => cancelAllDialogs());
      act(() => void say({ text: "Drive", until: () => new Promise(() => {}) }));
      act(() => void vi.advanceTimersByTime(TOAST_HOLD_MS * 2));
      expect(screen.getByTestId("dialog-box")).toHaveTextContent("Drive");
      act(() => cancelAllDialogs());
      act(() => void say("Long line"));
      act(() => void fireEvent.click(screen.getByTestId("dialog-box")));
      expect(screen.getByTestId("dialog-box")).toHaveAttribute("data-expanded", "true");
      act(() => void vi.advanceTimersByTime(TOAST_HOLD_MS * 2));
      expect(screen.getByTestId("dialog-box")).toBeInTheDocument();
    });

    it("counts the hold from the end of typing", () => {
      dialog.setInstant(false);
      vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
      renderBox("phone");
      act(() => void say("Typing line"));
      act(() => void vi.advanceTimersByTime(TOAST_HOLD_MS * 2));
      expect(screen.getByTestId("dialog-box")).toHaveAttribute("data-typing", "true");
      act(() => void dialog.tick(10000));
      expect(screen.getByTestId("dialog-box")).toHaveAttribute("data-typing", "false");
      act(() => void vi.advanceTimersByTime(TOAST_HOLD_MS - 1));
      expect(screen.getByTestId("dialog-box")).toBeInTheDocument();
      act(() => void vi.advanceTimersByTime(1));
      expect(screen.queryByTestId("dialog-box")).toBeNull();
    });
  });

  describe("docked card", () => {
    const pick = { text: "Pick one", choices: [{ id: "a", label: "Alpha" }, { id: "b", label: "Beta" }] };

    it("docks a phone line with choices at the bottom and stacks the choices full width", () => {
      renderBox("phone");
      act(() => void say(pick));
      const box = screen.getByTestId("dialog-box");
      expect(box).toHaveAttribute("data-docked", "true");
      expect(box.className).toContain("bottom-[calc(12px+env(safe-area-inset-bottom))]");
      expect(box.className).not.toContain("168px");
      expect(screen.getByTestId("dialog-choices")).toHaveClass("flex-col");
      expect(screen.getByRole("button", { name: "Alpha" })).toHaveClass("w-full");
    });

    it("keeps a choiceless phone line a slim toast and a raised box undocked", () => {
      renderBox("phone");
      act(() => void say("Just a line"));
      expect(screen.getByTestId("dialog-box")).not.toHaveAttribute("data-docked");
      cleanup();
      act(() => cancelAllDialogs());
      renderBox("raised");
      act(() => void say(pick));
      expect(screen.getByTestId("dialog-box")).not.toHaveAttribute("data-docked");
      expect(screen.getByTestId("dialog-choices")).not.toHaveClass("flex-col");
    });
  });
});

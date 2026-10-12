// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import type { SayResult } from "@/hud/dialog/engine";
import { DialogBox } from "@/hud/dialog/DialogBox";
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

  it("clears the joystick, boost and elevator panel on phones", () => {
    renderBox("phone");
    act(() => void say("Hi"));
    expect(screen.getByTestId("dialog-box").className).toContain("right-[60px]");
  });
});

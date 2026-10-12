// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import { BootOverlay } from "@/hud/BootOverlay";
import { getHQStore } from "@/store/useHQStore";

const LINES = 6;
const LINE_MS = 180;

function renderOverlay() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <BootOverlay name="Kurniadi Ahmad Wijaya" monogram="KAW" />
    </NextIntlClientProvider>,
  );
}

const typeAll = () => {
  for (let i = 0; i < LINES; i++) act(() => void vi.advanceTimersByTime(LINE_MS));
};

beforeEach(() => {
  vi.useFakeTimers();
  getHQStore().setState({ phase: "boot", reducedMotion: false });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("BootOverlay", () => {
  it("has no skip and only boots once the log has typed out", () => {
    renderOverlay();
    expect(screen.queryByRole("button", { name: /skip/i })).toBeNull();
    const start = screen.getByRole("button", { name: en.hud.bootStart });
    expect(start).toHaveFocus();
    expect(start).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(start);
    expect(getHQStore().getState().phase).toBe("boot");
    typeAll();
    expect(start).not.toHaveAttribute("aria-disabled");
    fireEvent.click(start);
    expect(getHQStore().getState().phase).toBe("intro");
  });

  it("types the log at the same pace with reduced motion", () => {
    getHQStore().setState({ reducedMotion: true });
    renderOverlay();
    const start = screen.getByRole("button", { name: en.hud.bootStart });
    expect(start).toHaveAttribute("aria-disabled", "true");
    typeAll();
    expect(start).not.toHaveAttribute("aria-disabled");
  });
});

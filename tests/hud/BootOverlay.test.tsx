// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import { getProfile } from "@/content/load";
import { roleLine } from "@/content/selectors";
import { BootOverlay } from "@/hud/BootOverlay";
import { getHQStore } from "@/store/useHQStore";

const LINES = 6;
const LINE_MS = 180;
const profile = getProfile();
const who = { name: profile.name, headline: profile.headline.en, motto: profile.subheadline.en, role: roleLine(profile.currentRole, "en") };

function renderOverlay() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <BootOverlay who={who} />
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

  it("names the owner and offers a Classic site link that works without JavaScript", () => {
    renderOverlay();
    const block = screen.getByTestId("boot-who");
    for (const text of [who.name, who.headline, who.motto, who.role]) expect(block).toHaveTextContent(text);
    const link = screen.getByRole("link", { name: en.hud.pageView });
    expect(link).toHaveAttribute("href", "?view=page");
    expect(link).toHaveAttribute("data-hq-page-link");
  });
});

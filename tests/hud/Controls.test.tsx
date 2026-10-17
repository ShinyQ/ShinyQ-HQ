// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import { TopBar } from "@/hud/Controls";
import { getHQStore } from "@/store/useHQStore";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={`/en${href}`} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/hud/ask/AskPill", () => ({
  AskPill: () => (
    <button type="button" data-testid="ask-pill">
      Ask AI
    </button>
  ),
}));
vi.mock("@/lib/audio", () => ({ useAudio: () => ({ muted: false, toggleMuted: vi.fn() }) }));

const Wrap = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="en" messages={en}>
    {children}
  </NextIntlClientProvider>
);

afterEach(() => {
  cleanup();
  getHQStore().getState().setMotion("full");
  getHQStore().getState().setReducedMotion(false);
});

describe("3D top bar", () => {
  it("has no Quick view, a primary Classic site and Ask AI right after it, at the end", async () => {
    const onExit = vi.fn();
    render(
      <Wrap>
        <TopBar onExit={onExit} onToggleLang={vi.fn()} />
      </Wrap>,
    );
    expect(screen.queryByText("Quick view")).toBeNull();
    const pageView = screen.getByTestId("page-view");
    expect(pageView).toHaveTextContent(en.hud.pageView);
    expect(pageView.className).toContain("bg-cyan");
    // Owner request: a document icon on the left; the accessible name stays the label.
    const icon = pageView.firstElementChild!;
    expect(icon.tagName.toLowerCase()).toBe("svg");
    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(icon).toHaveAttribute("data-testid", "page-view-icon");
    expect(pageView).toHaveAccessibleName(en.hud.pageView);
    expect(pageView.className).toContain("gap-2");
    expect(pageView.nextElementSibling).toBe(screen.getByTestId("ask-pill"));
    const controls = within(screen.getByTestId("hud-topbar")).getAllByRole("button");
    expect(controls.at(-1)).toBe(screen.getByTestId("ask-pill"));
    expect(screen.getByRole("button", { name: en.hud.launcher.askRover })).toBeInTheDocument();
    await userEvent.click(pageView);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("Motion: a button beside Sound opens System, Full and Reduced radios; Esc closes and returns focus", async () => {
    render(
      <Wrap>
        <TopBar onExit={vi.fn()} onToggleLang={vi.fn()} />
      </Wrap>,
    );
    const trigger = screen.getByRole("button", { name: en.hud.motion.label });
    expect(trigger.parentElement!.previousElementSibling).toBe(screen.getByRole("button", { name: en.hud.sound }));
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const group = screen.getByRole("group", { name: en.hud.motion.label });
    // Full is the default on every OS (owner decision 2026-10-14).
    const full = within(group).getByRole("radio", { name: en.hud.motion.full });
    expect(full).toBeChecked();
    expect(full).toHaveFocus();
    // Native radio keys: ArrowLeft moves to System and selects it.
    await userEvent.keyboard("{ArrowLeft}");
    expect(within(group).getByRole("radio", { name: en.hud.motion.system })).toBeChecked();
    expect(getHQStore().getState().motion).toBe("system");
    expect(document.documentElement).not.toHaveAttribute("data-motion");
    await userEvent.click(within(group).getByRole("radio", { name: en.hud.motion.reduced }));
    expect(getHQStore().getState().reducedMotion).toBe(true);
    expect(document.documentElement).toHaveAttribute("data-motion", "reduced");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("group", { name: en.hud.motion.label })).toBeNull();
    expect(trigger).toHaveFocus();
    await userEvent.click(trigger);
    await userEvent.click(within(screen.getByRole("group", { name: en.hud.motion.label })).getByRole("radio", { name: en.hud.motion.full }));
    expect(getHQStore().getState().reducedMotion).toBe(false);
    expect(document.documentElement).toHaveAttribute("data-motion", "full");
    await userEvent.click(document.body);
    expect(screen.queryByTestId("motion-popover")).toBeNull();
  });
});

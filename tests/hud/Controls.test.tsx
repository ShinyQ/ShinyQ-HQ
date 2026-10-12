// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import { MobileMenu, TopBar } from "@/hud/Controls";

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

afterEach(cleanup);

describe("3D top bar", () => {
  it("has no Quick view, a primary Page view and Ask AI right after it, at the end", async () => {
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
    expect(pageView.nextElementSibling).toBe(screen.getByTestId("ask-pill"));
    const controls = within(screen.getByTestId("hud-topbar")).getAllByRole("button");
    expect(controls.at(-1)).toBe(screen.getByTestId("ask-pill"));
    expect(screen.getByRole("button", { name: en.hud.launcher.askRover })).toBeInTheDocument();
    await userEvent.click(pageView);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("phones: Page view and Ask AI get their own row; the menu holds only language and sound", async () => {
    render(
      <Wrap>
        <MobileMenu onExit={vi.fn()} onToggleLang={vi.fn()} />
      </Wrap>,
    );
    expect(screen.getByTestId("page-view").nextElementSibling).toBe(screen.getByTestId("ask-pill"));
    const menuButton = screen.getByRole("button", { name: en.hud.menu });
    await userEvent.click(menuButton);
    const menu = document.getElementById(menuButton.getAttribute("aria-controls")!)!;
    expect(within(menu).queryByText("Quick view")).toBeNull();
    expect(within(menu).queryByText(en.hud.pageView)).toBeNull();
    expect(within(menu).getByRole("group", { name: en.hud.language })).toBeInTheDocument();
    expect(within(menu).getByRole("button", { name: en.hud.sound })).toBeInTheDocument();
  });
});

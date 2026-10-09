// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import { getContent } from "@/content/load";
import { openPalette, openTerminal } from "@/hud/events";
import { buildHudIndex } from "@/hud/index-data";
import { MissionHud } from "@/hud/MissionHud";
import { RECENT_KEY } from "@/hud/recent";
import { TERMINAL_SEEN_KEY } from "@/hud/RoverTerminal";

const nav = vi.hoisted(() => ({ push: vi.fn(), pathname: "/en" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push }),
  usePathname: () => nav.pathname,
}));

const index = buildHudIndex(getContent());

function renderHud() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <MissionHud locale="en" index={index} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  nav.push.mockReset();
  nav.pathname = "/en/labs";
  localStorage.setItem(TERMINAL_SEEN_KEY, "1");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  localStorage.clear();
  sessionStorage.clear();
});

describe("MissionHud on static pages", () => {
  it("auto-opens the terminal once, on the Lobby, on the first visit", () => {
    vi.useFakeTimers();
    localStorage.clear();
    nav.pathname = "/en";
    renderHud();
    act(() => vi.advanceTimersByTime(700));
    expect(screen.getByRole("dialog", { name: "Rover Terminal" })).toBeInTheDocument();
    expect(localStorage.getItem(TERMINAL_SEEN_KEY)).toBe("1");
    cleanup();
    renderHud();
    act(() => vi.advanceTimersByTime(700));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not auto-open on deep links", () => {
    vi.useFakeTimers();
    localStorage.clear();
    renderHud();
    act(() => vi.advanceTimersByTime(700));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the palette with Ctrl+K and with /, and runs a pod result", async () => {
    renderHud();
    await userEvent.keyboard("{Control>}k{/Control}");
    expect(screen.getByRole("dialog", { name: "Command palette" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.keyboard("/");
    expect(screen.getByRole("combobox")).toHaveFocus();
    await userEvent.keyboard("voice{Enter}");
    await vi.waitFor(() => expect(nav.push).toHaveBeenCalledWith("/en/labs/voice-ai-contact-center"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("runs a mission from the terminal", async () => {
    renderHud();
    act(() => openTerminal());
    const hire = index.missions.find((m) => m.id === "hire")!;
    await userEvent.click(screen.getByRole("option", { name: hire.label.en }));
    await vi.waitFor(() => expect(nav.push).toHaveBeenCalledWith("/en/contact"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the palette filtered to pods for the projects mission", async () => {
    renderHud();
    act(() => openTerminal());
    const projects = index.missions.find((m) => m.id === "projects")!;
    await userEvent.click(screen.getByRole("option", { name: projects.label.en }));
    await vi.waitFor(() => expect(screen.getByRole("dialog", { name: "Command palette" })).toBeInTheDocument());
    expect(nav.push).toHaveBeenCalledWith("/en/labs");
    expect(screen.getByRole("button", { name: "Clear filter" })).toBeInTheDocument();
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(index.rooms.filter((r) => r.kind === "pod").length);
  });

  it("shows the rover line from a say step", async () => {
    renderHud();
    act(() => openTerminal());
    const journey = index.missions.find((m) => m.id === "journey")!;
    await userEvent.click(screen.getByRole("option", { name: journey.label.en }));
    await vi.waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("drive or swipe forward in time"));
    expect(nav.push).toHaveBeenCalledWith("/en/journey#y2019");
  });

  it("records opened rooms and lists them under Recent", async () => {
    nav.pathname = "/en/labs/fraud-review-platform";
    renderHud();
    expect(JSON.parse(localStorage.getItem(RECENT_KEY)!)).toEqual(["L3:fraud-review-platform"]);
    act(() => openPalette());
    const recent = screen.getByRole("group", { name: "Recent" });
    expect(recent).toHaveTextContent(index.rooms.find((r) => r.id === "L3:fraud-review-platform")!.title.en);
  });

  it("copies the email from the palette", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderHud();
    act(() => openPalette());
    await userEvent.keyboard("copy email{Enter}");
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(index.email));
    await vi.waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Email copied"));
  });
});

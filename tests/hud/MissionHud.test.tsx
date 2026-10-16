// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import { getContent } from "@/content/load";
import type { AskOptions, AskResult } from "@/ask/client";
import type { AskStatus } from "@/ask/protocol";
import { onHudCommand, openAsk, openPalette, openTerminal, type HudCommand } from "@/hud/events";
import { primeHudIndex } from "@/hud/index-client";
import { buildHudIndex, hudIndexVersion } from "@/hud/index-data";
import { MissionHud } from "@/hud/MissionHud";
import { registerTutorial } from "@/hud/dialog/tutorial";
import { HINTS_KEY, resetFlagMemory } from "@/hud/dialog/storage";
import { RECENT_KEY } from "@/hud/recent";
import { TERMINAL_SEEN_KEY } from "@/hud/RoverTerminal";

const nav = vi.hoisted(() => ({ push: vi.fn(), pathname: "/en" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push }),
  usePathname: () => nav.pathname,
}));

const askMock = vi.hoisted(() => ({
  status: null as AskStatus | null,
  gate: null as Promise<void> | null,
  ask: vi.fn<(options: AskOptions) => Promise<AskResult>>(),
}));
vi.mock("@/ask/status", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/ask/status")>()),
  fetchAskStatus: async () => {
    await askMock.gate;
    return askMock.status;
  },
}));
vi.mock("@/ask/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/ask/client")>()),
  askQuestion: (options: AskOptions) => askMock.ask(options),
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
  askMock.status = null;
  askMock.gate = null;
  askMock.ask.mockReset();
  nav.push.mockReset();
  nav.pathname = "/en/labs";
  localStorage.setItem(TERMINAL_SEEN_KEY, "1");
});

afterEach(() => {
  cleanup();
  primeHudIndex(null);
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute("data-hydrated");
  vi.useRealTimers();
  localStorage.clear();
  sessionStorage.clear();
});

describe("MissionHud on static pages", () => {
  it("never auto-opens the terminal over the Page View Lobby, even on the first visit", async () => {
    vi.useFakeTimers();
    localStorage.clear();
    nav.pathname = "/en";
    askMock.status = { enabled: true, turnstileSiteKey: null, asOf: "2026-10-01", maxLength: 300 };
    renderHud();
    await act(async () => vi.advanceTimersByTime(5000));
    expect(screen.queryByRole("dialog")).toBeNull();
    // Nothing opens it on its own any more (the 3D tour is the Rover dialog); the key only records an open.
    expect(localStorage.getItem(TERMINAL_SEEN_KEY)).toBeNull();
  });

  it("opens the terminal on request and marks it seen", async () => {
    localStorage.clear();
    nav.pathname = "/en";
    renderHud();
    act(() => openTerminal());
    expect(await screen.findByRole("dialog", { name: en.hud.terminal.title })).toBeInTheDocument();
    expect(localStorage.getItem(TERMINAL_SEEN_KEY)).toBe("1");
  });

  it("fetches its index after hydration instead of inlining it", async () => {
    const fetchMock = vi.fn(async () => Response.json(index));
    vi.stubGlobal("fetch", fetchMock);
    const version = hudIndexVersion(index);
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <MissionHud locale="en" indexVersion={version} />
      </NextIntlClientProvider>,
    );
    await vi.waitFor(() => expect(document.documentElement).toHaveAttribute("data-hydrated"));
    expect(fetchMock).toHaveBeenCalledWith(`/data/hud/index.json?v=${version}`);
    act(() => openPalette());
    await userEvent.keyboard("voice{Enter}");
    await vi.waitFor(() => expect(nav.push).toHaveBeenCalledWith("/en/labs/voice-ai-contact-center"));
  });

  it("does not auto-open on deep links", async () => {
    vi.useFakeTimers();
    localStorage.clear();
    renderHud();
    await act(async () => vi.advanceTimersByTime(700));
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

  it("shows a tech's projects on the Classic site Work page from Cmd-K", async () => {
    renderHud();
    await userEvent.keyboard("{Control>}k{/Control}");
    await userEvent.keyboard("show projects using fastapi{Enter}");
    await vi.waitFor(() => expect(nav.push).toHaveBeenCalledWith("/en/labs?stack=FastAPI#all-projects"));
  });

  it("picks the tech and rides to the Tech Reactor from Cmd-K in the 3D tower", async () => {
    const { getHQStore } = await import("@/store/useHQStore");
    getHQStore().getState().clearReactorTech();
    document.documentElement.dataset.hq = "3d";
    try {
      renderHud();
      await userEvent.keyboard("{Control>}k{/Control}");
      await userEvent.keyboard("show projects using fastapi{Enter}");
      await vi.waitFor(() => expect(getHQStore().getState().reactor.tech?.slug).toBe("fastapi"));
      expect(getHQStore().getState().reactor.ring).toBe("backend");
      expect(nav.push).not.toHaveBeenCalledWith(expect.stringContaining("stack="));
    } finally {
      delete document.documentElement.dataset.hq;
      getHQStore().getState().clearReactorTech();
    }
  });

  it("shows writing about a topic on the Classic site Writing page from Cmd-K", async () => {
    renderHud();
    await userEvent.keyboard("{Control>}k{/Control}");
    await userEvent.keyboard("show writing about voice ai{Enter}");
    await vi.waitFor(() => expect(nav.push).toHaveBeenCalledWith("/en/library?topic=voice-ai#topics"));
  });

  it("picks the topic and rides to the Topic Constellation from Cmd-K in the 3D tower", async () => {
    const { getHQStore } = await import("@/store/useHQStore");
    getHQStore().getState().clearTopic();
    document.documentElement.dataset.hq = "3d";
    try {
      renderHud();
      await userEvent.keyboard("{Control>}k{/Control}");
      await userEvent.keyboard("show writing about voice ai{Enter}");
      await vi.waitFor(() => expect(getHQStore().getState().topics.topic?.slug).toBe("voice-ai"));
      expect(getHQStore().getState().topics.topic).toMatchObject({ name: "Voice AI", count: 1, rooms: ["L4:making-a-voice-agent-interruptible"] });
      expect(nav.push).not.toHaveBeenCalledWith(expect.stringContaining("topic="));
    } finally {
      delete document.documentElement.dataset.hq;
      getHQStore().getState().clearTopic();
    }
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

  it("runs the journey mission as the journey page on static pages", async () => {
    renderHud();
    act(() => openTerminal());
    const journey = index.missions.find((m) => m.id === "journey")!;
    expect(journey.steps).toEqual([{ kind: "elevator", floor: "L2" }]);
    await userEvent.click(screen.getByRole("option", { name: journey.label.en }));
    await vi.waitFor(() => expect(nav.push).toHaveBeenCalledWith("/en/journey"));
  });

  it("runs the highlights mission as the landing intro on static pages", async () => {
    renderHud();
    act(() => openTerminal());
    const highlights = index.missions.find((m) => m.id === "highlights")!;
    expect(highlights.steps).toEqual([
      { kind: "elevator", floor: "L1" },
      { kind: "drive", to: "L1:highlights-about" },
      { kind: "open", room: "L1:highlights-about" },
    ]);
    await userEvent.click(screen.getByRole("option", { name: highlights.label.en }));
    await vi.waitFor(() => expect(nav.push).toHaveBeenCalledWith("/en#intro"));
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

describe("MissionHud with Ask the HQ", () => {
  const enabled: AskStatus = { enabled: true, turnstileSiteKey: null, asOf: "2026-10-01", maxLength: 300 };

  it("offers ask in the terminal only when the status says enabled", async () => {
    renderHud();
    act(() => openTerminal());
    await act(async () => {});
    expect(screen.queryByRole("option", { name: en.ask.terminal.option })).toBeNull();
    cleanup();
    askMock.status = enabled;
    renderHud();
    act(() => openTerminal());
    expect(await screen.findByRole("option", { name: en.ask.terminal.option })).toBeInTheDocument();
  });

  it("sends the palette Ask row to the Ask dock and closes the palette", async () => {
    askMock.status = enabled;
    const commands: HudCommand[] = [];
    const off = onHudCommand((command) => commands.push(command));
    renderHud();
    act(() => openPalette());
    await act(async () => {});
    await userEvent.keyboard("What are you building now?");
    expect(screen.getAllByRole("option")[0]).toHaveTextContent('Ask: "What are you building now?"');
    await userEvent.keyboard("{Enter}");
    expect(commands.at(-1)).toEqual({ type: "ask", q: "What are you building now?", source: "palette" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(askMock.ask).not.toHaveBeenCalled();
    off();
  });

  it("hands the terminal's ask option to the dock and closes the terminal", async () => {
    askMock.status = enabled;
    const commands: HudCommand[] = [];
    const off = onHudCommand((command) => commands.push(command));
    renderHud();
    act(() => openTerminal());
    await userEvent.click(await screen.findByRole("option", { name: en.ask.terminal.option }));
    expect(commands.at(-1)).toEqual({ type: "ask", source: "terminal" });
    expect(screen.queryByRole("dialog")).toBeNull();
    off();
  });

  it("closes the terminal and the palette when openAsk runs", async () => {
    renderHud();
    act(() => openTerminal());
    expect(screen.getByRole("dialog", { name: "Ask Rover" })).toBeInTheDocument();
    act(() => openAsk("How can I contact him?"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("MissionHud with the 3D HUD open", () => {
  it("offers replay and hints in Ask Rover only while the tutorial host is registered", async () => {
    resetFlagMemory();
    renderHud();
    act(() => openTerminal());
    expect(screen.queryByRole("option", { name: /replay the tutorial/ })).toBeNull();
    act(() => screen.getByRole("button", { name: en.hud.terminal.close }).click());
    const replay = vi.fn();
    let off = () => {};
    act(() => {
      off = registerTutorial(replay);
    });
    act(() => openTerminal());
    await userEvent.click(screen.getByRole("option", { name: new RegExp(en.dialog.menu.hintsOn) }));
    expect(localStorage.getItem(HINTS_KEY)).toBe("off");
    expect(screen.getByRole("option", { name: new RegExp(en.dialog.menu.hintsOff) })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("option", { name: new RegExp(en.dialog.menu.replay) }));
    expect(replay).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog", { name: en.hud.terminal.title })).toBeNull();
    act(() => off());
  });

  it("finds Replay the tutorial in Cmd-K while the 3D HUD is open", async () => {
    const replay = vi.fn();
    const off = registerTutorial(replay);
    renderHud();
    await userEvent.keyboard("{Control>}k{/Control}");
    await userEvent.keyboard("tutorial{Enter}");
    expect(replay).toHaveBeenCalledTimes(1);
    off();
  });
});

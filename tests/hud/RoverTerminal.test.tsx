// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import id from "../../messages/id.json";
import { getContent } from "@/content/load";
import type { Locale } from "@/content/schema";
import { RoverTerminal, markTerminalSeen, shouldAutoOpenTerminal, type RoverTerminalProps } from "@/hud/RoverTerminal";
import { greetingKey, orderTerminalMissions } from "@/hud/terminal";
import type { AskOptions, AskResult } from "@/ask/client";

const askMock = vi.hoisted(() => ({
  ask: vi.fn<(options: AskOptions) => Promise<AskResult>>(),
}));
vi.mock("@/ask/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/ask/client")>()),
  askQuestion: (options: AskOptions) => askMock.ask(options),
  fetchAskStatus: async () => ({ enabled: true, turnstileSiteKey: null, asOf: "2026-10-01", maxLength: 300 }),
}));

const missions = orderTerminalMissions(getContent().missions, 0);
const morning = new Date(2026, 9, 9, 8, 0);

function renderTerminal(props: Partial<RoverTerminalProps> = {}, locale: Locale = "en") {
  const onRun = vi.fn();
  const onClose = vi.fn();
  const view = render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : id}>
      <RoverTerminal open locale={locale} missions={missions} onRun={onRun} onClose={onClose} now={morning} reducedMotion {...props} />
    </NextIntlClientProvider>,
  );
  return { onRun, onClose, ...view };
}

/** Parent that owns the open state, like MissionHud. */
function Harness({ reducedMotion = true }: { reducedMotion?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <NextIntlClientProvider locale="en" messages={en}>
      <button type="button" onClick={() => setOpen(true)}>
        Missions
      </button>
      <RoverTerminal open={open} locale="en" missions={missions} onRun={() => setOpen(false)} onClose={() => setOpen(false)} now={morning} reducedMotion={reducedMotion} />
    </NextIntlClientProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  localStorage.clear();
  askMock.ask.mockReset();
});

describe("RoverTerminal", () => {
  it("renders nothing when closed", () => {
    const { container } = renderTerminal({ open: false });
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the prompt, greeting, numbered missions and drive myself", () => {
    renderTerminal();
    const dialog = screen.getByRole("dialog", { name: "Rover Terminal" });
    expect(dialog).toHaveTextContent("rover@hq:~$ ./missions");
    expect(dialog).toHaveTextContent("good morning.");
    expect(dialog).toHaveTextContent(en.hud.terminal.question);
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(missions.length + 1);
    expect(options[0]).toHaveTextContent(`[1]${missions[0].label.en}`);
    expect(options.at(-1)).toHaveTextContent(`[esc]${en.hud.terminal.driveMyself}`);
  });

  it("focuses the mission list on open", () => {
    renderTerminal();
    expect(screen.getByRole("listbox")).toHaveFocus();
  });

  it("runs a mission with its number key", async () => {
    const { onRun } = renderTerminal();
    await userEvent.keyboard("5");
    expect(onRun).toHaveBeenCalledExactlyOnceWith(missions[4].id);
  });

  it("moves with arrows and runs with Enter", async () => {
    const { onRun } = renderTerminal();
    const list = screen.getByRole("listbox");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    expect(list).toHaveAttribute("aria-activedescendant", screen.getAllByRole("option")[2].id);
    expect(screen.getAllByRole("option")[2]).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{Enter}");
    expect(onRun).toHaveBeenCalledExactlyOnceWith(missions[2].id);
  });

  it("wraps from the first option to drive myself, which closes", async () => {
    const { onRun, onClose } = renderTerminal();
    await userEvent.keyboard("{ArrowUp}{Enter}");
    expect(onClose).toHaveBeenCalledOnce();
    expect(onRun).not.toHaveBeenCalled();
  });

  it("runs a mission on tap", async () => {
    const { onRun } = renderTerminal();
    await userEvent.click(screen.getByRole("option", { name: missions[1].label.en }));
    expect(onRun).toHaveBeenCalledExactlyOnceWith(missions[1].id);
  });

  it("traps Tab between the close button and the list", async () => {
    renderTerminal();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Close terminal" })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("listbox")).toHaveFocus();
  });

  it("closes on Esc and returns focus to the opener", async () => {
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Missions" });
    await userEvent.click(opener);
    expect(screen.getByRole("listbox")).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
  });

  describe("typing effect", () => {
    beforeEach(() => vi.useFakeTimers());

    it("types at 12 ms per character, then shows everything", () => {
      renderTerminal({ reducedMotion: false });
      const typed = () => screen.getByRole("dialog").querySelector("[aria-hidden='true'].min-h-\\[60px\\]")!.textContent ?? "";
      expect(typed()).toBe("");
      act(() => vi.advanceTimersByTime(12 * 10));
      expect(typed()).toContain("rover@hq");
      expect(typed()).not.toContain(en.hud.terminal.question);
      act(() => vi.advanceTimersByTime(12 * 200));
      expect(typed()).toContain(en.hud.terminal.question);
    });

    it("keeps the full text available to screen readers while typing", () => {
      renderTerminal({ reducedMotion: false });
      expect(screen.getByRole("dialog")).toHaveTextContent(`${en.hud.terminal.greeting.morning}. ${en.hud.terminal.question}`);
    });

    it("shows the full text immediately on the second open", () => {
      vi.useRealTimers();
      const { rerender, onClose } = renderTerminal({ reducedMotion: false });
      const props = { locale: "en" as const, missions, onRun: vi.fn(), onClose, now: morning, reducedMotion: false };
      screen.getByRole("button", { name: "Close terminal" }).click();
      rerender(
        <NextIntlClientProvider locale="en" messages={en}>
          <RoverTerminal open={false} {...props} />
        </NextIntlClientProvider>,
      );
      rerender(
        <NextIntlClientProvider locale="en" messages={en}>
          <RoverTerminal open {...props} />
        </NextIntlClientProvider>,
      );
      const typed = screen.getByRole("dialog").querySelector("[aria-hidden='true'].min-h-\\[60px\\]")!.textContent;
      expect(typed).toContain(en.hud.terminal.question);
    });
  });

  it("speaks Indonesian", () => {
    renderTerminal({ now: new Date(2026, 9, 9, 20, 0) }, "id");
    const dialog = screen.getByRole("dialog", { name: "Terminal Rover" });
    expect(dialog).toHaveTextContent("selamat malam.");
    expect(dialog).toHaveTextContent(id.hud.terminal.question);
    expect(screen.getAllByRole("option").at(-1)).toHaveTextContent(id.hud.terminal.driveMyself);
  });
});

describe("RoverTerminal ask mode", () => {
  const answer = (text: string, outcome: "answer" | "decline" = "answer") =>
    askMock.ask.mockImplementation(async ({ onDelta }) => {
      onDelta(text);
      return { outcome, source: "primary", asOf: "2026-10-01" };
    });

  it("adds ask as the first option on key a, keeping missions on 1 to 8", async () => {
    const { onRun } = renderTerminal({ ask: true });
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(missions.length + 2);
    expect(options[0]).toHaveTextContent(`[a]${en.ask.terminal.option}`);
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(options[1]).toHaveTextContent(`[1]${missions[0].label.en}`);
    expect(screen.getByRole("dialog")).toHaveTextContent(en.ask.terminal.hintMenu);
    await userEvent.keyboard("5");
    expect(onRun).toHaveBeenCalledExactlyOnceWith(missions[4].id);
  });

  it("hides the ask option when the feature is off", () => {
    renderTerminal();
    expect(screen.queryByText(en.ask.terminal.option)).toBeNull();
  });

  it("asks a typed question and shows the answer as plain text", async () => {
    answer("Hello <img src=x onerror=alert(1)>");
    renderTerminal({ ask: true });
    await userEvent.keyboard("a");
    const input = screen.getByRole("textbox", { name: en.ask.terminal.label });
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute("maxLength", "300");
    await userEvent.keyboard("What now?{Enter}");
    expect(askMock.ask).toHaveBeenCalledWith(expect.objectContaining({ q: "What now?", locale: "en" }));
    const region = screen.getByTestId("ask-terminal-answer");
    await vi.waitFor(() => expect(region).toHaveTextContent("Hello <img src=x onerror=alert(1)>"));
    expect(region.querySelector("img")).toBeNull();
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(screen.getByTestId("ask-face")).toHaveTextContent("[^_^]");
    expect(region).toHaveTextContent("Answered by AI from this site, as of Oct 1, 2026");
    expect(screen.getByRole("dialog")).toHaveTextContent(en.ask.privacy);
  });

  it("asks a suggestion and shows o_o on a decline", async () => {
    answer("I can only talk about Kurniadi.", "decline");
    renderTerminal({ ask: true });
    await userEvent.click(screen.getByRole("option", { name: en.ask.terminal.option }));
    await userEvent.click(screen.getByRole("button", { name: en.ask.terminal.suggestions.ai }));
    expect(askMock.ask).toHaveBeenCalledWith(expect.objectContaining({ q: en.ask.terminal.suggestions.ai }));
    await vi.waitFor(() => expect(screen.getByTestId("ask-face")).toHaveTextContent("[o_o]"));
    expect(screen.getByTestId("ask-terminal-answer")).toHaveTextContent("I can only talk about Kurniadi.");
  });

  it("shows ... while thinking and a friendly message on errors", async () => {
    let finish: (result: AskResult) => void = () => {};
    askMock.ask.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    renderTerminal({ ask: true });
    await userEvent.keyboard("a");
    await userEvent.keyboard("hi there{Enter}");
    expect(screen.getByTestId("ask-face")).toHaveTextContent("[...]");
    await act(async () => finish({ error: "rate_limited", retryAfter: 90 }));
    expect(screen.getByTestId("ask-terminal-answer")).toHaveTextContent("Try again in 2 minutes.");
    expect(screen.getByTestId("ask-face")).toHaveTextContent("[o_o]");
  });

  it("goes back to the missions on Esc, then closes", async () => {
    const { onClose } = renderTerminal({ ask: true });
    await userEvent.keyboard("a");
    expect(screen.queryByRole("listbox")).toBeNull();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("listbox")).toHaveFocus();
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("opens straight into ask mode with a prefilled question, and Esc closes", async () => {
    answer("Building an AI HQ.");
    const { onClose } = renderTerminal({ ask: true, askRequest: { id: 1, q: "What are you building?" } });
    expect(screen.getByRole("textbox")).toHaveValue("What are you building?");
    await vi.waitFor(() => expect(screen.getByTestId("ask-terminal-answer")).toHaveTextContent("Building an AI HQ."));
    expect(askMock.ask).toHaveBeenCalledOnce();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("terminal helpers", () => {
  it("picks the greeting by hour and locale", () => {
    expect([5, 11, 12, 16, 17, 21, 22, 2].map((h) => greetingKey(h, "en"))).toEqual([
      "morning", "morning", "afternoon", "afternoon", "evening", "evening", "night", "night",
    ]);
    expect([4, 10, 11, 14, 15, 17, 18, 3].map((h) => greetingKey(h, "id"))).toEqual([
      "morning", "morning", "afternoon", "afternoon", "evening", "evening", "night", "night",
    ]);
  });

  it("leads with software and AI, alternating per visit", () => {
    const all = getContent().missions;
    expect(orderTerminalMissions(all, 0).slice(0, 2).map((m) => m.id)).toEqual(["best-swe", "best-ai"]);
    expect(orderTerminalMissions(all, 1).slice(0, 2).map((m) => m.id)).toEqual(["best-ai", "best-swe"]);
    expect(orderTerminalMissions(all, 1).map((m) => m.id).slice(2)).toEqual(["journey", "projects", "hire", "cv", "blog", "surprise"]);
    expect(orderTerminalMissions([...all, ...all.map((m) => ({ ...m, id: `${m.id}-x`, order: m.order + 10 }))], 0)).toHaveLength(8);
  });

  it("auto-opens only until the terminal was seen", () => {
    expect(shouldAutoOpenTerminal()).toBe(true);
    markTerminalSeen();
    expect(shouldAutoOpenTerminal()).toBe(false);
  });
});

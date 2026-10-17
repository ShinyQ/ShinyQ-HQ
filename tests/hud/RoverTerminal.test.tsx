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
import { RoverTerminal, markTerminalSeen, type RoverTerminalProps } from "@/hud/RoverTerminal";
import { greetingKey, orderTerminalMissions } from "@/hud/terminal";

const missions = orderTerminalMissions(getContent().missions);
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
        Rover menu
      </button>
      <RoverTerminal open={open} locale="en" missions={missions} onRun={() => setOpen(false)} onClose={() => setOpen(false)} now={morning} reducedMotion={reducedMotion} />
    </NextIntlClientProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  localStorage.clear();
});

describe("RoverTerminal", () => {
  it("renders nothing when closed", () => {
    const { container } = renderTerminal({ open: false });
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the prompt, greeting, numbered missions and drive myself", () => {
    renderTerminal();
    const dialog = screen.getByRole("dialog", { name: "Rover menu" });
    expect(dialog).toHaveTextContent("rover@hq:~$ ./rover-menu");
    expect(dialog).toHaveTextContent("good morning.");
    expect(dialog).toHaveTextContent(en.hud.terminal.question);
    const options = screen.getAllByRole("option");
    expect(options.map((o) => o.textContent?.replace(/^>/, ""))).toEqual([
      ...missions.map((m, i) => `[${i + 1}]${m.label.en}`),
      `[esc]${en.hud.terminal.driveMyself}`,
    ]);
    expect(options).toHaveLength(8);
    expect(dialog).toHaveTextContent("Pick: 1 to 7 or arrows + Enter · Close: Esc");
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

  it.each(["en", "id"] as const)("shows all nine choices and runs the ninth shortcut in %s", async (locale) => {
    const all = getContent().missions;
    const nine = orderTerminalMissions([...all, ...all.map((m) => ({ ...m, id: `${m.id}-x`, order: m.order + 10 }))]);
    const { onRun } = renderTerminal({ missions: nine }, locale);
    expect(nine).toHaveLength(9);
    expect(screen.getByRole("dialog")).toHaveTextContent(locale === "en" ? "1 to 9" : "1 hingga 9");
    await userEvent.keyboard("9");
    expect(onRun).toHaveBeenCalledExactlyOnceWith(nine[8].id);
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
    expect(screen.getByRole("button", { name: en.hud.terminal.close })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("listbox")).toHaveFocus();
  });

  it("closes on Esc and returns focus to the opener", async () => {
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Rover menu" });
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
      const lines = () => screen.getByRole("dialog").querySelector<HTMLElement>("[aria-hidden='true'].min-h-\\[60px\\]")!;
      // Visible text only: the untyped rest is rendered invisible so the sheet does not grow while typing.
      const typed = () => {
        const copy = lines().cloneNode(true) as HTMLElement;
        copy.querySelectorAll(".invisible").forEach((node) => node.remove());
        return copy.textContent ?? "";
      };
      expect(typed()).toBe("");
      expect(lines().textContent).toContain(en.hud.terminal.question);
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
      screen.getByRole("button", { name: en.hud.terminal.close }).click();
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
    const dialog = screen.getByRole("dialog", { name: "Menu Rover" });
    expect(dialog).toHaveTextContent("selamat malam.");
    expect(dialog).toHaveTextContent(id.hud.terminal.question);
    expect(screen.getAllByRole("option").at(-1)).toHaveTextContent(id.hud.terminal.driveMyself);
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

  it("lists the Rover menu in catalog order, at most 9", () => {
    const all = getContent().missions;
    expect(orderTerminalMissions(all).map((m) => m.id)).toEqual(["work", "highlights", "journey", "projects", "blog", "cv", "hire"]);
    expect(orderTerminalMissions(all).map((m) => m.label.en)).toEqual([
      "Explore my work",
      "See the highlights",
      "Follow my career, 2019 to 2026",
      "Browse my projects",
      "Read my writing",
      "View CV",
      "Discuss a role or project",
    ]);
    expect(orderTerminalMissions([...all, ...all.map((m) => ({ ...m, id: `${m.id}-x`, order: m.order + 10 }))])).toHaveLength(9);
  });

  it("records that the terminal was seen", () => {
    markTerminalSeen();
    expect(localStorage.getItem("hq:terminal-seen")).toBe("1");
  });
});

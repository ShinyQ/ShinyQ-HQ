// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import id from "../../messages/id.json";
import type { AskOptions, AskResult } from "@/ask/client";
import type { AskStatus } from "@/ask/protocol";
import { AskPanel } from "@/components/page/AskPanel";
import { askPanelHandler } from "@/hud/events";

const askMock = vi.hoisted(() => ({
  status: null as AskStatus | null,
  ask: vi.fn<(options: AskOptions) => Promise<AskResult>>(),
}));
vi.mock("@/ask/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/ask/client")>()),
  fetchAskStatus: async () => askMock.status,
  askQuestion: (options: AskOptions) => askMock.ask(options),
}));

// next-intl's Link needs the Next router; a plain anchor is enough here.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const enabled: AskStatus = { enabled: true, turnstileSiteKey: null, asOf: "2026-10-01", maxLength: 300 };

function renderPanel(locale: "en" | "id" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : id}>
      <AskPanel locale={locale} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  askMock.status = enabled;
  askMock.ask.mockReset();
});

afterEach(() => cleanup());

describe("AskPanel", () => {
  it("server-renders the shell: heading, labelled input, three suggestions and the privacy note", () => {
    renderPanel();
    expect(screen.getByRole("heading", { name: en.ask.title })).toBeInTheDocument();
    const input = screen.getByRole("textbox", { name: en.ask.label });
    expect(input).toHaveAttribute("maxLength", "300");
    expect(screen.getByRole("list", { name: en.ask.suggestionsLabel }).querySelectorAll("button")).toHaveLength(3);
    expect(screen.getByText(en.ask.privacy)).toBeInTheDocument();
    expect(askMock.ask).not.toHaveBeenCalled();
  });

  it("hides itself when the feature is unavailable", async () => {
    askMock.status = null;
    const { container } = renderPanel();
    await act(async () => screen.getByRole("textbox").focus());
    expect(container.querySelector("[data-ask-panel]")).toHaveAttribute("hidden");
    expect(askPanelHandler()?.("hi there")).toBe(false);
  });

  it("streams an answer as plain text, shows the as-of line and clears on Esc", async () => {
    askMock.ask.mockImplementation(async ({ onDelta }) => {
      onDelta("<img src=x onerror=alert(1)> ");
      onDelta("He builds AI agents.");
      return { outcome: "answer", source: "primary", asOf: "2026-10-01" };
    });
    renderPanel();
    await userEvent.click(screen.getByRole("textbox"));
    await userEvent.keyboard("What is he building now?{Enter}");
    const region = screen.getByTestId("ask-answer");
    await vi.waitFor(() => expect(region).toHaveTextContent("<img src=x onerror=alert(1)> He builds AI agents."));
    expect(region.querySelector("img")).toBeNull();
    expect(region).toHaveTextContent("Answered by AI from this site, as of Oct 1, 2026");
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("textbox")).toHaveValue("");
    expect(region).toBeEmptyDOMElement();
  });

  it("asks a suggestion and takes questions from the palette", async () => {
    askMock.ask.mockResolvedValue({ outcome: "unknown", source: "none", asOf: "2026-10-01" });
    renderPanel("id");
    await userEvent.click(screen.getByRole("button", { name: id.ask.suggestions.contact }));
    await vi.waitFor(() => expect(askMock.ask).toHaveBeenCalledWith(expect.objectContaining({ q: id.ask.suggestions.contact, locale: "id" })));
    Element.prototype.scrollIntoView = vi.fn();
    await act(async () => {
      expect(askPanelHandler()?.("Apa proyek terbarunya?")).toBe(true);
    });
    await vi.waitFor(() => expect(askMock.ask).toHaveBeenLastCalledWith(expect.objectContaining({ q: "Apa proyek terbarunya?" })));
    expect(screen.getByRole("textbox")).toHaveValue("Apa proyek terbarunya?");
  });

  it("shows the rate-limit message", async () => {
    askMock.ask.mockResolvedValue({ error: "rate_limited", retryAfter: 30 });
    renderPanel();
    await userEvent.click(screen.getByRole("button", { name: en.ask.suggestions.ai }));
    await vi.waitFor(() => expect(screen.getByTestId("ask-answer")).toHaveTextContent("Try again in 1 minute."));
  });
});

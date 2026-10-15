// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import type { AskOptions, AskResult } from "@/ask/client";
import type { AskStatus, AskTag } from "@/ask/protocol";
import { THREAD_KEY } from "@/ask/thread";
import { AskDock, TEASER_KEY } from "@/hud/ask/AskDock";
import { requestAskStatus, resetAskAvailability } from "@/hud/ask/availability";
import { openAsk } from "@/hud/events";

const askMock = vi.hoisted(() => ({
  status: null as AskStatus | null,
  ask: vi.fn<(options: AskOptions) => Promise<AskResult>>(),
}));
vi.mock("@/ask/status", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/ask/status")>()),
  fetchAskStatus: async () => askMock.status,
}));
vi.mock("@/ask/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/ask/client")>()),
  askQuestion: (options: AskOptions) => askMock.ask(options),
}));

const ENABLED: AskStatus = { enabled: true, turnstileSiteKey: null, asOf: "2026-10-11", maxLength: 300 };
const d = en.ask.dock;

function renderDock() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <main>
        <button type="button">Elsewhere</button>
      </main>
      <AskDock locale="en" />
    </NextIntlClientProvider>,
  );
}

async function ready(status: AskStatus | null = ENABLED) {
  askMock.status = status;
  renderDock();
  await act(async () => {
    await requestAskStatus();
  });
}

const answerWith = (text: string, tags: AskTag[] = ["ai", "voice"]) =>
  askMock.ask.mockImplementation(async ({ onDelta }) => {
    onDelta(text);
    return { outcome: "answer", source: "primary", asOf: "2026-10-11", tags };
  });

const dock = () => screen.findByRole("dialog", { name: d.title });

beforeEach(() => {
  askMock.ask.mockReset();
  askMock.ask.mockResolvedValue({ outcome: "answer", source: "primary", asOf: "2026-10-11" });
  sessionStorage.setItem(TEASER_KEY, "1");
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 900 });
});

afterEach(() => {
  cleanup();
  resetAskAvailability();
  sessionStorage.clear();
  vi.useRealTimers();
});

describe("Ask dock launcher", () => {
  it("stays hidden until the status says enabled", async () => {
    await ready(null);
    expect(screen.queryByTestId("ask-launcher")).toBeNull();
    cleanup();
    await ready({ ...ENABLED, enabled: false });
    expect(screen.queryByTestId("ask-launcher")).toBeNull();
    cleanup();
    await ready();
    expect(screen.getByRole("button", { name: d.launcherLabel })).toBeInTheDocument();
  });

  it("opens a non-modal side panel on desktop, focuses the input, and Esc returns focus", async () => {
    await ready();
    const launcher = screen.getByTestId("ask-launcher");
    await userEvent.click(launcher);
    const panel = await dock();
    expect(panel).toHaveAttribute("aria-modal", "false");
    expect(panel).toHaveAttribute("data-layout", "side");
    await vi.waitFor(() => expect(within(panel).getByRole("textbox", { name: d.inputLabel })).toHaveFocus());
    expect(screen.queryByTestId("ask-launcher")).toBeNull();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    await vi.waitFor(() => expect(screen.getByTestId("ask-launcher")).toHaveFocus());
  });

  it("uses a modal bottom sheet on phones", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 844 });
    await ready();
    act(() => openAsk());
    const panel = await dock();
    expect(panel).toHaveAttribute("aria-modal", "true");
    expect(panel).toHaveAttribute("data-layout", "sheet");
  });

  it("shows the teaser once per session", async () => {
    sessionStorage.removeItem(TEASER_KEY);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await ready();
    await act(async () => vi.advanceTimersByTime(7000));
    expect(screen.getByTestId("ask-teaser")).toHaveTextContent(d.teaser);
    expect(sessionStorage.getItem(TEASER_KEY)).toBe("1");
    await userEvent.click(screen.getByRole("button", { name: d.teaserDismiss }));
    expect(screen.queryByTestId("ask-teaser")).toBeNull();
  });
});

describe("Ask dock chat", () => {
  it("offers the Perspectives topic and links a cited answer to its source", async () => {
    askMock.ask.mockImplementation(async ({ onDelta }) => {
      onDelta("Kurniadi writes that he owns every merge decision.");
      return { outcome: "answer", source: "primary", asOf: "2026-10-11", tags: ["perspectives"], cite: "/contact#how" };
    });
    await ready();
    act(() => openAsk());
    const panel = await dock();
    await userEvent.click(within(within(panel).getByTestId("ask-topics")).getByRole("button", { name: en.ask.topics.perspectives }));
    const questions = within(panel).getByTestId("ask-topic-questions");
    expect(questions).toHaveAttribute("data-topic", "perspectives");
    await userEvent.click(within(questions).getByRole("button", { name: "What are his coding principles?" }));
    const link = await within(panel).findByTestId("ask-cite");
    expect(link).toHaveAttribute("href", "/en/contact#how");
    expect(link).toHaveTextContent(d.source.replace("{label}", en.ask.cite.how));
  });

  it("links an answer about how this site was built to its public repository in a new tab", async () => {
    askMock.ask.mockImplementation(async ({ onDelta }) => {
      onDelta("Kurniadi built ShinyQ HQ as a Next.js static export on Cloudflare Pages.");
      return { outcome: "answer", source: "primary", asOf: "2026-10-15", tags: ["work", "agents"], cite: "https://github.com/ShinyQ/ShinyQ-HQ" };
    });
    await ready();
    act(() => openAsk("How was this site built?"));
    const panel = await dock();
    const link = await within(panel).findByTestId("ask-cite");
    expect(link).toHaveAttribute("href", "https://github.com/ShinyQ/ShinyQ-HQ");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveTextContent(d.sourceExternal.replace("{label}", en.ask.cite.repo));
    expect(link).toHaveTextContent(d.newTab);
  });

  it("shows the contact card under a lead answer, with values from the done frame", async () => {
    const contact = { email: "kurniadiahmadwijaya@gmail.com", linkedin: "https://www.linkedin.com/in/kurniadiwijaya" };
    askMock.ask.mockImplementation(async ({ onDelta }) => {
      onDelta("Kurniadi built AI assistants with RAG, and he takes freelance or part-time engagements.");
      return { outcome: "answer", source: "primary", asOf: "2026-10-15", tags: ["contact"], contact };
    });
    await ready();
    act(() => openAsk("I need an AI chatbot for my clinic, can you help?"));
    const panel = await dock();
    const card = await within(panel).findByTestId("ask-contact");
    expect(card).toHaveAccessibleName(en.ask.contact.label);
    expect(card).toHaveTextContent(en.ask.contact.title);
    expect(within(card).getByTestId("ask-contact-email")).toHaveAttribute("href", `mailto:${contact.email}`);
    const linkedin = within(card).getByTestId("ask-contact-linkedin");
    expect(linkedin).toHaveAttribute("href", contact.linkedin);
    expect(linkedin).toHaveAttribute("target", "_blank");
    expect(linkedin).toHaveAttribute("rel", "noopener noreferrer");
    expect(within(card).getByTestId("ask-contact-page")).toHaveAttribute("href", "/en/contact");
    expect(JSON.parse(sessionStorage.getItem(THREAD_KEY) ?? "[]").at(-1).contact).toEqual(contact);
  });

  it("shows no contact card on other answers", async () => {
    answerWith("Kurniadi works at Metrodata.");
    await ready();
    act(() => openAsk("Where does he work?"));
    const panel = await dock();
    await vi.waitFor(() => expect(within(panel).getByTestId("ask-thread")).toHaveTextContent("Kurniadi works at Metrodata."));
    expect(within(panel).queryByTestId("ask-contact")).toBeNull();
  });

  it("shows no source link when the answer cites nothing", async () => {
    answerWith("The voice agent answers calls.");
    await ready();
    act(() => openAsk("How does the voice AI contact center work?"));
    const panel = await dock();
    await vi.waitFor(() => expect(within(panel).getByTestId("ask-thread")).toHaveTextContent("The voice agent answers calls."));
    expect(within(panel).queryByTestId("ask-cite")).toBeNull();
  });

  it("sends an openAsk question with its entry point and renders the answer as plain text", async () => {
    answerWith("Hello <img src=x onerror=alert(1)> there");
    await ready();
    act(() => openAsk("What is he building now?", { source: "hero" }));
    const panel = await dock();
    await vi.waitFor(() => expect(within(panel).getByTestId("ask-thread")).toHaveTextContent("Hello <img src=x onerror=alert(1)> there"));
    expect(panel.querySelector("img")).toBeNull();
    expect(askMock.ask).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ q: "What is he building now?", locale: "en", source: "hero" }));
    // The provenance line comes with the final frame, after the streamed text.
    await vi.waitFor(() => expect(within(panel).getByTestId("ask-thread")).toHaveTextContent("Answered by AI from this site, as of Oct 11, 2026"));
    expect(within(panel).getByTestId("ask-thread")).toHaveAttribute("aria-live", "polite");
  });

  it("shows the rover mark in the header and 'Rover is thinking . . .' while waiting", async () => {
    let finish: (value: AskResult) => void = () => {};
    askMock.ask.mockImplementation(() => new Promise<AskResult>((resolve) => (finish = resolve)));
    await ready();
    act(() => openAsk("What is he building now?", { source: "hero" }));
    const panel = await dock();
    const mark = within(panel).getByTestId("ask-mark");
    expect(mark.querySelector("svg[data-brand-mark]")).toHaveAttribute("aria-hidden", "true");
    const thinking = await within(panel).findByTestId("ask-thinking");
    expect(thinking).toHaveTextContent(en.ask.thinking);
    expect(en.ask.thinking).toBe("Rover is thinking . . .");
    await act(async () => finish({ outcome: "answer", source: "primary", asOf: "2026-10-11" }));
  });

  it("expands a topic, asks a pill, then offers that question's follow-ups", async () => {
    answerWith("The voice agent answers calls.");
    await ready();
    act(() => openAsk(undefined, { topic: "ai", source: "hero" }));
    const panel = await dock();
    const questions = within(panel).getByTestId("ask-topic-questions");
    expect(within(questions).getAllByRole("listitem").length).toBeGreaterThanOrEqual(4);
    await userEvent.click(within(questions).getByRole("button", { name: "How does the voice AI contact center work?" }));
    expect(askMock.ask).toHaveBeenCalledWith(expect.objectContaining({ q: "How does the voice AI contact center work?", source: "pill", chip: "ai-voice" }));
    const followUps = await within(panel).findByTestId("ask-followups");
    expect(within(followUps).getByRole("button", { name: "What latency did the voice agent reach?" })).toBeInTheDocument();
    await userEvent.click(within(followUps).getByRole("button", { name: "What latency did the voice agent reach?" }));
    expect(askMock.ask).toHaveBeenLastCalledWith(expect.objectContaining({ q: "What latency did the voice agent reach?", source: "followup" }));
  });

  it("goes back to the topics from a topic and from the follow-ups", async () => {
    answerWith("Answer.");
    await ready();
    act(() => openAsk());
    const panel = await dock();
    await userEvent.click(within(within(panel).getByTestId("ask-topics")).getByRole("button", { name: en.ask.topics.career }));
    expect(within(panel).getByTestId("ask-topic-questions")).toHaveAttribute("data-topic", "career");
    await userEvent.click(within(panel).getByRole("button", { name: d.backToTopics }));
    expect(within(panel).getByTestId("ask-topics")).toBeInTheDocument();
  });

  it("puts a pill's text into the input for editing instead of sending it", async () => {
    await ready();
    act(() => openAsk(undefined, { topic: "contact" }));
    const panel = await dock();
    await userEvent.click(within(panel).getByRole("button", { name: d.edit.replace("{q}", "How can I contact him?") }));
    const input = within(panel).getByRole("textbox", { name: d.inputLabel });
    expect(input).toHaveValue("How can I contact him?");
    expect(input).toHaveFocus();
    expect(askMock.ask).not.toHaveBeenCalled();
    await userEvent.type(input, " today{Enter}");
    expect(askMock.ask).toHaveBeenCalledWith(expect.objectContaining({ q: "How can I contact him? today", source: "dock" }));
    expect(askMock.ask.mock.calls.at(-1)?.[0]).not.toHaveProperty("chip");
  });

  it("shows the rate limit as a system message", async () => {
    askMock.ask.mockResolvedValue({ error: "rate_limited", retryAfter: 90 });
    await ready();
    act(() => openAsk("hi there"));
    const panel = await dock();
    await vi.waitFor(() => expect(within(panel).getByTestId("ask-thread")).toHaveTextContent("Try again in 2 minutes."));
  });

  it("shows the offline note and disables the input when the feature is off", async () => {
    await ready({ ...ENABLED, enabled: false });
    act(() => openAsk());
    const panel = await dock();
    expect(panel).toHaveTextContent(en.ask.error.offline);
    expect(within(panel).getByRole("textbox", { name: d.inputLabel })).toBeDisabled();
    expect(within(panel).queryByTestId("ask-pills")).toBeNull();
  });

  it("keeps the thread in sessionStorage and clears it on demand", async () => {
    answerWith("Mostly AI agents.");
    await ready();
    act(() => openAsk("What is he building now?"));
    await dock();
    await vi.waitFor(() => expect(sessionStorage.getItem(THREAD_KEY)).toContain("Mostly AI agents."));
    cleanup();
    resetAskAvailability();
    await ready();
    act(() => openAsk());
    const again = await dock();
    expect(within(again).getByTestId("ask-thread")).toHaveTextContent("Mostly AI agents.");
    await userEvent.click(within(again).getByRole("button", { name: d.clear }));
    expect(within(again).getByTestId("ask-thread")).not.toHaveTextContent("Mostly AI agents.");
    await vi.waitFor(() => expect(sessionStorage.getItem(THREAD_KEY)).toBeNull());
  });
});

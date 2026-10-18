// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import type { AskStatus } from "@/ask/protocol";
import { AskDock, TEASER_KEY } from "@/hud/ask/AskDock";
import { ASK_STATUS_CACHE_KEY, ASK_STATUS_TTL_MS, ensureAskStatus, resetAskAvailability } from "@/hud/ask/availability";
import { openAsk } from "@/hud/events";

/**
 * `GET /api/ask` runs when the dock opens. The launcher, teaser, hero bar and 3D pill need the status to
 * show at all, so the dock checks on idle, but an "enabled" answer from earlier in the tab session stands in
 * for that check: a second page view in the session sends no request until the dock opens.
 */
const status = vi.hoisted(() => ({
  value: null as AskStatus | null,
  fetch: vi.fn(),
}));
vi.mock("@/ask/status", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/ask/status")>()),
  fetchAskStatus: async () => {
    status.fetch();
    return status.value;
  },
}));

const ENABLED: AskStatus = { enabled: true, turnstileSiteKey: null, asOf: "2026-10-11", maxLength: 300 };

function renderDock() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <AskDock locale="en" />
    </NextIntlClientProvider>,
  );
}

/** Past the dock's idle delay (1.5 s after `load`; jsdom has no requestIdleCallback, so it runs then). */
const pastIdle = () => act(async () => vi.advanceTimersByTime(2000));

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  status.fetch.mockReset();
  status.value = ENABLED;
  sessionStorage.setItem(TEASER_KEY, "1");
});

afterEach(() => {
  cleanup();
  resetAskAvailability();
  sessionStorage.clear();
  vi.useRealTimers();
});

describe("Ask status on demand", () => {
  it("sends nothing on mount; the first page view of a session checks once on idle and remembers it", async () => {
    renderDock();
    await act(async () => {});
    expect(status.fetch).not.toHaveBeenCalled();
    await pastIdle();
    expect(status.fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("ask-launcher")).toBeInTheDocument();
    expect(JSON.parse(sessionStorage.getItem(ASK_STATUS_CACHE_KEY)!)).toMatchObject({ status: ENABLED });
  });

  it("a later page view in the session shows the launcher from the session and fetches only when the dock opens", async () => {
    sessionStorage.setItem(ASK_STATUS_CACHE_KEY, JSON.stringify({ at: Date.now(), status: ENABLED }));
    renderDock();
    await pastIdle();
    expect(screen.getByTestId("ask-launcher")).toBeInTheDocument();
    expect(status.fetch).not.toHaveBeenCalled();
    // The palette and the Rover menu reuse it too.
    await act(async () => {
      await ensureAskStatus();
    });
    expect(status.fetch).not.toHaveBeenCalled();
    act(() => openAsk());
    await act(async () => {});
    expect(status.fetch).toHaveBeenCalledTimes(1);
  });

  it("checks again when the remembered status is older than the TTL", async () => {
    sessionStorage.setItem(ASK_STATUS_CACHE_KEY, JSON.stringify({ at: Date.now() - ASK_STATUS_TTL_MS - 1, status: ENABLED }));
    renderDock();
    await pastIdle();
    expect(status.fetch).toHaveBeenCalledTimes(1);
  });

  it("never remembers an unavailable status, so the next page view asks again", async () => {
    status.value = null;
    sessionStorage.setItem(ASK_STATUS_CACHE_KEY, JSON.stringify({ at: Date.now() - ASK_STATUS_TTL_MS - 1, status: ENABLED }));
    renderDock();
    await pastIdle();
    expect(status.fetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("ask-launcher")).toBeNull();
    expect(sessionStorage.getItem(ASK_STATUS_CACHE_KEY)).toBeNull();
  });
});

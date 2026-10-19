// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import { getContent } from "@/content/load";
import { openPalette, openTerminal } from "@/hud/events";
import { primeHudIndex } from "@/hud/index-client";
import { buildHudIndex, hudIndexVersion } from "@/hud/index-data";
import { HudLaunchers } from "@/hud/HudLaunchers";
import { MissionHud } from "@/hud/MissionHud";
import { TERMINAL_SEEN_KEY } from "@/hud/terminal";

/**
 * The palette (with search.ts) and the Rover Terminal are lazy chunks: MissionHud imports them on the
 * first open, not on mount. Each mock factory runs when its module is first imported, so the counters
 * prove when the chunk loads; the gates hold the import open to test a slow network.
 */
const chunks = vi.hoisted(() => ({
  palette: 0,
  terminal: 0,
  search: 0,
  paletteGate: null as Promise<void> | null,
  push: vi.fn(),
}));
vi.mock("@/hud/PaletteHost", async (importOriginal) => {
  chunks.palette += 1;
  await chunks.paletteGate;
  return importOriginal();
});
vi.mock("@/hud/RoverTerminal", async (importOriginal) => {
  chunks.terminal += 1;
  return importOriginal();
});
vi.mock("@/hud/search", async (importOriginal) => {
  chunks.search += 1;
  return importOriginal();
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: chunks.push }),
  usePathname: () => "/en/labs",
}));
vi.mock("@/ask/status", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/ask/status")>()),
  fetchAskStatus: async () => null,
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
  localStorage.setItem(TERMINAL_SEEN_KEY, "1");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  primeHudIndex(null);
  localStorage.clear();
});

describe("MissionHud lazy chunks", () => {
  it("imports the terminal only on the first open", async () => {
    renderHud();
    await act(async () => {});
    expect(chunks.terminal).toBe(0);
    act(() => openTerminal());
    expect(await screen.findByRole("dialog", { name: en.hud.terminal.title })).toBeInTheDocument();
    expect(chunks.terminal).toBe(1);
  });

  it("imports the palette and its search only on the first open, and keeps keys typed while it loads", async () => {
    let release = () => {};
    chunks.paletteGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    renderHud();
    await act(async () => {});
    expect(chunks.palette).toBe(0);
    expect(chunks.search).toBe(0);

    // Another key handler (the 3D drive and language keys) registered after the HUD never sees them.
    const other = vi.fn();
    window.addEventListener("keydown", other);
    // Ctrl+K, then typing before the chunk has arrived (a slow network): the keys wait for the input.
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));
    });
    await vi.waitFor(() => expect(chunks.palette).toBe(1));
    expect(screen.queryByRole("dialog")).toBeNull();
    for (const key of ["v", "o", "x", "Backspace", "i"]) {
      act(() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
      });
    }
    expect(other.mock.calls.map(([e]) => (e as KeyboardEvent).key)).toEqual(["k"]);
    window.removeEventListener("keydown", other);
    await act(async () => release());
    const input = await screen.findByRole("combobox");
    expect(input).toHaveFocus();
    expect(input).toHaveValue("voi");
    expect(chunks.search).toBe(1);

    // Later opens mount at once, with an empty query.
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => openPalette());
    expect(screen.getByRole("combobox")).toHaveValue("");
    expect(chunks.palette).toBe(1);
  });

  it("runs the top result for an Enter typed while the chunk loads", async () => {
    let release = () => {};
    chunks.paletteGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.resetModules();
    const { MissionHud: FreshHud } = await import("@/hud/MissionHud");
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <FreshHud locale="en" index={index} />
      </NextIntlClientProvider>,
    );
    act(() => openPalette());
    for (const key of [..."voice", "Enter"]) {
      act(() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
      });
    }
    await act(async () => release());
    await vi.waitFor(() => expect(chunks.push).toHaveBeenCalledWith("/en/labs/voice-ai-contact-center"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("MissionHud before the HUD index has loaded", () => {
  const version = hudIndexVersion(index);
  /** A fetch for the index that answers only when released (a slow network). */
  function slowIndex() {
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetchMock = vi.fn(async () => {
      await gate;
      return Response.json(index);
    });
    vi.stubGlobal("fetch", fetchMock);
    return { fetchMock, release: () => act(async () => release()) };
  }
  function renderLoading() {
    return render(
      <NextIntlClientProvider locale="en" messages={en}>
        <HudLaunchers />
        <MissionHud locale="en" indexVersion={version} />
      </NextIntlClientProvider>,
    );
  }

  it("the palette shows no 'No results' and keeps an Enter until the index arrives, then runs the first result", async () => {
    const { release } = slowIndex();
    chunks.push.mockReset();
    renderLoading();
    act(() => openPalette());
    const input = await screen.findByRole("combobox");
    await userEvent.type(input, "voice");
    expect(input).toHaveValue("voice");
    expect(screen.queryByText(/No results/)).toBeNull();
    await userEvent.keyboard("{Enter}");
    expect(chunks.push).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Command palette" })).toBeInTheDocument();
    await release();
    await vi.waitFor(() => expect(chunks.push).toHaveBeenCalledWith("/en/labs/voice-ai-contact-center"));
    expect(chunks.push).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("the Rover menu waits for the index instead of opening without missions", async () => {
    const { release } = slowIndex();
    renderLoading();
    act(() => openTerminal());
    await act(async () => {});
    await vi.waitFor(() => expect(chunks.terminal).toBeGreaterThan(0));
    await act(async () => {});
    expect(screen.queryByRole("dialog", { name: en.hud.terminal.title })).toBeNull();
    await release();
    const menu = await screen.findByRole("dialog", { name: en.hud.terminal.title });
    // Eight entries: the missions plus "Explore on my own".
    expect(menu.querySelectorAll("[role='option']")).toHaveLength(8);
  });

  it("hovering a launcher starts the index download with the chunk", () => {
    vi.useFakeTimers();
    const { fetchMock } = slowIndex();
    renderLoading();
    // The idle load has not run yet (its timer is held).
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.pointerEnter(screen.getByRole("button", { name: /open search/ }));
    expect(fetchMock).toHaveBeenCalledWith(`/data/hud/index.json?v=${version}`);
  });
});


// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import { buildEngineRoomViews, buildRoomViews } from "@/content/room-views";
import { primeEngineViews, primeRoomViews } from "@/hud/drawer/data";
import { DrawerHost } from "@/hud/drawer/DrawerHost";
import { getHQStore } from "@/store/useHQStore";

vi.mock("@/lib/audio", () => ({ audio: { play: vi.fn() } }));
// next-intl's Link needs the Next router; a plain anchor is enough here.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

/**
 * Esc closes the open room from the moment the store opens it (issue #150): before the room data has
 * loaded (the "Loading" card) and before the Glass Drawer has mounted its own key handler.
 */
function renderHost() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <DrawerHost locale="en" />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  // Room data never arrives in these tests, so the host stays on its loading card.
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  getHQStore().setState({ phase: "explore", activeRoom: null });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DrawerHost", () => {
  it("closes a room on Escape while its data is still loading", () => {
    renderHost();
    act(() => getHQStore().getState().openRoom("L1:visits"));
    expect(screen.getByTestId("room-drawer-status")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(getHQStore().getState().activeRoom).toBeNull();
    expect(getHQStore().getState().phase).toBe("explore");
  });

  it("closes a room on Escape pressed right after the store opened it, before React re-rendered", () => {
    renderHost();
    getHQStore().getState().openRoom("L1:visits");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(getHQStore().getState().activeRoom).toBeNull();
  });

  it("leaves the room open when another modal owns the keyboard or the key was already handled", () => {
    renderHost();
    act(() => getHQStore().getState().openRoom("L1:visits"));
    const other = document.createElement("div");
    other.setAttribute("role", "dialog");
    other.setAttribute("aria-modal", "true");
    document.body.appendChild(other);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(getHQStore().getState().activeRoom).toBe("L1:visits");
    other.remove();

    const handled = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
    handled.preventDefault();
    window.dispatchEvent(handled);
    expect(getHQStore().getState().activeRoom).toBe("L1:visits");
  });

  it("does nothing on Escape when no room is open", () => {
    renderHost();
    getHQStore().setState({ phase: "explore", activeRoom: null });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(getHQStore().getState().phase).toBe("explore");
  });
});

describe("DrawerHost B1 data", () => {
  const shared = buildRoomViews("en");
  const engine = buildEngineRoomViews("en");
  const requested: string[] = [];

  beforeEach(() => {
    requested.length = 0;
    primeRoomViews("en", null);
    primeEngineViews("en", null);
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        requested.push(url);
        return Promise.resolve({ ok: true, json: () => Promise.resolve(url.includes("/b1-") ? engine : shared) });
      }),
    );
    getHQStore().setState({ phase: "explore", activeRoom: null, b1Unlocked: false });
  });

  afterEach(() => {
    primeRoomViews("en", null);
    primeEngineViews("en", null);
    getHQStore().setState({ b1Unlocked: false });
  });

  it("never requests the B1 file in a locked session, even after a room opens", async () => {
    renderHost();
    act(() => getHQStore().getState().openRoom("L1:visits"));
    await screen.findByTestId("room-drawer");
    expect(requested.filter((url) => url.startsWith("/data/rooms/"))).toEqual(["/data/rooms/en.json"]);
  });

  it("opens a B1 station from the separate file, merged over the shared views", async () => {
    getHQStore().setState({ b1Unlocked: true });
    renderHost();
    act(() => getHQStore().getState().openRoom("B1:timeline"));
    const drawer = await screen.findByTestId("room-drawer");
    await vi.waitFor(() => expect(drawer.querySelector("[data-engine-station='timeline']")).not.toBeNull());
    expect(requested.filter((url) => url.startsWith("/data/rooms/")).sort()).toEqual(["/data/rooms/b1-en.json", "/data/rooms/en.json"]);
  });
});

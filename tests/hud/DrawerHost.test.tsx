// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import { buildFloorRoomViews } from "@/content/room-views";
import { markFirstFrame, resetFirstFrame } from "@/experience/boot-signals";
import { setRoomDataVersions } from "@/hud/drawer/data";
import { primeFloorViews } from "../helpers/room-data";
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

describe("DrawerHost room data per floor", () => {
  const requested: string[] = [];
  const rooms = () => requested.filter((url) => url.startsWith("/data/rooms/"));
  const FLOORS = ["L1", "L2", "L3", "L4", "RF", "B1"] as const;
  const clear = () => {
    for (const floor of FLOORS) primeFloorViews("en", floor, null);
  };

  beforeEach(() => {
    requested.length = 0;
    clear();
    resetFirstFrame();
    setRoomDataVersions("en", { L1: "v1", L2: "v2", L3: "v3", L4: "v4", RF: "vf", B1: "vb" });
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        requested.push(url);
        const floor = (url.includes("/b1-") ? "B1" : /-(\w\w)\.json/.exec(url)![1]) as (typeof FLOORS)[number];
        return Promise.resolve({ ok: true, json: () => Promise.resolve(buildFloorRoomViews("en", floor)) });
      }),
    );
    getHQStore().setState({ phase: "explore", activeRoom: null, b1Unlocked: false, floor: "L1", ride: null });
  });

  afterEach(() => {
    clear();
    resetFirstFrame();
    getHQStore().setState({ b1Unlocked: false, floor: "L1", ride: null });
  });

  it("opens a room from its floor's file only, and never the B1 file in a locked session", async () => {
    renderHost();
    act(() => getHQStore().getState().openRoom("L1:visits"));
    await screen.findByTestId("room-drawer");
    expect(rooms()).toEqual(["/data/rooms/en-L1.json?v=v1"]);
  });

  it("opens a deep-linked room on another floor from that floor's file", async () => {
    renderHost();
    act(() => getHQStore().getState().openRoom("L3:reactor"));
    await screen.findByTestId("room-drawer");
    expect(rooms()).toEqual(["/data/rooms/en-L3.json?v=v3"]);
  });

  // The station body is the lazy B1 floor chunk (React reveals a Suspense boundary after about 300 ms): its first,
  // cold import takes 0.3 to 1.2 s under a parallel suite, past vi.waitFor's 1 s default.
  it("opens a B1 station from the separate file alone", { timeout: 15_000 }, async () => {
    getHQStore().setState({ b1Unlocked: true, floor: "B1" });
    renderHost();
    act(() => getHQStore().getState().openRoom("B1:timeline"));
    const drawer = await screen.findByTestId("room-drawer");
    await vi.waitFor(() => expect(drawer.querySelector("[data-engine-station='timeline']")).not.toBeNull(), { timeout: 10_000 });
    expect(rooms()).toEqual(["/data/rooms/b1-en.json?v=vb"]);
  });

  it("prefetches only the rover's floor on idle, then a ride target when the rover heads there", async () => {
    renderHost();
    expect(rooms()).toEqual([]);
    act(() => markFirstFrame());
    await vi.waitFor(() => expect(rooms()).toEqual(["/data/rooms/en-L1.json?v=v1"]));
    act(() => getHQStore().setState({ ride: { from: "L1", to: "L4" } as never }));
    await vi.waitFor(() => expect(rooms()).toEqual(["/data/rooms/en-L1.json?v=v1", "/data/rooms/en-L4.json?v=v4"]));
    act(() => getHQStore().setState({ ride: null, floor: "L4" }));
    // A room on a prefetched floor opens without another request.
    act(() => getHQStore().getState().openRoom("L4:research"));
    await screen.findByTestId("room-drawer");
    expect(rooms()).toHaveLength(2);
  });

  it("adds the B1 file on idle once B1 is unlocked, after the rover's floor", async () => {
    getHQStore().setState({ b1Unlocked: true });
    renderHost();
    act(() => markFirstFrame());
    await vi.waitFor(() => expect(rooms()).toEqual(["/data/rooms/en-L1.json?v=v1", "/data/rooms/b1-en.json?v=vb"]));
  });
});

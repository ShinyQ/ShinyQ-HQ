// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
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

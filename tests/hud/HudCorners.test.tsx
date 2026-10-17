// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import { buildExperienceData } from "@/content/experience";
import { buildFloorLayouts } from "@/experience/config";
import { minimapPref } from "@/hud/minimap/pref";
import { Hud } from "@/hud/Hud";
import { intents } from "@/experience/input/intents";
import { getHQStore } from "@/store/useHQStore";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={`/en${href}`} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/hud/ask/AskPill", () => ({
  AskPill: ({ compact }: { compact?: boolean }) => (
    <button type="button" data-testid="ask-pill" data-compact={compact ? "true" : "false"}>
      Ask AI
    </button>
  ),
}));
vi.mock("@/lib/audio", () => ({
  useAudio: () => ({ muted: false, toggleMuted: vi.fn() }),
  audio: { isMuted: () => false, subscribe: () => () => {}, getSettings: () => ({ effects: true, music: true, musicVolume: 0.5, ambience: true }) },
}));
vi.mock("@/hud/dialog/DialogLayer", () => ({ default: () => null }));
vi.mock("@/hud/dialog/FloorIntroLayer", () => ({ FloorIntroLayer: () => null }));
vi.mock("@/hud/dialog/OnboardingLayer", () => ({ OnboardingLayer: () => null }));
vi.mock("@/hud/dialog/HintLayer", () => ({ HintLayer: () => null }));
vi.mock("@/hud/drawer/DrawerHost", () => ({ DrawerHost: () => null }));

const data = buildExperienceData("en", en.floors);
const layouts = buildFloorLayouts(data.years.length);

function mount() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <Hud data={data} layouts={layouts} onExit={vi.fn()} onToggleLang={vi.fn()} />
    </NextIntlClientProvider>,
  );
}

function device(viewport: "mobile" | "tablet" | "desktop", coarse: boolean) {
  const s = getHQStore().getState();
  getHQStore().setState({ phase: "explore", floor: "L1", ride: null, device: { ...s.device, viewport, coarse } });
}

const onboardTargets = (name: string) => document.querySelectorAll(`[data-testid='hud'] [data-onboard='${name}']`);

beforeEach(() => {
  minimapPref.set("on");
  device("desktop", false);
});

afterEach(() => {
  cleanup();
});

describe("Hud composition", () => {
  it("desktop keeps the profile card, the top bar and the elevator rail, with the minimap and the settings gear above the view controls", () => {
    mount();
    expect(screen.getByRole("region", { name: en.hud.profile })).toBeInTheDocument();
    expect(screen.getByTestId("elevator-panel")).toBeInTheDocument();
    expect(within(screen.getByTestId("hud-topbar")).getByTestId("page-view")).toBeInTheDocument();
    expect(screen.queryByTestId("floor-chip")).toBeNull();
    expect(screen.queryByTestId("hud-menu")).toBeNull();
    const corner = screen.getByTestId("hud-corner");
    const minimap = within(corner).getByTestId("minimap");
    const gear = within(corner).getByTestId("settings-open");
    const view = within(corner).getByTestId("view-controls");
    expect(minimap.compareDocumentPosition(gear) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(gear.compareDocumentPosition(view) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(minimap).toHaveClass("size-24");
    expect(screen.getAllByTestId("minimap")).toHaveLength(1);
    expect(within(view).getAllByRole("button")).toHaveLength(3);
    expect(screen.getByTestId("hud-bottom")).toContainElement(corner);
    expect(screen.queryByTestId("joystick")).toBeNull();
    expect(document.documentElement.dataset.hqHud).toBe("desktop");
    for (const name of ["elevator", "view", "ask-rover"]) expect(onboardTargets(name)).toHaveLength(1);
  });

  it("phones get the Corners HUD: floor chip, compact Ask AI and the menu, the boost joystick and one reset button", () => {
    device("mobile", true);
    mount();
    expect(screen.queryByRole("region", { name: en.hud.profile })).toBeNull();
    expect(screen.queryByTestId("elevator-panel")).toBeNull();
    expect(screen.queryByTestId("boost")).toBeNull();
    expect(screen.queryByTestId("settings-open")).toBeNull();
    expect(screen.queryByTestId("page-view")).toBeNull();
    expect(screen.getByTestId("floor-chip")).not.toHaveTextContent("Lobby");
    const bar = screen.getByTestId("hud-topbar");
    expect(within(bar).getAllByRole("button").map((b) => b.dataset.testid)).toEqual(["ask-pill", "hud-menu"]);
    expect(within(bar).getByTestId("ask-pill")).toHaveAttribute("data-compact", "true");
    expect(screen.getByTestId("joystick")).toHaveAttribute("data-boost", "off");
    expect(within(screen.getByTestId("view-controls")).getAllByRole("button")).toHaveLength(1);
    expect(document.documentElement.dataset.hqHud).toBe("phone");
    for (const name of ["elevator", "view", "ask-rover"]) expect(onboardTargets(name)).toHaveLength(1);
    expect(onboardTargets("ask-rover")[0]).toBe(screen.getByTestId("hud-menu"));
    const place = screen.getByTestId("hud-minimap");
    expect(place).toHaveClass("top-[64px]", "right-3");
    expect(within(place).getByTestId("minimap")).toHaveClass("size-[72px]");
    expect(screen.getAllByTestId("minimap")).toHaveLength(1);
  });

  it("phones hide the minimap while a room sheet is open, tablets keep it; N still opens the overview", async () => {
    device("mobile", true);
    mount();
    act(() => getHQStore().setState({ phase: "room" }));
    expect(screen.queryByTestId("minimap")).toBeNull();
    act(() => intents.emit({ type: "toggle", what: "map" }));
    expect((await screen.findByTestId("map-overview"))).toBeInTheDocument();
    act(() => intents.emit({ type: "toggle", what: "map" }));
    act(() => device("tablet", true));
    act(() => getHQStore().setState({ phase: "room" }));
    expect(screen.getByTestId("minimap")).toHaveClass("size-28");
    expect(screen.getByTestId("hud-minimap")).toHaveClass("top-[76px]", "right-4");
  });

  it("the L2 year chip sits clear of the floor chip and the minimap", () => {
    device("mobile", true);
    act(() => getHQStore().setState({ floor: "L2", rover: { ...getHQStore().getState().rover, x: 0 } }));
    const { unmount } = mount();
    expect(screen.getByTestId("year-chip")).toHaveClass("top-[64px]", "left-3");
    expect(screen.getByTestId("year-chip")).not.toHaveClass("left-1/2");
    unmount();
    device("desktop", false);
    act(() => getHQStore().setState({ floor: "L2" }));
    mount();
    expect(screen.getByTestId("year-chip")).toHaveClass("top-[84px]", "left-1/2");
  });

  it("tablets (and coarse desktops) add search to the bar and the floor name to the chip", () => {
    device("desktop", true);
    mount();
    const bar = screen.getByTestId("hud-topbar");
    const buttons = within(bar).getAllByRole("button");
    expect(buttons).toHaveLength(3);
    expect(buttons[0]).toHaveAttribute("data-compact", "false");
    expect(buttons[1]).toHaveAccessibleName(/open search$/);
    expect(buttons[2]).toBe(screen.getByTestId("hud-menu"));
    expect(within(bar).queryByRole("button", { name: en.hud.launcher.askRover })).toBeNull();
    expect(screen.getByTestId("floor-chip")).toHaveTextContent("Lobby");
    expect(screen.getByTestId("floor-chip")).toHaveAccessibleName("L1 Home Lobby: change floor");
    expect(screen.queryByTestId("elevator-panel")).toBeNull();
    expect(document.documentElement.dataset.hqHud).toBe("tablet");
    for (const name of ["elevator", "view", "ask-rover"]) expect(onboardTargets(name)).toHaveLength(1);
  });

  it("follows a layout change and clears the root attribute on unmount", () => {
    const { unmount } = mount();
    expect(document.documentElement.dataset.hqHud).toBe("desktop");
    act(() => device("tablet", true));
    expect(document.documentElement.dataset.hqHud).toBe("tablet");
    unmount();
    expect(document.documentElement.dataset.hqHud).toBeUndefined();
  });

  it("sets the Ask teaser offset per layout and clears it on unmount", () => {
    const top = () => document.documentElement.style.getPropertyValue("--hq-teaser-top");
    const { unmount } = mount();
    expect(top()).toBe("124px");
    act(() => device("tablet", true));
    expect(top()).toBe("200px");
    act(() => device("mobile", true));
    expect(top()).toBe("148px");
    unmount();
    expect(top()).toBe("");
  });
});

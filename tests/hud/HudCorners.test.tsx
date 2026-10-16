// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import { buildExperienceData } from "@/content/experience";
import { Hud } from "@/hud/Hud";
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
  audio: { isMuted: () => false, subscribe: () => () => {}, getSettings: () => ({ effects: true, music: true, musicVolume: 0.5 }) },
}));
vi.mock("@/hud/dialog/DialogLayer", () => ({ default: () => null }));
vi.mock("@/hud/dialog/FloorIntroLayer", () => ({ FloorIntroLayer: () => null }));
vi.mock("@/hud/dialog/OnboardingLayer", () => ({ OnboardingLayer: () => null }));
vi.mock("@/hud/dialog/HintLayer", () => ({ HintLayer: () => null }));
vi.mock("@/hud/drawer/DrawerHost", () => ({ DrawerHost: () => null }));

const data = buildExperienceData("en", en.floors);

function mount() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <Hud data={data} onExit={vi.fn()} onToggleLang={vi.fn()} />
    </NextIntlClientProvider>,
  );
}

function device(viewport: "mobile" | "tablet" | "desktop", coarse: boolean) {
  const s = getHQStore().getState();
  getHQStore().setState({ phase: "explore", floor: "L1", ride: null, device: { ...s.device, viewport, coarse } });
}

const onboardTargets = (name: string) => document.querySelectorAll(`[data-testid='hud'] [data-onboard='${name}']`);

beforeEach(() => {
  device("desktop", false);
});

afterEach(() => {
  cleanup();
});

describe("Hud composition", () => {
  it("desktop keeps the profile card, the top bar and the elevator rail, with the settings gear above the view controls", () => {
    mount();
    expect(screen.getByRole("region", { name: en.hud.profile })).toBeInTheDocument();
    expect(screen.getByTestId("elevator-panel")).toBeInTheDocument();
    expect(within(screen.getByTestId("hud-topbar")).getByTestId("page-view")).toBeInTheDocument();
    expect(screen.queryByTestId("floor-chip")).toBeNull();
    expect(screen.queryByTestId("hud-menu")).toBeNull();
    const corner = screen.getByTestId("hud-corner");
    const gear = within(corner).getByTestId("settings-open");
    const view = within(corner).getByTestId("view-controls");
    expect(gear.compareDocumentPosition(view) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
});

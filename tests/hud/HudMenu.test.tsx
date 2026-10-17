// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import id from "../../messages/id.json";
import { ROTATE_STEP } from "@/experience/camera/orbit";
import { intents, type Intent } from "@/experience/input/intents";
import type { ExperienceData } from "@/experience/types";
import { openPalette, openTerminal } from "@/hud/events";
import type { HudLayout } from "@/hud/layout";
import { HudMenu } from "@/hud/menu/HudMenu";
import { SettingsLauncher, SettingsSheet } from "@/hud/menu/SettingsSheet";
import { useHudToggle } from "@/hud/menu/useHudToggles";
import { getHQStore } from "@/store/useHQStore";

const { fakeAudio } = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const fakeAudio = {
    isMuted: () => false,
    setMuted: vi.fn(),
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getSettings: () => ({ effects: true, music: true, musicVolume: 0.5 }),
    setEffects: vi.fn(),
    setMusic: vi.fn(),
    setMusicVolume: vi.fn(),
  };
  return { fakeAudio };
});

vi.mock("@/lib/audio", () => ({ audio: fakeAudio }));
vi.mock("@/hud/switchLocale", () => ({ switchLocale: vi.fn() }));
vi.mock("@/hud/events", () => ({ openPalette: vi.fn(), openTerminal: vi.fn() }));

const data = {
  locale: "en",
  profile: { name: "Kurniadi Ahmad Wijaya", headline: "AI Engineer", role: "", location: "" },
  floors: {
    L1: { name: "Lobby", route: "/" },
    L2: { name: "Career Archive", route: "/journey" },
    L3: { name: "Labs", route: "/work" },
    L4: { name: "Library", route: "/writing" },
    RF: { name: "Roof", route: "/about" },
  },
} as unknown as ExperienceData;

let emitted: Intent[] = [];
let off: () => void = () => {};

beforeEach(() => {
  emitted = [];
  off = intents.on((intent) => {
    emitted.push(intent);
  });
  vi.clearAllMocks();
  getHQStore().setState({ phase: "explore", floor: "L3", ride: null });
});

afterEach(() => {
  off();
  cleanup();
  window.localStorage.clear();
});

const Wrap = ({ children, locale = "en" }: { children: ReactNode; locale?: "en" | "id" }) => (
  <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : id}>
    {children}
  </NextIntlClientProvider>
);

function mount(layout: HudLayout = "phone", onExit = vi.fn()) {
  render(
    <Wrap>
      <HudMenu data={data} layout={layout} onExit={onExit} />
    </Wrap>,
  );
  return { button: screen.getByTestId("hud-menu"), onExit };
}

async function openMenu(layout: HudLayout = "phone") {
  const result = mount(layout);
  await userEvent.click(result.button);
  return { ...result, sheet: screen.getByTestId("menu-sheet") };
}

describe("HudMenu", () => {
  it("is a dialog button named Menu that carries the Ask Rover spotlight", () => {
    const { button } = mount();
    expect(button.tagName).toBe("BUTTON");
    expect(button).toHaveAccessibleName(en.hud.menu);
    expect(button).toHaveAttribute("aria-haspopup", "dialog");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveAttribute("data-onboard", "ask-rover");
    expect(button.className).toMatch(/size-11|min-h-11/);
  });

  it("opens a side sheet titled Menu with the profile, the actions and the settings, in that order", async () => {
    const { button, sheet } = await openMenu();
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(sheet).toHaveAttribute("role", "dialog");
    expect(sheet).toHaveAttribute("data-side", "right");
    expect(sheet).toHaveAccessibleName(en.hud.menuTitle);
    const profile = within(sheet).getByTestId("menu-profile");
    expect(profile).toHaveTextContent(data.profile.name);
    expect(profile).toHaveTextContent("AI Engineer");
    expect(profile).toHaveTextContent("L3");
    expect(profile).toHaveTextContent("Labs");
    expect(within(profile).queryByRole("button")).toBeNull();
    expect(within(profile).getByTestId("profile-photo").querySelector("img")).toHaveAttribute("alt", "");
    const actions = within(sheet).getByTestId("menu-actions");
    const settings = (await within(sheet).findByTestId("settings-panel"));
    expect(profile.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(actions.compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const visibleText = (el: HTMLElement) => {
      const copy = el.cloneNode(true) as HTMLElement;
      copy.querySelectorAll("[aria-hidden='true']").forEach((node) => node.remove());
      return copy.textContent?.replace(/\s+/g, " ").trim();
    };
    const names = within(actions).getAllByRole("button").map(visibleText);
    expect(names).toEqual([en.hud.pageView, en.hud.launcher.search, en.hud.launcher.askRover, en.hud.view.rotateLeft, en.hud.view.rotateRight, en.hud.map.open]);
    for (const name of ["Classic site", "Search", "Ask Rover", /^Rotate left/, /^Rotate right/, "Map"]) {
      const action = within(actions).getByRole("button", { name });
      expect(action.className).toMatch(/min-h-11/);
    }
    for (const row of ["language", "motion", "sound", "music"]) expect(within(sheet).getByTestId(`setting-${row}`)).toBeInTheDocument();
    expect(within(settings).getAllByRole("heading", { level: 3 }).length).toBeGreaterThan(0);
  });

  it("Classic site is the solid cyan primary and exits to the Page View", async () => {
    const { sheet, onExit } = await openMenu();
    const pageView = within(sheet).getByTestId("page-view");
    expect(pageView).toHaveAccessibleName(en.hud.pageView);
    expect(pageView.className).toContain("bg-cyan");
    expect(pageView.firstElementChild).toHaveAttribute("aria-hidden", "true");
    await userEvent.click(pageView);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("Search and Ask Rover close the menu, then open their overlay", async () => {
    const { button, sheet } = await openMenu();
    await userEvent.click(within(sheet).getByRole("button", { name: "Search" }));
    expect(screen.queryByTestId("menu-sheet")).toBeNull();
    expect(openPalette).toHaveBeenCalledTimes(1);
    expect(button).toHaveFocus();
    await userEvent.click(button);
    await userEvent.click(within(screen.getByTestId("menu-sheet")).getByRole("button", { name: "Ask Rover" }));
    expect(screen.queryByTestId("menu-sheet")).toBeNull();
    expect(openTerminal).toHaveBeenCalledTimes(1);
  });

  it("rotate emits the view controls' orbit intents and keeps the menu open", async () => {
    const { sheet } = await openMenu();
    await userEvent.click(within(sheet).getByRole("button", { name: /^Rotate left/ }));
    await userEvent.click(within(sheet).getByRole("button", { name: /^Rotate right/ }));
    expect(emitted).toEqual([
      { type: "orbit", dyaw: -ROTATE_STEP, smooth: true, source: "button" },
      { type: "orbit", dyaw: ROTATE_STEP, smooth: true, source: "button" },
    ]);
    expect(screen.getByTestId("menu-sheet")).toBeInTheDocument();
  });

  it("Map toggles the map overview and closes the menu", async () => {
    const { sheet } = await openMenu();
    await userEvent.click(within(sheet).getByRole("button", { name: "Map" }));
    expect(emitted).toEqual([{ type: "toggle", what: "map" }]);
    expect(screen.queryByTestId("menu-sheet")).toBeNull();
  });

  it("Esc closes and returns focus to the menu button; so does the close button", async () => {
    const { button } = await openMenu();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByTestId("menu-sheet")).toBeNull();
    expect(button).toHaveFocus();
    expect(button).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(button);
    await userEvent.click(within(screen.getByTestId("menu-sheet")).getByRole("button", { name: en.hud.pads.close }));
    expect(screen.queryByTestId("menu-sheet")).toBeNull();
    expect(button).toHaveFocus();
  });

  it("the settings toggle intent (the , key) opens it, and a second one closes it", () => {
    mount();
    act(() => intents.emit({ type: "toggle", what: "settings" }));
    expect(screen.getByTestId("menu-sheet")).toBeInTheDocument();
    act(() => intents.emit({ type: "toggle", what: "settings" }));
    expect(screen.queryByTestId("menu-sheet")).toBeNull();
    act(() => intents.emit({ type: "toggle", what: "map" }));
    expect(screen.queryByTestId("menu-sheet")).toBeNull();
  });

  it("tablets show Search in the bar, so the menu leaves it out", async () => {
    const { sheet } = await openMenu("tablet");
    const actions = within(sheet).getByTestId("menu-actions");
    expect(within(actions).queryByRole("button", { name: "Search" })).toBeNull();
    for (const name of ["Classic site", "Ask Rover", /^Rotate left/, /^Rotate right/, "Map"]) expect(within(actions).getByRole("button", { name })).toBeInTheDocument();
  });

  it("speaks Indonesian, and Ask Rover keeps its exact name in English", async () => {
    render(
      <Wrap locale="id">
        <HudMenu data={data} layout="phone" onExit={vi.fn()} />
      </Wrap>,
    );
    await userEvent.click(screen.getByTestId("hud-menu"));
    const sheet = screen.getByTestId("menu-sheet");
    expect(sheet).toHaveAccessibleName(id.hud.menuTitle);
    expect(within(sheet).getByRole("button", { name: id.hud.map.open })).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: id.hud.launcher.askRover })).toBeInTheDocument();
  });
});

describe("SettingsSheet", () => {
  it("renders nothing while closed", () => {
    render(
      <Wrap>
        <SettingsSheet open={false} onClose={vi.fn()} />
      </Wrap>,
    );
    expect(screen.queryByTestId("settings-sheet")).toBeNull();
  });

  it("is a side sheet titled Settings with the settings panel; Esc and the close button call onClose", async () => {
    const onClose = vi.fn();
    render(
      <Wrap>
        <SettingsSheet open onClose={onClose} />
      </Wrap>,
    );
    const sheet = screen.getByTestId("settings-sheet");
    expect(sheet).toHaveAttribute("data-side", "right");
    expect(sheet).toHaveAccessibleName(en.hud.settings.title);
    expect((await within(sheet).findByTestId("settings-panel"))).toBeInTheDocument();
    expect(within(sheet).getByRole("heading", { level: 2, name: en.hud.settings.title })).toBeInTheDocument();
    for (const row of ["language", "motion", "sound", "music"]) expect(within(sheet).getByTestId(`setting-${row}`)).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    await userEvent.click(within(sheet).getByRole("button", { name: en.hud.pads.close }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("SettingsLauncher (desktop)", () => {
  it("a round gear button named Settings opens the settings sheet; Esc closes and returns focus", async () => {
    render(
      <Wrap>
        <SettingsLauncher />
      </Wrap>,
    );
    const gear = screen.getByTestId("settings-open");
    expect(gear).toHaveAccessibleName(en.hud.settings.open);
    expect(gear).toHaveAttribute("aria-haspopup", "dialog");
    expect(gear.className).toContain("size-11");
    expect(gear.className).toContain("glass-solid");
    expect(gear.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    await userEvent.click(gear);
    expect(screen.getByTestId("settings-sheet")).toBeInTheDocument();
    expect(gear).toHaveAttribute("aria-expanded", "true");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByTestId("settings-sheet")).toBeNull();
    expect(gear).toHaveFocus();
  });

  it("the , key's toggle intent opens and closes it, with or without the gear", () => {
    render(
      <Wrap>
        <SettingsLauncher showButton={false} />
      </Wrap>,
    );
    expect(screen.queryByTestId("settings-open")).toBeNull();
    act(() => intents.emit({ type: "toggle", what: "settings" }));
    expect(screen.getByTestId("settings-sheet")).toBeInTheDocument();
    act(() => intents.emit({ type: "toggle", what: "settings" }));
    expect(screen.queryByTestId("settings-sheet")).toBeNull();
  });
});

describe("useHudToggle", () => {
  function Probe({ what }: { what: "map" | "settings" }) {
    const [open, setOpen] = useHudToggle(what);
    return (
      <button type="button" data-testid="probe" data-open={open} onClick={() => setOpen(false)}>
        probe
      </button>
    );
  }

  it("flips on its own toggle intent only, and setOpen sets it", async () => {
    render(<Probe what="map" />);
    const probe = screen.getByTestId("probe");
    expect(probe).toHaveAttribute("data-open", "false");
    act(() => intents.emit({ type: "toggle", what: "settings" }));
    expect(probe).toHaveAttribute("data-open", "false");
    act(() => intents.emit({ type: "toggle", what: "map" }));
    expect(probe).toHaveAttribute("data-open", "true");
    await userEvent.click(probe);
    expect(probe).toHaveAttribute("data-open", "false");
    act(() => intents.emit({ type: "toggle", what: "map" }));
    act(() => intents.emit({ type: "toggle", what: "map" }));
    expect(probe).toHaveAttribute("data-open", "false");
  });
});

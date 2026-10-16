// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import { SettingsPanel } from "@/hud/settings/SettingsPanel";
import { SETTINGS } from "@/hud/settings/defs";
import { defineSetting } from "@/hud/settings/registry";
import { switchLocale } from "@/hud/switchLocale";
import { getHQStore } from "@/store/useHQStore";

const { fakeAudio } = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const state = { muted: false, effects: true, music: true, musicVolume: 0.5 };
  const emit = () => listeners.forEach((l) => l());
  const fakeAudio = {
    state,
    isMuted: () => state.muted,
    setMuted: vi.fn((v: boolean) => {
      state.muted = v;
      emit();
    }),
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getSettings: () => ({ effects: state.effects, music: state.music, musicVolume: state.musicVolume }),
    setEffects: vi.fn((v: boolean) => {
      state.effects = v;
      emit();
    }),
    setMusic: vi.fn((v: boolean) => {
      state.music = v;
      emit();
    }),
    setMusicVolume: vi.fn((v: number) => {
      state.musicVolume = v;
      emit();
    }),
  };
  return { fakeAudio };
});

vi.mock("@/lib/audio", () => ({ audio: fakeAudio }));
vi.mock("@/hud/switchLocale", () => ({ switchLocale: vi.fn() }));

const Wrap = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="en" messages={en}>
    {children}
  </NextIntlClientProvider>
);

beforeEach(() => {
  Object.assign(fakeAudio.state, { muted: false, effects: true, music: true, musicVolume: 0.5 });
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  getHQStore().getState().setMotion("full");
  getHQStore().getState().setLocale("en");
  window.localStorage.clear();
});

describe("SettingsPanel", () => {
  it("renders every group and setting from the registry", () => {
    render(<SettingsPanel />, { wrapper: Wrap });
    for (const name of ["General", "Display", "Sound"]) expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    for (const id of ["language", "motion", "quality", "minimap", "sound", "effects", "music", "music-volume"]) {
      expect(screen.getByTestId(`setting-${id}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId("settings-panel")).toBeInTheDocument();
  });

  it("toggles write through to their store and re-render", async () => {
    render(<SettingsPanel />, { wrapper: Wrap });
    const music = screen.getByRole("switch", { name: "Music" });
    expect(music).toHaveAttribute("aria-checked", "true");
    await userEvent.click(music);
    expect(fakeAudio.setMusic).toHaveBeenCalledWith(false);
    expect(screen.getByRole("switch", { name: "Music" })).toHaveAttribute("aria-checked", "false");
  });

  it("the master Sound switch is the inverse of muted", async () => {
    render(<SettingsPanel />, { wrapper: Wrap });
    const sound = screen.getByRole("switch", { name: "Sound" });
    expect(sound).toHaveAttribute("aria-checked", "true");
    await userEvent.click(sound);
    expect(fakeAudio.setMuted).toHaveBeenCalledWith(true);
    expect(screen.getByRole("switch", { name: "Sound" })).toHaveAttribute("aria-checked", "false");
  });

  it("the minimap switch persists through its local preference", async () => {
    render(<SettingsPanel />, { wrapper: Wrap });
    const minimap = screen.getByRole("switch", { name: "Minimap" });
    expect(minimap).toHaveAttribute("aria-checked", "true");
    await userEvent.click(minimap);
    expect(window.localStorage.getItem("hq:minimap")).toBe("off");
    expect(screen.getByRole("switch", { name: "Minimap" })).toHaveAttribute("aria-checked", "false");
  });

  it("choices apply at once (motion through the store, language through switchLocale)", async () => {
    render(<SettingsPanel />, { wrapper: Wrap });
    await userEvent.click(screen.getByRole("radio", { name: "Reduced" }));
    expect(getHQStore().getState().motion).toBe("reduced");
    await userEvent.click(screen.getByRole("radio", { name: "Bahasa Indonesia" }));
    expect(switchLocale).toHaveBeenCalledWith("id");
  });

  it("does not switch the language when the current one is picked", async () => {
    render(<SettingsPanel />, { wrapper: Wrap });
    expect(screen.getByRole("radio", { name: "English" })).toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: "English" }));
    expect(switchLocale).not.toHaveBeenCalled();
  });

  it("marks the locale labels with their language", () => {
    render(<SettingsPanel />, { wrapper: Wrap });
    expect(screen.getByText("English")).toHaveAttribute("lang", "en");
    expect(screen.getByText("Bahasa Indonesia")).toHaveAttribute("lang", "id");
  });

  it("the quality choice persists through its local preference", async () => {
    render(<SettingsPanel />, { wrapper: Wrap });
    await userEvent.click(screen.getByRole("radio", { name: "Lite" }));
    expect(window.localStorage.getItem("hq:quality")).toBe("lite");
  });

  it("the music volume slider reports percent", () => {
    render(<SettingsPanel />, { wrapper: Wrap });
    const slider = screen.getByRole("slider", { name: "Music volume" });
    expect(slider).toHaveAttribute("aria-valuetext", "50 percent");
    fireEvent.change(slider, { target: { value: "40" } });
    expect(fakeAudio.setMusicVolume).toHaveBeenCalledWith(0.4);
    expect(slider).toHaveAttribute("aria-valuetext", "40 percent");
  });

  it("describes controls with their hint", () => {
    render(<SettingsPanel />, { wrapper: Wrap });
    const lite = screen.getByRole("group", { name: "Graphics quality" });
    expect(lite).toHaveAccessibleDescription(en.hud.settings.quality.hint);
  });

  it("uses the requested heading level", () => {
    render(<SettingsPanel headingLevel={2} />, { wrapper: Wrap });
    expect(screen.getByRole("heading", { level: 2, name: "General" })).toBeInTheDocument();
  });

  it("accepts an extra registered setting (sibling extension point)", () => {
    const extra = defineSetting({
      id: "day-night",
      group: "display",
      order: 30,
      labelKey: "minimap.label",
      control: { kind: "toggle", get: () => false, set: () => {} },
      subscribe: () => () => {},
    });
    render(<SettingsPanel defs={[...SETTINGS, extra]} />, { wrapper: Wrap });
    expect(screen.getByTestId("setting-day-night")).toBeInTheDocument();
  });
});

// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import id from "../../messages/id.json";
import { hintsOn, resetFlagMemory, setHintsOn } from "@/hud/dialog/storage";
import { registerTutorial } from "@/hud/dialog/tutorial";
import { SettingsPanel } from "@/hud/settings/SettingsPanel";
import { SETTINGS } from "@/hud/settings/defs";
import { defineSetting } from "@/hud/settings/registry";
import { switchLocale } from "@/hud/switchLocale";
import { getHQStore } from "@/store/useHQStore";

const { fakeAudio } = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const state = { muted: false, effects: true, music: true, musicVolume: 0.5, ambience: true };
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
    getSettings: () => ({ effects: state.effects, music: state.music, musicVolume: state.musicVolume, ambience: state.ambience }),
    setEffects: vi.fn((v: boolean) => {
      state.effects = v;
      emit();
    }),
    setMusic: vi.fn((v: boolean) => {
      state.music = v;
      emit();
    }),
    setAmbience: vi.fn((v: boolean) => {
      state.ambience = v;
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
  Object.assign(fakeAudio.state, { muted: false, effects: true, music: true, musicVolume: 0.5, ambience: true });
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  getHQStore().getState().setMotion("full");
  getHQStore().getState().setLocale("en");
  window.localStorage.clear();
  resetFlagMemory();
});

describe("SettingsPanel", () => {
  for (const [locale, messages, musicName, ambienceName, volumeName] of [
    ["en", en, "Background music", "Floor ambience", "Music and ambience volume"],
    ["id", id, "Musik latar", "Suara latar tiap lantai", "Volume musik dan suara latar"],
  ] as const) {
    it(`${locale}: names independent soundtrack switches and their shared volume`, async () => {
      render(<NextIntlClientProvider locale={locale} messages={messages}><SettingsPanel /></NextIntlClientProvider>);
      const music = screen.getByRole("switch", { name: musicName });
      const ambience = screen.getByRole("switch", { name: ambienceName });
      expect(ambience).toHaveAccessibleDescription(locale === "en"
        ? /controlled separately from Background music/i
        : /terpisah dari Musik latar/i);
      await userEvent.click(music);
      expect(music).toHaveAttribute("aria-checked", "false");
      expect(ambience).toHaveAttribute("aria-checked", "true");
      await userEvent.click(ambience);
      expect(ambience).toHaveAttribute("aria-checked", "false");
      expect(music).toHaveAttribute("aria-checked", "false");
      const volume = screen.getByRole("slider", { name: volumeName });
      expect(volume).toHaveAttribute("min", "0");
      expect(volume).toHaveAttribute("max", "100");
      expect(volume).toHaveAttribute("step", "5");
      expect(screen.getByRole("switch", { name: messages.hud.settings.sound.label })).toHaveAttribute("aria-checked", "true");
    });
  }
  it("renders every group and setting from the registry", () => {
    render(<SettingsPanel />, { wrapper: Wrap });
    for (const name of ["General", "Display", "Sound"]) expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    for (const id of ["language", "open-links", "motion", "quality", "day-night", "minimap", "sound", "effects", "music", "ambience", "music-volume"]) {
      expect(screen.getByTestId(`setting-${id}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId("settings-panel")).toBeInTheDocument();
  });

  it("toggles write through to their store and re-render", async () => {
    render(<SettingsPanel />, { wrapper: Wrap });
    const music = screen.getByRole("switch", { name: "Background music" });
    expect(music).toHaveAttribute("aria-checked", "true");
    await userEvent.click(music);
    expect(fakeAudio.setMusic).toHaveBeenCalledWith(false);
    expect(screen.getByRole("switch", { name: "Background music" })).toHaveAttribute("aria-checked", "false");
  });

  it("the Floor ambience switch writes through to the engine", async () => {
    render(<SettingsPanel />, { wrapper: Wrap });
    const ambience = screen.getByRole("switch", { name: "Floor ambience" });
    expect(ambience).toHaveAttribute("aria-checked", "true");
    await userEvent.click(ambience);
    expect(fakeAudio.setAmbience).toHaveBeenCalledWith(false);
    expect(screen.getByRole("switch", { name: "Floor ambience" })).toHaveAttribute("aria-checked", "false");
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

  it("the quality choice shows at once and persists through its local preference after the debounce", async () => {
    render(<SettingsPanel />, { wrapper: Wrap });
    await userEvent.click(screen.getByRole("radio", { name: "Lite" }));
    expect(screen.getByRole("radio", { name: "Lite" })).toBeChecked();
    await vi.waitFor(() => expect(window.localStorage.getItem("hq:quality")).toBe("lite"), { timeout: 2000 });
  });

  it("the music volume slider reports percent", () => {
    render(<SettingsPanel />, { wrapper: Wrap });
    const slider = screen.getByRole("slider", { name: "Music and ambience volume" });
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
      id: "sibling-extra",
      group: "display",
      order: 30,
      labelKey: "minimap.label",
      control: { kind: "toggle", get: () => false, set: () => {} },
      subscribe: () => () => {},
    });
    render(<SettingsPanel defs={[...SETTINGS, extra]} />, { wrapper: Wrap });
    expect(screen.getByTestId("setting-sibling-extra")).toBeInTheDocument();
  });
});

describe("SettingsPanel tutorial rows", () => {
  it("replays the tutorial from the general group and closes the sheet first", async () => {
    const calls: string[] = [];
    const run = vi.fn(() => calls.push("run"));
    const onClose = vi.fn(() => calls.push("close"));
    const stop = registerTutorial(run);
    render(<SettingsPanel onClose={onClose} />, { wrapper: Wrap });
    const general = screen.getByRole("region", { name: en.hud.settings.groups.general });
    await userEvent.click(within(general).getByRole("button", { name: en.hud.settings.tutorial.label }));
    expect(calls).toEqual(["close", "run"]);
    stop();
  });

  it("toggles hints as a switch in the general group", async () => {
    const stop = registerTutorial(vi.fn());
    setHintsOn(true);
    render(<SettingsPanel />, { wrapper: Wrap });
    const hints = within(screen.getByTestId("setting-hints")).getByRole("switch", { name: en.hud.settings.hints.label });
    expect(hints).toHaveAttribute("aria-checked", "true");
    await userEvent.click(hints);
    expect(hintsOn()).toBe(false);
    expect(hints).toHaveAttribute("aria-checked", "false");
    stop();
  });

  it("hides replay and hints while the 3D tutorial host is not registered", () => {
    render(<SettingsPanel />, { wrapper: Wrap });
    expect(screen.queryByTestId("setting-replay-tutorial")).toBeNull();
    expect(screen.queryByTestId("setting-hints")).toBeNull();
  });

  it("shows the rows when the host registers while the panel is open", () => {
    render(<SettingsPanel />, { wrapper: Wrap });
    expect(screen.queryByTestId("setting-hints")).toBeNull();
    let stop = () => {};
    act(() => {
      stop = registerTutorial(vi.fn());
    });
    expect(screen.getByTestId("setting-hints")).toBeInTheDocument();
    expect(screen.getByTestId("setting-replay-tutorial")).toBeInTheDocument();
    act(() => stop());
    expect(screen.queryByTestId("setting-hints")).toBeNull();
  });
});

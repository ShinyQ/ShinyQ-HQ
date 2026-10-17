// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import id from "../../messages/id.json";
import { buildExperienceData } from "@/content/experience";
import { buildFloorLayouts } from "@/experience/config";
import { intents } from "@/experience/input/intents";
import { SettingsSheet } from "@/hud/menu/SettingsSheet";
import { Minimap } from "@/hud/minimap/Minimap";
import { getHQStore } from "@/store/useHQStore";

const chunks = vi.hoisted(() => ({ panelFails: 0, overviewFails: 0 }));

vi.mock("@/hud/settings/SettingsPanel", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/hud/settings/SettingsPanel")>();
  return {
    get SettingsPanel() {
      if (chunks.panelFails > 0) {
        chunks.panelFails -= 1;
        throw new Error("chunk failed");
      }
      return real.SettingsPanel;
    },
  };
});

vi.mock("@/hud/minimap/MapOverview", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/hud/minimap/MapOverview")>();
  return {
    get MapOverview() {
      if (chunks.overviewFails > 0) {
        chunks.overviewFails -= 1;
        throw new Error("chunk failed");
      }
      return real.MapOverview;
    },
  };
});

vi.mock("@/lib/audio", () => ({
  audio: {
    isMuted: () => false,
    setMuted: () => {},
    subscribe: () => () => {},
    getSettings: () => ({ effects: true, music: true, musicVolume: 0.5 }),
    setEffects: () => {},
    setMusic: () => {},
    setMusicVolume: () => {},
  },
}));

const data = buildExperienceData("en", en.floors);
const layouts = buildFloorLayouts(8);

beforeEach(() => {
  getHQStore().setState({ phase: "explore", floor: "L1", ride: null });
});

afterEach(() => {
  cleanup();
  chunks.panelFails = 0;
  chunks.overviewFails = 0;
});

// A loaded chunk stays cached for the file, so each failure case runs before the success it retries into.
describe("lazy HUD panels", () => {
  it("holds the sheet's height while the settings panel loads, then shows the failure in English", async () => {
    chunks.panelFails = 1;
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <SettingsSheet open onClose={() => {}} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId("settings-loading")).toHaveClass("min-h-[36rem]");
    expect(await screen.findByTestId("settings-failed")).toHaveTextContent(en.hud.loadFailed);
    expect(screen.queryByTestId("settings-loading")).toBeNull();
    expect(screen.getByRole("button", { name: en.hud.retry })).toBeInTheDocument();
  });

  it("shows Retry when the settings chunk fails, and Retry loads it", async () => {
    chunks.panelFails = 1;
    render(
      <NextIntlClientProvider locale="id" messages={id}>
        <SettingsSheet open onClose={() => {}} />
      </NextIntlClientProvider>,
    );
    expect(await screen.findByText(id.hud.loadFailed)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: id.hud.retry }));
    expect(await screen.findByTestId("settings-panel")).toBeInTheDocument();
    expect(screen.queryByText(id.hud.loadFailed)).toBeNull();
    expect(screen.getByTestId("settings-sheet")).toHaveFocus();
  });

  it("closes the failed overview with its close button", async () => {
    chunks.overviewFails = 1;
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <Minimap data={data} layouts={layouts} size="desktop" />
      </NextIntlClientProvider>,
    );
    act(() => intents.emit({ type: "toggle", what: "map" }));
    await screen.findByTestId("map-overview-failed");
    await userEvent.click(screen.getByRole("button", { name: en.hud.map.close }));
    expect(screen.queryByTestId("map-overview-failed")).toBeNull();
  });

  it("shows the overview's dialog shell with Retry when its chunk fails, and Retry loads it", async () => {
    chunks.overviewFails = 1;
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <Minimap data={data} layouts={layouts} size="desktop" />
      </NextIntlClientProvider>,
    );
    act(() => intents.emit({ type: "toggle", what: "map" }));
    const failed = await screen.findByTestId("map-overview-failed");
    expect(failed).toHaveTextContent(en.hud.loadFailed);
    expect(screen.getByRole("dialog", { name: en.hud.map.open })).toBe(failed);
    await userEvent.click(screen.getByRole("button", { name: en.hud.retry }));
    expect(await screen.findByTestId("map-overview")).toBeInTheDocument();
    expect(screen.queryByTestId("map-overview-failed")).toBeNull();
  });
});

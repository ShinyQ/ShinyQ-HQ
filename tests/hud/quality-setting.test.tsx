// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import { QUALITY_APPLY_MS, qualitySetting } from "@/hud/settings/defs/quality";
import { SettingsPanel } from "@/hud/settings/SettingsPanel";
import { qualityPref } from "@/lib/quality-pref";

const control = qualitySetting.control;
if (control.kind !== "choice") throw new Error("quality is a choice");

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
  qualityPref.set("auto");
  qualitySetting.takeFocus?.();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  window.localStorage.clear();
});

describe("graphics quality setting", () => {
  it("shows a pending choice at once and writes the preference once, with the last value, after the debounce", () => {
    const write = vi.spyOn(qualityPref, "set");
    const listener = vi.fn();
    const stop = qualitySetting.subscribe(listener);
    control.set("full");
    expect(control.get()).toBe("full");
    vi.advanceTimersByTime(QUALITY_APPLY_MS - 100);
    control.set("lite");
    expect(control.get()).toBe("lite");
    expect(listener).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(QUALITY_APPLY_MS - 1);
    expect(write).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("hq:quality")).not.toBe("lite");
    vi.advanceTimersByTime(1);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith("lite");
    expect(window.localStorage.getItem("hq:quality")).toBe("lite");
    expect(control.get()).toBe("lite");
    stop();
    write.mockRestore();
  });

  it("writes nothing when the radios come back to the stored value", () => {
    const write = vi.spyOn(qualityPref, "set");
    control.set("lite");
    control.set("auto");
    vi.advanceTimersByTime(QUALITY_APPLY_MS);
    expect(write).not.toHaveBeenCalled();
    expect(control.get()).toBe("auto");
    expect(qualitySetting.takeFocus?.()).toBe(false);
    write.mockRestore();
  });

  it("hands focus to the checked radio of the panel that mounts after an applied change, once", () => {
    control.set("lite");
    vi.advanceTimersByTime(QUALITY_APPLY_MS);
    // The gate remounts the HUD here; the new panel takes focus back to the checked quality radio.
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <button type="button">elsewhere</button>
        <SettingsPanel defs={[qualitySetting]} />
      </NextIntlClientProvider>,
    );
    const lite = screen.getByRole("radio", { name: "Lite" });
    expect(lite).toBeChecked();
    expect(lite).toHaveFocus();
    expect(screen.getByTestId("setting-quality").querySelector("input:checked")).toBe(lite);
    cleanup();
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <SettingsPanel defs={[qualitySetting]} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("radio", { name: "Lite" })).not.toHaveFocus();
  });

  it("does not take focus when the panel opens later on its own", () => {
    control.set("full");
    vi.advanceTimersByTime(QUALITY_APPLY_MS);
    act(() => void vi.advanceTimersByTime(5000));
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <SettingsPanel defs={[qualitySetting]} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("radio", { name: "Full" })).not.toHaveFocus();
  });
});

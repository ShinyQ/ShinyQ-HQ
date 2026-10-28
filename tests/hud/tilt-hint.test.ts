// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { browserTilt, TILT_KEY } from "@/hud/dialog/onboarding";

/** The tilt hint's browser side (spec 2026-10-29): a portrait query, the once-per-device key and the rotation wait. */
function mockPortrait(matches: boolean) {
  const listeners = new Set<() => void>();
  const query = {
    matches,
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
  };
  vi.stubGlobal("matchMedia", vi.fn(() => query));
  return { query, turn: () => [...listeners].forEach((l) => l()), listeners };
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("browserTilt", () => {
  it("is none on a fine pointer", () => {
    mockPortrait(true);
    expect(browserTilt(false)).toBeNull();
  });

  it("is due on a portrait touch screen until it was shown once", () => {
    mockPortrait(true);
    const tilt = browserTilt(true)!;
    expect(tilt.due()).toBe(true);
    tilt.seen();
    expect(localStorage.getItem(TILT_KEY)).toBe("1");
    expect(tilt.due()).toBe(false);
  });

  it("is not due in landscape", () => {
    mockPortrait(false);
    expect(browserTilt(true)!.due()).toBe(false);
  });

  it("resolves on a rotation or an abort, and stops listening", async () => {
    const media = mockPortrait(true);
    const tilt = browserTilt(true)!;
    const stop = new AbortController();
    const rotated = tilt.rotated(stop.signal);
    expect(media.listeners.size).toBe(1);
    media.turn();
    await rotated;
    expect(media.listeners.size).toBe(0);
    const aborted = new AbortController();
    const later = tilt.rotated(aborted.signal);
    aborted.abort();
    await later;
    expect(media.listeners.size).toBe(0);
  });
});

// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExperienceData, GpuTier } from "@/experience/types";
import { resetExperienceData } from "@/experience/data-client";
import { getHQStore } from "@/store/useHQStore";
import en from "../../messages/en.json";

vi.mock("@/experience/gate-tier", () => ({ useGateTier: () => "lite" as GpuTier, useQualityTier: (t: GpuTier | null) => t }));
vi.mock("@/lib/intro-session", () => ({ introSeen: () => true }));
vi.mock("@/experience/intro/chunk", () => ({ loadIntro: () => Promise.resolve(null) }));
// The 3D chunk cannot load (offline, a deploy replaced the file).
vi.mock("@/experience/Experience", () => {
  throw new Error("Failed to load chunk");
});

const { ExperienceGate } = await import("@/experience/ExperienceGate");

afterEach(() => {
  cleanup();
  resetExperienceData();
  vi.unstubAllGlobals();
  getHQStore().setState(getHQStore().getInitialState(), true);
});

describe("ExperienceGate with a failed 3D chunk", () => {
  it("takes the same path as a failed data fetch: the static page with Retry 3D, not a broken page", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ locale: "en", years: [2019] } as unknown as ExperienceData)));
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ExperienceGate locale="en" version="abc123" />
      </NextIntlClientProvider>,
    );
    expect(await screen.findByRole("status")).toHaveTextContent(en.hud.staticNotice);
    expect(screen.getByTestId("retry-3d")).toBeInTheDocument();
  });
});

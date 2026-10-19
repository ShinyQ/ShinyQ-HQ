// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExperienceData, GpuTier } from "@/experience/types";
import { loadExperienceData, resetExperienceData } from "@/experience/data-client";
import { getHQStore } from "@/store/useHQStore";
import en from "../../messages/en.json";

const gate = vi.hoisted(() => ({ tier: null as GpuTier | null }));
vi.mock("@/experience/gate-tier", () => ({ useGateTier: () => gate.tier, useQualityTier: (t: GpuTier | null) => t }));
vi.mock("@/lib/intro-session", () => ({ introSeen: () => true }));
vi.mock("@/experience/intro/chunk", () => ({ loadIntro: () => Promise.resolve(null) }));
// The real 3D chunk needs WebGL: a stand-in records the data it was mounted with.
vi.mock("@/experience/Experience", () => ({
  default: ({ data }: { data: ExperienceData }) => <div data-testid="hq-stub" data-locale={data.locale} />,
}));

const { ExperienceGate } = await import("@/experience/ExperienceGate");

const DATA = { locale: "en", years: [2019] } as unknown as ExperienceData;

function stubFetch(answer: () => Promise<Response>) {
  const fetch = vi.fn((url: string) => {
    void url;
    return answer();
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function renderGate() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ExperienceGate locale="en" version="abc123" />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  resetExperienceData();
  vi.unstubAllGlobals();
  gate.tier = null;
  document.documentElement.removeAttribute("data-hq-boot");
  getHQStore().setState(getHQStore().getInitialState(), true);
});

describe("ExperienceGate data", () => {
  it("fetches the versioned page data with the 3D chunk and mounts Experience only once it arrived", async () => {
    let release!: (res: Response) => void;
    const fetch = stubFetch(() => new Promise<Response>((resolve) => (release = resolve)));
    gate.tier = "lite";
    renderGate();
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/data/experience/en.json?v=abc123"));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(screen.queryByTestId("hq-stub")).toBeNull();
    await act(async () => release(Response.json(DATA)));
    expect(await screen.findByTestId("hq-stub")).toHaveAttribute("data-locale", "en");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("data loaded earlier on this page load (boot-first fetch, another gated page) is not fetched again", async () => {
    const fetch = stubFetch(async () => Response.json(DATA));
    await loadExperienceData("en", "abc123");
    gate.tier = "lite";
    renderGate();
    expect(await screen.findByTestId("hq-stub")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("a boot-first visit starts the fetch during hydration, before the tier probe", () => {
    document.documentElement.setAttribute("data-hq-boot", "1");
    const fetch = stubFetch(() => new Promise<Response>(() => {}));
    renderGate();
    expect(fetch).toHaveBeenCalledWith("/data/experience/en.json?v=abc123");
  });

  it("a failed fetch takes the crash path: one automatic retry, then the static page with Retry 3D", async () => {
    let ok = false;
    const fetch = stubFetch(async () => {
      if (!ok) throw new TypeError("offline");
      return Response.json(DATA);
    });
    gate.tier = "lite";
    renderGate();
    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent(en.hud.staticNotice);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId("hq-stub")).toBeNull();
    ok = true;
    fireEvent.click(screen.getByTestId("retry-3d"));
    expect(await screen.findByTestId("hq-stub")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("a failed fetch releases the boot cover with the static page", async () => {
    document.documentElement.setAttribute("data-hq-boot", "1");
    stubFetch(async () => new Response("gone", { status: 404 }));
    gate.tier = "lite";
    renderGate();
    await screen.findByRole("status");
    expect(document.documentElement).not.toHaveAttribute("data-hq-boot");
    expect(document.documentElement).toHaveAttribute("data-hq-boot-released", "static");
  });
});

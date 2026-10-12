// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import type { WalkController, WalkState } from "@/experience/missions/walk";
import { WalkBar } from "@/hud/walk/WalkBar";

const walk = { definition: { id: "projects", stops: [] }, start: vi.fn(), resume: vi.fn(), end: vi.fn() } as unknown as WalkController;
const state = (status: WalkState["status"]): WalkState => ({ status, filter: null, index: 2, total: 9, stop: null, visited: [] });

function renderBar(status: WalkState["status"], slot: HTMLElement | null) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <WalkBar walk={walk} state={state(status)} placement="bottom-raised" coarse launcher={en.walk.projects.start} slot={slot} />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("WalkBar pills and the bottom band", () => {
  it("renders the idle launcher in flow inside the band slot", () => {
    const slot = document.body.appendChild(document.createElement("div"));
    renderBar("idle", slot);
    const launcher = screen.getByTestId("walk-launcher");
    expect(slot).toContainElement(launcher);
    expect(launcher.className).not.toMatch(/\babsolute\b/);
    expect(screen.getByRole("button", { name: new RegExp(en.walk.projects.start) })).toBeInTheDocument();
  });

  it("renders the paused pill in the slot and keeps the stop count for wider screens only", () => {
    const slot = document.body.appendChild(document.createElement("div"));
    renderBar("paused", slot);
    const pill = screen.getByTestId("walk-pill");
    expect(slot).toContainElement(pill);
    expect(screen.getByRole("button", { name: new RegExp(en.walk.resume) })).toBeInTheDocument();
    expect(screen.getByText("Stop 3 of 9").className).toContain("sm:inline");
  });

  it("keeps the absolute placement without a slot (room drawer or Ask panel open)", () => {
    renderBar("idle", null);
    expect(screen.getByTestId("walk-launcher").className).toMatch(/\babsolute\b/);
  });
});

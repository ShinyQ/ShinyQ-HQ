// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GpuTier } from "@/experience/types";
import { onHudCommand, type HudCommand } from "@/hud/events";
import { EnterHqButton } from "@/components/page/EnterHqButton";

const gate = vi.hoisted(() => ({ tier: null as GpuTier | null }));
vi.mock("@/experience/gate-tier", () => ({ useGateTier: () => gate.tier }));

let commands: HudCommand[] = [];
let offCommands = () => {};
let reactPrevented: boolean | null = null;
// Runs after React's root listener: records whether the component prevented the default, then stops
// jsdom from attempting a navigation it cannot perform.
const afterReact = (event: Event) => {
  reactPrevented = event.defaultPrevented;
  event.preventDefault();
};

function renderButton() {
  render(
    <NextIntlClientProvider locale="en" messages={{}}>
      <EnterHqButton label="Enter the 3D HQ" hint="Drive a rover through the five-floor tower" />
    </NextIntlClientProvider>,
  );
  return screen.getByRole("link", { name: "Enter the 3D HQ" });
}

beforeEach(() => {
  commands = [];
  reactPrevented = null;
  offCommands = onHudCommand((command) => commands.push(command));
  window.addEventListener("click", afterReact);
});

afterEach(() => {
  cleanup();
  offCommands();
  window.removeEventListener("click", afterReact);
  gate.tier = null;
});

describe("EnterHqButton", () => {
  it("is a real link that forces the lite tier and picks 3D, so it works before hydration and without the island", () => {
    const link = renderButton();
    expect(link).toHaveAttribute("href", "/en?tier=lite&view=3d");
    expect(link).toHaveAttribute("title", "Drive a rover through the five-floor tower");
    expect(link).toHaveAttribute("data-testid", "enter-hq");
  });

  it("opens the tower in place when the probe found 3D", () => {
    gate.tier = "full";
    fireEvent.click(renderButton());
    expect(reactPrevented).toBe(true);
    expect(commands).toEqual([{ type: "enter3d" }]);
  });

  it("follows the link on the static tier (software renderer), which forces the lite tier", () => {
    gate.tier = "static";
    fireEvent.click(renderButton());
    expect(reactPrevented).toBe(false);
    expect(commands).toEqual([]);
  });

  it("keeps modifier clicks native (new tab or window)", () => {
    gate.tier = "lite";
    fireEvent.click(renderButton(), { ctrlKey: true });
    expect(reactPrevented).toBe(false);
    expect(commands).toEqual([]);
  });
});

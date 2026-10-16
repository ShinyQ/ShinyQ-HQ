// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import id from "../../messages/id.json";
import { intents, type Intent } from "@/experience/input/intents";
import type { ExperienceData } from "@/experience/types";
import { FloorChip } from "@/hud/FloorChip";
import type { HudLayout } from "@/hud/layout";
import { getHQStore } from "@/store/useHQStore";

const data = {
  locale: "en",
  profile: { name: "Kurniadi", headline: "", role: "", location: "" },
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
  getHQStore().setState({ phase: "explore", floor: "L1", ride: null });
});

afterEach(() => {
  off();
  cleanup();
});

function mount(layout: HudLayout = "phone", locale: "en" | "id" = "en") {
  render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : id}>
      <FloorChip data={data} layout={layout} />
    </NextIntlClientProvider>,
  );
  return screen.getByTestId("floor-chip");
}

describe("FloorChip", () => {
  it("is a dialog button whose name starts with its visible code and nav label", () => {
    const chip = mount();
    expect(chip.tagName).toBe("BUTTON");
    expect(chip).toHaveAttribute("aria-haspopup", "dialog");
    expect(chip).toHaveAttribute("data-onboard", "elevator");
    expect(chip).toHaveAccessibleName("L1 Home: change floor (Lobby)");
    expect(chip.textContent?.replace(/\s+/g, " ").trim().startsWith("L1 Home")).toBe(true);
    expect(chip.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(chip).not.toHaveTextContent("Lobby");
  });

  it("also shows the floor name on tablets", () => {
    const chip = mount("tablet");
    expect(chip).toHaveTextContent("Lobby");
    expect(chip.textContent?.replace(/\s+/g, " ").trim().startsWith("L1 Home")).toBe(true);
  });

  it("follows the current floor and the locale", () => {
    getHQStore().setState({ floor: "L3" });
    const chip = mount("phone", "id");
    expect(chip).toHaveAccessibleName("L3 Karya: ganti lantai (Labs)");
  });

  it("opens the floor sheet; picking a floor rides the elevator, closes the sheet and returns focus", async () => {
    const user = userEvent.setup();
    const chip = mount();
    await user.click(chip);
    const dialog = screen.getByRole("dialog", { name: en.hud.elevator });
    expect(dialog).toHaveAttribute("data-testid", "floor-sheet");
    expect(dialog).toHaveAttribute("data-sheet", "bottom");
    const buttons = [...dialog.querySelectorAll<HTMLButtonElement>("[data-floor]")];
    expect(buttons.map((b) => b.getAttribute("data-floor"))).toEqual(["RF", "L4", "L3", "L2", "L1"]);
    expect(within(dialog).getByRole("button", { name: /^L1 Home/ })).toHaveAttribute("aria-current", "true");
    await user.click(within(dialog).getByRole("button", { name: /^L3 Work/ }));
    expect(emitted).toContainEqual({ type: "elevator", to: "L3" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(chip).toHaveFocus();
  });

  it("closes on Escape without riding and returns focus", async () => {
    const user = userEvent.setup();
    const chip = mount();
    await user.click(chip);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(emitted.filter((i) => i.type === "elevator")).toEqual([]);
    expect(chip).toHaveFocus();
  });
});

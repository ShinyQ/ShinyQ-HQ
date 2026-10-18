// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import id from "../../messages/id.json";
import { buildExperienceData } from "@/content/experience";
import type { Locale } from "@/content/schema";
import { intents, type Intent } from "@/experience/input/intents";
import { BeamFade, PadPicker } from "@/hud/pads/PadPicker";
import { getHQStore } from "@/store/useHQStore";

const names = { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" };
let emitted: Intent[] = [];
let off: () => void = () => {};

beforeEach(() => {
  emitted = [];
  off = intents.on((intent) => {
    emitted.push(intent);
  });
  getHQStore().setState({ phase: "explore", floor: "L2", ride: null, beam: null, picker: null, reducedMotion: false });
});

afterEach(() => {
  off();
  cleanup();
  getHQStore().setState({ picker: null, beam: null, reducedMotion: false });
});

function mount(locale: Locale = "en") {
  const data = buildExperienceData(locale, names);
  render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : id}>
      <PadPicker data={data} />
      <BeamFade />
    </NextIntlClientProvider>,
  );
  return data;
}

const option = (dialog: HTMLElement, value: string) => dialog.querySelector<HTMLButtonElement>(`[data-option="${value}"]`)!;

describe("pad pickers", () => {
  it("lists every floor like the elevator panel, with descriptions and thumbnails, the current floor marked and focused", async () => {
    mount();
    act(() => getHQStore().getState().openPicker({ kind: "floor" }));
    const dialog = await screen.findByRole("dialog", { name: "Take the elevator" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("data-sheet", "bottom");
    expect([...dialog.querySelectorAll("[data-option]")].map((b) => b.getAttribute("data-option"))).toEqual(["RF", "L4", "L3", "L2", "L1", "B1"]);
    expect(option(dialog, "L3")).toHaveTextContent("Work");
    expect(option(dialog, "L3")).toHaveTextContent("Product Engineering, AI Engineering, and Data and ML");
    expect(option(dialog, "L2")).toHaveAttribute("aria-current", "true");
    expect(option(dialog, "L2")).toHaveTextContent("You are here");
    expect(option(dialog, "L2")).toHaveFocus();
    expect(option(dialog, "RF").querySelector("img")).toHaveAttribute("src", "/floors/RF.webp");
  });

  it("moves with the arrow keys, Home and End, and rides the elevator on Enter", async () => {
    const user = userEvent.setup();
    mount();
    act(() => getHQStore().getState().openPicker({ kind: "floor" }));
    const dialog = await screen.findByRole("dialog", { name: "Take the elevator" });
    await user.keyboard("{ArrowUp}");
    expect(option(dialog, "L3")).toHaveFocus();
    await user.keyboard("{End}");
    expect(option(dialog, "B1")).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(option(dialog, "RF")).toHaveFocus();
    await user.keyboard("{Home}{ArrowDown}{ArrowDown}");
    expect(option(dialog, "L3")).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(getHQStore().getState().picker).toBeNull();
    expect(emitted).toContainEqual({ type: "elevator", to: "L3" });
  });

  it("lists B1 as a locked option with the hint and rides nowhere when picked", async () => {
    const user = userEvent.setup();
    getHQStore().setState({ b1Unlocked: false, floorsSeen: ["L1", "L2"] });
    mount();
    act(() => getHQStore().getState().openPicker({ kind: "floor" }));
    const dialog = await screen.findByRole("dialog", { name: "Take the elevator" });
    const locked = option(dialog, "B1");
    expect(locked).toHaveAttribute("aria-disabled", "true");
    expect(locked).toHaveTextContent("Locked");
    expect(locked).toHaveTextContent("Visit all 5 floors (2/5)");
    expect(locked.querySelector("img")).toBeNull();
    await user.click(locked);
    expect(emitted.filter((i) => i.type === "elevator")).toEqual([]);
    expect(screen.getByRole("dialog", { name: "Take the elevator" })).toBeInTheDocument();
    getHQStore().setState({ floorsSeen: [] });
  });

  it("closes on Esc without riding, and picking the current floor only closes", async () => {
    const user = userEvent.setup();
    mount();
    act(() => getHQStore().getState().openPicker({ kind: "floor" }));
    await screen.findByRole("dialog", { name: "Take the elevator" });
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(getHQStore().getState().picker).toBeNull();
    act(() => getHQStore().getState().openPicker({ kind: "floor" }));
    const dialog = await screen.findByRole("dialog", { name: "Take the elevator" });
    await user.click(option(dialog, "L2"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(emitted.filter((i) => i.type === "elevator")).toEqual([]);
  });

  it("lists every year plaza oldest first, notes the prologue on the first year and beams on a pick", async () => {
    const user = userEvent.setup();
    const data = mount();
    const years = data.career.years.map((y) => String(y.year));
    const from = data.career.years[2].year;
    const to = data.career.years[4].year;
    act(() => getHQStore().getState().openPicker({ kind: "year", from }));
    const dialog = await screen.findByRole("dialog", { name: "Teleport to a year" });
    expect([...dialog.querySelectorAll("[data-option]")].map((b) => b.getAttribute("data-option"))).toEqual(years);
    expect(option(dialog, String(from))).toHaveAttribute("aria-current", "true");
    expect(option(dialog, String(from))).toHaveFocus();
    expect(option(dialog, years[0])).toHaveTextContent("Prologue");
    expect(dialog.querySelectorAll("img")).toHaveLength(0);
    await user.click(option(dialog, String(to)));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(emitted).toContainEqual({ type: "teleport", pad: `teleport:${to}` });
  });

  it("closes itself when a ride, a room or the hologram takes over", async () => {
    mount();
    act(() => getHQStore().getState().openPicker({ kind: "floor" }));
    await screen.findByRole("dialog", { name: "Take the elevator" });
    act(() => getHQStore().setState({ phase: "room" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(getHQStore().getState().picker).toBeNull();
  });

  it("speaks Indonesian", async () => {
    mount("id");
    act(() => getHQStore().getState().openPicker({ kind: "floor" }));
    const dialog = await screen.findByRole("dialog", { name: "Naik lift" });
    expect(option(dialog, "L3")).toHaveTextContent("Karya");
    expect(option(dialog, "L3")).toHaveTextContent("Product Engineering, AI Engineering, serta Data dan ML");
    expect(within(dialog).getByRole("button", { name: "Tutup" })).toBeInTheDocument();
  });

  it("fades the screen during a reduced-motion teleport only", () => {
    mount();
    const fade = screen.getByTestId("beam-fade");
    expect(fade).toHaveClass("opacity-0");
    const beam = { pad: "teleport:2023", from: { x: 0, z: 0 }, to: { x: 140, z: -0.5 }, heading: Math.PI / 2, t: 0, jumped: false };
    act(() => getHQStore().setState({ beam }));
    expect(fade).toHaveClass("opacity-0");
    act(() => getHQStore().setState({ reducedMotion: true }));
    expect(fade).toHaveClass("opacity-100");
    act(() => getHQStore().setState({ beam: null }));
    expect(fade).toHaveClass("opacity-0");
  });
});

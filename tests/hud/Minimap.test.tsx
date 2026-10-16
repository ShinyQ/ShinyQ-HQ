// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import id from "../../messages/id.json";
import { buildExperienceData } from "@/content/experience";
import { buildFloorLayouts } from "@/experience/config";
import { interactRuntime } from "@/experience/interact/runtime";
import type { Interactable } from "@/experience/interact/registry";
import { intents, type Intent } from "@/experience/input/intents";
import { Minimap } from "@/hud/minimap/Minimap";
import { minimapPref } from "@/hud/minimap/pref";
import { getHQStore } from "@/store/useHQStore";

const data = buildExperienceData("en", en.floors);
const layouts = buildFloorLayouts(8);
const door = (key: string, room: string, label: string, x: number, z: number): Interactable =>
  ({ id: `L1:door:${key}`, floor: "L1", kind: "door", label, at: { x, z }, bounds: { minX: x - 1, maxX: x + 1, minZ: z - 1, maxZ: z + 1 }, action: { type: "open-room", room } }) as Interactable;
const items = [door("stats", "L1:stats", "Visits", 20, 4), door("profile", "L1:profile", "Profile", 6, -4)];

function mount(locale: "en" | "id" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : id}>
      <Minimap data={data} layouts={layouts} size="desktop" />
    </NextIntlClientProvider>,
  );
}

let emitted: Intent[] = [];
let off: () => void = () => {};

beforeEach(() => {
  minimapPref.set("on");
  interactRuntime.items = items;
  getHQStore().setState({ phase: "explore", floor: "L1", ride: null, visited: [], rover: { ...getHQStore().getState().rover, x: 0, z: 0, heading: 0 } });
  emitted = [];
  off = intents.on((i) => emitted.push(i));
});

afterEach(() => {
  off();
  cleanup();
  interactRuntime.items = [];
});

describe("Minimap", () => {
  it("is a round button named after the floor, with an aria-hidden SVG centred on the rover", () => {
    mount();
    const button = screen.getByRole("button", { name: "Map of L1 Home: open overview" });
    expect(button).toHaveAttribute("data-testid", "minimap");
    expect(button).toHaveAttribute("aria-haspopup", "dialog");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveAttribute("data-floor", "L1");
    const svg = button.querySelector("svg")!;
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("viewBox", "-22 -22 44 44");
    expect(svg.querySelector("[data-map='rover']")?.getAttribute("transform")).toContain("rotate(180)");
    expect(svg.querySelectorAll("[data-map='room']")).toHaveLength(2);
  });

  it("follows the 10 Hz rover mirror", () => {
    mount();
    act(() => getHQStore().getState().setRover({ x: 10, z: -4, heading: Math.PI / 2 }));
    const svg = screen.getByTestId("minimap").querySelector("svg")!;
    expect(svg).toHaveAttribute("viewBox", "-12 -26 44 44");
    expect(svg.querySelector("[data-map='rover']")?.getAttribute("transform")).toContain("rotate(90)");
  });

  it("dims visited rooms", () => {
    getHQStore().setState({ visited: ["L1:stats"] });
    mount();
    const rooms = [...screen.getByTestId("minimap").querySelectorAll("[data-map='room']")];
    expect(rooms.map((r) => r.getAttribute("class"))).toEqual([expect.not.stringContaining("opacity-40"), expect.stringContaining("opacity-40")]);
  });

  it("opens the overview with a room list west to east; a room closes it and drives there", () => {
    getHQStore().setState({ visited: ["L1:stats"] });
    mount();
    fireEvent.click(screen.getByTestId("minimap"));
    const dialog = screen.getByTestId("map-overview");
    expect(within(dialog).getByRole("heading", { name: "L1 Home" })).toBeInTheDocument();
    const rooms = within(dialog).getAllByTestId("map-room");
    expect(rooms.map((r) => r.textContent)).toEqual(["Profile", "Visits visited"]);
    expect(rooms[1]).toHaveAccessibleName("Visits visited");
    expect(dialog.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(dialog.querySelectorAll("svg text")).toHaveLength(2);
    expect(screen.getByTestId("minimap")).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(rooms[0]);
    expect(screen.queryByTestId("map-overview")).toBeNull();
    expect(emitted).toEqual([{ type: "interact", item: items[1] }]);
    expect(screen.getByTestId("minimap")).toHaveFocus();
  });

  it("keeps the overview map from shrinking in the scrolling sheet", () => {
    mount();
    fireEvent.click(screen.getByTestId("minimap"));
    expect(screen.getByTestId("map-overview-svg").getAttribute("class")).toContain("shrink-0");
  });

  it("labels kinds other than doors always, and doors only when few", () => {
    interactRuntime.items = [...items, { ...items[0], id: "L1:kiosk:k", kind: "kiosk", label: "Ask" } as Interactable, ...Array.from({ length: 12 }, (_, i) => door(`d${i}`, `L1:d${i}`, `D${i}`, i, 8))];
    mount();
    fireEvent.click(screen.getByTestId("minimap"));
    const texts = [...screen.getByTestId("map-overview-svg").querySelectorAll("text")].map((t) => t.textContent);
    expect(texts).toEqual(["Ask"]);
  });

  it("Esc and the close button close the overview and return focus to the minimap", () => {
    mount();
    fireEvent.click(screen.getByTestId("minimap"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("map-overview")).toBeNull();
    expect(screen.getByTestId("minimap")).toHaveFocus();
    fireEvent.click(screen.getByTestId("minimap"));
    fireEvent.click(within(screen.getByTestId("map-overview")).getByRole("button", { name: "Close map" }));
    expect(screen.queryByTestId("map-overview")).toBeNull();
  });

  it("the N key (map toggle intent) opens and closes the overview, even with the minimap off", () => {
    minimapPref.set("off");
    mount();
    expect(screen.queryByTestId("minimap")).toBeNull();
    act(() => intents.emit({ type: "toggle", what: "map" }));
    expect(screen.getByTestId("map-overview")).toBeInTheDocument();
    act(() => intents.emit({ type: "toggle", what: "map" }));
    expect(screen.queryByTestId("map-overview")).toBeNull();
  });

  it("minimapPref off hides the minimap at once", () => {
    mount();
    expect(screen.getByTestId("minimap")).toBeInTheDocument();
    act(() => minimapPref.set("off"));
    expect(screen.queryByTestId("minimap")).toBeNull();
  });

  it("hides during the intro and never opens the overview there", () => {
    getHQStore().setState({ phase: "intro" });
    mount();
    expect(screen.queryByTestId("minimap")).toBeNull();
    act(() => intents.emit({ type: "toggle", what: "map" }));
    expect(screen.queryByTestId("map-overview")).toBeNull();
  });

  it("lists only the current floor's targets", () => {
    interactRuntime.items = [...items, { ...items[0], id: "L2:door:x", floor: "L2", label: "Elsewhere" } as Interactable];
    mount();
    fireEvent.click(screen.getByTestId("minimap"));
    expect(within(screen.getByTestId("map-overview")).getAllByTestId("map-room")).toHaveLength(2);
  });

  it("follows the point-and-go targets without any store change", () => {
    mount();
    const svg = () => screen.getByTestId("minimap").querySelector("svg")!;
    expect(svg().querySelectorAll("[data-map='room']")).toHaveLength(2);
    act(() => interactRuntime.setItems([items[0]]));
    expect(svg().querySelectorAll("[data-map='room']")).toHaveLength(1);
    act(() => interactRuntime.setItems([...items, door("extra", "L1:extra", "Extra", 30, 0)]));
    expect(svg().querySelectorAll("[data-map='room']")).toHaveLength(3);
  });

  it("returns focus to the opener when the minimap button is off", () => {
    minimapPref.set("off");
    const opener = document.createElement("button");
    document.body.append(opener);
    mount();
    opener.focus();
    act(() => intents.emit({ type: "toggle", what: "map" }));
    fireEvent.click(screen.getByRole("button", { name: "Close map" }));
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it("speaks Indonesian", () => {
    getHQStore().setState({ visited: ["L1:stats"] });
    mount("id");
    const button = screen.getByTestId("minimap");
    expect(button).toHaveAccessibleName(`Peta L1 ${id.hud.floorLabel.L1}: buka ikhtisar`);
    fireEvent.click(button);
    const dialog = screen.getByTestId("map-overview");
    expect(within(dialog).getByRole("heading", { level: 3, name: "Tempat di lantai ini" })).toBeInTheDocument();
    expect(within(dialog).getAllByTestId("map-room")[1]).toHaveAccessibleName("Visits sudah dikunjungi");
    expect(within(dialog).getByRole("button", { name: "Tutup peta" })).toBeInTheDocument();
  });
});

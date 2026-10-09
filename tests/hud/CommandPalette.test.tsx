// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import id from "../../messages/id.json";
import type { Mission, RoomId } from "@/content/schema";
import type { RoomInfo, YearInfo } from "@/experience/missions/rooms";
import { CommandPalette, type CommandPaletteProps } from "@/hud/CommandPalette";
import type { PaletteActionId } from "@/hud/palette-types";
import { buildPaletteEntries } from "@/hud/search";

const missions: Mission[] = [
  { id: "best-ai", order: 0, label: { en: "Show me your best AI work", id: "Lihat karya AI terbaiknya" }, steps: [{ kind: "elevator", floor: "L3" }] },
  { id: "hire", order: 1, label: { en: "Hire / contact", id: "Rekrut / hubungi" }, steps: [{ kind: "elevator", floor: "RF" }] },
];

const room = (id: RoomId, kind: RoomInfo["kind"], title: string, keywords: string[] = []): RoomInfo => ({
  id,
  floor: id.slice(0, 2) as RoomInfo["floor"],
  slug: id.slice(3),
  kind,
  title: { en: title, id: title },
  subtitle: { en: `${title} subtitle`, id: `${title} subjudul` },
  keywords,
  path: `/${id.slice(3)}`,
  floorPath: "/",
  surpriseWeight: 1,
});

const rooms: RoomInfo[] = [
  room("L3:voice-ai-contact-center", "pod", "Realtime Voice AI Contact Center", ["Azure OpenAI Realtime"]),
  room("L3:vendor-management-portal", "pod", "Vendor Management Portal", ["FastAPI"]),
  room("L4:crud-nodejs", "post", "CRUD in Node.js", ["nodejs"]),
  room("RF:contact", "roof", "Comms terminals", ["email"]),
];

const years: YearInfo[] = [{ year: 2024, room: "L2:jenius-2024", path: "/journey#y2024", keywords: ["Jenius"] }];

const actionLabels: Record<PaletteActionId, { en: string; id: string }> = {
  "download-cv": { en: "Download CV", id: "Unduh CV" },
  "copy-email": { en: "Copy email", id: "Salin email" },
  "toggle-language": { en: "Baca dalam Bahasa Indonesia", id: "Read in English" },
  "toggle-sound": { en: "Toggle sound", id: "Suara" },
  "quick-view": { en: "Quick view", id: "Tampilan ringkas" },
};

const entries = buildPaletteEntries({ missions, rooms, years, actionLabels }, ["download-cv", "copy-email"]);

function setup(overrides: Partial<CommandPaletteProps> = {}, messages: typeof en = en, locale: "en" | "id" = "en") {
  const props: CommandPaletteProps = {
    open: true,
    locale,
    entries,
    recent: [],
    onSelect: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  const ui = (p: CommandPaletteProps) => (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <button type="button">before</button>
      <CommandPalette {...p} />
    </NextIntlClientProvider>
  );
  const view = render(ui(props));
  return { props, rerender: (p: Partial<CommandPaletteProps>) => view.rerender(ui({ ...props, ...p })), user: userEvent.setup() };
}

const input = () => screen.getByRole("combobox");
const activeOption = () => document.getElementById(input().getAttribute("aria-activedescendant") ?? "");

afterEach(() => cleanup());

describe("CommandPalette", () => {
  it("renders nothing when closed", () => {
    setup({ open: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens as a modal dialog with the input focused and missions listed", () => {
    setup();
    const dialog = screen.getByRole("dialog", { name: en.hud.palette.title });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(input()).toHaveFocus();
    expect(input()).toHaveAttribute("placeholder", en.hud.palette.placeholder);
    expect(input()).toHaveAttribute("aria-controls", screen.getByRole("listbox").id);
    expect(screen.getByRole("group", { name: en.hud.palette.groups.missions })).toBeInTheDocument();
    expect(activeOption()?.textContent).toContain("Show me your best AI work");
    expect(activeOption()).toHaveAttribute("aria-selected", "true");
  });

  it("runs the top match on Enter after typing, closing first", async () => {
    const calls: string[] = [];
    const onClose = vi.fn(() => calls.push("close"));
    const onSelect = vi.fn(() => calls.push("select"));
    const { user } = setup({ onClose, onSelect });
    await user.type(input(), "voice");
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith(entries.find((e) => e.key === "room:L3:voice-ai-contact-center"));
    expect(calls).toEqual(["close", "select"]);
  });

  it("moves the active option with the arrow keys, wrapping around", async () => {
    const { user } = setup();
    const first = input().getAttribute("aria-activedescendant");
    await user.keyboard("{ArrowDown}");
    const second = input().getAttribute("aria-activedescendant");
    expect(second).not.toBe(first);
    expect(activeOption()?.textContent).toContain("Hire / contact");
    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(activeOption()?.textContent).toContain("Hire / contact");
    await user.keyboard("{Home}");
    expect(input()).toHaveAttribute("aria-activedescendant", first);
  });

  it("jumps between groups with Tab and Shift+Tab while focus stays in the input", async () => {
    const { user } = setup({ recent: ["RF:contact"] });
    await user.keyboard("{Tab}");
    expect(input()).toHaveFocus();
    expect(activeOption()?.textContent).toContain("Comms terminals");
    await user.keyboard("{Tab}");
    expect(activeOption()?.textContent).toContain("Show me your best AI work");
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(input()).toHaveFocus();
    expect(activeOption()?.textContent).toContain("Comms terminals");
  });

  it("closes on Escape and restores focus to the previously focused element", async () => {
    const onClose = vi.fn();
    const { rerender, user } = setup({ open: false, onClose });
    const before = screen.getByRole("button", { name: "before" });
    act(() => before.focus());
    rerender({ open: true });
    expect(input()).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    rerender({ open: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(before).toHaveFocus();
  });

  it("closes when the backdrop or the close button is clicked", async () => {
    const onClose = vi.fn();
    const { user } = setup({ onClose });
    await user.click(screen.getByRole("button", { name: en.hud.palette.close }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("dialog").previousElementSibling as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("selects an option on click and activates it on hover", async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const { user } = setup({ onSelect, onClose });
    const hire = screen.getByRole("option", { name: /Hire \/ contact/ });
    await user.hover(hire);
    expect(hire).toHaveAttribute("aria-selected", "true");
    await user.click(hire);
    expect(onClose).toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith(entries.find((e) => e.key === "mission:hire"));
  });

  it("shows floor badges with the floor name", () => {
    setup();
    const option = screen.getByRole("option", { name: /Show me your best AI work/ });
    expect(option.querySelector(`[title="${en.floors.L3}"]`)?.textContent).toContain("L3");
  });

  it("shows a filter chip that Backspace on an empty query clears", async () => {
    const onFilterChange = vi.fn();
    const { user, rerender } = setup({ filter: "pods", onFilterChange });
    expect(screen.getByText(en.hud.palette.filter.pods)).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(2);
    await user.keyboard("{Backspace}");
    expect(onFilterChange).toHaveBeenCalledWith(null);
    rerender({ filter: null, onFilterChange });
    expect(screen.queryByText(en.hud.palette.filter.pods)).not.toBeInTheDocument();
  });

  it("clears the filter from the chip button", async () => {
    const onFilterChange = vi.fn();
    const { user } = setup({ filter: "posts", onFilterChange });
    await user.click(screen.getByRole("button", { name: en.hud.palette.clearFilter }));
    expect(onFilterChange).toHaveBeenCalledWith(null);
  });

  it("does not clear the filter while the query has text", async () => {
    const onFilterChange = vi.fn();
    const { user } = setup({ filter: "pods", onFilterChange });
    await user.type(input(), "ve{Backspace}");
    expect(onFilterChange).not.toHaveBeenCalled();
  });

  it("shows the empty state when nothing matches", async () => {
    const { user } = setup();
    await user.type(input(), "zzqqxx");
    expect(screen.getByRole("status")).toHaveTextContent('No results for "zzqqxx"');
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(input()).toHaveAttribute("aria-expanded", "false");
  });

  it("resets the query each time it opens", async () => {
    const { user, rerender } = setup();
    await user.type(input(), "voice");
    rerender({ open: false });
    rerender({ open: true });
    expect(input()).toHaveValue("");
  });

  it("renders Indonesian copy for the id locale", () => {
    setup({}, id as typeof en, "id");
    expect(input()).toHaveAttribute("placeholder", id.hud.palette.placeholder);
    expect(screen.getByRole("option", { name: /Lihat karya AI terbaiknya/ })).toBeInTheDocument();
  });
});

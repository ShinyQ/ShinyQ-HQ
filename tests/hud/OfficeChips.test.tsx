// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OFFICE_FIXTURES_V2 } from "@/lib/office/fixtures";
import type { OfficeFeed, OfficeFeedSnapshot } from "@/lib/office/poll";
import { getHQStore } from "@/store/useHQStore";
import { statesA, statesB } from "../../e2e/office-fixtures";
import en from "../../messages/en.json";
import ids from "../../messages/id.json";

const live = vi.hoisted(() => ({ feed: { status: "idle", snapshot: null, fetchedAt: 0 } as OfficeFeed }));
const bridge = vi.hoisted(() => ({ goToRoom: vi.fn() }));
vi.mock("@/experience/floors/lobby/office/live", () => ({ useOfficeFeed: () => live.feed, officeLive: { want: vi.fn(), wanted: () => true } }));
vi.mock("@/experience/missions/bridge", () => bridge);

import { OfficeChips } from "@/experience/floors/lobby/office/OfficeChips";
import { officeRuntime, setChipFar, setChipsCompact } from "@/experience/floors/lobby/office/runtime";

const renderChips = () =>
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <OfficeChips />
    </NextIntlClientProvider>,
  );
const chip = (slot: number) => screen.getAllByTestId("office-chip").find((el) => el.dataset.slot === String(slot))!;
const head = (slot: number) => chip(slot).querySelector<HTMLElement>("[data-testid=office-chip-head]")!;

beforeEach(() => {
  getHQStore().setState({ phase: "explore", floor: "L1", activeRoom: null, device: { viewport: "desktop", camera: "desktop", coarse: false } });
  live.feed = { status: "ready", snapshot: statesA(Date.now()), fetchedAt: Date.now() };
  // Chips start far (`officeRuntime.chipFar`); these tests start them near, as at the near pose.
  for (let slot = 0; slot < 5; slot++) setChipFar(slot, false);
});
afterEach(() => {
  cleanup();
  bridge.goToRoom.mockClear();
  for (let slot = 0; slot < 5; slot++) setChipFar(slot, true);
  setChipsCompact(false);
});

describe("Agent Office chips", () => {
  it("shows one near chip per Rover with agent and activity and CI progress; the label keeps the title or Client project and the jobs", () => {
    renderChips();
    expect(screen.getAllByTestId("office-chip")).toHaveLength(5);
    expect(chip(0)).toHaveTextContent(/^Copilot · Editing$/);
    expect(chip(0)).not.toHaveTextContent("Agent office scene");
    expect(chip(0)).toHaveAttribute("aria-label", "Desk 1: Copilot · Editing, Agent office scene");
    expect(chip(1)).toHaveAttribute("aria-label", `Desk 2: Claude · Planning, ${en.office.clientProject}`);
    expect(chip(4)).toHaveAttribute("aria-label", expect.stringMatching(/, Office chips, 7 of 12 jobs$/));
    expect(chip(0)).not.toHaveAttribute("aria-describedby");
    expect(chip(4).querySelector("[data-progress]")).toHaveAttribute("data-progress", "58");
    expect(chip(0)).toHaveAttribute("data-state", "working");
    expect(officeRuntime.chips.every((el) => el instanceof HTMLElement)).toBe(true);
  });

  it("adds the helpers to a near chip's head and label, with a +N pill past the four drones drawn", () => {
    live.feed = { status: "ready", snapshot: OFFICE_FIXTURES_V2.busy as OfficeFeedSnapshot, fetchedAt: Date.now() };
    renderChips();
    expect(head(0)).toHaveTextContent(/^Copilot · Editing · 3 helpers$/);
    expect(chip(0)).toHaveAttribute("aria-label", expect.stringMatching(/^Desk 1: Copilot · Editing · 3 helpers, /));
    expect(chip(0).querySelector("[data-testid=office-chip-more]")).toBeNull();
    expect(head(2)).toHaveTextContent(/^Copilot · Watching CI · 6 helpers$/);
    expect(chip(2)).toHaveTextContent(/^Copilot · Watching CI · 6 helpers\+2$/);
    expect(chip(2).querySelector("[data-testid=office-chip-more]")).toHaveTextContent(/^\+2$/);
    expect(chip(2).querySelector("[data-testid=office-chip-more]")).toHaveAttribute("aria-hidden", "true");
    expect(chip(1)).not.toHaveTextContent(/helper|\+/);
    expect(chip(1)).toHaveAttribute("aria-label", `Desk 2: Claude · Planning, ${en.office.clientProject}`);
  });

  /** The busy crew with Claude at the 6-helper desk (slot 2), as on the owner's captures. */
  const claudeSix = (): OfficeFeed => {
    const snap = OFFICE_FIXTURES_V2.busy as OfficeFeedSnapshot;
    return { status: "ready", snapshot: { ...snap, desks: snap.desks.map((d) => (d.slot === 2 ? { ...d, agent: "claude" } : d)) }, fetchedAt: Date.now() };
  };
  /** jsdom lays nothing out: the head's text is 7 px a character, in a span `wide` px wide (`pill` px beside a "+N" pill). */
  const mockHeadWidths = (wide: number, pill: number) => {
    const width = (el: HTMLElement) => (el.dataset.testid === "office-chip-head" ? (el.textContent ?? "").length * 7 : 0);
    const room = (el: HTMLElement) => (el.dataset.testid === "office-chip-head" ? Math.min(width(el), el.nextElementSibling ? pill : wide) : 0);
    const scroll = vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(function (this: HTMLElement) {
      return width(this);
    });
    const client = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
      return room(this);
    });
    return () => {
      scroll.mockRestore();
      client.mockRestore();
    };
  };
  const pill = (slot: number) => chip(slot).querySelector("[data-testid=office-chip-more]");

  const activity = (slot: number) => chip(slot).querySelector<HTMLElement>("[data-testid=office-chip-activity]");

  it("cuts a near head's activity with an ellipsis and drops only the word helpers, never the activity, the name or the +N pill; the label keeps the full text", () => {
    live.feed = claudeSix();
    const restore = mockHeadWidths(140, 110);
    try {
      renderChips();
      // "Copilot · Editing · 3 helpers" (203 px) overflows: the word goes, the activity stays (cut by its ellipsis).
      expect(head(0)).toHaveTextContent(/^Copilot · Editing · 3$/);
      expect(head(0)).toHaveAttribute("data-drop", "1");
      expect(activity(0)).toHaveTextContent(/^· Editing$/);
      expect(chip(0)).toHaveAttribute("aria-label", expect.stringMatching(/^Desk 1: Copilot · Editing · 3 helpers, /));
      // Beside the "+2" pill: "Claude · Watching CI · 6" and the pill.
      expect(head(2)).toHaveTextContent(/^Claude · Watching CI · 6$/);
      expect(head(2)).toHaveAttribute("data-drop", "1");
      expect(pill(2)).toHaveTextContent(/^\+2$/);
      expect(chip(2)).toHaveTextContent(/^Claude · Watching CI · 6\+2$/);
      expect(chip(2)).toHaveAttribute("aria-label", expect.stringContaining("Claude · Watching CI · 6 helpers"));
      // A head that fits stays whole: "Claude · Planning" (119 px).
      expect(head(1)).toHaveTextContent(/^Claude · Planning$/);
      expect(head(1)).toHaveAttribute("data-drop", "0");
      // A far turn and back starts whole again (and drops again).
      act(() => setChipFar(0, true));
      expect(chip(0)).toHaveTextContent(/^Copilot3$/);
      act(() => setChipFar(0, false));
      expect(head(0)).toHaveTextContent(/^Copilot · Editing · 3$/);
    } finally {
      restore();
    }
  });

  it("keeps the word helpers while the head fits", () => {
    live.feed = claudeSix();
    const restore = mockHeadWidths(260, 260);
    try {
      renderChips();
      expect(head(2)).toHaveTextContent(/^Claude · Watching CI · 6 helpers$/);
      expect(head(2)).toHaveAttribute("data-drop", "0");
      expect(chip(2)).toHaveTextContent(/^Claude · Watching CI · 6 helpers\+2$/);
    } finally {
      restore();
    }
  });

  it("never drops a long activity without helpers: the ellipsis cuts it, the head keeps all its text", () => {
    live.feed = { status: "ready", snapshot: statesB(Date.now()), fetchedAt: Date.now() };
    const restore = mockHeadWidths(60, 60);
    try {
      renderChips();
      expect(head(0)).toHaveTextContent(/^Codex · Asking Kurniadi$/);
      expect(head(0)).toHaveAttribute("data-drop", "0");
      expect(activity(0)).toHaveTextContent(/^· Asking Kurniadi$/);
    } finally {
      restore();
    }
  });

  it("lays a near head out as the name and the helpers (never shrinking) around the activity, the part an ellipsis cuts", () => {
    live.feed = { status: "ready", snapshot: OFFICE_FIXTURES_V2.busy as OfficeFeedSnapshot, fetchedAt: Date.now() };
    renderChips();
    expect(head(2)).toHaveClass("flex", "min-w-0", "overflow-hidden", "whitespace-pre");
    expect(head(2)).toHaveAttribute("data-drop", "0");
    const [name, cut, count] = Array.from(head(2).children) as HTMLElement[];
    expect(name).toHaveAttribute("data-testid", "office-chip-name");
    expect(name).toHaveClass("shrink-0");
    expect(cut).toBe(activity(2));
    expect(cut).toHaveClass("min-w-0", "overflow-hidden", "text-ellipsis");
    expect(cut.style.minWidth).toBe("3.5em");
    expect(count).toHaveClass("shrink-0");
    expect(count).toHaveTextContent(/^· 6 helpers$/);
    expect(head(2).nextElementSibling).toHaveAttribute("data-testid", "office-chip-more");
    // Without helpers the activity may shrink to nothing: the name always fits a near chip.
    expect(activity(1)!.style.minWidth).toBe("0px");
  });

  it("says one helper, and in Indonesian asisten", () => {
    const snap = OFFICE_FIXTURES_V2.busy as OfficeFeedSnapshot;
    live.feed = { status: "ready", snapshot: { ...snap, desks: snap.desks.map((d) => (d.slot === 0 ? { ...d, helpers: 1 } : d)) }, fetchedAt: Date.now() };
    const { unmount } = renderChips();
    expect(head(0)).toHaveTextContent(/^Copilot · Editing · 1 helper$/);
    unmount();
    live.feed = { status: "ready", snapshot: snap, fetchedAt: Date.now() };
    render(
      <NextIntlClientProvider locale="id" messages={ids}>
        <OfficeChips />
      </NextIntlClientProvider>,
    );
    expect(head(0)).toHaveTextContent(/^Copilot · Mengedit · 3 asisten$/);
    expect(chip(0)).toHaveAttribute("aria-label", expect.stringMatching(/^Meja 1: Copilot · Mengedit · 3 asisten, /));
  });

  it("shows a far chip's helpers as a drone ring and their total (no +) after the name, and a phone's dot keeps them in its label only", () => {
    live.feed = { status: "ready", snapshot: OFFICE_FIXTURES_V2.busy as OfficeFeedSnapshot, fetchedAt: Date.now() };
    renderChips();
    act(() => setChipFar(2, true));
    expect(chip(2)).toHaveTextContent(/^Copilot6$/);
    const count = chip(2).querySelector<HTMLElement>("[data-testid=office-chip-helpers]")!;
    expect(count).toHaveAttribute("aria-hidden", "true");
    expect(count).toHaveTextContent(/^6$/);
    const ring = count.querySelector<HTMLElement>(".hq-dot")!;
    expect(ring).toHaveClass("hq-dot-md");
    expect(ring.style.background).toBe("transparent");
    expect(ring.style.border).toContain("solid");
    expect(chip(2).querySelector("[data-testid=office-chip-head]")).toBeNull();
    expect(chip(2).querySelector("[data-testid=office-chip-more]")).toBeNull();
    expect(chip(2)).toHaveAttribute("aria-label", expect.stringContaining("Copilot · Watching CI · 6 helpers"));
    act(() => setChipFar(1, true));
    expect(chip(1)).toHaveTextContent(/^Claude$/);
    cleanup();
    getHQStore().setState({ device: { viewport: "mobile", camera: "mobile", coarse: true } });
    renderChips();
    act(() => setChipFar(0, true));
    expect(chip(0)).toHaveAttribute("data-compact", "true");
    expect(chip(0)).toHaveTextContent(/^$/);
    expect(chip(0)).toHaveAttribute("aria-label", expect.stringContaining("3 helpers"));
  });

  it("draws a hidden 1 px leader line and its tick per chip in its state's colour, out of the way of pointers and the accessibility tree", () => {
    renderChips();
    const leads = screen.getAllByTestId("office-chip-lead", { exact: true });
    expect(leads).toHaveLength(5);
    expect(officeRuntime.leads).toEqual(leads.sort((a, b) => Number(a.dataset.slot) - Number(b.dataset.slot)));
    for (const lead of leads) {
      expect(lead).toHaveAttribute("aria-hidden", "true");
      expect(lead).toHaveClass("pointer-events-none");
      expect(lead.style.visibility).toBe("hidden");
      expect(lead.style.width).toBe("1px");
      expect(lead.style.transition).toBe("");
    }
    expect(leads[0].style.background).toBe(chip(0).querySelector<HTMLElement>(".hq-dot")!.style.color);
    // The tick where the line meets the screen wall's top: hidden until drawn, in the same colour.
    const ticks = screen.getAllByTestId("office-chip-tick", { exact: true });
    expect(officeRuntime.ticks).toEqual(ticks.sort((a, b) => Number(a.dataset.slot) - Number(b.dataset.slot)));
    for (const tick of ticks) {
      expect(tick).toHaveAttribute("aria-hidden", "true");
      expect(tick).toHaveClass("pointer-events-none");
      expect(tick.style.visibility).toBe("hidden");
      expect([tick.style.width, tick.style.height]).toEqual(["10px", "2px"]);
    }
    expect(ticks[0].style.background).toBe(leads[0].style.background);
  });

  it("labels an off-duty Rover and shows a far chip's name only, its label kept whole", () => {
    live.feed = { status: "ready", snapshot: statesB(Date.now()), fetchedAt: Date.now() };
    renderChips();
    expect(chip(4)).toHaveTextContent(en.office["3d"].offDuty);
    expect(chip(4)).toHaveAttribute("aria-label", `Desk 5: ${en.office["3d"].offDuty}`);
    expect(chip(1)).toHaveAttribute("aria-label", expect.stringContaining("Office drawers"));
    act(() => setChipFar(1, true));
    expect(chip(1)).toHaveTextContent(/^Copilot$/);
    expect(chip(1)).toHaveAttribute("aria-label", expect.stringContaining("Office drawers"));
    expect(chip(1)).toHaveAttribute("data-far", "true");
  });

  it("renders a far chip compact on phones: the state dot only, its label kept and a 32 px tap target", () => {
    getHQStore().setState({ device: { viewport: "mobile", camera: "mobile", coarse: true } });
    renderChips();
    act(() => setChipFar(1, true));
    const far = chip(1);
    expect(far).toHaveAttribute("data-far", "true");
    expect(far).toHaveAttribute("data-compact", "true");
    expect(far).toHaveTextContent(/^$/);
    expect(far.querySelector(".hq-dot")).not.toBeNull();
    expect(far).toHaveAttribute("aria-label", `Desk 2: Claude · Planning, ${en.office.clientProject}`);
    expect(far).not.toHaveAttribute("aria-describedby");
    const pill = far.querySelector(".min-h-8") as HTMLElement;
    expect(pill).not.toBeNull();
    expect(parseFloat(pill.style.minWidth)).toBeGreaterThanOrEqual(32);
    // A near chip on a phone (never one at the stop, `OfficeWatch`) would show its line.
    expect(chip(0)).toHaveAttribute("data-compact", "false");
    expect(chip(0)).toHaveTextContent("Copilot · Editing");
  });

  it("keeps a far chip's name on desktops in the office view, the chip at most 176 px wide (a longer line ends in an ellipsis)", () => {
    renderChips();
    act(() => setChipFar(1, true));
    expect(chip(1)).toHaveAttribute("data-compact", "false");
    expect(chip(1)).toHaveTextContent(/^Claude$/);
    expect(chip(1).style.maxWidth).toBe("176px");
    const pill = chip(1).querySelector(".min-h-8") as HTMLElement;
    expect(pill.style.maxWidth).toBe("100%");
    expect(pill.querySelector(".truncate")).toHaveTextContent("Claude");
  });

  it("shows every far chip as a compact dot on any screen outside the office view (`officeRuntime.compact`)", () => {
    renderChips();
    act(() => {
      for (let slot = 0; slot < 5; slot++) setChipFar(slot, true);
      setChipsCompact(true);
    });
    for (let slot = 0; slot < 5; slot++) {
      expect(chip(slot)).toHaveAttribute("data-compact", "true");
      expect(chip(slot)).toHaveTextContent(/^$/);
    }
    expect(chip(1)).toHaveAttribute("aria-label", `Desk 2: Claude · Planning, ${en.office.clientProject}`);
    act(() => setChipsCompact(false));
    expect(chip(1)).toHaveAttribute("data-compact", "false");
    expect(chip(1)).toHaveTextContent("Claude");
  });

  it("opens the Rover's desk drawer through the room mission (drive to the office stop, then open)", () => {
    renderChips();
    fireEvent.click(chip(2));
    expect(bridge.goToRoom).toHaveBeenCalledWith("L1:office-desk-3");
    // The chip stays visibility-hidden until the scene places it, so read the label rather than the computed name.
    expect(chip(2)).toHaveAttribute("aria-label", expect.stringMatching(/^Desk 3: Codex · Reading/));
  });

  it("hides every chip on phones while a drawer covers the screen", () => {
    getHQStore().setState({ phase: "room", device: { viewport: "mobile", camera: "mobile", coarse: true } });
    renderChips();
    expect(screen.queryAllByTestId("office-chip")).toHaveLength(0);
    expect(officeRuntime.chips.every((el) => el === null)).toBe(true);
    expect(officeRuntime.leads.every((el) => el === null)).toBe(true);
  });
});

// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import type { OfficeFeed } from "@/lib/office/poll";
import { getHQStore } from "@/store/useHQStore";
import { statesA, statesB } from "../../e2e/office-fixtures";

const live = vi.hoisted(() => ({ feed: { status: "idle", snapshot: null, fetchedAt: 0 } as OfficeFeed }));
const bridge = vi.hoisted(() => ({ goToRoom: vi.fn() }));
vi.mock("@/experience/floors/lobby/office/live", () => ({ useOfficeFeed: () => live.feed, officeLive: { want: vi.fn(), wanted: () => true } }));
vi.mock("@/experience/missions/bridge", () => bridge);

import { OfficeChips } from "@/experience/floors/lobby/office/OfficeChips";
import { officeRuntime, setChipFar } from "@/experience/floors/lobby/office/runtime";

const renderChips = () =>
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <OfficeChips />
    </NextIntlClientProvider>,
  );
const chip = (slot: number) => screen.getAllByTestId("office-chip").find((el) => el.dataset.slot === String(slot))!;

beforeEach(() => {
  getHQStore().setState({ phase: "explore", floor: "L1", activeRoom: null, device: { viewport: "desktop", camera: "desktop", coarse: false } });
  live.feed = { status: "ready", snapshot: statesA(Date.now()), fetchedAt: Date.now() };
});
afterEach(() => {
  cleanup();
  bridge.goToRoom.mockClear();
  for (let slot = 0; slot < 5; slot++) setChipFar(slot, false);
});

describe("Agent Office chips", () => {
  it("shows one chip per Rover with agent and activity, the title or Client project, and CI progress", () => {
    renderChips();
    expect(screen.getAllByTestId("office-chip")).toHaveLength(5);
    expect(chip(0)).toHaveTextContent("Copilot · Editing");
    expect(chip(0)).toHaveTextContent("Agent office scene");
    expect(chip(1)).toHaveTextContent(en.office.clientProject);
    expect(chip(0)).toHaveAccessibleDescription("Agent office scene");
    expect(chip(1)).toHaveAccessibleDescription(en.office.clientProject);
    expect(chip(4).querySelector("[data-progress]")).toHaveAttribute("data-progress", "58");
    expect(chip(0)).toHaveAttribute("data-state", "working");
    expect(officeRuntime.chips.every((el) => el instanceof HTMLElement)).toBe(true);
  });

  it("labels an off-duty Rover and drops the details of a far chip", () => {
    live.feed = { status: "ready", snapshot: statesB(Date.now()), fetchedAt: Date.now() };
    renderChips();
    expect(chip(4)).toHaveTextContent(en.office["3d"].offDuty);
    expect(chip(1)).toHaveTextContent("Office drawers");
    act(() => setChipFar(1, true));
    expect(chip(1)).not.toHaveTextContent("Office drawers");
    expect(chip(1)).toHaveAttribute("data-far", "true");
    expect(chip(1)).not.toHaveAttribute("aria-describedby");
  });

  it("opens the Rover's desk drawer through the room mission (drive to the office stop, then open)", () => {
    renderChips();
    fireEvent.click(chip(2));
    expect(bridge.goToRoom).toHaveBeenCalledWith("L1:office-desk-3");
    // The chip stays visibility-hidden until the scene places it, so read the label rather than the computed name.
    expect(chip(2)).toHaveAttribute("aria-label", "Desk 3: Codex · Reading");
  });

  it("hides every chip on phones while a drawer covers the screen", () => {
    getHQStore().setState({ phase: "room", device: { viewport: "mobile", camera: "mobile", coarse: true } });
    renderChips();
    expect(screen.queryAllByTestId("office-chip")).toHaveLength(0);
    expect(officeRuntime.chips.every((el) => el === null)).toBe(true);
  });
});

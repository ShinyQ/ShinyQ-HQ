// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OFFICE_FIXTURES_V4 } from "@/lib/office/fixtures";
import type { OfficeFeedSnapshot } from "@/lib/office/poll";
import type { OfficeHistoryDay } from "@/lib/office/protocolHistory";
import { getHQStore } from "@/store/useHQStore";
import en from "../../messages/en.json";
import ids from "../../messages/id.json";

vi.mock("@/experience/floors/lobby/office/live", () => ({ useOfficeFeed: () => ({ status: "idle", snapshot: null, fetchedAt: 0 }), officeLive: { want: vi.fn(), wanted: () => true, now: () => Date.now() } }));

import { ReplayControls } from "@/experience/floors/lobby/office/ReplayControls";
import { officeReplay, publishReplay, REPLAY_OFF } from "@/experience/floors/lobby/office/replayLink";
import { REPLAY_STATE_OFF, type ReplayController, type ReplayState } from "@/experience/floors/lobby/office/replayFeed";

const o = en.office["3d"].replay;
const day = (d: string, events: number): OfficeHistoryDay => ({ day: d, events, prs: 0, runs: 0, deploys: 0 }) as OfficeHistoryDay;
/** Eight days, newest first; the 16th and the 12th are quiet. */
const DAYS = ["2026-10-19", "2026-10-18", "2026-10-17", "2026-10-16", "2026-10-15", "2026-10-14", "2026-10-13", "2026-10-12"].map((d) => day(d, d === "2026-10-16" || d === "2026-10-12" ? 0 : 5));

const ctl = {
  open: vi.fn(() => Promise.resolve()),
  play: vi.fn(() => Promise.resolve()),
  pause: vi.fn(),
  resume: vi.fn(),
  seek: vi.fn(),
  nextHour: vi.fn(),
};
const state = (patch: Partial<ReplayState>): ReplayState => ({ ...REPLAY_STATE_OFF, days: DAYS, ...patch });
const snapshot = OFFICE_FIXTURES_V4.busy as OfficeFeedSnapshot;
const publish = (patch: Partial<ReplayState>, snap: OfficeFeedSnapshot | null = snapshot) => act(() => publishReplay(state(patch), snap));
const playing = { status: "playing" as const, day: "2026-10-19", label: "Mon 19 Oct", playS: 12, duration: 45, dayS: 50_700, clock: "14:05", seq: 1 };
const view = (locale: "en" | "id" = "en") =>
  render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : ids}>
      <ReplayControls locale={locale} />
    </NextIntlClientProvider>,
  );

beforeEach(() => {
  officeReplay.controller = ctl as unknown as ReplayController;
  getHQStore().setState({ reducedMotion: false });
});
afterEach(() => {
  cleanup();
  act(() => publishReplay(REPLAY_OFF, null));
  for (const fn of Object.values(ctl)) fn.mockClear();
  officeReplay.controller = null;
});

describe("day replay controls", () => {
  it("shows eight day buttons from the index: the playing day pressed, a quiet day disabled with its title", () => {
    publish({ status: "off", day: null }, null);
    view();
    const buttons = screen.getAllByRole("button").filter((b) => b.hasAttribute("aria-pressed"));
    expect(buttons.map((b) => b.textContent)).toEqual(["Mon 19 Oct", "Sun 18 Oct", "Sat 17 Oct", "Fri 16 Oct", "Thu 15 Oct", "Wed 14 Oct", "Tue 13 Oct", "Mon 12 Oct"]);
    expect(buttons.map((b) => b.hasAttribute("disabled"))).toEqual([false, false, false, true, false, false, false, true]);
    expect(buttons[3]).toHaveAttribute("title", o.empty);
    expect(buttons[0]).not.toHaveAttribute("title");
    expect(buttons.every((b) => b.getAttribute("aria-pressed") === "false")).toBe(true);
    publish(playing);
    expect(screen.getByRole("button", { name: "Mon 19 Oct" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Sun 18 Oct" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "Sun 18 Oct" }));
    expect(ctl.play).toHaveBeenCalledWith("2026-10-18");
  });

  it("toggles one play or pause button (its label too), starting the latest day with activity when nothing plays", () => {
    publish({ status: "off", day: null }, null);
    view();
    fireEvent.click(screen.getByRole("button", { name: o.play }));
    expect(ctl.play).toHaveBeenCalledWith("2026-10-19");
    publish(playing);
    fireEvent.click(screen.getByRole("button", { name: o.pause }));
    expect(ctl.pause).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: o.play })).toBeNull();
    publish({ ...playing, status: "paused" });
    const play = screen.getByRole("button", { name: o.play });
    play.focus();
    fireEvent.click(play);
    expect(ctl.resume).toHaveBeenCalledTimes(1);
    // Focus stays on the activated control through the re-render.
    expect(screen.getByRole("button", { name: o.play })).toHaveFocus();
  });

  it("keeps the focus on the play button through the loading state (it is never disabled then, and a press does nothing)", () => {
    publish({ status: "off", day: null }, null);
    view();
    const play = screen.getByRole("button", { name: o.play });
    play.focus();
    fireEvent.click(play);
    expect(ctl.play).toHaveBeenCalledTimes(1);
    // The controller publishes "loading" at once.
    publish({ status: "loading", day: null }, null);
    expect(screen.getByRole("button", { name: o.play })).toBe(play);
    expect(play).not.toBeDisabled();
    expect(play).toHaveFocus();
    fireEvent.click(play);
    expect(ctl.play).toHaveBeenCalledTimes(1);
    expect(ctl.resume).not.toHaveBeenCalled();
    publish(playing);
    expect(screen.getByRole("button", { name: o.pause })).toBe(play);
    expect(play).toHaveFocus();
  });

  it("counts the rest between an auto replay's loops as playing: the button pauses it", () => {
    publish({ ...playing, status: "resting", playS: 45, auto: true });
    view();
    fireEvent.click(screen.getByRole("button", { name: o.pause }));
    expect(ctl.pause).toHaveBeenCalledTimes(1);
    expect(ctl.resume).not.toHaveBeenCalled();
    expect(screen.getByRole("slider")).toBeEnabled();
  });

  it("lets the range reach the end of a day whose duration is not a step: its max rounds up to a whole step", () => {
    publish({ ...playing, duration: 37.42, playS: 37.42 });
    view();
    const range = screen.getByRole("slider", { name: o.time });
    expect(range).toHaveAttribute("max", "37.5");
    expect(range).toHaveAttribute("step", "0.25");
    fireEvent.change(range, { target: { value: "37.5" } });
    expect(ctl.seek).toHaveBeenLastCalledWith(37.5);
  });

  it("has a native range over the playback, labelled and valued by the clock, that seeks", () => {
    publish(playing);
    view();
    const range = screen.getByRole("slider", { name: o.time });
    expect(range).toHaveAttribute("type", "range");
    expect(range).toHaveAttribute("min", "0");
    expect(range).toHaveAttribute("max", "45");
    expect(range).toHaveValue("12");
    expect(range).toHaveAttribute("aria-valuetext", "14:05 WIB");
    // The browser's Home and End set the range's ends; the change reaches the controller as a seek.
    fireEvent.change(range, { target: { value: "45" } });
    expect(ctl.seek).toHaveBeenLastCalledWith(45);
    fireEvent.change(range, { target: { value: "0" } });
    expect(ctl.seek).toHaveBeenLastCalledWith(0);
    publish({ ...playing, playS: 20, clock: "16:40" });
    expect(range).toHaveAttribute("aria-valuetext", "16:40 WIB");
  });

  it("disables the range and the play button until there is something to play", () => {
    publish({ status: "off", day: null }, null);
    view();
    expect(screen.getByRole("slider")).toBeDisabled();
    publish({ status: "off", day: null, days: DAYS.map((d) => ({ ...d, events: 0 })), empty: true }, null);
    expect(screen.getByRole("button", { name: o.play })).toBeDisabled();
  });

  it("under reduced motion the play button steps to the next hour", () => {
    getHQStore().setState({ reducedMotion: true });
    publish({ ...playing, status: "paused" });
    view();
    expect(screen.queryByRole("button", { name: o.play })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: o.nextHour }));
    expect(ctl.nextHour).toHaveBeenCalledTimes(1);
    expect(ctl.resume).not.toHaveBeenCalled();
  });

  it("notes a partial day and an unavailable history", () => {
    publish({ ...playing, truncated: true });
    view();
    expect(screen.getByText(o.partial)).toBeInTheDocument();
    expect(screen.queryByText(o.unavailable)).toBeNull();
    publish({ status: "unavailable", days: [] }, null);
    expect(screen.getByText(o.unavailable)).toHaveAttribute("role", "status");
    expect(screen.queryByText(o.partial)).toBeNull();
  });

  it("reads in Indonesian", () => {
    publish({ ...playing, status: "paused" });
    view("id");
    expect(screen.getByRole("button", { name: "Sen 19 Okt" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: ids.office["3d"].replay.play })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: ids.office["3d"].replay.time })).toHaveAttribute("aria-valuetext", "14:05 WIB");
  });
});

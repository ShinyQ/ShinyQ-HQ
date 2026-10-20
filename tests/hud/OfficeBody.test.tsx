// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { StrictMode, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import ids from "../../messages/id.json";
import type { RoomView } from "@/content/room-views/types";
import type { OfficeFeed } from "@/lib/office/poll";
import type { OfficeDesk } from "@/lib/office/protocol";
import { getHQStore } from "@/store/useHQStore";
import { officeDesk, officeSnapshot, statesA, statesB } from "../../e2e/office-fixtures";

const live = vi.hoisted(() => ({ feed: { status: "idle", snapshot: null, fetchedAt: 0 } as OfficeFeed, want: vi.fn() }));
vi.mock("@/experience/floors/lobby/office/live", () => ({ useOfficeFeed: () => live.feed, officeLive: { want: live.want, wanted: () => true } }));
const chunk = vi.hoisted(() => ({ loadOffice: vi.fn(() => Promise.resolve()) }));
vi.mock("@/experience/floors/lobby/office/chunk", () => ({ loadOffice: chunk.loadOffice }));
// The drawer blocks import the localized Link (next-intl navigation), which needs the Next.js router.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, ...rest }: { href: string } & Record<string, unknown>) => <a href={`/en${href}`} {...rest} />,
}));

import { OfficeBody } from "@/experience/floors/lobby/office/OfficeBody";

const view = (office: NonNullable<RoomView["office"]>, id: string): RoomView => ({
  id,
  floor: "L1",
  kind: "office",
  code: id,
  title: "Agent Office",
  meta: [],
  badges: [],
  accent: "cyan",
  variant: "single",
  sections: [],
  metrics: [],
  stack: [],
  gallery: [],
  hologram: false,
  tabs: [],
  office,
});
const tree = (office: NonNullable<RoomView["office"]>, id = "L1:office", locale: "en" | "id" = "en") => (
  <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : ids}>
    <OfficeBody view={view(office, id)} locale={locale} />
  </NextIntlClientProvider>
);
const body = (office: NonNullable<RoomView["office"]>, id = "L1:office") => render(tree(office, id));
const o = en.office["3d"];
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
/** An external link's accessible name: its text, then "(opens in a new tab)" (the arrow is hidden from screen readers). */
const external = (text: string) => new RegExp(`^${escape(text)}\\s*\\(${escape(en.common.external)}\\)$`);

beforeEach(() => {
  live.feed = { status: "ready", snapshot: statesA(Date.now()), fetchedAt: Date.now() };
  getHQStore().setState({ phase: "room", floor: "L1", activeRoom: "L1:office" });
});
afterEach(() => {
  cleanup();
  live.want.mockClear();
});

describe("Agent Office drawers", () => {
  it("shows a public desk: state, full agent name, activity, title, repository link, time in state, recent activity, the hooks note and no privacy note", () => {
    body({ panel: "desk", slot: 0 }, "L1:office-desk-1");
    expect(live.want).toHaveBeenCalledWith("drawer", true);
    expect(screen.getByTestId("office-state")).toHaveTextContent(en.office.state.working);
    expect(screen.getByTestId("office-body")).toHaveTextContent(o.agentFull.copilot);
    expect(screen.getByTestId("office-task")).toHaveTextContent("Agent office scene");
    expect(screen.getByTestId("office-repo")).toHaveAttribute("href", "https://github.com/ShinyQ/ShinyQ-HQ");
    expect(screen.getByTestId("office-repo")).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("link", { name: external("ShinyQ/ShinyQ-HQ") })).toHaveAttribute("target", "_blank");
    expect(screen.getByTestId("office-body")).toHaveTextContent("14 min");
    expect(screen.getAllByTestId("office-recent")).toHaveLength(2);
    expect(screen.getByTestId("office-body")).toHaveTextContent(o.hooks);
    expect(screen.getByTestId("office-body")).not.toHaveTextContent(/leave Kurniadi's machine/);
  });

  it("hides a private desk's details and shows an off-duty desk as nothing right now", () => {
    body({ panel: "desk", slot: 1 }, "L1:office-desk-2");
    expect(screen.getByTestId("office-task")).toHaveTextContent(o.clientPrivate);
    expect(screen.queryByTestId("office-repo")).toBeNull();
    cleanup();
    live.feed = { status: "ready", snapshot: statesB(Date.now()), fetchedAt: Date.now() };
    body({ panel: "desk", slot: 4 }, "L1:office-desk-5");
    expect(screen.getByTestId("office-body")).toHaveTextContent(o.offDuty);
    expect(screen.getByTestId("office-task")).toHaveTextContent(o.drawer.none);
  });

  it("lists the five agents in the summary, opens a desk, shows today and the hooks note", () => {
    body({ panel: "summary" });
    const rows = screen.getAllByTestId("office-agent");
    expect(rows).toHaveLength(5);
    expect(rows[1]).toHaveTextContent("Desk 2: Claude · Planning");
    fireEvent.click(rows[2]);
    expect(getHQStore().getState().activeRoom).toBe("L1:office-desk-3");
    expect(screen.getAllByTestId("metric").map((m) => m.textContent)).toEqual([`3${o.drawer.tasksDone}`, `2${o.drawer.prsMerged}`, `5/6${o.drawer.ciGreen}`]);
    expect(screen.getByTestId("office-body")).toHaveTextContent(o.hooks);
  });

  it("lists public GitHub activity with status, links and progress, and its note", () => {
    body({ panel: "github" }, "L1:office-github");
    const rows = screen.getAllByTestId("office-feed-row");
    expect(rows.map((r) => r.dataset.status)).toEqual(["running", "merged"]);
    expect(within(rows[0]).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "7");
    expect(within(rows[1]).getByRole("link", { name: external("feat: agent office") })).toHaveAttribute("href", "https://github.com/ShinyQ/ShinyQ-HQ/pulls");
    expect(within(rows[1]).getByRole("link")).toHaveAttribute("target", "_blank");
    expect(screen.getByTestId("office-body")).toHaveTextContent(o.githubNote);
  });

  it("starts the 3D office on every drawer open (a user action, so even with `?prefetch=off`)", () => {
    chunk.loadOffice.mockClear();
    body({ panel: "summary" }).unmount();
    body({ panel: "github" });
    expect(chunk.loadOffice).toHaveBeenCalledTimes(2);
  });

  it("stops wanting the drawer poll when it closes", () => {
    const { unmount } = body({ panel: "summary" });
    expect(live.want).toHaveBeenLastCalledWith("drawer", true);
    unmount();
    expect(live.want).toHaveBeenLastCalledWith("drawer", false);
  });

  it("says the board is empty when there is no public activity", () => {
    const now = Date.now();
    live.feed = { status: "ready", snapshot: { ...statesA(now), github: [] }, fetchedAt: now };
    body({ panel: "github" }, "L1:office-github");
    expect(screen.queryByTestId("office-feed")).toBeNull();
    expect(screen.getByTestId("office-body")).toHaveTextContent(o.wall.empty);
  });

  it("never links a feed item or a repository outside github.com", () => {
    const now = Date.now();
    const snap = officeSnapshot([officeDesk(0, "copilot", "working", "editing", now, { repo: "https://evil.example/x", title: "Unsafe repo" })], now);
    snap.github = [{ kind: "pr", status: "opened", repo: "ShinyQ/ShinyQ-HQ", title: "Unsafe link", at: now - 60_000, url: "https://evil.example/x" }];
    live.feed = { status: "ready", snapshot: snap, fetchedAt: now };
    body({ panel: "github" }, "L1:office-github");
    const row = screen.getByTestId("office-feed-row");
    expect(row).toHaveTextContent("Unsafe link");
    expect(within(row).queryByRole("link")).toBeNull();
    cleanup();
    body({ panel: "desk", slot: 0 }, "L1:office-desk-1");
    expect(screen.getByTestId("office-task")).toHaveTextContent("Unsafe repo");
    expect(screen.queryByTestId("office-repo")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("says the title was not shared, not a client project, for a public repository without a title", () => {
    const now = Date.now();
    const snap = officeSnapshot([officeDesk(0, "codex", "working", "reading", now, { repo: "ShinyQ/ShinyQ-HQ" }), officeDesk(1, "claude", "working", "editing", now)], now);
    live.feed = { status: "ready", snapshot: snap, fetchedAt: now };
    body({ panel: "desk", slot: 0 }, "L1:office-desk-1");
    expect(screen.getByTestId("office-task")).toHaveTextContent(o.drawer.untitled);
    expect(screen.getByTestId("office-repo")).toBeInTheDocument();
    cleanup();
    body({ panel: "desk", slot: 1 }, "L1:office-desk-2");
    expect(screen.getByTestId("office-task")).toHaveTextContent(o.clientPrivate);
  });

  for (const status of ["idle", "loading"] as const) {
    it(`shows a loading line, not an empty office, before the first snapshot (${status})`, () => {
      live.feed = { status, snapshot: null, fetchedAt: 0 };
      for (const office of [{ panel: "summary" }, { panel: "github" }, { panel: "desk", slot: 0 }] as const) {
        body(office);
        expect(screen.getByTestId("office-notice")).toHaveTextContent(o.drawer.loading);
        expect(screen.getByTestId("office-body")).not.toHaveTextContent(o.wall.empty);
        expect(screen.getByTestId("office-body")).not.toHaveTextContent(o.offDuty);
        expect(screen.queryAllByTestId("office-agent")).toHaveLength(0);
        cleanup();
      }
    });
  }

  it("says the live office is off when it is disabled, even with an old snapshot", () => {
    live.feed = { status: "disabled", snapshot: statesA(Date.now()), fetchedAt: Date.now() };
    body({ panel: "summary" });
    expect(screen.getByTestId("office-notice")).toHaveTextContent(o.drawer.disabled);
    expect(screen.queryAllByTestId("office-agent")).toHaveLength(0);
    expect(screen.queryByTestId("office-offline")).toBeNull();
  });

  it("says the office is offline without claiming a last known activity when the first fetch failed", () => {
    live.feed = { status: "offline", snapshot: null, fetchedAt: 0 };
    body({ panel: "github" }, "L1:office-github");
    expect(screen.getByTestId("office-notice")).toHaveTextContent(o.drawer.offlineEmpty);
    expect(screen.getByTestId("office-body")).not.toHaveTextContent(o.drawer.offline);
    expect(screen.getByTestId("office-body")).not.toHaveTextContent(o.wall.empty);
    expect(screen.queryByTestId("office-offline")).toBeNull();
  });

  it("renders no desk for a slot outside the five", () => {
    body({ panel: "desk", slot: 7 }, "L1:office-desk-8");
    expect(screen.getByTestId("office-body")).toBeInTheDocument();
    expect(screen.queryByTestId("office-state")).toBeNull();
  });

  it("says so when the office is offline and keeps the last known activity", () => {
    live.feed = { status: "offline", snapshot: statesA(Date.now()), fetchedAt: Date.now() - 120_000 };
    body({ panel: "github" }, "L1:office-github");
    expect(screen.getByTestId("office-offline")).toHaveTextContent(o.drawer.offline);
    expect(screen.getAllByTestId("office-feed-row")).toHaveLength(2);
  });

  describe("crew summary", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());
    /** Sets desk states on the current snapshot (a fresh object, as each poll gives) and re-renders. */
    const poll = (rerender: (ui: ReactElement) => void, states: Record<number, Partial<OfficeDesk>>, locale: "en" | "id" = "en") => {
      const snap = live.feed.snapshot!;
      live.feed = { ...live.feed, snapshot: { ...snap, desks: snap.desks.map((d) => ({ ...d, ...states[d.slot] })) } };
      rerender(tree({ panel: "summary" }, "L1:office", locale));
      act(() => vi.advanceTimersByTime(0));
    };
    const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));
    const clock = (slot: number, locale = "en") => new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(live.feed.snapshot!.desks.find((d) => d.slot === slot)!.since!);

    it("reads one sentence per desk and keeps a polite live region, silent on open", () => {
      const { rerender } = body({ panel: "summary" });
      wait(0);
      const crew = screen.getByTestId("office-crew");
      expect(crew).toHaveClass("sr-only");
      expect(within(crew).getByRole("heading")).toHaveTextContent(o.crew.title);
      expect(within(crew).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
        `Desk 1: Copilot is working, since ${clock(0)}`,
        `Desk 2: Claude is thinking, since ${clock(1)}`,
        `Desk 3: Codex is reviewing, since ${clock(2)}`,
        `Desk 4: Copilot is running tests, since ${clock(3)}`,
        `Desk 5: Claude is waiting on CI, since ${clock(4)}`,
      ]);
      const news = screen.getByRole("status");
      expect(news).toHaveAttribute("aria-live", "polite");
      expect(news).toBeEmptyDOMElement();
      poll(rerender, { 0: { activity: "reading", title: "Other title" } });
      expect(news).toBeEmptyDOMElement();
    });

    it("announces a state change, then coalesces the changes of the next 10 s into one announcement", () => {
      const { rerender } = body({ panel: "summary" });
      wait(0);
      const news = screen.getByTestId("office-crew-news");
      poll(rerender, { 0: { state: "input", activity: "asking" } });
      expect(news).toHaveTextContent(/^Desk 1: Copilot is now waiting for Kurniadi\.$/);
      wait(2000);
      poll(rerender, { 1: { state: "done", activity: "finished" } });
      wait(2000);
      poll(rerender, { 2: { state: "failed", activity: "failed" } });
      expect(news).toHaveTextContent(/^Desk 1: Copilot is now waiting for Kurniadi\.$/);
      wait(5900);
      expect(news).toHaveTextContent(/^Desk 1: Copilot is now waiting for Kurniadi\.$/);
      wait(100);
      expect(news).toHaveTextContent(/^Desk 2: Claude is now done\. Desk 3: Codex is now stopped on a failed CI run\.$/);
    });

    it("announces nothing when a desk changes and changes back within the window", () => {
      const { rerender } = body({ panel: "summary" });
      wait(0);
      const news = screen.getByTestId("office-crew-news");
      poll(rerender, { 0: { state: "input" } });
      poll(rerender, { 1: { state: "done" } });
      poll(rerender, { 1: { state: "thinking" } });
      wait(10_000);
      expect(news).toHaveTextContent(/^Desk 1: Copilot is now waiting for Kurniadi\.$/);
    });

    it("still announces after React Strict Mode mounts the drawer twice", () => {
      const strict = (ui: ReactElement) => <StrictMode>{ui}</StrictMode>;
      const { rerender } = render(strict(tree({ panel: "summary" })));
      wait(0);
      const news = screen.getByTestId("office-crew-news");
      expect(news).toBeEmptyDOMElement();
      poll((ui) => rerender(strict(ui)), { 0: { state: "input", activity: "asking" } });
      expect(news).toHaveTextContent(/^Desk 1: Copilot is now waiting for Kurniadi\.$/);
    });

    it("says one sentence, not one per desk, when the office goes offline", () => {
      const { rerender } = body({ panel: "summary" });
      wait(0);
      live.feed = { ...live.feed, status: "offline" };
      rerender(tree({ panel: "summary" }));
      wait(0);
      expect(screen.getByTestId("office-crew-news")).toHaveTextContent(/^The office went offline\. Every Rover is asleep\.$/);
    });

    it("speaks Indonesian in the Indonesian drawer", () => {
      const { rerender } = render(tree({ panel: "summary" }, "L1:office", "id"));
      wait(0);
      expect(within(screen.getByTestId("office-crew")).getAllByRole("listitem")[0]).toHaveTextContent(`Meja 1: Copilot sedang bekerja, sejak ${clock(0, "id")}`);
      poll(rerender, { 0: { state: "input", activity: "asking" } }, "id");
      expect(screen.getByTestId("office-crew-news")).toHaveTextContent("Meja 1: Copilot kini sedang menunggu Kurniadi.");
    });
  });
});

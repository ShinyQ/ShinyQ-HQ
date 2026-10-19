// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import type { RoomView } from "@/content/room-views/types";
import type { OfficeFeed } from "@/lib/office/poll";
import { getHQStore } from "@/store/useHQStore";
import { statesA, statesB } from "../../e2e/office-fixtures";

const live = vi.hoisted(() => ({ feed: { status: "idle", snapshot: null, fetchedAt: 0 } as OfficeFeed, want: vi.fn() }));
vi.mock("@/experience/floors/lobby/office/live", () => ({ useOfficeFeed: () => live.feed, officeLive: { want: live.want, wanted: () => true } }));
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
const body = (office: NonNullable<RoomView["office"]>, id = "L1:office") =>
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <OfficeBody view={view(office, id)} locale="en" />
    </NextIntlClientProvider>,
  );
const o = en.office["3d"];

beforeEach(() => {
  live.feed = { status: "ready", snapshot: statesA(Date.now()), fetchedAt: Date.now() };
  getHQStore().setState({ phase: "room", floor: "L1", activeRoom: "L1:office" });
});
afterEach(() => {
  cleanup();
  live.want.mockClear();
});

describe("Agent Office drawers", () => {
  it("shows a public desk: state, full agent name, activity, title, repository link, time in state, recent activity, privacy note", () => {
    body({ panel: "desk", slot: 0 }, "L1:office-desk-1");
    expect(live.want).toHaveBeenCalledWith("drawer", true);
    expect(screen.getByTestId("office-state")).toHaveTextContent(en.office.state.working);
    expect(screen.getByTestId("office-body")).toHaveTextContent(o.agentFull.copilot);
    expect(screen.getByTestId("office-task")).toHaveTextContent("Agent office scene");
    expect(screen.getByTestId("office-repo")).toHaveAttribute("href", "https://github.com/ShinyQ/ShinyQ-HQ");
    expect(screen.getByTestId("office-repo")).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByTestId("office-body")).toHaveTextContent("14 min");
    expect(screen.getAllByTestId("office-recent")).toHaveLength(2);
    expect(screen.getByTestId("office-body")).toHaveTextContent(en.office.privacy);
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
    expect(within(rows[1]).getByRole("link", { name: "feat: agent office" })).toHaveAttribute("href", "https://github.com/ShinyQ/ShinyQ-HQ/pulls");
    expect(screen.getByTestId("office-body")).toHaveTextContent(o.githubNote);
  });

  it("says so when the office is offline and keeps the last known activity", () => {
    live.feed = { status: "offline", snapshot: statesA(Date.now()), fetchedAt: Date.now() - 120_000 };
    body({ panel: "github" }, "L1:office-github");
    expect(screen.getByTestId("office-offline")).toHaveTextContent(o.drawer.offline);
    expect(screen.getAllByTestId("office-feed-row")).toHaveLength(2);
  });
});

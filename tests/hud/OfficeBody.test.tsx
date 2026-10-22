// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { StrictMode, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import ids from "../../messages/id.json";
import type { RoomView } from "@/content/room-views/types";
import { OFFICE_FIXTURES_V2, OFFICE_FIXTURES_V3, OFFICE_FIXTURES_V4 } from "@/lib/office/fixtures";
import type { OfficeFeed, OfficeFeedSnapshot } from "@/lib/office/poll";
import type { OfficeDesk, OfficeSnapshotV4 } from "@/lib/office/protocol";
import { getHQStore } from "@/store/useHQStore";
import { officeDesk, officeSnapshot, statesA, statesB } from "../../e2e/office-fixtures";

const live = vi.hoisted(() => ({ feed: { status: "idle", snapshot: null, fetchedAt: 0 } as OfficeFeed, want: vi.fn() }));
/** The replay chunk's side as the loaded scene module hands it out: its store, its loader and its controls (a stub component), its controller. */
const replay = vi.hoisted(() => ({
  store: { state: { status: "off", label: null as string | null }, snapshot: null as unknown, mounted: false },
  stop: vi.fn(),
  open: vi.fn(() => Promise.resolve()),
  Controls: (() => null) as (props: { locale: string }) => unknown,
  fail: false,
  failControls: false,
}));
// The drawer reads the feed from the loaded scene chunk (`officeModule()`), never from `./live` itself.
const chunk = vi.hoisted(() => {
  const scene = {
    useOfficeFeed: () => live.feed,
    officeLive: { want: live.want, wanted: () => true },
    useReplay: () => replay.store,
    loadOfficeReplay: () => (replay.fail ? Promise.reject(new Error("chunk")) : Promise.resolve({ loadControls: () => (replay.failControls ? Promise.reject(new Error("chunk")) : Promise.resolve({ ReplayControls: replay.Controls })), replayController: { stop: replay.stop, open: replay.open } })),
  };
  return { scene, module: scene as typeof scene | null, loadOffice: vi.fn(() => Promise.resolve()) };
});
vi.mock("@/experience/floors/lobby/office/chunk", () => ({ loadOffice: chunk.loadOffice, useOfficeModule: () => chunk.module }));
vi.mock("@/experience/floors/lobby/office/live", () => {
  throw new Error("the drawer body must not import ./live");
});
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
  replay.store = { state: { status: "off", label: null }, snapshot: null, mounted: false };
  replay.fail = false;
  replay.failControls = false;
  replay.Controls = function Controls({ locale }) {
    return <p data-testid="stub-controls">{`controls ${locale}`}</p>;
  };
  live.feed = { status: "ready", snapshot: statesA(Date.now()), fetchedAt: Date.now() };
  getHQStore().setState({ phase: "room", floor: "L1", activeRoom: "L1:office" });
});
afterEach(() => {
  cleanup();
  live.want.mockClear();
  chunk.module = chunk.scene;
  chunk.loadOffice.mockImplementation(() => Promise.resolve());
  replay.stop.mockClear();
  replay.open.mockClear();
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

  it("lists the ten desks' agents in the summary, opens a desk, shows today and the hooks note", () => {
    body({ panel: "summary" });
    const rows = screen.getAllByTestId("office-agent");
    expect(rows).toHaveLength(10);
    expect(rows[1]).toHaveTextContent("Desk 2: Claude · Planning");
    expect(rows[7]).toHaveTextContent(`Desk 8: ${o.offDuty}`);
    fireEvent.click(rows[2]);
    expect(getHQStore().getState().activeRoom).toBe("L1:office-desk-3");
    expect(screen.getAllByTestId("metric").map((m) => m.textContent)).toEqual([`3${o.drawer.tasksDone}`, `2${o.drawer.prsMerged}`, `5/6${o.drawer.ciGreen}`]);
    expect(screen.getByTestId("office-body")).toHaveTextContent(o.hooks);
  });

  it("shows a desk's helpers on its activity and on the summary's agent rows, in both locales", () => {
    live.feed = { status: "ready", snapshot: OFFICE_FIXTURES_V2.busy as OfficeFeedSnapshot, fetchedAt: Date.now() };
    body({ panel: "desk", slot: 0 }, "L1:office-desk-1");
    expect(screen.getByTestId("office-activity")).toHaveTextContent(/^Editing · 3 helpers$/);
    cleanup();
    body({ panel: "desk", slot: 1 }, "L1:office-desk-2");
    expect(screen.getByTestId("office-activity")).toHaveTextContent(/^Planning$/);
    cleanup();
    body({ panel: "summary" });
    const rows = screen.getAllByTestId("office-agent");
    expect(rows[0]).toHaveTextContent("Desk 1: Copilot · Editing · 3 helpers");
    expect(rows[2]).toHaveTextContent("Desk 3: Copilot · Watching CI · 6 helpers");
    expect(rows[1]).not.toHaveTextContent("helper");
    expect(screen.getByTestId("office-crew")).toHaveTextContent("Desk 1: Copilot is working with 3 helpers");
    cleanup();
    render(tree({ panel: "desk", slot: 0 }, "L1:office-desk-1", "id"));
    expect(screen.getByTestId("office-activity")).toHaveTextContent(/^Mengedit · 3 asisten$/);
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

  describe("ship-it pipeline", () => {
    const busy = () => structuredClone(OFFICE_FIXTURES_V4.busy as OfficeSnapshotV4);
    const ciTree = (locale: "en" | "id") => tree({ panel: "ci" }, "L1:office-ci", locale);

    for (const locale of ["en", "id"] as const) {
      it(`lists the latest runs with their lanes, then the merges and deploys, and the GitHub note (${locale})`, () => {
        const m = (locale === "en" ? en : ids).office["3d"];
        live.feed = { status: "ready", snapshot: busy() as OfficeFeedSnapshot, fetchedAt: Date.now() };
        render(ciTree(locale));
        expect(screen.getByTestId("office-body")).toHaveAttribute("data-panel", "ci");
        const runs = screen.getAllByTestId("office-ci-run");
        expect(runs.map((r) => r.dataset.status)).toEqual(["running", "running", "success"]);
        const [r1002, r1001, r998] = runs;
        expect(within(r1002).getByRole("link", { name: new RegExp(`^${escape("CI · feat/second-console-row")}`) })).toHaveAttribute("href", "https://github.com/ShinyQ/ShinyQ-HQ/actions/runs/1002");
        expect(r1002).toHaveTextContent(m.github.status.running);
        expect(r1002).toHaveTextContent(m.ci.desk.replace("{n}", "6"));
        expect(r1001).toHaveTextContent(m.ci.desk.replace("{n}", "3"));
        expect(r998).not.toHaveTextContent(m.ci.desk.replace("{n}", ""));
        expect(r998).toHaveTextContent(m.github.status.success);
        const lanes = within(r1001).getAllByRole("listitem");
        expect(lanes).toHaveLength(12);
        expect(lanes[0]).toHaveTextContent(`Typecheck, lint, unit tests: ${m.ci.job.done}`);
        expect(lanes[5]).toHaveTextContent(`Build, CV and e2e (5/8): ${m.ci.job.failed}`);
        expect(lanes[5]).toHaveAttribute("data-status", "failed");
        expect(lanes.filter((l) => l.dataset.status === "failed")).toHaveLength(1);
        expect(lanes[11]).toHaveTextContent(`3D perf gates 2/2: ${m.ci.job.queued}`);
        expect(within(r1002).getAllByRole("listitem")[0]).toHaveTextContent(`Typecheck, lint, unit tests: ${m.ci.job.running}`);
        const body = screen.getByTestId("office-ci");
        expect(body).toHaveTextContent(m.ci.runs);
        expect(body).toHaveTextContent(m.ci.ships);
        const ships = within(body).getAllByTestId("office-feed-row");
        expect(ships.map((r) => r.dataset.status)).toEqual(["success", "merged"]);
        expect(ships[0]).toHaveTextContent("Deploy · production");
        expect(within(ships[1]).getByRole("link", { name: new RegExp(`^${escape("#227 Rover wakes up, then a reveal orbit")}`) })).toHaveAttribute("href", "https://github.com/ShinyQ/ShinyQ-HQ/pull/227");
        expect(screen.getByTestId("office-body")).toHaveTextContent(m.githubNote);
      });
    }

    it("lists only production deploys that succeeded under merged and deployed, never a preview, running or failed one", () => {
      const snap = busy();
      const deploy = snap.github.find((g) => g.kind === "deploy")!;
      snap.github = [
        { ...deploy, title: "Deploy · Preview", url: `${deploy.url}-preview` },
        { ...deploy, status: "failure", url: `${deploy.url}-failed` },
        { ...deploy, status: "running", url: `${deploy.url}-running` },
        ...snap.github,
      ];
      live.feed = { status: "ready", snapshot: snap as OfficeFeedSnapshot, fetchedAt: Date.now() };
      render(ciTree("en"));
      const ships = within(screen.getByTestId("office-ci")).getAllByTestId("office-feed-row");
      expect(ships.map((r) => r.dataset.status)).toEqual(["success", "merged"]);
      expect(ships[0]).toHaveTextContent("Deploy · production");
      expect(screen.getByTestId("office-ci")).not.toHaveTextContent("Deploy · Preview");
      expect(screen.getByTestId("office-ci").querySelectorAll('[data-status="failure"], [data-testid="office-feed-row"][data-status="running"]')).toHaveLength(0);
    });

    it("keeps the last pipeline while offline, with the offline note and no anonymous run row", () => {
      live.feed = { status: "offline", snapshot: busy() as OfficeFeedSnapshot, fetchedAt: Date.now() - 120_000 };
      render(ciTree("en"));
      expect(screen.getByTestId("office-offline")).toHaveTextContent(o.drawer.offline);
      expect(screen.getAllByTestId("office-ci-run")).toHaveLength(3);
      const rows = within(screen.getByTestId("office-ci")).getAllByTestId("office-feed-row");
      expect(rows.map((r) => r.dataset.status)).toEqual(["success", "merged"]);
      expect(screen.queryByRole("progressbar")).toBeNull();
    });

    it("shows no anonymous run row for a v4 snapshot with an empty pipeline", () => {
      const snap = busy();
      snap.pipeline = { runs: [], ships: [] };
      live.feed = { status: "ready", snapshot: snap as OfficeFeedSnapshot, fetchedAt: Date.now() };
      render(ciTree("en"));
      expect(screen.queryAllByTestId("office-ci-run")).toHaveLength(0);
      expect(within(screen.getByTestId("office-ci")).getAllByTestId("office-feed-row").map((r) => r.dataset.status)).toEqual(["success", "merged"]);
      expect(screen.queryByRole("progressbar")).toBeNull();
    });

    it("shows the running run's anonymous progress line for a snapshot without a pipeline (v3, a rollback)", () => {
      const snap = structuredClone(OFFICE_FIXTURES_V3.busy) as OfficeFeedSnapshot;
      live.feed = { status: "ready", snapshot: snap, fetchedAt: Date.now() };
      render(ciTree("en"));
      expect(screen.queryAllByTestId("office-ci-run")).toHaveLength(0);
      const rows = within(screen.getByTestId("office-ci")).getAllByTestId("office-feed-row");
      expect(rows[0]).toHaveAttribute("data-status", "running");
      expect(within(rows[0]).getByRole("progressbar")).toHaveAccessibleName("7 of 12 jobs");
    });

    it("says there are no recent runs without runs or ships", () => {
      const snap = busy();
      snap.pipeline = { runs: [], ships: [] };
      // A running run (no anonymous row beside a v4 pipeline) and a preview deploy (never shipped) still say "none".
      snap.github = snap.github.flatMap((g) => (g.kind === "run" ? [g] : g.kind === "deploy" ? [{ ...g, title: "Deploy · Preview" }] : []));
      live.feed = { status: "ready", snapshot: snap as OfficeFeedSnapshot, fetchedAt: Date.now() };
      render(ciTree("id"));
      expect(screen.queryByTestId("office-ci")).toBeNull();
      expect(screen.getByTestId("office-body")).toHaveTextContent(ids.office["3d"].ci.none);
    });

    it("never links a run outside github.com", () => {
      const snap = busy();
      snap.pipeline.runs[0].url = "javascript:alert(1)";
      live.feed = { status: "ready", snapshot: snap as OfficeFeedSnapshot, fetchedAt: Date.now() };
      render(ciTree("en"));
      const run = screen.getAllByTestId("office-ci-run")[0];
      expect(run).toHaveTextContent("CI · feat/second-console-row");
      expect(within(run).queryByRole("link")).toBeNull();
      expect(screen.getByTestId("office-ci").querySelector('a[href^="javascript"]')).toBeNull();
    });
  });

  it("starts the 3D office on every drawer open (a user action, so even with `?prefetch=off`)", () => {
    chunk.loadOffice.mockClear();
    body({ panel: "summary" }).unmount();
    body({ panel: "github" });
    expect(chunk.loadOffice).toHaveBeenCalledTimes(2);
  });

  it("shows the loading note until the scene chunk (and its one poller) is loaded, then the live feed", () => {
    chunk.module = null;
    const view = { panel: "summary" } as const;
    const { rerender } = body(view);
    expect(screen.getByTestId("office-notice")).toHaveTextContent(o.drawer.loading);
    expect(screen.getByTestId("office-body")).toHaveTextContent(o.hooks);
    expect(live.want).not.toHaveBeenCalled();
    chunk.module = chunk.scene;
    rerender(tree(view));
    expect(screen.queryByTestId("office-notice")).toBeNull();
    expect(live.want).toHaveBeenLastCalledWith("drawer", true);
  });

  it("shows the offline note when the scene chunk fails to load", async () => {
    chunk.module = null;
    chunk.loadOffice.mockImplementation(() => Promise.reject(new Error("chunk")));
    body({ panel: "github" });
    expect(await screen.findByText(o.drawer.offlineEmpty)).toHaveAttribute("data-testid", "office-notice");
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

  it("shows a back-row desk's Rover like a front-row one (desks 6 to 10), off duty without a session", () => {
    live.feed = { status: "ready", snapshot: OFFICE_FIXTURES_V3.busy as OfficeFeedSnapshot, fetchedAt: Date.now() };
    body({ panel: "desk", slot: 7 }, "L1:office-desk-8");
    expect(screen.getByTestId("office-state")).toBeInTheDocument();
    expect(screen.getByTestId("office-activity")).toHaveTextContent(/^Asking Kurniadi$/);
    cleanup();
    body({ panel: "desk", slot: 9 }, "L1:office-desk-10");
    expect(screen.getByTestId("office-activity")).toHaveTextContent(/^Editing · 4 helpers$/);
    cleanup();
    live.feed = { status: "ready", snapshot: statesA(Date.now()), fetchedAt: Date.now() };
    body({ panel: "desk", slot: 7 }, "L1:office-desk-8");
    expect(screen.getByTestId("office-body")).toHaveTextContent(o.offDuty);
    expect(screen.getByTestId("office-task")).toHaveTextContent(o.drawer.none);
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
        ...[6, 7, 8, 9, 10].map((n) => `Desk ${n}: off duty`),
      ]);
      const news = screen.getByTestId("office-crew-news");
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

describe("Agent Office day replay in the drawers", () => {
  const playing = () => {
    replay.store = { state: { status: "playing", label: "Mon 19 Oct" }, snapshot: {}, mounted: true };
  };
  const PANELS: [NonNullable<RoomView["office"]>, string][] = [
    [{ panel: "summary" }, "L1:office"],
    [{ panel: "github" }, "L1:office-github"],
    [{ panel: "ci" }, "L1:office-ci"],
    [{ panel: "desk", slot: 0 }, "L1:office-desk-1"],
  ];

  it("offers the replay on the summary only while the 3D office is mounted, then loads the replay chunk and shows its controls", async () => {
    body({ panel: "summary" });
    expect(screen.queryByTestId("office-replay-section")).toBeNull();
    cleanup();
    replay.store.mounted = true;
    body({ panel: "summary" });
    const open = screen.getByRole("button", { name: o.replay.open });
    expect(open).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("stub-controls")).toBeNull();
    open.focus();
    fireEvent.click(open);
    expect(await screen.findByTestId("stub-controls")).toHaveTextContent("controls en");
    // The press fetches the day index too.
    expect(replay.open).toHaveBeenCalledTimes(1);
    expect(open).toHaveAttribute("aria-expanded", "true");
    expect(open).toHaveFocus();
    for (const [panel, id] of PANELS.slice(1)) {
      cleanup();
      body(panel, id);
      expect(screen.queryByTestId("office-replay-section")).toBeNull();
    }
  });

  it("says the replay is unavailable when its chunk cannot load, and the next press retries", async () => {
    replay.store.mounted = true;
    replay.fail = true;
    body({ panel: "summary" });
    fireEvent.click(screen.getByRole("button", { name: o.replay.open }));
    expect(await screen.findByText(o.replay.unavailable)).toBeInTheDocument();
    replay.fail = false;
    fireEvent.click(screen.getByRole("button", { name: o.replay.open }));
    expect(await screen.findByTestId("stub-controls")).toBeInTheDocument();
    expect(screen.queryByText(o.replay.unavailable)).toBeNull();
  });

  it("says the replay is unavailable when only the controls chunk cannot load, and the next press retries", async () => {
    replay.store.mounted = true;
    replay.failControls = true;
    body({ panel: "summary" });
    fireEvent.click(screen.getByRole("button", { name: o.replay.open }));
    expect(await screen.findByText(o.replay.unavailable)).toBeInTheDocument();
    replay.failControls = false;
    fireEvent.click(screen.getByRole("button", { name: o.replay.open }));
    expect(await screen.findByTestId("stub-controls")).toBeInTheDocument();
    // Every press asks for the day index, so a history that failed before is tried again.
    expect(replay.open).toHaveBeenCalledTimes(2);
  });

  it("keeps one polite status region mounted live and fills it when a replay starts (a region that appears with its text is not announced)", () => {
    const { rerender } = body({ panel: "summary" });
    const news = screen.getByTestId("office-replay-news");
    expect(news).toHaveAttribute("role", "status");
    expect(news).toHaveAttribute("aria-live", "polite");
    expect(news).toBeEmptyDOMElement();
    playing();
    rerender(tree({ panel: "summary" }));
    expect(screen.getByTestId("office-replay-news")).toBe(news);
    expect(news).toHaveTextContent("Replaying Mon 19 Oct");
    replay.store = { state: { status: "off", label: null }, snapshot: null, mounted: true };
    rerender(tree({ panel: "summary" }));
    expect(screen.getByTestId("office-replay-news")).toBe(news);
    expect(news).toBeEmptyDOMElement();
  });

  it.each(PANELS)("badges every panel while a replay plays (%j): the day in a polite status, Back to live, the content still the live office", async (panel, id) => {
    playing();
    body(panel, id);
    const badge = screen.getByTestId("office-replay-badge");
    expect(within(badge).getByText(o.replay.pill)).toBeInTheDocument();
    const status = screen.getByTestId("office-replay-news");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("Replaying Mon 19 Oct");
    // The panel below keeps the live feed.
    if (panel.panel === "desk") expect(screen.getByTestId("office-task")).toHaveTextContent("Agent office scene");
    const button = within(badge).getByRole("button", { name: o.replay.live });
    button.focus();
    fireEvent.click(button);
    await vi.waitFor(() => expect(replay.stop).toHaveBeenCalledTimes(1));
  });

  it("hands focus to the drawer body when Back to live removes its own button, and shows no badge live", async () => {
    body({ panel: "summary" });
    expect(screen.queryByTestId("office-replay-badge")).toBeNull();
    cleanup();
    playing();
    body({ panel: "summary" });
    fireEvent.click(screen.getByRole("button", { name: o.replay.live }));
    expect(screen.getByTestId("office-body")).toHaveFocus();
  });

  it.each<[string, string, typeof en, string]>([
    ["en", "Mon 19 Oct", en, "Replay of Mon 19 Oct. Live updates return when an agent starts working."],
    ["id", "Sen 19 Okt", ids as unknown as typeof en, "Putar ulang Sen 19 Okt. Pembaruan live kembali saat agen mulai bekerja."],
  ])("swaps the hooks footer for the replay line while a replay runs (%s) and restores it live", (locale, label, msgs, line) => {
    const m = msgs.office["3d"];
    expect(m.replay.footer).toBe(line.replace(label, "{day}"));
    for (const status of ["loading", "playing", "resting", "paused"]) {
      replay.store = { state: { status, label }, snapshot: {}, mounted: true };
      render(tree({ panel: "summary" }, "L1:office", locale as "en" | "id"));
      expect(screen.getByTestId("office-body")).toHaveTextContent(line);
      expect(screen.getByTestId("office-body")).not.toHaveTextContent(m.hooks);
      cleanup();
    }
    replay.store = { state: { status: "playing", label }, snapshot: {}, mounted: true };
    render(tree({ panel: "desk", slot: 0 }, "L1:office-desk-1", locale as "en" | "id"));
    expect(screen.getByTestId("office-body")).toHaveTextContent(line);
    cleanup();
    // The GitHub and CI notes are about the data's source, not the live cadence: they stay.
    render(tree({ panel: "github" }, "L1:office-github", locale as "en" | "id"));
    expect(screen.getByTestId("office-body")).toHaveTextContent(m.githubNote);
    cleanup();
    replay.store = { state: { status: "off", label: null }, snapshot: null, mounted: true };
    render(tree({ panel: "summary" }, "L1:office", locale as "en" | "id"));
    expect(screen.getByTestId("office-body")).toHaveTextContent(m.hooks);
    expect(screen.getByTestId("office-body")).not.toHaveTextContent(line);
  });

  it("hides Show day replay once its controls are open while a replay is active, shows it live, and moves its focus to the pressed day button", async () => {
    replay.store.mounted = true;
    const { rerender } = body({ panel: "summary" });
    const open = screen.getByRole("button", { name: o.replay.open });
    expect(open).toBeVisible();
    fireEvent.click(open);
    await screen.findByTestId("stub-controls");
    open.focus();
    expect(open).toHaveFocus();
    const pressed = document.createElement("button");
    pressed.setAttribute("aria-pressed", "true");
    const host = document.createElement("div");
    host.dataset.testid = "office-replay";
    host.append(pressed);
    document.body.append(host);
    for (const status of ["loading", "playing", "resting", "paused"]) {
      replay.store = { state: { status, label: "Mon 19 Oct" }, snapshot: {}, mounted: true };
      rerender(tree({ panel: "summary" }));
      expect(screen.getByText(o.replay.open)).not.toBeVisible();
      expect(document.activeElement).not.toBe(document.body);
      replay.store = { state: { status: "off", label: null }, snapshot: null, mounted: true };
      rerender(tree({ panel: "summary" }));
      expect(screen.getByText(o.replay.open)).toBeVisible();
      screen.getByText(o.replay.open).focus();
    }
    expect(document.activeElement).toBe(screen.getByText(o.replay.open));
    replay.store = { state: { status: "playing", label: "Mon 19 Oct" }, snapshot: {}, mounted: true };
    rerender(tree({ panel: "summary" }));
    expect(pressed).toHaveFocus();
    host.remove();
    replay.store = { state: { status: "off", label: null }, snapshot: null, mounted: true };
    rerender(tree({ panel: "summary" }));
    screen.getByText(o.replay.open).focus();
    replay.store = { state: { status: "playing", label: "Mon 19 Oct" }, snapshot: {}, mounted: true };
    rerender(tree({ panel: "summary" }));
    expect(screen.getByTestId("office-body")).toHaveFocus();
  });

  it("keeps Show day replay during an automatic replay until its controls are open, then hides it and moves focus", async () => {
    playing();
    body({ panel: "summary" });
    const open = screen.getByRole("button", { name: o.replay.open });
    expect(open).toBeVisible();
    expect(screen.queryByTestId("stub-controls")).toBeNull();
    open.focus();
    fireEvent.click(open);
    expect(await screen.findByTestId("stub-controls")).toHaveTextContent("controls en");
    expect(open).not.toBeVisible();
    expect(screen.getByTestId("office-body")).toHaveFocus();
  });

  it("reads the day in Indonesian", () => {
    replay.store = { state: { status: "playing", label: "Sen 19 Okt" }, snapshot: {}, mounted: true };
    render(tree({ panel: "summary" }, "L1:office", "id"));
    expect(screen.getByTestId("office-replay-badge")).toHaveTextContent(`${ids.office["3d"].replay.pill}`);
    expect(screen.getByTestId("office-replay-news")).toHaveTextContent("Memutar ulang Sen 19 Okt");
    expect(screen.getByRole("button", { name: ids.office["3d"].replay.live })).toBeInTheDocument();
  });
});

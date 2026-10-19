// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OfficeLazy, OfficeShell } from "@/components/office/OfficeLazy";
import { OfficePanel } from "@/components/office/OfficePanel";
import type { OfficeCardLabels } from "@/components/office/labels";
import { OFFICE_FIXTURE_NOW, OFFICE_FIXTURES } from "@/lib/office/fixtures";
import type { OfficeFeed, OfficePoller } from "@/lib/office/poll";
import type { OfficeSnapshotV1 } from "@/lib/office/protocol";
import en from "../../messages/en.json";

const c = en.office.classic;
const labels: OfficeCardLabels = {
  ...c,
  clientProject: en.office.clientProject,
  privacy: en.office.privacy,
  states: en.office.state,
  activities: en.office.activity,
  agentNames: en.office.agent,
} as OfficeCardLabels;

function fakePoller(feed: OfficeFeed) {
  let listener: ((f: OfficeFeed) => void) | null = null;
  const calls: string[] = [];
  const poller: OfficePoller = {
    start: () => void calls.push("start"),
    stop: () => void calls.push("stop"),
    touch: () => void calls.push("touch"),
    feed: () => feed,
    subscribe: (l) => {
      listener = l;
      return () => (listener = null);
    },
  };
  return { poller, calls, push: (f: OfficeFeed) => act(() => listener?.(f)) };
}

const ready = (snapshot: OfficeSnapshotV1): OfficeFeed => ({ status: "ready", snapshot, fetchedAt: OFFICE_FIXTURE_NOW });

/** A stand-in IntersectionObserver: `fire(true)` reports every observed element in view, `fire(false)` out of view. */
function stubObserver() {
  const live = new Set<{ cb: IntersectionObserverCallback; els: Element[]; margin?: string }>();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      entry: { cb: IntersectionObserverCallback; els: Element[]; margin?: string };
      constructor(cb: IntersectionObserverCallback, opts?: IntersectionObserverInit) {
        this.entry = { cb, els: [], margin: opts?.rootMargin };
        live.add(this.entry);
      }
      observe(el: Element) {
        this.entry.els.push(el);
      }
      disconnect() {
        live.delete(this.entry);
      }
    },
  );
  return {
    margins: () => [...live].map((o) => o.margin),
    fire: (isIntersecting: boolean) =>
      act(() => {
        for (const o of [...live]) o.cb(o.els.map((target) => ({ target, isIntersecting }) as unknown as IntersectionObserverEntry), {} as IntersectionObserver);
      }),
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("OfficePanel", () => {
  it("shows counts, desks with titles or Client project, GitHub items, today and the privacy note", () => {
    const { poller, calls } = fakePoller(ready(OFFICE_FIXTURES.busy as OfficeSnapshotV1));
    render(<OfficePanel locale="en" labels={labels} poller={poller} now={() => OFFICE_FIXTURE_NOW + 4000} />);
    expect(calls).toContain("start");
    expect(screen.getByTestId("office-live").textContent).toContain("Live");
    expect(screen.getByTestId("office-count-active").textContent).toContain("2");
    const desks = screen.getAllByTestId("office-desk");
    expect(desks).toHaveLength(5);
    expect(desks[0].textContent).toContain("Narrower 3D perf selection");
    expect(desks[1].textContent).toContain(labels.clientProject);
    expect(screen.getByText("+1 more sessions")).toBeTruthy();
    expect(screen.getAllByTestId("office-github")).toHaveLength(4);
    expect(screen.getByTestId("office-today").textContent).toBe("Today: 9 tasks done, 7 PRs merged, 13 of 14 CI runs green");
    expect(screen.getByTestId("office-privacy").textContent).toBe(labels.privacy);
  });

  it("reports the status so the shell can hide a disabled office, and shows semi-live and offline lines", () => {
    const statuses: string[] = [];
    const { poller, push } = fakePoller({ status: "loading", snapshot: null, fetchedAt: 0 });
    render(<OfficePanel locale="en" labels={labels} poller={poller} onStatus={(s) => statuses.push(s)} now={() => OFFICE_FIXTURE_NOW} />);
    push(ready(OFFICE_FIXTURES.semiLive as OfficeSnapshotV1));
    expect(screen.getByTestId("office-live").textContent).toContain(labels.semiLive);
    push({ status: "offline", snapshot: OFFICE_FIXTURES.semiLive as OfficeSnapshotV1, fetchedAt: OFFICE_FIXTURE_NOW });
    expect(screen.getByTestId("office-live").textContent).toContain(labels.offline);
    expect(screen.getAllByTestId("office-github").length).toBeGreaterThan(0);
    push({ status: "disabled", snapshot: null, fetchedAt: OFFICE_FIXTURE_NOW });
    expect(statuses).toEqual(["loading", "ready", "offline", "disabled"]);
  });

  it("shows the offline line when the first request fails", () => {
    const { poller } = fakePoller({ status: "offline", snapshot: null, fetchedAt: 0 });
    render(<OfficePanel locale="en" labels={labels} poller={poller} now={() => OFFICE_FIXTURE_NOW} />);
    expect(screen.getByTestId("office-live").textContent).toContain(labels.offline);
    expect(screen.queryAllByTestId("office-desk")).toHaveLength(0);
    expect(screen.getByTestId("office-privacy")).toBeTruthy();
  });

  it("stops the poller on unmount", () => {
    const { poller, calls } = fakePoller(ready(OFFICE_FIXTURES.quiet as OfficeSnapshotV1));
    const { unmount } = render(<OfficePanel locale="en" labels={labels} poller={poller} now={() => OFFICE_FIXTURE_NOW} />);
    unmount();
    expect(calls.at(-1)).toBe("stop");
  });

  it("polls only while the card is within a screen of the viewport", () => {
    const io = stubObserver();
    const { poller, calls } = fakePoller(ready(OFFICE_FIXTURES.busy as OfficeSnapshotV1));
    render(<OfficePanel locale="en" labels={labels} poller={poller} now={() => OFFICE_FIXTURE_NOW} />);
    expect(calls).not.toContain("start");
    expect(io.margins()).toEqual(["100% 0px"]);
    io.fire(true);
    expect(calls.at(-1)).toBe("start");
    io.fire(false);
    expect(calls.at(-1)).toBe("stop");
  });

  it("shows the resting line, no desks and no GitHub items when the office is off", () => {
    const { poller } = fakePoller(ready(OFFICE_FIXTURES.off as OfficeSnapshotV1));
    render(<OfficePanel locale="en" labels={labels} poller={poller} now={() => OFFICE_FIXTURE_NOW} />);
    expect(screen.getByTestId("office-live").textContent).toContain(labels.resting);
    expect(screen.queryAllByTestId("office-desk")).toHaveLength(0);
    expect(screen.getByText(labels.noAgents)).toBeTruthy();
    expect(screen.getByText(labels.noGithub)).toBeTruthy();
    expect(screen.getByTestId("office-count-asleep").textContent).toContain("5");
  });
});

describe("OfficeLazy", () => {
  it("loads the panel only near the viewport and hides the section when the office is disabled", async () => {
    const io = stubObserver();
    const fetcher = vi.fn(async () => new Response(JSON.stringify(OFFICE_FIXTURES.disabled), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetcher);
    render(
      <OfficeShell>
        <OfficeLazy locale="en" labels={labels} />
      </OfficeShell>,
    );
    const section = screen.getByTestId("office-section");
    expect(section).toBeVisible();
    expect(section).toHaveAttribute("data-status", "idle");
    expect(screen.getByText(labels.loading)).toBeTruthy();
    expect(fetcher).not.toHaveBeenCalled();
    io.fire(true);
    await waitFor(() => expect(screen.getByTestId("office-privacy")).toBeTruthy());
    io.fire(true);
    await waitFor(() => expect(section).toHaveAttribute("data-status", "disabled"));
    expect(fetcher).toHaveBeenCalledWith("/api/office", expect.objectContaining({ credentials: "omit" }));
    expect(section).not.toBeVisible();
  });
});

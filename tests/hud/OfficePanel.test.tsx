// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OfficeLazy, OfficeShell } from "@/components/office/OfficeLazy";
import { OfficePanel } from "@/components/office/OfficePanel";
import { OFFICE_RESERVE, type OfficeCardLabels } from "@/components/office/labels";
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

  it("shows the offline line without the last-activity clause when the first request fails", () => {
    const { poller } = fakePoller({ status: "offline", snapshot: null, fetchedAt: 0 });
    render(<OfficePanel locale="en" labels={labels} poller={poller} now={() => OFFICE_FIXTURE_NOW} />);
    expect(screen.getByRole("status").textContent).toBe(labels.offlineEmpty);
    expect(screen.getByTestId("office-live").textContent).not.toContain(labels.offline);
    expect(screen.queryAllByTestId("office-desk")).toHaveLength(0);
    expect(screen.getByTestId("office-privacy")).toBeTruthy();
  });

  it("offline with a kept snapshot shows only the last GitHub events, not the desks as if they were live", () => {
    const { poller, push } = fakePoller(ready(OFFICE_FIXTURES.busy as OfficeSnapshotV1));
    render(<OfficePanel locale="en" labels={labels} poller={poller} now={() => OFFICE_FIXTURE_NOW} />);
    expect(screen.getAllByTestId("office-desk")).toHaveLength(5);
    push({ status: "offline", snapshot: OFFICE_FIXTURES.busy as OfficeSnapshotV1, fetchedAt: OFFICE_FIXTURE_NOW });
    expect(screen.getByRole("status").textContent).toBe(labels.offline);
    expect(screen.queryAllByTestId("office-desk")).toHaveLength(0);
    expect(screen.queryByTestId("office-count-active")).toBeNull();
    expect(screen.queryByText(labels.agents)).toBeNull();
    expect(screen.queryByText("+1 more sessions")).toBeNull();
    expect(screen.queryByTestId("office-today")).toBeNull();
    expect(screen.getByText(labels.github)).toBeTruthy();
    expect(screen.getAllByTestId("office-github")).toHaveLength(4);
    expect(screen.getByTestId("office-privacy")).toBeTruthy();
  });

  it("shows no task under a sleeping desk without a title, and Client project only under a working one", () => {
    const { poller } = fakePoller(ready(OFFICE_FIXTURES.quiet as OfficeSnapshotV1));
    render(<OfficePanel locale="en" labels={labels} poller={poller} now={() => OFFICE_FIXTURE_NOW} />);
    const desks = screen.getAllByTestId("office-desk");
    const snap = OFFICE_FIXTURES.quiet as OfficeSnapshotV1;
    expect(desks).toHaveLength(snap.desks.length);
    snap.desks.forEach((d, i) => {
      if (d.state === "asleep" && !d.title) {
        expect(desks[i].textContent).not.toContain(labels.clientProject);
        expect(desks[i].querySelector("[data-testid=office-task]")).toBeNull();
      } else if (!d.title) expect(desks[i].querySelector("[data-testid=office-task]")!.textContent).toBe(labels.clientProject);
    });
    expect(snap.desks.some((d) => d.state === "asleep" && !d.title)).toBe(true);
    expect(snap.desks.some((d) => d.state !== "asleep" && !d.title)).toBe(true);
  });

  it("drops the CI clause from today when no run happened", () => {
    const { poller } = fakePoller(ready(OFFICE_FIXTURES.off as OfficeSnapshotV1));
    render(<OfficePanel locale="en" labels={labels} poller={poller} now={() => OFFICE_FIXTURE_NOW} />);
    expect(screen.getByTestId("office-today").textContent).toBe("Today: 0 tasks done, 0 PRs merged");
  });

  it("draws the running mark as a solid glyph (the dotted circle was too faint to read)", () => {
    const { poller } = fakePoller(ready(OFFICE_FIXTURES.busy as OfficeSnapshotV1));
    render(<OfficePanel locale="en" labels={labels} poller={poller} now={() => OFFICE_FIXTURE_NOW} />);
    const running = screen.getAllByTestId("office-github").find((row) => row.textContent?.includes(labels.status.running));
    const mark = running!.querySelector("[aria-hidden=true]")!;
    expect(mark.textContent).toBe("\u25d0");
    expect(mark.className).toContain("text-cyan");
  });

  it("holds the busy card's height until the first answer, then takes its own", () => {
    const { poller, push } = fakePoller({ status: "loading", snapshot: null, fetchedAt: 0 });
    render(<OfficePanel locale="en" labels={labels} poller={poller} now={() => OFFICE_FIXTURE_NOW} />);
    const root = screen.getByTestId("office-live").parentElement!;
    expect(root.className).toBe(OFFICE_RESERVE);
    push(ready(OFFICE_FIXTURES.off as OfficeSnapshotV1));
    expect(root.className).toBe("");
    push({ status: "offline", snapshot: null, fetchedAt: 0 });
    expect(root.className).toBe("");
  });

  it("rules the counts 2 by 2 below md and in one row from md", () => {
    const { poller } = fakePoller(ready(OFFICE_FIXTURES.busy as OfficeSnapshotV1));
    render(<OfficePanel locale="en" labels={labels} poller={poller} now={() => OFFICE_FIXTURE_NOW} />);
    expect(screen.getByTestId("office-count-active").parentElement!.className).toContain("grid-cols-2 ");
    expect(screen.getByTestId("office-count-active").parentElement!.className).toContain("md:grid-cols-4");
    const rules = ["active", "thinking", "waiting", "asleep"].map((k) => screen.getByTestId(`office-count-${k}`).className.split(" "));
    expect(rules[1]).toEqual(expect.arrayContaining(["border-l", "pl-4"]));
    expect(rules[2]).toEqual(expect.arrayContaining(["border-t", "md:border-t-0", "md:border-l", "md:pl-4"]));
    expect(rules[2]).not.toContain("border-l");
    expect(rules[3]).toEqual(expect.arrayContaining(["border-l", "border-t", "md:border-t-0"]));
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

  it("links a GitHub item only to github.com, else shows its title as plain text", () => {
    const busy = OFFICE_FIXTURES.busy as OfficeSnapshotV1;
    const [first, second, ...rest] = busy.github;
    const github = [{ ...first, title: "Off-site item", url: "https://evil.example/github.com/pull/1" }, second, ...rest];
    const { poller } = fakePoller(ready({ ...busy, github }));
    render(<OfficePanel locale="en" labels={labels} poller={poller} now={() => OFFICE_FIXTURE_NOW} />);
    const [off, on] = screen.getAllByTestId("office-github");
    expect(off.textContent).toContain("Off-site item");
    expect(off.querySelector("a")).toBeNull();
    expect(screen.queryByRole("link", { name: "Off-site item" })).toBeNull();
    expect(on.querySelector("a")).toHaveAttribute("href", second.url);
    expect(document.querySelectorAll('a[href*="evil.example"]')).toHaveLength(0);
  });

  it("announces the live state without the minute clock, which stays visible but hidden from the live region", () => {
    const { poller, push } = fakePoller(ready(OFFICE_FIXTURES.busy as OfficeSnapshotV1));
    render(<OfficePanel locale="en" labels={labels} poller={poller} now={() => OFFICE_FIXTURE_NOW} />);
    const status = screen.getByRole("status");
    expect(status.textContent).toBe(labels.live);
    expect(status.textContent).not.toMatch(/\d{2}[:.]\d{2}/);
    expect(screen.getByTestId("office-live").textContent).toMatch(/updated \d{2}:\d{2}/);
    push({ status: "ready", snapshot: OFFICE_FIXTURES.busy as OfficeSnapshotV1, fetchedAt: OFFICE_FIXTURE_NOW + 60_000 });
    expect(screen.getByRole("status").textContent).toBe(labels.live);
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
    expect(screen.getByText(labels.loading).className).toContain(OFFICE_RESERVE);
    expect(fetcher).not.toHaveBeenCalled();
    io.fire(true);
    await waitFor(() => expect(screen.getByTestId("office-privacy")).toBeTruthy());
    io.fire(true);
    await waitFor(() => expect(section).toHaveAttribute("data-status", "disabled"));
    expect(fetcher).toHaveBeenCalledWith("/api/office", expect.objectContaining({ credentials: "omit" }));
    expect(section).not.toBeVisible();
  });
});

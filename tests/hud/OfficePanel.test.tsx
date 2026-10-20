// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OfficeLazy, OfficeShell } from "@/components/office/OfficeLazy";
import { OfficePanel } from "@/components/office/OfficePanel";
import { OFFICE_RESERVE, type OfficeCardLabels } from "@/components/office/labels";
import { OFFICE_FIXTURE_NOW, OFFICE_FIXTURES } from "@/lib/office/fixtures";
import { POLL, type OfficeFeed, type OfficePoller } from "@/lib/office/poll";
import type { OfficeSnapshotV1 } from "@/lib/office/protocol";
import en from "../../messages/en.json";

const c = en.office.classic;
const labels: OfficeCardLabels = {
  ...c,
  disabled: en.office["3d"].drawer.disabled,
  offDuty: en.office["3d"].offDuty,
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
    expect(screen.getByTestId("office-extra").textContent).toBe("+1 more session");
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

  it("shows the offline line without the last-activity clause when the first request fails, over dimmed off-duty rows", () => {
    const { poller } = fakePoller({ status: "offline", snapshot: null, fetchedAt: 0 });
    render(<OfficePanel locale="en" labels={labels} poller={poller} now={() => OFFICE_FIXTURE_NOW} />);
    expect(screen.getByRole("status").textContent).toBe(labels.offlineEmpty);
    expect(screen.getByTestId("office-live").textContent).not.toContain(labels.offline);
    expect(screen.queryByTestId("office-time")).toBeNull();
    expect(screen.getByTestId("office-body").className).toContain("opacity-60");
    const desks = screen.getAllByTestId("office-desk");
    expect(desks).toHaveLength(5);
    for (const desk of desks) expect(desk).toHaveAttribute("data-state", "off-duty");
    expect(screen.queryAllByTestId("office-github")).toHaveLength(0);
    expect(screen.queryByTestId("office-github-empty")).toBeNull();
    expect(screen.getByTestId("office-today")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByTestId("office-privacy")).toBeTruthy();
  });

  it("offline with a kept snapshot keeps the last known rows in place, dimmed, with the time of that snapshot", () => {
    const { poller, push } = fakePoller(ready(OFFICE_FIXTURES.busy as OfficeSnapshotV1));
    render(<OfficePanel locale="en" labels={labels} poller={poller} now={() => OFFICE_FIXTURE_NOW} />);
    expect(screen.getByTestId("office-body").className).not.toContain("opacity-60");
    push({ status: "offline", snapshot: OFFICE_FIXTURES.busy as OfficeSnapshotV1, fetchedAt: OFFICE_FIXTURE_NOW });
    expect(screen.getByRole("status").textContent).toBe(labels.offline);
    expect(screen.getByTestId("office-time").textContent).toMatch(/as of \d{2}:\d{2}$/);
    expect(screen.getByTestId("office-body").className).toContain("opacity-60");
    const desks = screen.getAllByTestId("office-desk");
    expect(desks.map((d) => d.getAttribute("data-state"))).toEqual((OFFICE_FIXTURES.busy as OfficeSnapshotV1).desks.map((d) => d.state));
    expect(screen.getByTestId("office-count-active").textContent).toContain("2");
    expect(screen.getByTestId("office-extra").textContent).toBe("+1 more session");
    expect(screen.getByTestId("office-today").textContent).toContain("Today: 9 tasks done");
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

  it("holds the card's one height in every state, per locale", () => {
    const { poller, push } = fakePoller({ status: "loading", snapshot: null, fetchedAt: 0 });
    render(<OfficePanel locale="id" labels={labels} poller={poller} now={() => OFFICE_FIXTURE_NOW} />);
    const root = screen.getByTestId("office-panel");
    expect(root.className).toContain(OFFICE_RESERVE.id);
    for (const feed of [ready(OFFICE_FIXTURES.off as OfficeSnapshotV1), { status: "offline", snapshot: null, fetchedAt: 0 } as OfficeFeed, ready(OFFICE_FIXTURES.busy as OfficeSnapshotV1)]) {
      push(feed);
      expect(root.className).toContain(OFFICE_RESERVE.id);
    }
  });

  it.each(["busy", "rough", "quiet", "semiLive", "off", "offline", "offline-kept"] as const)("draws every slot in the %s state: 5 desks, 4 GitHub rows, the counts, the extra and today lines", (name) => {
    const snapshot = name === "offline" ? null : ((name === "offline-kept" ? OFFICE_FIXTURES.busy : OFFICE_FIXTURES[name]) as OfficeSnapshotV1);
    const status = name.startsWith("offline") ? "offline" : "ready";
    const { poller } = fakePoller({ status, snapshot, fetchedAt: OFFICE_FIXTURE_NOW });
    render(<OfficePanel locale="en" labels={labels} poller={poller} now={() => OFFICE_FIXTURE_NOW} />);
    expect(screen.getAllByTestId("office-desk")).toHaveLength(5);
    for (const desk of screen.getAllByTestId("office-desk")) expect(desk.children[1].children).toHaveLength(2);
    expect(screen.getByText(labels.github).nextElementSibling!.children).toHaveLength(4);
    for (const key of ["active", "thinking", "waiting", "asleep"]) expect(screen.getByTestId(`office-count-${key}`)).toBeTruthy();
    expect(screen.getByTestId("office-extra")).toBeTruthy();
    expect(screen.getByTestId("office-today")).toBeTruthy();
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
    expect(io.margins()).toEqual(["100% 0px", undefined]);
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

  it("announces the live state without the minute clock, which stays visible (not hidden) outside the live region", () => {
    const { poller, push } = fakePoller(ready(OFFICE_FIXTURES.busy as OfficeSnapshotV1));
    render(<OfficePanel locale="en" labels={labels} poller={poller} now={() => OFFICE_FIXTURE_NOW} />);
    const status = screen.getByRole("status");
    expect(status.textContent).toBe(labels.live);
    expect(status.textContent).not.toMatch(/\d{2}[:.]\d{2}/);
    expect(screen.getByTestId("office-live").textContent).toMatch(/updated \d{2}:\d{2}/);
    const time = screen.getByTestId("office-time");
    expect(time).not.toHaveAttribute("aria-hidden");
    expect(status.contains(time)).toBe(false);
    push({ status: "ready", snapshot: OFFICE_FIXTURES.busy as OfficeSnapshotV1, fetchedAt: OFFICE_FIXTURE_NOW + 60_000 });
    expect(screen.getByRole("status").textContent).toBe(labels.live);
  });

  it("shows the resting line, five off-duty desks and the empty GitHub line when the office is off", () => {
    const { poller } = fakePoller(ready(OFFICE_FIXTURES.off as OfficeSnapshotV1));
    render(<OfficePanel locale="en" labels={labels} poller={poller} now={() => OFFICE_FIXTURE_NOW} />);
    expect(screen.getByTestId("office-live").textContent).toContain(labels.resting);
    const desks = screen.getAllByTestId("office-desk");
    expect(desks).toHaveLength(5);
    for (const desk of desks) {
      expect(desk).toHaveAttribute("data-state", "off-duty");
      expect(desk.textContent).toBe(`${labels.offDuty}\u00a0${labels.states.asleep}`);
    }
    expect(screen.getByTestId("office-extra").textContent).toBe(labels.noAgents);
    expect(screen.getByTestId("office-github-empty").textContent).toBe(labels.noGithub);
    expect(screen.queryAllByTestId("office-github")).toHaveLength(0);
    expect(screen.getByTestId("office-count-asleep").textContent).toContain("5");
  });

  it("says Paused instead of Live once the snapshot is older than the keep-last window, without a new feed", () => {
    vi.useFakeTimers();
    try {
      let clockNow = OFFICE_FIXTURE_NOW;
      const { poller } = fakePoller(ready(OFFICE_FIXTURES.busy as OfficeSnapshotV1));
      render(<OfficePanel locale="en" labels={labels} poller={poller} now={() => clockNow} />);
      expect(screen.getByRole("status").textContent).toBe(labels.live);
      clockNow = OFFICE_FIXTURE_NOW + POLL.keepLastMs + 1_000;
      act(() => void vi.advanceTimersByTime(POLL.keepLastMs + 1_000));
      expect(screen.getByRole("status").textContent).toBe(labels.paused);
      expect(screen.getByTestId("office-time").textContent).toMatch(/updated \d{2}:\d{2}/);
    } finally {
      vi.useRealTimers();
    }
  });

  it("restarts and fetches at once when the tab comes back while the card is near, and counts pointer moves as input", () => {
    const io = stubObserver();
    const { poller, calls } = fakePoller(ready(OFFICE_FIXTURES.busy as OfficeSnapshotV1));
    render(<OfficePanel locale="en" labels={labels} poller={poller} now={() => OFFICE_FIXTURE_NOW} />);
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(calls).toEqual([]);
    io.fire(true);
    calls.length = 0;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(calls).toEqual(["stop", "touch", "start"]);
    calls.length = 0;
    window.dispatchEvent(new Event("pointermove"));
    expect(calls).toEqual(["touch"]);
    visibility.mockRestore();
  });

  it("holds a disabled office on screen (the shell hides it once it scrolls away)", () => {
    const io = stubObserver();
    const statuses: string[] = [];
    const { poller, push } = fakePoller(ready(OFFICE_FIXTURES.busy as OfficeSnapshotV1));
    render(<OfficePanel locale="en" labels={labels} poller={poller} onStatus={(s) => statuses.push(s)} now={() => OFFICE_FIXTURE_NOW} />);
    io.fire(true);
    push({ status: "disabled", snapshot: null, fetchedAt: OFFICE_FIXTURE_NOW });
    expect(statuses).toEqual(["ready"]);
    expect(screen.getByRole("status").textContent).toBe(labels.disabled);
    expect(screen.getByTestId("office-panel").className).toContain(OFFICE_RESERVE.en);
    io.fire(false);
    expect(statuses).toEqual(["ready", "disabled"]);
  });
});

describe("OfficeLazy", () => {
  it("shows the offline line and releases the reserved height when the panel chunk fails to load", async () => {
    const io = stubObserver();
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown) => rejections.push(reason);
    process.on("unhandledRejection", onRejection);
    try {
      render(
        <OfficeShell>
          <OfficeLazy locale="en" labels={labels} load={() => Promise.reject(new Error("ChunkLoadError"))} />
        </OfficeShell>,
      );
      io.fire(true);
      await waitFor(() => expect(screen.getByTestId("office-section")).toHaveAttribute("data-status", "offline"));
      expect(screen.getByRole("status").textContent).toBe(labels.offlineEmpty);
      expect(screen.queryByText(labels.loading)).toBeNull();
      expect(document.querySelector('[class*="min-h-"]')).toBeNull();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(rejections).toEqual([]);
    } finally {
      process.off("unhandledRejection", onRejection);
    }
  });

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
    expect(screen.getByText(labels.loading).parentElement!.className).toBe(OFFICE_RESERVE.en);
    expect(screen.getByText(labels.loadingNote).parentElement).toBe(screen.getByText(labels.loading).parentElement);
    expect(fetcher).not.toHaveBeenCalled();
    io.fire(true);
    await waitFor(() => expect(screen.getByTestId("office-privacy")).toBeTruthy());
    io.fire(true);
    await waitFor(() => expect(screen.getByTestId("office-panel")).toHaveAttribute("data-feed", "disabled"));
    // On screen: held with the switched-off line, so nothing below moves.
    expect(section).toBeVisible();
    expect(screen.getByRole("status").textContent).toBe(labels.disabled);
    io.fire(false);
    await waitFor(() => expect(section).toHaveAttribute("data-status", "disabled"));
    expect(fetcher).toHaveBeenCalledWith("/api/office", expect.objectContaining({ credentials: "omit" }));
    expect(section).not.toBeVisible();
  });
});

// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OfficeLazy, OfficeShell } from "@/components/office/OfficeLazy";
import { OfficePanel } from "@/components/office/OfficePanel";
import { OFFICE_RESERVE, type OfficeCardLabels } from "@/components/office/labels";
import { OFFICE_FIXTURE_NOW, OFFICE_FIXTURES, OFFICE_FIXTURES_V2, OFFICE_FIXTURES_V3 } from "@/lib/office/fixtures";
import { POLL, type OfficeFeed, type OfficeFeedSnapshot, type OfficePoller } from "@/lib/office/poll";
import type { OfficeDeskV2, OfficeSnapshotV1 } from "@/lib/office/protocol";
import en from "../../messages/en.json";
import ids from "../../messages/id.json";

const c = en.office.classic;
const labels: OfficeCardLabels = {
  ...c,
  disabled: en.office["3d"].drawer.disabled,
  clientProject: en.office.clientProject,
  helpers: en.office.helpers,
  states: en.office.state,
  activities: en.office.activity,
  agentNames: en.office.agent,
} as OfficeCardLabels;
const idLabels: OfficeCardLabels = {
  ...ids.office.classic,
  disabled: ids.office["3d"].drawer.disabled,
  clientProject: ids.office.clientProject,
  helpers: ids.office.helpers,
  states: ids.office.state,
  activities: ids.office.activity,
  agentNames: ids.office.agent,
} as OfficeCardLabels;

/** The five desk rows (awake desks, then "+N more", "Every Rover is asleep." or quiet slots). */
const rows = () => [...screen.getByTestId("office-desks").children] as HTMLElement[];

function fakePoller(feed: OfficeFeed) {
  let listener: ((f: OfficeFeed) => void) | null = null;
  const calls: string[] = [];
  const poller: OfficePoller = {
    start: () => void calls.push("start"),
    stop: () => void calls.push("stop"),
    touch: () => void calls.push("touch"),
    touchedAt: () => 0,
    retime: () => void calls.push("retime"),
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
  it("shows counts, desks with titles or Client project, GitHub items and today, with no privacy note", () => {
    const { poller, calls } = fakePoller(ready(OFFICE_FIXTURES.busy as OfficeSnapshotV1));
    render(<OfficePanel locale="en" labels={labels} poller={poller} now={() => OFFICE_FIXTURE_NOW + 4000} />);
    expect(calls).toContain("start");
    expect(screen.getByTestId("office-live").textContent).toContain("Live");
    expect(screen.getByTestId("office-count-active").textContent).toContain("2");
    const desks = screen.getAllByTestId("office-desk");
    expect(desks).toHaveLength(5);
    expect(desks[0].textContent).toContain("Narrower 3D perf selection");
    expect(desks[1].textContent).toContain(labels.clientProject);
    // A v1 body seats five: the other five seats are idle.
    expect(screen.getByTestId("office-extra").textContent).toBe("5 desks idle \u00b7 +1 more session");
    expect(screen.getAllByTestId("office-github")).toHaveLength(4);
    expect(screen.getByTestId("office-today").textContent).toBe("Today: 9 tasks done, 7 PRs merged, 13 of 14 CI runs green");
    expect(screen.queryByTestId("office-privacy")).toBeNull();
    expect(screen.getByTestId("office-panel").textContent).not.toMatch(/leave Kurniadi's machine/);
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

  it("shows the offline line without the last-activity clause when the first request fails, over dimmed quiet rows", () => {
    const { poller } = fakePoller({ status: "offline", snapshot: null, fetchedAt: 0 });
    render(<OfficePanel locale="en" labels={labels} poller={poller} now={() => OFFICE_FIXTURE_NOW} />);
    expect(screen.getByRole("status").textContent).toBe(labels.offlineEmpty);
    expect(screen.getByTestId("office-live").textContent).not.toContain(labels.offline);
    expect(screen.queryByTestId("office-time")).toBeNull();
    expect(screen.getByTestId("office-body").className).toContain("opacity-60");
    expect(rows()).toHaveLength(5);
    expect(screen.queryAllByTestId("office-desk")).toHaveLength(0);
    expect(screen.getAllByTestId("office-desk-empty")).toHaveLength(5);
    expect(screen.queryByTestId("office-none")).toBeNull();
    expect(screen.getByTestId("office-extra")).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryAllByTestId("office-github")).toHaveLength(0);
    expect(screen.queryByTestId("office-github-empty")).toBeNull();
    expect(screen.getByTestId("office-today")).toHaveAttribute("aria-hidden", "true");
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
    expect(screen.getByTestId("office-extra").textContent).toBe("5 desks idle \u00b7 +1 more session");
    expect(screen.getByTestId("office-today").textContent).toContain("Today: 9 tasks done");
    expect(screen.getAllByTestId("office-github")).toHaveLength(4);
  });

  it("lists only the awake desks: asleep ones collapse into the idle line, Client project under a working desk without a title", () => {
    const { poller } = fakePoller(ready(OFFICE_FIXTURES.quiet as OfficeSnapshotV1));
    render(<OfficePanel locale="en" labels={labels} poller={poller} now={() => OFFICE_FIXTURE_NOW} />);
    const desks = screen.getAllByTestId("office-desk");
    expect(desks).toHaveLength(1);
    expect(desks[0]).toHaveAttribute("data-state", "reviewing");
    expect(desks[0].querySelector("[data-testid=office-task]")!.textContent).toBe(labels.clientProject);
    expect(screen.getAllByTestId("office-desk-empty")).toHaveLength(4);
    expect(screen.getByTestId("office-extra").textContent).toBe("9 desks idle");
    expect(screen.getByTestId("office-count-asleep").textContent).toContain("9");
  });

  it("reads a ten-desk v3 snapshot: four awake desks by seat, then +5 more desks; the asleep one and the session past ten on the idle line", () => {
    const v3 = OFFICE_FIXTURES_V3.busy as OfficeFeedSnapshot;
    const { poller } = fakePoller({ status: "ready", snapshot: v3, fetchedAt: OFFICE_FIXTURE_NOW });
    render(<OfficePanel locale="en" labels={labels} poller={poller} now={() => OFFICE_FIXTURE_NOW} />);
    const desks = screen.getAllByTestId("office-desk");
    expect(desks.map((d) => d.getAttribute("data-state"))).toEqual(["working", "thinking", "ci", "input"]);
    expect(desks[0].textContent).toContain("Narrower 3D perf selection");
    expect(rows()[4]).toBe(screen.getByTestId("office-more"));
    expect(screen.getByTestId("office-more").textContent).toBe("+5 more desks\u00a0");
    expect(screen.getByTestId("office-extra").textContent).toBe("1 desk idle \u00b7 +1 more session");
    // The 3D wall's counts over ten seats.
    expect(["active", "thinking", "waiting", "asleep"].map((k) => screen.getByTestId(`office-count-${k}`).querySelector("dd")!.textContent)).toEqual(["5", "1", "3", "1"]);
  });

  it("shows an awake desk's helpers after its activity on the same truncating line (one helper, Indonesian asisten)", () => {
    const v2 = OFFICE_FIXTURES_V2.busy as OfficeFeedSnapshot;
    const { poller } = fakePoller({ status: "ready", snapshot: v2, fetchedAt: OFFICE_FIXTURE_NOW });
    render(<OfficePanel locale="en" labels={labels} poller={poller} now={() => OFFICE_FIXTURE_NOW} />);
    const heads = screen.getAllByTestId("office-desk").map((d) => d.querySelector(".truncate")!);
    expect(heads[0].textContent).toBe("Copilot \u00b7 Editing \u00b7 3 helpers");
    expect(heads[2].textContent).toBe("Copilot \u00b7 Watching CI \u00b7 6 helpers");
    expect(heads[1].textContent).toBe("Claude \u00b7 Planning");
    expect(heads[0]).toHaveClass("block", "truncate");
    cleanup();
    const one = fakePoller({ status: "ready", snapshot: { ...v2, desks: v2.desks.map((d) => (d.slot === 0 ? { ...d, helpers: 1 } : d)) }, fetchedAt: OFFICE_FIXTURE_NOW });
    render(<OfficePanel locale="en" labels={labels} poller={one.poller} now={() => OFFICE_FIXTURE_NOW} />);
    expect(screen.getAllByTestId("office-desk")[0].querySelector(".truncate")!.textContent).toBe("Copilot \u00b7 Editing \u00b7 1 helper");
    cleanup();
    const idLabels = { ...labels, helpers: ids.office.helpers, activities: ids.office.activity } as OfficeCardLabels;
    const again = fakePoller({ status: "ready", snapshot: v2, fetchedAt: OFFICE_FIXTURE_NOW });
    render(<OfficePanel locale="id" labels={idLabels} poller={again.poller} now={() => OFFICE_FIXTURE_NOW} />);
    expect(screen.getAllByTestId("office-desk")[0].querySelector(".truncate")!.textContent).toBe("Copilot \u00b7 Mengedit \u00b7 3 asisten");
  });

  it("polls snapshot v3 by default and reads a v1 body (a rollback) as a desk list without helpers", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(String(url));
        return { status: 200, json: async () => OFFICE_FIXTURES.busy } as unknown as Response;
      }),
    );
    render(<OfficePanel locale="en" labels={labels} />);
    await waitFor(() => expect(screen.getByTestId("office-panel")).toHaveAttribute("data-feed", "ready"));
    expect(urls[0]).toBe("/api/office?v=3");
    expect(screen.getAllByTestId("office-desk")[0].querySelector(".truncate")!.textContent).toBe("Copilot \u00b7 Editing");
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

  it.each(["busy", "rough", "quiet", "semiLive", "off", "ten", "offline", "offline-kept"] as const)("draws every slot in the %s state: 5 desk rows, 4 GitHub rows, the counts, the idle and today lines", (name) => {
    const snapshot =
      name === "offline" ? null : ((name === "offline-kept" ? OFFICE_FIXTURES.busy : name === "ten" ? OFFICE_FIXTURES_V3.busy : OFFICE_FIXTURES[name]) as OfficeSnapshotV1);
    const status = name.startsWith("offline") ? "offline" : "ready";
    const { poller } = fakePoller({ status, snapshot, fetchedAt: OFFICE_FIXTURE_NOW });
    render(<OfficePanel locale="en" labels={labels} poller={poller} now={() => OFFICE_FIXTURE_NOW} />);
    expect(rows()).toHaveLength(5);
    // Every row has the same two lines, so a desk, "+N more", "Every Rover is asleep." and a quiet slot share one height.
    for (const row of rows()) {
      expect(row.className).toBe(rows()[0].className);
      expect(row.children[1].children).toHaveLength(2);
      expect(row.children[1].children[1]).toHaveClass("block", "text-sm");
    }
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

  it("shows the resting line, Every Rover is asleep over quiet rows, ten idle desks and the empty GitHub line when the office is off", () => {
    const { poller } = fakePoller(ready(OFFICE_FIXTURES.off as OfficeSnapshotV1));
    render(<OfficePanel locale="en" labels={labels} poller={poller} now={() => OFFICE_FIXTURE_NOW} />);
    expect(screen.getByTestId("office-live").textContent).toContain(labels.resting);
    expect(screen.queryAllByTestId("office-desk")).toHaveLength(0);
    expect(rows()[0]).toBe(screen.getByTestId("office-none"));
    expect(screen.getByTestId("office-none").textContent).toBe(`${labels.noAgents}\u00a0`);
    expect(screen.getAllByTestId("office-desk-empty")).toHaveLength(4);
    expect(screen.getByTestId("office-extra").textContent).toBe("10 desks idle");
    expect(screen.getByTestId("office-github-empty").textContent).toBe(labels.noGithub);
    expect(screen.queryAllByTestId("office-github")).toHaveLength(0);
    expect(screen.getByTestId("office-count-asleep").textContent).toContain("10");
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

/** The ten-seat busy office with only `awake` slots awake (the others asleep) and no session past ten. */
function tenWith(awake: readonly number[]): OfficeFeedSnapshot {
  const v3 = OFFICE_FIXTURES_V3.busy as OfficeFeedSnapshot;
  const desks = v3.desks.map((d): OfficeDeskV2 => (awake.includes(d.slot) ? (d.state === "asleep" ? { ...d, state: "working", activity: "editing" } : d) : { ...d, state: "asleep", activity: "resting" }));
  return { ...v3, desks, extra: 0 };
}

describe("OfficePanel with ten seats", () => {
  const ALL = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  // [awake slots, slots on the desk rows, "+N more" row, en idle line, id "+N more" row, id idle line]
  const CASES = [
    [[], [], null, "10 desks idle", null, "10 meja menganggur"],
    [[9, 0, 6], [0, 6, 9], null, "7 desks idle", null, "7 meja menganggur"],
    [[1, 3, 5, 7, 9], [1, 3, 5, 7, 9], null, "5 desks idle", null, "5 meja menganggur"],
    [[0, 1, 2, 3, 4, 7], [0, 1, 2, 3], "+2 more desks", "4 desks idle", "+2 meja lainnya", "4 meja menganggur"],
    [ALL, [0, 1, 2, 3], "+6 more desks", "No desks idle", "+6 meja lainnya", "Tidak ada meja yang menganggur"],
  ] as const;

  it.each(CASES)("awake %j: rows %j, fifth row %s, idle line %s (and in Indonesian)", (awake, shown, more, idle, moreId, idleId) => {
    for (const [locale, l, moreText, idleText] of [
      ["en", labels, more, idle],
      ["id", idLabels, moreId, idleId],
    ] as const) {
      const { poller } = fakePoller({ status: "ready", snapshot: tenWith(awake), fetchedAt: OFFICE_FIXTURE_NOW });
      render(<OfficePanel locale={locale} labels={l} poller={poller} now={() => OFFICE_FIXTURE_NOW} />);
      expect(rows()).toHaveLength(5);
      const desks = screen.queryAllByTestId("office-desk");
      expect(desks.map((d) => d.querySelector("[data-testid=office-task]")!.textContent)).toEqual(
        shown.map((slot) => tenWith(awake).desks.find((d) => d.slot === slot)!.title ?? l.clientProject),
      );
      for (const d of desks) expect(d.getAttribute("data-state")).not.toBe("asleep");
      if (moreText) {
        expect(rows()[4]).toBe(screen.getByTestId("office-more"));
        expect(screen.getByTestId("office-more").firstElementChild!.nextElementSibling!.firstElementChild!.textContent).toBe(moreText);
      } else expect(screen.queryByTestId("office-more")).toBeNull();
      if (awake.length === 0) {
        expect(rows()[0]).toBe(screen.getByTestId("office-none"));
        expect(screen.getByTestId("office-none").textContent).toContain(l.noAgents);
      } else expect(screen.queryByTestId("office-none")).toBeNull();
      expect(screen.queryAllByTestId("office-desk-empty")).toHaveLength(5 - desks.length - (moreText ? 1 : 0) - (awake.length === 0 ? 1 : 0));
      expect(screen.getByTestId("office-extra").textContent).toBe(idleText);
      // The idle line is the Asleep count (empty seats count as asleep, as on the 3D wall).
      expect(screen.getByTestId("office-count-asleep").querySelector("dd")!.textContent).toBe(String(10 - awake.length));
      cleanup();
    }
  });

  it("keeps the helpers on the rows' activity lines with ten seats", () => {
    const { poller } = fakePoller({ status: "ready", snapshot: tenWith([0, 5, 9]), fetchedAt: OFFICE_FIXTURE_NOW });
    render(<OfficePanel locale="en" labels={labels} poller={poller} now={() => OFFICE_FIXTURE_NOW} />);
    expect(screen.getAllByTestId("office-desk").map((d) => d.querySelector(".truncate")!.textContent)).toEqual([
      "Copilot \u00b7 Editing \u00b7 3 helpers",
      "Codex \u00b7 Reading \u00b7 2 helpers",
      "Copilot \u00b7 Editing \u00b7 4 helpers",
    ]);
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
    // The panel is a lazy import and its first fetch resolves after it: a loaded CI runner took over the 1 s default.
    await waitFor(() => expect(screen.getByTestId("office-panel")).toBeTruthy(), { timeout: 5_000 });
    io.fire(true);
    await waitFor(() => expect(screen.getByTestId("office-panel")).toHaveAttribute("data-feed", "disabled"), { timeout: 5_000 });
    // On screen: held with the switched-off line, so nothing below moves.
    expect(section).toBeVisible();
    expect(screen.getByRole("status").textContent).toBe(labels.disabled);
    io.fire(false);
    await waitFor(() => expect(section).toHaveAttribute("data-status", "disabled"));
    expect(fetcher).toHaveBeenCalledWith("/api/office?v=3", expect.objectContaining({ credentials: "omit" }));
    expect(section).not.toBeVisible();
    // Above the 5 s waits for the lazy panel: a loaded CI runner hit the 5 s default test timeout.
  }, 15_000);
});

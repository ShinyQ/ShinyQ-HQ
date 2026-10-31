// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render as rtlRender, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildEngineRoomViews } from "@/content/room-views";
import { EngineBody } from "@/hud/drawer/EngineBody";
import type { OfficeFeed } from "@/lib/office/poll";
import { REACTOR_DRAWER_TICK_MS, REACTOR_STALE_MS } from "@/experience/floors/engine/reactor";
import { STATS_FIXTURE } from "@/lib/stats/fixtures";
import { __setStatsForTests } from "@/lib/visits/store";
import { shipStep } from "../../e2e/office-fixtures";
import en from "../../messages/en.json";
import idMessages from "../../messages/id.json";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, ...rest }: { href: string } & Record<string, unknown>) => <a href={`/en${href}`} {...rest} />,
}));

const NOW = Date.UTC(2026, 9, 22, 12);
const feedBox = vi.hoisted(() => ({ feed: { status: "idle", snapshot: null, fetchedAt: 0 } as unknown, now: Date.UTC(2026, 9, 22, 12) }));
vi.mock("@/experience/floors/engine/reactorLive", () => ({
  reactorLive: { now: () => feedBox.now, start: vi.fn(), stop: vi.fn() },
  useReactorFeed: () => feedBox.feed,
}));

/** The drawer always sits inside the app's intl provider (link items read their "new tab" label). */
const render = (ui: ReactElement & { props: { locale?: string } }) =>
  rtlRender(
    <NextIntlClientProvider locale={ui.props.locale ?? "en"} messages={ui.props.locale === "id" ? idMessages : en}>
      {ui}
    </NextIntlClientProvider>,
  );

const views = buildEngineRoomViews("en");
const body = (id: string) => render(<EngineBody view={views[`B1:${id}`]!} locale="en" />).container;

beforeEach(() => vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline")))));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  feedBox.feed = { status: "idle", snapshot: null, fetchedAt: 0 };
  feedBox.now = NOW;
  __setStatsForTests(null);
});

describe("EngineBody (B1 station drawers)", () => {
  it("names and draws the ID blueprint with the same native node labels", () => {
    const view = buildEngineRoomViews("id")["B1:blueprint"];
    const { container } = render(<EngineBody view={view} locale="id" />);
    expect(screen.getByRole("img", { name: /Browser pengunjung/ })).toBeInTheDocument();
    const lines = [...container.querySelectorAll("svg tspan")].map((line) => line.textContent).join(" ");
    expect(lines).toContain("Browser pengunjung");
  });

  it("draws the site diagram as one named image", () => {
    const root = body("blueprint");
    expect(root.querySelector("[data-engine-station='blueprint'] svg")).not.toBeNull();
    expect(screen.getByRole("img", { name: views["B1:blueprint"]!.engine!.diagram!.label })).toBeInTheDocument();
  });

  it("draws the wide diagram once its figure is as wide as it, the phone diagram otherwise", () => {
    const diagram = views["B1:blueprint"]!.engine!.diagram!;
    const figure = (root: HTMLElement) => root.querySelector<HTMLElement>("[data-diagram]")!;
    const svgWidth = (root: HTMLElement) => Number(figure(root).querySelector("svg")!.getAttribute("width") ?? figure(root).querySelector("svg")!.getAttribute("viewBox")!.split(" ")[2]);
    const narrow = body("blueprint");
    expect(figure(narrow).dataset.diagram).toBe("phone");
    expect(svgWidth(narrow)).toBe(diagram.layout.width);
    cleanup();
    const spy = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(diagram.wide.width + 24);
    try {
      const wide = body("blueprint");
      expect(figure(wide).dataset.diagram).toBe("wide");
      expect(svgWidth(wide)).toBe(diagram.wide.width);
    } finally {
      spy.mockRestore();
    }
  });

  it("links every linked pull request in a new tab", () => {
    const root = body("timeline");
    const links = [...root.querySelectorAll<HTMLAnchorElement>("a[href*='/pull/']")];
    const expected = views["B1:timeline"]!.engine!.rounds!.flatMap((r) => r.prs.filter((p) => p.href));
    expect(links).toHaveLength(expected.length);
    for (const a of links) expect([a.target, a.rel]).toEqual(["_blank", "noopener noreferrer"]);
  });

  it("lists every gate with a status dot, and the excerpt with its source link", () => {
    expect(body("gates").querySelectorAll("[data-gate] [data-accent-dot]")).toHaveLength(views["B1:gates"]!.engine!.gates!.length);
    cleanup();
    const agents = body("agents");
    const link = agents.querySelector(`a[href='${views["B1:agents"]!.engine!.excerpt!.href}']`);
    expect(link).not.toBeNull();
    expect([link!.getAttribute("target"), link!.textContent]).toEqual(["_blank", expect.stringContaining("(opens in a new tab)")]);
  });

  it("titles each gate as a level 3 heading, like the round titles", () => {
    const gates = views["B1:gates"]!.engine!.gates!;
    expect([...body("gates").querySelectorAll("[data-gate] h3")].map((h) => h.textContent)).toEqual(gates.map((g) => g.title));
  });

  it("shows the measured numbers and the hourly uptime check", () => {
    const root = body("dashboard");
    for (const tile of views["B1:dashboard"]!.engine!.tiles!) expect(root.textContent).toContain(tile.value);
    expect(root.querySelector("[data-tile='uptime']")).not.toBeNull();
  });

  it("draws Rover's Brain as one named image above how it answers", () => {
    const root = body("brain");
    expect(root.querySelector("[data-engine-station='brain'] [data-diagram] svg")).not.toBeNull();
    expect(screen.getByRole("img", { name: views["B1:brain"]!.engine!.diagram!.label })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "How it answers" })).toBeInTheDocument();
  });

  it("lists every rejected design with why it was dropped, linking only the linked pull requests in a new tab", () => {
    const ideas = views["B1:rejected"]!.engine!.ideas!;
    const root = body("rejected");
    const items = [...root.querySelectorAll<HTMLElement>("[data-idea]")];
    expect(items.map((li) => li.dataset.idea)).toEqual(ideas.map((i) => i.id));
    items.forEach((li, i) => {
      expect(li.querySelector("h3")?.textContent).toBe(ideas[i].title);
      expect(li.textContent).toContain("Why it was dropped");
      expect(li.textContent).toContain(ideas[i].reason);
      const link = li.querySelector<HTMLAnchorElement>("a");
      expect(link?.getAttribute("href") ?? undefined).toBe(ideas[i].pr?.href);
      if (link) expect([link.target, link.rel]).toEqual(["_blank", "noopener noreferrer"]);
      if (ideas[i].pr) expect(li.textContent).toContain(`#${ideas[i].pr!.n}`);
    });
  });

  describe("the reactor", () => {
    const reactor = (locale: "en" | "id" = "en") => render(<EngineBody view={buildEngineRoomViews(locale)["B1:reactor"]!} locale={locale} />).container;
    /** The live tiles as label to value. */
    const tiles = (root: HTMLElement) => Object.fromEntries([...root.querySelectorAll("[data-reactor-live] [data-testid='metric']")].map((li) => [li.children[1]?.textContent, li.children[0]?.textContent]));

    it("shows the live numbers of the feed and the stats, with the deploy as a time since", () => {
      feedBox.feed = { status: "ready", snapshot: shipStep(NOW, "base", NOW - 3 * 60_000), fetchedAt: NOW - 5_000 } satisfies OfficeFeed;
      __setStatsForTests({ status: "ready", snapshot: STATS_FIXTURE, freshness: "fresh" });
      const root = reactor();
      expect(root.querySelector("[data-engine-station='reactor'] [data-reactor-live]")?.getAttribute("data-reactor-live")).toBe("true");
      expect(tiles(root)).toEqual({
        "Jobs running": "1",
        "Jobs done": "1",
        "Jobs failed": "0",
        "Agents awake": "6",
        "Since the last production deploy": "3 min",
        "Visits since launch": "520",
        "Ask questions since launch": "97",
      });
      expect(root.textContent).not.toContain("offline right now");
      expect(root.textContent).toContain("Live now");
      expect(screen.getByRole("heading", { name: "How it reads" })).toBeInTheDocument();
      expect(root.querySelector("a[href*='/build']")).toBeNull();
    });

    it("says none recent without a deploy in the feed", () => {
      feedBox.feed = { status: "ready", snapshot: shipStep(NOW, "base"), fetchedAt: NOW } satisfies OfficeFeed;
      expect(tiles(reactor())["Since the last production deploy"]).toBe("None recent");
    });

    it("shows the offline line and only the stats when the feed is offline or stale, in both languages", () => {
      __setStatsForTests({ status: "ready", snapshot: STATS_FIXTURE, freshness: "fresh" });
      feedBox.feed = { status: "offline", snapshot: null, fetchedAt: 0 } satisfies OfficeFeed;
      const root = reactor();
      expect(root.querySelector("[data-reactor-live]")?.getAttribute("data-reactor-live")).toBe("false");
      expect(tiles(root)).toEqual({ "Visits since launch": "520", "Ask questions since launch": "97" });
      expect(root.textContent).toContain("The live feed is offline right now");
      expect(root.textContent).not.toContain("Live now");
      cleanup();
      feedBox.feed = { status: "ready", snapshot: shipStep(NOW, "base"), fetchedAt: NOW - 10 * 60_000 } satisfies OfficeFeed;
      __setStatsForTests(null);
      const stale = reactor("id");
      expect(stale.querySelector("[data-reactor-live]")?.getAttribute("data-reactor-live")).toBe("false");
      expect(tiles(stale)).toEqual({});
      expect(stale.textContent).toContain("Feed sedang offline");
      expect(stale.textContent).not.toContain("Data langsung");
    });

    it("goes offline while open once the feed goes stale, ticking on an interval it clears on unmount", () => {
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
      try {
        feedBox.feed = { status: "ready", snapshot: shipStep(NOW, "base"), fetchedAt: NOW } satisfies OfficeFeed;
        const view = render(<EngineBody view={buildEngineRoomViews("en")["B1:reactor"]!} locale="en" />);
        const live = () => view.container.querySelector("[data-reactor-live]")?.getAttribute("data-reactor-live");
        expect(live()).toBe("true");
        expect(REACTOR_DRAWER_TICK_MS).toBeGreaterThanOrEqual(15_000);
        expect(REACTOR_DRAWER_TICK_MS).toBeLessThanOrEqual(30_000);
        // The feed stops updating (no new render from it); the clock runs past the stale window.
        feedBox.now = NOW + REACTOR_STALE_MS + 1;
        act(() => vi.advanceTimersByTime(REACTOR_DRAWER_TICK_MS - 1));
        expect(live()).toBe("true");
        act(() => vi.advanceTimersByTime(1));
        expect(live()).toBe("false");
        expect(view.container.textContent).toContain("The live feed is offline right now");
        expect(view.container.textContent).not.toContain("Live now");
        expect(vi.getTimerCount()).toBe(1);
        view.unmount();
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});

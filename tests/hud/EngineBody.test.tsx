// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildEngineRoomViews } from "@/content/room-views";
import { EngineBody } from "@/hud/drawer/EngineBody";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, ...rest }: { href: string } & Record<string, unknown>) => <a href={`/en${href}`} {...rest} />,
}));

const views = buildEngineRoomViews("en");
const body = (id: string) => render(<EngineBody view={views[`B1:${id}`]!} locale="en" />).container;

beforeEach(() => vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline")))));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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
});

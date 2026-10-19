// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GuideActions } from "@/components/guides/GuideActions";
import { GuideCard, type GuideCardLabels } from "@/components/guides/GuideShelf";
import type { GuideView } from "@/content/guides";
import { HUD_EVENT, type HudCommand } from "@/hud/events";

// GuideShelf's section wrapper pulls in next-intl navigation, which Vitest cannot resolve; the card does not need it.
vi.mock("@/components/page/Layout", () => ({ SectionSplit: () => null }));

afterEach(() => cleanup());

const actions = {
  slug: "example-guide",
  title: "Example Study Guide",
  downloadUrl: "/api/guides/example-guide?v=abc&download=1",
  file: "example-guide.pdf",
  readLabel: "Read",
  downloadLabel: "Download PDF",
};

function listen() {
  const commands: HudCommand[] = [];
  const handler = (event: Event) => commands.push((event as CustomEvent<HudCommand>).detail);
  window.addEventListener(HUD_EVENT, handler);
  return { commands, stop: () => window.removeEventListener(HUD_EVENT, handler) };
}

describe("GuideActions", () => {
  it("renders a same-origin download link with download and no target", () => {
    render(<GuideActions {...actions} />);
    const link = screen.getByRole("link", { name: /Download PDF/ });
    expect(link).toHaveAttribute("href", actions.downloadUrl);
    expect(link.getAttribute("href")).toMatch(/^\/api\/guides\//);
    expect(link).toHaveAttribute("download", actions.file);
    expect(link).not.toHaveAttribute("target");
    expect(link).toHaveClass("pv-btn");
  });

  it("opens the guide reader with an hq:hud guide command", () => {
    const { commands, stop } = listen();
    render(<GuideActions {...actions} />);
    const read = screen.getByTestId("guide-read");
    expect(read).toHaveClass("pv-btn", "pv-btn-primary");
    expect(read).toHaveAccessibleName(/^Read/);
    expect(read).toHaveAccessibleName(/Example Study Guide/);
    fireEvent.click(read);
    stop();
    expect(commands).toEqual([{ type: "guide", slug: "example-guide" }]);
  });
});

const view: GuideView = {
  slug: "example-guide",
  certId: "example-cert",
  code: "EX-100",
  spine: "EX-100",
  issuer: "Microsoft",
  title: "Example Study Guide",
  summary: "A fictional guide for the test.",
  edition: "2026-10",
  editionLabel: "Oct 2026",
  file: "example-guide.pdf",
  pages: 120,
  bytes: 4_400_000,
  sizeLabel: "4.4 MB",
  version: "abc",
  cover: "/study-guides/example-guide.webp",
  url: "/api/guides/example-guide?v=abc",
  downloadUrl: "/api/guides/example-guide?v=abc&download=1",
  domains: [
    { label: "Plan", weight: [25, 30], weightLabel: "25-30%" },
    { label: "Build", weight: [40, 40], weightLabel: "~40%" },
  ],
};

const labels: GuideCardLabels = { pages: "120 pages", domains: "Exam domains", read: "Read", download: "Download PDF" };

describe("GuideCard", () => {
  it("shows a decorative lazy cover, the issuer and code, the title, the summary and the size", () => {
    render(
      <ul>
        <GuideCard view={view} labels={labels} />
      </ul>,
    );
    const card = screen.getAllByRole("listitem")[0];
    const cover = card.querySelector("img")!;
    expect(cover).toHaveAttribute("src", view.cover);
    expect(cover).toHaveAttribute("alt", "");
    expect(cover).toHaveAttribute("loading", "lazy");
    expect(cover).toHaveAttribute("width", "240");
    expect(cover).toHaveAttribute("height", "340");
    expect(within(card).getByRole("heading", { level: 3 })).toHaveTextContent("Example Study Guide");
    expect(card).toHaveTextContent("Microsoft");
    expect(card).toHaveTextContent("EX-100");
    expect(card).toHaveTextContent("A fictional guide for the test.");
    expect(card).toHaveTextContent("120 pages · 4.4 MB");
    expect(within(card).getByTestId("guide-read")).toBeInTheDocument();
  });

  it("draws one domain segment per domain, sized by the midpoint weight, with a screen reader list", () => {
    render(
      <ul>
        <GuideCard view={view} labels={labels} />
      </ul>,
    );
    const segments = [...document.querySelectorAll<HTMLElement>("[data-guide-domain]")];
    expect(segments.map((s) => s.style.flexGrow)).toEqual(["27.5", "40"]);
    expect(segments.map((s) => s.getAttribute("title"))).toEqual(["Plan 25-30%", "Build ~40%"]);
    const list = screen.getByRole("list", { name: "Exam domains" });
    expect(list).toHaveClass("sr-only");
    expect(within(list).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Plan 25-30%", "Build ~40%"]);
  });

  it("leaves out the exam code when the guide has none", () => {
    render(
      <ul>
        <GuideCard view={{ ...view, code: null, issuer: "Google" }} labels={labels} />
      </ul>,
    );
    expect(screen.getAllByRole("listitem")[0]).not.toHaveTextContent("EX-100");
  });
});

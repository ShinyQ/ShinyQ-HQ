// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DialogHost } from "@/components/DialogHost";
import { GuideCard, GuideShelf, type GuideCardLabels } from "@/components/guides/GuideShelf";
import type { GuideView } from "@/content/guides";
import en from "../../messages/en.json";

// GuideShelf's section wrapper pulls in next-intl navigation, which Vitest cannot resolve: render its children only.
vi.mock("@/components/page/Layout", () => ({ SectionSplit: ({ children }: { children: ReactNode }) => children }));
// Server translations from the real English messages, with `{name}` placeholders filled in.
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ namespace }: { namespace: keyof typeof en }) => (key: string, values: Record<string, unknown> = {}) =>
    String((en[namespace] as Record<string, string>)[key]).replace(/\{(\w+)\}/g, (_, name: string) => String(values[name])),
}));

vi.mock("@/lib/audio", () => ({ audio: { play: vi.fn() } }));
vi.mock("next/dynamic", () => ({
  default: (load: () => Promise<{ default: ComponentType<Record<string, unknown>> }>) => {
    const Lazy = lazy(load);
    return function Dynamic(props: Record<string, unknown>) {
      return (
        <Suspense fallback={null}>
          <Lazy {...props} />
        </Suspense>
      );
    };
  },
}));
// Stand-in for the lazy reader chunk (pdf.js does not run under jsdom).
vi.mock("@/components/guides/GuideDialog", () => ({
  default: ({ slug }: { slug: string }) => <div data-testid="guide-dialog" data-slug={slug} />,
}));

afterEach(() => cleanup());

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

const labels: GuideCardLabels = { pages: "120 pages", edition: "Edition Oct 2026", domains: "Exam domains", read: "Read", download: "Download PDF" };

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
    expect(card).toHaveTextContent("120 pages, 4.4 MB, Edition Oct 2026");
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

describe("GuideShelf", () => {
  it("labels each card with its pages and edition and ends with the independent material note", async () => {
    render(await GuideShelf({ locale: "en", guides: [view] }));
    const card = screen.getAllByRole("listitem")[0];
    expect(card).toHaveTextContent("120 pages, 4.4 MB, Edition Oct 2026");
    const note = screen.getByText(en.guides.independent);
    expect(note).toHaveClass("pv-small", "text-ink-3");
    expect(note.closest("li")).toBeNull();
  });
});

describe("GuideCard actions", () => {
  it("renders a same-origin download link with download and no target", () => {
    render(
      <ul>
        <GuideCard view={view} labels={labels} />
      </ul>,
    );
    const link = screen.getByRole("link", { name: /Download PDF/ });
    expect(link).toHaveAttribute("href", view.downloadUrl);
    expect(link.getAttribute("href")).toMatch(/^\/api\/guides\//);
    expect(link).toHaveAttribute("download", view.file);
    expect(link).not.toHaveAttribute("target");
    expect(link).toHaveAccessibleName(/Example Study Guide/);
    expect(link).toHaveClass("pv-btn", "pv-btn-ghost");
  });

  it("renders Read as server markup that DialogHost opens with a delegated click", async () => {
    render(
      <>
        <ul>
          <GuideCard view={view} labels={labels} />
        </ul>
        <DialogHost />
      </>,
    );
    const read = screen.getByTestId("guide-read");
    expect(read).toHaveAttribute("type", "button");
    expect(read).toHaveAttribute("data-hq-guide", "example-guide");
    expect(read).toHaveAttribute("aria-haspopup", "dialog");
    expect(read).toHaveClass("pv-btn", "pv-btn-primary");
    expect(read).toHaveAccessibleName(/^Read/);
    expect(read).toHaveAccessibleName(/Example Study Guide/);
    expect(screen.queryByTestId("guide-dialog")).toBeNull();
    fireEvent.click(read);
    await waitFor(() => expect(screen.getByTestId("guide-dialog")).toHaveAttribute("data-slug", "example-guide"));
  });
});

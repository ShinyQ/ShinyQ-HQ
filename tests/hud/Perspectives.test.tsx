// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PerspectiveList, type PerspectiveItem } from "@/components/page/Perspectives";
import type { Perspective } from "@/content/schema";
import { formatYearMonth } from "@/lib/format";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const entry = (id: string): Perspective => ({
  id,
  question: { en: `Question ${id}?`, id: `Pertanyaan ${id}?` },
  answer: { en: `Answer ${id}.`, id: `Jawaban ${id}.` },
  tags: ["testing"],
  asOf: "2026-10",
});
const labels = { related: "Related", external: "opens in a new tab", asOf: (date: string) => `Written ${formatYearMonth(date, "en")}` };
const items: PerspectiveItem[] = [
  {
    entry: entry("a"),
    links: [
      { href: "/blog/post-x", label: "Post X", external: false },
      { href: "https://medium.com/x", label: "Medium X", external: true },
    ],
  },
  { entry: entry("b"), links: [] },
];

afterEach(() => {
  cleanup();
  window.location.hash = "";
});

describe("PerspectiveList", () => {
  it("renders nothing without published entries", () => {
    const { container } = render(<PerspectiveList items={[]} locale="en" labels={labels} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a closed details accordion with the question as a heading and an anchor per entry", () => {
    render(<PerspectiveList items={items} locale="en" labels={labels} />);
    const list = screen.getByTestId("perspectives");
    const a = document.getElementById("perspectives-a") as HTMLDetailsElement;
    expect(a.tagName).toBe("DETAILS");
    expect(a.open).toBe(false);
    expect(a).toHaveAttribute("data-perspective", "a");
    expect(within(list).getByRole("heading", { level: 3, name: "Question a?" }).closest("summary")).not.toBeNull();
    expect(a).toHaveTextContent("Answer a.");
    expect(a).toHaveTextContent("Written Oct 2026");
    expect(within(a).getByRole("link", { name: "Post X" })).toHaveAttribute("href", "/blog/post-x");
    const external = within(a).getByRole("link", { name: /Medium X/ });
    expect(external).toHaveAttribute("target", "_blank");
    expect(external).toHaveAttribute("rel", "noopener noreferrer");
    expect(external).toHaveTextContent("opens in a new tab");
    expect(document.getElementById("perspectives-b")).not.toHaveTextContent("Related");
  });

  it("renders the Indonesian question and answer", () => {
    render(<PerspectiveList items={items} locale="id" labels={labels} />);
    expect(screen.getByRole("heading", { level: 3, name: "Pertanyaan a?" })).toBeInTheDocument();
    expect(document.getElementById("perspectives-a")).toHaveTextContent("Jawaban a.");
  });

  it("opens the entry named by the hash on load and on a later hash change", async () => {
    window.location.hash = "#perspectives-b";
    render(<PerspectiveList items={items} locale="en" labels={labels} />);
    const a = document.getElementById("perspectives-a") as HTMLDetailsElement;
    const b = document.getElementById("perspectives-b") as HTMLDetailsElement;
    await waitFor(() => expect(b.open).toBe(true));
    expect(a.open).toBe(false);
    window.location.hash = "#perspectives-a";
    await waitFor(() => expect(a.open).toBe(true));
  });

  it("ignores hashes outside the perspectives prefix", async () => {
    window.location.hash = "#how";
    render(<PerspectiveList items={items} locale="en" labels={labels} />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect((document.getElementById("perspectives-a") as HTMLDetailsElement).open).toBe(false);
  });
});

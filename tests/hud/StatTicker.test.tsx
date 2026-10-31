// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StatTicker } from "@/components/page/StatTicker";
import { DYNAMIC_STATS, getStats } from "@/content/load";

afterEach(cleanup);

const props = {
  stats: getStats(),
  locale: "en" as const,
  liveIds: Object.keys(DYNAMIC_STATS),
  title: "At a glance",
  live: "Live",
};

describe("StatTicker (the #stats ledger)", () => {
  it("is the #stats region, named by its heading", () => {
    render(<StatTicker {...props} />);
    expect(screen.getByRole("region", { name: "At a glance" })).toHaveAttribute("id", "stats");
  });

  it("lists every stat once, value and label, with its id", () => {
    const { container } = render(<StatTicker {...props} />);
    const list = screen.getByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(props.stats.length);
    for (const stat of props.stats) {
      const item = container.querySelector(`[data-stat="${stat.id}"]`);
      expect(item).toHaveTextContent(stat.value);
      expect(item).toHaveTextContent(stat.label.en);
    }
  });

  it("marks the stats that come from the live facts", () => {
    render(<StatTicker {...props} />);
    expect(screen.getAllByText("Live")).toHaveLength(props.stats.filter((s) => props.liveIds.includes(s.id)).length);
  });

  it("is still: one list, nothing hidden for a loop, no date stamp and no pause switch (Hallmark redesign 2026-10-27)", () => {
    const { container } = render(<StatTicker {...props} />);
    expect(container.querySelectorAll("ul")).toHaveLength(1);
    expect(container.querySelector("[aria-hidden='true']")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(container).not.toHaveTextContent(/Updated/);
  });
});

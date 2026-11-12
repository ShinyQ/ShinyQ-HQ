// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StatTicker } from "@/components/page/StatTicker";
import { DYNAMIC_STATS, getStats } from "@/content/load";
import { leadStats, scaleStats } from "@/content/selectors";

afterEach(cleanup);

const props = {
  stats: leadStats(getStats()),
  locale: "en" as const,
  liveIds: Object.keys(DYNAMIC_STATS),
  title: "At a glance",
  live: "Live",
  deltaLabels: { from: "from", to: "to" },
  scale: scaleStats(getStats()),
  scaleNote: "Volume, agent-assisted and human-reviewed:",
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
      if (stat.delta) {
        expect(item).toHaveTextContent(`${stat.delta.before} → to ${stat.delta.after}`);
      } else {
        expect(item).toHaveTextContent(stat.value);
      }
      expect(item).toHaveTextContent(stat.label.en);
    }
  });

  it("marks the stats that come from the live facts", () => {
    render(<StatTicker {...props} />);
    expect(screen.queryAllByText("Live")).toHaveLength(props.stats.filter((s) => props.liveIds.includes(s.id)).length);
  });

  it("is still: one list, nothing hidden for a loop, no date stamp and no pause switch (Hallmark redesign 2026-10-27)", () => {
    const { container } = render(<StatTicker {...props} />);
    expect(container.querySelectorAll("ul")).toHaveLength(1);
    expect(container.querySelector("li[aria-hidden='true'], ul[aria-hidden='true']")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(container).not.toHaveTextContent(/Updated/);
  });

  it("moves the PR and contribution counts to one muted footnote, out of the list (owner decision 2026-11-13)", () => {
    const { container } = render(<StatTicker {...props} />);
    const note = screen.getByTestId("scale-note");
    for (const stat of props.scale) {
      expect(note).toHaveTextContent(stat.value);
      expect(container.querySelector(`[data-stat="${stat.id}"]`)).toBeNull();
    }
    expect(note).toHaveTextContent(/^Volume, agent-assisted/);
  });
});

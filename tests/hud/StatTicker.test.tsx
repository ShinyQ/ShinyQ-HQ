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

function tracks(container: HTMLElement) {
  const [shown, copy] = Array.from(container.querySelectorAll<HTMLElement>("ul.hx-tick-track"));
  return { shown, copy };
}

describe("StatTicker", () => {
  it("is the #stats region, named by its heading", () => {
    render(<StatTicker {...props} />);
    expect(screen.getByRole("region", { name: "At a glance" })).toHaveAttribute("id", "stats");
  });

  it("lists every stat once for assistive tech and repeats the list hidden for the loop", () => {
    const { container } = render(<StatTicker {...props} />);
    const { shown, copy } = tracks(container);
    expect(within(shown).getAllByRole("listitem")).toHaveLength(props.stats.length);
    expect(copy).toHaveAttribute("aria-hidden", "true");
    expect(screen.getAllByRole("listitem")).toHaveLength(props.stats.length);
    for (const stat of props.stats) {
      expect(shown).toHaveTextContent(stat.value);
      expect(shown).toHaveTextContent(stat.label.en);
    }
  });

  it("marks the stats that come from the live facts", () => {
    const { container } = render(<StatTicker {...props} />);
    const { shown } = tracks(container);
    expect(within(shown).getAllByText("Live")).toHaveLength(props.stats.filter((s) => props.liveIds.includes(s.id)).length);
  });

  it("is a plain marquee: no date stamp and no pause switch (owner request 2026-10-15)", () => {
    const { container } = render(<StatTicker {...props} />);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(container.querySelector(".hx-tick-bar")?.children).toHaveLength(1);
    expect(container).not.toHaveTextContent(/Updated/);
  });
});

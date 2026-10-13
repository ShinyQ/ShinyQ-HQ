// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import id from "../../messages/id.json";
import { VisitsPanel } from "@/components/stats/VisitsPanel";
import { STATS_FIXTURE } from "@/lib/visits/contract";
import { __setStatsForTests } from "@/lib/visits/store";

const chips = { "work-best": "What are his best software projects?", "ai-voice": "How does the voice AI contact center work?", "work-stack": "Which backend stack does he use most?" };
const floors = { L1: "Home", L2: "Journey", L3: "Work", L4: "Writing", RF: "About" } as const;

function renderPanel(locale: "en" | "id" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : id}>
      <VisitsPanel locale={locale} chipLabels={chips} floorLabels={floors} />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  __setStatsForTests(null);
});

describe("VisitsPanel", () => {
  it("renders nothing while hidden and a loading line before the data", () => {
    __setStatsForTests({ status: "hidden", snapshot: null, freshness: "hidden" });
    const { container } = renderPanel();
    expect(container).toBeEmptyDOMElement();
    cleanup();
    __setStatsForTests({ status: "loading", snapshot: null, freshness: "hidden" });
    renderPanel();
    expect(screen.getByTestId("visits-loading")).toHaveTextContent(en.stats.loading);
  });

  it("shows the window, the source and the update cadence with the numbers", () => {
    __setStatsForTests({ status: "ready", snapshot: STATS_FIXTURE, freshness: "fresh" });
    renderPanel();
    const scope = screen.getByTestId("visits-scope");
    expect(scope).toHaveTextContent(en.stats.window.d30);
    expect(scope).toHaveTextContent(en.stats.source);
    expect(scope).toHaveTextContent(en.stats.updated);
    expect(screen.queryByTestId("visits-delayed")).toBeNull();
    expect(screen.getByText("1,240")).toBeInTheDocument();
    expect(screen.getByText("Work · L3")).toBeInTheDocument();
  });

  it("filters with two native radio groups and announces the result", async () => {
    __setStatsForTests({ status: "ready", snapshot: STATS_FIXTURE, freshness: "fresh" });
    renderPanel();
    const topic = screen.getByRole("group", { name: en.stats.topicLegend });
    const period = screen.getByRole("group", { name: en.stats.periodLegend });
    expect(within(topic).getAllByRole("radio")).toHaveLength(4);
    expect(within(period).getAllByRole("radio")).toHaveLength(2);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Last 30 days, topic All: 1,240 visits from 10 countries, 318 questions.");

    await userEvent.click(within(topic).getByRole("radio", { name: "All" }));
    await userEvent.keyboard("{ArrowRight}");
    expect(within(topic).getByRole("radio", { name: "Work" })).toBeChecked();
    expect(status).toHaveTextContent("topic Work: 1,240 visits from 10 countries, 120 questions.");
    const list = screen.getByTestId("visits-chips");
    expect(within(list).getAllByRole("listitem").map((li) => li.getAttribute("data-chip"))).toEqual(["work-best", "work-stack"]);

    await userEvent.click(within(period).getByRole("radio", { name: "Since launch" }));
    expect(screen.getByTestId("visits-scope")).toHaveTextContent("Since Oct 1, 2026");
    expect(status).toHaveTextContent("Since launch, topic Work: 12.5 thousand visits from 17 countries, 1,100 questions.");
  });

  it("lists country names in the table, never a number per country", async () => {
    __setStatsForTests({ status: "ready", snapshot: STATS_FIXTURE, freshness: "fresh" });
    renderPanel();
    await userEvent.click(screen.getByText(en.stats.table.open));
    const rows = within(screen.getByTestId("visits-table")).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(10);
    expect(rows.map((r) => r.textContent)).toContain("IndonesiaID");
    expect(rows.every((r) => !/\d/.test(r.textContent ?? ""))).toBe(true);
    expect(screen.getByTestId("visits-map").querySelectorAll("[data-country]")).toHaveLength(10);
  });

  it("notes a delayed snapshot and speaks Indonesian", () => {
    __setStatsForTests({ status: "ready", snapshot: STATS_FIXTURE, freshness: "delayed" });
    renderPanel("id");
    expect(screen.getByTestId("visits-delayed")).toHaveTextContent("Tertunda: terakhir diperbarui 13 Okt 2026");
    expect(screen.getByTestId("visits-scope")).toHaveTextContent(id.stats.window.d30);
    expect(screen.getByText("1.240")).toBeInTheDocument();
  });
});

describe("VisitsPanel with an early snapshot", () => {
  it("hides the split without beacon data and says none yet without topics", async () => {
    const { STATS_FIXTURE_EMPTY } = await import("@/lib/visits/contract");
    __setStatsForTests({ status: "ready", snapshot: { ...STATS_FIXTURE_EMPTY, visits: { d30: 22, all: 22 }, countries: { d30: ["ID", "US"], all: ["ID", "US"] } }, freshness: "fresh" });
    renderPanel();
    expect(screen.queryByTestId("visits-split")).toBeNull();
    expect(within(screen.getByTestId("visits-topics")).getByText(en.stats.counters.none)).toBeInTheDocument();
    expect(within(screen.getByTestId("visits-chips")).getByText(en.stats.noChips)).toBeInTheDocument();
    expect(screen.getByTestId("visits-map").querySelectorAll("[data-country]")).toHaveLength(2);
  });
});

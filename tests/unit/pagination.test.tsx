// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import { Paginated } from "@/components/page/Paginated";
import { clampPage, pageItemAttrs, pageRange, pageWindow, parsePage } from "@/content/pagination";

describe("page math", () => {
  it("parses the page param, defaulting to 1", () => {
    expect(parsePage("?page=3", "page")).toBe(3);
    for (const bad of ["", "?page=0", "?page=-2", "?page=abc", "?page=1.5", "?posts=4"]) expect(parsePage(bad, "page"), bad).toBe(1);
  });
  it("clamps into the pages that exist", () => {
    expect(clampPage(99, 35, 10)).toBe(4);
    expect(clampPage(0, 35, 10)).toBe(1);
    expect(clampPage(2, 0, 10)).toBe(1);
    expect(clampPage(2, 20, 10)).toBe(2);
  });
  it("reports the range shown, capped on the last partial page", () => {
    expect(pageRange(2, 35, 10)).toEqual({ from: 11, to: 20 });
    expect(pageRange(4, 35, 10)).toEqual({ from: 31, to: 35 });
    expect(pageRange(3, 14, 6)).toEqual({ from: 13, to: 14 });
    expect(pageRange(1, 0, 6)).toEqual({ from: 0, to: 0 });
  });
  it("lists every page up to 7, else first, last and neighbours with gaps", () => {
    expect(pageWindow(1, 4)).toEqual([1, 2, 3, 4]);
    expect(pageWindow(5, 10)).toEqual([1, null, 4, 5, 6, null, 10]);
    expect(pageWindow(1, 10)).toEqual([1, 2, null, 10]);
    expect(pageWindow(10, 10)).toEqual([1, null, 9, 10]);
  });
  it("marks server rows past the first page", () => {
    expect(pageItemAttrs(9, 10)).toEqual({ "data-page-item": "" });
    expect(pageItemAttrs(10, 10)).toEqual({ "data-page-item": "", "data-paged-out": "" });
  });
});

describe("Paginated", () => {
  beforeEach(() => window.history.replaceState(null, "", "/en/labs"));
  afterEach(cleanup);

  const list = (n: number) => (
    <NextIntlClientProvider locale="en" messages={en}>
      <h2 id="list-title">Projects</h2>
      <Paginated param="page" size={10} total={n} label="More projects pages" headingId="list-title">
        <ul>
          {Array.from({ length: n }, (_, i) => (
            <li key={i} data-page-item="" data-testid="row">
              Row {i + 1}
            </li>
          ))}
        </ul>
      </Paginated>
    </NextIntlClientProvider>
  );
  const shown = () => screen.getAllByTestId("row").filter((r) => !r.hasAttribute("data-paged-out")).map((r) => r.textContent);

  it("shows the first page, a pager and the range", () => {
    render(list(25));
    expect(shown()).toHaveLength(10);
    expect(screen.getByRole("navigation", { name: "More projects pages" })).toBeInTheDocument();
    expect(screen.getByTestId("pager-range")).toHaveTextContent("Showing 1 to 10 of 25");
    expect(screen.getByRole("link", { name: "Page 1" })).toHaveAttribute("aria-current", "page");
  });

  it("moves to a page on click, writes ?page= and focuses the list heading", () => {
    render(list(25));
    fireEvent.click(screen.getByRole("link", { name: "Page 3" }));
    expect(window.location.search).toBe("?page=3");
    expect(shown()).toEqual(["Row 21", "Row 22", "Row 23", "Row 24", "Row 25"]);
    expect(document.activeElement).toBe(document.getElementById("list-title"));
  });

  it("clamps an out-of-range deep link and rewrites the URL", () => {
    window.history.replaceState(null, "", "/en/labs?page=99");
    render(list(25));
    expect(shown()).toEqual(["Row 21", "Row 22", "Row 23", "Row 24", "Row 25"]);
    expect(window.location.search).toBe("?page=3");
  });

  it("pages only the rows a filter left visible, recounting when one hides", async () => {
    render(list(25));
    const rows = screen.getAllByTestId("row");
    await act(async () => {
      rows.slice(0, 20).forEach((r) => (r.hidden = true));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(rows.slice(20).every((r) => !r.hasAttribute("data-paged-out"))).toBe(true);
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("renders no pager for a single page", () => {
    render(list(8));
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(shown()).toHaveLength(8);
  });
});

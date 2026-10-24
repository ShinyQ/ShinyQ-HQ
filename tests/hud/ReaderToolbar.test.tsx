// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import { ReaderToolbar, type ReaderToolbarProps } from "@/components/pdf-reader/ReaderToolbar";

afterEach(() => cleanup());

function setup(overrides: Partial<ReaderToolbarProps> = {}) {
  const props: ReaderToolbarProps = {
    title: "Example Study Guide",
    titleId: "guide-title",
    closeLabel: en.guides.close,
    chapters: [
      { title: "Chapter One", dest: "one", depth: 0 },
      { title: "Section 1.1", dest: "one-one", depth: 1 },
    ],
    downloadUrl: "/api/guides/example?download=1",
    file: "example.pdf",
    onClose: vi.fn(),
    onChapter: vi.fn(),
    ...overrides,
  };
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ReaderToolbar {...props} />
    </NextIntlClientProvider>,
  );
  return props;
}

describe("ReaderToolbar", () => {
  it("is one header row: Close, title, Chapters and Download, with no page or zoom controls", () => {
    setup();
    const close = screen.getByTestId("guide-close");
    const row = close.parentElement!;
    expect(within(row).getByRole("heading", { name: "Example Study Guide" })).toHaveAttribute("id", "guide-title");
    expect(within(row).getByTestId("guide-chapters")).toBeInTheDocument();
    expect(within(row).getByTestId("guide-download")).toHaveAttribute("download", "example.pdf");
    expect(row.children).toHaveLength(4);
    for (const id of ["guide-page-input", "guide-page-count", "guide-prev", "guide-next", "guide-zoom-out", "guide-zoom-in", "guide-fit"]) {
      expect(screen.queryByTestId(id)).toBeNull();
    }
  });

  it("keeps 44 px targets on touch screens and allows 36 px only with a fine pointer", () => {
    setup();
    for (const id of ["guide-close", "guide-chapters", "guide-download"]) {
      const classes = screen.getByTestId(id).className.split(/\s+/);
      expect(classes).toEqual(expect.arrayContaining(["min-h-11", "min-w-11", "pointer-fine:min-h-9", "pointer-fine:min-w-9"]));
    }
  });

  it("Close calls onClose", () => {
    const props = setup();
    fireEvent.click(screen.getByTestId("guide-close"));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("Chapters opens the outline list and a chapter jumps and closes it", () => {
    const props = setup();
    const toggle = screen.getByTestId("guide-chapters");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const list = screen.getByTestId("guide-chapter-list");
    expect(toggle).toHaveAttribute("aria-controls", list.id);
    fireEvent.click(within(list).getByRole("button", { name: "Section 1.1" }));
    expect(props.onChapter).toHaveBeenCalledWith({ title: "Section 1.1", dest: "one-one", depth: 1 });
    expect(screen.queryByTestId("guide-chapter-list")).toBeNull();
  });

  it("hides Chapters when the PDF has no outline", () => {
    setup({ chapters: [] });
    expect(screen.queryByTestId("guide-chapters")).toBeNull();
  });

  it("puts the surface's Back after Close (the paper reader) and prefixes every test id", () => {
    const onBack = vi.fn();
    setup({ testPrefix: "paper", closeLabel: en.paper.close, chapters: [], back: { label: en.paper.back, onBack } });
    const close = screen.getByRole("button", { name: en.paper.close });
    expect(close).toHaveAttribute("data-testid", "paper-close");
    const back = screen.getByRole("button", { name: en.paper.back });
    expect(close.nextElementSibling).toBe(back);
    expect(back.className.split(/\s+/)).toEqual(expect.arrayContaining(["min-h-11", "pointer-fine:min-h-9"]));
    fireEvent.click(back);
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("paper-download")).toHaveAttribute("href", "/api/guides/example?download=1");
    expect(screen.queryByTestId("guide-close")).toBeNull();
  });
});

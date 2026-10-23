// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import { GuideToolbar, type GuideToolbarProps } from "@/components/guides/GuideToolbar";

afterEach(() => cleanup());

function setup(overrides: Partial<GuideToolbarProps> = {}) {
  const props: GuideToolbarProps = {
    title: "Example Study Guide",
    titleId: "guide-title",
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
      <GuideToolbar {...props} />
    </NextIntlClientProvider>,
  );
  return props;
}

describe("GuideToolbar", () => {
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
});

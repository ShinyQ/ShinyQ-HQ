// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import { GuideToolbar, type GuideToolbarProps } from "@/components/guides/GuideToolbar";
import { ZOOM_STEPS } from "@/components/guides/reader-model";

afterEach(() => cleanup());

const MIN = ZOOM_STEPS[0];
const MAX = ZOOM_STEPS[ZOOM_STEPS.length - 1];

function setup(overrides: Partial<GuideToolbarProps> = {}) {
  const props: GuideToolbarProps = {
    title: "Example Study Guide",
    titleId: "guide-title",
    count: 10,
    current: 5,
    zoom: 1,
    chapters: [],
    downloadUrl: "/api/guides/example?download=1",
    file: "example.pdf",
    onClose: vi.fn(),
    onGo: vi.fn(),
    onZoom: vi.fn(),
    onFit: vi.fn(),
    onChapter: vi.fn(),
    ...overrides,
  };
  const view = render(
    <NextIntlClientProvider locale="en" messages={en}>
      <GuideToolbar {...props} />
    </NextIntlClientProvider>,
  );
  const rerender = (next: Partial<GuideToolbarProps>) => {
    Object.assign(props, next);
    view.rerender(
      <NextIntlClientProvider locale="en" messages={en}>
        <GuideToolbar {...props} />
      </NextIntlClientProvider>,
    );
  };
  return { props, rerender };
}

describe("GuideToolbar limits keep focus", () => {
  it("Prev stays focused and does nothing once page 1 is reached", () => {
    const { props, rerender } = setup({ current: 2 });
    const prev = screen.getByTestId("guide-prev");
    prev.focus();
    fireEvent.click(prev);
    expect(props.onGo).toHaveBeenCalledWith(1);
    rerender({ current: 1 });
    expect(prev).not.toBeDisabled();
    expect(prev).toHaveAttribute("aria-disabled", "true");
    expect(prev).toHaveFocus();
    fireEvent.click(prev);
    expect(props.onGo).toHaveBeenCalledTimes(1);
  });

  it("Next stays focused and does nothing on the last page", () => {
    const { props, rerender } = setup({ current: 9 });
    const next = screen.getByTestId("guide-next");
    next.focus();
    fireEvent.click(next);
    expect(props.onGo).toHaveBeenCalledWith(10);
    rerender({ current: 10 });
    expect(next).not.toBeDisabled();
    expect(next).toHaveAttribute("aria-disabled", "true");
    expect(next).toHaveFocus();
    fireEvent.click(next);
    expect(props.onGo).toHaveBeenCalledTimes(1);
  });

  it("Zoom out and Zoom in stay focused and do nothing at the zoom limits", () => {
    const { props, rerender } = setup({ zoom: MIN });
    const out = screen.getByTestId("guide-zoom-out");
    out.focus();
    expect(out).not.toBeDisabled();
    expect(out).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(out);
    expect(props.onZoom).not.toHaveBeenCalled();
    expect(out).toHaveFocus();

    rerender({ zoom: MAX });
    const zoomIn = screen.getByTestId("guide-zoom-in");
    zoomIn.focus();
    expect(zoomIn).not.toBeDisabled();
    expect(zoomIn).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(zoomIn);
    expect(props.onZoom).not.toHaveBeenCalled();
    expect(zoomIn).toHaveFocus();
    expect(out).toHaveAttribute("aria-disabled", "false");
    fireEvent.click(out);
    expect(props.onZoom).toHaveBeenCalledWith(-1);
  });

  it("navigation does nothing before the PDF opens", () => {
    const { props } = setup({ count: null, current: 1 });
    for (const id of ["guide-prev", "guide-next", "guide-zoom-out", "guide-zoom-in"]) {
      const button = screen.getByTestId(id);
      expect(button).toHaveAttribute("aria-disabled", "true");
      fireEvent.click(button);
    }
    expect(props.onGo).not.toHaveBeenCalled();
    expect(props.onZoom).not.toHaveBeenCalled();
  });
});

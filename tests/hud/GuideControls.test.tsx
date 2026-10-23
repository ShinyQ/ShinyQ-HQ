// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import { GuideControls, type GuideControlsProps } from "@/components/guides/GuideControls";
import { ZOOM_STEPS } from "@/components/guides/reader-model";

afterEach(() => cleanup());

const MIN = ZOOM_STEPS[0];
const MAX = ZOOM_STEPS[ZOOM_STEPS.length - 1];

function setup(overrides: Partial<GuideControlsProps> = {}) {
  const props: GuideControlsProps = {
    count: 10,
    current: 5,
    zoom: 1,
    onGo: vi.fn(),
    onZoom: vi.fn(),
    onFit: vi.fn(),
    ...overrides,
  };
  const view = render(
    <NextIntlClientProvider locale="en" messages={en}>
      <GuideControls {...props} />
    </NextIntlClientProvider>,
  );
  const rerender = (next: Partial<GuideControlsProps>) => {
    Object.assign(props, next);
    view.rerender(
      <NextIntlClientProvider locale="en" messages={en}>
        <GuideControls {...props} />
      </NextIntlClientProvider>,
    );
  };
  return { props, rerender };
}

describe("GuideControls limits keep focus", () => {
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

describe("GuideControls page box and zoom", () => {
  it("shows the current page and the count, and jumps to a typed page on Enter", () => {
    const { props } = setup({ current: 3 });
    const input = screen.getByTestId("guide-page-input");
    expect(input).toHaveValue("3");
    expect(screen.getByTestId("guide-page-count")).toHaveTextContent("/ 10");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "7" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(props.onGo).toHaveBeenCalledWith(7);
  });

  it("clamps a typed page to the document and keeps only digits", () => {
    const { props } = setup();
    const input = screen.getByTestId("guide-page-input");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "99" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(props.onGo).toHaveBeenLastCalledWith(10);
    expect(input).toHaveValue("10");
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(props.onGo).toHaveBeenLastCalledWith(1);
    fireEvent.change(input, { target: { value: "4a" } });
    expect(input).toHaveValue("4");
  });

  it("drops the draft on blur and shows the current page again", () => {
    setup({ current: 5 });
    const input = screen.getByTestId("guide-page-input");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "8" } });
    fireEvent.blur(input);
    expect(input).toHaveValue("5");
  });

  it("Prev and Next step one page inside the document", () => {
    const { props } = setup({ current: 5 });
    fireEvent.click(screen.getByTestId("guide-prev"));
    expect(props.onGo).toHaveBeenLastCalledWith(4);
    fireEvent.click(screen.getByTestId("guide-next"));
    expect(props.onGo).toHaveBeenLastCalledWith(6);
    expect(screen.getByTestId("guide-prev")).toHaveAttribute("aria-disabled", "false");
    expect(screen.getByTestId("guide-next")).toHaveAttribute("aria-disabled", "false");
  });

  it("zooms by one step each way and fits the width", () => {
    const { props, rerender } = setup({ zoom: 1.5 });
    fireEvent.click(screen.getByTestId("guide-zoom-in"));
    expect(props.onZoom).toHaveBeenLastCalledWith(1);
    fireEvent.click(screen.getByTestId("guide-zoom-out"));
    expect(props.onZoom).toHaveBeenLastCalledWith(-1);
    const fit = screen.getByTestId("guide-fit");
    expect(fit).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(fit);
    expect(props.onFit).toHaveBeenCalledTimes(1);
    rerender({ zoom: 1 });
    expect(fit).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps the labels and disables the input and Fit before the PDF opens", () => {
    setup({ count: null, current: 1 });
    expect(screen.getByLabelText(en.guides.pageInput)).toBeDisabled();
    expect(screen.getByTestId("guide-page-count")).toHaveTextContent("/ -");
    expect(screen.getByTestId("guide-fit")).toBeDisabled();
    for (const key of ["prev", "next", "zoomOut", "zoomIn", "fitWidth"] as const) expect(screen.getByRole("button", { name: en.guides[key] })).toBeInTheDocument();
  });
});

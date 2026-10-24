// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReaderPage } from "@/components/pdf-reader/ReaderPage";
import { ReaderThumbs } from "@/components/pdf-reader/ReaderThumbs";

type Callback = (entries: { target: Element; isIntersecting: boolean }[]) => void;
let observers: { callback: Callback; observed: Element[] }[] = [];

class FakeObserver {
  observed: Element[] = [];
  constructor(readonly callback: Callback) {
    observers.push(this);
  }
  observe(el: Element) {
    this.observed.push(el);
  }
  disconnect() {}
}

beforeEach(() => {
  observers = [];
  vi.stubGlobal("IntersectionObserver", FakeObserver);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function fakePage() {
  return {
    getViewport: ({ scale }: { scale: number }) => ({ width: 595 * scale, height: 842 * scale }),
    render: vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() })),
    streamTextContent: vi.fn(() => new ReadableStream()),
    cleanup: vi.fn(() => true),
  };
}

const flush = () => act(async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
});

function thumbs(doc: { getPage: unknown }, current = 2, onGo = vi.fn()) {
  render(
    <ReaderThumbs
      doc={doc as unknown as PDFDocumentProxy}
      count={5}
      base={{ width: 595, height: 842 }}
      current={current}
      label="Page thumbnails"
      pageLabel={(page) => `Page ${page} of 5`}
      onGo={onGo}
    />,
  );
  return { onGo, buttons: screen.getAllByRole("button") };
}

describe("ReaderThumbs", () => {
  it("is one tab stop: only the current page's thumbnail is tabbable", () => {
    const { buttons } = thumbs({ getPage: vi.fn(() => new Promise(() => {})) });
    expect(buttons.map((b) => b.tabIndex)).toEqual([-1, 0, -1, -1, -1]);
    expect(buttons[1]).toHaveAttribute("aria-current", "page");
  });

  it("moves focus and the tab stop with ArrowDown, ArrowUp, Home and End; a click goes to the page", () => {
    const { buttons, onGo } = thumbs({ getPage: vi.fn(() => new Promise(() => {})) });
    buttons[1].focus();
    fireEvent.keyDown(buttons[1], { key: "ArrowDown" });
    expect(buttons[2]).toHaveFocus();
    expect(buttons.map((b) => b.tabIndex)).toEqual([-1, -1, 0, -1, -1]);
    fireEvent.keyDown(buttons[2], { key: "ArrowUp" });
    fireEvent.keyDown(buttons[1], { key: "ArrowUp" });
    expect(buttons[0]).toHaveFocus();
    fireEvent.keyDown(buttons[0], { key: "ArrowUp" });
    expect(buttons[0]).toHaveFocus();
    fireEvent.keyDown(buttons[0], { key: "End" });
    expect(buttons[4]).toHaveFocus();
    const down = fireEvent.keyDown(buttons[4], { key: "Home" });
    expect(down).toBe(false);
    expect(buttons[0]).toHaveFocus();
    expect(buttons.map((b) => b.tabIndex)).toEqual([0, -1, -1, -1, -1]);
    expect(onGo).not.toHaveBeenCalled();
    fireEvent.click(buttons[0]);
    expect(onGo).toHaveBeenCalledWith(1);
  });

  it("follows the reader's current page", () => {
    const doc = { getPage: vi.fn(() => new Promise(() => {})) };
    const view = render(
      <ReaderThumbs doc={doc as never} count={5} base={{ width: 595, height: 842 }} current={2} label="t" pageLabel={(p) => `Page ${p}`} onGo={vi.fn()} />,
    );
    view.rerender(<ReaderThumbs doc={doc as never} count={5} base={{ width: 595, height: 842 }} current={4} label="t" pageLabel={(p) => `Page ${p}`} onGo={vi.fn()} />);
    expect(screen.getAllByRole("button").map((b) => b.tabIndex)).toEqual([-1, -1, -1, 0, -1]);
  });

  it("cleans up a page when its thumbnail leaves the rail", async () => {
    const page = fakePage();
    thumbs({ getPage: vi.fn(async () => page) });
    const [observer] = observers;
    const target = observer.observed[0];
    observer.callback([{ target, isIntersecting: true }]);
    await flush();
    expect(target.querySelector("canvas")).not.toBeNull();
    observer.callback([{ target, isIntersecting: false }]);
    expect(page.cleanup).toHaveBeenCalled();
  });

  it("a late failure of an old draw never drops the newer draw of the same thumbnail", async () => {
    let failFirst!: (error: Error) => void;
    const page = fakePage();
    const getPage = vi
      .fn()
      .mockImplementationOnce(() => new Promise((_, reject) => (failFirst = reject)))
      .mockImplementationOnce(async () => page);
    thumbs({ getPage });
    const [observer] = observers;
    const target = observer.observed[0];
    observer.callback([{ target, isIntersecting: true }]);
    observer.callback([{ target, isIntersecting: false }]);
    observer.callback([{ target, isIntersecting: true }]);
    failFirst(new Error("cancelled"));
    await flush();
    expect(target.querySelector("canvas")).not.toBeNull();
  });
});

describe("ReaderPage", () => {
  class FakeTextLayer {
    render = () => Promise.resolve();
    cancel = () => {};
  }
  const lib = { TextLayer: FakeTextLayer } as never;

  it("shows the failure with a retry that redraws the page", async () => {
    const page = fakePage();
    const getPage = vi
      .fn()
      .mockImplementationOnce(async () => {
        throw new Error("network");
      })
      .mockImplementation(async () => page);
    render(
      <ReaderPage lib={lib} doc={{ getPage } as never} n={3} width={300} height={424} scale={0.5} ratio={1} active label="Page 3 of 5" failedLabel="This page could not be drawn." retryLabel="Try again" />,
    );
    await flush();
    const slot = screen.getByTestId("guide-page");
    expect(slot).toHaveAttribute("data-failed", "true");
    expect(screen.getByText("This page could not be drawn.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await flush();
    expect(getPage).toHaveBeenCalledTimes(2);
    expect(slot).not.toHaveAttribute("data-failed");
    expect(slot).toHaveAttribute("data-rendered", "true");
    expect(slot.querySelector("canvas")).toHaveAttribute("aria-label", "Page 3 of 5");
  });
});

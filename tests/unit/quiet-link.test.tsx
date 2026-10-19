// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prefetch = vi.fn();
const linkProps: Record<string, unknown>[] = [];

vi.mock("@/i18n/navigation", () => ({
  Link: ({ prefetch: p, href, ...rest }: ComponentProps<"a"> & { prefetch?: unknown; href: unknown }) => {
    linkProps.push({ prefetch: p, href });
    return <a href={typeof href === "string" ? href : "#"} {...rest} />;
  },
  useRouter: () => ({ prefetch }),
}));

const { QuietLink } = await import("@/components/QuietLink");

const lastProps = () => linkProps[linkProps.length - 1];

beforeEach(() => {
  prefetch.mockClear();
  linkProps.length = 0;
});

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-hq-boot");
  document.documentElement.removeAttribute("data-hq");
});

describe("QuietLink", () => {
  it("never prefetches in the viewport and prefetches once on intent", () => {
    render(<QuietLink href="/labs">Work</QuietLink>);
    expect(lastProps().prefetch).toBe(false);
    const link = screen.getByRole("link", { name: "Work" });
    fireEvent.pointerEnter(link);
    expect(prefetch).toHaveBeenCalledTimes(1);
    expect(prefetch).toHaveBeenCalledWith("/labs");
    fireEvent.focus(link);
    fireEvent.touchStart(link);
    expect(prefetch).toHaveBeenCalledTimes(1);
  });

  it("prefetches again once the href changes", () => {
    const { rerender } = render(<QuietLink href="/labs">Work</QuietLink>);
    fireEvent.pointerEnter(screen.getByRole("link", { name: "Work" }));
    rerender(<QuietLink href="/journey">Work</QuietLink>);
    fireEvent.pointerEnter(screen.getByRole("link", { name: "Work" }));
    fireEvent.focus(screen.getByRole("link", { name: "Work" }));
    expect(prefetch.mock.calls).toEqual([["/labs"], ["/journey"]]);
  });

  it("prefetches on keyboard focus and on touchstart", () => {
    render(
      <>
        <QuietLink href="/labs">Work</QuietLink>
        <QuietLink href="/career">Career</QuietLink>
      </>,
    );
    fireEvent.focus(screen.getByRole("link", { name: "Work" }));
    fireEvent.touchStart(screen.getByRole("link", { name: "Career" }));
    expect(prefetch.mock.calls).toEqual([["/labs"], ["/career"]]);
  });

  it("keeps the caller's handlers", () => {
    const onPointerEnter = vi.fn();
    const onFocus = vi.fn();
    const onTouchStart = vi.fn();
    render(
      <QuietLink href="/labs" onPointerEnter={onPointerEnter} onFocus={onFocus} onTouchStart={onTouchStart}>
        Work
      </QuietLink>,
    );
    const link = screen.getByRole("link", { name: "Work" });
    fireEvent.pointerEnter(link);
    fireEvent.focus(link);
    fireEvent.touchStart(link);
    expect([onPointerEnter, onFocus, onTouchStart].map((f) => f.mock.calls.length)).toEqual([1, 1, 1]);
  });

  it("does not prefetch while the boot cover or the tower hides the page", () => {
    for (const attr of ["data-hq-boot", "data-hq"]) {
      document.documentElement.setAttribute(attr, "");
      render(<QuietLink href="/labs">Work</QuietLink>);
      expect(lastProps().prefetch).toBe(false);
      const link = screen.getByRole("link", { name: "Work" });
      fireEvent.pointerEnter(link);
      fireEvent.focus(link);
      fireEvent.touchStart(link);
      cleanup();
      document.documentElement.removeAttribute(attr);
    }
    expect(prefetch).not.toHaveBeenCalled();
  });

  it("keeps an explicit prefetch prop and adds no intent prefetch", () => {
    render(
      <QuietLink href="/labs" prefetch>
        Work
      </QuietLink>,
    );
    expect(lastProps().prefetch).toBe(true);
    fireEvent.pointerEnter(screen.getByRole("link", { name: "Work" }));
    expect(prefetch).not.toHaveBeenCalled();
  });

  it("skips intent prefetch for object hrefs", () => {
    render(<QuietLink href={{ pathname: "/labs", query: { tag: "ml" } }}>Work</QuietLink>);
    fireEvent.pointerEnter(screen.getByRole("link", { name: "Work" }));
    expect(prefetch).not.toHaveBeenCalled();
  });
});

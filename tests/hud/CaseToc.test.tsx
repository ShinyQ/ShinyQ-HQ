// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CaseToc } from "@/components/page/CaseToc";

const items = [
  { id: "problem", label: "Problem" },
  { id: "approach", label: "What I did" },
];

function Page() {
  return (
    <>
      <CaseToc items={items} label="On this page" countLabel="2 chapters" />
      <section id="problem" />
      <section id="approach" />
    </>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CaseToc", () => {
  it("marks the section in view", () => {
    let notify: IntersectionObserverCallback = () => {};
    const observe = vi.fn();
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: IntersectionObserverCallback) {
          notify = callback;
        }
        observe = observe;
        disconnect() {}
      },
    );
    render(<Page />);
    expect(observe).toHaveBeenCalledTimes(2);
    act(() => notify([{ target: document.getElementById("approach")!, isIntersecting: true } as unknown as IntersectionObserverEntry], {} as IntersectionObserver));
    const nav = screen.getByRole("navigation", { name: "On this page" });
    const current = nav.querySelectorAll('a[href="#approach"]');
    const other = nav.querySelectorAll('a[href="#problem"]');
    expect(current).toHaveLength(2);
    expect(other).toHaveLength(2);
    for (const link of current) expect(link).toHaveAttribute("aria-current", "true");
    for (const link of other) expect(link).not.toHaveAttribute("aria-current");
    expect(nav.querySelector('.pv-toc-wide a[href="#approach"]')).toHaveAccessibleName("What I did");
  });

  it("renders plain links without IntersectionObserver", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<Page />);
    const nav = screen.getByRole("navigation", { name: "On this page" });
    const links = nav.querySelectorAll<HTMLAnchorElement>("a");
    expect([...links].map((link) => link.getAttribute("href"))).toEqual([
      "#problem", "#approach", "#problem", "#approach",
    ]);
    expect(nav.querySelector('.pv-toc-wide a[href="#problem"]')).toHaveAccessibleName("Problem");
    for (const link of links) expect(link).not.toHaveAttribute("aria-current");
  });
});

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
      <CaseToc items={items} label="On this page" />
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
    expect(screen.getByRole("link", { name: "What I did" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("link", { name: "Problem" })).not.toHaveAttribute("aria-current");
  });

  it("renders plain links without IntersectionObserver", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<Page />);
    expect(screen.getByRole("navigation", { name: "On this page" })).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Problem" })).toHaveAttribute("href", "#problem");
  });
});

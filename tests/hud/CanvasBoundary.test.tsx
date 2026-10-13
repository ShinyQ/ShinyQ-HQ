// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CanvasBoundary } from "@/experience/CanvasBoundary";

afterEach(cleanup);

function Broken(): never {
  throw new Error("Error creating WebGL context.");
}

describe("CanvasBoundary", () => {
  it("renders the canvas while it works", () => {
    render(
      <CanvasBoundary onError={vi.fn()}>
        <p>world</p>
      </CanvasBoundary>,
    );
    expect(screen.getByText("world")).toBeTruthy();
  });

  it("hands a crash to the gate once and renders nothing", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const onError = vi.fn();
    const { container } = render(
      <CanvasBoundary onError={onError}>
        <Broken />
      </CanvasBoundary>,
    );
    expect(onError).toHaveBeenCalledTimes(1);
    expect(container.innerHTML).toBe("");
    quiet.mockRestore();
  });
});

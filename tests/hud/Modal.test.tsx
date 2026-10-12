// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Modal } from "@/components/Modal";

afterEach(cleanup);

describe("Modal", () => {
  it("is a full-screen sheet on phones by default", () => {
    render(
      <Modal labelledBy="t" onClose={() => {}} testId="m">
        <h2 id="t">Title</h2>
      </Modal>,
    );
    const panel = screen.getByRole("dialog", { name: "Title" });
    expect(panel).not.toHaveAttribute("data-sheet");
    expect(panel).toHaveClass("h-full");
    expect(screen.getByTestId("m-root")).toHaveClass("items-stretch");
  });

  it("becomes a bottom sheet sized to its content with `sheet`", () => {
    render(
      <Modal labelledBy="t" onClose={() => {}} testId="m" sheet>
        <h2 id="t">Title</h2>
      </Modal>,
    );
    const panel = screen.getByRole("dialog", { name: "Title" });
    expect(panel).toHaveAttribute("data-sheet", "bottom");
    expect(panel).not.toHaveClass("h-full");
    expect(panel).toHaveClass("max-h-[85dvh]");
    expect(screen.getByTestId("m-root")).toHaveClass("items-end");
  });
});

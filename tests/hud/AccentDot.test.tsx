// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AccentDot } from "@/components/AccentDot";

afterEach(() => cleanup());

describe("AccentDot", () => {
  it("is a decorative 6 px dot in the accent's text color", () => {
    const { container } = render(<AccentDot tone="violet" />);
    const dot = container.firstElementChild!;
    expect(dot.tagName).toBe("SPAN");
    expect(dot).toHaveAttribute("aria-hidden", "true");
    expect(dot).toHaveAttribute("data-accent-dot", "violet");
    expect(dot.className).toBe("hq-dot text-violet");
  });

  it("supports the 8 px size, a glow, the neutral tones and extra classes", () => {
    const { container, rerender } = render(<AccentDot tone="line" size="md" glow className="invisible" />);
    expect(container.firstElementChild!.className).toBe("hq-dot hq-dot-md hq-dot-glow text-line-2 invisible");
    rerender(<AccentDot tone="muted" />);
    expect(container.firstElementChild!.className).toBe("hq-dot text-ink-3");
  });
});

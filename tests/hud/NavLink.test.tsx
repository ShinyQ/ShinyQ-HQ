// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NavLink } from "@/components/NavLink";

const pathname = vi.hoisted(() => ({ value: "/labs/voice-ai-contact-center" }));

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => pathname.value,
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

describe("NavLink", () => {
  it("marks the current section, including child routes", () => {
    render(
      <>
        <NavLink href="/labs" accent="violet">
          Work
        </NavLink>
        <NavLink href="/journey" accent="amber">
          Journey
        </NavLink>
      </>,
    );
    expect(screen.getByRole("link", { name: "Work" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Journey" })).not.toHaveAttribute("aria-current");
  });

  it("treats blog posts as part of Writing", () => {
    pathname.value = "/blog/some-post";
    render(
      <NavLink href="/library" accent="white" variant="tab">
        Writing
      </NavLink>,
    );
    expect(screen.getByRole("link", { name: "Writing" })).toHaveAttribute("aria-current", "page");
  });
});

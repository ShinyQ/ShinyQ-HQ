// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import id from "../../messages/id.json";
import { LiveSiteLink } from "@/components/LiveSiteLink";

afterEach(cleanup);

describe("LiveSiteLink (R4-J)", () => {
  it("opens the site in a new tab without an opener, with an icon and a screen reader hint", () => {
    render(<LiveSiteLink href="https://mii-microsoft.azurewebsites.net" label={en.common.visitLive} srHint={en.common.external} />);
    const link = screen.getByRole("link", { name: "Visit live site (opens in a new tab)" });
    expect(link).toHaveAttribute("href", "https://mii-microsoft.azurewebsites.net");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAttribute("data-live-link", "");
    expect(link.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("is labelled in Indonesian too", () => {
    render(<LiveSiteLink href="https://mii-microsoft-ai.azurewebsites.net" label={id.common.visitLive} srHint={id.common.external} />);
    expect(screen.getByRole("link", { name: "Kunjungi situs aktif (terbuka di tab baru)" })).toBeInTheDocument();
  });
});

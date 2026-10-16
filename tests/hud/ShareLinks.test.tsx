// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import { ShareLinks } from "@/components/ShareLinks";
import { SITE_URL } from "@/lib/site";

const labels = {
  group: en.common.share,
  classic: en.common.copyClassicLink,
  threeD: en.common.copy3dLink,
  copied: en.common.linkCopied,
};

const writeText = vi.fn(async () => undefined);

beforeEach(() => {
  writeText.mockClear();
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  history.replaceState(null, "", "/en/labs/clearbox?view=classic");
});
afterEach(cleanup);

describe("ShareLinks", () => {
  it("renders a labelled group with two buttons named by their visible label", () => {
    render(<ShareLinks variant="page" labels={labels} />);
    const group = screen.getByRole("group", { name: "Share" });
    expect(group).toContainElement(screen.getByRole("button", { name: "Copy Classic link" }));
    expect(group).toContainElement(screen.getByRole("button", { name: "Copy 3D link" }));
  });

  it("copies the Classic link and confirms in place", async () => {
    render(<ShareLinks variant="page" labels={labels} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy Classic link" }));
    expect(writeText).toHaveBeenCalledWith(`${SITE_URL}/en/labs/clearbox?view=classic`);
    expect(await screen.findByText("Link copied")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy 3D link" })).toBeInTheDocument();
  });

  it("copies the 3D link without the view parameter", async () => {
    render(<ShareLinks variant="page" labels={labels} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy 3D link" }));
    expect(writeText).toHaveBeenCalledWith(`${SITE_URL}/en/labs/clearbox`);
    expect(await screen.findByText("Link copied")).toBeInTheDocument();
  });

  it("renders list items for the drawer menu variant", () => {
    render(
      <ul>
        <ShareLinks variant="menu" itemClassName="item" labels={labels} />
      </ul>,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Copy Classic link" })).toHaveClass("item");
  });
});

// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OptOutToggle } from "@/components/stats/OptOutToggle";
import { STATS_OPTOUT_EVENT, STATS_OPTOUT_KEY } from "@/components/stats/optOutStore";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("OptOutToggle", () => {
  it("writes the opt-out key and fires the event; turning it off removes the key", async () => {
    const heard = vi.fn();
    window.addEventListener(STATS_OPTOUT_EVENT, heard);
    render(<OptOutToggle label="Don't count my visits" />);
    const sw = screen.getByRole("switch", { name: "Don't count my visits" });
    expect(sw).not.toBeChecked();
    await userEvent.click(sw);
    expect(localStorage.getItem(STATS_OPTOUT_KEY)).toBe("1");
    expect(sw).toBeChecked();
    expect(heard).toHaveBeenCalledTimes(1);
    await userEvent.click(sw);
    expect(localStorage.getItem(STATS_OPTOUT_KEY)).toBeNull();
    expect(sw).not.toBeChecked();
    window.removeEventListener(STATS_OPTOUT_EVENT, heard);
  });

  it("keeps two toggles on one page in sync and reads a stored choice", async () => {
    localStorage.setItem(STATS_OPTOUT_KEY, "1");
    render(
      <>
        <OptOutToggle label="Footer" />
        <OptOutToggle label="Drawer" />
      </>,
    );
    expect(screen.getByRole("switch", { name: "Footer" })).toBeChecked();
    await userEvent.click(screen.getByRole("switch", { name: "Drawer" }));
    expect(screen.getByRole("switch", { name: "Footer" })).not.toBeChecked();
  });
});

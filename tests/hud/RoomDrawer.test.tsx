// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import type { DrawerTab, RoomId } from "@/content/schema";
import { buildRoomViews } from "@/content/room-views";
import type { RoomView } from "@/content/room-views/types";
import { getPods } from "@/content/load";
import { RoomDrawer, type RoomDrawerProps } from "@/hud/drawer/RoomDrawer";

// next-intl's Link needs the Next router; a plain anchor with the locale prefix is enough here.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) => (
    <a href={`/en${href === "/" ? "" : href}`} {...rest}>
      {children}
    </a>
  ),
}));

const views = buildRoomViews("en");
const hero = views[`L3:${getPods("ai").find((p) => p.tier === "hero")!.slug}`];
const listed = views[`L3:${getPods().find((p) => p.tier === "listed")!.slug}`];
const skills = views["L1:skills"];

afterEach(cleanup);

function Harness({ view, ...over }: { view: RoomView } & Partial<RoomDrawerProps>) {
  const [tab, setTab] = useState<DrawerTab>("overview");
  const [readme, setReadme] = useState(false);
  return (
    <NextIntlClientProvider locale="en" messages={en}>
      <button type="button">outside</button>
      <RoomDrawer
        view={view}
        locale="en"
        layout="side"
        tab={tab}
        readme={readme}
        onTab={setTab}
        onToggleReadme={() => setReadme((r) => !r)}
        onClose={vi.fn()}
        onNavigate={vi.fn()}
        onHologram={vi.fn()}
        onLink={vi.fn()}
        {...over}
      />
    </NextIntlClientProvider>
  );
}

describe("RoomDrawer", () => {
  it("is a labelled modal dialog that takes focus and traps Tab", async () => {
    const user = userEvent.setup();
    render(<Harness view={hero} />);
    const dialog = screen.getByRole("dialog", { name: hero.title });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveFocus();
    for (let i = 0; i < 30; i++) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    await user.tab({ shift: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness view={hero} onClose={onClose} />);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows the four pod tabs and switches with clicks and arrow keys", async () => {
    const user = userEvent.setup();
    render(<Harness view={hero} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(Object.values(en.drawer.tabs));
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    await user.click(tabs[2]);
    expect(screen.getByRole("tab", { name: "Results" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByTestId("metric")).toHaveLength(hero.metrics.length);
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: en.drawer.tabs.stack })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: en.drawer.tabs.stack })).toHaveFocus();
    expect(screen.getByText(hero.stack[0].name)).toBeInTheDocument();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
  });

  it("shows up to 3 metric tiles with their context on the overview", () => {
    render(<Harness view={hero} />);
    const tiles = screen.getAllByTestId("metric");
    expect(tiles.length).toBe(Math.min(3, hero.metrics.length));
    expect(within(tiles[0]).getByText(hero.metrics[0].context!)).toBeInTheDocument();
  });

  it("offers View architecture on hero pods only", async () => {
    const user = userEvent.setup();
    const onHologram = vi.fn();
    const { unmount } = render(<Harness view={hero} onHologram={onHologram} />);
    await user.click(screen.getByRole("button", { name: /View architecture/ }));
    expect(onHologram).toHaveBeenCalled();
    expect(screen.getByRole("link", { name: en.common.caseStudy })).toHaveAttribute("href", `/en${hero.page}`);
    unmount();
    render(<Harness view={listed} />);
    expect(screen.queryByRole("button", { name: /View architecture/ })).toBeNull();
  });

  it("uses the single-pane variant for non-pod rooms", () => {
    render(<Harness view={skills} />);
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.getByText(skills.sections[0].title!)).toBeInTheDocument();
  });

  it("navigates to the previous and next room", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<Harness view={hero} onNavigate={onNavigate} neighbours={{ next: "Next pod title" }} />);
    expect(screen.getByRole("button", { name: /Previous room/ })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /Next room: Next pod title/ }));
    expect(onNavigate).toHaveBeenCalledWith(hero.next as RoomId);
  });

  it("toggles the README terminal view with t and from the overflow menu", async () => {
    const user = userEvent.setup();
    render(<Harness view={hero} />);
    await user.keyboard("t");
    const readme = screen.getByTestId("readme");
    expect(readme.textContent).toContain("$ cat README.md");
    expect(readme.textContent).toContain("\u250C");
    expect(screen.queryByRole("tablist")).toBeNull();
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("button", { name: /README/ }));
    expect(screen.queryByTestId("readme")).toBeNull();
  });

  it("links to the related room on another floor", async () => {
    const user = userEvent.setup();
    const onLink = vi.fn();
    render(<Harness view={hero} onLink={onLink} />);
    await user.click(screen.getByRole("button", { name: hero.link!.label }));
    expect(onLink).toHaveBeenCalledWith(hero.link!.room);
  });

  it("renders as a bottom sheet with a resize handle", async () => {
    const user = userEvent.setup();
    render(<Harness view={hero} layout="sheet" />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("data-layout", "sheet");
    expect(dialog.style.height).toBe("55dvh");
    await user.click(screen.getByRole("button", { name: "Expand panel" }));
    expect(dialog.style.height).toBe("92dvh");
  });

  it("condenses the bar once the title scrolls away and keeps the tabs in the scrolling body", () => {
    render(<Harness view={hero} />);
    const dialog = screen.getByRole("dialog");
    const body = screen.getByTestId("drawer-body");
    expect(body).toContainElement(screen.getByRole("tablist"));
    expect(body).toContainElement(screen.getByRole("heading", { level: 2, name: hero.title }));
    expect(dialog).not.toHaveAttribute("data-condensed");
    body.scrollTop = 400;
    fireEvent.scroll(body);
    expect(dialog).toHaveAttribute("data-condensed", "true");
    expect(screen.getByTestId("drawer-compact-title")).toHaveAttribute("aria-hidden", "true");
    body.scrollTop = 0;
    fireEvent.scroll(body);
    expect(dialog).not.toHaveAttribute("data-condensed");
  });

  it("expands a half-open sheet when the body scrolls", () => {
    render(<Harness view={hero} layout="sheet" />);
    const dialog = screen.getByRole("dialog");
    const body = screen.getByTestId("drawer-body");
    body.scrollTop = 80;
    fireEvent.scroll(body);
    expect(dialog.style.height).toBe("92dvh");
  });

  it("matches the Ask panel width while it is open over the side panel", () => {
    const { unmount } = render(<Harness view={hero} />);
    expect(screen.getByRole("dialog").className).toContain("var(--hq-drawer-w)");
    unmount();
    render(<Harness view={hero} narrow />);
    expect(screen.getByRole("dialog").className).toContain("w-[min(420px,");
  });

  it("keeps the footer to one primary action and offers the cross-floor link in the menu", async () => {
    const user = userEvent.setup();
    const onLink = vi.fn();
    render(<Harness view={hero} onLink={onLink} />);
    const footer = screen.getByRole("dialog").querySelector("footer")!;
    expect(within(footer).getAllByRole("link")).toHaveLength(1);
    expect(within(footer).queryByText(en.drawer.readmeHint)).toBeNull();
    await user.click(screen.getByRole("button", { name: "More actions" }));
    const items = screen.getAllByRole("button", { name: new RegExp(hero.link!.label) });
    expect(items).toHaveLength(2);
    await user.click(items[1]);
    expect(onLink).toHaveBeenCalledWith(hero.link!.room);
  });

  it("draws the career type badge as the neon line icon in its type color", () => {
    const { container } = render(<Harness view={views["L2:jenius-2024"]} />);
    const badge = container.querySelector<HTMLElement>('[data-badge-type="job"]')!;
    expect(badge).toHaveTextContent("Employment");
    expect(badge.style.color).toBe("rgb(56, 189, 248)");
    expect(badge.querySelector("svg[aria-hidden]")).not.toBeNull();
    cleanup();
    const pod = render(<Harness view={hero} />);
    expect(pod.container.querySelector("[data-badge-type]")).toBeNull();
  });
});

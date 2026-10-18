// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import idMessages from "../../messages/id.json";
import type { DrawerTab, RoomId } from "@/content/schema";
import { buildRoomViews } from "@/content/room-views";
import type { RoomView } from "@/content/room-views/types";
import { getPods } from "@/content/load";
import { ArchitectureGrid, RoomDrawer, type RoomDrawerProps } from "@/hud/drawer/RoomDrawer";
import { SITE_URL } from "@/lib/site";

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
const liveView = views["L3:solutions-marketing-site"];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Harness({ view, ...over }: { view: RoomView } & Partial<RoomDrawerProps>) {
  const [tab, setTab] = useState<DrawerTab>("overview");
  const [readme, setReadme] = useState(false);
  return (
    <NextIntlClientProvider locale={over.locale ?? "en"} messages={over.locale === "id" ? idMessages : en}>
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
  it.each([
    { locale: "en", messages: en, source: "Client", target: "Store", async: false, expected: "Client to Store" },
    { locale: "en", messages: en, source: "Client", target: "Store", async: true, expected: "Client sends asynchronously to Store" },
    { locale: "id", messages: idMessages, source: "Klien", target: "Penyimpanan", async: false, expected: "Klien ke Penyimpanan" },
    { locale: "id", messages: idMessages, source: "Klien", target: "Penyimpanan", async: true, expected: "Klien mengirim secara asinkron ke Penyimpanan" },
  ] as const)("narrates $locale architecture endpoints in order (async=$async)", ({ locale, messages, source, target, async, expected }) => {
    render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <ArchitectureGrid architecture={{
          nodes: [
            { id: "source", label: source, layer: 0, row: 0, kind: "client" },
            { id: "target", label: target, layer: 1, row: 0, kind: "data" },
          ],
          edges: [{ from: "source", to: "target", async }],
        }} />
      </NextIntlClientProvider>,
    );
    const flow = screen.getByRole("heading", { name: messages.drawer.flow }).parentElement!;
    const row = within(flow).getByRole("listitem");
    expect(row.querySelector("[aria-hidden='true']")).toHaveTextContent(async ? "⇢" : "→");
    const accessible = row.cloneNode(true) as HTMLElement;
    accessible.querySelectorAll("[aria-hidden='true']").forEach((node) => node.remove());
    expect(accessible.textContent!.replace(/\s+/g, " ").trim()).toBe(expected);
  });

  it("renders supplied native architecture strings in the ID drawer", () => {
    const view = structuredClone(hero);
    view.architecture!.nodes[0].label = "Browser pengunjung";
    view.architecture!.nodes[1].label = "Layanan aplikasi";
    view.architecture!.edges[0] = { from: view.architecture!.nodes[0].id, to: view.architecture!.nodes[1].id, label: "permintaan", async: true };
    render(<Harness view={view} locale="id" tab="architecture" />);
    expect(screen.getAllByText("Browser pengunjung").length).toBeGreaterThan(0);
    expect(screen.getByText(/permintaan/)).toBeInTheDocument();
    expect(screen.queryByText("[object Object]")).toBeNull();
  });

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

  it("marks the room's accent with a dot in the bar, never an edge stripe (R5 P10)", () => {
    render(<Harness view={hero} />);
    const dot = screen.getByTestId("drawer-bar").querySelector("[data-accent-dot]");
    expect(dot).toHaveAttribute("data-accent-dot", hero.accent);
    expect(dot).toHaveClass("hq-dot", "hq-dot-md");
    expect(dot).toHaveAttribute("aria-hidden", "true");
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

  it("opens a case study with the metric strip of its headline results", () => {
    render(<Harness view={hero} />);
    const strip = screen.getByRole("list", { name: en.drawer.keyResults });
    const marked = hero.metrics.filter((m) => m.headline);
    expect(marked.length).toBeGreaterThan(0);
    expect(within(strip).getAllByTestId("metric-strip-item")).toHaveLength(marked.length);
    expect(strip).toHaveTextContent(marked[0].value);
    expect(strip).toHaveTextContent(marked[0].label);
    // Value and label only: how a number was measured stays on the Results tab.
    expect(screen.queryAllByTestId("metric")).toHaveLength(0);
  });

  it("offers View architecture on hero pods only", async () => {
    const user = userEvent.setup();
    const onHologram = vi.fn();
    const { unmount } = render(<Harness view={hero} onHologram={onHologram} />);
    await user.click(screen.getByRole("button", { name: /View architecture/ }));
    expect(onHologram).toHaveBeenCalled();
    // Drawer page links open the Classic site and say so; ViewParamSync leaves them alone in 3D.
    expect(screen.getByRole("link", { name: en.common.caseStudy })).toHaveAttribute("href", `/en${hero.page}?view=classic`);
    expect(screen.getByRole("link", { name: en.common.caseStudy })).toHaveAttribute("data-hq-view", "page");
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
    const readme = await screen.findByTestId("readme");
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

  it("puts the cross-floor link in the footer right after the one primary link, and keeps it in the menu", async () => {
    const user = userEvent.setup();
    const onLink = vi.fn();
    render(<Harness view={hero} onLink={onLink} />);
    const footer = screen.getByTestId("drawer-footer");
    expect(within(footer).getAllByRole("link")).toHaveLength(1);
    expect(within(footer).queryByText(en.drawer.readmeHint)).toBeNull();
    expect(footer.children[0]).toHaveTextContent(en.common.caseStudy);
    expect(footer.children[1]).toBe(within(footer).getByRole("button", { name: hero.link!.label }));
    expect(within(screen.getByTestId("drawer-body")).queryByRole("button", { name: hero.link!.label })).toBeNull();
    await user.click(screen.getByRole("button", { name: "More actions" }));
    const items = screen.getAllByRole("button", { name: new RegExp(hero.link!.label) });
    expect(items).toHaveLength(2);
    await user.click(items[1]);
    expect(onLink).toHaveBeenCalledWith(hero.link!.room);
  });

  it("offers Copy Classic link and Copy 3D link in the overflow menu", async () => {
    const user = userEvent.setup();
    render(<Harness view={hero} />);
    await user.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getByRole("button", { name: en.common.copyClassicLink })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: en.common.copy3dLink })).toBeInTheDocument();
  });

  it.each([["en", en], ["id", idMessages]] as const)("keeps failed %s menu copying inside its action and drawer focus trap", async (locale, messages) => {
    const user = userEvent.setup();
    const write = vi.spyOn(navigator.clipboard, "writeText").mockRejectedValueOnce(new Error("Clipboard blocked"));
    history.replaceState(null, "", `/${locale}${hero.page}?view=classic#architecture`);
    render(<Harness view={hero} locale={locale} />);
    await user.click(screen.getByRole("button", { name: messages.drawer.more }));
    const action = screen.getByRole("button", { name: messages.common.copyClassicLink });
    await user.click(action);
    const recovery = await screen.findByRole("textbox", { name: messages.common.linkCopyFailed });
    expect(recovery).toHaveValue(`${SITE_URL}/${locale}${hero.page}?view=classic#architecture`);
    expect(write).toHaveBeenCalledWith(recovery.getAttribute("value"));
    expect(action.closest("li")).toContainElement(recovery);
    expect(action).toHaveFocus();
    const dialog = screen.getByRole("dialog", { name: hero.title });
    await user.tab();
    expect(recovery).toHaveFocus();
    for (let i = 0; i < 30; i++) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    expect(recovery).toBeInTheDocument();
  });

  it("puts Visit live site right after Read case study and before the cross-floor link, in a new tab (R4-J)", () => {
    render(<Harness view={liveView} />);
    const footer = screen.getByTestId("drawer-footer");
    const visit = within(footer).getByRole("link", { name: `${en.common.visitLive} (${en.common.external})` });
    expect(footer.children[0]).toHaveTextContent(en.common.caseStudy);
    expect(footer.children[1]).toBe(visit);
    expect(visit).toHaveAttribute("href", liveView.live!);
    expect(visit).toHaveAttribute("target", "_blank");
    expect(visit).toHaveAttribute("rel", "noopener noreferrer");
    expect(footer.children[2]).toBe(within(footer).getByRole("button", { name: liveView.link!.label }));
  });

  it("shows no live link for rooms without a public site", () => {
    render(<Harness view={hero} />);
    expect(screen.queryByTestId("drawer-live-link")).toBeNull();
  });

  it("uses the same footer order for every room type, custom bodies included", () => {
    const byKind = new Map<string, RoomView>();
    for (const view of Object.values(views)) {
      const seen = byKind.get(view.kind);
      if (!seen || (view.link && !seen.link)) byKind.set(view.kind, view);
    }
    expect([...byKind.keys()]).toEqual(expect.arrayContaining(["lobby", "highlights", "career", "pod", "post", "research", "roof"]));
    expect([...byKind.values()].filter((v) => v.link).map((v) => v.kind).sort()).toEqual(["career", "highlights", "lobby", "pod"]);
    for (const view of byKind.values()) {
      const { unmount } = render(<Harness view={view} />);
      const footer = screen.queryByTestId("drawer-footer");
      const primaries = (view.page ? 1 : 0) + (view.external ? 1 : 0) + (view.live ? 1 : 0);
      if (primaries) expect(footer, view.id).not.toBeNull();
      if (view.link) {
        expect(within(screen.getByTestId("drawer-body")).queryByRole("button", { name: view.link.label }), view.id).toBeNull();
        expect(footer!.children[primaries], view.id).toBe(within(footer!).getByRole("button", { name: view.link.label }));
      }
      unmount();
    }
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

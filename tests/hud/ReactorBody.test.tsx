// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import id from "../../messages/id.json";
import type { Locale } from "@/content/schema";
import { getTechIndex } from "@/content/load";
import { buildRoomViews } from "@/content/room-views";
import { RoomDrawer } from "@/hud/drawer/RoomDrawer";
import { getHQStore } from "@/store/useHQStore";

const goTo = vi.hoisted(() => vi.fn());
vi.mock("@/experience/missions/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/experience/missions/bridge")>()),
  goToRoom: goTo,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, ...rest }: { href: string } & Record<string, unknown>) => <a href={`/en${href}`} {...rest} />,
}));

beforeEach(() => {
  const s = getHQStore().getState();
  s.clearReactorTech();
  s.setReactorRing("ai");
});
afterEach(() => {
  cleanup();
  goTo.mockReset();
});

function open(locale: Locale = "en") {
  const view = buildRoomViews(locale)["L3:reactor"];
  render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : id}>
      <RoomDrawer
        view={view}
        locale={locale}
        layout="side"
        tab="overview"
        readme={false}
        onTab={vi.fn()}
        onToggleReadme={vi.fn()}
        onClose={vi.fn()}
        onNavigate={vi.fn()}
        onHologram={vi.fn()}
        onLink={vi.fn()}
      />
    </NextIntlClientProvider>,
  );
  return screen.getByRole("dialog", { name: view.title });
}

const index = getTechIndex();
const azure = index.rings.find((r) => r.id === "azure")!;

describe("Tech Reactor drawer", () => {
  it("shows six ring chips and the current ring's techs with project counts, by count", () => {
    const drawer = open();
    const rings = within(within(drawer).getByRole("group", { name: "Tech groups" })).getAllByRole("button");
    expect(rings.map((b) => b.textContent)).toEqual(index.rings.map((r) => `${en.labs.reactor.rings[r.id]}${r.techs.length}`));
    expect(rings[0]).toHaveAttribute("aria-pressed", "true");
    const list = within(drawer).getByTestId("reactor-techs");
    const ai = index.rings[0];
    expect(within(list).getAllByRole("button")).toHaveLength(ai.techs.length);
    expect(within(list).getAllByRole("button")[0]).toHaveTextContent(`${ai.techs[0].name}${ai.techs[0].pods.length} projects`);
  });

  it("switches rings and picks a tech, which lists its projects", async () => {
    const drawer = open();
    await userEvent.click(within(within(drawer).getByRole("group", { name: "Tech groups" })).getByRole("button", { name: /^Azure/ }));
    expect(getHQStore().getState().reactor.ring).toBe("azure");
    const top = azure.techs[0];
    await userEvent.click(within(within(drawer).getByTestId("reactor-techs")).getAllByRole("button")[0]);
    expect(getHQStore().getState().reactor.tech).toEqual({ slug: top.slug, name: top.name, count: top.pods.length, pods: top.pods });
    expect(within(drawer).getByTestId("reactor-uses")).toHaveTextContent(`${top.pods.length} projects use ${top.name}`);
    const projects = within(drawer).getAllByTestId("reactor-project");
    expect(projects.map((b) => b.dataset.pod)).toEqual(top.pods);
    await userEvent.click(projects[0]);
    expect(goTo).toHaveBeenCalledWith(`L3:${top.pods[0]}`);
  });

  it("clears with Clear or a second pick, and Surprise me bumps the spin", async () => {
    const drawer = open();
    const first = within(within(drawer).getByTestId("reactor-techs")).getAllByRole("button")[0];
    await userEvent.click(first);
    expect(first).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(first);
    expect(getHQStore().getState().reactor.tech).toBeNull();
    await userEvent.click(first);
    await userEvent.click(within(drawer).getByTestId("reactor-clear"));
    expect(getHQStore().getState().reactor.tech).toBeNull();
    expect(within(drawer).queryByTestId("reactor-clear")).toBeNull();
    const spin = getHQStore().getState().reactor.spin;
    await userEvent.click(within(drawer).getByTestId("reactor-surprise"));
    expect(getHQStore().getState().reactor.spin).toBe(spin + 1);
  });

  it("speaks Indonesian", async () => {
    const drawer = open("id");
    expect(within(drawer).getByRole("group", { name: "Kelompok teknologi" })).toBeInTheDocument();
    expect(within(drawer).getByRole("button", { name: id.labs.reactor.surprise })).toBeInTheDocument();
    await userEvent.click(within(within(drawer).getByTestId("reactor-techs")).getAllByRole("button")[0]);
    expect(within(drawer).getByTestId("reactor-uses")).toHaveTextContent("proyek memakai");
  });
});

// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import id from "../../messages/id.json";
import type { Locale, RoomId } from "@/content/schema";
import { highlightEntries } from "@/content/highlights";
import { getContact, getPods, getStats, getTimeline } from "@/content/load";
import { pickFeaturedPods } from "@/content/pageview";
import { buildRoomViews } from "@/content/room-views";
import type { RoomView } from "@/content/room-views/types";
import { podLiveLink } from "@/content/selectors";
import { RoomDrawer } from "@/hud/drawer/RoomDrawer";

const goTo = vi.hoisted(() => vi.fn());
vi.mock("@/experience/missions/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/experience/missions/bridge")>()),
  goToRoom: goTo,
}));
// next-intl's Link needs the Next router; a locale-prefixing anchor is enough here.
vi.mock("@/i18n/navigation", async () => {
  const { useLocale } = await import("next-intl");
  return {
    Link: ({ href, ...rest }: { href: string } & Record<string, unknown>) => {
      const locale = useLocale();
      return <a href={`/${locale}${href}`} {...rest} />;
    },
  };
});

afterEach(() => {
  cleanup();
  goTo.mockReset();
});

function open(room: RoomId, locale: Locale = "en", edit: (view: RoomView) => RoomView = (v) => v) {
  const view = edit(buildRoomViews(locale)[room]);
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

describe("Highlights Hall rooms in the drawer", () => {
  it("about: four big numbers, the one-line intro and the full profile link", () => {
    const drawer = open("L1:highlights-about");
    expect(within(drawer).getAllByTestId("metric")).toHaveLength(4);
    expect(drawer).toHaveTextContent(getStats()[0].value);
    expect(within(drawer).getByRole("button", { name: en.hall.fullProfile })).toBeInTheDocument();
  });

  it("projects: the landing's three projects with screenshots; a card rides to its pod", async () => {
    const drawer = open("L1:highlights-projects");
    const featured = pickFeaturedPods(getPods());
    const cards = within(drawer).getAllByTestId("highlight-card");
    expect(cards.map((c) => c.getAttribute("data-room"))).toEqual(featured.map((p) => `L3:${p.slug}`));
    for (const card of cards) expect(card.querySelector("img")).toHaveAttribute("loading", "lazy");
    await userEvent.click(cards[0]);
    expect(goTo).toHaveBeenCalledWith(`L3:${featured[0].slug}`);
  });

  it("experience: Employment and Freelance groups (the career type labels), newest first; a card rides to its career room", async () => {
    const drawer = open("L1:highlights-experience");
    const { employment, freelance } = highlightEntries(getTimeline());
    expect(within(drawer).getByRole("heading", { name: en.common.type.job })).toBeInTheDocument();
    expect(within(drawer).getByRole("heading", { name: en.common.type.freelance })).toBeInTheDocument();
    expect(within(drawer).queryByRole("heading", { name: /full-time/i })).toBeNull();
    const cards = within(drawer).getAllByTestId("highlight-card");
    expect(cards).toHaveLength(employment.length + freelance.length);
    await userEvent.click(cards[0]);
    expect(goTo).toHaveBeenCalledWith(`L2:${employment[0].slug}`);
  });

  it("projects: Visit live site (new tab) under exactly the cards with a live link", () => {
    const featured = pickFeaturedPods(getPods());
    const real = open("L1:highlights-projects");
    expect(within(real).queryAllByTestId("highlight-live")).toHaveLength(featured.filter((p) => podLiveLink(p)).length);
    cleanup();
    const drawer = open("L1:highlights-projects", "en", (view) => ({
      ...view,
      cards: view.cards!.map((card, i) => ({ ...card, live: i === 0 ? "https://mii-microsoft.azurewebsites.net" : undefined })),
    }));
    const links = within(drawer).getAllByTestId("highlight-live");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName(new RegExp(en.common.visitLive));
    expect(links[0]).toHaveAttribute("href", "https://mii-microsoft.azurewebsites.net");
    expect(links[0]).toHaveAttribute("target", "_blank");
    expect(links[0]).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("contact: email with copy, the channels and the CV viewer", () => {
    const drawer = open("L1:highlights-contact");
    expect(drawer).toHaveTextContent(getContact().email);
    expect(within(drawer).getByTestId("copy-email")).toBeInTheDocument();
    expect(within(drawer).getByTestId("cv-view")).toBeInTheDocument();
    expect(within(drawer).getByRole("link", { name: /LinkedIn/ })).toHaveAttribute("target", "_blank");
  });

  it("speaks Indonesian", () => {
    const drawer = open("L1:highlights-experience", "id");
    expect(within(drawer).getByRole("heading", { name: id.common.type.job })).toBeInTheDocument();
    expect(drawer).toHaveTextContent(id.hall.openRole);
  });
});

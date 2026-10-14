// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import id from "../../messages/id.json";
import type { Locale } from "@/content/schema";
import { getTopicIndex } from "@/content/load";
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
  s.clearTopic();
});
afterEach(() => {
  cleanup();
  goTo.mockReset();
});

function open(locale: Locale = "en") {
  const view = buildRoomViews(locale)["L4:topics"];
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

const index = getTopicIndex();

describe("Topic Constellation drawer", () => {
  it("lists every topic with its piece count", () => {
    const drawer = open();
    const list = within(drawer).getByTestId("topics-list");
    const buttons = within(list).getAllByRole("button");
    expect(buttons.map((b) => b.dataset.topic)).toEqual(index.topics.map((t) => t.slug));
    const cases = index.topics.find((t) => t.slug === "case-study")!;
    expect(within(list).getByRole("button", { name: /^Case studies/ })).toHaveTextContent(`Case studies${cases.items.length} pieces`);
    expect(within(drawer).queryByTestId("topics-selection")).toBeNull();
  });

  it("picks a topic, lists its pieces with their desks, and rides to one", async () => {
    const drawer = open();
    await userEvent.click(within(within(drawer).getByTestId("topics-list")).getByRole("button", { name: /^Sentiment analysis/ }));
    const topic = index.topics.find((t) => t.slug === "sentiment-analysis")!;
    expect(getHQStore().getState().topics.topic).toEqual({ slug: "sentiment-analysis", name: "Sentiment analysis", count: topic.items.length, rooms: ["L4:research", "L4:publications"] });
    expect(within(drawer).getByTestId("topics-pieces")).toHaveTextContent(`${topic.items.length} pieces on Sentiment analysis`);
    const pieces = within(drawer).getAllByTestId("topic-piece");
    expect(pieces.map((p) => p.dataset.room)).toEqual(topic.items.map((i) => i.room));
    expect(pieces[0]).toHaveTextContent("Research");
    await userEvent.click(pieces.at(-1)!);
    expect(goTo).toHaveBeenCalledWith("L4:publications");
  });

  it("clears with Clear or a second pick", async () => {
    const drawer = open();
    const voice = within(within(drawer).getByTestId("topics-list")).getByRole("button", { name: /^Voice AI/ });
    await userEvent.click(voice);
    expect(voice).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(voice);
    expect(getHQStore().getState().topics.topic).toBeNull();
    await userEvent.click(voice);
    await userEvent.click(within(drawer).getByTestId("topics-clear"));
    expect(getHQStore().getState().topics.topic).toBeNull();
    expect(within(drawer).queryByTestId("topics-clear")).toBeNull();
  });

  it("speaks Indonesian", async () => {
    const drawer = open("id");
    await userEvent.click(within(within(drawer).getByTestId("topics-list")).getByRole("button", { name: /^Mengajar dan mentoring/ }));
    expect(within(drawer).getByTestId("topics-pieces")).toHaveTextContent(/karya tentang Mengajar dan mentoring$/);
    expect(within(drawer).getAllByTestId("topic-piece")[0]).toHaveTextContent(id.library.posts);
    expect(en.library.topics.clear).not.toBe(id.library.topics.clear);
  });
});

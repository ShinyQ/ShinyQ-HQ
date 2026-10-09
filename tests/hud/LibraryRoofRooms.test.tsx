// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import id from "../../messages/id.json";
import type { Locale, RoomId } from "@/content/schema";
import { buildRoomViews } from "@/content/room-views";
import { getPosts, getRoof } from "@/content/load";
import { RoomDrawer } from "@/hud/drawer/RoomDrawer";
import { audio } from "@/lib/audio";

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
  vi.restoreAllMocks();
});

function open(room: RoomId, locale: Locale = "en") {
  const view = buildRoomViews(locale)[room];
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

const roof = getRoof();

describe("Library rooms in the drawer", () => {
  it("a hosted post shows its language badge, a note when untranslated, and Read post", () => {
    const drawer = open("L4:the-sun-the-moon-and-the-dark-sea");
    expect(drawer).toHaveTextContent("ID");
    expect(within(drawer).getByText(en.drawer.rooms.writtenIn.replace("{languages}", "ID"))).toBeInTheDocument();
    expect(within(drawer).getByRole("link", { name: "Read post" })).toHaveAttribute("href", "/en/blog/the-sun-the-moon-and-the-dark-sea");
  });

  it("a bilingual post has no translation note", () => {
    const post = getPosts().find((p) => p.languages.length === 2 && !p.url)!;
    const drawer = open(`L4:${post.slug}` as RoomId, "id");
    expect(drawer).toHaveTextContent("EN/ID");
    expect(within(drawer).queryByText(id.drawer.rooms.writtenIn.replace("{languages}", "EN/ID"))).toBeNull();
    expect(within(drawer).getByRole("link", { name: "Baca tulisan" })).toHaveAttribute("href", `/id/blog/${post.slug}`);
  });

  it("a Medium post opens externally in a new tab", () => {
    const post = getPosts().find((p) => p.url)!;
    const drawer = open(`L4:${post.slug}` as RoomId);
    const link = within(drawer).getByRole("link", { name: new RegExp(`^${en.drawer.external}`) });
    expect(link).toHaveAttribute("href", post.url);
    expect(link).toHaveAttribute("target", "_blank");
    expect(within(drawer).queryByRole("link", { name: en.drawer.rooms.readPost })).toBeNull();
  });
});

describe("Research shelf in the drawer", () => {
  it("lists papers with the owner highlighted among the authors, venue, DOI link, summary and profiles", () => {
    const drawer = open("L4:research");
    const items = within(drawer).getAllByTestId("research-item");
    expect(items.length).toBe(4);
    const ewallet = items.find((li) => li.textContent?.includes("Indonesian Digital Wallet"))!;
    expect(within(ewallet).getByText("Kurniadi Ahmad Wijaya").tagName).toBe("STRONG");
    expect(ewallet).toHaveTextContent("Ananda Affan Fattahila");
    expect(ewallet).toHaveTextContent("ICAIBDA");
    expect(within(ewallet).getByRole("link", { name: /DOI 10\.1109\/icaibda53487\.2021\.9689712/ })).toHaveAttribute(
      "href",
      "https://doi.org/10.1109/icaibda53487.2021.9689712",
    );
    expect(ewallet).toHaveTextContent(/10 citations on Google Scholar, as of Oct 2026/);
    expect(within(drawer).getByText(/13 citations · h-index 2 on Google Scholar, as of Oct 2026/)).toBeInTheDocument();
    expect(within(drawer).getByRole("link", { name: /Google Scholar/ })).toHaveAttribute("href", "https://scholar.google.com/citations?user=u8OY1foAAAAJ");
    expect(within(drawer).getByRole("link", { name: /IEEE Xplore/ })).toHaveAttribute("target", "_blank");
  });
});

describe("Roof rooms in the drawer", () => {
  it("comms terminals: mailto, copy with a click sound, and the channels in new tabs", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const play = vi.spyOn(audio, "play").mockImplementation(() => {});
    const drawer = open("RF:contact");
    expect(drawer).toHaveTextContent(roof.availability.en);
    expect(within(drawer).getByRole("link", { name: "Email me" })).toHaveAttribute("href", `mailto:${roof.contact.email}`);
    for (const label of ["LinkedIn", "GitHub", "Hugging Face", "Medium", "Google Scholar", "IEEE Xplore"]) {
      expect(within(drawer).getByRole("link", { name: new RegExp(`^${label}`) })).toHaveAttribute("target", "_blank");
    }
    await user.click(within(drawer).getByRole("button", { name: "Copy email" }));
    expect(writeText).toHaveBeenCalledWith(roof.contact.email);
    expect(play).toHaveBeenCalledWith("click");
    expect(await within(drawer).findByRole("status")).toHaveTextContent(en.drawer.rooms.copied);
  });

  it("shows the address when copying fails", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) }, configurable: true });
    vi.spyOn(audio, "play").mockImplementation(() => {});
    const drawer = open("RF:contact");
    await act(() => user.click(within(drawer).getByRole("button", { name: "Copy email" })));
    expect(await within(drawer).findByRole("status")).toHaveTextContent(roof.contact.email);
  });

  it("CV kiosk: downloads the visitor's language first, the other language, and links /cv", () => {
    const play = vi.spyOn(audio, "play").mockImplementation(() => {});
    const drawer = open("RF:cv", "id");
    const pdfs = within(drawer).getAllByRole("link").filter((a) => a.getAttribute("href")?.endsWith(".pdf"));
    expect(pdfs.map((a) => a.getAttribute("href"))).toEqual([`/cv/${roof.cv.fileName}-id.pdf`, `/cv/${roof.cv.fileName}-en.pdf`]);
    expect(pdfs[0]).toHaveAttribute("download", `${roof.cv.fileName}-id.pdf`);
    pdfs[0].addEventListener("click", (e) => e.preventDefault());
    pdfs[0].click();
    expect(play).toHaveBeenCalledWith("click");
    expect(within(drawer).getByRole("link", { name: "Buka halaman CV" })).toHaveAttribute("href", "/id/cv");
  });
});

// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import id from "../../messages/id.json";
import { DialogHost } from "@/components/DialogHost";
import { getLibrary } from "@/content/load";
import { previewCitations } from "@/content/citation";
import { buildPaperPreview } from "@/content/papers";
import type { Locale } from "@/content/schema";
import { researchPublications } from "@/content/selectors";
import { openCv, openPaper } from "@/hud/events";
import { audio } from "@/lib/audio";
import { CV_PAGES } from "@/lib/cv";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mount(locale: Locale = "en") {
  vi.spyOn(audio, "play").mockImplementation(() => {});
  render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : id}>
      <button type="button">opener</button>
      <DialogHost />
    </NextIntlClientProvider>,
  );
}

const ewallet = researchPublications(getLibrary().publications).find((p) => p.id === "ewallet-sentiment-cnn-lstm")!;

describe("CV viewer modal", () => {
  it("opens on openCv with every page image, zoom, download and new-tab links, and closes on Esc with focus back", async () => {
    const user = userEvent.setup();
    mount();
    const opener = screen.getByRole("button", { name: "opener" });
    opener.focus();
    act(() => openCv());
    const dialog = await screen.findByRole("dialog", { name: "CV" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByRole("button", { name: "Close CV" })).toHaveFocus();
    const images = within(dialog).getAllByRole("img");
    expect(images.map((img) => img.getAttribute("alt"))).toEqual(CV_PAGES.map((p) => `CV page ${p.n} of ${CV_PAGES.length}`));
    expect(images[0]).toHaveAttribute("src", CV_PAGES[0].src);
    expect(images[0].getAttribute("srcset")).toContain(`${CV_PAGES[0].srcSmall} 800w`);
    expect(dialog).toHaveTextContent(`${CV_PAGES.length} pages`);

    const download = within(dialog).getByRole("link", { name: "Download PDF" });
    expect(download).toHaveAttribute("href", "/cv/kurniadi-ahmad-wijaya-cv.pdf");
    expect(download).toHaveAttribute("download", "kurniadi-ahmad-wijaya-cv.pdf");
    const tab = within(dialog).getByRole("link", { name: /Open in new tab/ });
    expect(tab).toHaveAttribute("target", "_blank");
    expect(tab).toHaveAttribute("rel", "noopener noreferrer");

    expect(within(dialog).getByTestId("cv-zoom")).toHaveTextContent("100%");
    await user.click(within(dialog).getByRole("button", { name: "Zoom in" }));
    expect(within(dialog).getByTestId("cv-zoom")).toHaveTextContent("125%");
    await user.keyboard("+");
    expect(within(dialog).getByTestId("cv-zoom")).toHaveTextContent("150%");
    await user.keyboard("0");
    expect(within(dialog).getByTestId("cv-zoom")).toHaveTextContent("100%");
    expect(within(dialog).getByRole("button", { name: "Zoom out" })).toBeDisabled();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    await vi.waitFor(() => expect(opener).toHaveFocus());
  });

  it("traps Tab inside the dialog and closes on the backdrop", async () => {
    const user = userEvent.setup();
    mount("id");
    act(() => openCv());
    const dialog = await screen.findByRole("dialog", { name: "CV" });
    const close = within(dialog).getByRole("button", { name: "Tutup CV" });
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(close);
    await user.tab();
    expect(close).toHaveFocus();
    expect(dialog).toHaveTextContent("Unduh PDF");
    await user.click(dialog.parentElement!.firstElementChild as HTMLElement);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("paper preview modal", () => {
  it("shows the abstract, copies each citation format and links DOI and Google Scholar in new tabs", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    mount();
    const paper = buildPaperPreview(ewallet, "en");
    act(() => openPaper(paper));
    const dialog = await screen.findByRole("dialog", { name: ewallet.title });
    expect(within(dialog).getByRole("button", { name: "Close paper preview" })).toHaveFocus();
    expect(within(dialog).getByText("Kurniadi Ahmad Wijaya").tagName).toBe("STRONG");
    expect(within(dialog).getByTestId("paper-abstract")).toHaveTextContent(ewallet.abstract!);
    expect(within(dialog).getByTestId("paper-abstract")).toHaveAttribute("lang", "en");
    expect(dialog).toHaveTextContent("10 citations on Google Scholar");

    const citations = previewCitations(paper);
    expect(within(dialog).getByTestId("paper-citation")).toHaveTextContent(citations.apa);
    await user.click(within(dialog).getByRole("button", { name: "Copy citation" }));
    expect(writeText).toHaveBeenLastCalledWith(citations.apa);
    expect(await within(dialog).findByRole("status")).toHaveTextContent("Citation copied");

    await user.click(within(dialog).getByRole("button", { name: "BibTeX" }));
    expect(within(dialog).getByRole("button", { name: "BibTeX" })).toHaveAttribute("aria-pressed", "true");
    await user.click(within(dialog).getByRole("button", { name: "Copy citation" }));
    expect(writeText).toHaveBeenLastCalledWith(citations.bibtex);
    await user.click(within(dialog).getByRole("button", { name: "IEEE" }));
    expect(within(dialog).getByTestId("paper-citation")).toHaveTextContent(citations.ieee);

    const doi = within(dialog).getByRole("link", { name: /DOI 10\.1109\/icaibda53487\.2021\.9689712/ });
    expect(doi).toHaveAttribute("href", "https://doi.org/10.1109/icaibda53487.2021.9689712");
    const scholar = within(dialog).getByRole("link", { name: /Google Scholar/ });
    expect(scholar.getAttribute("href")).toMatch(/^https:\/\/scholar\.google\.com\/scholar\?q=%22Indonesian/);
    for (const link of within(dialog).getAllByRole("link")) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
    expect(dialog.querySelector("iframe")).toBeNull();

    await user.click(within(dialog).getByRole("button", { name: "Close paper preview" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("treats a GitHub URL without a code link as source code (the thesis)", async () => {
    mount("id");
    const thesis = researchPublications(getLibrary().publications).find((p) => p.kind === "thesis")!;
    act(() => openPaper(buildPaperPreview(thesis, "id")));
    const dialog = await screen.findByRole("dialog", { name: thesis.title });
    expect(within(dialog).getByRole("link", { name: /Kode sumber/ })).toHaveAttribute("href", thesis.url);
    expect(within(dialog).queryByRole("link", { name: /Halaman publikasi/ })).toBeNull();
    expect(dialog).toHaveTextContent("Abstrak");
  });
});

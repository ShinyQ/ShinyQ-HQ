// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import { Gallery } from "@/components/Gallery";
import type { GalleryImage } from "@/content/media";
import { thumbSrc, toGalleryImages } from "@/content/media";

const images: GalleryImage[] = ["one", "two", "three"].map((n) => ({
  src: `/media/pod/${n}.webp`,
  thumb: `/media/pod/${n}.thumb.webp`,
  alt: `Screen ${n}`,
  width: 1600,
  height: 1000,
}));

function renderGallery(list = images) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <Gallery images={list} label="Demo gallery" />
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);

describe("media helpers", () => {
  it("derives thumbnails and localizes alt text", () => {
    expect(thumbSrc("/media/a/01-x.webp")).toBe("/media/a/01-x.thumb.webp");
    const [img] = toGalleryImages([{ src: "/media/a/01-x.webp", alt: { en: "EN", id: "ID" }, width: 10, height: 5, redacted: true }], "id");
    expect(img).toEqual({ src: "/media/a/01-x.webp", thumb: "/media/a/01-x.thumb.webp", alt: "ID", width: 10, height: 5 });
  });
});

describe("Gallery and Lightbox", () => {
  it("renders nothing without images", () => {
    const { container } = renderGallery([]);
    expect(container).toBeEmptyDOMElement();
  });

  it("opens on click, focuses close, navigates with arrows and wraps", async () => {
    const user = userEvent.setup();
    renderGallery();
    await user.click(screen.getByRole("button", { name: /Open image 2 of 3: Screen two/ }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("button", { name: "Close image viewer" })).toHaveFocus();
    expect(screen.getByRole("img", { name: "Screen two" })).toHaveAttribute("src", "/media/pod/two.webp");
    await user.keyboard("{ArrowRight}");
    expect(screen.getByText("Image 3 of 3")).toBeInTheDocument();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByText("Image 1 of 3")).toBeInTheDocument();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("img", { name: "Screen three" })).toBeInTheDocument();
    await user.keyboard("{Home}");
    expect(screen.getByText("Image 1 of 3")).toBeInTheDocument();
    await user.keyboard("{End}");
    expect(screen.getByText("Image 3 of 3")).toBeInTheDocument();
  });

  it("closes on Escape and returns focus to the opening thumbnail", async () => {
    const user = userEvent.setup();
    renderGallery();
    const thumb = screen.getByRole("button", { name: /Open image 1 of 3/ });
    await user.click(thumb);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(thumb).toHaveFocus();
    expect(document.body.style.overflow).toBe("");
  });

  it("keeps Escape and arrows away from other window listeners while open", async () => {
    const user = userEvent.setup();
    const seen: string[] = [];
    const spy = (e: KeyboardEvent) => seen.push(e.key);
    window.addEventListener("keydown", spy);
    renderGallery();
    await user.click(screen.getByRole("button", { name: /Open image 1 of 3/ }));
    await user.keyboard("{ArrowRight}{Escape}");
    window.removeEventListener("keydown", spy);
    expect(seen).toEqual([]);
  });

  it("traps Tab focus inside the dialog", async () => {
    const user = userEvent.setup();
    renderGallery();
    await user.click(screen.getByRole("button", { name: /Open image 1 of 3/ }));
    const dialog = screen.getByRole("dialog");
    for (let i = 0; i < 8; i++) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
    await user.tab({ shift: true });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });

  it("swipes between images on touch", async () => {
    const user = userEvent.setup();
    renderGallery();
    await user.click(screen.getByRole("button", { name: /Open image 1 of 3/ }));
    const stage = screen.getByRole("img", { name: "Screen one" }).parentElement!;
    fireEvent.pointerDown(stage, { pointerId: 1, pointerType: "touch", clientX: 300 });
    fireEvent.pointerUp(stage, { pointerId: 1, pointerType: "touch", clientX: 200 });
    expect(screen.getByText("Image 2 of 3")).toBeInTheDocument();
    fireEvent.pointerDown(stage, { pointerId: 2, pointerType: "touch", clientX: 100 });
    fireEvent.pointerUp(stage, { pointerId: 2, pointerType: "touch", clientX: 220 });
    expect(screen.getByText("Image 1 of 3")).toBeInTheDocument();
  });

  it("closes when the backdrop is clicked", async () => {
    const user = userEvent.setup();
    renderGallery();
    await user.click(screen.getByRole("button", { name: /Open image 1 of 3/ }));
    await user.click(screen.getByRole("img", { name: "Screen one" }).parentElement!);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { GalleryImage } from "@/content/media";
import { Lightbox } from "./Lightbox";

export interface GalleryProps {
  images: readonly GalleryImage[];
  /** Accessible name of the thumbnail list, e.g. the pod title. */
  label?: string;
  /** "mosaic" (case studies: a large first image), "grid", or "strip" (narrow surfaces such as the Glass Drawer). */
  layout?: "mosaic" | "grid" | "strip";
}

/** Thumbnail grid that opens a keyboard and swipe friendly Lightbox. Returns null when empty. */
export function Gallery({ images, label, layout = "grid" }: GalleryProps) {
  const t = useTranslations("gallery");
  const [open, setOpen] = useState<number | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);

  if (images.length === 0) return null;

  const close = () => {
    setOpen(null);
    opener.current?.focus();
  };

  const list =
    layout === "strip"
      ? "flex snap-x snap-mandatory gap-2 overflow-x-auto pb-2 [&>li]:w-56 [&>li]:shrink-0 [&>li]:snap-start"
      : layout === "mosaic"
        ? "grid grid-cols-2 gap-3 sm:grid-cols-6"
        : "grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3";
  const mosaic = layout === "mosaic";
  // The first mosaic tile spans two rows beside a stacked pair; a lone image takes the full width.
  const tile = (i: number) => {
    if (!mosaic) return undefined;
    if (images.length === 1) return "col-span-2 sm:col-span-6";
    return i === 0 ? "col-span-2 sm:col-span-4 sm:row-span-2" : "sm:col-span-2";
  };

  return (
    <>
      <ul className={list} aria-label={label ?? t("title")} data-testid="gallery">
        {images.map((image, i) => (
          <li key={image.src} className={tile(i)}>
            <button
              type="button"
              onClick={(e) => {
                opener.current = e.currentTarget;
                setOpen(i);
              }}
              className={`group block w-full overflow-hidden border p-0 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan ${
                mosaic ? "h-full rounded-[10px] border-line bg-[#0b0b14] hover:border-line-2" : "glass rounded-lg hover:border-cyan/60"
              }`}
              aria-label={t("open", { index: i + 1, total: images.length, alt: image.alt })}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mosaic && i === 0 ? image.src : image.thumb}
                alt=""
                width={480}
                height={Math.round((480 * image.height) / image.width)}
                loading="lazy"
                decoding="async"
                className={`aspect-[16/10] w-full object-cover object-top transition duration-200 group-hover:scale-[1.02] motion-reduce:transition-none motion-reduce:group-hover:scale-100 ${
                  mosaic && i === 0 && images.length > 2 ? "sm:aspect-auto sm:h-full" : ""
                }`}
              />
            </button>
          </li>
        ))}
      </ul>
      {open !== null && <Lightbox images={images} index={open} onIndexChange={setOpen} onClose={close} />}
    </>
  );
}

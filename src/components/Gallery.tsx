"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { GalleryImage } from "@/content/media";
import { Lightbox } from "./Lightbox";

export interface GalleryProps {
  images: readonly GalleryImage[];
  /** Accessible name of the thumbnail list, e.g. the pod title. */
  label?: string;
  /** "grid" (pod pages) or "strip" (narrow surfaces such as the Glass Drawer). */
  layout?: "grid" | "strip";
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
      : "grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3";

  return (
    <>
      <ul className={list} aria-label={label ?? t("title")} data-testid="gallery">
        {images.map((image, i) => (
          <li key={image.src}>
            <button
              type="button"
              onClick={(e) => {
                opener.current = e.currentTarget;
                setOpen(i);
              }}
              className="group glass block w-full overflow-hidden rounded-lg border p-0 transition hover:border-cyan/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
              aria-label={t("open", { index: i + 1, total: images.length, alt: image.alt })}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.thumb}
                alt=""
                width={480}
                height={Math.round((480 * image.height) / image.width)}
                loading="lazy"
                decoding="async"
                className="aspect-[16/10] w-full object-cover object-top transition duration-200 group-hover:scale-[1.02] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
              />
            </button>
          </li>
        ))}
      </ul>
      {open !== null && <Lightbox images={images} index={open} onIndexChange={setOpen} onClose={close} />}
    </>
  );
}

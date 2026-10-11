"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import type { RoomLinkItem, RoomView } from "@/content/room-views/types";
import { preloadCvDialog } from "@/components/dialog-loaders";
import { openCv } from "@/hud/events";
import { Link } from "@/i18n/navigation";
import { audio } from "@/lib/audio";
import { CV_PAGES } from "@/lib/cv";
import type { RoomBodyProps } from "./bodies";

const ACTION =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-cyan px-5 text-sm font-semibold text-void transition hover:bg-cyan/85";
const SECONDARY =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-blue/50 px-4 text-sm font-semibold text-ink transition hover:bg-blue/10";

const itemsOf = (view: RoomView): RoomLinkItem[] => view.sections.flatMap((s) => s.items ?? []);

/** Comms terminals: mailto and copy for the email, then the channels (new tab). */
function ContactBody({ view }: { view: RoomView }) {
  const t = useTranslations("drawer.rooms");
  const tc = useTranslations("common");
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const reset = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(reset.current), []);
  const items = itemsOf(view);
  const email = items.find((i) => i.href?.startsWith("mailto:"));
  const address = email?.meta ?? email?.href?.slice("mailto:".length) ?? "";
  const channels = items.filter((i) => i !== email && i.href);

  const copy = async () => {
    audio.play("click");
    try {
      await navigator.clipboard.writeText(address);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
    window.clearTimeout(reset.current);
    reset.current = window.setTimeout(() => setStatus("idle"), 4000);
  };

  return (
    <div className="space-y-5">
      {email && (
        <section className="space-y-2">
          <h3 className="label text-ink-2">{tc("email")}</h3>
          <p className="font-mono text-sm break-all text-ink">{address}</p>
          <div className="flex flex-wrap gap-2">
            <a href={email.href} className={ACTION}>
              {t("emailMe")}
            </a>
            <button type="button" onClick={copy} className={SECONDARY} data-testid="copy-email">
              {t("copyEmail")}
            </button>
          </div>
          <p role="status" aria-live="polite" className="min-h-5 text-sm text-ink-2">
            {status === "copied" ? t("copied") : status === "failed" ? t("copyFailed", { email: address }) : ""}
          </p>
        </section>
      )}
      <section className="space-y-2">
        <h3 className="label text-ink-2">{t("channels")}</h3>
        <ul className="grid grid-cols-2 gap-2">
          {channels.map((c) => (
            <li key={c.href}>
              <a
                href={c.href}
                target="_blank"
                rel="noopener noreferrer"
                className="glass glass-solid flex min-h-11 items-center justify-between gap-2 px-3 py-2 text-sm font-semibold text-ink transition hover:border-blue/60"
              >
                {c.title}
                <span aria-hidden="true">&#8599;</span>
                <span className="sr-only">({tc("external")})</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** CV kiosk: opens the CV viewer modal (page images of the owner's PDF), plus the PDF and the /cv page. */
function CvBody({ view }: { view: RoomView }) {
  const t = useTranslations("drawer.rooms");
  const tcv = useTranslations("cv");
  const items = itemsOf(view);
  const pdfs = items.filter((i) => i.href?.endsWith(".pdf"));
  const pages = items.filter((i) => i.href && !i.href.endsWith(".pdf") && i.href.startsWith("/"));
  const cover = CV_PAGES[0];
  return (
    <section className="space-y-3">
      {cover && (
        <button
          type="button"
          onClick={openCv}
          onPointerEnter={preloadCvDialog}
          onFocus={preloadCvDialog}
          aria-haspopup="dialog"
          className="group block w-full overflow-hidden rounded-lg border border-glass-border transition hover:border-cyan/60"
          data-testid="cv-cover"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cover.srcSmall}
            width={cover.widthSmall}
            height={cover.heightSmall}
            alt={tcv("pageAlt", { page: 1, total: CV_PAGES.length })}
            loading="lazy"
            decoding="async"
            className="block aspect-[4/3] w-full bg-[#fff] object-cover object-top"
          />
        </button>
      )}
      <ul className="flex flex-wrap gap-2">
        <li>
          <button type="button" onClick={openCv} onPointerEnter={preloadCvDialog} aria-haspopup="dialog" className={ACTION} data-testid="cv-view">
            {t("cvView")}
          </button>
        </li>
        {pdfs.map((pdf) => (
          <li key={pdf.href}>
            <a href={pdf.href} download={pdf.href!.split("/").pop()} type="application/pdf" onClick={() => audio.play("click")} className={SECONDARY} data-testid="cv-pdf">
              {pdf.title}
            </a>
          </li>
        ))}
      </ul>
      {pages.map((p) => (
        <p key={p.href}>
          <Link href={p.href!} className="link inline-flex min-h-11 items-center">
            {p.title}
          </Link>
        </p>
      ))}
    </section>
  );
}

/** Single-pane body for Roof rooms (registered for kind "roof" in `bodies.tsx`). */
export function RoofBody({ view }: RoomBodyProps) {
  return view.id === "RF:cv" ? <CvBody view={view} /> : <ContactBody view={view} />;
}

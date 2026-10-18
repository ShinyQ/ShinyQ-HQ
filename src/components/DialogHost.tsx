"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CertView } from "@/content/certs";
import type { PaperPreview } from "@/content/citation";
import { onHudCommand, type HudCommand } from "@/hud/events";
import { audio } from "@/lib/audio";
import { loadCertDialog, loadCvDialog, loadGuideDialog, loadPaperDialog } from "./dialog-loaders";

const CvDialog = dynamic(loadCvDialog, { ssr: false });
const PaperDialog = dynamic(loadPaperDialog, { ssr: false });
const CertDialog = dynamic(loadCertDialog, { ssr: false });
const GuideDialog = dynamic(loadGuideDialog, { ssr: false });

type Open =
  | { kind: "cv" }
  | { kind: "paper"; paper: PaperPreview; read: boolean }
  | { kind: "cert"; cert: CertView }
  | { kind: "guide"; slug: string }
  | null;

function toOpen(command: HudCommand): Open {
  switch (command.type) {
    case "cv":
      return { kind: "cv" };
    case "paper":
      return { kind: "paper", paper: command.paper, read: Boolean(command.read && command.paper.document) };
    case "cert":
      return { kind: "cert", cert: command.cert };
    case "guide":
      return { kind: "guide", slug: command.slug };
    default:
      return null;
  }
}

/**
 * Site-wide modals (CV viewer, paper previews, certification previews, the study guide reader), mounted once in the
 * locale layout outside #site-shell so they also open over the 3D tower and the room drawer. Opened with `openCv()`,
 * `openPaper(paper, { read? })`, `openCert(cert)` and `openGuide(slug)` (`hq:hud` commands); the chunks load on first
 * use. Focus returns to the opener: a command that replaces an open dialog (the cert card's "Read study guide") keeps
 * the first dialog's opener, since the button that sent it unmounts with its dialog.
 */
export function DialogHost() {
  const [open, setOpen] = useState<Open>(null);
  const opener = useRef<HTMLElement | null>(null);
  const isOpen = useRef(false);

  useEffect(
    () =>
      onHudCommand((command) => {
        const next = toOpen(command);
        if (!next) return;
        // The palette closes as it runs "View CV", so its input is gone by then: focus falls back to the page.
        if (!isOpen.current) {
          const active = document.activeElement;
          opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
        }
        isOpen.current = true;
        audio.play("click");
        setOpen(next);
      }),
    [],
  );

  const close = useCallback(() => {
    setOpen(null);
    isOpen.current = false;
    const target = opener.current;
    opener.current = null;
    requestAnimationFrame(() => {
      if (target?.isConnected) target.focus({ preventScroll: true });
    });
  }, []);

  if (!open) return null;
  if (open.kind === "guide") return <GuideDialog key={open.slug} slug={open.slug} onClose={close} />;
  if (open.kind === "cert") return <CertDialog key={open.cert.id} cert={open.cert} onClose={close} />;
  return open.kind === "cv" ? <CvDialog onClose={close} /> : <PaperDialog key={`${open.paper.id}:${open.read}`} paper={open.paper} read={open.read} onClose={close} />;
}

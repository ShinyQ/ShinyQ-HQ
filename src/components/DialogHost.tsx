"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { onHudCommand, type HudCommand } from "@/hud/events";
import { audio } from "@/lib/audio";
import { countIntent } from "@/lib/stats/visitClient";
import { loadCertDialog, loadCvDialog, loadPaperDialog } from "./dialog-loaders";

const CvDialog = dynamic(loadCvDialog, { ssr: false });
const PaperDialog = dynamic(loadPaperDialog, { ssr: false });
const CertDialog = dynamic(loadCertDialog, { ssr: false });
const GuideDialog = dynamic(() => loadCertDialog().then((m) => ({ default: m.GuideDialog })), { ssr: false });

type Open = Extract<HudCommand, { type: "cv" | "paper" | "cert" | "guide" }> | null;
const DIALOGS = /^(cv|paper|cert|guide)$/;

/**
 * Site-wide modals (CV reader, paper previews, certification previews, the study guide reader), mounted once in the
 * locale layout outside #site-shell so they also open over the 3D tower and the room drawer. Opened with `openCv()`,
 * `openPaper(paper, { read? })` and `openCert(cert)` (`hq:hud` commands); the study guide reader opens on the "guide"
 * command or a click on any `[data-hq-guide]` button, the CV reader also on a plain click on a `[data-hq-cv]` link.
 * Every PDF (CV, papers, guides) is read in the shared reader (`./pdf-reader`). The chunks load on first use. Focus
 * returns to the opener: a dialog that replaces an open one (the cert card's "Read study guide") keeps the first
 * dialog's opener, since the button that sent it unmounts with its dialog.
 */
export function DialogHost() {
  const [open, setOpen] = useState<Open>(null);
  const opener = useRef<HTMLElement | null>(null);
  const isOpen = useRef(false);

  useEffect(() => {
    const show = (next: HudCommand, from: Element | null) => {
      if (!DIALOGS.test(next.type)) return;
      // The palette closes as it runs "View CV", so its input is gone by then: focus falls back to the page.
      // A dialog that replaces an open one (sent from inside it) keeps the first dialog's opener.
      if (!isOpen.current) opener.current = from instanceof HTMLElement && from !== document.body ? from : null;
      isOpen.current = true;
      audio.play("click");
      // Every CV entry point (Classic, the 3D Rover menu and kiosk, the boot card) opens here: one private intent count.
      if (next.type === "cv") countIntent("cv");
      setOpen(next as Open);
    };
    // Server-rendered "Read" buttons (the `/library` shelf, the cert card) carry `data-hq-guide`, and the `/cv` page's
    // links to the CV PDF carry `data-hq-cv` (a plain click opens the reader, a modified one keeps the link); no island.
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element;
      const button = target.closest?.<HTMLElement>("[data-hq-guide]");
      if (button) return show({ type: "guide", slug: button.dataset.hqGuide! }, button);
      const cv = target.closest?.<HTMLElement>("[data-hq-cv]");
      if (!cv || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      show({ type: "cv" }, cv);
    };
    const off = onHudCommand((command) => show(command, document.activeElement));
    addEventListener("click", onClick);
    return () => {
      off();
      removeEventListener("click", onClick);
    };
  }, []);

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
  if (open.type === "guide") return <GuideDialog key={open.slug} slug={open.slug} onClose={close} />;
  if (open.type === "cert") return <CertDialog key={open.cert.id} cert={open.cert} onClose={close} />;
  if (open.type === "cv") return <CvDialog onClose={close} />;
  const read = Boolean(open.read && open.paper.document);
  return <PaperDialog key={`${open.paper.id}:${read}`} paper={open.paper} read={read} onClose={close} />;
}

"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { onHudCommand, type HudCommand } from "@/hud/events";
import { audio } from "@/lib/audio";
import { loadCertDialog, loadCvDialog, loadPaperDialog } from "./dialog-loaders";

const CvDialog = dynamic(loadCvDialog, { ssr: false });
const PaperDialog = dynamic(loadPaperDialog, { ssr: false });
const CertDialog = dynamic(loadCertDialog, { ssr: false });
const GuideDialog = dynamic(() => loadCertDialog().then((m) => ({ default: m.GuideDialog })), { ssr: false });

type Open = Extract<HudCommand, { type: "cv" | "paper" | "cert" | "guide" }> | null;
const DIALOGS = /^(cv|paper|cert|guide)$/;

/**
 * Site-wide modals (CV viewer, paper previews, certification previews, the study guide reader), mounted once in the
 * locale layout outside #site-shell so they also open over the 3D tower and the room drawer. Opened with `openCv()`,
 * `openPaper(paper, { read? })` and `openCert(cert)` (`hq:hud` commands); the study guide reader opens on the "guide"
 * command or a click on any `[data-hq-guide]` button. The chunks load on first use. Focus returns to the opener: a
 * dialog that replaces an open one (the cert card's "Read study guide") keeps the first dialog's opener, since the
 * button that sent it unmounts with its dialog.
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
      setOpen(next as Open);
    };
    // Server-rendered "Read" buttons (the `/library` shelf, the cert card) carry `data-hq-guide`; no island per button.
    const onClick = (event: MouseEvent) => {
      const button = (event.target as Element).closest?.<HTMLElement>("[data-hq-guide]");
      if (button) show({ type: "guide", slug: button.dataset.hqGuide! }, button);
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

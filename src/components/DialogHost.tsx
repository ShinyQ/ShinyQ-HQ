"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CertView } from "@/content/certs";
import type { PaperPreview } from "@/content/citation";
import { onHudCommand, type HudCommand } from "@/hud/events";
import { audio } from "@/lib/audio";
import { loadCertDialog, loadCvDialog, loadPaperDialog } from "./dialog-loaders";

const CvDialog = dynamic(loadCvDialog, { ssr: false });
const PaperDialog = dynamic(loadPaperDialog, { ssr: false });
const CertDialog = dynamic(loadCertDialog, { ssr: false });
const GuideDialog = dynamic(() => import("./guides/GuideDialog"), { ssr: false });

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
    const show = (next: Open, from: Element | null) => {
      if (!next) return;
      // The palette closes as it runs "View CV", so its input is gone by then: focus falls back to the page.
      if (!isOpen.current) opener.current = from instanceof HTMLElement && from !== document.body ? from : null;
      isOpen.current = true;
      audio.play("click");
      setOpen(next);
    };
    // Server-rendered "Read" buttons (the `/library` shelf, the cert card) carry `data-hq-guide`; no island per button.
    const onClick = (event: MouseEvent) => {
      const button = (event.target as Element).closest?.("[data-hq-guide]");
      if (button) show({ kind: "guide", slug: button.getAttribute("data-hq-guide")! }, button);
    };
    const off = onHudCommand((command) => show(toOpen(command), document.activeElement));
    document.addEventListener("click", onClick);
    return () => {
      off();
      document.removeEventListener("click", onClick);
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
  if (open.kind === "guide") return <GuideDialog key={open.slug} slug={open.slug} onClose={close} />;
  if (open.kind === "cert") return <CertDialog key={open.cert.id} cert={open.cert} onClose={close} />;
  return open.kind === "cv" ? <CvDialog onClose={close} /> : <PaperDialog key={`${open.paper.id}:${open.read}`} paper={open.paper} read={open.read} onClose={close} />;
}

"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CertView } from "@/content/certs";
import type { PaperPreview } from "@/content/citation";
import { onHudCommand } from "@/hud/events";
import { audio } from "@/lib/audio";
import { loadCertDialog, loadCvDialog, loadPaperDialog } from "./dialog-loaders";

const CvDialog = dynamic(loadCvDialog, { ssr: false });
const PaperDialog = dynamic(loadPaperDialog, { ssr: false });
const CertDialog = dynamic(loadCertDialog, { ssr: false });

type Open = { kind: "cv" } | { kind: "paper"; paper: PaperPreview } | { kind: "cert"; cert: CertView } | null;

/**
 * Site-wide modals (CV viewer, paper previews, certification previews), mounted once in the locale layout outside
 * #site-shell so they also open over the 3D tower and the room drawer. Opened with `openCv()` and
 * `openPaper(paper)` and `openCert(cert)` (`hq:hud` commands); the chunks load on first use. Focus returns to the opener.
 */
export function DialogHost() {
  const [open, setOpen] = useState<Open>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(
    () =>
      onHudCommand((command) => {
        if (command.type !== "cv" && command.type !== "paper" && command.type !== "cert") return;
        // The palette closes as it runs "View CV", so its input is gone by then: focus falls back to the page.
        const active = document.activeElement;
        opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
        audio.play("click");
        setOpen(command.type === "cv" ? { kind: "cv" } : command.type === "paper" ? { kind: "paper", paper: command.paper } : { kind: "cert", cert: command.cert });
      }),
    [],
  );

  const close = useCallback(() => {
    setOpen(null);
    const target = opener.current;
    opener.current = null;
    requestAnimationFrame(() => {
      if (target?.isConnected) target.focus({ preventScroll: true });
    });
  }, []);

  if (!open) return null;
  if (open.kind === "cert") return <CertDialog key={open.cert.id} cert={open.cert} onClose={close} />;
  return open.kind === "cv" ? <CvDialog onClose={close} /> : <PaperDialog key={open.paper.id} paper={open.paper} onClose={close} />;
}

"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PaperPreview } from "@/content/citation";
import { onHudCommand } from "@/hud/events";
import { audio } from "@/lib/audio";
import { loadCvDialog, loadPaperDialog } from "./dialog-loaders";

const CvDialog = dynamic(loadCvDialog, { ssr: false });
const PaperDialog = dynamic(loadPaperDialog, { ssr: false });

type Open = { kind: "cv" } | { kind: "paper"; paper: PaperPreview } | null;

/**
 * Site-wide modals (CV viewer, paper previews), mounted once in the locale layout outside
 * #site-shell so they also open over the 3D tower and the room drawer. Opened with `openCv()` and
 * `openPaper(paper)` (`hq:hud` commands); the chunks load on first use. Focus returns to the opener.
 */
export function DialogHost() {
  const [open, setOpen] = useState<Open>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(
    () =>
      onHudCommand((command) => {
        if (command.type !== "cv" && command.type !== "paper") return;
        // The palette closes as it runs "View CV", so its input is gone by then: focus falls back to the page.
        const active = document.activeElement;
        opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
        audio.play("click");
        setOpen(command.type === "cv" ? { kind: "cv" } : { kind: "paper", paper: command.paper });
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
  return open.kind === "cv" ? <CvDialog onClose={close} /> : <PaperDialog key={open.paper.id} paper={open.paper} onClose={close} />;
}

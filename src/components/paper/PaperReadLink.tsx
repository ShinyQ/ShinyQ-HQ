"use client";

import type { MouseEvent, ReactNode } from "react";
import type { PaperPreview } from "@/content/citation";
import { openPaper } from "@/hud/events";
import { preloadPaperDialog } from "../dialog-loaders";

/**
 * "Read the paper": opens the paper reader in the paper modal. It is a real link to the self-hosted
 * PDF, so it works before hydration, without JS and with a modifier key.
 */
export function PaperReadLink({ paper, className, children }: { paper: PaperPreview; className?: string; children: ReactNode }) {
  const doc = paper.document;
  if (!doc) return null;
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    openPaper(paper, { read: true });
  };
  return (
    <a
      href={doc.pdf}
      type="application/pdf"
      onClick={onClick}
      onPointerEnter={preloadPaperDialog}
      onFocus={preloadPaperDialog}
      aria-haspopup="dialog"
      className={className}
      data-testid="paper-read-link"
    >
      {children}
    </a>
  );
}

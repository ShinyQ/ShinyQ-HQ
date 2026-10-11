"use client";

import type { ReactNode } from "react";
import type { PaperPreview } from "@/content/citation";
import { openPaper } from "@/hud/events";
import { preloadPaperDialog } from "../dialog-loaders";

/** Opens the paper preview modal (abstract, citations, DOI and Scholar links) for one paper. */
export function PaperTrigger({ paper, className, children, testId = "paper-open" }: { paper: PaperPreview; className?: string; children: ReactNode; testId?: string }) {
  return (
    <button
      type="button"
      onClick={() => openPaper(paper)}
      onPointerEnter={preloadPaperDialog}
      onFocus={preloadPaperDialog}
      aria-haspopup="dialog"
      className={className}
      data-testid={testId}
    >
      {children}
    </button>
  );
}

"use client";

import { preloadGuideDialog } from "@/components/dialog-loaders";
import { openGuide } from "@/hud/events";

export interface GuideActionsProps {
  slug: string;
  title: string;
  downloadUrl: string;
  file: string;
  readLabel: string;
  downloadLabel: string;
}

/**
 * A study guide card's actions on the Classic shelf: Read opens the in-site reader (`hq:hud` "guide", handled by
 * `DialogHost`; hover or focus preloads its chunk) and the same-origin PDF download. Labels arrive resolved from
 * the server shelf, so this island reads no message namespace.
 */
export function GuideActions({ slug, title, downloadUrl, file, readLabel, downloadLabel }: GuideActionsProps) {
  return (
    <div className="flex flex-wrap gap-3">
      <button
        type="button"
        data-testid="guide-read"
        aria-haspopup="dialog"
        className="pv-btn pv-btn-primary"
        onPointerEnter={preloadGuideDialog}
        onFocus={preloadGuideDialog}
        onClick={() => openGuide(slug)}
      >
        {readLabel}
        <span className="sr-only">: {title}</span>
      </button>
      <a href={downloadUrl} download={file} className="pv-btn pv-btn-ghost">
        {downloadLabel}
        <span className="sr-only">: {title}</span>
      </a>
    </div>
  );
}

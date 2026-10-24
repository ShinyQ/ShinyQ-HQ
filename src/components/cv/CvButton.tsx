"use client";

import type { MouseEvent, ReactNode } from "react";
import { openCv } from "@/hud/events";
import { Link } from "@/i18n/navigation";
import { preloadCvDialog } from "../dialog-loaders";

/**
 * Every CV entry point: opens the in-site CV reader modal. It is a real link to /{locale}/cv (the
 * same viewer as a page), so it works before hydration, without JS and with a modifier key.
 */
export function CvButton({ className, children, testId = "cv-open" }: { className?: string; children: ReactNode; testId?: string }) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    openCv();
  };
  return (
    <Link href="/cv" onClick={onClick} onPointerEnter={preloadCvDialog} onFocus={preloadCvDialog} aria-haspopup="dialog" className={className} data-testid={testId}>
      {children}
    </Link>
  );
}

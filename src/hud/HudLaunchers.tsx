"use client";

import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import { openPalette, openTerminal } from "./events";

const noop = () => () => {};
const isApple = () => /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent);

/** Header entry points for the missions HUD: Rover Terminal and command palette (⌘K). */
export function HudLaunchers({ buttonClassName }: { buttonClassName?: string } = {}) {
  const t = useTranslations("hud.launcher");
  const shortcut = useSyncExternalStore(noop, () => (isApple() ? "⌘K" : "Ctrl K"), () => "Ctrl K");
  const button =
    buttonClassName ??
    "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md border border-glass-border px-2.5 text-sm text-ink-2 transition hover:border-cyan/50 hover:text-ink";
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" onClick={openTerminal} className={button} aria-haspopup="dialog">
        <span aria-hidden="true" className="font-mono text-cyan">
          &gt;_
        </span>
        <span className="sr-only sm:not-sr-only">{t("missions")}</span>
      </button>
      <button
        type="button"
        onClick={() => openPalette()}
        className={button}
        aria-haspopup="dialog"
        aria-label={t("searchShortcut", { shortcut })}
        aria-keyshortcuts="Meta+K Control+K /"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <kbd aria-hidden="true" className="label hidden rounded border border-glass-border px-1.5 py-0.5 text-ink-3 sm:inline">
          {shortcut}
        </kbd>
      </button>
    </div>
  );
}

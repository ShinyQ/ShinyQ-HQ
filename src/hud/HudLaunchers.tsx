"use client";

import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import { openPalette, openTerminal } from "./events";

const noop = () => () => {};
const isApple = () => /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent);

/**
 * The 3D top bar is one row from 1024 px; with the wider "Ctrl K" chip (Windows, Linux) and the
 * Indonesian labels it reaches the profile card just above 1024 px, so the chip hides below this.
 */
const CTRL_CHIP_COMPACT = "lg:max-[1100px]:hidden";

/**
 * Header entry points: Ask Rover (the Rover Terminal and its missions) and the command palette (⌘K).
 * `compactShortcut` hides the "Ctrl K" chip from 1024 to 1099 px (the search button keeps its icon and name).
 */
export function HudLaunchers({
  buttonClassName,
  labelClassName = "sr-only sm:not-sr-only",
  compactShortcut = false,
}: { buttonClassName?: string; labelClassName?: string; compactShortcut?: boolean } = {}) {
  const t = useTranslations("hud.launcher");
  const shortcut = useSyncExternalStore(noop, () => (isApple() ? "⌘K" : "Ctrl K"), () => "Ctrl K");
  const chip = compactShortcut && shortcut !== "⌘K" ? ` ${CTRL_CHIP_COMPACT}` : "";
  const button =
    buttonClassName ??
    "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md border border-glass-border px-2.5 text-sm text-ink-2 transition hover:border-cyan/50 hover:text-ink";
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" onClick={openTerminal} className={button} aria-haspopup="dialog" data-onboard="ask-rover">
        <span aria-hidden="true" className="font-mono text-cyan">
          &gt;_
        </span>
        <span className={labelClassName}>{t("askRover")}</span>
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
        <kbd aria-hidden="true" className={`label hidden rounded border border-glass-border px-1.5 py-0.5 text-ink-3 sm:inline${chip}`}>
          {shortcut}
        </kbd>
      </button>
    </div>
  );
}

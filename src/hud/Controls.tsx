"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { LOCALES, type Locale } from "@/content/schema";
import { useAudio } from "@/lib/audio";
import { AskPill } from "./ask/AskPill";
import { HudLaunchers } from "./HudLaunchers";

function LangToggle({ onToggleLang }: { onToggleLang: () => void }) {
  const t = useTranslations("hud");
  const locale = useLocale() as Locale;
  return (
    <div role="group" aria-label={t("language")} className="glass glass-solid flex rounded-full p-0.5">
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={l === locale}
          onClick={() => l !== locale && onToggleLang()}
          className={`label inline-flex min-h-10 min-w-11 items-center justify-center rounded-full px-2.5 transition ${
            l === locale ? "bg-cyan/15 text-cyan" : "text-ink-2 hover:text-ink"
          }`}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function SoundToggle({ withLabel = false }: { withLabel?: boolean }) {
  const t = useTranslations("hud");
  const { muted, toggleMuted } = useAudio();
  const sound = !muted;
  return (
    <button
      type="button"
      aria-pressed={sound}
      aria-label={withLabel ? undefined : t("sound")}
      onClick={toggleMuted}
      className="glass glass-solid inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full px-3 text-ink-2 transition hover:text-ink"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M11 5 6 9H2v6h4l5 4V5z" />
        {sound ? <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" /> : <path d="m22 9-6 6M16 9l6 6" />}
      </svg>
      {withLabel && <span className="text-sm">{t("sound")}</span>}
    </button>
  );
}

const launcher = "glass glass-solid inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full px-3 text-sm text-ink-2 transition hover:text-ink";
/** Page view is the one primary control of the 3D HUD (solid cyan, like Back to 3D in the Page View). */
const primary =
  "inline-flex min-h-11 items-center gap-2 rounded-full bg-cyan px-4 text-sm font-semibold text-void shadow-[0_0_24px_-6px_var(--color-cyan)] transition hover:bg-cyan/85 focus-visible:outline-offset-4";

/** Document glyph left of "Page view" (owner request): the portfolio as a page. Same stroke style as the HUD icons. */
function PageIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
      data-testid="page-view-icon"
    >
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </svg>
  );
}

/** Page view (highlighted, document icon on the left) with Ask AI on its right, the far right of the HUD. Quick view lives only in the Page View. */
function ViewActions({ onExit }: { onExit: () => void }) {
  const t = useTranslations("hud");
  return (
    <div className="flex items-center gap-2" data-testid="hud-view-actions">
      <button type="button" onClick={onExit} title={t("pageViewHint")} className={primary} data-testid="page-view">
        <PageIcon />
        {t("pageView")}
      </button>
      <AskPill />
    </div>
  );
}

/**
 * Desktop and tablet top-right controls (appendix 04 section 2): one row from 1024 px; below that,
 * Page view and Ask AI get their own row under the bar. From 1024 to 1099 px the "Ctrl K" chip hides
 * (`compactShortcut`) so the row clears the profile card in Indonesian on Windows and Linux.
 */
export function TopBar({ onExit, onToggleLang }: { onExit: () => void; onToggleLang: () => void }) {
  return (
    <div className="pointer-events-auto absolute top-4 right-4 flex flex-col items-end gap-2 lg:flex-row lg:items-center" data-testid="hud-topbar">
      <div className="flex items-center gap-2">
        <HudLaunchers buttonClassName={launcher} labelClassName="sr-only md:not-sr-only" compactShortcut />
        <LangToggle onToggleLang={onToggleLang} />
        <SoundToggle />
      </div>
      <ViewActions onExit={onExit} />
    </div>
  );
}

/** Phones: Ask Rover, search and the menu (language, sound) on the first row; Page view and Ask AI on the second. */
export function MobileMenu({ onExit, onToggleLang }: { onExit: () => void; onToggleLang: () => void }) {
  const t = useTranslations("hud");
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="pointer-events-auto absolute top-3 right-3 flex flex-col items-end gap-2" data-testid="hud-topbar">
      <div className="flex items-center gap-2">
        <HudLaunchers buttonClassName={launcher} labelClassName="sr-only" />
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          aria-label={t("menu")}
          onClick={() => setOpen((v) => !v)}
          className="glass glass-solid grid size-11 place-items-center rounded-full text-ink"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>
      <ViewActions onExit={onExit} />
      {open && (
        <div id={id} className="glass glass-solid flex w-56 flex-col gap-2 p-3">
          <LangToggle onToggleLang={onToggleLang} />
          <SoundToggle withLabel />
        </div>
      )}
    </div>
  );
}

"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { LOCALES, type Locale } from "@/content/schema";
import { Link } from "@/i18n/navigation";
import { useAudio } from "@/lib/audio";
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
const pill = "glass glass-solid inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold text-ink transition hover:text-cyan";

/** Desktop and tablet top-right controls (appendix 04 section 2). */
export function TopBar({ onExit, onToggleLang }: { onExit: () => void; onToggleLang: () => void }) {
  const t = useTranslations("hud");
  return (
    <div className="pointer-events-auto absolute top-4 right-4 flex items-center gap-2">
      <HudLaunchers buttonClassName={launcher} />
      <Link href="/quick" className={pill}>
        {t("quickView")}
      </Link>
      <LangToggle onToggleLang={onToggleLang} />
      <SoundToggle />
      <button type="button" onClick={onExit} title={t("pageViewHint")} className={pill}>
        {t("pageView")}
      </button>
    </div>
  );
}

/** Mobile menu (≡) holding Quick view, language, sound and page view. */
export function MobileMenu({ onExit, onToggleLang }: { onExit: () => void; onToggleLang: () => void }) {
  const t = useTranslations("hud");
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="pointer-events-auto absolute top-3 right-3 flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <HudLaunchers buttonClassName={launcher} />
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
      {open && (
        <div id={id} className="glass glass-solid flex w-56 flex-col gap-2 p-3">
          <Link href="/quick" className={`${pill} justify-center`}>
            {t("quickView")}
          </Link>
          <LangToggle onToggleLang={onToggleLang} />
          <SoundToggle withLabel />
          <button type="button" onClick={onExit} className={`${pill} justify-center`}>
            {t("pageView")}
          </button>
        </div>
      )}
    </div>
  );
}

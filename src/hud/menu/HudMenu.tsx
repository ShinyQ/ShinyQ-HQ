"use client";

import { useTranslations } from "next-intl";
import { useId, useRef, type ReactNode } from "react";
import { Modal } from "@/components/Modal";
import { PageViewIcon } from "@/components/PageViewIcon";
import { intents } from "@/experience/input/intents";
import type { ExperienceData } from "@/experience/types";
import { ACCENT_TEXT, FLOOR_ACCENT } from "@/lib/accent";
import { useHQStore } from "@/store/useHQStore";
import { openPalette, openTerminal } from "../events";
import type { HudLayout } from "../layout";
import { ProfilePhoto } from "../ProfileCard";
import { LazySettingsPanel } from "../settings/LazySettingsPanel";
import { RotateLeftIcon, RotateRightIcon, rotateView } from "../ViewControls";
import { SheetHeader } from "./SheetHeader";
import { useHudToggle } from "./useHudToggles";

const action =
  "hq-glow inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-2 px-3 py-2 text-left text-sm text-ink-2 hover:bg-surface-2 hover:text-ink";
const primary =
  "col-span-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-cyan px-4 text-sm font-semibold text-void shadow-[0_0_24px_-6px_var(--color-cyan)] transition hover:bg-cyan/85 focus-visible:outline-offset-4";

function SearchIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function MapIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" className="shrink-0">
      <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14" />
    </svg>
  );
}

/** Who and where: the photo, name, headline and current floor (no buttons; the desktop shows the same in its profile card). */
function MenuProfile({ data }: { data: ExperienceData }) {
  const t = useTranslations("hud");
  const floor = useHQStore((s) => s.floor);
  return (
    <section aria-label={t("profile")} data-testid="menu-profile" className="flex items-center gap-3 px-3">
      <ProfilePhoto size={44} />
      <div className="min-w-0">
        <p className="truncate text-[15px] leading-5 font-bold text-ink">{data.profile.name}</p>
        <p className="text-[13px] leading-5 text-cyan">{data.profile.headline}</p>
        <p className="text-sm leading-5 text-ink-2">
          <span className={`label mr-1.5 ${ACCENT_TEXT[FLOOR_ACCENT[floor]]}`}>{floor}</span>
          {data.floors[floor].name}
        </p>
      </div>
    </section>
  );
}

/**
 * Corners HUD menu (phones and tablets, top right): a button that opens a side sheet (a bottom sheet
 * on phones) with the profile, the actions (Classic site, search, Rover menu, rotate, map) and every
 * setting. The Rover menu lives here, so the button carries its onboarding spotlight. The `,` key opens
 * it; closing returns focus to the button. Tablets show search in the bar, so the menu leaves it out.
 */
export function HudMenu({ data, layout, onExit }: { data: ExperienceData; layout: HudLayout; onExit: () => void }) {
  const t = useTranslations("hud");
  const [open, setOpen] = useHudToggle("settings");
  const button = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  // Focus moves back before the sheet unmounts, so it never drops to the body.
  const close = () => {
    button.current?.focus({ preventScroll: true });
    setOpen(false);
  };
  // `close` runs first, so the overlay an action opens takes focus and returns it to the menu button;
  // rotating keeps the menu open.
  const actions: { key: string; label: string; icon: ReactNode; run: () => void; close: boolean }[] = [
    ...(layout === "tablet" ? [] : [{ key: "search", label: t("launcher.search"), icon: <SearchIcon />, run: () => openPalette(), close: true }]),
    {
      key: "rover-menu",
      label: t("launcher.roverMenu"),
      icon: (
        <span aria-hidden="true" className="w-[18px] shrink-0 text-center font-mono text-cyan">
          &gt;_
        </span>
      ),
      run: openTerminal,
      close: true,
    },
    { key: "rotate-left", label: t("view.rotateLeft"), icon: <RotateLeftIcon />, run: () => rotateView(-1), close: false },
    { key: "rotate-right", label: t("view.rotateRight"), icon: <RotateRightIcon />, run: () => rotateView(1), close: false },
    { key: "map", label: t("map.open"), icon: <MapIcon />, run: () => intents.emit({ type: "toggle", what: "map" }), close: true },
  ];

  return (
    <>
      <button
        ref={button}
        type="button"
        data-testid="hud-menu"
        data-onboard="rover-menu"
        aria-label={t("menu")}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="glass glass-solid pointer-events-auto grid size-11 shrink-0 place-items-center rounded-full text-ink"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
      {open && (
        <Modal labelledBy={titleId} onClose={close} side testId="menu-sheet">
          <SheetHeader id={titleId} title={t("menuTitle")} onClose={close} />
          <div className="flex flex-col gap-5 overflow-y-auto px-2 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <MenuProfile data={data} />
            <div data-testid="menu-actions" className="grid grid-cols-2 gap-2 px-3">
              <button type="button" onClick={onExit} title={t("pageViewHint")} className={primary} data-testid="page-view">
                <PageViewIcon />
                {t("pageView")}
              </button>
              {actions.map((a, i) => (
                // An odd last action takes the full row.
                <button
                  key={a.key}
                  type="button"
                  onClick={() => {
                    if (a.close) close();
                    a.run();
                  }}
                  className={`${action} ${i === actions.length - 1 && actions.length % 2 === 1 ? "col-span-2" : ""}`}
                >
                  {a.icon}
                  {a.label}
                </button>
              ))}
            </div>
            <LazySettingsPanel headingLevel={3} onClose={close} />
          </div>
        </Modal>
      )}
    </>
  );
}

// CI measurement: throwaway HUD change (do not merge).

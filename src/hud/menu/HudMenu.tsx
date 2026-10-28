"use client";

import { useTranslations } from "next-intl";
import { createElement, Suspense, useId, useReducer, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { PageViewIcon } from "@/components/PageViewIcon";
import type { ExperienceData } from "@/experience/types";
import { ChunkFailed } from "../ChunkFailed";
import type { HudLayout } from "../layout";
import { lazyFromChunk } from "../lazyFromChunk";
import { loadMenu } from "./menuChunk";
import type { MenuSheetProps } from "./MenuSheet";
import { SheetHeader } from "./SheetHeader";
import { useHudToggle } from "./useHudToggles";

type LoadProps = MenuSheetProps & { onRetry: () => void };

/** A failed sheet chunk: Retry, and the Classic site stays one tap away. */
function MenuFailed({ onRetry, onExit }: LoadProps) {
  const t = useTranslations("hud");
  return (
    <div className="flex flex-col gap-3">
      <ChunkFailed onRetry={onRetry} testId="menu-failed" />
      <button
        type="button"
        onClick={onExit}
        data-testid="page-view"
        className="mx-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-cyan px-4 text-sm font-semibold text-void"
      >
        <PageViewIcon />
        {t("pageView")}
      </button>
    </div>
  );
}

const lazySheet = lazyFromChunk<LoadProps>(
  () =>
    loadMenu().then((mod) => {
      if (!mod) throw new Error("menu sheet chunk");
      return mod.MenuSheet;
    }),
  MenuFailed,
);

function LazyMenuSheet(props: LoadProps) {
  return createElement(lazySheet(), props);
}

/**
 * Corners HUD menu (phones and tablets, top right): a button that opens a side sheet (a bottom sheet
 * on phones) with the profile, the actions (Classic site, search, Rover menu, rotate, map) and every
 * setting, and the controls help behind its Controls action. The Rover menu lives here, so the button
 * carries its onboarding spotlight. The `,` key opens it; closing returns focus to the button.
 *
 * The sheet's body is a lazy chunk (`MenuSheet`, owner decision 2026-10-28), fetched from the button's first press,
 * so only the button and the sheet frame ride the first-frame 3D path; a placeholder holds the body's height while it
 * loads.
 */
export function HudMenu({ data, layout, onExit }: { data: ExperienceData; layout: HudLayout; onExit: () => void }) {
  const t = useTranslations("hud");
  const [open, setOpen] = useHudToggle("settings");
  const button = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [controls, setControls] = useState(false);
  const [, retry] = useReducer((n: number) => n + 1, 0);

  // Focus moves back before the sheet unmounts, so it never drops to the body.
  const close = () => {
    button.current?.focus({ preventScroll: true });
    setControls(false);
    setOpen(false);
  };

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
        onPointerDown={() => void loadMenu()}
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
            <Suspense fallback={<div aria-hidden="true" data-testid="menu-loading" className="min-h-[22rem]" />}>
              <LazyMenuSheet data={data} layout={layout} onExit={onExit} close={close} controls={controls} onControls={() => setControls((v) => !v)} onRetry={retry} />
            </Suspense>
          </div>
        </Modal>
      )}
    </>
  );
}

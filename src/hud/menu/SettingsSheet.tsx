"use client";

import { useTranslations } from "next-intl";
import { useId, useRef } from "react";
import { Modal } from "@/components/Modal";
import { LazySettingsPanel } from "../settings/LazySettingsPanel";
import { SheetHeader } from "./SheetHeader";
import { useHudToggle } from "./useHudToggles";

/** Desktop settings: a right side panel with every registered setting. */
export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("hud.settings");
  const titleId = useId();
  if (!open) return null;
  return (
    <Modal labelledBy={titleId} onClose={onClose} side testId="settings-sheet">
      <SheetHeader id={titleId} title={t("title")} onClose={onClose} />
      <div className="overflow-y-auto px-2 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <LazySettingsPanel headingLevel={3} onClose={onClose} />
      </div>
    </Modal>
  );
}

/**
 * Desktop gear button (bottom right, above the view controls) and its settings sheet; the `,` key
 * opens the sheet too (Esc closes it: world keys pause while an `aria-modal` dialog is open). `showButton`
 * hides the gear while the world is not explorable: in the intro the key still opens the sheet; an open
 * room is an `aria-modal` dialog, so the key waits until it closes. Closing returns focus to the gear.
 */
export function SettingsLauncher({ showButton = true }: { showButton?: boolean }) {
  const t = useTranslations("hud.settings");
  const [open, setOpen] = useHudToggle("settings");
  const button = useRef<HTMLButtonElement>(null);
  // Focus moves back before the sheet unmounts, so it never drops to the body.
  const close = () => {
    button.current?.focus({ preventScroll: true });
    setOpen(false);
  };
  return (
    <>
      {showButton && (
        <button
          ref={button}
          type="button"
          data-testid="settings-open"
          aria-label={t("open")}
          title={t("open")}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="glass glass-solid pointer-events-auto grid size-11 place-items-center rounded-full text-ink-2 transition hover:text-ink focus-visible:text-ink"
        >
          <GearIcon />
        </button>
      )}
      <SettingsSheet open={open} onClose={close} />
    </>
  );
}

function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

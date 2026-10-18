"use client";

import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import type { ExperienceData } from "@/experience/types";
import { useHQStore } from "@/store/useHQStore";
import { FLOOR_ACTIVE, FloorButtons } from "./FloorButtons";
import type { HudLayout } from "./layout";
import { useFloorLabel } from "./useFloorLabel";

/**
 * Corners HUD floor chip (top left on phones and tablets): the current floor's code and nav label (plus
 * the floor name on tablets) and a chevron. It opens the floor sheet, which replaces the elevator rail;
 * picking a floor rides there, closes the sheet and returns focus to the chip.
 */
export function FloorChip({ data, layout }: { data: ExperienceData; layout: HudLayout }) {
  const t = useTranslations("hud");
  const floorLabel = useFloorLabel();
  const floor = useHQStore((s) => s.floor);
  const [open, setOpen] = useState(false);
  const chip = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const label = floorLabel(floor);
  const name = data.floors[floor].name;

  // Focus moves back before the sheet unmounts, so it never drops to the body.
  const close = () => {
    chip.current?.focus({ preventScroll: true });
    setOpen(false);
  };

  return (
    <>
      <button
        ref={chip}
        type="button"
        data-testid="floor-chip"
        data-onboard="elevator"
        aria-haspopup="dialog"
        aria-expanded={open}
        // Tablets show the floor name too, so the name must start with all of it (not a parenthetical).
        aria-label={t(layout === "phone" ? "floorChip" : "floorChipFull", { floor, label, name })}
        onClick={() => setOpen(true)}
        className="glass glass-solid pointer-events-auto flex min-h-11 max-w-full items-center gap-2 rounded-full py-0.5 pr-3 pl-0.5 text-left"
      >
        <span className={`label grid size-10 shrink-0 place-items-center rounded-full border ${FLOOR_ACTIVE[floor]}`}>{floor}</span>
        {/* Keeps the visible text "L1 Home", not "L1Home", so the accessible name starts with it. */}{" "}
        <span className="text-sm leading-5 font-semibold whitespace-nowrap text-ink max-[359px]:hidden">{label}</span>
        {layout !== "phone" && (
          <>
            {" "}
            <span className="truncate text-sm leading-5 text-ink-3">{name}</span>
          </>
        )}
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ink-3">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <Modal labelledBy={titleId} onClose={close} width="sm" sheet testId="floor-sheet">
          <header className="flex items-center justify-between gap-3 border-b border-line px-5 pt-4 pb-3">
            <h2 id={titleId} className="text-base font-semibold text-ink">
              {t("elevator")}
            </h2>
            <button
              type="button"
              onClick={close}
              aria-label={t("pads.close")}
              className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-line-2 text-ink transition hover:border-ink-2 hover:bg-surface-2"
            >
              <span aria-hidden="true" className="text-xl leading-none">
                ×
              </span>
            </button>
          </header>
          <nav aria-label={t("elevator")} className="flex flex-col gap-1 overflow-y-auto p-2">
            <FloorButtons data={data} variant="sheet" onPick={close} />
          </nav>
        </Modal>
      )}
    </>
  );
}

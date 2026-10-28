"use client";

import { useTranslations } from "next-intl";
import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Modal } from "@/components/Modal";
import type { FloorId } from "@/content/schema";
import type { ExperienceData } from "@/experience/types";
import type { PickerRequest } from "@/experience/nav/pads";
import { consoleOptions, floorOptions, nextIndex, yearOptions, type PickerOption } from "./picker";

interface PickerListProps {
  title: string;
  hint: string;
  options: PickerOption[];
  onPick: (id: string) => void;
  onClose: () => void;
  padlock: ReactNode;
  dot: (tone: "pink" | "green") => ReactNode;
}

/**
 * The one picker every floor pad uses: a titled list on the shared Modal (focus trap, Esc, backdrop),
 * a bottom sheet on phones. The current option is marked and focused first; arrows move (wrapping),
 * Home and End jump, Enter or a click picks.
 */
function PickerList({ title, hint, options, onPick, onClose, padlock, dot }: PickerListProps) {
  const t = useTranslations("hud.pads");
  const titleId = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const index = buttons.current.findIndex((b) => b === document.activeElement);
    const next = nextIndex(Math.max(0, index), event.key, options.length);
    if (next === null) return;
    event.preventDefault();
    buttons.current[next]?.focus();
  };
  return (
    <Modal labelledBy={titleId} onClose={onClose} width="sm" sheet testId="pad-picker">
      <header className="flex items-start justify-between gap-3 border-b border-line px-5 pt-4 pb-3">
        <div className="min-w-0">
          <h2 id={titleId} className="text-base font-semibold text-ink">
            {title}
          </h2>
          <p className="mt-0.5 text-[13px] leading-5 text-ink-3">{hint}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("close")}
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-line-2 text-ink transition hover:border-ink-2 hover:bg-surface-2"
        >
          <span aria-hidden="true" className="text-xl leading-none">
            ×
          </span>
        </button>
      </header>
      <ul className="flex flex-col gap-1 overflow-y-auto p-2" onKeyDown={onKeyDown}>
        {options.map((o, i) => (
          <li key={o.id}>
            <button
              ref={(node) => {
                buttons.current[i] = node;
              }}
              type="button"
              onClick={o.locked ? undefined : () => onPick(o.id)}
              aria-disabled={o.locked ? "true" : undefined}
              data-locked={o.locked ? "" : undefined}
              aria-current={o.current ? "true" : undefined}
              data-autofocus={o.current ? "" : undefined}
              data-option={o.id}
              className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition outline-none focus-visible:ring-2 focus-visible:ring-cyan ${
                o.current ? "bg-white/[0.06]" : "hover:bg-white/[0.04]"
              }`}
            >
              {o.thumb && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={o.thumb} alt="" width={96} height={54} loading="lazy" decoding="async" className="h-[54px] w-24 shrink-0 rounded-md border border-line object-cover" />
              )}
              {o.locked && padlock}
              {o.tone && dot(o.tone)}
              <span className="min-w-0 flex-1">
                {o.eyebrow && <span className="label block truncate text-ink-3">{o.eyebrow}</span>}
                <span className="block text-sm font-semibold text-ink">{o.title}</span>
                <span className="block truncate text-[13px] leading-5 text-ink-2">{o.detail}</span>
              </span>
              {o.current && <span className="label shrink-0 text-cyan">{t("here")}</span>}
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

export type PickerSheetProps = {
  data: ExperienceData;
  picker: PickerRequest;
  floor: FloorId;
  coarse: boolean;
  b1Unlocked: boolean;
  /** Public floors seen (B1's lock hint) and how many there are. */
  seen: number;
  total: number;
  close: () => void;
  floorLabel: (id: FloorId) => string;
  /** A floor's one-line description (public floors from `hud.pads.floorDesc`, B1 from `engine.desc`). */
  floorDesc: (id: FloorId) => string;
  /** Rides to a floor, beams to a year, or goes back to the elevator (the main path's intents and pad ids). */
  onPick: (kind: PickerRequest["kind"], id: string) => void;
  /**
   * Pieces the main path already holds (the padlock icon, the accent dot), passed in so this chunk shares no module with
   * the main path that Turbopack would otherwise split out of its hoisted scope.
   */
  padlock: ReactNode;
  dot: (tone: "pink" | "green") => ReactNode;
};

/**
 * The pad picker sheet (a lazy chunk, `pickerChunk.ts`, owner decision 2026-10-28): the floor list for the elevator call
 * pad, the year list for the L2 teleporters, and the L2 time console (every year plus Back to elevator).
 */
export function PickerSheet({ data, picker, floor, coarse, b1Unlocked, seen, total, close, floorLabel, floorDesc, onPick, padlock, dot }: PickerSheetProps) {
  const t = useTranslations("hud");
  const tEngine = useTranslations("engine");
  const pick = (id: string) => onPick(picker.kind, id);
  const shared = { onClose: close, onPick: pick, padlock, dot };
  if (picker.kind === "floor") {
    return (
      <PickerList
        title={t("pads.floorTitle")}
        hint={t(coarse ? "pads.floorHintTouch" : "pads.floorHint")}
        options={floorOptions(floor, floorLabel, floorDesc, b1Unlocked, { title: tEngine("lockedTitle"), detail: tEngine("locked", { seen, total }) })}
        {...shared}
      />
    );
  }
  if (picker.kind === "console") {
    return (
      <PickerList
        title={t("pads.consoleTitle")}
        hint={t(coarse ? "pads.consoleHintTouch" : "pads.consoleHint")}
        options={consoleOptions(data.career, (count) => t("career.rooms", { count }), t("career.prologue"), { title: t("pads.back"), detail: t("pads.backDetail") })}
        {...shared}
      />
    );
  }
  return (
    <PickerList
      title={t("pads.yearTitle")}
      hint={t(coarse ? "pads.yearHintTouch" : "pads.yearHint")}
      options={yearOptions(data.career, picker.from, (count) => t("career.rooms", { count }), t("career.prologue"))}
      {...shared}
    />
  );
}

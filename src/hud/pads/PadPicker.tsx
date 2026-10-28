"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import { AccentDot } from "@/components/AccentDot";
import { Modal } from "@/components/Modal";
import type { FloorId } from "@/content/schema";
import { floorProgress, PUBLIC_FLOOR_COUNT } from "@/experience/b1";
import { intents } from "@/experience/input/intents";
import { elevatorPadId, teleportPadId } from "@/experience/nav/pads";
import type { ExperienceData } from "@/experience/types";
import { isPublicFloor } from "@/lib/floors";
import { useHQStore } from "@/store/useHQStore";
import { Padlock } from "../FloorButtons";
import { useFloorLabel } from "../useFloorLabel";
import { BACK_TO_ELEVATOR, consoleOptions, floorOptions, nextIndex, yearOptions, type PickerOption } from "./picker";

/** Keyboard focus returns to the 3D world (where the rover's keys live) once a picker closes. */
function restoreWorldFocus() {
  requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-testid='hq-world']")?.focus({ preventScroll: true }));
}

interface PickerListProps {
  title: string;
  hint: string;
  options: PickerOption[];
  onPick: (id: string) => void;
  onClose: () => void;
}

/**
 * The one picker every floor pad uses: a titled list on the shared Modal (focus trap, Esc, backdrop),
 * a bottom sheet on phones. The current option is marked and focused first; arrows move (wrapping),
 * Home and End jump, Enter or a click picks.
 */
function PickerList({ title, hint, options, onPick, onClose }: PickerListProps) {
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
              {o.locked && <Padlock className="text-ink-3" />}
              {o.tone && <AccentDot tone={o.tone} size="md" className="shrink-0" />}
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

/**
 * Floor pad pickers (owner request): the floor list for the elevator call pad, the year list for the
 * L2 teleporters, and the L2 time console (every year plus Back to elevator, F3). Opened through `store.picker` (the Director, or a click on a pad); a floor rides the
 * elevator with the same intent as the right-side panel, a year beams the rover to that plaza's pad.
 */
export function PadPicker({ data }: { data: ExperienceData }) {
  const t = useTranslations("hud");
  const tEngine = useTranslations("engine");
  const floorLabel = useFloorLabel();
  const picker = useHQStore((s) => s.picker);
  const exploring = useHQStore((s) => s.phase === "explore");
  const floor = useHQStore((s) => s.floor);
  const coarse = useHQStore((s) => s.device.coarse);
  const b1Unlocked = useHQStore((s) => s.b1Unlocked);
  const seen = useHQStore((s) => floorProgress(s.floorsSeen).seen);
  const closePicker = useHQStore((s) => s.closePicker);

  // A ride, a room or the hologram view takes over: the picker goes away with it.
  useEffect(() => {
    if (picker && !exploring) closePicker();
  }, [picker, exploring, closePicker]);

  if (!picker || !exploring) return null;
  const close = () => {
    closePicker();
    restoreWorldFocus();
  };
  if (picker.kind === "floor") {
    return (
      <PickerList
        title={t("pads.floorTitle")}
        hint={t(coarse ? "pads.floorHintTouch" : "pads.floorHint")}
        options={floorOptions(floor, floorLabel, (id) => (isPublicFloor(id) ? t(`pads.floorDesc.${id}`) : tEngine("desc")), b1Unlocked, {
          title: tEngine("lockedTitle"),
          detail: tEngine("locked", { seen, total: PUBLIC_FLOOR_COUNT }),
        })}
        onClose={close}
        onPick={(id) => {
          if (id === "B1" && !b1Unlocked) return;
          close();
          if (id !== floor) intents.emit({ type: "elevator", to: id as FloorId });
        }}
      />
    );
  }
  if (picker.kind === "console") {
    return (
      <PickerList
        title={t("pads.consoleTitle")}
        hint={t(coarse ? "pads.consoleHintTouch" : "pads.consoleHint")}
        options={consoleOptions(data.career, (count) => t("career.rooms", { count }), t("career.prologue"), { title: t("pads.back"), detail: t("pads.backDetail") })}
        onClose={close}
        onPick={(id) => {
          close();
          intents.emit({ type: "teleport", pad: id === BACK_TO_ELEVATOR ? elevatorPadId("L2") : teleportPadId(Number(id)) });
        }}
      />
    );
  }
  const from = picker.from;
  return (
    <PickerList
      title={t("pads.yearTitle")}
      hint={t(coarse ? "pads.yearHintTouch" : "pads.yearHint")}
      options={yearOptions(data.career, from, (count) => t("career.rooms", { count }), t("career.prologue"))}
      onClose={close}
      onPick={(id) => {
        close();
        if (Number(id) !== from) intents.emit({ type: "teleport", pad: teleportPadId(Number(id)) });
      }}
    />
  );
}

/** Reduced motion: a teleport is an instant fade cut, like the elevator ride (`CutFade` in Hud.tsx). */
export function BeamFade() {
  const cut = useHQStore((s) => s.reducedMotion && s.beam !== null);
  return <div aria-hidden="true" data-testid="beam-fade" className={`pointer-events-none absolute inset-0 bg-void ${cut ? "opacity-100" : "opacity-0"}`} />;
}

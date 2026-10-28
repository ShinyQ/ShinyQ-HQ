"use client";

import { useTranslations } from "next-intl";
import { createElement, Suspense, useEffect, useReducer } from "react";
import { AccentDot } from "@/components/AccentDot";
import type { FloorId } from "@/content/schema";
import { floorProgress, PUBLIC_FLOOR_COUNT } from "@/experience/b1";
import { intents } from "@/experience/input/intents";
import { elevatorPadId, teleportPadId, type PickerRequest } from "@/experience/nav/pads";
import type { ExperienceData } from "@/experience/types";
import { isPublicFloor } from "@/lib/floors";
import { useHQStore } from "@/store/useHQStore";
import { Padlock } from "../FloorButtons";
import { useFloorLabel } from "../useFloorLabel";
import { ChunkFailed } from "../ChunkFailed";
import { lazyFromChunk } from "../lazyFromChunk";
import { loadPicker } from "./pickerChunk";
import type { PickerSheetProps } from "./PickerSheet";

/** Keyboard focus returns to the 3D world (where the rover's keys live) once a picker closes. */
function restoreWorldFocus() {
  requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-testid='hq-world']")?.focus({ preventScroll: true }));
}

type LoadProps = PickerSheetProps & { onRetry: () => void };

/** A failed sheet chunk: the load note and Retry in the picker's place. */
function PickerFailed({ onRetry }: LoadProps) {
  return (
    <div className="glass glass-solid pointer-events-auto absolute inset-x-3 bottom-3 py-3">
      <ChunkFailed onRetry={onRetry} testId="picker-failed" />
    </div>
  );
}

const lazySheet = lazyFromChunk<LoadProps>(
  () =>
    loadPicker().then((mod) => {
      if (!mod) throw new Error("picker sheet chunk");
      return mod.PickerSheet;
    }),
  PickerFailed,
);

function LazyPickerSheet(props: LoadProps) {
  return createElement(lazySheet(), props);
}

/**
 * Floor pad pickers (owner request): the floor list for the elevator call pad, the year list for the
 * L2 teleporters, and the L2 time console (every year plus Back to elevator, F3). Opened through `store.picker` (the
 * Director, or a click on a pad); a floor rides the elevator with the same intent as the right-side panel, a year beams
 * the rover to that plaza's pad. The sheet itself is a lazy chunk (`PickerSheet`, owner decision 2026-10-28), loaded
 * when a picker first opens, so only this wiring rides the first-frame 3D path.
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
  const [, retry] = useReducer((n: number) => n + 1, 0);

  // A ride, a room or the hologram view takes over: the picker goes away with it.
  useEffect(() => {
    if (picker && !exploring) closePicker();
  }, [picker, exploring, closePicker]);

  if (!picker || !exploring) return null;
  const close = () => {
    closePicker();
    restoreWorldFocus();
  };
  const onPick = (kind: PickerRequest["kind"], id: string) => {
    if (kind === "floor") {
      if (id === "B1" && !b1Unlocked) return;
      close();
      if (id !== floor) intents.emit({ type: "elevator", to: id as FloorId });
      return;
    }
    close();
    // "elevator" is the console's Back to elevator row (`BACK_TO_ELEVATOR` in picker.ts).
    if (id === "elevator") intents.emit({ type: "teleport", pad: elevatorPadId("L2") });
    else if (kind === "console" || Number(id) !== (picker.kind === "year" ? picker.from : NaN)) intents.emit({ type: "teleport", pad: teleportPadId(Number(id)) });
  };
  return (
    <Suspense fallback={null}>
      <LazyPickerSheet
        data={data}
        picker={picker}
        floor={floor}
        coarse={coarse}
        b1Unlocked={b1Unlocked}
        seen={seen}
        total={PUBLIC_FLOOR_COUNT}
        close={close}
        floorLabel={floorLabel}
        floorDesc={(id) => (isPublicFloor(id) ? t(`pads.floorDesc.${id}`) : tEngine("desc"))}
        onPick={onPick}
        padlock={<Padlock className="text-ink-3" />}
        dot={(tone) => <AccentDot tone={tone} size="md" className="shrink-0" />}
        onRetry={retry}
      />
    </Suspense>
  );
}

/** Reduced motion: a teleport is an instant fade cut, like the elevator ride (`CutFade` in Hud.tsx). */
export function BeamFade() {
  const cut = useHQStore((s) => s.reducedMotion && s.beam !== null);
  return <div aria-hidden="true" data-testid="beam-fade" className={`pointer-events-none absolute inset-0 bg-void ${cut ? "opacity-100" : "opacity-0"}`} />;
}

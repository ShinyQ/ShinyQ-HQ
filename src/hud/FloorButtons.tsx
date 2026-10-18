"use client";

import { useTranslations } from "next-intl";
import type { FloorId } from "@/content/schema";
import { floorProgress, PUBLIC_FLOOR_COUNT } from "@/experience/b1";
import { floorChunks } from "@/experience/floors/floorChunks";
import { intents } from "@/experience/input/intents";
import type { ExperienceData } from "@/experience/types";
import { useHQStore } from "@/store/useHQStore";
import { floorRows } from "./floorRows";
import { useFloorLabel } from "./useFloorLabel";

/** Lit code circle of the current floor, in the floor's accent. */
export const FLOOR_ACTIVE: Record<FloorId, string> = {
  B1: "border-amber bg-amber/15 text-amber",
  L1: "border-green bg-green/15 text-green",
  L2: "border-amber bg-amber/15 text-amber",
  L3: "border-violet bg-violet/15 text-violet",
  L4: "border-white bg-white/15 text-white",
  RF: "border-blue bg-blue/15 text-blue",
};

export type FloorButtonsVariant = "rail" | "rail-compact" | "rail-codes" | "sheet";

const BUTTON: Record<FloorButtonsVariant, (current: boolean) => string> = {
  "rail-compact": () => "group flex min-h-11 w-[52px] flex-col items-center justify-center gap-0.5 rounded-2xl py-0.5",
  "rail-codes": () => "group grid size-11 place-items-center rounded-full",
  rail: (current) => `group flex min-h-11 items-center gap-2 rounded-full py-0.5 pr-3.5 pl-0.5 text-left transition ${current ? "bg-white/[0.06]" : "hover:bg-white/[0.04]"}`,
  sheet: (current) =>
    `group flex min-h-[52px] w-full items-center gap-3 rounded-xl px-3 py-1.5 text-left transition outline-none focus-visible:ring-2 focus-visible:ring-cyan ${
      current ? "bg-white/[0.06]" : "hover:bg-white/[0.04]"
    }`,
};

/** The padlock of the locked B1 row (decorative; the row's name carries the hint). */
export function Padlock({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

/**
 * The elevator's floor buttons (RF to L1, then B1: locked until all five floors are reached), shared by the right-edge rail and the Corners floor sheet. Every
 * button names its floor with the Page View nav label (L3 Work), prefetches the floor chunk on hover or
 * focus and emits an elevator intent like every other floor control. Variants: `rail` (a pill with the
 * label), `rail-compact` (phones: the code over a short label in a 52 px column), `rail-codes` (code-only
 * circles while a room covers the right edge) and `sheet` (full-width rows with the floor name).
 */
export function FloorButtons({ data, variant, onPick }: { data: ExperienceData; variant: FloorButtonsVariant; onPick?: () => void }) {
  const t = useTranslations("hud");
  const tEngine = useTranslations("engine");
  const floorLabel = useFloorLabel();
  const floor = useHQStore((s) => s.floor);
  const target = useHQStore((s) => s.ride?.to ?? null);
  const b1Unlocked = useHQStore((s) => s.b1Unlocked);
  const seen = useHQStore((s) => floorProgress(s.floorsSeen).seen);
  const pulse = useHQStore((s) => s.b1Moment && !s.reducedMotion);
  const compact = variant === "rail-compact";
  const sheet = variant === "sheet";
  const hint = tEngine("locked", { seen, total: PUBLIC_FLOOR_COUNT });
  return floorRows(b1Unlocked).map(({ id, locked }) => {
    if (locked) {
      // A locked row does nothing: no click, no hover or focus prefetch of the B1 chunk.
      return (
        <button
          key={id}
          type="button"
          aria-disabled="true"
          aria-label={tEngine("lockedName", { floor: id, seen, total: PUBLIC_FLOOR_COUNT })}
          title={hint}
          data-floor={id}
          data-locked=""
          className={BUTTON[variant](false)}
        >
          <span className={`label grid shrink-0 place-items-center rounded-full border border-glass-border text-ink-3 ${compact ? "size-8" : "size-10"}`}>{id}</span>
          {variant !== "rail-codes" && " "}
          {compact && <Padlock className="text-ink-3" />}
          {(variant === "rail" || sheet) && (
            <span aria-hidden="true" data-testid="elevator-floor-label" className={`inline-flex min-w-0 items-center gap-1.5 text-[13px] leading-5 text-ink-3 ${sheet ? "flex-1" : "whitespace-nowrap"}`}>
              <Padlock />
              <span className="truncate">{hint}</span>
            </span>
          )}
        </button>
      );
    }
    const current = id === floor;
    const pending = id === target;
    const label = floorLabel(id);
    const name = data.floors[id].name;
    const tone = current
      ? `${FLOOR_ACTIVE[id]} shadow-[0_0_14px_currentColor]`
      : pending
        ? "animate-pulse border-cyan text-cyan motion-reduce:animate-none"
        : id === "B1" && pulse
          ? "animate-pulse border-amber text-amber motion-reduce:animate-none"
          : "border-glass-border text-ink-2 group-hover:border-ink-3 group-hover:text-ink";
    return (
      <button
        key={id}
        type="button"
        onClick={() => {
          intents.emit({ type: "elevator", to: id });
          onPick?.();
        }}
        onPointerEnter={() => floorChunks.prefetch(id)}
        onFocus={() => floorChunks.prefetch(id)}
        // Sheet rows show the floor name too, so their name starts with all of the visible text (label in name).
        aria-label={t(sheet ? "goToFloorFull" : "goToFloor", { floor: id, label, name })}
        aria-current={current ? "true" : undefined}
        data-autofocus={sheet && current ? "" : undefined}
        data-floor={id}
        className={BUTTON[variant](current)}
      >
        <span className={`label grid shrink-0 place-items-center rounded-full border transition ${compact ? "size-8" : "size-10"} ${tone}`}>{id}</span>
        {/* Collapsed by the flex layout; keeps the visible text "L3 Work", not "L3Work", for label-in-name checks. */}
        {variant !== "rail-codes" && " "}
        {sheet ? (
          <span aria-hidden="true" className="flex min-w-0 flex-1 flex-col">
            <span className={`text-sm leading-5 font-semibold ${current ? "text-ink" : "text-ink-2 group-hover:text-ink"}`}>{label}</span>{" "}
            <span className="truncate text-[13px] leading-5 text-ink-3">{name}</span>
          </span>
        ) : (
          variant !== "rail-codes" && (
            <span
              aria-hidden="true"
              data-testid="elevator-floor-label"
              className={
                compact
                  ? `max-w-full truncate text-[9px] leading-3 font-semibold tracking-[-0.02em] ${current ? "text-ink" : "text-ink-3"}`
                  : `text-sm leading-5 font-semibold whitespace-nowrap ${current ? "text-ink" : "text-ink-2 group-hover:text-ink"}`
              }
            >
              {label}
            </span>
          )
        )}
      </button>
    );
  });
}

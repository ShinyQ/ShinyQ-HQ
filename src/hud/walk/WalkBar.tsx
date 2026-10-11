"use client";

import { useTranslations } from "next-intl";
import { useRef, type PointerEvent } from "react";
import type { WalkController, WalkState } from "@/experience/missions/walk";

/** Where the walk HUD sits: under the top bar (phones, where the drawer is a bottom sheet) or at the bottom. */
export type WalkPlacement = "top" | "bottom" | "bottom-raised" | "dock";

const CARD: Record<WalkPlacement, string> = {
  top: "top-[68px] left-3 right-3",
  bottom: "bottom-4 left-1/2 w-[min(560px,calc(100%-2rem))] -translate-x-1/2",
  // Coarse pointers keep the joystick in the bottom-left corner.
  "bottom-raised": "bottom-[156px] left-1/2 w-[min(560px,calc(100%-2rem))] -translate-x-1/2",
  // Beside the side drawer (420 px on the right).
  dock: "bottom-4 left-4 w-[min(520px,calc(100%-460px))]",
};

const PILL: Record<WalkPlacement, string> = {
  top: "top-[68px] left-1/2 -translate-x-1/2",
  bottom: "bottom-4 left-1/2 -translate-x-1/2",
  "bottom-raised": "bottom-[156px] left-1/2 -translate-x-1/2",
  dock: "bottom-4 left-4",
};

/** The idle launcher sits above the hint bar, which stays visible while no walk runs. */
const LAUNCHER: Record<WalkPlacement, string> = {
  top: "top-[68px] left-1/2 -translate-x-1/2",
  bottom: "bottom-16 left-1/2 -translate-x-1/2",
  "bottom-raised": "bottom-[208px] left-1/2 -translate-x-1/2",
  dock: "bottom-4 left-4",
};

const SWIPE_PX = 48;

const btn =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-glass-border px-4 text-sm font-semibold text-ink transition hover:border-ink-3 disabled:cursor-not-allowed disabled:opacity-40";

export interface WalkBarProps {
  walk: WalkController;
  state: WalkState;
  placement: WalkPlacement;
  coarse: boolean;
  /** Label of the idle launcher pill (the walk's start label); no pill without it. */
  launcher?: string;
}

/**
 * Walk HUD (the mission HUD slot over the canvas): stop counter, title, Prev / Open / Next / End,
 * a filter and a progress line. Paused walks shrink to a "Resume walk" pill; finished walks show a
 * short summary; idle walks show a small launcher pill. A horizontal swipe on the card steps
 * through the walk (left is next).
 */
export function WalkBar({ walk, state, placement, coarse, launcher }: WalkBarProps) {
  const t = useTranslations("walk");
  const swipe = useRef<{ id: number; x: number } | null>(null);
  const { definition } = walk;
  const name = t(`${definition.id}.name`);

  if (state.status === "idle") {
    if (!launcher) return null;
    return (
      <div className={`pointer-events-auto absolute ${LAUNCHER[placement]}`} data-testid="walk-launcher">
        <button type="button" onClick={() => void walk.start()} className="glass glass-solid inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold text-ink">
          <span aria-hidden="true" className="text-amber">
            ▶
          </span>
          {launcher}
        </button>
      </div>
    );
  }

  if (state.status === "paused") {
    return (
      <div className={`pointer-events-auto absolute flex items-center gap-2 ${PILL[placement]}`} data-testid="walk-pill">
        <button type="button" onClick={() => void walk.resume()} className="glass glass-solid inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold text-ink">
          <span aria-hidden="true" className="text-amber">
            ▶
          </span>
          {t("resume")}
          <span className="label text-ink-3">{t("stopOf", { index: state.index + 1, total: state.total })}</span>
        </button>
        <button type="button" onClick={() => walk.end()} aria-label={t("end")} className="glass glass-solid grid size-11 place-items-center rounded-full text-ink-2 hover:text-ink">
          <span aria-hidden="true">✕</span>
        </button>
      </div>
    );
  }

  if (state.status === "done") {
    return (
      <section aria-label={name} className={`glass glass-solid pointer-events-auto absolute p-4 ${CARD[placement]}`} data-testid="walk-done">
        <p className="eyebrow text-amber">{name}</p>
        <p className="mt-1 text-base font-semibold text-ink">{t("done")}</p>
        <p className="text-sm text-ink-2">{t("doneBody", { count: state.visited.length, total: definition.stops.length })}</p>
        <div className="mt-3 flex gap-2">
          <button type="button" className={btn} onClick={() => void walk.start({ restart: true })}>
            {t("again")}
          </button>
          <button type="button" className={btn} onClick={() => walk.end()}>
            {t("close")}
          </button>
        </div>
      </section>
    );
  }

  const stop = state.stop;
  const last = state.index >= state.total - 1;
  const canOpen = Boolean(stop?.room || stop?.palette);
  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType === "mouse" || (e.target as HTMLElement).closest("button, select")) return;
    swipe.current = { id: e.pointerId, x: e.clientX };
  };
  const onPointerUp = (e: PointerEvent<HTMLElement>) => {
    const start = swipe.current;
    swipe.current = null;
    if (!start || start.id !== e.pointerId) return;
    const dx = e.clientX - start.x;
    if (Math.abs(dx) < SWIPE_PX) return;
    if (dx < 0) void walk.next();
    else void walk.prev();
  };
  const progress = state.total > 0 ? ((state.index + 1) / state.total) * 100 : 0;

  return (
    <section
      aria-label={name}
      className={`glass glass-solid pointer-events-auto absolute touch-pan-y p-3 md:p-4 ${CARD[placement]}`}
      data-testid="walk-bar"
      data-status={state.status}
      data-stop={stop?.id}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (swipe.current = null)}
    >
      <div className="flex items-center gap-2">
        <p className="eyebrow min-w-0 flex-1 truncate text-amber" data-testid="walk-counter">
          {[stop?.group, t("stopOf", { index: state.index + 1, total: state.total })].filter(Boolean).join(" · ")}
        </p>
        {definition.filters && definition.filters.length > 0 && (
          <label className="label flex items-center gap-1 text-ink-3">
            <span className="sr-only md:not-sr-only">{t("filter")}</span>
            <select
              value={state.filter ?? ""}
              onChange={(e) => void walk.setFilter(e.target.value || null)}
              className="min-h-9 max-w-32 rounded-full border border-glass-border bg-void px-2 text-xs text-ink-2"
              data-testid="walk-filter"
            >
              <option value="">{t("all")}</option>
              {definition.filters.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="button" onClick={() => walk.end()} aria-label={t("end")} title={t("end")} className="grid size-11 place-items-center rounded-full text-ink-2 hover:text-ink">
          <span aria-hidden="true">✕</span>
        </button>
      </div>
      <p className="truncate text-base leading-6 font-semibold text-ink" data-testid="walk-title" aria-live="polite">
        {stop?.title}
      </p>
      <p className="truncate text-[13px] leading-5 text-ink-2">
        {stop?.subtitle}
        <span className="label ml-2 text-ink-3">{state.status === "driving" ? t("driving") : t("here")}</span>
      </p>
      <div className="mt-2 h-0.5 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
        <div className="h-full bg-amber transition-[width]" style={{ width: `${progress}%` }} />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button type="button" className={btn} onClick={() => void walk.prev()} disabled={state.index === 0} aria-keyshortcuts="[">
          <span aria-hidden="true">‹</span>
          <span className={placement === "top" ? "sr-only" : undefined}>{t("prev")}</span>
        </button>
        <button type="button" className={`${btn} flex-1`} onClick={() => void walk.open()} disabled={!canOpen}>
          {t("open")}
        </button>
        <button type="button" className={`${btn} border-amber/60`} onClick={() => void walk.next()} aria-keyshortcuts="]">
          {last ? t("finish") : t("next")}
          <span aria-hidden="true">›</span>
        </button>
      </div>
      <p className="label mt-2 text-ink-3">
        {t("visited", { count: state.visited.length })} · {coarse ? t("swipe") : t("keys")}
      </p>
    </section>
  );
}

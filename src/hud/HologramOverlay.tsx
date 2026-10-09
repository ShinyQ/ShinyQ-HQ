"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { Locale, RoomId } from "@/content/schema";
import type { RoomView } from "@/content/room-views/types";
import { intents } from "@/experience/input/intents";
import { ACCENT_TEXT } from "@/lib/accent";
import { getHQStore, useHQStore } from "@/store/useHQStore";
import { MetricTiles } from "./drawer/RoomDrawer";
import { useRoomViews } from "./drawer/DrawerHost";

function subscribeResize(onChange: () => void) {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

const SWIPE_PX = 60;

/** Hero pods with a hologram, in Labs order (Software Wing first, then AI Wing). */
export function heroSequence(views: Record<string, RoomView>): RoomId[] {
  return Object.values(views)
    .filter((v) => v.hologram)
    .map((v) => v.id);
}

/** Opens the hologram of another hero pod, keeping the view (URL replace, no history entry). */
export function showHologram(room: RoomId) {
  const s = getHQStore().getState();
  s.openRoom(room, "architecture");
  s.openHologram();
}

/**
 * HTML side of the hologram view (appendix 02 section 7): title, floating result cards (right of
 * the diagram, or below it on portrait screens), prev/next hero pods and Esc back to the drawer.
 * The diagram itself is drawn in 3D by the L3 floor.
 */
export function HologramOverlay({ locale }: { locale: Locale }) {
  const t = useTranslations("drawer.hologram");
  const tDrawer = useTranslations("drawer");
  const phase = useHQStore((s) => s.phase);
  const activeRoom = useHQStore((s) => s.activeRoom);
  const views = useRoomViews(locale);
  const panel = useRef<HTMLDivElement>(null);
  const portrait = useSyncExternalStore(subscribeResize, () => window.innerHeight > window.innerWidth, () => false);
  const ready = views && views !== "error" ? views : null;
  const heroes = useMemo(() => (ready ? heroSequence(ready) : []), [ready]);
  const open = phase === "hologram" && Boolean(activeRoom);
  const view = open && ready && activeRoom ? ready[activeRoom] : undefined;
  const index = activeRoom ? heroes.indexOf(activeRoom) : -1;

  const step = (delta: number) => {
    if (heroes.length < 2 || index < 0) return;
    showHologram(heroes[(index + delta + heroes.length) % heroes.length]);
  };
  const stepRef = useRef(step);
  useEffect(() => {
    stepRef.current = step;
  });

  const shown = Boolean(view);
  // Only hero pods have a hologram (a hand-written ?view=architecture on another room falls back to the drawer).
  const noHologram = open && Boolean(view) && !view?.hologram;
  useEffect(() => {
    if (noHologram) getHQStore().getState().closeHologram();
  }, [noHologram]);
  useEffect(() => {
    if (!open) return;
    panel.current?.focus({ preventScroll: true });
    const offScrub = intents.on((intent) => {
      if (intent.type === "scrub" && Math.abs(intent.dx) > SWIPE_PX) stepRef.current(intent.dx < 0 ? 1 : -1);
    });
    // Window-level keys: focus may sit on the canvas or the body after the drawer unmounts.
    const onKey = (event: globalThis.KeyboardEvent) => {
      const other = document.querySelector("[role='dialog'][aria-modal='true']:not([data-testid='hologram'])");
      if (other || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const move = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
      if (event.key === "Escape") {
        event.preventDefault();
        getHQStore().getState().closeHologram();
      } else if (move) {
        event.preventDefault();
        stepRef.current(move);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      offScrub();
      window.removeEventListener("keydown", onKey);
    };
  }, [open, shown, activeRoom]);

  if (!open) return null;
  if (!view || !view.hologram) {
    // Room data still loading (or failed): keep a way back instead of an empty screen.
    return (
      <div ref={panel} role="dialog" aria-modal="true" aria-label={t("title")} tabIndex={-1} data-testid="hologram" className="pointer-events-none absolute inset-0 z-20 outline-none">
        <div role="status" className="glass pointer-events-auto absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-3 px-4 py-2 text-sm text-ink-2">
          {views === "error" ? tDrawer("unavailable") : tDrawer("loading")}
          <button type="button" onClick={() => getHQStore().getState().closeHologram()} className="link min-h-11">
            {t("back")}
          </button>
        </div>
      </div>
    );
  }

  const nav = "glass pointer-events-auto inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold text-ink transition hover:text-cyan";

  return (
    <div
      ref={panel}
      role="dialog"
      aria-modal="true"
      aria-label={t("label", { title: view.title })}
      tabIndex={-1}
      data-testid="hologram"
      data-room={view.id}
      className="pointer-events-none absolute inset-0 z-20 outline-none"
    >
      <div className="pointer-events-auto absolute top-3 left-3 max-w-[min(520px,calc(100vw-1.5rem))] md:top-4 md:left-4">
        <p className={`label ${ACCENT_TEXT[view.accent]}`}>
          {t("title")} · {view.code}
        </p>
        <h2 className="mt-1 text-[22px] leading-7 font-extrabold tracking-tight text-ink sm:text-[28px] sm:leading-8">{view.title}</h2>
        {view.subtitle && <p className="mt-1 hidden text-[15px] leading-6 text-ink-2 sm:block">{view.subtitle}</p>}
      </div>

      <section
        aria-label={t("results")}
        className={
          portrait
            ? "pointer-events-auto absolute inset-x-3 bottom-20 max-h-[34vh] overflow-y-auto"
            : "pointer-events-auto absolute top-24 right-4 bottom-24 w-[min(300px,30vw)] overflow-y-auto"
        }
        data-testid="hologram-results"
        tabIndex={0}
      >
        <div className="glass p-3">
          <MetricTiles metrics={view.metrics} single={!portrait} />
        </div>
      </section>

      <div className="absolute inset-x-0 bottom-4 flex flex-wrap items-center justify-center gap-2 px-3 pb-[env(safe-area-inset-bottom)]">
        <button type="button" onClick={() => step(-1)} className={nav} aria-label={t("prev")} disabled={heroes.length < 2}>
          <span aria-hidden="true">←</span>
          <span className="hidden sm:inline">{t("prev")}</span>
        </button>
        <button type="button" onClick={() => getHQStore().getState().closeHologram()} className={nav}>
          {t("back")}
          <kbd className="label rounded border border-glass-border px-1.5 py-0.5 text-ink-3">Esc</kbd>
        </button>
        <button type="button" onClick={() => step(1)} className={nav} aria-label={t("next")} disabled={heroes.length < 2}>
          <span className="hidden sm:inline">{t("next")}</span>
          <span aria-hidden="true">→</span>
        </button>
      </div>
      <p className="sr-only" aria-live="polite">
        {t("hint")}
      </p>
    </div>
  );
}

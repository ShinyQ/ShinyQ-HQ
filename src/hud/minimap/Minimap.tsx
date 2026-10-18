"use client";

import { useTranslations } from "next-intl";
import { createElement, forwardRef, Suspense, useEffect, useId, useLayoutEffect, useReducer, useRef, useSyncExternalStore, type ComponentProps } from "react";
import { Modal } from "@/components/Modal";
import type { ExperienceData, FloorLayouts } from "@/experience/types";
import { useHQStore } from "@/store/useHQStore";
import type { HudLayout } from "../layout";
import { ChunkFailed } from "../ChunkFailed";
import { lazyFromChunk } from "../lazyFromChunk";
import { SheetHeader } from "../menu/SheetHeader";
import { useHudToggle } from "../menu/useHudToggles";
import { useFloorLabel } from "../useFloorLabel";
import { MapLayers, useFloorMap } from "./MapLayers";
import { MINIMAP_RADIUS, windowBox } from "./model";
import type { MapOverview } from "./MapOverview";
import { minimapPref } from "./pref";

type OverviewProps = ComponentProps<typeof MapOverview> & { onRetry: () => void };

/** A failed overview chunk: the same dialog shell (Esc and close work) with a note and Retry. */
function OverviewFailed({ onClose, onRetry }: OverviewProps) {
  const t = useTranslations("hud");
  const titleId = useId();
  return (
    <Modal labelledBy={titleId} onClose={onClose} width="sm" testId="map-overview-failed">
      <SheetHeader id={titleId} title={t("map.open")} onClose={onClose} closeLabel={t("map.close")} />
      <div className="px-2 py-5">
        <ChunkFailed onRetry={onRetry} />
      </div>
    </Modal>
  );
}

/** Loaded when the overview first opens, so it stays out of the first-frame 3D path; a failed load is retried from its fallback. */
const lazyOverview = lazyFromChunk<OverviewProps>(() => import("./MapOverview").then((m) => m.MapOverview), OverviewFailed);

function LazyOverview(props: Omit<OverviewProps, "onRetry">) {
  const [, retry] = useReducer((n: number) => n + 1, 0);
  return <Suspense fallback={null}>{createElement(lazyOverview(), { ...props, onRetry: retry })}</Suspense>;
}

/** Phone 72 px, tablet 112 px, desktop 96 px (static classes for Tailwind). */
const SIZE: Record<HudLayout, string> = { phone: "size-[72px]", tablet: "size-28", desktop: "size-24" };

/**
 * Round corner minimap (HTML SVG over the canvas: no draw call, no frame loop): the floor around the
 * rover, north-up, refreshed by the store's 10 Hz rover mirror. It opens the full-floor overview,
 * which the `N` key and the menu's Map action open too (even with the minimap switched off).
 * `hidden` keeps the button away while a phone's room sheet covers it.
 */
export function Minimap({ data, layouts, size, hidden = false }: { data: ExperienceData; layouts: FloorLayouts; size: HudLayout; hidden?: boolean }) {
  const pref = useSyncExternalStore(minimapPref.subscribe, minimapPref.get, () => "on" as const);
  const blocked = useHQStore((s) => s.phase === "boot" || s.phase === "intro" || s.phase === "hologram");
  const [open, setOpen] = useHudToggle("map");
  const button = useRef<HTMLButtonElement>(null);

  // The last focused element while the overview is closed; a layout effect, so the listener is gone before the Modal moves focus in.
  const opener = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (open) return;
    opener.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    const track = (e: FocusEvent) => {
      opener.current = e.target instanceof HTMLElement ? e.target : null;
    };
    document.addEventListener("focusin", track);
    return () => document.removeEventListener("focusin", track);
  }, [open]);

  useEffect(() => {
    if (blocked && open) setOpen(false);
  }, [blocked, open, setOpen]);

  // Focus moves back before the overview unmounts (to the button, else to whatever opened it).
  const close = () => {
    (button.current ?? opener.current)?.focus({ preventScroll: true });
    setOpen(false);
  };

  return (
    <>
      {pref === "on" && !blocked && !hidden && <MinimapButton ref={button} layouts={layouts} size={size} open={open} onOpen={() => setOpen(true)} />}
      {open && !blocked && (
        <LazyOverview open onClose={close} data={data} layouts={layouts} />
      )}
    </>
  );
}

const MinimapButton = forwardRef<HTMLButtonElement, { layouts: FloorLayouts; size: HudLayout; open: boolean; onOpen: () => void }>(function MinimapButton({ layouts, size, open, onOpen }, ref) {
  const t = useTranslations("hud");
  const floorLabel = useFloorLabel();
  const map = useFloorMap(layouts);
  const rover = useHQStore((s) => s.rover);
  const clipId = `minimap-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const { floor } = map;
  return (
    <button
      ref={ref}
      type="button"
      data-testid="minimap"
      data-floor={floor}
      aria-label={t("map.label", { floor, name: floorLabel(floor) })}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={onOpen}
      className={`glass glass-solid pointer-events-auto block shrink-0 overflow-hidden rounded-full p-0 transition hover:border-line-2 motion-reduce:transition-none ${SIZE[size]}`}
    >
      <svg aria-hidden="true" viewBox={windowBox(rover, MINIMAP_RADIUS)} className="block size-full">
        <defs>
          <clipPath id={clipId}>
            <circle cx={rover.x} cy={rover.z} r={MINIMAP_RADIUS} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          <MapLayers map={map} roomRadius={2} arrowScale={1.6} />
        </g>
      </svg>
    </button>
  );
});

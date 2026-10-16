"use client";

import { useTranslations } from "next-intl";
import { forwardRef, useEffect, useId, useRef, useSyncExternalStore } from "react";
import type { ExperienceData, FloorLayouts } from "@/experience/types";
import { useHQStore } from "@/store/useHQStore";
import type { HudLayout } from "../layout";
import { useHudToggle } from "../menu/useHudToggles";
import { MapOverview } from "./MapOverview";
import { MapLayers, useFloorMap } from "./MapLayers";
import { MINIMAP_RADIUS, windowBox } from "./model";
import { minimapPref } from "./pref";

/** Phone 72 px, tablet 112 px, desktop 96 px (static classes for Tailwind). */
const SIZE: Record<HudLayout, string> = { phone: "size-[72px]", tablet: "size-28", desktop: "size-24" };

/**
 * Round corner minimap (HTML SVG over the canvas: no draw call, no frame loop): the floor around the
 * rover, north-up, refreshed by the store's 10 Hz rover mirror. It opens the full-floor overview,
 * which the `N` key and the menu's Map action toggle too (even with the minimap switched off).
 * `hidden` keeps the button away (a phone's room sheet) while the overview still opens.
 */
export function Minimap({ data, layouts, size, hidden = false }: { data: ExperienceData; layouts: FloorLayouts; size: HudLayout; hidden?: boolean }) {
  const pref = useSyncExternalStore(minimapPref.subscribe, minimapPref.get, () => "on" as const);
  const blocked = useHQStore((s) => s.phase === "boot" || s.phase === "intro" || s.phase === "hologram");
  const [open, setOpen] = useHudToggle("map");
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (blocked && open) setOpen(false);
  }, [blocked, open, setOpen]);

  // Focus moves back before the overview unmounts, so it never drops to the body.
  const close = () => {
    button.current?.focus({ preventScroll: true });
    setOpen(false);
  };

  return (
    <>
      {pref === "on" && !blocked && !hidden && <MinimapButton ref={button} layouts={layouts} size={size} open={open} onOpen={() => setOpen(true)} />}
      <MapOverview open={open && !blocked} onClose={close} data={data} layouts={layouts} />
    </>
  );
}

const MinimapButton = forwardRef<HTMLButtonElement, { layouts: FloorLayouts; size: HudLayout; open: boolean; onOpen: () => void }>(function MinimapButton({ layouts, size, open, onOpen }, ref) {
  const t = useTranslations("hud");
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
      aria-label={t("map.label", { floor, name: t(`floorLabel.${floor}`) })}
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
          <MapLayers map={map} roomRadius={1.4} />
        </g>
      </svg>
    </button>
  );
});

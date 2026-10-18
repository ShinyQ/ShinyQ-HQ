"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";
import { AccentDot } from "@/components/AccentDot";
import { Modal } from "@/components/Modal";
import { interactRuntime } from "@/experience/interact/runtime";
import { intents } from "@/experience/input/intents";
import type { ExperienceData, FloorLayouts } from "@/experience/types";
import { FLOOR_ACCENT } from "@/lib/accent";
import { SheetHeader } from "../menu/SheetHeader";
import { useFloorLabel } from "../useFloorLabel";
import { MapLayers, useFloorMap } from "./MapLayers";
import { floorBox } from "./model";

/**
 * Full-floor overview (the minimap, the `N` key or the menu's Map action): the whole floor with room
 * labels (decorative SVG) and, as its text alternative, a list of the floor's places. Picking a place
 * closes the overview and drives there through point-and-go, exactly like clicking it in the world.
 */
export function MapOverview({ open, onClose, layouts }: { open: boolean; onClose: () => void; data: ExperienceData; layouts: FloorLayouts }) {
  if (!open) return null;
  return <Overview onClose={onClose} layouts={layouts} />;
}

function Overview({ onClose, layouts }: { onClose: () => void; layouts: FloorLayouts }) {
  const t = useTranslations("hud");
  const floorLabel = useFloorLabel();
  const titleId = useId();
  const listId = useId();
  const map = useFloorMap(layouts);
  const { floor } = map;
  const accent = FLOOR_ACCENT[floor];

  const go = (id: string) => {
    const item = interactRuntime.items.find((i) => i.id === id);
    onClose();
    if (item) intents.emit({ type: "interact", item });
  };

  return (
    <Modal labelledBy={titleId} onClose={onClose} width="md" testId="map-overview">
      <SheetHeader id={titleId} title={t("map.title", { floor, name: floorLabel(floor) })} onClose={onClose} closeLabel={t("map.close")} />
      <div className="flex flex-col gap-4 overflow-y-auto px-4 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-5">
        <svg aria-hidden="true" viewBox={floorBox(map.view)} className="block h-auto max-h-[55dvh] w-full shrink-0" data-testid="map-overview-svg">
          <MapLayers map={map} labels roomRadius={1.1} arrowScale={1.2} />
        </svg>
        <section aria-labelledby={listId}>
          <h3 id={listId} className="label mb-2 text-ink-3">
            {t("map.rooms")}
          </h3>
          <ul className="grid gap-1 sm:grid-cols-2">
            {map.rooms.map((room) => (
              <li key={room.id}>
                <button
                  type="button"
                  data-testid="map-room"
                  data-room={room.room}
                  onClick={() => go(room.id)}
                  className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-ink transition hover:bg-surface-2 motion-reduce:transition-none"
                >
                  <AccentDot tone={room.visited ? "muted" : accent} />
                  <span className="min-w-0 truncate">{room.label}</span>
                  {room.visited && (
                    <>
                      {" "}
                      <span className="ml-auto shrink-0 text-xs text-ink-3">{t("map.visited")}</span>
                    </>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Modal>
  );
}

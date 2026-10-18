"use client";

import { useTranslations } from "next-intl";
import type { FloorId } from "@/content/schema";
import { isPublicFloor } from "@/lib/floors";

/** The short floor label (`hud.floorLabel`, "Home"); B1 reads its own 3D-only namespace (`engine.label`). */
export function useFloorLabel(): (floor: FloorId) => string {
  const t = useTranslations("hud");
  const tEngine = useTranslations("engine");
  return (floor) => (isPublicFloor(floor) ? t(`floorLabel.${floor}`) : tEngine("label"));
}

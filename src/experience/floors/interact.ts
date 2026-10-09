"use client";

import type { ThreeEvent } from "@react-three/fiber";
import type { RoomId } from "@/content/schema";
import { goToRoom } from "../missions/bridge";

/** Pointer handlers for an in-world room object: hover cursor, and click drives there and opens the room. */
export function roomHandlers(room: RoomId, setHover?: (hover: boolean) => void) {
  return {
    onClick: (e: ThreeEvent<MouseEvent>) => {
      // Ignore clicks that ended an orbit drag.
      if (e.delta > 6) return;
      e.stopPropagation();
      goToRoom(room);
    },
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      setHover?.(true);
      document.body.style.cursor = "pointer";
    },
    onPointerOut: () => {
      setHover?.(false);
      document.body.style.cursor = "";
    },
  };
}

/** `EN`, `ID` or `EN/ID` (appendix 01 section 5). */
export function languageBadge(languages: readonly string[]): string {
  return [...languages]
    .sort()
    .map((l) => l.toUpperCase())
    .join("/");
}

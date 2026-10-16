"use client";

import { useEffect, useState } from "react";
import { intents } from "@/experience/input/intents";

export type HudToggle = "map" | "settings";

/**
 * Open state of a HUD panel that a key toggles (`N` the map overview, `,` the settings): each
 * `{ type: "toggle", what }` intent flips it, so a second press closes. While a modal sheet is open
 * world keys pause, so Esc closes it instead.
 */
export function useHudToggle(what: HudToggle): [open: boolean, setOpen: (open: boolean) => void] {
  const [open, setOpen] = useState(false);
  useEffect(
    () =>
      intents.on((intent) => {
        if (intent.type === "toggle" && intent.what === what) setOpen((v) => !v);
      }),
    [what],
  );
  return [open, setOpen];
}

"use client";

import { useMemo } from "react";
import { CommandPalette, type CommandPaletteProps } from "./CommandPalette";
import type { HudAction } from "./hudActions";
import type { HudIndex } from "./index-data";
import type { PaletteActionId } from "./palette-types";
import { buildPaletteEntries } from "./search";

export interface PaletteHostProps extends Omit<CommandPaletteProps, "entries"> {
  index: HudIndex | null;
  actions: readonly PaletteActionId[];
  hudActions: readonly HudAction[];
}

/** The lazy palette chunk: builds the entries from the HUD index (search.ts lives here, not in the layout bundle). */
export function PaletteHost({ index, actions, hudActions, ...props }: PaletteHostProps) {
  const entries = useMemo(() => (index ? buildPaletteEntries(index, actions, hudActions) : []), [index, actions, hudActions]);
  return <CommandPalette {...props} entries={entries} />;
}

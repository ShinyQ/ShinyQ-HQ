/**
 * Settings registry (Round 8 I). A setting is data bound to an external store (get, set, subscribe), so
 * the store stays the source of truth and the panel persists nothing itself. Sibling features add one
 * file in `defs/` and one entry in `defs/index.ts`. Labels are next-intl keys under `hud.settings`.
 * Client-safe: no React, no `@/content/schema` values.
 */
export type SettingGroup = "general" | "display" | "sound";

export const SETTING_GROUPS: readonly SettingGroup[] = ["general", "display", "sound"];

export type SettingControl =
  | { kind: "toggle"; get: () => boolean; set: (on: boolean) => void }
  | { kind: "choice"; options: readonly { value: string; labelKey: string }[]; get: () => string; set: (value: string) => void }
  | { kind: "range"; min: number; max: number; step: number; get: () => number; set: (value: number) => void }
  /** A one-shot command shown as a button with the label; `closesPanel` closes the sheet before it runs. */
  | { kind: "action"; run: () => void; closesPanel?: boolean };

export interface SettingDef {
  /** kebab-case; the row gets `data-testid="setting-<id>"`. */
  id: string;
  group: SettingGroup;
  /** Ascending within the group. */
  order: number;
  /** Key under `hud.settings`, e.g. "dayNight.label". */
  labelKey: string;
  /** Optional one-line note under the label (key under `hud.settings`). */
  hintKey?: string;
  /** The setting's key, shown after the note as a `Kbd` chip on fine pointers only (owner decision 2026-10-28). */
  hintKbd?: string;
  control: SettingControl;
  subscribe: (listener: () => void) => () => void;
  /** Hides the row when it returns false; the panel re-renders when this setting's `subscribe` fires. */
  available?: () => boolean;
  /**
   * Checked once when the row mounts: true moves focus to the row's current value. A setting whose change
   * remounts the HUD (graphics quality) uses it, so the reopened sheet keeps the visitor's place.
   */
  takeFocus?: () => boolean;
}

export function defineSetting(def: SettingDef): SettingDef {
  return def;
}

export function settingsByGroup(defs: readonly SettingDef[]): { group: SettingGroup; items: SettingDef[] }[] {
  const seen = new Set<string>();
  for (const def of defs) {
    if (seen.has(def.id)) throw new Error(`Duplicate setting id: ${def.id}`);
    seen.add(def.id);
  }
  return SETTING_GROUPS.map((group) => ({
    group,
    items: defs.filter((d) => d.group === group && (d.available?.() ?? true)).sort((a, b) => a.order - b.order),
  })).filter((g) => g.items.length > 0);
}

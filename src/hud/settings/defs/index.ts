import type { SettingDef } from "../registry";
import { openLinks } from "./open-links";

/** Every setting the panel shows. Sibling features append their definition here (one import, one entry). */
export const SETTINGS: readonly SettingDef[] = [openLinks];

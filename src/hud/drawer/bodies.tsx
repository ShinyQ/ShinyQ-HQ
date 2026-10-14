import type { ComponentType } from "react";
import type { Locale } from "@/content/schema";
import type { RoomView } from "@/content/room-views/types";
import type { RoomKind } from "@/experience/missions/rooms";
import { HighlightsBody } from "./HighlightsBody";
import { OpsBody } from "./OpsBody";
import { ReactorBody } from "./ReactorBody";
import { ResearchBody } from "./ResearchBody";
import { RoofBody } from "./RoofBody";
import { VisitsBody } from "./VisitsBody";

export interface RoomBodyProps {
  view: RoomView;
  locale: Locale;
}

/**
 * Custom bodies for the drawer's single-pane variant, by room kind. Floors that need more than the
 * generic sections (metrics, sections, stack, gallery) register a component here, one line each.
 * Rooms without an entry use the generic renderer in RoomDrawer.
 */
export const ROOM_BODIES: Partial<Record<RoomKind, ComponentType<RoomBodyProps>>> = {
  highlights: HighlightsBody,
  ops: OpsBody,
  reactor: ReactorBody,
  research: ResearchBody,
  roof: RoofBody,
  visits: VisitsBody,
};

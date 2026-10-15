import { lazy, type ComponentType } from "react";
import type { Locale } from "@/content/schema";
import type { RoomView } from "@/content/room-views/types";
import { floorChunks } from "@/experience/floors/floorChunks";
import type { RoomKind } from "@/experience/missions/rooms";
import { MetricTiles, Sections } from "./blocks";
import { HighlightsBody } from "./HighlightsBody";
import { RoofBody } from "./RoofBody";
import { VisitsBody } from "./VisitsBody";

export interface RoomBodyProps {
  view: RoomView;
  locale: Locale;
}

/** The generic sections, shown if a floor chunk ever fails to load (never a crash of the HUD). */
function SectionsBody({ view }: RoomBodyProps) {
  return (
    <div className="space-y-5">
      {view.metrics.length > 0 && <MetricTiles metrics={view.metrics} fluid />}
      <Sections sections={view.sections} />
    </div>
  );
}

/** A body that ships in a floor chunk (Round 7 B); usually already loaded by the idle prefetch. */
function chunkBody(load: () => Promise<ComponentType<RoomBodyProps>>) {
  return lazy<ComponentType<RoomBodyProps>>(() => load().then((Body) => ({ default: Body }), () => ({ default: SectionsBody })));
}

const OpsBody = chunkBody(() => floorChunks.load("L3").then((m) => m.OpsBody));
const ReactorBody = chunkBody(() => floorChunks.load("L3").then((m) => m.ReactorBody));
const ResearchBody = chunkBody(() => floorChunks.load("L4").then((m) => m.ResearchBody));
const TopicsBody = chunkBody(() => floorChunks.load("L4").then((m) => m.TopicsBody));

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
  topics: TopicsBody,
  visits: VisitsBody,
};

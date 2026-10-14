import { afterEach, describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { buildFloorLayouts } from "@/experience/config";
import { careerLayoutInput } from "@/experience/floors/career/layout";
import { highlightsInteractables } from "@/experience/floors/lobby/hallInteract";
import { HALL, HALL_LAYOUT } from "@/experience/floors/lobby/hallLayout";
import { HIGHLIGHT_STATIONS } from "@/experience/floors/lobby/stations";
import { libraryLayoutInput } from "@/experience/floors/library/model";
import { interactablesFor, registerExtraInteractables, type InteractData, type InteractLabels } from "@/experience/interact/registry";
import { roomTarget } from "@/experience/missions/host3d";
import { hintGoKey, hintObjectKey } from "@/hud/dialog/hintLines";
import { highlightsTarget, HIGHLIGHTS_ID, HIGHLIGHTS_ROOM } from "@/hud/dialog/onboarding";
import en from "../../messages/en.json";

const names = { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" };
const experience = buildExperienceData("en", names);
const layouts = buildFloorLayouts(experience.years.length, {
  labs: experience.labs.pods,
  career: careerLayoutInput(experience.career),
  library: libraryLayoutInput(experience.library),
});
const labels: InteractLabels = {
  elevator: en.hud.pads.floorTitle,
  returnPad: en.hud.interact.returnPad,
  teleporter: (year) => en.hud.interact.teleporter.replace("{year}", String(year)),
  console: en.hud.interact.console,
  kiosk: en.hud.launcher.askRover,
  board: (wing) => en.hud.interact.board.replace("{wing}", wing),
  archive: en.hud.interact.archive,
  rooms: en.hud.rooms,
  reactorRing: (ring) => en.labs.reactor.rings[ring],
  metrics: en.library.topics.monument.target,
};
const data: InteractData = { experience, labels };
const stationNames = {
  about: en.hud.rooms.highlightsAbout,
  projects: en.hud.rooms.highlightsProjects,
  experience: en.hud.rooms.highlightsExperience,
  contact: en.hud.rooms.highlightsContact,
};
const items = highlightsInteractables(HALL_LAYOUT, stationNames);
let dispose: (() => void) | null = null;
afterEach(() => {
  dispose?.();
  dispose = null;
});

describe("Highlights Hall point-and-go targets", () => {
  it("are four L1 stations that open their room from the door pad", () => {
    expect(items.map((i) => i.id)).toEqual(HIGHLIGHT_STATIONS.map((s) => `L1:station:highlights-${s}`));
    items.forEach((item, i) => {
      const s = HALL_LAYOUT.stations[i];
      expect(item).toMatchObject({ floor: "L1", kind: "station", label: stationNames[s.station], height: HALL.height[s.station], action: { type: "open-room", room: s.room } });
      expect(item.at).toEqual(roomTarget(undefined, s.room, layouts, experience.years));
      // The footprint covers the panel and the door pad, so pointing at either picks the station.
      expect(item.bounds.minX).toBeLessThanOrEqual(Math.min(s.rect.minX, s.pad.x));
      expect(item.bounds.maxX).toBeGreaterThanOrEqual(Math.max(s.rect.maxX, s.pad.x));
      expect(item.bounds.minZ).toBeLessThanOrEqual(Math.min(s.rect.minZ, s.pad.z));
      expect(item.bounds.maxZ).toBeGreaterThanOrEqual(Math.max(s.rect.maxZ, s.pad.z));
      expect(item.bounds.maxX).toBeLessThanOrEqual(layouts.L1.bounds.maxX);
      expect(item.bounds.maxZ).toBeLessThanOrEqual(layouts.L1.bounds.maxZ);
    });
  });

  it("join the L1 registry next to the built-ins, once each, until disposed", () => {
    dispose = registerExtraInteractables("L1", items);
    const l1 = interactablesFor("L1", layouts, data);
    for (const item of items) expect(l1.filter((i) => i.id === item.id)).toEqual([item]);
    expect(l1.map((i) => i.id)).toEqual(expect.arrayContaining(["L1:pad:elevator", "L1:station:profile", "L1:station:skills", "L1:kiosk:ask-rover"]));
    // The hall's doors never come back as built-in door targets (no duplicate target per station).
    expect(l1.some((i) => i.id.startsWith("L1:door:"))).toBe(false);
    dispose();
    dispose = null;
    expect(interactablesFor("L1", layouts, data).some((i) => i.id.startsWith("L1:station:highlights-"))).toBe(false);
  });

  it("feed the onboarding hall step and the hall's hint line (ids shared with src/hud/dialog)", () => {
    const about = items.find((i) => i.id === HIGHLIGHTS_ID)!;
    expect(about.action).toEqual({ type: "open-room", room: HIGHLIGHTS_ROOM });
    expect(highlightsTarget(items)).toEqual({ floor: "L1", at: about.at });
    expect(hintObjectKey(about)).toBe("highlights");
    expect(items.map(hintGoKey)).toEqual(items.map(() => "open"));
  });
});

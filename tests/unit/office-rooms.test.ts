import { describe, expect, it } from "vitest";
import { getContent } from "@/content/load";
import { buildFloorRoomViews, buildRoomViews } from "@/content/room-views";
import { buildRoomCatalog } from "@/experience/missions/rooms";
import { OFFICE_ROOMS } from "@/experience/floors/lobby/officeLayout";
import { structuralLabels } from "@/hud/index-data";
import { OFFICE_ACTIVITIES, OFFICE_AGENTS, OFFICE_STATES } from "@/lib/office/protocol";
import en from "../../messages/en.json";
import id from "../../messages/id.json";

describe("Agent Office rooms and copy", () => {
  it("lists one catalog room, L1:office, with no route of its own beyond the home anchor", () => {
    const catalog = buildRoomCatalog(getContent(), structuralLabels());
    const office = catalog.filter((r) => r.kind === "office");
    expect(office.map((r) => r.id)).toEqual(["L1:office"]);
    expect(office[0]).toMatchObject({ floor: "L1", path: "/#office", floorPath: "/#office", surpriseWeight: 0, title: { en: "Agent Office", id: "Agent Office" } });
  });

  for (const locale of ["en", "id"] as const) {
    it(`builds a drawer view for every office room, chained among themselves only (${locale})`, () => {
      const views = buildRoomViews(locale);
      for (const room of OFFICE_ROOMS) expect(views[room]?.kind, room).toBe("office");
      expect(views["L1:office"].office).toEqual({ panel: "summary" });
      expect(views["L1:office-github"].office).toEqual({ panel: "github" });
      for (let slot = 0; slot < 5; slot++) expect(views[`L1:office-desk-${slot + 1}`].office).toEqual({ panel: "desk", slot });
      expect(views["L1:office"].prev).toBeUndefined();
      expect(views["L1:office-desk-5"].next).toBeUndefined();
      expect(views["L1:visits"].next).toBeUndefined();
      expect(views["L1:office-desk-3"].title).toBe(locale === "en" ? "Desk 3" : "Meja 3");
      // A standing note per view: the drawer's generic fallback shows it if the office chunk fails to load.
      const m = locale === "en" ? en : id;
      expect(views["L1:office"].sections).toEqual([{ body: m.office["3d"].hooks }]);
      expect(views["L1:office-github"].sections).toEqual([{ body: m.office["3d"].githubNote }]);
      for (let slot = 0; slot < 5; slot++) expect(views[`L1:office-desk-${slot + 1}`].sections).toEqual([{ body: m.office.privacy }]);
    });

    it(`ships every office view in the L1 room data file, and in no other floor's (${locale})`, () => {
      const l1 = buildFloorRoomViews(locale, "L1");
      for (const room of OFFICE_ROOMS) expect(l1[room]?.sections?.length, room).toBe(1);
      for (const floor of ["L2", "L3", "L4", "RF", "B1"] as const) {
        expect(Object.values(buildFloorRoomViews(locale, floor)).some((view) => view.kind === "office"), floor).toBe(false);
      }
    });
  }

  it("has a label for every protocol state, activity and agent in both locales", () => {
    for (const m of [en, id]) {
      expect(Object.keys(m.office.state).sort()).toEqual([...OFFICE_STATES].sort());
      expect(Object.keys(m.office.activity).sort()).toEqual([...OFFICE_ACTIVITIES].sort());
      expect(Object.keys(m.office.agent).sort()).toEqual([...OFFICE_AGENTS].sort());
      expect(m.office.clientProject.length).toBeGreaterThan(0);
      expect(m.office.privacy.length).toBeGreaterThan(0);
    }
  });

  it("adds the office mission to the Rover menu: drive to the office, open the summary", () => {
    const mission = getContent().missions.find((m) => m.id === "office");
    expect(mission?.order).toBe(7);
    expect(mission?.steps).toEqual([
      { kind: "elevator", floor: "L1" },
      { kind: "drive", to: "L1:office" },
      { kind: "open", room: "L1:office" },
    ]);
    expect(mission?.label).toEqual({ en: "Watch the AI agents at work", id: "Lihat agen AI bekerja" });
  });
});

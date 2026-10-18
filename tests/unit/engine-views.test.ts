import { describe, expect, it } from "vitest";
import { getBuildFacts, getBuildStory, STATION_IDS } from "@/content/build-story";
import { buildEngineRoomViews, buildRoomViews } from "@/content/room-views";
import { LOCALES } from "@/content/schema";
import { DIAGRAM_PRESETS } from "@/components/diagram/layout";
import { dashboardTiles, prUrl, timelineRows } from "@/lib/build-page";

const story = getBuildStory();
const facts = getBuildFacts();

describe("B1 Engine Room drawers", () => {
  for (const locale of LOCALES) {
    it(`keeps the secret B1 views out of the shared rooms file every 3D visitor fetches (${locale})`, () => {
      expect(Object.keys(buildRoomViews(locale)).filter((k) => k.startsWith("B1:"))).toEqual([]);
    });
  }

  for (const locale of LOCALES) {
    const views = buildEngineRoomViews(locale);
    const view = (id: string) => views[`B1:${id}`]!;

    it(`gives every station a single-pane engine view on B1, chained in station order, linking its /build section (${locale})`, () => {
      for (const [i, id] of STATION_IDS.entries()) {
        expect(view(id)).toMatchObject({ floor: "B1", kind: "engine", variant: "single", page: `/build#${id}`, accent: "amber", title: story.stations[id].title[locale] });
        expect(view(id).engine?.station).toBe(id);
        expect(view(id).prev).toBe(i > 0 ? `B1:${STATION_IDS[i - 1]}` : undefined);
        expect(JSON.parse(JSON.stringify(view(id)))).toEqual(view(id));
      }
      expect(Object.keys(views).filter((k) => k.startsWith("B1:")).sort()).toEqual(STATION_IDS.map((id) => `B1:${id}`).sort());
    });

    it(`lays the site diagram out for the drawer width and names it (${locale})`, () => {
      const diagram = view("blueprint").engine?.diagram;
      expect(diagram?.layout.nodes).toHaveLength(story.stations.blueprint.architecture.nodes.length);
      expect(diagram?.layout.width).toBeLessThanOrEqual(DIAGRAM_PRESETS.phone.maxWidth);
      // The wide side drawer layout (owner 2026-10-18): three nodes per band, as wide as a 560 px drawer's figure, text of at least 12 px.
      const d = DIAGRAM_PRESETS.drawer;
      expect(diagram?.wide.nodes).toHaveLength(story.stations.blueprint.architecture.nodes.length);
      expect(diagram?.wide.width).toBeLessThanOrEqual(d.maxWidth);
      expect(diagram?.wide.width).toBeGreaterThan(diagram!.layout.width);
      expect(Math.min(d.kindSize, d.labelSize, d.subSize, d.edgeSize)).toBeGreaterThanOrEqual(12);
      expect(diagram?.label.length).toBeGreaterThan(20);
    });

    it(`lists every round with its measured pull requests, linking all but the unlinked ones (${locale})`, () => {
      const rows = timelineRows(story, facts);
      const rounds = view("timeline").engine?.rounds ?? [];
      expect(rounds.map((r) => r.id)).toEqual(rows.map((r) => r.round.id));
      rounds.forEach((r, i) => {
        expect(r.prs.map((p) => p.n)).toEqual(rows[i].prs);
        for (const p of r.prs) expect(p.href).toBe(rows[i].unlinked.includes(p.n) ? undefined : prUrl(p.n));
      });
    });

    it(`shows every gate, the plan excerpt and only the numbers the snapshot carries (${locale})`, () => {
      expect(view("gates").engine?.gates?.map((g) => g.id)).toEqual(story.stations.gates.gates.map((g) => g.id));
      expect(view("agents").engine?.excerpt?.href.endsWith(story.stations.agents.excerpt.path)).toBe(true);
      expect(view("dashboard").engine?.tiles?.map((t) => t.id)).toEqual(dashboardTiles(facts, 5).map((t) => t.id));
      expect(view("dashboard").engine?.tiles?.find((t) => t.id === "floors")?.value).toBe("5");
    });
  }
});

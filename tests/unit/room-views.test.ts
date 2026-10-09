import { describe, expect, it } from "vitest";
import { getContent, getPods } from "@/content/load";
import { buildRoomViews } from "@/content/room-views";
import { LOCALES } from "@/content/schema";
import { buildRoomCatalog } from "@/experience/missions/rooms";
import { structuralLabels } from "@/hud/index-data";

const catalog = buildRoomCatalog(getContent(), structuralLabels());

describe("room views (Glass Drawer content)", () => {
  for (const locale of LOCALES) {
    const views = buildRoomViews(locale);

    it(`has a view for every room in the catalog (${locale})`, () => {
      for (const room of catalog) {
        const view = views[room.id];
        expect(view, room.id).toBeDefined();
        expect(view.floor).toBe(room.floor);
        expect(view.kind).toBe(room.kind);
        expect(view.title.length).toBeGreaterThan(0);
      }
    });

    it(`uses tabs for pods and a single pane elsewhere (${locale})`, () => {
      for (const view of Object.values(views)) {
        expect(view.variant).toBe(view.kind === "pod" ? "tabs" : "single");
        if (view.variant === "tabs") expect(view.tabs).toEqual(expect.arrayContaining(["overview", "results", "stack"]));
      }
    });

    it(`marks hero pods for the hologram with their architecture (${locale})`, () => {
      for (const pod of getPods()) {
        const view = views[`L3:${pod.slug}`];
        expect(view.hologram).toBe(pod.tier === "hero");
        if (pod.tier === "hero") {
          expect(view.architecture?.nodes.length).toBeGreaterThanOrEqual(3);
          expect(view.tabs).toContain("architecture");
        }
        expect(view.metrics.length).toBe(pod.results.length);
        expect(view.metrics.every((m) => m.context)).toBe(true);
        expect(view.page).toBe(`/labs/${pod.slug}`);
      }
    });

    it(`chains prev/next within each wing (${locale})`, () => {
      for (const wing of ["software", "ai"] as const) {
        const pods = getPods(wing);
        expect(views[`L3:${pods[0].slug}`].prev).toBeUndefined();
        expect(views[`L3:${pods[0].slug}`].next).toBe(`L3:${pods[1].slug}`);
        expect(views[`L3:${pods[pods.length - 1].slug}`].next).toBeUndefined();
      }
    });

    it(`links pods and career rooms across floors (${locale})`, () => {
      const linked = Object.values(views).filter((v) => v.link);
      expect(linked.length).toBeGreaterThan(0);
      for (const view of linked) expect(views[view.link!.room], `${view.id} -> ${view.link!.room}`).toBeDefined();
    });

    it(`contains no em dashes (${locale})`, () => {
      expect(JSON.stringify(views)).not.toContain("\u2014");
    });
  }

  it("resolves the locale", () => {
    const pod = getPods().find((p) => p.tier === "hero")!;
    expect(buildRoomViews("en")[`L3:${pod.slug}`].title).toBe(pod.title.en);
    expect(buildRoomViews("id")[`L3:${pod.slug}`].title).toBe(pod.title.id);
  });
});

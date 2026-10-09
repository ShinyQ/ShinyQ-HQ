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

  it("lists each year's placings in its trophy case and the models in the Workshop annex", () => {
    const views = buildRoomViews("en");
    const trophies = views["L2:trophy-case-2022"].sections.find((s) => s.title === "Placings");
    expect(trophies?.items?.length).toBeGreaterThan(0);
    expect(trophies?.items?.every((i) => i.meta?.includes("2022"))).toBe(true);
    expect(views["L2:jenius-2024"].sections.some((s) => s.title === "Placings")).toBe(false);
    expect(views["L2:jenius-2024"].link?.room).toBe("L3:digital-banking-integrations");
    expect(views["L2:prologue-2016"].meta).toContain("Prologue");
    expect(views["L2:workshop"].sections.find((s) => s.title === "Hugging Face models")?.items).toHaveLength(3);
  });

  it("resolves the locale", () => {
    const pod = getPods().find((p) => p.tier === "hero")!;
    expect(buildRoomViews("en")[`L3:${pod.slug}`].title).toBe(pod.title.en);
    expect(buildRoomViews("id")[`L3:${pod.slug}`].title).toBe(pod.title.id);
  });

  it("adds tech logos to stacks and skill chips", () => {
    const views = buildRoomViews("en");
    const pod = views["L3:voice-ai-contact-center"];
    expect(pod.stack.find((s) => s.name === "Azure OpenAI Realtime")?.logo).toBe("/tech/azure-openai.svg");
    expect(pod.stack.every((s) => s.logo === undefined || s.logo.startsWith("/tech/"))).toBe(true);
    const skills = views["L1:skills"].sections;
    for (const section of skills) expect(section.chipLogos).toHaveLength(section.chips!.length);
    expect(skills.flatMap((s) => s.chipLogos).filter(Boolean).length).toBeGreaterThan(10);
  });

  it("ships pod galleries with localized alt text and thumbnails", () => {
    const pod = getPods().find((p) => p.assets.length > 0)!;
    const view = buildRoomViews("id")[`L3:${pod.slug}`];
    expect(view.gallery).toHaveLength(pod.assets.length);
    expect(view.gallery[0]).toMatchObject({ src: pod.assets[0].src, alt: pod.assets[0].alt.id, thumb: pod.assets[0].src.replace(/\.webp$/, ".thumb.webp") });
  });

  it("gives career rooms org logos, stack logos and galleries from their pods", () => {
    const views = buildRoomViews("en");
    const jenius = views["L2:jenius-2024"];
    expect(jenius.logo).toEqual({ src: "/logos/jenius.webp", alt: "Jenius logo" });
    expect(jenius.stack.find((s) => s.name === "Kafka")?.logo).toBe("/tech/kafka.svg");
    const shumi = views["L2:shumi-2019"];
    expect(shumi.gallery.length).toBeGreaterThan(1);
    expect(shumi.gallery[0].src).toMatch(/^\/media\/anime-figure-ecommerce\//);
    const metrodata = views["L2:metrodata-2026"];
    expect(metrodata.gallery.length).toBeGreaterThan(3);
    expect(new Set(metrodata.gallery.map((g) => g.src.split("/")[2])).size).toBe(metrodata.gallery.length);
  });

  it("adds logos to Library tags, model links and Roof channels", () => {
    const views = buildRoomViews("en");
    const posts = Object.values(views).filter((v) => v.kind === "post");
    const tagged = posts.flatMap((v) => v.sections.flatMap((s) => s.chipLogos ?? [])).filter(Boolean);
    expect(tagged).toContain("/tech/azure-openai.svg");
    const channels = views["RF:contact"].sections[0].items!;
    expect(channels.find((c) => c.title === "GitHub")?.logo).toBe("/tech/github.svg");
    expect(channels.find((c) => c.title === "LinkedIn")?.logo).toBeUndefined();
    const models = views["L4:publications"].sections[0].items!.filter((i) => i.logo);
    expect(models.every((i) => i.logo === "/tech/huggingface.webp")).toBe(true);
    expect(views["L4:research"].research!.profiles.every((p) => p.logo?.startsWith("/tech/"))).toBe(true);
  });
});

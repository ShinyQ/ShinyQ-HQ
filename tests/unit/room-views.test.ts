import { describe, expect, it } from "vitest";
import { getContact, getContent, getPods, getProfile, getPublicRepos, getSideProjects, getStats, getTimeline } from "@/content/load";
import { highlightEntries } from "@/content/highlights";
import { pickFeaturedPods } from "@/content/pageview";
import { buildRoomViews } from "@/content/room-views";
import { podView } from "@/content/room-views/labs";
import { LOCALES } from "@/content/schema";
import { headlineResults, podLiveLink } from "@/content/selectors";
import { repoRoom, repoSlug, sideProjectRoom } from "@/content/workshop";
import { buildRoomCatalog } from "@/experience/missions/rooms";
import { structuralLabels } from "@/hud/index-data";
import en from "../../messages/en.json";
import id from "../../messages/id.json";
import { makePod } from "../fixtures/minimal-content";

const catalog = buildRoomCatalog(getContent(), structuralLabels());

describe("room views (Glass Drawer content)", () => {
  it("resolves project labels before drawer, ASCII and hologram serialization without mutating the source", () => {
    const pod = structuredClone(getPods().find((p) => p.architecture)!);
    const graph = pod.architecture!;
    graph.nodes[0].label = { en: "Visitor browser", id: "Browser pengunjung" };
    graph.edges[0].label = { en: "request", id: "permintaan" };
    delete graph.edges[1].label;
    const before = structuredClone(graph);
    const en = podView(pod, "en").architecture!;
    const id = podView(pod, "id").architecture!;
    expect(en.nodes[0].label).toBe("Visitor browser");
    expect(id.nodes[0].label).toBe("Browser pengunjung");
    expect(id.edges[0].label).toBe("permintaan");
    expect(id.edges[1].label).toBeUndefined();
    expect(id.nodes.every((n) => typeof n.label === "string")).toBe(true);
    expect(id.edges.every((e) => e.label === undefined || typeof e.label === "string")).toBe(true);
    expect(graph).toEqual(before);
    expect(JSON.stringify(id)).not.toContain("[object Object]");
  });
  it("shows the location and timezone in the comms station header", () => {
    const profile = getProfile();
    for (const locale of LOCALES) expect(buildRoomViews(locale)["RF:contact"].meta).toEqual([profile.location[locale], profile.timezone]);
  });

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

    it(`shows How I run AI in production in the Ops Control Room (${locale})`, () => {
      const production = getContent().production;
      const view = views["L3:ops"];
      expect(view.kind).toBe("ops");
      expect(view.title).toBe(production.title[locale]);
      expect(view.page).toBe("/contact#production");
      expect(view.ops?.points.map((p) => p.lead)).toEqual(production.points.map((p) => p.lead[locale]));
      expect(view.ops?.intro).toBe(production.intro[locale]);
      expect(view.ops?.outro).toBe(production.outro[locale]);
      expect(view.ops?.excerpt?.code).toBe(production.alertExcerpt?.code);
      expect(view.metrics.map((m) => m.value)).toEqual(production.tiles.map((t) => t.value[locale]));
      expect(view.cards?.map((c) => c.room)).toEqual(production.caseStudies.map((slug) => `L3:${slug}`));
      for (const card of view.cards ?? []) expect(views[card.room]?.title).toBe(card.title);
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
        expect(view.metrics.map((m) => m.context)).toEqual(pod.results.map((r) => r.context?.[locale]));
        expect(view.page).toBe(`/labs/${pod.slug}`);
      }
    });

    it(`marks up to three headline metrics on every pod view (${locale})`, () => {
      for (const pod of getPods()) {
        const marked = views[`L3:${pod.slug}`].metrics.filter((m) => m.headline).map((m) => m.value);
        expect(marked).toEqual(headlineResults(pod.results).map((r) => r.value));
      }
    });

    it(`never ships confidence labels or provenance notes to the drawer (${locale})`, () => {
      const json = JSON.stringify(views);
      expect(json).not.toMatch(/"confidence"|self-reported|strongly-inferred|Self-reported in my CV|Saya laporkan dalam CV/i);
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
    const trophies = views["L2:trophy-case-2022"].sections.find((s) => s.title === en.drawer.rooms.placings);
    expect(trophies?.items?.length).toBeGreaterThan(0);
    expect(trophies?.items?.every((i) => i.meta?.includes("2022"))).toBe(true);
    expect(views["L2:jenius-2024"].sections.some((s) => s.title === en.drawer.rooms.placings)).toBe(false);
    expect(views["L2:jenius-2024"].link?.room).toBe("L3:digital-banking-integrations");
    expect(views["L2:prologue-2016"].meta).toContain("Prologue");
    expect(views["L2:workshop"].sections.find((s) => s.title === "Hugging Face models")?.items).toHaveLength(3);
  });

  it("gives every Workshop bench and skyline bar its own drawer, chained in order, with its external link", () => {
    for (const locale of LOCALES) {
      const views = buildRoomViews(locale);
      const m = locale === "en" ? en : id;
      const projects = getSideProjects();
      projects.forEach((p, i) => {
        const view = views[sideProjectRoom(p.id)];
        expect(view.kind).toBe("workshop");
        expect(view.title).toBe(p.title);
        expect(view.subtitle).toBe(p.summary[locale]);
        expect(view.stack.map((s) => s.name)).toEqual(p.stack);
        expect(view.external).toBe(p.url ?? p.repo);
        if (view.external) expect(view.externalLabel).toBe(p.url ? m.drawer.rooms.openProject : m.drawer.rooms.viewRepo);
        expect(view.prev).toBe(i > 0 ? sideProjectRoom(projects[i - 1].id) : undefined);
        expect(view.page).toBe("/journey#workshop");
      });
      const repos = getPublicRepos();
      repos.forEach((r, i) => {
        const view = views[repoRoom(repoSlug(r.name))];
        expect(view.title).toBe(r.name);
        expect(view.subtitle).toBe(r.description[locale]);
        expect(view.meta[0]).toBe(r.language);
        expect(view.meta[1]).toContain(String(r.stars));
        expect(view.external).toBe(r.url);
        expect(view.externalLabel).toBe(m.drawer.rooms.viewRepo);
        expect(view.next).toBe(i < repos.length - 1 ? repoRoom(repoSlug(repos[i + 1].name)) : undefined);
      });
    }
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

  it("tags career room badges with the entry type (neon line icon), and no other badges", () => {
    const views = buildRoomViews("en");
    for (const view of Object.values(views)) {
      for (const badge of view.badges) {
        if (view.kind === "career") expect(badge.type).toMatch(/^(job|freelance|education|award|milestone)$/);
        else expect(badge.type).toBeUndefined();
      }
    }
    expect(views["L2:jenius-2024"].badges).toEqual([{ label: "Employment", accent: "amber", type: "job" }]);
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

describe("pod live links (R4-J)", () => {
  it("gives a pod view the live site exactly when the pod has one", () => {
    for (const locale of LOCALES) {
      const views = buildRoomViews(locale);
      for (const pod of getPods()) expect(views[`L3:${pod.slug}`].live, pod.slug).toBe(pod.liveUrl);
    }
    expect(podView(makePod({ liveUrl: "https://mii-microsoft-ai.azurewebsites.net" }), "en").live).toBe("https://mii-microsoft-ai.azurewebsites.net");
    expect(podView(makePod(), "en").live).toBeUndefined();
  });
});

describe("Highlights Hall room views", () => {
  it("builds the Highlights Hall stations from the landing's selectors (both locales)", () => {
    for (const locale of LOCALES) {
      const views = buildRoomViews(locale);
      const about = views["L1:highlights-about"];
      expect(about.kind).toBe("highlights");
      expect(about.title).toBe(getProfile().name);
      expect(about.metrics.map((m) => m.value)).toEqual(getStats().slice(0, 4).map((s) => s.value));
      expect(about.link?.room).toBe("L1:profile");

      const projects = views["L1:highlights-projects"];
      expect(projects.cards?.map((c) => c.room)).toEqual(pickFeaturedPods(getPods()).map((p) => `L3:${p.slug}`));
      for (const card of projects.cards ?? []) expect(card.image?.thumb).toMatch(/\.thumb\.webp$/);
      // Live sites (R4-J) only through the guarded selector; never a hard-coded slug.
      expect(projects.cards?.map((c) => c.live)).toEqual(pickFeaturedPods(getPods()).map((p) => podLiveLink(p)?.href));

      const experience = views["L1:highlights-experience"];
      const { employment, freelance } = highlightEntries(getTimeline());
      expect(experience.cards?.map((c) => c.room)).toEqual([...employment, ...freelance].map((e) => `L2:${e.slug}`));
      expect(new Set(experience.cards?.map((c) => c.group)).size).toBe(2);
      expect(experience.cards?.every((c) => c.type === "job" || c.type === "freelance")).toBe(true);

      const contact = views["L1:highlights-contact"];
      const items = contact.sections.flatMap((s) => s.items ?? []);
      expect(items.some((i) => i.href === `mailto:${getContact().email}`)).toBe(true);
      expect(items.some((i) => i.href?.endsWith(".pdf"))).toBe(true);
      expect([about, projects, experience, contact].map((v) => v.next)).toEqual(["L1:highlights-projects", "L1:highlights-experience", "L1:highlights-contact", undefined]);
    }
  });
});

describe("Data and ML pod views (owner request 2026-10-14)", () => {
  it("adds a Code and research section with the GitHub repositories and the linked papers, thesis and models", () => {
    const pod = getPods().find((p) => p.slug === "university-sentiment-indobert")!;
    for (const locale of LOCALES) {
      const view = podView(pod, locale);
      const section = view.sections?.find((s) => s.title === (locale === "en" ? en : id).labs.codeResearch);
      expect(section, locale).toBeDefined();
      const items = section!.items!;
      expect(items.slice(0, 3).map((i) => i.href)).toEqual(pod.repos);
      expect(items.slice(0, 3).every((i) => i.external && i.logo === "/tech/github.svg")).toBe(true);
      expect(items.slice(3).map((i) => i.title)).toEqual(["Sentiboard: University Sentiment Dashboard Using IndoBERT", expect.stringContaining("IndoBERT"), "IndoBERT Sentiment Model for Indonesian University Reviews"]);
      expect(view.badges?.[0]).toEqual({ label: (locale === "en" ? en : id).common.wing.data, accent: "amber" });
    }
  });

  it("leaves pods without repositories or publications alone", () => {
    const view = podView(getPods().find((p) => p.slug === "digital-banking-integrations")!, "en");
    expect(view.sections?.some((s) => s.title === en.labs.codeResearch)).toBe(false);
  });

  it("chains data pods in their own wing order and builds every data pod view", () => {
    const views = buildRoomViews("en");
    const data = getPods("data");
    for (const pod of data) expect(views[`L3:${pod.slug}`], pod.slug).toBeDefined();
    const first = views[`L3:${data[0].slug}`]!;
    expect(first.next).toBe(`L3:${data[1].slug}`);
  });
});

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isPublicLiveUrl } from "@/content/live-links";
import { getPods } from "@/content/load";
import { pickFeaturedPods } from "@/content/pageview";
import { SiteContentSchema, type LocalizedText } from "@/content/schema";
import { LABS } from "@/experience/floors/labs/layout";
import en from "../../messages/en.json";
import idMessages from "../../messages/id.json";

const raw: unknown = JSON.parse(readFileSync(path.join(process.cwd(), "content", "site-content.json"), "utf8"));
const parsed = SiteContentSchema.safeParse(raw);

describe("content/site-content.json", () => {
  it("validates against the zod schema", () => {
    expect(parsed.success ? [] : parsed.error.issues).toEqual([]);
  });

  const content = parsed.success ? parsed.data : undefined;
  if (!content) return;
  const { pods } = content.floors.labs;
  const { entries } = content.floors.careerArchive;

  it("has an id translation for every localized text", () => {
    const missing: string[] = [];
    const walk = (value: unknown, at: string) => {
      if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${at}[${i}]`));
      else if (value && typeof value === "object") {
        const keys = Object.keys(value);
        if (keys.length === 2 && keys.includes("en") && keys.includes("id")) {
          const text = value as LocalizedText;
          if (!text.id.trim()) missing.push(at);
        } else for (const [k, v] of Object.entries(value)) walk(v, `${at}.${k}`);
      }
    };
    walk(content, "$");
    expect(missing).toEqual([]);
  });

  it("translates prose instead of copying English into id", () => {
    const copied: string[] = [];
    const walk = (value: unknown, at: string) => {
      if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${at}[${i}]`));
      else if (value && typeof value === "object") {
        const keys = Object.keys(value);
        if (keys.length === 2 && keys.includes("en") && keys.includes("id")) {
          const text = value as LocalizedText;
          // Titles of works (e.g. a post published in one language) may legitimately match.
          const isWorkTitle = /posts\[\d+\]\.title$/.test(at);
          if (!isWorkTitle && text.en === text.id && text.en.split(/\s+/).length > 6) copied.push(`${at}: ${text.en}`);
        } else for (const [k, v] of Object.entries(value)) walk(v, `${at}.${k}`);
      }
    };
    walk(content, "$");
    expect(copied).toEqual([]);
  });

  it("uses unique ids and slugs per collection, with id === slug", () => {
    for (const list of [pods, entries]) {
      expect(new Set(list.map((x) => x.id)).size).toBe(list.length);
      expect(new Set(list.map((x) => x.slug)).size).toBe(list.length);
      expect(list.filter((x) => x.id !== x.slug).map((x) => x.id)).toEqual([]);
    }
    for (const list of [content.certifications, content.awards, content.sideProjects, content.missions, content.stats]) {
      expect(new Set(list.map((x) => x.id)).size).toBe(list.length);
    }
  });

  it("resolves every podRef and timelineRef", () => {
    const podIds = new Set(pods.map((p) => p.id));
    const entryIds = new Set(entries.map((e) => e.id));
    expect(entries.filter((e) => e.podRef && !podIds.has(e.podRef)).map((e) => e.id)).toEqual([]);
    expect(pods.filter((p) => p.timelineRef && !entryIds.has(p.timelineRef)).map((p) => p.id)).toEqual([]);
  });

  it("has 3 Product Engineering and 4 AI Engineering hero pods (hologram view), at most 7 featured per wing, all docked on L3", () => {
    // AI has a fourth hero since the owner made the Full-Stack AI Application Template a key project (2026-10-16).
    const heroes = { software: 3, ai: 4 } as const;
    for (const wing of ["software", "ai"] as const) {
      expect(pods.filter((p) => p.wing === wing && p.tier === "hero")).toHaveLength(heroes[wing]);
      // 6 until MII Deck and MII Cowork joined the AI wing as featured pods (owner request 2026-10-16).
      expect(pods.filter((p) => p.wing === wing && p.tier === "featured").length).toBeLessThanOrEqual(7);
      expect(pods.filter((p) => p.wing === wing && p.tier !== "listed").length).toBeLessThanOrEqual(LABS.maxPerWing);
    }
    expect(pods.find((p) => p.slug === "ai-app-accelerator")?.tier).toBe("hero");
  });

  it("links exactly the two public MII Microsoft sites, never an internal app (R4-J)", () => {
    const live = Object.fromEntries(pods.filter((p) => p.liveUrl).map((p) => [p.slug, p.liveUrl]));
    expect(live).toEqual({
      "solutions-marketing-site": "https://mii-microsoft.azurewebsites.net",
      "ai-solutions-assistant": "https://mii-microsoft-ai.azurewebsites.net",
    });
    for (const p of pods) if (p.liveUrl) expect(isPublicLiveUrl(p.liveUrl), p.slug).toBe(true);
    expect(pods.find((p) => p.slug === "vendor-management-portal")?.liveUrl).toBeUndefined();
  });

  it("names the MII Microsoft sites and places them in their wings (R4-J)", () => {
    const site = pods.find((p) => p.slug === "solutions-marketing-site")!;
    const ai = pods.find((p) => p.slug === "ai-solutions-assistant")!;
    expect([site.title.en, site.title.id, site.wing, site.tier, site.role.en]).toEqual([
      "MII Microsoft Solutions Website",
      "Situs Web MII Microsoft Solutions",
      "software",
      "featured",
      "Sole engineer",
    ]);
    expect([ai.title.en, ai.title.id, ai.wing, ai.tier, ai.role.en]).toEqual([
      "MII Microsoft AI Portfolio and Assistant",
      "Portofolio dan Asisten MII Microsoft AI",
      "ai",
      "featured",
      "Sole engineer",
    ]);
    expect(ai.tagline.en).toMatch(/multi-agent RAG assistant/);
    expect(ai.tagline.en).toMatch(/\/dashboard Studio/);
    expect(pods.find((p) => p.slug === "event-tech-search-backend")?.tier).toBe("listed");
  });

  it("has 4 to 6 lobby stats", () => {
    expect(content.stats.length).toBeGreaterThanOrEqual(4);
    expect(content.stats.length).toBeLessThanOrEqual(6);
  });

  it("follows owner decisions C2, C5 and C6", () => {
    expect(content.profile.currentRole.title.en).toBe("Technical Consultant, Software & AI");
    expect(content.profile.currentRole.org).toBe("Metrodata (PT Mitra Integrasi Informatika)");
    expect(content.profile.currentRole.since).toBe("2026-02");
    expect(content.profile.photo).toBeUndefined();
    const jenius = entries.find((e) => e.id === "jenius-2024");
    expect(jenius?.role.en).toBe("Software Engineer");
    expect([jenius?.start, jenius?.end]).toEqual(["2024-06", "2025-12"]);
  });

  it("does not show 2026 hackathon entries (C1)", () => {
    const hackathon2026 = [
      ...entries.filter((e) => e.start >= "2026" && /hackathon/i.test(JSON.stringify(e))).map((e) => e.id),
      ...content.floors.library.talks.filter((t) => t.date >= "2026" && /hackathon/i.test(JSON.stringify(t))).map((t) => t.id),
      ...content.awards.filter((a) => a.date >= "2026").map((a) => a.id),
      ...pods.filter((p) => /hackathon/i.test(JSON.stringify(p))).map((p) => p.id),
    ];
    expect(hackathon2026).toEqual([]);
  });

  it("names the L3 wings in the best-swe and best-ai mission labels (common.wing)", () => {
    for (const [id, wing] of [["best-swe", "software"], ["best-ai", "ai"]] as const) {
      const label = content.missions.find((m) => m.id === id)!.label;
      expect(label.en, id).toContain(en.common.wing[wing]);
      expect(label.id, id).toContain(idMessages.common.wing[wing]);
    }
  });

  it("starts every mission with a known step and targets existing rooms", () => {
    const rooms = new Set([
      ...pods.map((p) => `L3:${p.slug}`),
      ...entries.map((e) => `L2:${e.slug}`),
      ...content.floors.library.posts.map((p) => `L4:${p.slug}`),
      "RF:contact",
      "RF:cv",
    ]);
    const missing = content.missions.flatMap((m) =>
      m.steps.flatMap((s) => {
        const room = s.kind === "open" ? s.room : s.kind === "drive" && typeof s.to === "string" ? s.to : undefined;
        return room && !rooms.has(room) ? [`${m.id}: ${room}`] : [];
      }),
    );
    expect(missing).toEqual([]);
  });
});

describe("ticketing projects (owner request 2026-10-12)", () => {
  const data = parsed.success ? parsed.data : undefined;
  const ticketPods = data?.floors.labs.pods ?? [];
  const ticketEntries = data?.floors.careerArchive.entries ?? [];
  const serupa = ticketPods.find((p) => p.id === "event-ticketing-platform");
  const serupaEntry = ticketEntries.find((e) => e.id === "serupa-2025");
  const dariordal = ticketPods.find((p) => p.id === "limited-quota-event-ticketing");

  it("adds the Serupa pod to Product Engineering, linked both ways to its Journey entry", () => {
    expect(serupa).toMatchObject({
      wing: "software",
      tier: "featured",
      client: "Serupa",
      timelineRef: "serupa-2025",
      period: { start: "2025-06", end: "2025-08" },
    });
    expect(serupaEntry).toMatchObject({
      type: "freelance",
      org: "Serupa",
      start: "2025-06",
      end: "2025-08",
      podRef: "event-ticketing-platform",
    });
  });

  it("describes the two-person split the commit history shows, without a lead title", () => {
    expect(serupa?.role.en).toContain("two-person team");
    expect(serupa?.role.en).not.toMatch(/\blead\b/i);
    expect(serupa?.approach.some((a) => a.en.startsWith("My teammate built"))).toBe(true);
  });

  it("keeps the client name out of the slug and frees a featured slot with the sibling ticketing pod", () => {
    expect(serupa?.slug).not.toMatch(/serupa/i);
    expect(dariordal?.tier).toBe("listed");
  });

  it("refreshes DariOrdal from its repository: Next.js 15, the teammate's payment work, non-merge commit share", () => {
    expect(JSON.stringify(dariordal)).not.toContain("Next.js 14");
    expect(dariordal?.stack).toContain("Next.js 15");
    expect(dariordal?.approach.some((a) => a.en.includes("my teammate integrated iPaymu"))).toBe(true);
    expect(dariordal?.results[0]).toMatchObject({ value: "45%" });
    expect(dariordal?.slug).toBe("limited-quota-event-ticketing");
  });

  it("ships the Serupa gallery: desktop screens plus one mobile triptych, cover first", () => {
    const assets = serupa?.assets ?? [];
    expect(assets.length).toBeGreaterThanOrEqual(6);
    expect(assets[0].src).toBe("/media/event-ticketing-platform/01-home.webp");
    expect(assets.at(-1)?.src).toMatch(/^\/media\/event-ticketing-platform\/\d{2}-mobile\.webp$/);
    expect(assets.every((a) => a.width === 1600 && a.height === 1000 && a.redacted)).toBe(true);
  });

  it("ships the DariOrdal gallery: desktop screens plus one mobile triptych, cover first", () => {
    const assets = dariordal?.assets ?? [];
    expect(assets.length).toBeGreaterThanOrEqual(6);
    expect(assets[0].src).toBe("/media/limited-quota-event-ticketing/01-home.webp");
    expect(assets.at(-1)?.src).toMatch(/^\/media\/limited-quota-event-ticketing\/\d{2}-mobile\.webp$/);
    expect(assets.every((a) => a.width === 1600 && a.height === 1000 && a.redacted)).toBe(true);
  });
});

describe("vendor management portal (owner request 2026-10-13)", () => {
  const data = parsed.success ? parsed.data : undefined;
  const vendor = data?.floors.labs.pods.find((p) => p.slug === "vendor-management-portal");
  const text = JSON.stringify(vendor ?? {});

  it("is shown as Metrodata work with the employer's name, never a sector label", () => {
    expect(vendor?.client).toBe("Metrodata");
    expect(vendor?.timelineRef).toBe("metrodata-2026");
    expect(vendor?.tagline.en).toMatch(/^eVendor, Metrodata's vendor portal/);
    expect(vendor?.tagline.id).toContain("portal vendor Metrodata");
    expect(vendor?.problem.en).toMatch(/^Metrodata needed/);
    expect(vendor?.problem.id).toMatch(/^Metrodata membutuhkan/);
    expect(text).not.toMatch(/MII's internal|internal MII|group business unit|Unit bisnis dalam grup/);
  });

  it("sorts after AI Fraud Document Review among hero pods, so the landing top three stay (coordinator decision)", () => {
    const fraud = data?.floors.labs.pods.find((p) => p.slug === "fraud-review-platform");
    expect(vendor?.tier).toBe("hero");
    expect(vendor!.order).toBeGreaterThan(fraud!.order);
  });

  it("matches the repository: 51 specs, 21 domains, 109 migrations, six weeks, the measured cookie", () => {
    expect(text).toContain("51 numbered specs");
    expect(text).toContain("109 Alembic migrations");
    expect(text).toContain("109 migrasi Alembic");
    expect(text).not.toMatch(/\b110\b/);
    expect(vendor?.results.map((r) => r.value)).toEqual(["6 weeks", "21 domains", "4.5 KB → 2.1 KB"]);
    expect(vendor?.results[2].context?.en).toContain("4,491 bytes");
    expect(vendor?.liveUrl).toBeUndefined();
  });

  it("ships a masked gallery from a local demo instance: desktop screens, then one phone triptych", () => {
    const assets = vendor?.assets ?? [];
    expect(assets.length).toBeGreaterThanOrEqual(5);
    expect(assets.length).toBeLessThanOrEqual(8);
    expect(assets[0].src).toBe("/media/vendor-management-portal/01-vendor-dashboard.webp");
    expect(assets.every((a) => a.width === 1600 && a.height === 1000 && a.redacted)).toBe(true);
    expect(assets.map((a) => a.src.match(/\/(\d{2})-/)?.[1])).toEqual(assets.map((_, i) => String(i + 1).padStart(2, "0")));
    expect(assets.at(-1)?.src).toMatch(/\/\d{2}-mobile\.webp$/);
    for (const a of assets) {
      expect(`${a.alt.en} ${a.alt.id}`).not.toMatch(/azurewebsites|windows\.net|onmicrosoft|localhost|tenant|\bPT\b|@|\.example\b/i);
      expect(a.alt.en).toMatch(/blurred$/);
      expect(a.alt.id).toMatch(/diburamkan$/);
    }
  });

  it("keeps the landing top three when the gallery moves it ahead of pods without one", () => {
    const pods = getPods();
    expect(pickFeaturedPods(pods).map((p) => p.slug)).toEqual(["voice-ai-contact-center", "ai-code-security-platform", "ai-solutions-assistant"]);
    expect(pods.findIndex((p) => p.slug === "vendor-management-portal")).toBe(3);
  });
});

describe("MII Deck and MII Cowork (owner request 2026-10-16)", () => {
  it("MII Deck and MII Cowork are featured AI pods without repos or live links", () => {
    const pods = getPods("ai");
    for (const slug of ["agent-deck-platform", "mii-cowork"]) {
      const pod = pods.find((p) => p.slug === slug);
      expect(pod?.tier, slug).toBe("featured");
      expect(pod?.repos ?? [], slug).toEqual([]);
      expect(pod?.liveUrl, slug).toBeUndefined();
      expect(pod?.client, slug).toBeUndefined();
      expect(pod?.assets.length, slug).toBeGreaterThan(0);
    }
  });
});

describe("image-free client pods (owner decision 2026-10-11)", () => {
  it("keeps SITA and FREDDY without screenshots", () => {
    const pods = parsed.success ? parsed.data.floors.labs.pods : [];
    for (const slug of ["mining-coa-assistant", "automotive-fraud-dashboard"]) expect(pods.find((p) => p.slug === slug)?.assets, slug).toEqual([]);
  });
});

describe("spec-driven development post facts (R5-P11)", () => {
  const post = (locale: "en" | "id") =>
    readFileSync(path.join(process.cwd(), "content", "blog", `spec-driven-development-with-ai-coding-agents.${locale}.mdx`), "utf8");

  it("matches the vendor portal repository and names Metrodata", () => {
    expect(post("en")).toContain("I opened all 179 pull requests and merged 142 of them.");
    expect(post("id")).toContain("Saya membuka semua 179 pull request dan me-merge 142 di antaranya.");
    expect(post("en")).toContain("4 October 2026, for Metrodata.");
    expect(post("id")).toContain("4 Oktober 2026 untuk Metrodata.");
    expect(post("en")).toContain("21 backend domains and 109 Alembic migrations.");
    expect(post("id")).toContain("21 domain backend, dan 109 migrasi Alembic.");
    for (const locale of ["en", "id"] as const) {
      expect(post(locale)).not.toMatch(/\b110 (Alembic|migrasi)|business unit in the group|unit bisnis di grup|merged all 179|saya merge sendiri/);
    }
  });
});

describe("AI Fraud Document Review gallery names its own product (R5-P11)", () => {
  it("calls the app MII Fraud Detection, never FREDDY (the automotive client's product)", () => {
    const pods = parsed.success ? parsed.data.floors.labs.pods : [];
    const assets = pods.find((p) => p.slug === "fraud-review-platform")?.assets ?? [];
    expect(assets[0]?.alt.en).toMatch(/^MII Fraud Detection home:/);
    expect(assets[0]?.alt.id).toMatch(/^Beranda MII Fraud Detection:/);
    for (const a of assets) expect(`${a.alt.en} ${a.alt.id}`).not.toMatch(/FREDDY/i);
  });
});

describe("Data and ML pods (owner request 2026-10-14)", () => {
  const content = parsed.data!;
  const pods = content.floors.labs.pods;
  const data = pods.filter((p) => p.wing === "data");
  const DATA_SLUGS = ["university-sentiment-indobert", "ifest-2021-sentiment-analysis", "covid-herd-immunity-forecast", "stock-allocation-optimizer", "kampus-merdeka-reports-crawler"];

  it("adds the five chosen repos as featured pods with their public repositories and no client", () => {
    expect(data.map((p) => p.slug)).toEqual(DATA_SLUGS);
    for (const pod of data) {
      expect(pod.tier, pod.slug).toBe("featured");
      expect(pod.client, pod.slug).toBeUndefined();
      expect(pod.repos?.length, pod.slug).toBeGreaterThan(0);
      expect(pod.liveUrl, pod.slug).toBeUndefined();
      for (const r of pod.results) expect(r.context?.en, `${pod.slug} ${r.value}`).toBeTruthy();
    }
  });

  it("does not duplicate the real estate side project as a pod", () => {
    expect(content.sideProjects.some((s) => s.id === "real-estate-cluster-map")).toBe(true);
    expect(pods.some((p) => p.repos?.some((r) => r.includes("Real-Estate")))).toBe(false);
  });

  it("takes the IFEST 2021 placing from the awards, never a new rank", () => {
    const award = content.awards.find((a) => a.id === "ifest-2021-data-analysis")!;
    const ifest = data.find((p) => p.slug === "ifest-2021-sentiment-analysis")!;
    expect(award.placement.en).toBe("1st place");
    expect(ifest.results[0].value).toBe(award.placement.en);
  });

  it("links the thesis, the papers and the models that came from these projects, both ways with the Journey", () => {
    const entries = content.floors.careerArchive.entries;
    expect(data.find((p) => p.slug === "university-sentiment-indobert")!.publications).toEqual(["sentiboard-bsc-thesis", "sentiboard-paper", "indobert-university-reviews-model"]);
    for (const pod of data.filter((p) => p.timelineRef)) expect(entries.find((e) => e.id === pod.timelineRef)?.podRef, pod.slug).toBe(pod.slug);
  });

  it("keeps the home page's featured top three", () => {
    expect(pickFeaturedPods(getPods()).map((p) => p.slug)).toEqual(["voice-ai-contact-center", "ai-code-security-platform", "ai-solutions-assistant"]);
  });
});

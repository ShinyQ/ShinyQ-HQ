import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isPublicLiveUrl } from "@/content/live-links";
import { SiteContentSchema, type LocalizedText } from "@/content/schema";
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

  it("has 3 hero pods per wing (hologram view) and at most 6 featured per wing", () => {
    for (const wing of ["software", "ai"] as const) {
      expect(pods.filter((p) => p.wing === wing && p.tier === "hero")).toHaveLength(3);
      expect(pods.filter((p) => p.wing === wing && p.tier === "featured").length).toBeLessThanOrEqual(6);
    }
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
});

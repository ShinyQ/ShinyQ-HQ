import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { toCertViews } from "@/content/cert-views";
import { GUIDE_PAGE_KEY, GUIDE_SLUG, guideDownloadUrl, guideUrl, sizeLabel, weightLabel } from "@/content/guides";
import { guideForCert, guideViews } from "@/content/guide-views";
import { getContent, getStudyGuides } from "@/content/load";
import { collectStrings } from "@/content/safety";
import { StudyGuidesFileSchema } from "@/content/schema";
import { titleCase } from "@/content/title-case";
import { hasFirstPerson } from "@/lib/first-person";
import raw from "../../content/study-guides.json";

const SLUGS = ["gh-600", "google-gen-ai-leader", "ai-103", "ai-901"];

describe("content/study-guides.json", () => {
  const file = getStudyGuides();

  it("parses with four guides in file order and unique slugs", () => {
    expect(StudyGuidesFileSchema.safeParse(raw).success).toBe(true);
    expect(file.guides.map((g) => g.slug)).toEqual(SLUGS);
    expect(new Set(file.guides.map((g) => g.slug)).size).toBe(file.guides.length);
    for (const g of file.guides) expect(g.slug).toMatch(GUIDE_SLUG);
  });

  it("links every guide to a certification in the dataset", () => {
    const ids = new Set(getContent().certifications.map((c) => c.id));
    for (const g of file.guides) expect(ids.has(g.certId), g.certId).toBe(true);
  });

  it("has a committed cover and a 12 hex version for every guide", () => {
    for (const g of file.guides) {
      expect(existsSync(path.join(process.cwd(), "public", g.cover)), g.cover).toBe(true);
      expect(g.version).toMatch(/^[0-9a-f]{12}$/);
    }
  });

  it("keeps titles in Title Case without first person", () => {
    for (const g of file.guides) {
      expect(titleCase(g.title.en)).toBe(g.title.en);
      expect(hasFirstPerson(g.title.en, "en")).toBe(false);
      expect(hasFirstPerson(g.title.id, "id")).toBe(false);
    }
  });

  it("has no em dash in any string", () => {
    const leaves = collectStrings(raw).filter(({ value }) => value.includes("\u2014"));
    expect(leaves).toEqual([]);
  });

  it("rejects bad values", () => {
    const g = raw.guides[0];
    const bad = (patch: Record<string, unknown>) => StudyGuidesFileSchema.safeParse({ guides: [{ ...g, ...patch }] }).success;
    expect(bad({})).toBe(true);
    expect(bad({ slug: "Bad Slug" })).toBe(false);
    expect(bad({ spine: "x".repeat(15) })).toBe(false);
    expect(bad({ edition: "2026-13" })).toBe(false);
    expect(bad({ file: "guide.txt" })).toBe(false);
    expect(bad({ pages: 0 })).toBe(false);
    expect(bad({ version: "807C40516586" })).toBe(false);
    expect(bad({ cover: "/elsewhere/gh-600.webp" })).toBe(false);
    expect(bad({ domains: [] })).toBe(false);
    expect(bad({ domains: [{ weight: [30, 20], label: { en: "A", id: "A" } }] })).toBe(false);
    expect(bad({ domains: [{ weight: [0, 20], label: { en: "A", id: "A" } }] })).toBe(false);
    expect(bad({ extra: true })).toBe(false);
  });
});

describe("guide helpers", () => {
  it("formats weights and sizes", () => {
    expect(weightLabel([25, 30])).toBe("25-30%");
    expect(weightLabel([30, 30])).toBe("~30%");
    expect(sizeLabel(4448335)).toBe("4.4 MB");
  });

  it("builds the Pages Function URLs and the page key", () => {
    expect(guideUrl("ai-103", "171f309183a7")).toBe("/api/guides/ai-103?v=171f309183a7");
    expect(guideDownloadUrl("ai-103", "171f309183a7")).toBe("/api/guides/ai-103?v=171f309183a7&download=1");
    expect(GUIDE_PAGE_KEY("ai-103")).toBe("hq:guide:ai-103");
  });
});

describe("guide views", () => {
  it("resolves locale strings and keeps the same slugs", () => {
    const en = guideViews("en");
    const id = guideViews("id");
    expect(en.map((g) => g.slug)).toEqual(SLUGS);
    expect(id.map((g) => g.slug)).toEqual(SLUGS);
    const raw103 = getStudyGuides().guides.find((g) => g.slug === "ai-103")!;
    const v = en.find((g) => g.slug === "ai-103")!;
    expect(v).toMatchObject({
      certId: "ai-103",
      code: "AI-103",
      summary: raw103.summary.en,
      editionLabel: "Oct 2026",
      sizeLabel: "4.4 MB",
      url: "/api/guides/ai-103?v=171f309183a7",
      downloadUrl: "/api/guides/ai-103?v=171f309183a7&download=1",
    });
    expect(v.domains[0]).toEqual({ label: raw103.domains[0].label.en, weight: [25, 30], weightLabel: "25-30%" });
    const idView = id.find((g) => g.slug === "ai-103")!;
    expect(idView.summary).toBe(raw103.summary.id);
    expect(idView.editionLabel).toBe("Okt 2026");
  });

  it("maps certifications to guides", () => {
    expect(guideForCert("ai-103")).toBe("ai-103");
    expect(guideForCert("az-900")).toBeNull();
  });

  it("sets CertView.guide for the four guides and null for the rest", () => {
    const views = toCertViews(getContent().certifications, "en");
    for (const c of views) expect(c.guide, c.id).toBe(SLUGS.includes(c.id) ? c.id : null);
    expect(views.filter((c) => c.guide).length).toBe(4);
  });
});

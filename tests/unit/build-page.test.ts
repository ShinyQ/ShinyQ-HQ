import en from "../../messages/en.json";
import id from "../../messages/id.json";
import { describe, expect, it } from "vitest";
import { type BuildFacts, getBuildFacts, getBuildStory } from "@/content/build-story";
import { LOCALES } from "@/content/schema";
import { hasFirstPerson } from "@/lib/first-person";
import { DESCRIPTION_MAX, DESCRIPTION_MIN, TITLE_MAX, seoFor } from "@/lib/seo";
import { PERSON_ID, WEBSITE_ID, pageJsonLd, techArticleJsonLd } from "@/lib/jsonld";
import { allPagePaths, lastModified } from "@/lib/routes";
import { REPO_URL, SITE_URL, ogImagePath } from "@/lib/site";
import { dashboardTiles, prUrl, roundDates, timelineRows } from "@/lib/build-page";

const story = getBuildStory();
const facts = getBuildFacts();

describe("/build route wiring", () => {
  it("is a static page dated by the facts snapshot", () => {
    expect(allPagePaths()).toContain("/build");
    expect(lastModified("/build")).toBe(facts.generatedAt);
  });

  it("has search and share copy within the limits, without first person", () => {
    for (const locale of LOCALES) {
      const seo = seoFor(locale, "/build");
      expect(seo.title.length, seo.title).toBeLessThanOrEqual(TITLE_MAX);
      expect(hasFirstPerson(seo.title, locale)).toBe(false);
      expect(seo.description.length, seo.description).toBeGreaterThanOrEqual(DESCRIPTION_MIN);
      expect(seo.description.length, seo.description).toBeLessThanOrEqual(DESCRIPTION_MAX);
      expect(seo.image).toEqual({ kind: "page", locale, page: "build" });
    }
  });
});

describe("techArticleJsonLd", () => {
  it("describes the page as a TechArticle by the site owner", () => {
    const article = techArticleJsonLd("en");
    expect(article).toMatchObject({
      "@context": "https://schema.org",
      "@type": "TechArticle",
      headline: story.title.en,
      url: `${SITE_URL}/en/build`,
      inLanguage: "en",
      datePublished: story.published,
      dateModified: facts.generatedAt,
      author: { "@id": PERSON_ID },
      publisher: { "@id": PERSON_ID },
      isPartOf: { "@id": WEBSITE_ID },
    });
    const description = article.description as string;
    expect(description).toBe(seoFor("en", "/build").description);
    expect(description.length).toBeGreaterThanOrEqual(140);
    expect(description.length).toBeLessThanOrEqual(160);
    expect(article.image).toEqual([`${SITE_URL}${ogImagePath({ kind: "page", locale: "en", page: "build" })}`]);
    expect((article.about as { name: string }[]).map((a) => a.name)).toEqual(["Next.js", "React Three Fiber", "Cloudflare Pages", "AI coding agents"]);
    expect(techArticleJsonLd("id")).toMatchObject({ headline: story.title.id, url: `${SITE_URL}/id/build`, inLanguage: "id" });
  });

  it("is added to the page's breadcrumb (Home, then the build page)", () => {
    for (const locale of LOCALES) {
      const [crumbs, article] = pageJsonLd(locale, "/build");
      expect(crumbs["@type"]).toBe("BreadcrumbList");
      const items = crumbs.itemListElement as { name: string; item: string }[];
      expect(items.map((i) => i.item)).toEqual([`${SITE_URL}/${locale}`, `${SITE_URL}/${locale}/build`]);
      expect(article["@type"]).toBe("TechArticle");
    }
  });
});

describe("timelineRows", () => {
  it("lists every round oldest first with its merged pull requests from the facts", () => {
    const rows = timelineRows(story, facts);
    expect(rows.map((r) => r.round.id)).toEqual(story.stations.timeline.rounds.map((r) => r.id));
    expect(rows[0].round.number).toBe(1);
    for (const row of rows) {
      const measured = facts.rounds?.find((r) => r.id === row.round.id);
      expect(row.prs).toEqual(measured?.prs ?? []);
      expect(row.open).toBe(row.round.prs.to === null);
    }
  });

  it("hides what the facts lack: no PRs and no dates for an unmeasured round", () => {
    const bare: BuildFacts = { generatedAt: "2026-10-17" };
    for (const row of timelineRows(story, bare)) {
      expect(row.prs).toEqual([]);
      expect(row.first).toBeUndefined();
      expect(row.last).toBeUndefined();
    }
  });

  it("writes merge date ranges with words, one date when they match", () => {
    expect(roundDates({ first: "2026-10-09", last: "2026-10-10" }, "en", "to")).toBe("Oct 9, 2026 to Oct 10, 2026");
    expect(roundDates({ first: "2026-10-09", last: "2026-10-10" }, "id", "hingga")).toBe("9 Okt 2026 hingga 10 Okt 2026");
    expect(roundDates({ first: "2026-10-12", last: "2026-10-12" }, "id", "hingga")).toBe("12 Okt 2026");
    expect(roundDates({}, "en", "to")).toBeUndefined();
  });

  it("takes the range word from the build messages", () => {
    expect(en.build.dateTo).toBe("to");
    expect(id.build.dateTo).toBe("hingga");
  });

  it("counts a pull request that is shown without a link, and only that one", () => {
    const rows = timelineRows(story, facts);
    const r2 = rows.find((r) => r.round.id === "r2")!;
    expect(r2.prs).toContain(26);
    expect(r2.unlinked).toEqual([26]);
    expect(rows.flatMap((r) => r.unlinked)).toEqual([26]);
    expect(facts.git?.mergedPrs).toBeGreaterThanOrEqual(rows.reduce((n, r) => n + r.prs.length, 0));
  });

  it("links pull requests to the public repository", () => {
    expect(prUrl(42)).toBe(`${REPO_URL}/pull/42`);
  });
});

describe("dashboardTiles", () => {
  it("shows only the numbers the facts carry", () => {
    expect(dashboardTiles({ generatedAt: "2026-10-17" }, 5).map((t) => t.id)).toEqual(["floors"]);
    expect(dashboardTiles({ generatedAt: "2026-10-17" }).map((t) => t.id)).toEqual([]);
    const ids = dashboardTiles(facts, 5).map((t) => t.id);
    expect(ids).toEqual(["mergedPrs", "commits", "unitFiles", "e2eTests", "specs", "plans", "floors", "js3dKb", "sceneCalls", "triangles"]);
  });

  it("takes every value from the facts", () => {
    const tiles = Object.fromEntries(dashboardTiles(facts, 5).map((t) => [t.id, t]));
    expect(tiles.mergedPrs.value).toBe(facts.git?.mergedPrs);
    expect(tiles.commits).toMatchObject({ value: facts.git?.commits, since: facts.git?.firstCommit });
    expect(tiles.unitFiles.value).toBe(facts.tests?.unitFiles);
    expect(tiles.e2eTests.value).toBe(facts.tests?.e2e);
    expect(tiles.js3dKb).toMatchObject({ value: facts.budgets?.js3dKb, unit: "kb" });
    expect(tiles.triangles.value).toBe(facts.budgets?.triangles);
  });

  it("drops an end-to-end count the snapshot could not measure and never shows a unit test count", () => {
    const partial: BuildFacts = { generatedAt: "2026-10-17", tests: { unitFiles: 3, e2eFiles: 2 } };
    expect(dashboardTiles(partial).map((t) => t.id)).toEqual(["unitFiles"]);
    expect(dashboardTiles(facts, 5).map((t) => t.id)).not.toContain("unitTests");
  });
});

import { describe, expect, it } from "vitest";
import { getPods, getSkills } from "@/content/load";
import { adjacent, comparePods, groupEntriesByYear, orderPods, podHasGallery, podLiveLink, roleLine, SKILLS_WALL_GROUPS, sortTimeline, wallSkillGroups, type PodRank } from "@/content/selectors";
import type { Asset } from "@/content/schema";
import { makeEntry, makePod } from "../fixtures/minimal-content";

const shot: Asset[] = [{ src: "/media/sample-pod/01.webp", alt: { en: "Screen", id: "Layar" }, width: 1600, height: 900, redacted: true }];

describe("orderPods", () => {
  it("puts pods with a gallery first, then hero before featured before listed, then by order", () => {
    const pods = [
      makePod({ id: "l", tier: "listed", order: 0 }),
      makePod({ id: "f2", tier: "featured", order: 5 }),
      makePod({ id: "h", tier: "hero", order: 9 }),
      makePod({ id: "f1", tier: "featured", order: 1 }),
      makePod({ id: "lg", tier: "listed", order: 7, assets: shot }),
      makePod({ id: "fg", tier: "featured", order: 3, assets: shot }),
      makePod({ id: "hg", tier: "hero", order: 4, assets: shot }),
    ];
    expect(orderPods(pods).map((p) => p.id)).toEqual(["hg", "fg", "lg", "h", "f1", "f2", "l"]);
  });

  it("returns a new array, keeps ties in input order and leaves the input alone", () => {
    const pods = [makePod({ id: "b", order: 1 }), makePod({ id: "a", order: 1 })];
    const sorted = orderPods(pods);
    expect(sorted).not.toBe(pods);
    expect(sorted.map((p) => p.id)).toEqual(["b", "a"]);
    expect(pods.map((p) => p.id)).toEqual(["b", "a"]);
  });

  it("ranks the 3D payload shape with the same comparator", () => {
    const ranks: (PodRank & { id: string })[] = [
      { id: "hero", tier: "hero", order: 0, hasGallery: false },
      { id: "listed-gallery", tier: "listed", order: 9, hasGallery: true },
      { id: "featured-gallery", tier: "featured", order: 2, hasGallery: true },
    ];
    expect([...ranks].sort(comparePods).map((r) => r.id)).toEqual(["featured-gallery", "listed-gallery", "hero"]);
  });

  it("lists every wing of the real dataset gallery first", () => {
    expect(podHasGallery(makePod({ assets: shot }))).toBe(true);
    expect(podHasGallery(makePod())).toBe(false);
    for (const wing of ["software", "ai"] as const) {
      const flags = getPods(wing).map(podHasGallery);
      expect(flags, wing).toEqual([...flags].sort((a, b) => Number(b) - Number(a)));
      expect(flags.some(Boolean), `${wing} has gallery pods`).toBe(true);
    }
  });
});

describe("timeline selectors", () => {
  const entries = [
    makeEntry({ id: "c", start: "2026-02", end: "present" }),
    makeEntry({ id: "a", start: "2016-07", end: "2019-06" }),
    makeEntry({ id: "b", start: "2019-08", end: "2023-06" }),
  ];

  it("sorts oldest first", () => {
    expect(sortTimeline(entries).map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("folds pre-2019 entries into the 2019 year room", () => {
    expect(groupEntriesByYear(entries).map((g) => [g.year, g.entries.map((e) => e.id)])).toEqual([
      [2019, ["a", "b"]],
      [2026, ["c"]],
    ]);
  });
});

describe("adjacent", () => {
  it("returns neighbours", () => {
    expect(adjacent([1, 2, 3], 0)).toEqual({ prev: undefined, next: 2 });
    expect(adjacent([1, 2, 3], 2)).toEqual({ prev: 2, next: undefined });
  });
});

describe("podLiveLink (R4-J)", () => {
  it("returns the public site and its host", () => {
    expect(podLiveLink(makePod({ liveUrl: "https://mii-microsoft.azurewebsites.net" }))).toEqual({
      href: "https://mii-microsoft.azurewebsites.net",
      host: "mii-microsoft.azurewebsites.net",
    });
  });

  it("returns null without a link, or for a host outside the allowlist (stale or hand-made payloads)", () => {
    expect(podLiveLink(makePod())).toBeNull();
    expect(podLiveLink({ liveUrl: "https://internal-portal.azurewebsites.net" })).toBeNull();
    expect(podLiveLink({ liveUrl: "https://mii-microsoft-ai.azurewebsites.net/dashboard" })).toBeNull();
  });

  it("finds exactly the two MII Microsoft sites in the dataset", () => {
    expect(getPods().filter((p) => podLiveLink(p)).map((p) => p.slug).sort()).toEqual(["ai-solutions-assistant", "solutions-marketing-site"]);
  });
});

describe("wallSkillGroups (L1 skills wall)", () => {
  it("puts four CV groups on the wall in column order, each short enough for a 10 u column", () => {
    expect(SKILLS_WALL_GROUPS).toEqual(["backend", "ai", "azure", "devops"]);
    const wall = wallSkillGroups(getSkills());
    expect(wall.map((g) => g.id)).toEqual(["backend", "ai", "azure", "devops"]);
    expect(Math.max(...wall.map((g) => g.items.length))).toBeLessThanOrEqual(12);
  });

  it("skips a wall group the content does not have", () => {
    expect(wallSkillGroups([{ id: "ai", label: { en: "AI and LLM", id: "AI dan LLM" }, items: ["RAG"] }]).map((g) => g.id)).toEqual(["ai"]);
  });
});

describe("roleLine", () => {
  it("joins the role title and the organization", () => {
    expect(roleLine({ title: { en: "Technical Consultant", id: "Konsultan Teknis" }, org: "Metrodata" }, "id")).toBe("Konsultan Teknis · Metrodata");
  });
});

import { describe, expect, it } from "vitest";
import { getPods, getSkills, getTechIndex } from "@/content/load";
import type { SkillGroup } from "@/content/schema";
import { normalizeTech } from "@/content/tech";
import { buildTechIndex, ringOf, techKey, techSlug } from "@/content/tech-index";
import { EXTRA_RING, MISC_TECH, REACTOR_RINGS, TECH_ALIASES } from "@/content/tech-rings";

const skills = getSkills();
const pods = getPods();

const group = (id: string, items: string[]): SkillGroup => ({ id, label: { en: id, id }, items }) as SkillGroup;

describe("tech rings", () => {
  it("maps every pod tech to a ring, or lists it in the misc allowlist", () => {
    const unmapped = [...new Set(pods.flatMap((p) => p.stack))].filter((name) => ringOf(name, skills) === null && !MISC_TECH.has(techKey(name)));
    expect(unmapped).toEqual([]);
  });

  it("keeps the misc allowlist apart from the ring map", () => {
    for (const key of MISC_TECH) expect(EXTRA_RING[key], key).toBeUndefined();
  });

  it("has no stale ring, alias or misc entries", () => {
    const used = new Set(pods.flatMap((p) => p.stack.map(normalizeTech)));
    const keys = new Set(pods.flatMap((p) => p.stack.map(techKey)));
    for (const key of Object.keys(EXTRA_RING)) expect(keys.has(key), key).toBe(true);
    for (const key of Object.keys(TECH_ALIASES)) expect(used.has(key), key).toBe(true);
    for (const key of MISC_TECH) expect(keys.has(key), key).toBe(true);
  });

  it("follows the CV groups first, languages by tech", () => {
    const cv = [group("ai", ["Azure OpenAI (incl. Realtime)"]), group("languages", ["Python", "TypeScript"]), group("devops", ["Bicep"])];
    expect(ringOf("Azure OpenAI", cv)).toBe("ai");
    expect(ringOf("Azure OpenAI Realtime", cv)).toBe("ai");
    expect(ringOf("Python", cv)).toBe("backend");
    expect(ringOf("TypeScript", cv)).toBe("frontend");
    expect(ringOf("Bicep", cv)).toBe("devops");
    expect(ringOf("Hono", cv)).toBe("backend");
    expect(ringOf("iPaymu", cv)).toBeNull();
    expect(ringOf("Something new", cv)).toBeNull();
  });

  it("makes stable kebab slugs from the canonical key", () => {
    expect(techSlug("Azure OpenAI")).toBe("azure-openai");
    expect(techSlug("Next.js 15")).toBe("next-js");
    expect(techSlug("App Service")).toBe("azure-app-service");
    expect(techSlug("shadcn/ui")).toBe("shadcn-ui");
  });
});

describe("buildTechIndex", () => {
  it("merges spellings and counts distinct pods", () => {
    const index = buildTechIndex(
      [
        { slug: "a", stack: ["Next.js", "App Service", "iPaymu"] },
        { slug: "b", stack: ["Next.js 15", "Azure App Service"] },
        { slug: "c", stack: ["Next.js", "Next.js 15"] },
      ],
      [group("frontend", ["Next.js"]), group("azure", ["Azure App Service"])],
    );
    const front = index.rings.find((r) => r.id === "frontend")!;
    expect(front.techs).toEqual([{ slug: "next-js", name: "Next.js", ring: "frontend", pods: ["a", "b", "c"] }]);
    const azure = index.rings.find((r) => r.id === "azure")!;
    // Ties keep the first spelling in content order.
    expect(azure.techs).toEqual([{ slug: "azure-app-service", name: "App Service", ring: "azure", pods: ["a", "b"] }]);
    expect(index.misc).toEqual(["iPaymu"]);
  });

  it("lists all six rings in order, techs by project count then name", () => {
    const index = getTechIndex();
    expect(index.rings.map((r) => r.id)).toEqual([...REACTOR_RINGS]);
    for (const ring of index.rings) {
      expect(ring.techs.length, ring.id).toBeGreaterThan(0);
      const sorted = [...ring.techs].sort((a, b) => b.pods.length - a.pods.length || a.name.localeCompare(b.name, "en"));
      expect(ring.techs.map((t) => t.slug)).toEqual(sorted.map((t) => t.slug));
    }
  });

  it("has unique slugs and pods in site order", () => {
    const techs = getTechIndex().rings.flatMap((r) => r.techs);
    expect(new Set(techs.map((t) => t.slug)).size).toBe(techs.length);
    const order = pods.map((p) => p.slug);
    for (const tech of techs) expect(tech.pods).toEqual([...tech.pods].sort((a, b) => order.indexOf(a) - order.indexOf(b)));
    const next = techs.find((t) => t.slug === "next-js")!;
    expect(next.pods.length).toBe(pods.filter((p) => p.stack.some((s) => normalizeTech(s) === "next.js")).length);
  });
});

describe("Data and ML wing on the reactor (owner request 2026-10-14)", () => {
  const index = getTechIndex();
  const ringOfKey = new Map(index.rings.flatMap((r) => r.techs.map((t) => [techKey(t.name), r.id] as const)));
  const dataPods = pods.filter((p) => p.wing === "data");

  it("puts at least one tech of every data pod on the Data ring, so the ring lights the whole cluster", () => {
    expect(dataPods.length).toBeGreaterThanOrEqual(5);
    for (const pod of dataPods) expect(pod.stack.some((name) => ringOfKey.get(techKey(name)) === "data"), pod.slug).toBe(true);
    const lit = new Set(index.rings.find((r) => r.id === "data")!.techs.flatMap((t) => t.pods));
    for (const pod of dataPods) expect(lit.has(pod.slug), pod.slug).toBe(true);
  });

  it("maps every data pod tech to the Data or AI ring, except the CV languages, frameworks and the Fabric pod's app and cloud stack", () => {
    const off = dataPods.flatMap((pod) => pod.stack.filter((name) => !["data", "ai"].includes(ringOfKey.get(techKey(name)) ?? "")));
    // The Fabric forecasting pod (moved from AI Engineering, owner 2026-10-16) adds its web app, hosting and platform names.
    expect([...new Set(off)].sort()).toEqual(["App Service", "Azure AI Foundry", "Bicep", "Django", "Docker", "FastAPI", "Key Vault", "Microsoft Fabric", "Next.js", "Python"]);
  });

  it("lights every repo data pod from pandas, the cluster's shared tech, and the Fabric pod from its lakehouse pipeline", () => {
    const techs = index.rings.flatMap((r) => r.techs);
    const pandas = techs.find((t) => t.slug === "pandas")!;
    const repoPods = dataPods.filter((p) => p.repos?.length);
    expect(repoPods).toHaveLength(5);
    expect(pandas.pods.filter((slug) => dataPods.some((p) => p.slug === slug)).sort()).toEqual(repoPods.map((p) => p.slug).sort());
    for (const name of ["Lakehouse", "Spark notebooks", "Fabric Data Pipelines"]) {
      const tech = techs.find((t) => techKey(t.name) === techKey(name));
      expect(ringOfKey.get(techKey(name)), name).toBe("data");
      expect(tech?.pods, name).toContain("fabric-forecasting-dashboard");
    }
  });
});

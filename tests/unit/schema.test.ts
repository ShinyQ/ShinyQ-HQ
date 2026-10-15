import { describe, expect, it } from "vitest";
import { PodSchema, SiteContentSchema } from "@/content/schema";
import { makeContent, makePod } from "../fixtures/minimal-content";

describe("SiteContentSchema", () => {
  it("accepts a minimal valid dataset", () => {
    expect(SiteContentSchema.safeParse(makeContent()).success).toBe(true);
  });

  it("rejects a LocalizedText without an id translation", () => {
    const content = makeContent();
    (content.profile.bio as { id?: string }).id = "";
    const result = SiteContentSchema.safeParse(content);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["profile", "bio", "id"]);
  });

  it("rejects unknown keys so typos surface at build time", () => {
    const content = { ...makeContent(), extra: true };
    expect(SiteContentSchema.safeParse(content).success).toBe(false);
  });
});

describe("PodSchema", () => {
  it("requires an architecture with 3+ nodes on hero pods", () => {
    expect(PodSchema.safeParse(makePod({ tier: "hero" })).success).toBe(false);
  });

  it("rejects edges that reference unknown nodes", () => {
    const pod = makePod({
      tier: "hero",
      architecture: {
        nodes: [
          { id: "a", label: "A", layer: 0, row: 0, kind: "client" },
          { id: "b", label: "B", layer: 1, row: 0, kind: "service" },
          { id: "c", label: "C", layer: 2, row: 0, kind: "data" },
        ],
        edges: [{ from: "a", to: "zzz" }],
      },
    });
    expect(PodSchema.safeParse(pod).success).toBe(false);
  });
});

describe("Pod.liveUrl (R4-J)", () => {
  it("accepts an allowlisted public site root and leaves it optional", () => {
    expect(PodSchema.safeParse(makePod({ liveUrl: "https://mii-microsoft.azurewebsites.net" })).success).toBe(true);
    expect(PodSchema.safeParse(makePod()).success).toBe(true);
  });

  it.each([
    "https://vendor-portal.azurewebsites.net",
    "https://mii-microsoft-ai.azurewebsites.net/dashboard",
    "http://mii-microsoft.azurewebsites.net",
  ])("rejects %s on the liveUrl path", (liveUrl) => {
    const result = PodSchema.safeParse(makePod({ liveUrl }));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["liveUrl"]);
  });
});

describe("Data and ML wing (owner request 2026-10-14)", () => {
  it("accepts the data wing", () => {
    expect(PodSchema.safeParse(makePod({ wing: "data" })).success).toBe(true);
  });

  it("accepts only public github.com/ShinyQ repositories as pod repos", () => {
    expect(PodSchema.safeParse(makePod({ repos: ["https://github.com/ShinyQ/Python_Kampus-Merdeka-Reports-Crawler"] })).success).toBe(true);
    for (const repo of ["https://gitlab.com/ShinyQ/x", "https://github.com/someone/x", "http://github.com/ShinyQ/x", "https://github.com/ShinyQ/x/tree/main"]) {
      expect(PodSchema.safeParse(makePod({ repos: [repo] })).success, repo).toBe(false);
    }
  });

  it("rejects a publication link that names no publication", () => {
    const content = makeContent();
    content.floors.labs.pods[0] = { ...content.floors.labs.pods[0], publications: ["missing-paper"] };
    const result = SiteContentSchema.safeParse(content);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["floors", "labs", "pods", 0, "publications", 0]);
  });
});

describe("Pod.selected (owner decision 2026-10-15)", () => {
  const asset = { src: "/media/x/01-a.webp", alt: { en: "A", id: "A" }, width: 1600, height: 1000, redacted: true };

  it("needs a gallery image and a rank from 1 to 3", () => {
    expect(PodSchema.safeParse(makePod({ selected: 1, assets: [asset] })).success).toBe(true);
    expect(PodSchema.safeParse(makePod({ selected: 1 })).error?.issues[0]?.path).toEqual(["selected"]);
    expect(PodSchema.safeParse(makePod({ selected: 4, assets: [asset] })).success).toBe(false);
  });

  it("rejects a rank used twice", () => {
    const content = makeContent();
    const pod = makePod({ selected: 1, assets: [asset] });
    content.floors.labs.pods = [pod, { ...pod, id: "other", slug: "other", order: 1 }];
    const result = SiteContentSchema.safeParse(content);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["floors", "labs", "pods", 1, "selected"]);
  });
});

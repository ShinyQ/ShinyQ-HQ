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

import { describe, expect, it } from "vitest";
import { labPods } from "@/content/experience";
import { getContent } from "@/content/load";
import { PodSchema, type Pod } from "@/content/schema";

const SLUG = "event-ticketing-platform";

function realPod(): Pod {
  const pod = getContent().floors.labs.pods.find((p) => p.slug === SLUG);
  if (!pod) throw new Error(`missing pod ${SLUG}`);
  return structuredClone(pod);
}

function issuePaths(pod: Pod): string[] {
  const result = PodSchema.safeParse(pod);
  return result.success ? [] : result.error.issues.map((i) => i.path.join("."));
}

describe("Pod.shortTitle", () => {
  it("accepts a short one-line board title", () => {
    const pod = { ...realPod(), shortTitle: { en: "Serupa Ticket Hub", id: "Serupa Ticket Hub" } };
    expect(PodSchema.safeParse(pod).success).toBe(true);
  });

  it("rejects a short title longer than 32 characters in either locale", () => {
    const long = "Serupa Ticket Hub Event Platform X";
    expect(long.length).toBeGreaterThan(32);
    expect(issuePaths({ ...realPod(), shortTitle: { en: long, id: "Serupa Ticket Hub" } })).toContain("shortTitle.en");
    expect(issuePaths({ ...realPod(), shortTitle: { en: "Serupa Ticket Hub", id: long } })).toContain("shortTitle.id");
  });

  it("rejects a short title that is not shorter than the title in the same locale", () => {
    const pod = realPod();
    expect(issuePaths({ ...pod, shortTitle: { en: pod.title.en, id: "Serupa Ticket Hub" } })).toContain("shortTitle.en");
    const shortTitled = { ...pod, title: { ...pod.title, id: "Serupa Hub" }, shortTitle: { en: "Serupa Ticket Hub", id: "Serupa Ticket" } };
    expect(issuePaths(shortTitled)).toContain("shortTitle.id");
  });

  it("passes shortTitle to the 3D floor only for pods that set it", () => {
    const pod = getContent().floors.labs.pods.find((p) => p.slug === SLUG)!;
    const before = pod.shortTitle;
    pod.shortTitle = { en: "Serupa Ticket Hub", id: "Serupa Ticket Hub ID" };
    try {
      for (const lab of labPods("en")) {
        const source = getContent().floors.labs.pods.find((p) => p.slug === lab.slug)!;
        if (source.shortTitle) expect(lab.shortTitle).toBe(source.shortTitle.en);
        else expect("shortTitle" in lab).toBe(false);
      }
      expect(labPods("en").find((p) => p.slug === SLUG)?.shortTitle).toBe("Serupa Ticket Hub");
      expect(labPods("id").find((p) => p.slug === SLUG)?.shortTitle).toBe("Serupa Ticket Hub ID");
    } finally {
      if (before) pod.shortTitle = before;
      else delete pod.shortTitle;
    }
  });
});

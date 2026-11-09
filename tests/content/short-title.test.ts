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
    const pod = { ...realPod(), shortTitle: { en: "Event Ticketing", id: "Ticketing Acara" } };
    expect(PodSchema.safeParse(pod).success).toBe(true);
  });

  it("rejects a short title longer than 32 characters in either locale", () => {
    const long = "Event Ticketing Platform Board Title";
    expect(long.length).toBeGreaterThan(32);
    expect(issuePaths({ ...realPod(), shortTitle: { en: long, id: "Ticketing Acara" } })).toContain("shortTitle.en");
    expect(issuePaths({ ...realPod(), shortTitle: { en: "Event Ticketing", id: long } })).toContain("shortTitle.id");
  });

  it("rejects a short title that is not shorter than the title in the same locale", () => {
    const pod = realPod();
    expect(issuePaths({ ...pod, shortTitle: { en: pod.title.en, id: "Ticketing Acara" } })).toContain("shortTitle.en");
    const shortTitled = { ...pod, title: { ...pod.title, id: "Acara" }, shortTitle: { en: "Event Ticketing", id: "Ticketing Acara" } };
    expect(issuePaths(shortTitled)).toContain("shortTitle.id");
  });

  it("passes shortTitle to the 3D floor only for pods that set it", () => {
    const pod = getContent().floors.labs.pods.find((p) => p.slug === SLUG)!;
    const before = pod.shortTitle;
    pod.shortTitle = { en: "Event Ticketing", id: "Ticketing Acara" };
    try {
      for (const lab of labPods("en")) {
        const source = getContent().floors.labs.pods.find((p) => p.slug === lab.slug)!;
        if (source.shortTitle) expect(lab.shortTitle).toBe(source.shortTitle.en);
        else expect("shortTitle" in lab).toBe(false);
      }
      expect(labPods("en").find((p) => p.slug === SLUG)?.shortTitle).toBe("Event Ticketing");
      expect(labPods("id").find((p) => p.slug === SLUG)?.shortTitle).toBe("Ticketing Acara");
    } finally {
      if (before) pod.shortTitle = before;
      else delete pod.shortTitle;
    }
  });
});

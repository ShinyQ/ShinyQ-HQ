import { describe, expect, it } from "vitest";
import data from "../../content/site-content.json";
import { SiteContentSchema } from "@/content/schema";
import { hasFirstPerson } from "@/lib/first-person";

const content = SiteContentSchema.parse(data);
const pods = content.floors.labs.pods;

describe("case study engineering detail (owner decision 2026-11-02)", () => {
  it("covers the four reviewer topics on the voice AI case study, each with its known limits", () => {
    const topics = pods.find((p) => p.slug === "voice-ai-contact-center")?.engineering ?? [];
    expect(topics.map((t) => t.title.en)).toEqual(["Latency Budget", "Failover Design", "Evaluation Method", "Security and Identity"]);
    for (const topic of topics) expect(topic.limits, topic.title.en).toBeDefined();
    expect(topics[0].post).toBe("making-a-voice-agent-interruptible");
  });

  it("topic titles read as headings: no first person, one line", () => {
    for (const pod of pods) for (const topic of pod.engineering ?? []) for (const locale of ["en", "id"] as const) {
      expect(hasFirstPerson(topic.title[locale], locale), `${pod.slug}: ${topic.title[locale]}`).toBe(false);
      expect(topic.title[locale].length, `${pod.slug}: ${topic.title[locale]}`).toBeLessThanOrEqual(60);
    }
  });

  it("rejects a topic that links to an unknown post", () => {
    const bad = structuredClone(data) as typeof data & { floors: { labs: { pods: { slug: string; engineering?: { post?: string }[] }[] } } };
    bad.floors.labs.pods.find((p) => p.slug === "voice-ai-contact-center")!.engineering![0].post = "no-such-post";
    expect(SiteContentSchema.safeParse(bad).success).toBe(false);
  });
});

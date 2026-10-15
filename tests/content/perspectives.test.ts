import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PERSPECTIVE_TOPICS, perspectiveFingerprints, perspectiveIssues, perspectiveTopic, publishedPerspectives } from "@/content/perspectives";
import { PERSPECTIVE_REFERENCE_HOSTS } from "@/content/schema";
import { privateTopic, routedTopic } from "../../functions/_lib/scope";
import { getContent, getPerspectives, getPerspectivesFile } from "@/content/load";
import { findBlockedTerms } from "@/content/safety";

const root = process.cwd();
const read = (...p: string[]) => readFileSync(path.join(root, ...p), "utf8");

describe("content/perspectives.json", () => {
  const file = getPerspectivesFile();

  it("has 10 to 50 entries whose sources exist and that read as plain answers", () => {
    expect(file.entries.length).toBeGreaterThanOrEqual(10);
    expect(file.entries.length).toBeLessThanOrEqual(50);
    expect(perspectiveIssues(file, getContent())).toEqual([]);
  });

  it("tags the owner's 30 endorsed answers (2026-10-15) with exactly one topic each, 15 engineering entries with none", () => {
    const counts = Object.fromEntries(PERSPECTIVE_TOPICS.map((t) => [t, 0]));
    for (const entry of file.entries) {
      const topics = entry.tags.filter((tag) => (PERSPECTIVE_TOPICS as readonly string[]).includes(tag));
      expect(topics.length, entry.id).toBeLessThanOrEqual(1);
      const topic = perspectiveTopic(entry);
      if (topic) counts[topic]++;
    }
    expect(counts).toEqual({ "work-style": 8, "ai-industry": 6, "indonesia-tech": 6, policy: 5, lifestyle: 5 });
    expect(file.entries.filter((e) => !perspectiveTopic(e)).length).toBe(15);
  });

  it("cites outside facts to an allowed public URL and keeps partisan politics, religion, health and pay out of every answer", () => {
    const refs = file.entries.flatMap((e) => e.references ?? []);
    expect(refs.length).toBeGreaterThanOrEqual(1);
    for (const ref of refs) expect(PERSPECTIVE_REFERENCE_HOSTS as readonly string[]).toContain(new URL(ref.url).hostname);
    expect(file.entries.find((e) => e.id === "ai-adoption-indonesia")?.references?.[0].url).toMatch(/2024-work-trend-index/);
    for (const entry of file.entries) {
      for (const locale of ["en", "id"] as const) {
        // Answers name no personal topic (the non-tech policy fallback of privateTopic reads questions, not answers).
        expect(["family", "health", "religion", "pay", "life"], `${entry.id} ${locale}`).not.toContain(privateTopic(entry.answer[locale]));
        // Each lifestyle and policy entry's own question routes to its topic in both languages, and is never declined.
        const topic = perspectiveTopic(entry);
        if (topic === "lifestyle" || topic === "policy") {
          expect(privateTopic(entry.question[locale]), `${entry.id} ${locale}`).toBeNull();
          expect(routedTopic(entry.question[locale]), `${entry.id} ${locale}`).toBe(topic);
        }
      }
    }
  });

  it("publishes exactly the approved entries: getPerspectives is the only way in", () => {
    expect(getPerspectives().map((e) => e.id)).toEqual(publishedPerspectives(file).map((e) => e.id));
    if (file.status === "draft") expect(getPerspectives().every((e) => e.approved === true)).toBe(true);
  });

  it("has fingerprints that no page text contains, so the export scan proves no entry reaches a page (chatbot knowledge only)", () => {
    const published = [
      read("content", "site-content.json"),
      ...readdirSync(path.join(root, "content", "blog")).map((f) => read("content", "blog", f)),
      ...readdirSync(path.join(root, "messages")).map((f) => read("messages", f)),
    ].join("\n");
    const prints = perspectiveFingerprints(file.entries);
    expect(prints.every((p) => p.split(" ").length >= 4), prints.join(" | ")).toBe(true);
    expect(findBlockedTerms(published, prints)).toEqual([]);
  });
});

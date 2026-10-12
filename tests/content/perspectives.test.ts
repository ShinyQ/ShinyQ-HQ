import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { draftFingerprints, perspectiveIssues, publishedPerspectives } from "@/content/perspectives";
import { getContent, getPerspectives, getPerspectivesFile } from "@/content/load";
import { findBlockedTerms } from "@/content/safety";

const root = process.cwd();
const read = (...p: string[]) => readFileSync(path.join(root, ...p), "utf8");

describe("content/perspectives.json", () => {
  const file = getPerspectivesFile();

  it("has 10 to 20 entries whose sources exist and that read as plain answers", () => {
    expect(file.entries.length).toBeGreaterThanOrEqual(10);
    expect(file.entries.length).toBeLessThanOrEqual(20);
    expect(perspectiveIssues(file, getContent())).toEqual([]);
  });

  it("publishes exactly the approved entries: getPerspectives is the only way in", () => {
    expect(getPerspectives().map((e) => e.id)).toEqual(publishedPerspectives(file).map((e) => e.id));
    if (file.status === "draft") expect(getPerspectives().every((e) => e.approved === true)).toBe(true);
  });

  it("has draft fingerprints that no published text contains, so the export scan proves drafts stay out", () => {
    const published = [
      read("content", "site-content.json"),
      ...readdirSync(path.join(root, "content", "blog")).map((f) => read("content", "blog", f)),
      ...readdirSync(path.join(root, "messages")).map((f) => read("messages", f)),
    ].join("\n");
    const prints = draftFingerprints(file);
    expect(prints.every((p) => p.split(" ").length >= 4), prints.join(" | ")).toBe(true);
    expect(findBlockedTerms(published, prints)).toEqual([]);
  });
});

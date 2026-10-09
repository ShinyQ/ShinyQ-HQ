import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { allTechLogos, getTechLogo, isTextOnlyTech, normalizeTech, TEXT_ONLY_TECH } from "@/content/tech";

const root = process.cwd();
const content = JSON.parse(readFileSync(path.join(root, "content", "site-content.json"), "utf8"));

function contentStackNames(): string[] {
  const names = new Set<string>();
  for (const pod of content.floors.labs.pods) pod.stack.forEach((s: string) => names.add(s));
  for (const entry of content.floors.careerArchive.entries) entry.stack.forEach((s: string) => names.add(s));
  for (const group of content.skills) group.items.forEach((s: string) => names.add(s));
  for (const project of content.sideProjects) project.stack.forEach((s: string) => names.add(s));
  return [...names];
}

describe("tech logos", () => {
  it("resolves every stack and skill name in content or allowlists it as text-only", () => {
    const unresolved = contentStackNames().filter((name) => !getTechLogo(name) && !isTextOnlyTech(name));
    expect(unresolved).toEqual([]);
  });

  it("keeps the text-only allowlist free of names that have a logo", () => {
    expect([...TEXT_ONLY_TECH].filter((name) => getTechLogo(name))).toEqual([]);
  });

  it("points every logo at a committed file under public/tech", () => {
    const missing = allTechLogos().filter((logo) => !existsSync(path.join(root, "public", logo.src)));
    expect(missing).toEqual([]);
    expect(allTechLogos().every((logo) => logo.src.startsWith("/tech/"))).toBe(true);
  });

  it("normalizes case, versions and parentheticals", () => {
    expect(normalizeTech("Next.js 14")).toBe("next.js");
    expect(normalizeTech("Azure OpenAI (incl. Realtime)")).toBe("azure openai");
    expect(normalizeTech("  Bootstrap  5 ")).toBe("bootstrap");
    expect(normalizeTech("k6")).toBe("k6");
  });

  it("resolves aliases and compound skill names", () => {
    expect(getTechLogo("Express.js")?.src).toBe("/tech/express.svg");
    expect(getTechLogo("express")?.label).toBe("Express");
    expect(getTechLogo("Durable Functions")?.src).toBe("/tech/azure-functions.svg");
    expect(getTechLogo("Node.js / Express")?.src).toBe("/tech/nodejs.svg");
    expect(getTechLogo("Azure OpenAI (incl. Realtime)")?.src).toBe("/tech/azure-openai.svg");
    expect(getTechLogo("AWS Lambda")?.label).toBe("AWS");
  });

  it("returns null for unknown names so callers fall back to text chips", () => {
    expect(getTechLogo("Totally Unknown Framework")).toBeNull();
    expect(getTechLogo("Semgrep")).toBeNull();
    expect(isTextOnlyTech("IndoBERT / NLP")).toBe(true);
  });
});

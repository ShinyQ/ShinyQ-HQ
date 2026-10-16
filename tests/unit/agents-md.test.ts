import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// AGENTS.md is loaded by every agent session, so it stays a short index; detail lives in docs/agents/.
const root = path.resolve(__dirname, "../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

const MAX_BYTES = 25 * 1024;
const MAX_LINE = 400;

const agents = read("AGENTS.md");
const agentDocs = readdirSync(path.join(root, "docs/agents")).filter((f) => f.endsWith(".md"));

// Relative markdown link targets (no scheme, no pure anchors), without their #fragment.
function relativeLinks(markdown: string): string[] {
  return [...markdown.matchAll(/\]\(([^)\s]+)\)/g)]
    .map((m) => m[1])
    .filter((href) => !/^[a-z]+:/i.test(href) && !href.startsWith("#"))
    .map((href) => href.split("#")[0]);
}

describe("AGENTS.md", () => {
  it(`stays under ${MAX_BYTES} bytes`, () => {
    expect(Buffer.byteLength(agents, "utf8")).toBeLessThanOrEqual(MAX_BYTES);
  });

  it(`has no line over ${MAX_LINE} characters`, () => {
    const long = agents
      .split("\n")
      .map((line, i) => ({ line: i + 1, length: line.length }))
      .filter((l) => l.length > MAX_LINE);
    expect(long).toEqual([]);
  });

  it("links only to files that exist", () => {
    const missing = relativeLinks(agents).filter((href) => !existsSync(path.join(root, href)));
    expect(missing).toEqual([]);
  });

  it("links every docs/agents file, and every linked docs/agents file exists", () => {
    const linked = relativeLinks(agents)
      .filter((href) => href.startsWith("docs/agents/") && href.endsWith(".md"))
      .map((href) => href.slice("docs/agents/".length));
    expect(linked.length).toBeGreaterThan(0);
    for (const file of linked) expect(agentDocs).toContain(file);
    for (const file of agentDocs) expect(linked).toContain(file);
  });

  it("is imported by CLAUDE.md", () => {
    expect(read("CLAUDE.md").trim()).toBe("@AGENTS.md");
  });
});

describe("docs/agents", () => {
  it.each(agentDocs)("%s links only to files that exist", (file) => {
    const dir = path.join(root, "docs/agents");
    const missing = relativeLinks(read(path.join("docs/agents", file))).filter(
      (href) => !existsSync(path.resolve(dir, href)),
    );
    expect(missing).toEqual([]);
  });
});

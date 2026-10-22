import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EM_DASH, collectStrings, findForbiddenPatterns, leafForbiddenPatterns } from "@/content/safety";

const root = process.cwd();
const read = (...p: string[]) => readFileSync(path.join(root, ...p), "utf8");
const content = JSON.parse(read("content", "site-content.json"));
const perspectives = JSON.parse(read("content", "perspectives.json"));
const siteBuild = JSON.parse(read("content", "ask", "site-build.json"));
const postDiagrams = JSON.parse(read("content", "blog", "diagrams.json"));
const buildStory = JSON.parse(read("content", "build-story.json"));
const studyGuides = JSON.parse(read("content", "study-guides.json"));
const blogFiles = readdirSync(path.join(root, "content", "blog")).filter((f) => f.endsWith(".mdx"));
const messageFiles = readdirSync(path.join(root, "messages")).filter((f) => f.endsWith(".json"));

describe("public-safety lint", () => {
  it("finds no forbidden pattern in site-content.json", () => {
    const hits = collectStrings(content).flatMap((leaf) => {
      const found = leafForbiddenPatterns(leaf);
      return found.length ? [`${leaf.path}: ${found.join(", ")}`] : [];
    });
    expect(hits).toEqual([]);
  });

  it("finds no forbidden pattern in content/perspectives.json (drafts included: the repo is public)", () => {
    const hits = collectStrings(perspectives).flatMap(({ path: at, value }) => {
      const found = findForbiddenPatterns(value);
      return found.length ? [`${at}: ${found.join(", ")}`] : [];
    });
    expect(hits).toEqual([]);
  });

  it("finds no forbidden pattern in content/ask/site-build.json (Ask knowledge only)", () => {
    const hits = collectStrings(siteBuild).flatMap(({ path: at, value }) => {
      const found = findForbiddenPatterns(value);
      return found.length ? [`${at}: ${found.join(", ")}`] : [];
    });
    expect(hits).toEqual([]);
  });

  it("finds no forbidden pattern in content/blog/diagrams.json (post architecture diagrams)", () => {
    const hits = collectStrings(postDiagrams).flatMap(({ path: at, value }) => {
      const found = findForbiddenPatterns(value);
      return found.length ? [`${at}: ${found.join(", ")}`] : [];
    });
    expect(hits).toEqual([]);
  });

  it("finds no forbidden pattern in content/build-story.json (the public build story)", () => {
    const hits = collectStrings(buildStory).flatMap(({ path: at, value }) => {
      const found = findForbiddenPatterns(value);
      return found.length ? [`${at}: ${found.join(", ")}`] : [];
    });
    expect(hits).toEqual([]);
  });

  it("finds no forbidden pattern in content/study-guides.json (the study guide shelf and reader)", () => {
    const hits = collectStrings(studyGuides, "study-guides").flatMap((leaf) => {
      const found = leafForbiddenPatterns(leaf);
      return found.length ? [`${leaf.path}: ${found.join(", ")}`] : [];
    });
    expect(collectStrings(studyGuides).length).toBeGreaterThan(20);
    expect(hits).toEqual([]);
  });

  it.each(blogFiles)("finds no em dash in content/blog/%s", (file) => {
    expect(read("content", "blog", file).includes(EM_DASH)).toBe(false);
  });

  it.each(messageFiles)("finds no forbidden pattern in messages/%s", (file) => {
    const strings = collectStrings(JSON.parse(read("messages", file)));
    const hits = strings.flatMap(({ path: at, value }) => {
      const found = findForbiddenPatterns(value);
      return found.length ? [`${at}: ${found.join(", ")}`] : [];
    });
    expect(hits).toEqual([]);
  });

  it("publishes no photo in content (C5 revised: only the owner portrait, in public/brand and public/og-assets)", () => {
    expect(content.profile.photo).toBeUndefined();
    expect(JSON.stringify(content)).not.toMatch(/portrait|pas[ -]?photo/i);
  });
});

describe("no em dashes in source", () => {
  const SOURCE_DIRS = ["src", "scripts", "tests", "e2e", "docs", "messages", "content", ".github"];
  const ROOT_FILES = ["README.md", "AGENTS.md", "CLAUDE.md", "package.json"];
  const walk = (dir: string): string[] => {
    try {
      return readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((d) =>
        d.isDirectory() ? (d.name === "_fragments" ? [] : walk(path.join(dir, d.name))) : [path.join(dir, d.name)],
      );
    } catch {
      return [];
    }
  };
  const files = [...SOURCE_DIRS.flatMap(walk), ...ROOT_FILES].filter((f) => /\.(tsx?|mts|mjs|json|mdx?|ya?ml|css|txt)$/.test(f));

  it("has no U+2014 in any tracked text file", () => {
    const offenders = files.filter((f) => {
      try {
        return read(f).includes(EM_DASH);
      } catch {
        return false;
      }
    });
    expect(offenders).toEqual([]);
  });
});

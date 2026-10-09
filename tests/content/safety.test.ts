import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EM_DASH, collectStrings, findBlockedTerms, findForbiddenPatterns, loadBlocklist } from "@/content/safety";

const root = process.cwd();
const read = (...p: string[]) => readFileSync(path.join(root, ...p), "utf8");
const content = JSON.parse(read("content", "site-content.json"));
const blogFiles = readdirSync(path.join(root, "content", "blog")).filter((f) => f.endsWith(".mdx"));
const messageFiles = readdirSync(path.join(root, "messages")).filter((f) => f.endsWith(".json"));

describe("public-safety lint", () => {
  const terms = loadBlocklist();

  it("loads a blocklist", () => {
    expect(terms.length).toBeGreaterThan(0);
  });

  it("finds no blocklisted term or forbidden pattern in site-content.json", () => {
    const hits = collectStrings(content).flatMap(({ path: at, value }) => {
      const found = [...findBlockedTerms(value, terms), ...findForbiddenPatterns(value)];
      return found.length ? [`${at}: ${found.join(", ")}`] : [];
    });
    expect(hits).toEqual([]);
  });

  it.each(blogFiles)("finds no blocklisted term or em dash in content/blog/%s", (file) => {
    const text = read("content", "blog", file);
    expect(findBlockedTerms(text, terms)).toEqual([]);
    expect(text.includes(EM_DASH)).toBe(false);
  });

  it.each(messageFiles)("finds no blocklisted term or forbidden pattern in messages/%s", (file) => {
    const strings = collectStrings(JSON.parse(read("messages", file)));
    const hits = strings.flatMap(({ path: at, value }) => {
      const found = [...findBlockedTerms(value, terms), ...findForbiddenPatterns(value)];
      return found.length ? [`${at}: ${found.join(", ")}`] : [];
    });
    expect(hits).toEqual([]);
  });

  it("publishes no photo (C5)", () => {
    expect(content.profile.photo).toBeUndefined();
    expect(JSON.stringify(content)).not.toMatch(/portrait|pas[ -]?photo/i);
  });
});

describe("no em dashes in source", () => {
  const SOURCE_DIRS = ["src", "scripts", "tests", "e2e", "docs", "messages", "content", ".github"];
  const ROOT_FILES = ["README.md", "AGENTS.md", "package.json"];
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

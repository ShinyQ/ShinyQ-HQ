import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SiteContentSchema } from "@/content/schema";
import { isTitleCase } from "@/content/title-case";
import { frontmatterTitle, titleCaseChanges, titleSlots } from "@/content/titles";

const root = process.cwd();
const content = SiteContentSchema.parse(JSON.parse(readFileSync(path.join(root, "content", "site-content.json"), "utf8")));
const blogDir = path.join(root, "content", "blog");
const blogFiles = readdirSync(blogDir).filter((f) => f.endsWith(".mdx"));

describe("Title Case content titles (fix with: bun scripts/title-case.ts --write)", () => {
  it("covers pods, posts, publications, talks, side projects, awards and principles", () => {
    const paths = titleSlots(content).map((s) => s.path);
    for (const prefix of ["floors.labs.pods[", "floors.library.posts[", "floors.library.publications[", "floors.library.talks[", "sideProjects[", "awards[", "profile.principles["]) {
      expect(paths.some((p) => p.startsWith(prefix)), prefix).toBe(true);
    }
    // Title in both locales, plus the short title where a pod sets one.
    const pods = content.floors.labs.pods;
    expect(paths.filter((p) => p.startsWith("floors.labs.pods["))).toHaveLength((pods.length + pods.filter((p) => p.shortTitle).length) * 2);
  });

  it("has every title in site-content.json in Title Case", () => {
    expect(titleCaseChanges(content).map((c) => `${c.path}: "${c.before}" should be "${c.after}"`)).toEqual([]);
  });

  it.each(blogFiles)("has a Title Case frontmatter title that matches site-content.json in content/blog/%s", (file) => {
    const [slug, locale] = file.replace(/\.mdx$/, "").split(".") as [string, "en" | "id"];
    const title = frontmatterTitle(readFileSync(path.join(blogDir, file), "utf8"));
    expect(title, "frontmatter title").toBeDefined();
    expect(isTitleCase(title!), title).toBe(true);
    const post = content.floors.library.posts.find((p) => p.slug === slug);
    expect(post?.title[locale], `posts[${slug}].title.${locale}`).toBe(title);
  });
});

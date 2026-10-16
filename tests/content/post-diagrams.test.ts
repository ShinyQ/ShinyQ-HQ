import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { listBlogFiles } from "@/content/blog";
import { getContent } from "@/content/load";
import { architectureRefs, getPostDiagrams, resolvePostArchitecture } from "@/content/post-diagrams";

const files = listBlogFiles();
const refsOf = (slug: string, locale: string) => {
  const f = files.find((x) => x.slug === slug && x.locale === locale);
  return f ? architectureRefs(readFileSync(f.file, "utf8")) : [];
};

describe("post architecture diagrams", () => {
  it("resolves every Architecture tag and gives it a caption", () => {
    for (const { slug, locale, file } of files)
      for (const ref of architectureRefs(readFileSync(file, "utf8"))) {
        expect(() => resolvePostArchitecture(slug, ref), `${slug}.${locale}`).not.toThrow();
        expect(ref.caption?.trim(), `${slug}.${locale} caption`).toBeTruthy();
      }
  });
  it("shows the same diagrams in both languages", () => {
    for (const slug of new Set(files.map((f) => f.slug))) {
      const key = (l: string) => refsOf(slug, l).map((r) => r.pod ?? `diagram:${r.diagram}`);
      if (files.filter((f) => f.slug === slug).length === 2) expect(key("id"), slug).toEqual(key("en"));
    }
  });
  it("keys diagrams by hosted posts and uses each one", () => {
    const hosted = new Set(getContent().floors.library.posts.filter((p) => !p.url).map((p) => p.slug));
    for (const [post, diagrams] of Object.entries(getPostDiagrams())) {
      expect(hosted.has(post), post).toBe(true);
      for (const id of Object.keys(diagrams)) expect(refsOf(post, "en").some((r) => r.diagram === id), `${post}/${id}`).toBe(true);
    }
  });
});

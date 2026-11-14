import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { POST_SUMMARY_MAX, POST_SUMMARY_PARAGRAPHS, PostRefSchema } from "@/content/schema";
import en from "../../messages/en.json";
import id from "../../messages/id.json";

// Owner decision 2026-11-14: every hosted post opens with an AI Summary block, 3 to 5 short paragraphs in the
// language the post is written in. External posts (no `/blog` page) never carry one.
const content = JSON.parse(readFileSync(path.join(process.cwd(), "content", "site-content.json"), "utf8"));
const posts = content.floors.library.posts as {
  slug: string;
  url?: string;
  languages: ("en" | "id")[];
  excerpt: { en: string; id: string };
  summary?: { en?: string; id?: string }[];
}[];

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

describe("post AI summaries", () => {
  const hosted = posts.filter((post) => !post.url);

  it("covers every hosted post", () => {
    expect(hosted.length).toBeGreaterThan(0);
    expect(hosted.filter((post) => !post.summary).map((post) => post.slug)).toEqual([]);
  });

  it.each(hosted.map((post) => [post.slug, post] as const))("%s has 3 to 5 paragraphs in the post's own languages", (_slug, post) => {
    expect(post.summary!.length).toBeGreaterThanOrEqual(POST_SUMMARY_PARAGRAPHS.min);
    expect(post.summary!.length).toBeLessThanOrEqual(POST_SUMMARY_PARAGRAPHS.max);
    for (const locale of post.languages) expect(post.summary!.every((paragraph) => paragraph[locale]?.trim()), locale).toBe(true);
  });

  it.each(hosted.map((post) => [post.slug, post] as const))("%s stays a hook: bounded paragraphs, no repeats, not the excerpt", (_slug, post) => {
    for (const locale of post.languages) {
      const paragraphs = post.summary!.map((paragraph) => paragraph[locale]!);
      expect(paragraphs.every((text) => text.length >= 60 && text.length <= POST_SUMMARY_MAX), `${locale} length`).toBe(true);
      expect(new Set(paragraphs).size, `${locale} repeats a paragraph`).toBe(paragraphs.length);
      expect(paragraphs, `${locale} repeats the excerpt`).not.toContain(post.excerpt[locale]);
      const total = paragraphs.reduce((sum, text) => sum + words(text), 0);
      expect(total, `${locale} words`).toBeGreaterThanOrEqual(90);
      expect(total, `${locale} words`).toBeLessThanOrEqual(180);
    }
  });

  it.each(hosted.map((post) => [post.slug, post] as const))("%s uses neutral synopsis voice", (_slug, post) => {
    for (const locale of post.languages) {
      const summary = post.summary!.map((paragraph) => paragraph[locale]!).join(" ");
      const words = summary.toLowerCase().match(/[a-z]+/g) ?? [];
      const personalPronouns = locale === "en" ? ["i", "me", "my", "mine", "we", "us", "our", "ours", "you", "your", "yours"] : ["saya", "aku", "kami", "kita", "anda", "kamu"];
      expect(words, `${locale} point of view`).not.toEqual(expect.arrayContaining(personalPronouns));
    }
  });

  it("leaves external posts without a page unsummarised", () => {
    expect(posts.filter((post) => post.url && post.summary).map((post) => post.slug)).toEqual([]);
  });

  it("labels the block as generated in both languages", () => {
    expect(en.blog.summary).toBe("AI Summary");
    expect(id.blog.summary).toBe("Ringkasan AI");
  });
});

describe("PostRef.summary contract", () => {
  const post = {
    slug: "a-post",
    title: { en: "A Post", id: "Sebuah Tulisan" },
    date: "2026-11-14",
    track: "personal",
    tags: ["personal"],
    languages: ["en", "id"],
    excerpt: { en: "An excerpt.", id: "Sebuah ringkasan." },
  };
  const paragraph = { en: "A".repeat(80), id: "B".repeat(80) };

  it("accepts 3 to 5 paragraphs with one language each", () => {
    expect(() => PostRefSchema.parse({ ...post, summary: [paragraph, paragraph, paragraph] })).not.toThrow();
    expect(() => PostRefSchema.parse({ ...post, summary: [{ id: paragraph.id }, { id: paragraph.id }, { id: paragraph.id }] })).not.toThrow();
  });

  it("rejects too few paragraphs, too many and an over-long one", () => {
    expect(() => PostRefSchema.parse({ ...post, summary: [paragraph, paragraph] })).toThrow();
    expect(() => PostRefSchema.parse({ ...post, summary: Array.from({ length: 6 }, () => paragraph) })).toThrow();
    expect(() => PostRefSchema.parse({ ...post, summary: [{ en: "A".repeat(POST_SUMMARY_MAX + 1), id: "x" }, paragraph, paragraph] })).toThrow();
  });

  it("rejects a paragraph with no language at all", () => {
    expect(() => PostRefSchema.parse({ ...post, summary: [{}, paragraph, paragraph] })).toThrow();
  });
});

import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { compilePost } from "@/components/blog/compile";
import { headingSlug, readingMinutes, readingWords } from "@/components/blog/headings";
import { listBlogFiles } from "@/content/blog";

// The architecture figure reads next-intl on the server; this test is about the Markdown around it.
vi.mock("@/components/blog/PostArchitecture", () => ({ PostArchitecture: () => <figure /> }));

// A GFM table: a pipe row followed by its delimiter row (`|---|:--:|`).
const TABLE = /^\|.*\|[ \t]*\r?\n\|(?:[ \t]*:?-+:?[ \t]*\|)+[ \t]*$/gm;
const posts = listBlogFiles();

/** Renders like the static export: async server components (the architecture figure) resolve first. */
async function render(node: ReactNode) {
  const stream = await renderToReadableStream(node);
  await stream.allReady;
  return new Response(stream).text();
}

describe("blog post MDX", () => {
  it("has at least one post with a Markdown table to guard", () => {
    expect(posts.some((p) => readFileSync(p.file, "utf8").match(TABLE))).toBe(true);
  });

  it.each(posts.map((p) => [`${p.slug}.${p.locale}`, p] as const))("%s renders Markdown tables as <table>", async (_, p) => {
    const source = readFileSync(p.file, "utf8");
    const { content } = await compilePost(source, p.slug, p.locale, "Scrollable table");
    const html = await render(content);
    const tables = source.match(TABLE)?.length ?? 0;
    expect(html.match(/<table>/g)?.length ?? 0).toBe(tables);
    expect(html.match(/<div class="prose-table" role="region" aria-label="Scrollable table" tabindex="0"><table>/g)?.length ?? 0).toBe(tables);
    expect(html).not.toMatch(/\|\s*-{3,}\s*\|/);
  });
});

describe("post contents and reading time", () => {
  it.each(posts.map((p) => [`${p.slug}.${p.locale}`, p] as const))("%s: every h2 gets a unique id that the contents link to", async (_, p) => {
    const source = readFileSync(p.file, "utf8");
    const { content, headings } = await compilePost(source, p.slug, p.locale, "Scrollable table");
    const html = await render(content);
    const h2 = [...html.matchAll(/<h2 id="([^"]+)">/g)].map((m) => m[1]);
    expect(headings.map((h) => h.id)).toEqual(h2);
    expect(new Set(h2).size).toBe(h2.length);
    expect(h2.length).toBe(source.replace(/^```[\s\S]*?^```/gm, "").match(/^## /gm)?.length ?? 0);
    for (const h of headings) expect(h.label).toMatch(/\S/);
  });

  it("slugs headings to plain URL fragments", () => {
    expect(headingSlug("A workspace an agent can pick up in sixty seconds")).toBe("a-workspace-an-agent-can-pick-up-in-sixty-seconds");
    expect(headingSlug("What `MediaLink` changed, and why?")).toBe("what-medialink-changed-and-why");
    expect(headingSlug("Kenapa berubah: café 2.0")).toBe("kenapa-berubah-cafe-2-0");
    expect(headingSlug("!!!")).toBe("section");
  });

  it("counts reading words without code, tags or link targets", () => {
    const source = "---\ntitle: x\n---\nOne two [three](https://example.com/a-b-c).\n\n```ts\nconst skipped = 1;\n```\n\n<Architecture pod=\"x\" caption=\"y\" />\n\n## Four five";
    expect(readingWords(source)).toBe(5);
    expect(readingMinutes(source)).toBe(1);
    expect(readingMinutes("word ".repeat(2200))).toBe(10);
  });
});


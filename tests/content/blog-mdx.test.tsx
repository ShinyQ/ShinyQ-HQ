import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { compilePost } from "@/components/blog/compile";
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

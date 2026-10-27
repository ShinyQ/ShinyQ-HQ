import { compileMDX } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import type { Locale } from "@/content/schema";
import { postMdxComponents } from "./mdx";

/** Compiles a post's MDX at build time with GitHub Flavored Markdown (tables); the page and the tests share it. Server only. */
export function compilePost(source: string, post: string, locale: Locale, tableLabel: string) {
  return compileMDX({
    source,
    components: postMdxComponents(post, locale, tableLabel),
    options: { parseFrontmatter: true, mdxOptions: { remarkPlugins: [remarkGfm] } },
  });
}

import { compileMDX } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import type { Locale } from "@/content/schema";
import { remarkPostHeadings, type PostHeading } from "./headings";
import { postMdxComponents } from "./mdx";

/**
 * Compiles a post's MDX at build time with GitHub Flavored Markdown (tables) and ids on its h2 headings; the page and
 * the tests share it. Returns the content and the h2 headings in order (the page's "On this page" contents). Server only.
 */
export async function compilePost(source: string, post: string, locale: Locale, tableLabel: string) {
  const headings: PostHeading[] = [];
  const { content } = await compileMDX({
    source,
    components: postMdxComponents(post, locale, tableLabel),
    options: { parseFrontmatter: true, mdxOptions: { remarkPlugins: [remarkGfm, remarkPostHeadings(headings)] } },
  });
  return { content, headings };
}

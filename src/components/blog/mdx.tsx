import type { ArchitectureRef } from "@/content/post-diagrams";
import type { Locale } from "@/content/schema";
import { PostArchitecture } from "./PostArchitecture";

/** MDX components for one post page; props are strings (next-mdx-remote blocks JS expressions). */
export function postMdxComponents(post: string, locale: Locale) {
  return {
    Architecture: (props: ArchitectureRef & { caption: string }) => <PostArchitecture {...props} post={post} locale={locale} />,
  };
}

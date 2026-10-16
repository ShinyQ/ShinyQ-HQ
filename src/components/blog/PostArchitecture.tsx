import { ArchitectureDiagram } from "@/components/ArchitectureDiagram";
import { resolvePostArchitecture, type ArchitectureRef } from "@/content/post-diagrams";
import type { Locale } from "@/content/schema";

/** A post's architecture figure: the case-study diagram (or a post-local one) plus a caption. Server only. */
export function PostArchitecture({ post, locale, caption, ...ref }: ArchitectureRef & { post: string; locale: Locale; caption: string }) {
  const architecture = resolvePostArchitecture(post, ref);
  return (
    <figure className="not-prose my-10" data-post-architecture={ref.pod ?? ref.diagram}>
      <ArchitectureDiagram architecture={architecture} locale={locale} />
      <figcaption className="mt-3 text-sm leading-6 text-ink-3">{caption}</figcaption>
    </figure>
  );
}

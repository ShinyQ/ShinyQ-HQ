import { readFileSync } from "node:fs";
import path from "node:path";
import { getPods } from "./load";
import { PostDiagramsSchema, type Architecture, type PostDiagrams } from "./schema";

export const POST_DIAGRAMS_FILE = path.join(process.cwd(), "content", "blog", "diagrams.json");

let cached: PostDiagrams | undefined;
export function getPostDiagrams(): PostDiagrams {
  return (cached ??= PostDiagramsSchema.parse(JSON.parse(readFileSync(POST_DIAGRAMS_FILE, "utf8"))));
}

export type ArchitectureRef = { pod?: string; diagram?: string };
type Sources = { pods: readonly { slug: string; architecture?: Architecture }[]; diagrams: PostDiagrams };

export function resolvePostArchitecture(post: string, ref: ArchitectureRef, sources?: Sources): Architecture {
  const { pods, diagrams } = sources ?? { pods: getPods(), diagrams: getPostDiagrams() };
  if (!ref.pod === !ref.diagram) throw new Error(`Post "${post}": <Architecture> needs exactly one of pod or diagram`);
  if (ref.pod) {
    const pod = pods.find((p) => p.slug === ref.pod);
    if (!pod) throw new Error(`Post "${post}": unknown pod "${ref.pod}" in <Architecture>`);
    if (!pod.architecture) throw new Error(`Post "${post}": pod "${ref.pod}" has no architecture`);
    return pod.architecture;
  }
  const found = diagrams[post]?.[ref.diagram!];
  if (!found) throw new Error(`Post "${post}": unknown diagram "${ref.diagram}" (content/blog/diagrams.json)`);
  return found;
}

const TAG = /<Architecture\b([^>]*?)\/>/g;
const PROP = /(\w+)="([^"]*)"/g;
export function architectureRefs(mdx: string): (ArchitectureRef & { caption?: string })[] {
  return [...mdx.matchAll(TAG)].map((m) => Object.fromEntries([...m[1].matchAll(PROP)].map((p) => [p[1], p[2]])));
}

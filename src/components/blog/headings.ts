/**
 * Section headings of a post, for its "On this page" contents: a remark plugin gives every h2 a stable id (a slug of
 * its text, numbered on repeats) and records it, at build time. Server only; no dependency beyond the MDX AST.
 */

/** The mdast shape the plugin reads (headings, text, inline code, links and emphasis). */
interface MdNode {
  type: string;
  depth?: number;
  value?: string;
  children?: MdNode[];
  data?: { hProperties?: Record<string, unknown> };
}

export interface PostHeading {
  id: string;
  label: string;
}

/** Visible text of a node: text and inline code values, joined. */
export function nodeText(node: MdNode): string {
  if (node.type === "text" || node.type === "inlineCode") return node.value ?? "";
  return (node.children ?? []).map(nodeText).join("");
}

/** URL fragment for a heading: lower case letters and digits joined by hyphens (Latin accents dropped). */
export function headingSlug(text: string): string {
  const slug = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "section";
}

/** remark plugin: ids on every h2, collected in document order into `into`. */
export function remarkPostHeadings(into: PostHeading[]) {
  return () => (tree: MdNode) => {
    const seen = new Map<string, number>();
    const visit = (node: MdNode) => {
      if (node.type === "heading" && node.depth === 2) {
        const label = nodeText(node).trim();
        const base = headingSlug(label);
        const count = (seen.get(base) ?? 0) + 1;
        seen.set(base, count);
        const id = count === 1 ? base : `${base}-${count}`;
        node.data = { ...node.data, hProperties: { ...node.data?.hProperties, id } };
        into.push({ id, label });
        return;
      }
      for (const child of node.children ?? []) visit(child);
    };
    visit(tree);
  };
}

/** Words a reader reads: the MDX source without code fences, JSX tags, Markdown syntax and URLs. */
export function readingWords(source: string): number {
  const text = source
    .replace(/^---[\s\S]*?\n---\n/, "")
    .replace(/^```[\s\S]*?^```/gm, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\]\([^)]*\)/g, "]")
    .replace(/[#>*_`|[\]-]+/g, " ");
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/** Minutes to read a post at 220 words a minute, at least 1. */
export const readingMinutes = (source: string) => Math.max(1, Math.round(readingWords(source) / 220));

import { isInstructionLike } from "../../functions/_lib/text";
import type { Locale, Perspective, PerspectivesFile, SiteContent } from "./schema";

/**
 * Kurniadi's written perspectives (content/perspectives.json): the publication gate and pure
 * helpers. Every surface (About, Quick view, the Ask knowledge pack) reads entries through
 * `publishedPerspectives` (via `getPerspectives()` in `@/content/load`), so a draft never ships.
 */

export const PERSPECTIVE_ANCHOR_PREFIX = "perspectives-";

/** Published when the entry says `approved: true`, or has no `approved` field and the file status is "approved". */
export function isPublished(entry: Pick<Perspective, "approved">, file: Pick<PerspectivesFile, "status">): boolean {
  return entry.approved ?? file.status === "approved";
}

export function publishedPerspectives(file: PerspectivesFile): Perspective[] {
  return file.entries.filter((entry) => isPublished(entry, file));
}

export function draftPerspectives(file: PerspectivesFile): Perspective[] {
  return file.entries.filter((entry) => !isPublished(entry, file));
}

/** Element id of an entry on About and Quick view. */
export const perspectiveAnchor = (id: string) => `${PERSPECTIVE_ANCHOR_PREFIX}${id}`;

/** Page View path (no locale prefix) that Ask cites for an entry. */
export const perspectivePath = (id: string) => `/contact#${perspectiveAnchor(id)}`;

export interface PerspectiveLink {
  href: string;
  label: string;
  /** External posts (Medium) open in a new tab; everything else is an internal Page View path. */
  external: boolean;
}

/** Related links of an entry, resolved against the dataset. Unknown sources are skipped (`perspectiveIssues` reports them). */
export function perspectiveLinks(entry: Perspective, content: SiteContent, locale: Locale): PerspectiveLink[] {
  const { posts, talks } = content.floors.library;
  return (entry.sources ?? []).flatMap((source): PerspectiveLink[] => {
    if (source.kind === "post") {
      const post = posts.find((p) => p.slug === source.slug);
      if (!post) return [];
      return [post.url ? { href: post.url, label: post.title[locale], external: true } : { href: `/blog/${post.slug}`, label: post.title[locale], external: false }];
    }
    if (source.kind === "talk") {
      const talk = talks.find((t) => t.id === source.slug);
      return talk ? [{ href: "/library#talks", label: talk.title[locale], external: false }] : [];
    }
    const pod = content.floors.labs.pods.find((p) => p.slug === source.slug);
    return pod ? [{ href: `/labs/${pod.slug}`, label: pod.title[locale], external: false }] : [];
  });
}

/**
 * Checks beyond the schema, as readable errors: every source exists, no source is a personal essay
 * (posts tagged "personal"), and no sentence reads like an instruction to a model (T2).
 */
export function perspectiveIssues(file: PerspectivesFile, content: SiteContent): string[] {
  const issues: string[] = [];
  const posts = new Map(content.floors.library.posts.map((p) => [p.slug, p]));
  const talks = new Set(content.floors.library.talks.map((t) => t.id));
  const pods = new Set(content.floors.labs.pods.map((p) => p.slug));
  for (const entry of file.entries) {
    for (const source of entry.sources ?? []) {
      const known = source.kind === "post" ? posts.has(source.slug) : source.kind === "talk" ? talks.has(source.slug) : pods.has(source.slug);
      if (!known) issues.push(`${entry.id}: unknown ${source.kind} "${source.slug}"`);
      if (source.kind === "post" && posts.get(source.slug)?.tags.includes("personal")) {
        issues.push(`${entry.id}: post "${source.slug}" is a personal essay, not a professional source`);
      }
    }
    for (const locale of ["en", "id"] as const) {
      const sentences = [entry.question[locale], entry.answer[locale]].flatMap((text) => text.split(/(?<=[.!?])\s+/));
      if (sentences.some(isInstructionLike)) issues.push(`${entry.id} (${locale}): reads like an instruction to a model`);
    }
  }
  return issues;
}

/** Up to six leading words, stopping before a word with markup or quote characters and after one ending in punctuation. */
function leadPhrase(text: string): string {
  const words: string[] = [];
  for (const word of text.split(/\s+/)) {
    if (/[&<>"']/.test(word) || words.length === 6) break;
    if (/[.,:;!?]$/.test(word)) {
      words.push(word.slice(0, -1));
      break;
    }
    words.push(word);
  }
  return words.join(" ");
}

/**
 * Short phrases of every unpublished entry (answer lead, or the question when the answer lead is
 * under four words), used to prove that no draft text reaches the static export (e2e/pageview.spec.ts).
 */
export function draftFingerprints(file: PerspectivesFile): string[] {
  return draftPerspectives(file).flatMap((entry) =>
    (["en", "id"] as const).map((locale) => {
      const lead = leadPhrase(entry.answer[locale]);
      return lead.split(" ").length >= 4 ? lead : leadPhrase(entry.question[locale]);
    }),
  );
}

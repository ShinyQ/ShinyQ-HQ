import { isAskCite } from "../ask/protocol";
import { isInstructionLike } from "../../functions/_lib/text";
import type { Perspective, PerspectivesFile, SiteContent } from "./schema";

/**
 * Kurniadi's written perspectives (content/perspectives.json): the publication gate and pure
 * helpers. Owner decision 2026-10-14: they are Ask the HQ knowledge only, with no page or section
 * of their own. The knowledge pack reads entries through `publishedPerspectives` (via
 * `getPerspectives()` in `@/content/load`), so a draft never ships.
 */

/**
 * Topic tags of the owner's endorsed answers (2026-10-15). `lifestyle` and `policy` are routed
 * deterministically (`routedTopic` in functions/_lib/scope.ts): those questions are answered from
 * the entries with that tag only. The 15 engineering entries carry none.
 */
export const PERSPECTIVE_TOPICS = ["work-style", "ai-industry", "indonesia-tech", "policy", "lifestyle"] as const;
export type PerspectiveTopic = (typeof PERSPECTIVE_TOPICS)[number];

/** The entry's topic tag, if it has one. */
export function perspectiveTopic(entry: Pick<Perspective, "tags">): PerspectiveTopic | undefined {
  return entry.tags.find((tag): tag is PerspectiveTopic => (PERSPECTIVE_TOPICS as readonly string[]).includes(tag));
}

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

/**
 * Page View path (no locale prefix) of the first backing source Ask may cite for an entry: a hosted
 * post (`/blog/<slug>`), a project case study (`/labs/<slug>`) or the Library for a talk. External
 * posts (Medium) and unknown sources are skipped; an entry without a citable source gets none.
 */
export function perspectiveSourcePath(entry: Pick<Perspective, "sources">, content: SiteContent): string | undefined {
  const { posts, talks } = content.floors.library;
  for (const source of entry.sources ?? []) {
    const path =
      source.kind === "post"
        ? posts.some((p) => p.slug === source.slug && !p.url && !p.tags.includes("personal"))
          ? `/blog/${source.slug}`
          : undefined
        : source.kind === "talk"
          ? talks.some((t) => t.id === source.slug)
            ? "/library"
            : undefined
          : content.floors.labs.pods.some((p) => p.slug === source.slug)
            ? `/labs/${source.slug}`
            : undefined;
    if (path && isAskCite(path)) return path;
  }
  return undefined;
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
 * Short phrases of the given entries (answer lead, or the question when the answer lead is under
 * four words), used to prove that no perspective text reaches the static export: they live in the
 * Ask knowledge pack only (e2e/pageview.spec.ts).
 */
export function perspectiveFingerprints(entries: readonly Perspective[]): string[] {
  return entries.flatMap((entry) =>
    (["en", "id"] as const).map((locale) => {
      const lead = leadPhrase(entry.answer[locale]);
      return lead.split(" ").length >= 4 ? lead : leadPhrase(entry.question[locale]);
    }),
  );
}

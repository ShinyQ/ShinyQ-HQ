import type { LocalizedText, SiteContent } from "./schema";
import { titleCase } from "./title-case";

/** One Title Case field: where it lives in `site-content.json` and its current value. */
export interface TitleSlot {
  path: string;
  get: () => string;
  set: (value: string) => void;
}

export interface TitleChange {
  path: string;
  before: string;
  after: string;
}

const localized = (path: string, text: LocalizedText): TitleSlot[] =>
  (["en", "id"] as const).map((locale) => ({
    path: `${path}.${locale}`,
    get: () => text[locale],
    set: (value) => {
      text[locale] = value;
    },
  }));

const plain = <T extends { title: string }>(path: string, item: T): TitleSlot => ({
  path,
  get: () => item.title,
  set: (value) => {
    item.title = value;
  },
});

/**
 * Every title shown as a heading: pods, L4 reader tracks, posts, publications (papers, thesis, models), talks, side
 * projects, awards and principles. Not titles: role titles, org and certification names, skill
 * group labels (rendered uppercase), mission labels (actions) and body text.
 */
export function titleSlots(content: SiteContent): TitleSlot[] {
  const { labs, library } = content.floors;
  return [
    ...labs.pods.flatMap((p, i) => localized(`floors.labs.pods[${i}](${p.slug}).title`, p.title)),
    ...labs.pods.flatMap((p, i) => (p.shortTitle ? localized(`floors.labs.pods[${i}](${p.slug}).shortTitle`, p.shortTitle) : [])),
    ...library.tracks.flatMap((t, i) => localized(`floors.library.tracks[${i}](${t.slug}).title`, t.title)),
    ...library.posts.flatMap((p, i) => localized(`floors.library.posts[${i}](${p.slug}).title`, p.title)),
    ...library.publications.map((p, i) => plain(`floors.library.publications[${i}](${p.id}).title`, p)),
    ...library.talks.flatMap((t, i) => localized(`floors.library.talks[${i}](${t.id}).title`, t.title)),
    ...content.sideProjects.map((p, i) => plain(`sideProjects[${i}](${p.id}).title`, p)),
    ...content.awards.map((a, i) => plain(`awards[${i}](${a.id}).title`, a)),
    ...content.profile.principles.flatMap((p, i) => localized(`profile.principles[${i}](${p.id}).title`, p.title)),
  ];
}

/** Titles that `titleCase` would change (empty when the dataset is consistent). */
export function titleCaseChanges(content: SiteContent): TitleChange[] {
  return titleSlots(content).flatMap((slot) => {
    const before = slot.get();
    const after = titleCase(before);
    return before === after ? [] : [{ path: slot.path, before, after }];
  });
}

/** Rewrites every title in place and returns what changed. */
export function applyTitleCase(content: SiteContent): TitleChange[] {
  const changes = titleCaseChanges(content);
  const slots = new Map(titleSlots(content).map((slot) => [slot.path, slot]));
  for (const change of changes) slots.get(change.path)!.set(change.after);
  return changes;
}

const FRONTMATTER_TITLE = /^(---\r?\n(?:[^\n]*\n)*?)title: "((?:[^"\\]|\\.)*)"(\r?\n)/;

/** The `title: "..."` line of an MDX post's frontmatter. */
export function frontmatterTitle(source: string): string | undefined {
  const match = FRONTMATTER_TITLE.exec(source);
  return match ? JSON.parse(`"${match[2]}"`) : undefined;
}

/** The same MDX source with its frontmatter title replaced (nothing else changes). */
export function withFrontmatterTitle(source: string, title: string): string {
  return source.replace(FRONTMATTER_TITLE, (_all, head: string, _old: string, eol: string) => `${head}title: ${JSON.stringify(title)}${eol}`);
}

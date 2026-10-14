import type { PostRef, Publication, RoomId, Talk } from "./schema";
import { isResearch } from "./selectors";
import { ITEM_TOPICS, TOPIC_TAGS, TOPIC_UNMAPPED, TOPICS, type TopicSlug } from "./topic-map";

/**
 * L4 Topic Constellation index (owner request 2026-10-14): every post, paper, model and talk on the
 * topics of `topic-map.ts`, with the room that shows it on the floor. Built at build time, never edited
 * by hand: the 3D payload, the drawer view, the HUD index (Cmd-K) and the Classic `/library` filter all
 * read it.
 */
export type { TopicSlug } from "./topic-map";

export type TopicItemKind = "post" | "research" | "model" | "talk";

export interface TopicItem {
  kind: TopicItemKind;
  /** Post slug or publication or talk id. */
  id: string;
  /** Where it lives on L4: the post's station, or the Research, Models or Talks desk. */
  room: RoomId;
}

export interface TopicEntry {
  slug: TopicSlug;
  /** Posts newest first, then research, models and talks (content order). */
  items: TopicItem[];
}

export interface TopicIndex {
  /** Every topic in `TOPICS` order. */
  topics: TopicEntry[];
  /** Items on the explicit allowlist (`TOPIC_UNMAPPED`). */
  unmapped: string[];
}

const TAG_TOPIC = new Map<string, TopicSlug>(TOPICS.flatMap((topic) => TOPIC_TAGS[topic].map((tag) => [tag, topic] as const)));

/** The topic a post tag folds into; null for a tag in no topic. */
export function topicOfTag(tag: string): TopicSlug | null {
  return TAG_TOPIC.get(tag) ?? null;
}

export function buildTopicIndex(library: { posts: readonly Pick<PostRef, "slug" | "date" | "tags">[]; publications: readonly Pick<Publication, "id" | "kind">[]; talks: readonly Pick<Talk, "id">[] }): TopicIndex {
  const byTopic = new Map<TopicSlug, TopicItem[]>(TOPICS.map((t) => [t, []]));
  const add = (topics: Iterable<TopicSlug>, item: TopicItem) => {
    for (const topic of new Set(topics)) byTopic.get(topic)!.push(item);
  };
  for (const post of [...library.posts].sort((a, b) => b.date.localeCompare(a.date))) {
    add(post.tags.map(topicOfTag).filter((t): t is TopicSlug => t !== null), { kind: "post", id: post.slug, room: `L4:${post.slug}` as RoomId });
  }
  const research = library.publications.filter((p) => isResearch(p.kind));
  const models = library.publications.filter((p) => !isResearch(p.kind));
  for (const p of research) add(ITEM_TOPICS[p.id] ?? [], { kind: "research", id: p.id, room: "L4:research" });
  for (const p of models) add(ITEM_TOPICS[p.id] ?? [], { kind: "model", id: p.id, room: "L4:publications" });
  for (const t of library.talks) add(ITEM_TOPICS[t.id] ?? [], { kind: "talk", id: t.id, room: "L4:talks" });
  return { topics: TOPICS.map((slug) => ({ slug, items: byTopic.get(slug)! })), unmapped: [...TOPIC_UNMAPPED] };
}

/** Topics of one item (post slug or publication or talk id), in `TOPICS` order. */
export function topicsOfItem(index: TopicIndex, id: string): TopicSlug[] {
  return index.topics.filter((t) => t.items.some((i) => i.id === id)).map((t) => t.slug);
}

/** Distinct rooms of a topic's items, in item order (a desk appears once). */
export function topicRooms(entry: TopicEntry): RoomId[] {
  return [...new Set(entry.items.map((i) => i.room))];
}

import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import id from "../../messages/id.json";
import { getLibrary } from "@/content/load";
import { ITEM_TOPICS, TOPIC_SKIP_TAGS, TOPIC_TAGS, TOPIC_UNMAPPED, TOPICS } from "@/content/topic-map";
import { buildTopicIndex, topicOfTag, topicsOfItem } from "@/content/topic-index";
import { isResearch } from "@/content/selectors";

const library = getLibrary();
const index = buildTopicIndex(library);
const nonPosts = [...library.publications.map((p) => p.id), ...library.talks.map((t) => t.id)];

describe("L4 topic index (Topic Constellation)", () => {
  it("maps every post, paper, thesis, model and talk to at least one topic (or the explicit allowlist)", () => {
    for (const post of library.posts) {
      if (TOPIC_UNMAPPED.has(post.slug)) continue;
      expect(topicsOfItem(index, post.slug).length, post.slug).toBeGreaterThan(0);
    }
    for (const itemId of nonPosts) {
      if (TOPIC_UNMAPPED.has(itemId)) continue;
      expect(topicsOfItem(index, itemId).length, itemId).toBeGreaterThan(0);
    }
    expect(index.unmapped).toEqual([...TOPIC_UNMAPPED]);
  });

  it("folds every post tag into one topic or skips it on purpose", () => {
    for (const tag of new Set(library.posts.flatMap((p) => p.tags))) {
      const topic = topicOfTag(tag);
      const skipped = TOPIC_SKIP_TAGS.has(tag);
      expect(topic !== null || skipped, `tag ${tag} has no topic`).toBe(true);
      expect(topic !== null && skipped, `tag ${tag} is both mapped and skipped`).toBe(false);
    }
  });

  it("keeps the explicit maps free of stale entries", () => {
    const tags = new Set(library.posts.flatMap((p) => p.tags));
    for (const [topic, list] of Object.entries(TOPIC_TAGS)) for (const tag of list) expect(tags.has(tag), `${topic}: ${tag}`).toBe(true);
    for (const tag of TOPIC_SKIP_TAGS) expect(tags.has(tag), tag).toBe(true);
    const ids = new Set(nonPosts);
    for (const itemId of Object.keys(ITEM_TOPICS)) expect(ids.has(itemId), itemId).toBe(true);
    const all = new Set([...ids, ...library.posts.map((p) => p.slug)]);
    for (const itemId of TOPIC_UNMAPPED) expect(all.has(itemId), itemId).toBe(true);
    // A tag maps to one topic only.
    const seen = Object.values(TOPIC_TAGS).flat();
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("gives every topic at least one item, a kebab slug and labels in both languages", () => {
    expect(index.topics.map((t) => t.slug)).toEqual([...TOPICS]);
    for (const t of index.topics) {
      expect(t.items.length, t.slug).toBeGreaterThan(0);
      expect(t.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(en.library.topics.names[t.slug], `en ${t.slug}`).toBeTruthy();
      expect(id.library.topics.names[t.slug], `id ${t.slug}`).toBeTruthy();
    }
    expect(Object.keys(en.library.topics.names).sort()).toEqual([...TOPICS].sort());
    expect(Object.keys(id.library.topics.names).sort()).toEqual([...TOPICS].sort());
  });

  it("orders items posts newest first, then research, models and talks, with their rooms", () => {
    const cases = index.topics.find((t) => t.slug === "case-study")!;
    expect(cases.items.every((i) => i.kind === "post")).toBe(true);
    expect(cases.items).toHaveLength(library.posts.filter((p) => p.tags.includes("case-study")).length);
    const dates = cases.items.map((i) => library.posts.find((p) => p.slug === i.id)!.date);
    expect([...dates].sort().reverse()).toEqual(dates);

    const sentiment = index.topics.find((t) => t.slug === "sentiment-analysis")!;
    const kinds = sentiment.items.map((i) => i.kind);
    expect(kinds).toEqual([...kinds].sort((a, b) => ["post", "research", "model", "talk"].indexOf(a) - ["post", "research", "model", "talk"].indexOf(b)));
    for (const item of sentiment.items) {
      const pub = library.publications.find((p) => p.id === item.id)!;
      expect(item.room).toBe(isResearch(pub.kind) ? "L4:research" : "L4:publications");
    }
    const agents = index.topics.find((t) => t.slug === "ai-agents")!;
    expect(agents.items.filter((i) => i.kind === "talk").every((i) => i.room === "L4:talks")).toBe(true);
    expect(agents.items.find((i) => i.kind === "post")?.room).toBe("L4:spec-driven-development-with-ai-coding-agents");
  });

  it("never lists an item twice in one topic", () => {
    for (const t of index.topics) expect(new Set(t.items.map((i) => i.id)).size, t.slug).toBe(t.items.length);
  });
});

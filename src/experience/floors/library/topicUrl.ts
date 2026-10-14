import type { FloorId } from "@/content/schema";
import type { RoomTopics } from "@/content/room-views/types";
import type { TopicPick } from "@/store/useHQStore";
import { createFilterHashSync, type FilterUrlEnv } from "../filterUrl";
import { TOPIC_HASH } from "./topicHash";
import { topicFromView } from "./topics";

/** Minimal store surface (the real zustand store satisfies it). */
export interface TopicUrlStore {
  getState(): { floor: FloorId; phase: string; topics: { topic: TopicPick | null }; selectTopic: (topic: TopicPick) => void };
  subscribe(listener: (state: ReturnType<TopicUrlStore["getState"]>, prev: ReturnType<TopicUrlStore["getState"]>) => void): () => void;
}

/**
 * Topic Constellation deep link (owner request 2026-10-14): `#library-topic=<slug>` mirrors the picked
 * topic while the rover is on L4, and a hash present on load picks that topic once the drawer data
 * (`L4:topics`) arrives. Returns a disposer.
 */
export function createTopicHashSync({ store, env }: { store: TopicUrlStore; env: FilterUrlEnv<RoomTopics> }): () => void {
  return createFilterHashSync({
    store,
    env,
    spec: {
      floor: "L4",
      key: TOPIC_HASH,
      picked: (s) => s.topics.topic,
      slugOf: (topic) => topic.slug,
      fromView: topicFromView,
      select: (s, topic) => s.selectTopic(topic),
    },
  });
}

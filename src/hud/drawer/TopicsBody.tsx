"use client";

import { useTranslations } from "next-intl";
import type { RoomTopics } from "@/content/room-views/types";
import type { TopicItemKind } from "@/content/topic-index";
import { goToRoom } from "@/experience/missions/bridge";
import { getHQStore, useHQStore, type TopicPick } from "@/store/useHQStore";
import type { RoomBodyProps } from "./bodies";
import { FILTER_ACTION, FilterOption, FilterPiece } from "./filterParts";

const KIND_LABEL: Record<TopicItemKind, "posts" | "research" | "publications" | "talks"> = { post: "posts", research: "research", model: "publications", talk: "talks" };

/** The store pick for a topic of the drawer view. */
export function topicPick(topic: RoomTopics["topics"][number]): TopicPick {
  return { slug: topic.slug, name: topic.label, count: topic.items.length, rooms: [...new Set(topic.items.map((i) => i.room))] };
}

/** The selected topic: "N pieces on X", its pieces (each rides to its station or desk). */
function Selection({ topics }: { topics: RoomTopics }) {
  const t = useTranslations("library.topics");
  const tl = useTranslations("library");
  const slug = useHQStore((s) => s.topics.topic?.slug ?? null);
  const topic = topics.topics.find((x) => x.slug === slug);
  if (!topic) return null;
  return (
    <section className="space-y-2" data-testid="topics-selection" data-topic={topic.slug} aria-live="polite">
      <h3 className="label text-ink-2">{t("selection", { topic: topic.label })}</h3>
      <p className="text-sm text-ink" data-testid="topics-pieces">
        {t("pieces", { count: topic.items.length, topic: topic.label })}
      </p>
      <ul className="space-y-1">
        {topic.items.map((item) => (
          <li key={`${item.kind}:${item.title}`}>
            <FilterPiece title={item.title} meta={tl(KIND_LABEL[item.kind])} onClick={() => goToRoom(item.room)} data={{ "data-testid": "topic-piece", "data-room": item.room }} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * L4 Topic Constellation (kind "topics"): every topic of the writing with its piece count, and the
 * selection with its pieces. Picking a topic lights its stations and desks on the floor (store
 * `topics.topic`, `#library-topic=<slug>`); picking it again or Clear turns them off.
 */
export function TopicsBody({ view }: RoomBodyProps) {
  const t = useTranslations("library.topics");
  const selected = useHQStore((s) => s.topics.topic?.slug ?? null);
  const topics = view.topics;
  if (!topics) return null;
  const store = getHQStore().getState;

  return (
    <div className="space-y-5" data-testid="topics-body">
      <Selection topics={topics} />
      {selected && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={FILTER_ACTION} onClick={() => store().clearTopic()} data-testid="topics-clear">
            {t("clear")}
          </button>
        </div>
      )}
      <section className="space-y-2">
        <h3 className="label text-ink-2">{t("listLabel")}</h3>
        <ul className="grid gap-1 sm:grid-cols-2" data-testid="topics-list">
          {topics.topics.map((topic) => {
            const on = topic.slug === selected;
            return (
              <li key={topic.slug}>
                <FilterOption
                  on={on}
                  accent="cyan"
                  label={topic.label}
                  count={t("count", { count: topic.items.length })}
                  onClick={() => (on ? store().clearTopic() : store().selectTopic(topicPick(topic)))}
                  data={{ "data-topic": topic.slug }}
                />
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

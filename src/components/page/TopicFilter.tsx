"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, type ReactNode } from "react";
import { setSearchParams, useSearch } from "./urlState";

export interface TopicChip {
  slug: string;
  label: string;
  count: number;
}

/** The `?topic=` filter of the Writing page: a known topic slug, else null (everything shows). */
export function parseTopicFilter(search: string, slugs: readonly string[]): string | null {
  const value = new URLSearchParams(search).get("topic");
  return value && slugs.includes(value) ? value : null;
}

/**
 * Topic filter over the server-rendered Writing page (`data-topic-row`, `data-topics`): the same topics as
 * the L4 Topic Constellation. Rows off the topic hide, and so does a section left with no row. The query
 * string is the state (`?topic=`), so links (Cmd-K "Show writing about X") and reloads keep the view.
 * Without JS everything stays visible.
 */
export function TopicFilter({ topics, total, children }: { topics: readonly TopicChip[]; total: number; children: ReactNode }) {
  const t = useTranslations("library.topics");
  const topic = parseTopicFilter(useSearch(), topics.map((x) => x.slug));
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = list.current;
    if (!root) return;
    for (const row of root.querySelectorAll<HTMLElement>("[data-topic-row]")) row.hidden = topic !== null && !(row.dataset.topics ?? "").split(" ").includes(topic);
    for (const section of root.querySelectorAll<HTMLElement>("section")) {
      if (!section.querySelector("[data-topic-row]")) continue;
      section.hidden = !section.querySelector("[data-topic-row]:not([hidden])");
    }
  }, [topic]);

  return (
    <>
      <div className="pv-wrap mt-10 lg:mt-14" id="topics">
        <div role="group" aria-label={t("filters")} className="pv-filters flex flex-wrap items-center gap-1.5 px-3 py-2" data-testid="topic-filter">
          <span className="pv-meta mr-2">{t("listLabel")}</span>
          <button type="button" className="chip min-h-11" aria-pressed={topic === null} onClick={() => setSearchParams({ topic: null })}>
            {t("all")}
            <span className="chip-count">{total}</span>
          </button>
          {topics.map((x) => (
            <button key={x.slug} type="button" className="chip min-h-11" aria-pressed={topic === x.slug} onClick={() => setSearchParams({ topic: x.slug })} data-topic={x.slug}>
              {x.label}
              <span className="chip-count">{x.count}</span>
            </button>
          ))}
        </div>
      </div>
      <div ref={list}>{children}</div>
    </>
  );
}

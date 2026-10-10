"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, type ReactNode } from "react";
import { ENTRY_TYPES, parseTypeFilter, type EntryType } from "@/content/pageview";
import { ACCENT_TEXT, TYPE_ACCENT } from "@/lib/accent";
import { setSearchParams, useSearch } from "./urlState";

/** Entry-type filter over the server-rendered timeline (`data-entry`, `data-type`, `data-year`). */
export function JourneyFilter({ counts, children }: { counts: Record<"all" | EntryType, number>; children: ReactNode }) {
  const t = useTranslations("journey");
  const tc = useTranslations("common");
  const type = parseTypeFilter(useSearch());
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = list.current;
    if (!root) return;
    for (const row of root.querySelectorAll<HTMLElement>("[data-entry]")) row.hidden = type !== "all" && row.dataset.type !== type;
    for (const year of root.querySelectorAll<HTMLElement>("[data-year]")) year.hidden = !year.querySelector("[data-entry]:not([hidden])");
  }, [type]);

  return (
    <>
      <div className="pv-wrap mt-10 lg:mt-14">
        <div role="group" aria-label={t("filters")} className="glass pv-filters flex flex-wrap items-center gap-1.5 px-3 py-2">
          <span className="pv-data mr-2">{t("show")}</span>
          <button type="button" className="chip min-h-11" aria-pressed={type === "all"} onClick={() => setSearchParams({ type: null })}>
            {t("all")}
            <span className="chip-count">{counts.all}</span>
          </button>
          {ENTRY_TYPES.map((entryType) => (
            <button
              key={entryType}
              type="button"
              className="chip min-h-11 disabled:cursor-not-allowed disabled:opacity-50"
              aria-pressed={type === entryType}
              disabled={counts[entryType] === 0}
              onClick={() => setSearchParams({ type: entryType })}
            >
              <span aria-hidden="true" className={`pv-mark ${type === entryType ? "" : ACCENT_TEXT[TYPE_ACCENT[entryType]]}`} />
              {tc(`type.${entryType}`)}
              <span className="chip-count">{counts[entryType]}</span>
            </button>
          ))}
        </div>
      </div>
      <div ref={list}>{children}</div>
    </>
  );
}

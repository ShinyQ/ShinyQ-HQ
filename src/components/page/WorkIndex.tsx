"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { matchesPod, parsePodFilter, stackOptions, wingCounts, type PodFilter, type Wing } from "@/content/pageview";
import type { Pod } from "@/content/schema";
import { setSearchParams, useSearch } from "./urlState";

const WING_ORDER: readonly ("all" | Wing)[] = ["all", "ai", "software"];

/**
 * Wing and stack filter over server-rendered project lists. Rows carry `podAttrs` data
 * attributes; without JS every project stays visible.
 */
export function WorkIndex({ pods, minStack = 2, children }: { pods: readonly Pick<Pod, "wing" | "stack">[]; minStack?: number; children: ReactNode }) {
  const t = useTranslations("work");
  const filter = parsePodFilter(useSearch());
  const list = useRef<HTMLDivElement>(null);
  const counts = useMemo(() => wingCounts(pods), [pods]);
  const stacks = useMemo(() => stackOptions(pods, minStack), [pods, minStack]);
  const shown = pods.filter((pod) => matchesPod(pod, filter)).length;
  const { wing, stack } = filter;

  useEffect(() => {
    const root = list.current;
    if (!root) return;
    const current: PodFilter = { wing, stack };
    for (const row of root.querySelectorAll<HTMLElement>("[data-pod]")) {
      row.hidden = !matchesPod({ wing: row.dataset.wing as Wing, stack: (row.dataset.stack ?? "").split("|") }, current);
    }
    for (const block of root.querySelectorAll<HTMLElement>("[data-pod-block]")) {
      block.hidden = !block.querySelector("[data-pod]:not([hidden])");
    }
  }, [wing, stack]);

  const clear = () => setSearchParams({ wing: null, stack: null });

  return (
    <>
      <div className="pv-wrap mt-10 lg:mt-14">
        <div role="search" aria-label={t("filters")} className="glass pv-filters flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2">
          <div role="group" aria-labelledby="filter-wing" className="flex flex-wrap items-center gap-1.5">
            <span id="filter-wing" className="pv-data mr-1">
              {t("wing")}
            </span>
            {WING_ORDER.map((w) => (
              <button
                key={w}
                type="button"
                className="chip min-h-11"
                aria-pressed={wing === w}
                onClick={() => setSearchParams({ wing: w === "all" ? null : w })}
              >
                {w === "all" ? t("all") : t(`wingShort.${w}`)}
                <span className="chip-count">{counts[w]}</span>
              </button>
            ))}
          </div>
          <span aria-hidden="true" className="hidden h-6 w-px bg-line md:block" />
          <label className="flex min-h-11 items-center gap-2">
            <span className="pv-data">{t("stack")}</span>
            <select className="pv-select" value={stack ?? ""} onChange={(e) => setSearchParams({ stack: e.target.value || null })}>
              <option value="">{t("anyStack")}</option>
              {stacks.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name} ({s.count})
                </option>
              ))}
            </select>
          </label>
          <p role="status" className="pv-data w-full pb-1 md:ml-auto md:w-auto md:pb-0">
            {t("showing", { shown, total: pods.length })}
          </p>
        </div>
      </div>
      <div ref={list}>{children}</div>
      {shown === 0 && (
        <div className="pv-wrap pv-sec">
          <p className="pv-lead">{t("empty")}</p>
          <button type="button" className="pv-btn pv-btn-ghost mt-6" onClick={clear}>
            {t("clear")}
          </button>
        </div>
      )}
    </>
  );
}

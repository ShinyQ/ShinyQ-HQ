"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { withParams } from "@/content/pageview";
import { clampPage, pageCount, pageRange, pageWindow, parsePage } from "@/content/pagination";
import { setSearchParams, useSearch } from "./urlState";

const ITEMS = "[data-page-item]";

/**
 * Pagination over a server-rendered list it does not own (owner decision 2026-11-13). Items carry `pageItemAttrs`; the
 * page lives in the query string (`param`). It pages only the items a filter left visible: filters set `hidden`, this
 * sets `data-paged-out`, so the two never collide, and a `MutationObserver` on `hidden` recounts after any filter
 * change (filter effects run after this child's). Without JS every item shows and the pager hides (`pageview.css`).
 */
export function Paginated({ param, size, total, label, headingId, children }: { param: string; size: number; total: number; label: string; headingId: string; children: ReactNode }) {
  const t = useTranslations("common.pager");
  const search = useSearch();
  const root = useRef<HTMLDivElement>(null);
  const focusOnChange = useRef(false);
  const [count, setCount] = useState(total);
  const requested = parsePage(search, param);
  const page = clampPage(requested, count, size);
  const pages = pageCount(count, size);
  const { from, to } = pageRange(page, count, size);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    el.dataset.paged = "";
    const recount = () => setCount(el.querySelectorAll(`${ITEMS}:not([hidden])`).length);
    recount();
    const observer = new MutationObserver(recount);
    observer.observe(el, { subtree: true, attributes: true, attributeFilter: ["hidden"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let i = 0;
    for (const item of el.querySelectorAll<HTMLElement>(ITEMS)) {
      if (item.hidden) {
        item.removeAttribute("data-paged-out");
        continue;
      }
      item.toggleAttribute("data-paged-out", i < from - 1 || i >= to);
      i += 1;
    }
    if (focusOnChange.current) {
      focusOnChange.current = false;
      const heading = document.getElementById(headingId);
      if (heading) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
        heading.scrollIntoView?.({ block: "start" });
      }
    }
  }, [from, to, count, headingId]);

  useEffect(() => {
    // An out-of-range or malformed page in the URL is rewritten to the page actually shown (page 1 drops the param).
    const current = new URLSearchParams(search).get(param);
    const wanted = page === 1 ? null : String(page);
    if (current !== wanted && (current !== null || wanted !== null)) setSearchParams({ [param]: wanted });
  }, [search, param, page]);

  const go = (n: number) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    if (n === page) return;
    focusOnChange.current = true;
    setSearchParams({ [param]: n === 1 ? null : String(n) });
  };
  const href = (n: number) => withParams(search, { [param]: n === 1 ? null : String(n) }) || "?";

  return (
    <div ref={root}>
      {children}
      {pages > 1 && (
        <nav aria-label={label} data-pager className="mt-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <ul className="flex flex-wrap items-center gap-1.5">
            <li>
              {page > 1 ? (
                <a className="chip min-h-11" href={href(page - 1)} onClick={go(page - 1)} rel="prev">
                  {t("prev")}
                </a>
              ) : (
                <a className="chip min-h-11" aria-disabled="true">
                  {t("prev")}
                </a>
              )}
            </li>
            {pageWindow(page, pages).map((n, i) =>
              n === null ? (
                <li key={`gap-${i}`} aria-hidden="true" className="px-1 text-ink-2">
                  …
                </li>
              ) : (
                <li key={n}>
                  <a
                    className="chip min-h-11 min-w-11 justify-center"
                    href={href(n)}
                    onClick={go(n)}
                    aria-label={t("page", { page: n })}
                    aria-current={n === page ? "page" : undefined}
                  >
                    {n}
                  </a>
                </li>
              ),
            )}
            <li>
              {page < pages ? (
                <a className="chip min-h-11" href={href(page + 1)} onClick={go(page + 1)} rel="next">
                  {t("next")}
                </a>
              ) : (
                <a className="chip min-h-11" aria-disabled="true">
                  {t("next")}
                </a>
              )}
            </li>
          </ul>
          <p className="pv-meta" data-testid="pager-range">
            {t("range", { from, to, total: count })}
          </p>
        </nav>
      )}
    </div>
  );
}

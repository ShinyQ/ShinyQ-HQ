"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { matchesCertFilter, parseCertFilter, type CertStatus, type CertView } from "@/content/certs";
import { setSearchParams, useSearch } from "@/components/page/urlState";
import { preloadCertDialog } from "@/components/dialog-loaders";
import { openCert } from "@/hud/events";
import { IssuerMark } from "./IssuerMark";

export interface CertFilterData {
  issuers: { issuer: string; logo: string | null; count: number }[];
  statuses: CertStatus[];
}

/**
 * Island over the server-rendered certification cards and rows: every `[data-cert-open]` button opens
 * the preview card in `DialogHost` (`openCert`), and with `filters` an issuer, status and search bar toggles `hidden` on the
 * `[data-cert]` rows. Issuer and status live in the query string; while a filter is on, the featured
 * cards step aside and their rows (`data-featured`) join the list.
 */
export function CertIndex({ certs, filters, children }: { certs: CertView[]; filters: CertFilterData | null; children: ReactNode }) {
  const t = useTranslations("certs");
  const root = useRef<HTMLDivElement>(null);
  const search = useSearch();
  const [q, setQ] = useState("");
  const { issuer, status } = parseCertFilter(search, filters?.issuers.map((i) => i.issuer) ?? []);
  const active = Boolean(filters && (issuer || status || q.trim()));
  const shown = filters ? new Set(certs.filter((c) => matchesCertFilter(c, { issuer, status, q })).map((c) => c.id)) : null;

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const onClick = (e: MouseEvent) => {
      const id = (e.target as Element | null)?.closest<HTMLElement>("[data-cert-open]")?.dataset.certOpen;
      const cert = id ? certs.find((c) => c.id === id) : undefined;
      if (cert) openCert(cert);
    };
    // The dialog chunk loads on the first hover or focus, so the first click opens at once.
    const preload = () => preloadCertDialog();
    el.addEventListener("click", onClick);
    el.addEventListener("pointerover", preload, { once: true });
    el.addEventListener("focusin", preload, { once: true });
    return () => {
      el.removeEventListener("click", onClick);
      el.removeEventListener("pointerover", preload);
      el.removeEventListener("focusin", preload);
    };
  }, [certs]);

  const key = shown ? [...shown].join("|") : "";
  useEffect(() => {
    const el = root.current;
    if (!el || !filters) return;
    const visible = new Set(key ? key.split("|") : []);
    for (const row of el.querySelectorAll<HTMLElement>("[data-cert]")) {
      row.hidden = row.dataset.featured !== undefined && !active ? true : !visible.has(row.dataset.cert ?? "");
    }
    for (const block of el.querySelectorAll<HTMLElement>("[data-cert-featured]")) block.hidden = active;
  }, [key, active, filters]);

  return (
    <div ref={root}>
      {filters && (
        <div className="mb-8 grid gap-3" role="search" aria-label={t("filters")}>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("issuer")}>
            <button type="button" className="chip min-h-11" aria-pressed={!issuer} onClick={() => setSearchParams({ issuer: null })}>
              {t("allIssuers")}
              <span className="chip-count">{certs.length}</span>
            </button>
            {filters.issuers.map((i) => (
              <button key={i.issuer} type="button" className="chip group min-h-11" aria-pressed={issuer === i.issuer} onClick={() => setSearchParams({ issuer: i.issuer })}>
                {/* The light GitHub mark would vanish on the pressed (light) chip. */}
                <IssuerMark cert={i} size={16} className={i.logo === "/tech/github.svg" ? "group-aria-pressed:invert" : ""} />
                {i.issuer}
                <span className="chip-count">{i.count}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("searchPlaceholder")}
              aria-label={t("search")}
              className="min-h-11 min-w-0 flex-1 basis-56 rounded-full border border-line bg-surface-2 px-4 text-[14px] text-ink placeholder:text-ink-3"
            />
            {filters.statuses.length > 1 && (
              <select className="pv-select min-h-11" value={status ?? ""} aria-label={t("statusLabel")} onChange={(e) => setSearchParams({ status: e.target.value || null })}>
                <option value="">{t("anyStatus")}</option>
                {filters.statuses.map((s) => (
                  <option key={s} value={s}>
                    {t(`status.${s}`)}
                  </option>
                ))}
              </select>
            )}
          </div>
          <p className="pv-data" aria-live="polite">
            {active ? t("showing", { shown: shown?.size ?? 0, total: certs.length }) : t("summary", { count: certs.length, issuers: filters.issuers.length })}
          </p>
        </div>
      )}
      {children}
      {filters && active && shown?.size === 0 && (
        <p className="pv-small py-6">
          {t("noMatch")}{" "}
          <button
            type="button"
            className="pv-uline min-h-11 text-ink"
            onClick={() => {
              setQ("");
              setSearchParams({ issuer: null, status: null });
            }}
          >
            {t("clear")}
          </button>
        </p>
      )}
    </div>
  );
}

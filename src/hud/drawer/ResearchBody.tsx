"use client";

import { useTranslations } from "next-intl";
import { Fragment, type ReactNode } from "react";
import type { RoomResearchItem } from "@/content/room-views/types";
import type { RoomBodyProps } from "./bodies";

function External({ href, children, className = "link" }: { href: string; children: ReactNode; className?: string }) {
  const tc = useTranslations("common");
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
      <span aria-hidden="true"> &#8599;</span>
      <span className="sr-only"> ({tc("external")})</span>
    </a>
  );
}

/** Author list with the owner's name highlighted. */
export function Authors({ authors, self }: { authors: readonly string[]; self: string }) {
  return (
    <>
      {authors.map((name, i) => (
        <Fragment key={name}>
          {i > 0 && ", "}
          {name === self ? <strong className="font-semibold text-amber">{name}</strong> : name}
        </Fragment>
      ))}
    </>
  );
}

function Paper({ item, self }: { item: RoomResearchItem; self: string }) {
  const t = useTranslations("library");
  return (
    <li className="space-y-1.5 rounded-lg border border-glass-border p-3" data-testid="research-item">
      <p className="label text-amber">
        {item.kind} · {item.date}
      </p>
      <h3 className="text-[15px] leading-6 font-semibold text-ink">{item.href ? <External href={item.href}>{item.title}</External> : item.title}</h3>
      <p className="text-[13px] leading-5 text-ink-2">
        <span className="sr-only">{t("authors")}: </span>
        <Authors authors={item.authors} self={self} />
      </p>
      {item.venue && <p className="text-[13px] leading-5 text-ink-3 italic">{item.venue}</p>}
      {item.summary && <p className="text-sm leading-6 text-ink">{item.summary}</p>}
      <p className="flex flex-wrap gap-x-3 gap-y-1 text-[13px]">
        {item.doi && (
          <External href={`https://doi.org/${item.doi}`}>
            {t("doi")} {item.doi}
          </External>
        )}
        {item.pdf && <External href={item.pdf}>{t("pdf")}</External>}
        {item.code && <External href={item.code}>{t("code")}</External>}
      </p>
      {item.citations && <p className="text-[12px] text-ink-3">{item.citations}</p>}
    </li>
  );
}

/** Research shelf body: papers with highlighted authors, venue, DOI, summary, then the research profiles. */
export function ResearchBody({ view }: RoomBodyProps) {
  const t = useTranslations("library");
  const research = view.research;
  if (!research) return null;
  return (
    <div className="space-y-5">
      <ul className="space-y-3">
        {research.items.map((item) => (
          <Paper key={item.id} item={item} self={research.self} />
        ))}
      </ul>
      {research.profiles.length > 0 && (
        <section className="space-y-2">
          <h3 className="label text-ink-2">{t("profiles")}</h3>
          {research.metrics && <p className="text-sm text-ink-2">{research.metrics}</p>}
          <ul className="flex flex-wrap gap-2">
            {research.profiles.map((p) => (
              <li key={p.href}>
                <External
                  href={p.href!}
                  className="glass inline-flex min-h-11 items-center px-3 text-sm font-semibold text-ink transition hover:border-amber/60"
                >
                  {p.title}
                </External>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

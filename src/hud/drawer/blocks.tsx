"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { RoomLinkItem, RoomMetric, RoomSection } from "@/content/room-views/types";
import { goToRoom } from "@/experience/missions/bridge";
import { Link } from "@/i18n/navigation";

/** An outside link that opens in a new tab: an arrow for sighted readers, "opens in a new tab" for screen readers. */
export function External({ href, children, className = "link", testId }: { href: string; children: ReactNode; className?: string; testId?: string }) {
  const tc = useTranslations("common");
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className} data-testid={testId}>
      {children}
      <span aria-hidden="true"> &#8599;</span>
      <span className="sr-only"> ({tc("external")})</span>
    </a>
  );
}

/**
 * Result cards. `fluid` sizes the grid by its container (the drawer body), not the viewport: two
 * columns once the body is wide enough, and an odd last card spans the row.
 */
export function MetricTiles({ metrics, single = false, fluid = false }: { metrics: RoomMetric[]; single?: boolean; fluid?: boolean }) {
  const columns = single ? "" : fluid ? "@[22rem]:grid-cols-2 @[22rem]:[&>li:last-child:nth-child(odd)]:col-span-2" : "min-[420px]:grid-cols-2";
  return (
    <ul className={`grid gap-2 ${columns}`}>
      {metrics.map((m, i) => (
        <li key={i} className="flex flex-col gap-1 rounded-xl border border-glass-border bg-white/[0.03] p-3" data-testid="metric">
          <p className="text-[28px] leading-8 font-extrabold tracking-tight text-ink">{m.value}</p>
          <p className="text-sm leading-5 text-ink">{m.label}</p>
          {m.context && <p className="text-[13px] leading-5 text-ink-2">{m.context}</p>}
        </li>
      ))}
    </ul>
  );
}

function ItemLink({ item }: { item: RoomLinkItem }) {
  const t = useTranslations("common");
  const body = (
    <>
      <span className="flex items-center gap-2 text-sm font-semibold text-ink">
        {item.logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.logo} alt="" width={16} height={16} className="size-4 shrink-0 object-contain" />
        )}
        {item.title}
      </span>
      {item.meta && <span className="block text-[13px] leading-5 text-ink-2">{item.meta}</span>}
    </>
  );
  const row = "block min-h-11 rounded-md px-2 py-1.5 transition hover:bg-white/5";
  if (item.room) {
    const room = item.room;
    return (
      <button type="button" onClick={() => goToRoom(room)} className={`${row} w-full text-left`} data-testid="room-item" data-room={room}>
        {body}
      </button>
    );
  }
  if (!item.href) return <div className="py-1.5">{body}</div>;
  if (item.href.startsWith("/") && !item.external)
    return (
      <Link href={item.href} className={row}>
        {body}
      </Link>
    );
  return (
    <a
      href={item.href}
      target={item.external ? "_blank" : undefined}
      rel={item.external ? "noopener noreferrer" : undefined}
      className={row}
    >
      {body}
      {item.external && <span className="sr-only"> ({t("external")})</span>}
    </a>
  );
}

export function Sections({ sections }: { sections: RoomSection[] }) {
  return (
    <>
      {sections.map((section, i) => (
        <section key={i} className="space-y-2">
          {section.title && <h3 className="label text-ink-2">{section.title}</h3>}
          {section.body && <p className="text-[15px] leading-6 text-ink-2">{section.body}</p>}
          {section.bullets && (
            <ul className="space-y-2">
              {section.bullets.map((b, j) => (
                <li key={j} className="flex gap-2 text-[15px] leading-6 text-ink-2">
                  <span aria-hidden="true" className="label pt-1.5 text-cyan">
                    {String(j + 1).padStart(2, "0")}
                  </span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}
          {section.items && (
            <ul className="-mx-2">
              {section.items.map((item, j) => (
                <li key={j}>
                  <ItemLink item={item} />
                </li>
              ))}
            </ul>
          )}
          {section.chips && <Chips items={section.chips} logos={section.chipLogos} />}
        </section>
      ))}
    </>
  );
}

export function Chips({ items, logos }: { items: string[]; logos?: (string | null | undefined)[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <li key={`${item}-${i}`} className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-glass-border px-2.5 text-[13px] text-ink-2">
          {logos?.[i] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logos[i]} alt="" width={16} height={16} className="size-4" />
          )}
          {item}
        </li>
      ))}
    </ul>
  );
}

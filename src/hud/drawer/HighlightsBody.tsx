"use client";

import { useTranslations } from "next-intl";
import type { RoomCard } from "@/content/room-views/types";
import { TypeIcon } from "@/components/TypeIcon";
import { CAREER_TONE } from "@/experience/fx/holoIcons";
import { goToRoom } from "@/experience/missions/bridge";
import type { RoomBodyProps } from "./bodies";
import { LiveSiteLink } from "@/components/LiveSiteLink";
import { MetricTiles, Sections } from "./blocks";
import { ContactBody, CvBody } from "./RoofBody";

/** One card: the cover or type icon, title, subtitle and period; the whole card rides to its room. */
function CardButton({ card, action }: { card: RoomCard; action: string }) {
  return (
    <button
      type="button"
      onClick={() => goToRoom(card.room)}
      className="glass glass-solid flex min-h-11 w-full items-stretch gap-3 overflow-hidden p-2 text-left transition hover:border-cyan/60"
      data-testid="highlight-card"
      data-room={card.room}
    >
      {card.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={card.image.thumb}
          width={card.image.width}
          height={card.image.height}
          alt=""
          loading="lazy"
          decoding="async"
          className="aspect-[16/10] w-28 shrink-0 rounded-md bg-surface object-cover"
        />
      )}
      <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          {card.type && <TypeIcon type={card.type} size={16} color={CAREER_TONE[card.type]} className="shrink-0" />}
          {card.title}
        </span>
        {card.subtitle && <span className="text-[13px] leading-5 text-ink-2">{card.subtitle}</span>}
        {card.meta && <span className="label text-ink-3">{card.meta}</span>}
        <span className="label pt-1 text-cyan">{action}</span>
      </span>
    </button>
  );
}

/** Cards in their groups, in order (experience: Employment, then Freelance). */
function CardList({ cards }: { cards: RoomCard[] }) {
  const t = useTranslations("hall");
  const tc = useTranslations("common");
  const groups: { label?: string; cards: RoomCard[] }[] = [];
  for (const card of cards) {
    const last = groups.at(-1);
    if (last && last.label === card.group) last.cards.push(card);
    else groups.push({ label: card.group, cards: [card] });
  }
  return (
    <div className="space-y-5">
      {groups.map((group, i) => (
        <section key={group.label ?? i} className="space-y-2">
          {group.label && <h3 className="label text-ink-2">{group.label}</h3>}
          <ul className="space-y-2">
            {group.cards.map((card) => (
              <li key={card.room}>
                <CardButton card={card} action={card.room.startsWith("L3:") ? t("openProject") : t("openRole")} />
                {/* A link cannot sit inside the card button: the live site (R4-J) gets its own row under it. */}
                {card.live && <LiveSiteLink href={card.live} label={tc("visitLive")} srHint={tc("external")} className="mt-1 inline-flex min-h-11 items-center gap-1.5 px-2 text-sm font-semibold text-cyan" testId="highlight-live" />}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * Highlights Hall stations (kind "highlights"): cards for projects and roles, contact plus the CV for
 * the contact station, and the big numbers plus the intro for About me.
 */
export function HighlightsBody({ view }: RoomBodyProps) {
  if (view.cards?.length) return <CardList cards={view.cards} />;
  if (view.id === "L1:highlights-contact")
    return (
      <div className="space-y-6">
        <ContactBody view={{ ...view, sections: view.sections.slice(0, 1) }} />
        <CvBody view={{ ...view, sections: view.sections.slice(1) }} />
      </div>
    );
  return (
    <div className="space-y-5">
      {view.metrics.length > 0 && <MetricTiles metrics={view.metrics} fluid />}
      <Sections sections={view.sections} />
    </div>
  );
}

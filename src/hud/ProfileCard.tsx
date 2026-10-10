"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Monogram } from "@/components/Monogram";
import { ACCENT_TEXT, FLOOR_ACCENT } from "@/lib/accent";
import { useHQStore } from "@/store/useHQStore";
import type { ExperienceData } from "@/experience/types";

/** Top-left card: name, title, current floor and rooms visited (appendix 04: collapses to a pill on mobile). */
export function ProfileCard({ data, mobile }: { data: ExperienceData; mobile: boolean }) {
  const t = useTranslations("hud");
  const floor = useHQStore((s) => s.floor);
  const visited = useHQStore((s) => s.visited.length);
  const [open, setOpen] = useState(false);
  const accent = ACCENT_TEXT[FLOOR_ACCENT[floor]];

  if (mobile && !open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={false}
        aria-label={`${t("profile")}: ${data.profile.name}, ${floor} ${data.floors[floor].name}`}
        className="glass glass-solid pointer-events-auto absolute top-3 left-3 flex min-h-11 items-center gap-2 rounded-full py-1 pr-4 pl-1"
      >
        <Monogram text={data.profile.monogram} size={36} />
        <span className={`label ${accent}`}>{floor}</span>
      </button>
    );
  }

  return (
    <section
      aria-label={t("profile")}
      className="glass glass-solid pointer-events-auto absolute top-3 left-3 w-[min(280px,calc(100vw-5.5rem))] p-4 md:top-4 md:left-4 lg:w-[280px] md:w-60"
    >
      <div className="flex items-center gap-3">
        <Monogram text={data.profile.monogram} size={44} />
        <div className="min-w-0">
          <p className="truncate text-[15px] leading-5 font-bold text-ink">{data.profile.name}</p>
          <p className="text-[13px] leading-5 text-cyan">{data.profile.headline}</p>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-t border-glass-border pt-3">
        <dt className="label text-ink-3">{t("floor")}</dt>
        <dt className="label text-right text-ink-3">{t("visited")}</dt>
        <dd className="text-sm text-ink">
          <span className={`label mr-1.5 ${accent}`}>{floor}</span>
          {data.floors[floor].name}
        </dd>
        <dd className="text-right text-sm text-ink tabular-nums">
          {visited}/{data.roomCount}
        </dd>
      </dl>
      {/* Exploration progress (decorative; the count above carries the information). */}
      <div aria-hidden="true" className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none"
          style={{
            width: `${Math.min(100, (visited / Math.max(1, data.roomCount)) * 100)}%`,
            background: "linear-gradient(90deg, #818cf8, #22d3ee)",
            boxShadow: "0 0 10px rgb(129 140 248 / 0.6)",
          }}
        />
      </div>
      {mobile && (
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-expanded
          className="label mt-2 inline-flex min-h-11 items-center text-ink-2 hover:text-ink"
        >
          &#x2715; {t("profile")}
        </button>
      )}
    </section>
  );
}

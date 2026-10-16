"use client";

import { useTranslations } from "next-intl";
import { brandPhotoSrc, brandPhotoSrcSet } from "@/lib/brand-photo";
import { ACCENT_TEXT, FLOOR_ACCENT } from "@/lib/accent";
import { useHQStore } from "@/store/useHQStore";
import type { ExperienceData } from "@/experience/types";

/** Round photo badge (owner request): a 2 px cyan to violet ring like the old KAW monogram's edge. Decorative: the name is next to it. */
export function ProfilePhoto({ size }: { size: number }) {
  return (
    <span
      className="block shrink-0 rounded-full bg-[linear-gradient(135deg,var(--color-cyan),var(--color-violet))] p-[2px] shadow-[0_0_14px_-4px_var(--color-cyan)]"
      style={{ width: size, height: size }}
      data-testid="profile-photo"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={brandPhotoSrc(160)}
        srcSet={brandPhotoSrcSet()}
        sizes={`${size}px`}
        width={size - 4}
        height={size - 4}
        alt=""
        decoding="async"
        className="block size-full rounded-full bg-void object-cover"
      />
    </span>
  );
}

/**
 * Desktop top-left card: name, title and current floor (phones and tablets show the profile in the menu
 * sheet instead). Visited rooms stay in the store for missions, but the card no longer counts them (owner decision).
 */
export function ProfileCard({ data }: { data: ExperienceData }) {
  const t = useTranslations("hud");
  const floor = useHQStore((s) => s.floor);
  const accent = ACCENT_TEXT[FLOOR_ACCENT[floor]];

  return (
    <section
      aria-label={t("profile")}
      className="glass glass-solid pointer-events-auto absolute top-3 left-3 w-[min(280px,calc(100vw-5.5rem))] p-4 md:top-4 md:left-4 lg:w-[280px] md:w-60"
    >
      <div className="flex items-center gap-3">
        <ProfilePhoto size={44} />
        <div className="min-w-0">
          <p className="truncate text-[15px] leading-5 font-bold text-ink">{data.profile.name}</p>
          <p className="text-[13px] leading-5 text-cyan">{data.profile.headline}</p>
        </div>
      </div>
      <dl className="mt-3 border-t border-glass-border pt-3">
        <dt className="label text-ink-3">{t("floor")}</dt>
        <dd className="text-sm text-ink">
          <span className={`label mr-1.5 ${accent}`}>{floor}</span>
          {data.floors[floor].name}
        </dd>
      </dl>
    </section>
  );
}

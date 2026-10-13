import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { getProfile } from "@/content/load";
import type { Locale } from "@/content/schema";
import { QuietLink } from "../QuietLink";
import { AskHeroBar } from "./AskEntry";
import { EnterHqButton } from "./EnterHqButton";

/**
 * Landing hero: the name over the Neon Grid backdrop (CSS only, src/app/landing.css), the two ways in
 * (Enter the 3D HQ and the Ask AI bar) across the full width, and the stats ticker at the bottom of the
 * first screen. Server-rendered; EnterHqButton and AskHeroBar are the only islands.
 */
export async function HomeHero({ locale, ticker }: { locale: Locale; ticker: ReactNode }) {
  const t = await getTranslations({ locale, namespace: "home" });
  const tm = await getTranslations({ locale, namespace: "meta" });
  const profile = getProfile();

  return (
    <div className="hx">
      <div className="hx-bg" aria-hidden="true">
        <div className="hx-glow" />
        <div className="hx-ground">
          <div className="hx-ground-grid" />
        </div>
        <i className="hx-packet" />
        <i className="hx-packet" />
        <i className="hx-packet" />
      </div>
      <section aria-labelledby="hero-title" className="pv-wrap hx-main grid flex-1 content-start py-10 sm:py-14 md:pt-16 lg:content-center lg:pt-14">
        <div className="min-w-0">
          <p className="pv-data hx-eyebrow">
            <span className="hx-dot" aria-hidden="true" />
            {t("hero.welcome", { site: tm("siteName") })}
          </p>
          <h1 id="hero-title" className="pv-d-xl hx-name mt-6">
            {profile.name}
          </h1>
          <p className="pv-lead mt-7 font-semibold">{profile.headline[locale]}</p>
          <p className="pv-lead mt-1 text-ink-2">{profile.subheadline[locale]}</p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <EnterHqButton label={t("hero.enter3d")} hint={t("hero.enter3dHint")} />
            <QuietLink href="/labs" className="pv-btn pv-btn-ghost">
              {t("seeWork")}
            </QuietLink>
          </div>
          <AskHeroBar />
        </div>
      </section>
      {ticker}
    </div>
  );
}

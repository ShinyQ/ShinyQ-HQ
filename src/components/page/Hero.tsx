import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { PRIMARY_NAV } from "@/components/SiteHeader";
import { getProfile } from "@/content/load";
import type { Locale } from "@/content/schema";
import { Link } from "@/i18n/navigation";
import { FLOOR_ACCENT } from "@/lib/accent";
import { AskHeroBar } from "./AskEntry";
import { EnterHqButton } from "./EnterHqButton";
import { HeroTower, type TowerFloor } from "./HeroTower";

/** Tower directory order above the Lobby, top floor first. */
const UPPER_FLOORS = ["RF", "L4", "L3", "L2"] as const;

/**
 * Landing hero: the name over the Neon Grid backdrop (CSS only, src/app/landing.css), the two ways in
 * (Enter the 3D HQ and the Ask AI bar), the tower directory from lg, and the stats ticker at the bottom
 * of the first screen. Server-rendered; EnterHqButton and AskHeroBar are the only islands.
 */
export async function HomeHero({ locale, ticker }: { locale: Locale; ticker: ReactNode }) {
  const t = await getTranslations({ locale, namespace: "home" });
  // The elevator's floor names (Home, Journey, Work, Writing, About), as in the 3D HUD.
  const th = await getTranslations({ locale, namespace: "hud" });
  const tm = await getTranslations({ locale, namespace: "meta" });
  const profile = getProfile();
  const floors: TowerFloor[] = [
    ...UPPER_FLOORS.map((floor) => ({ floor, label: th(`floorLabel.${floor}`), href: PRIMARY_NAV.find((entry) => entry.floor === floor)!.href, accent: FLOOR_ACCENT[floor] })),
    { floor: "L1", label: th("floorLabel.L1"), href: "/", accent: FLOOR_ACCENT.L1, current: true },
  ];

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
      <section aria-labelledby="hero-title" className="pv-wrap hx-main grid flex-1 content-start gap-12 py-10 sm:py-14 md:grid-cols-12 md:gap-6 md:pt-16 lg:content-center lg:pt-14">
        <div className="min-w-0 md:col-span-7 lg:col-span-8">
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
            <Link href="/labs" className="pv-btn pv-btn-ghost">
              {t("seeWork")}
            </Link>
          </div>
          <AskHeroBar />
        </div>
        <div className="hidden md:col-span-5 md:flex md:items-center md:justify-end lg:col-span-4">
          <HeroTower title={t("directoryTitle")} here={t("hero.here")} floors={floors} />
        </div>
      </section>
      {ticker}
    </div>
  );
}

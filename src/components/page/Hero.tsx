import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { CvButton } from "@/components/cv/CvButton";
import { getProfile } from "@/content/load";
import type { Locale } from "@/content/schema";
import { QuietLink } from "../QuietLink";
import { AskHeroBar } from "./AskEntry";
import { EnterHqButton } from "./EnterHqButton";
import { Portrait } from "./Portrait";

/**
 * Landing hero (Hallmark Settled posture, 2026-10-27): the portrait and the name across the top, then the headline,
 * the motto, the proof strip and the actions (View CV is the one primary, owner decision 2026-10-25) beside the Ask
 * bar. It fills the first screen, so the Selected work screenshots stay below the fold and never compete with the
 * name for LCP. Server-rendered over the static Neon Grid and one fixed bloom (src/app/landing.css); CvButton,
 * EnterHqButton and AskHeroBar are the only islands.
 *
 * The first paint waits until the whole hero is parsed (`#hero-end`, its last node): a busy device can otherwise
 * paint a half-parsed hero and shift it (issue #156). React hoists the `rel="expect"` link into the head; browsers
 * without render-blocking `expect` links ignore it.
 */
export async function HomeHero({ locale, proof }: { locale: Locale; proof: ReactNode }) {
  const t = await getTranslations({ locale, namespace: "home" });
  const tc = await getTranslations({ locale, namespace: "common" });
  const profile = getProfile();

  return (
    <div className="hx">
      <link rel="expect" href="#hero-end" blocking="render" />
      <div className="hx-bloom" aria-hidden="true" />
      <section aria-labelledby="hero-title" className="pv-wrap">
        <div className="flex items-center gap-4 sm:gap-6">
          <Portrait name={profile.name} size={128} sizes="(min-width: 1024px) 128px, (min-width: 640px) 96px, 72px" className="size-[72px] sm:size-24 lg:size-32" />
          <h1 id="hero-title" className="pv-d-xl">
            {profile.name}
          </h1>
        </div>
        <div className="hx-grid">
          <div className="min-w-0">
            <p className="pv-lead max-w-none font-semibold">{profile.headline[locale]}</p>
            <p className="pv-lead mt-1 max-w-none text-ink-2">{profile.subheadline[locale]}</p>
            {proof}
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <CvButton className="pv-btn pv-btn-primary w-full sm:w-auto" testId="cv-open-hero">
                {tc("viewCv")}
              </CvButton>
              <QuietLink href="/labs" className="pv-btn pv-btn-ghost">
                {t("seeWork")}
              </QuietLink>
              <EnterHqButton label={t("hero.enter3d")} hint={t("hero.enter3dHint")} />
            </div>
          </div>
          <AskHeroBar />
        </div>
      </section>
      <span id="hero-end" hidden />
    </div>
  );
}

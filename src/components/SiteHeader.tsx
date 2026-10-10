import { getTranslations } from "next-intl/server";
import { getProfile } from "@/content/load";
import type { Locale } from "@/content/schema";
import { HudLaunchers } from "@/hud/HudLaunchers";
import { Link } from "@/i18n/navigation";
import { FLOOR_ACCENT } from "@/lib/accent";
import { LocaleSwitch } from "./LocaleSwitch";
import { NavLink } from "./NavLink";

/** Primary sections, in reading order; each one is a floor of the tower. */
export const PRIMARY_NAV = [
  { href: "/labs", key: "work", floor: "L3" },
  { href: "/journey", key: "journey", floor: "L2" },
  { href: "/library", key: "writing", floor: "L4" },
  { href: "/contact", key: "about", floor: "RF" },
] as const;

export async function SiteHeader({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "nav" });
  const tm = await getTranslations({ locale, namespace: "meta" });
  const profile = getProfile();
  return (
    <header className="no-print sticky top-0 z-30 border-b border-line bg-void/75 backdrop-blur-[18px] backdrop-saturate-[1.4]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-cyan focus:px-3 focus:py-2 focus:text-void"
      >
        {t("skip")}
      </a>
      <div className="pv-wrap flex h-[60px] items-center gap-2 lg:h-[68px] lg:gap-6">
        <Link href="/" className="mr-auto flex min-h-11 min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className="grid size-[34px] shrink-0 place-items-center rounded-lg border border-line-2 font-display text-[13px] font-extrabold tracking-[0.02em] [font-stretch:75%]"
          >
            {profile.monogram}
          </span>
          <span className="min-w-0 text-[14px] leading-[18px] sm:text-[15px]">
            <span className="block font-semibold text-ink">{profile.name}</span>
            <span className="hidden font-mono text-[11px] leading-[14px] tracking-[0.04em] text-ink-3 sm:block">{tm("siteName")}</span>
          </span>
          <span className="sr-only">: {t("backToHq")}</span>
        </Link>
        <nav aria-label={t("label")} className="hidden lg:block">
          <ul className="flex gap-1">
            {PRIMARY_NAV.map((item) => (
              <li key={item.key}>
                <NavLink href={item.href} accent={FLOOR_ACCENT[item.floor]}>
                  <span aria-hidden="true" className="font-mono text-[10.5px] tracking-[0.04em] text-ink-3">
                    {item.floor}
                  </span>
                  {t(item.key)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex shrink-0 items-center gap-1.5">
          <HudLaunchers buttonClassName="pv-tool" />
          <LocaleSwitch label={t("language")} />
        </div>
      </div>
      <nav aria-label={t("mobile")} className="border-t border-line lg:hidden">
        <ul className="pv-wrap grid grid-cols-4">
          {PRIMARY_NAV.map((item) => (
            <li key={item.key}>
              <NavLink href={item.href} accent={FLOOR_ACCENT[item.floor]} variant="tab">
                {t(item.key)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}

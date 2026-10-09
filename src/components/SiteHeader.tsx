import { getTranslations } from "next-intl/server";
import type { Locale } from "@/content/schema";
import { Link } from "@/i18n/navigation";
import { LocaleSwitch } from "./LocaleSwitch";

const NAV = [
  { href: "/quick", key: "quick", floor: null },
  { href: "/journey", key: "journey", floor: "L2" },
  { href: "/labs", key: "labs", floor: "L3" },
  { href: "/library", key: "library", floor: "L4" },
  { href: "/contact", key: "contact", floor: "RF" },
  { href: "/cv", key: "cv", floor: null },
] as const;

export async function SiteHeader({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "nav" });
  return (
    <header className="no-print sticky top-0 z-30 border-b border-glass-border bg-void/80 backdrop-blur-md">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-cyan focus:px-3 focus:py-2 focus:text-void"
      >
        {t("skip")}
      </a>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="group mr-auto flex min-h-11 items-center gap-2 font-mono text-sm font-semibold text-ink">
          <span aria-hidden="true" className="text-cyan">&gt;</span>
          <span>ShinyQ HQ</span>
          <span aria-hidden="true" className="animate-pulse text-cyan motion-reduce:animate-none">_</span>
          <span className="sr-only">: {t("backToHq")}</span>
        </Link>
        <LocaleSwitch label={t("language")} />
        <nav aria-label={t("label")} className="order-last -mx-4 w-[calc(100%+2rem)] overflow-x-auto px-4 sm:order-none sm:mx-0 sm:w-auto sm:px-0">
          <ul className="flex gap-1 whitespace-nowrap">
            {NAV.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2.5 text-sm text-ink-2 transition hover:bg-white/5 hover:text-ink"
                >
                  {item.floor && <span className="label text-ink-3">{item.floor}</span>}
                  {t(item.key)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}

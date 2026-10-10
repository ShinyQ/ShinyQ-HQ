import { getTranslations } from "next-intl/server";
import type { Locale } from "@/content/schema";
import { getContact, getProfile, getRoof } from "@/content/load";
import { Link } from "@/i18n/navigation";
import { REPO_URL } from "@/lib/site";
import { ExternalLink } from "./ExternalLink";
import { PRIMARY_NAV } from "./SiteHeader";

const linkClass = "inline-flex min-h-10 items-center text-sm text-ink-2 transition hover:text-ink";

export async function SiteFooter({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "footer" });
  const tn = await getTranslations({ locale, namespace: "nav" });
  const tc = await getTranslations({ locale, namespace: "common" });
  const contact = getContact();
  const profile = getProfile();
  const elsewhere = [
    { label: "LinkedIn", href: contact.linkedin },
    { label: "GitHub", href: contact.github },
    ...(contact.medium ? [{ label: "Medium", href: contact.medium }] : []),
    ...(contact.googleScholar ? [{ label: "Google Scholar", href: contact.googleScholar }] : []),
  ];
  const pages = [...PRIMARY_NAV.map((item) => ({ href: item.href, label: tn(item.key) })), { href: "/quick", label: tn("quick") }, { href: "/cv", label: tn("cv") }];
  return (
    <footer className="no-print mt-24 border-t border-line sm:mt-32 lg:mt-40">
      {/* Bottom padding keeps the fixed Back to 3D button off the last links. */}
      <div className="pv-wrap pt-12 pb-28">
        <div className="grid gap-10 md:grid-cols-12 md:gap-6">
          <div className="md:col-span-5">
            <p className="font-semibold text-ink">{profile.name}</p>
            <p className="pv-small mt-2 max-w-[40ch]">{getRoof().availability[locale]}</p>
            <a href={`mailto:${contact.email}`} className="pv-uline mt-3 inline-flex min-h-10 items-center text-sm text-ink [overflow-wrap:anywhere]">
              {contact.email}
            </a>
          </div>
          <nav aria-labelledby="footer-pages" className="md:col-span-3">
            <h2 id="footer-pages" className="pv-data">
              {t("pages")}
            </h2>
            <ul className="mt-3">
              {pages.map((page) => (
                <li key={page.href}>
                  <Link href={page.href} className={linkClass}>
                    {page.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="md:col-span-4">
            <h2 className="pv-data">{t("elsewhere")}</h2>
            <ul className="mt-3">
              {elsewhere.map((item) => (
                <li key={item.href}>
                  <ExternalLink href={item.href} className={linkClass} srHint={tc("external")}>
                    {item.label}
                  </ExternalLink>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
          <p className="pv-small">{t("built")}</p>
          <ExternalLink href={REPO_URL} className="pv-uline pv-small" srHint={tc("external")}>
            {t("source")}
          </ExternalLink>
        </div>
      </div>
    </footer>
  );
}

import { getTranslations } from "next-intl/server";
import type { Locale } from "@/content/schema";
import { getContact, getProfile, getRoof } from "@/content/load";
import { Link } from "@/i18n/navigation";
import { CvButton } from "./cv/CvButton";
import { ExternalLink } from "./ExternalLink";
import { PRIMARY_NAV } from "./SiteHeader";

const linkClass = "inline-flex min-h-10 items-center gap-1 text-ink-2 transition-colors hover:text-ink";

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
  const pages = [...PRIMARY_NAV.map((item) => ({ href: item.href, label: tn(item.key) })), { href: "/quick", label: tn("quick") }, { href: "/build", label: tn("build") }];
  return (
    <footer className="no-print mt-24 border-t border-line sm:mt-32 lg:mt-40">
      {/* A mast: the name large over the real links. Bottom padding keeps the fixed Back to 3D button off the last links. */}
      <div className="pv-wrap pt-16 pb-28">
        <p className="pv-d-l text-[length:var(--text-display-s)]">{profile.name}</p>
        <div className="mt-12 grid gap-10 md:grid-cols-12 md:gap-8">
          <div className="md:col-span-5">
            <p className="pv-small max-w-[40ch]">{getRoof().availability[locale]}</p>
            <a href={`mailto:${contact.email}`} className="pv-uline mt-3 inline-flex min-h-10 items-center text-ink [overflow-wrap:anywhere]">
              {contact.email}
            </a>
          </div>
          <nav aria-labelledby="footer-pages" className="md:col-span-4">
            <h2 id="footer-pages" className="pv-meta">
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
              <li>
                <CvButton className={linkClass} testId="cv-open-footer">
                  {tn("cv")}
                </CvButton>
              </li>
            </ul>
          </nav>
          <div className="md:col-span-3">
            <h2 className="pv-meta">{t("elsewhere")}</h2>
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
      </div>
    </footer>
  );
}

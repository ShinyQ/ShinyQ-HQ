import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { CvButton } from "@/components/cv/CvButton";
import { getRoof } from "@/content/load";
import type { Locale } from "@/content/schema";
import { Link } from "@/i18n/navigation";

/**
 * The closing contact section (`#contact`): the availability line as the heading, the email, then About and contact,
 * View CV and any page-specific action (`children`, last, so an island that renders late never moves the others).
 * The landing, every case study and the CV page end with it, so a reader who is convinced never has to hunt for the
 * footer. Server markup only; one class set for every page, so it adds no CSS.
 */
export async function ClosingCta({ locale, cv = true, children }: { locale: Locale; cv?: boolean; children?: ReactNode }) {
  const t = await getTranslations({ locale, namespace: "home" });
  const tc = await getTranslations({ locale, namespace: "common" });
  const roof = getRoof();
  return (
    <section id="contact" aria-labelledby="closing-title" className="pv-wrap pv-sec-l" data-testid="closing-cta">
      <h2 id="closing-title" className="pv-d-l max-w-[24ch] text-[length:var(--text-display-s)]">
        {roof.availability[locale]}
      </h2>
      <a
        href={`mailto:${roof.contact.email}`}
        className="pv-uline mt-8 inline-flex min-h-11 items-center font-display text-lg font-extrabold sm:text-2xl text-ink transition-colors [overflow-wrap:anywhere] [font-stretch:90%] hover:text-cyan"
      >
        {roof.contact.email}
      </a>
      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/contact" className="pv-btn pv-btn-ghost">
          {t("aboutContact")}
        </Link>
        {cv && <CvButton className="pv-btn pv-btn-ghost">{tc("viewCv")}</CvButton>}
        {children}
      </div>
    </section>
  );
}

import { getTranslations } from "next-intl/server";
import type { Contact, Locale, Profile, SiteContent } from "@/content/schema";
import { CopyEmail } from "./CopyEmail";

type Roof = SiteContent["floors"]["roof"];

/** Contact links in display order; optional channels only when set. */
export function contactChannels(contact: Contact) {
  return [
    { label: "LinkedIn", href: contact.linkedin },
    { label: "GitHub", href: contact.github },
    ...(contact.huggingface ? [{ label: "Hugging Face", href: contact.huggingface }] : []),
    ...(contact.medium ? [{ label: "Medium", href: contact.medium }] : []),
    ...(contact.googleScholar ? [{ label: "Google Scholar", href: contact.googleScholar }] : []),
    ...(contact.ieeeXplore ? [{ label: "IEEE Xplore", href: contact.ieeeXplore }] : []),
  ];
}

/** Availability, email actions, location and every channel in one panel. */
export async function ContactPanel({ roof, profile, locale }: { roof: Roof; profile: Profile; locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "contact" });
  const tc = await getTranslations({ locale, namespace: "common" });
  const { contact } = roof;
  return (
    <section aria-labelledby="availability" className="card p-5 sm:p-6">
      <h2 id="availability" className="pv-h3">
        {roof.availability[locale]}
      </h2>
      <a href={`mailto:${contact.email}`} className="pv-btn pv-btn-primary mt-5 w-full [overflow-wrap:anywhere]">
        <span className="sr-only">{tc("email")}: </span>
        {contact.email}
      </a>
      <div className="mt-2">
        <CopyEmail email={contact.email} label={tc("copyEmail")} copied={tc("copied")} />
      </div>
      <dl className="mt-5 grid grid-cols-[96px_1fr] gap-3 border-t border-line pt-4">
        <dt className="pv-data pt-1">{t("location")}</dt>
        <dd className="text-[15px] leading-[22px] text-ink">
          {profile.location[locale]}
          <span className="block text-sm text-ink-2">{profile.timezone}</span>
        </dd>
      </dl>
      <h3 id="channels" className="sr-only">
        {t("channels")}
      </h3>
      <ul aria-labelledby="channels" className="pv-rows mt-4">
        {contactChannels(contact).map((c) => (
          <li key={c.href}>
            <a href={c.href} target="_blank" rel="noopener noreferrer" className="flex min-h-14 items-center justify-between gap-4">
              <span className="pv-row-title shrink-0 text-ink">
                {c.label}
                <span aria-hidden="true"> ↗</span>
                <span className="sr-only"> ({tc("external")})</span>
              </span>
              <span className="truncate font-mono text-xs text-ink-3">{c.href.replace(/^https:\/\/(www\.)?/, "")}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

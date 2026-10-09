import { getTranslations } from "next-intl/server";
import type { Locale } from "@/content/schema";
import { getContact, getProfile, getRoof } from "@/content/load";
import { REPO_URL } from "@/lib/site";
import { ExternalLink } from "./ExternalLink";

export async function SiteFooter({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "footer" });
  const contact = getContact();
  const profile = getProfile();
  const availability = getRoof().availability[locale];
  return (
    <footer className="no-print mt-16 border-t border-glass-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-ink-2 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div>
          <p className="font-semibold text-ink">{profile.name}</p>
          <p>{availability}</p>
          <p className="mt-1 text-[13px] text-ink-3">{t("built")}</p>
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-2">
          <li>
            <a className="link" href={`mailto:${contact.email}`}>
              {contact.email}
            </a>
          </li>
          <li>
            <ExternalLink href={contact.linkedin}>LinkedIn</ExternalLink>
          </li>
          <li>
            <ExternalLink href={contact.github}>GitHub</ExternalLink>
          </li>
          <li>
            <ExternalLink href={REPO_URL}>{t("source")}</ExternalLink>
          </li>
        </ul>
      </div>
    </footer>
  );
}

import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ExternalLink } from "@/components/ExternalLink";
import { Container, PageHeader, Section } from "@/components/Section";
import { getProfile, getRoof } from "@/content/load";
import { LOCALES } from "@/content/schema";
import { experienceDataFor } from "@/experience/gate-data";
import { ExperienceGate } from "@/experience/ExperienceGate";
import { assertLocale } from "@/i18n/locale";
import { Link } from "@/i18n/navigation";
import { cvPdfPath, pageMetadata } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/[locale]/contact">): Promise<Metadata> {
  const locale = assertLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "contact" });
  return pageMetadata({ locale, path: "/contact", title: t("title"), description: getRoof().availability[locale] });
}

export default async function ContactPage({ params }: PageProps<"/[locale]/contact">) {
  const locale = assertLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "contact" });
  const tc = await getTranslations({ locale, namespace: "common" });
  const roof = getRoof();
  const { contact } = roof;
  const profile = getProfile();
  const channels = [
    { label: "LinkedIn", href: contact.linkedin },
    { label: "GitHub", href: contact.github },
    ...(contact.huggingface ? [{ label: "Hugging Face", href: contact.huggingface }] : []),
    ...(contact.medium ? [{ label: "Medium", href: contact.medium }] : []),
    ...(contact.googleScholar ? [{ label: "Google Scholar", href: contact.googleScholar }] : []),
    ...(contact.ieeeXplore ? [{ label: "IEEE Xplore", href: contact.ieeeXplore }] : []),
  ];

  return (
    <Container>
      <ExperienceGate data={await experienceDataFor(locale)} startFloor="RF" />
      <PageHeader eyebrow="RF" title={t("title")} intro={t("intro")} />
      <section aria-labelledby="beacon-title" className="glass mt-4 border-blue/40 p-6 shadow-[0_0_48px_-16px_var(--color-blue)] sm:p-8">
        <h2 id="beacon-title" className="label flex items-center gap-2 text-blue">
          <span className="h-2 w-2 animate-pulse rounded-full bg-blue motion-reduce:animate-none" aria-hidden="true" />
          {t("beacon")}
        </h2>
        <p className="mt-3 text-xl leading-8 font-semibold text-ink sm:text-2xl">{roof.availability[locale]}</p>
        <p className="mt-6">
          <a href={`mailto:${contact.email}`} className="inline-flex min-h-11 items-center rounded-lg bg-cyan px-5 font-semibold text-void transition hover:bg-cyan/85">
            {tc("email")}: {contact.email}
          </a>
        </p>
        <p className="mt-4 text-sm text-ink-2">
          {t("location")}: {profile.location[locale]} ({profile.timezone})
        </p>
      </section>

      <Section id="channels" title={t("channels")}>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {channels.map((c) => (
            <li key={c.label}>
              <a
                href={c.href}
                target="_blank"
                rel="noopener noreferrer"
                className="glass flex min-h-16 flex-col justify-center px-4 py-3 transition hover:border-blue/60"
              >
                <span className="font-semibold text-ink">
                  {c.label}
                  <span aria-hidden="true"> ↗</span>
                </span>
                <span className="truncate font-mono text-xs text-ink-2">{c.href.replace(/^https:\/\/(www\.)?/, "")}</span>
                <span className="sr-only">({tc("external")})</span>
              </a>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="cv" title={t("cvTitle")} intro={t("cvIntro")}>
        <ul className="flex flex-wrap gap-3">
          {LOCALES.map((l) => (
            <li key={l}>
              <a
                href={cvPdfPath(roof.cv.fileName, l)}
                hrefLang={l}
                className="inline-flex min-h-11 items-center rounded-lg border border-blue/50 px-5 font-semibold text-ink transition hover:bg-blue/10"
              >
                {tc("downloadCvLocale", { locale: l.toUpperCase() })} (PDF)
              </a>
            </li>
          ))}
          <li>
            <Link href="/cv" className="inline-flex min-h-11 items-center px-2 link">
              /{locale}/cv
            </Link>
          </li>
        </ul>
        <p className="mt-6 text-sm text-ink-3">
          <ExternalLink href={contact.github}>github.com/{profile.handle}</ExternalLink>
        </p>
      </Section>
    </Container>
  );
}

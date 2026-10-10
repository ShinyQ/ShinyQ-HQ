import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getAwards, getCertifications, getPods, getProfile, getRoof, getSkills, getStats, getTimeline } from "@/content/load";
import { LOCALES, type CvSection } from "@/content/schema";
import { assertLocale } from "@/i18n/locale";
import { formatPeriod, formatYearMonth } from "@/lib/format";
import { SITE_URL, cvPdfPath, pageMetadata } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/[locale]/cv">): Promise<Metadata> {
  const locale = assertLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "cv" });
  return pageMetadata({ locale, path: "/cv", title: t("title"), description: getProfile().headline[locale] });
}

function CvBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6 break-inside-avoid-page">
      <h2 className="mb-2 border-b border-[#d4d4d8] pb-1 text-[11px] font-semibold tracking-[0.12em] text-[#4338ca] uppercase">{title}</h2>
      {children}
    </section>
  );
}

export default async function CvPage({ params }: PageProps<"/[locale]/cv">) {
  const locale = assertLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "cv" });
  const tc = await getTranslations({ locale, namespace: "common" });
  const profile = getProfile();
  const roof = getRoof();
  const { contact } = roof;
  const timeline = getTimeline().reverse();
  const experience = timeline.filter((e) => e.type === "job" || e.type === "freelance");
  const education = timeline.filter((e) => e.type === "education");
  const projects = getPods().filter((p) => p.tier === "hero");
  const awards = getAwards();
  const firstPlaces = awards.filter((a) => /^(1st|first)/i.test(a.placement.en)).slice(0, 6);

  const sections: Record<CvSection, ReactNode> = {
    summary: (
      <CvBlock title={t("summary")}>
        <p>{profile.bio[locale]}</p>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[#3f3f46]">
          {getStats().map((s) => (
            <li key={s.id}>
              <strong className="text-[#111]">{s.value}</strong> {s.label[locale]}
            </li>
          ))}
        </ul>
      </CvBlock>
    ),
    experience: (
      <CvBlock title={t("experience")}>
        <ol className="space-y-3">
          {experience.map((e) => (
            <li key={e.id} className="break-inside-avoid">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                <p>
                  <strong>{e.role[locale]}</strong> · {e.org}
                </p>
                <p className="text-[12px] text-[#52525b]">{formatPeriod(e.start, e.end, locale)}</p>
              </div>
              <p className="text-[#3f3f46]">{e.summary[locale]}</p>
              {e.highlights.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-[#3f3f46]">
                  {e.highlights.map((h, i) => (
                    <li key={i}>{h[locale]}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      </CvBlock>
    ),
    projects: (
      <CvBlock title={t("projects")}>
        <ul className="space-y-2">
          {projects.map((p) => (
            <li key={p.id} className="break-inside-avoid">
              <p>
                <strong>{p.title[locale]}</strong>
                {p.client ? ` · ${p.client}` : ""} · <span className="text-[12px] text-[#52525b]">{formatPeriod(p.period.start, p.period.end, locale)}</span>
              </p>
              <p className="text-[#3f3f46]">
                {p.tagline[locale]}{" "}
                {p.results[0] && (
                  <span>
                    <strong className="text-[#111]">{p.results[0].value}</strong> {p.results[0].label[locale]} ({p.results[0].context[locale]}).
                  </span>
                )}
              </p>
            </li>
          ))}
        </ul>
      </CvBlock>
    ),
    education: (
      <CvBlock title={t("education")}>
        <ul className="space-y-1">
          {education.map((e) => (
            <li key={e.id} className="flex flex-wrap justify-between gap-x-4">
              <span>
                <strong>{e.role[locale]}</strong> · {e.org}
              </span>
              <span className="text-[12px] text-[#52525b]">{formatPeriod(e.start, e.end, locale)}</span>
            </li>
          ))}
        </ul>
      </CvBlock>
    ),
    certifications: (
      <CvBlock title={t("certifications")}>
        <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2 print:grid-cols-2">
          {[...getCertifications()]
            .sort((a, b) => b.issued.localeCompare(a.issued))
            .map((c) => (
              <li key={c.id}>
                <strong>{c.code ?? c.name}</strong>
                {c.code ? ` ${c.name}` : ""} · {c.issuer}, {formatYearMonth(c.issued, locale)}
                {c.status === "in-progress" ? ` (${tc("inProgress")})` : ""}
              </li>
            ))}
        </ul>
      </CvBlock>
    ),
    awards: (
      <CvBlock title={t("awards")}>
        <p>{t("awardsSummary", { count: awards.length })}</p>
        <ul className="mt-1 list-disc pl-5 text-[#3f3f46]">
          {firstPlaces.map((a) => (
            <li key={a.id}>
              {a.placement[locale]}, {a.title} ({a.date.slice(0, 4)})
            </li>
          ))}
        </ul>
      </CvBlock>
    ),
    skills: (
      <CvBlock title={t("skills")}>
        <dl className="space-y-1">
          {getSkills().map((g) => (
            <div key={g.id} className="flex flex-wrap gap-x-2">
              <dt className="font-semibold">{g.label[locale]}:</dt>
              <dd className="text-[#3f3f46]">{g.items.join(", ")}</dd>
            </div>
          ))}
        </dl>
      </CvBlock>
    ),
  };

  return (
    <div className="pv-wrap pt-8 pb-8 sm:pt-12 print:max-w-none print:p-0">
      <div className="no-print mx-auto mb-8 flex max-w-[210mm] flex-wrap items-end justify-between gap-4">
        <div>
          <p className="pv-h2">{t("title")}</p>
          <p className="pv-small mt-2">{t("print")}</p>
        </div>
        <ul className="flex flex-wrap gap-2">
          {LOCALES.map((l) => (
            <li key={l}>
              <a
                href={cvPdfPath(roof.cv.fileName, l)}
                hrefLang={l}
                className={`pv-btn ${l === locale ? "pv-btn-primary" : "pv-btn-ghost"}`}
              >
                {tc("downloadCvLocale", { locale: l.toUpperCase() })}
              </a>
            </li>
          ))}
        </ul>
      </div>
      <article
        lang={locale}
        className="mx-auto max-w-[210mm] rounded-xl bg-[#fff] p-6 text-[13px] leading-[19px] text-[#111] shadow-2xl sm:p-10 print:rounded-none print:p-0 print:shadow-none"
      >
        <header className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-[#111] pb-4">
          <div>
            <h1 className="text-[26px] leading-[30px] font-extrabold tracking-tight">{profile.name}</h1>
            <p className="mt-1 text-[15px] font-semibold text-[#4338ca]">{profile.headline[locale]}</p>
            <p className="text-[12px] text-[#52525b]">
              {profile.currentRole.title[locale]} · {profile.currentRole.org}
            </p>
          </div>
          <ul className="text-right text-[12px] leading-[18px] text-[#3f3f46]">
            <li>{profile.location[locale]}</li>
            <li>{contact.email}</li>
            <li>{contact.linkedin.replace(/^https:\/\/(www\.)?/, "")}</li>
            <li>{contact.github.replace(/^https:\/\//, "")}</li>
            <li>{SITE_URL.replace(/^https:\/\//, "")}</li>
          </ul>
        </header>
        {roof.cv.sections.map((s) => (
          <div key={s}>{sections[s]}</div>
        ))}
      </article>
    </div>
  );
}

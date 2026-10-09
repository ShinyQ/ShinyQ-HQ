import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { experienceDataFor } from "@/experience/gate-data";
import { ExperienceGate } from "@/experience/ExperienceGate";
import { PodCard } from "@/components/PodCard";
import { Container, PageHeader, Section } from "@/components/Section";
import { getPods } from "@/content/load";
import { assertLocale } from "@/i18n/locale";
import { Link } from "@/i18n/navigation";
import { ACCENT_TEXT, WING_ACCENT } from "@/lib/accent";
import { formatPeriod } from "@/lib/format";
import { pageMetadata } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/[locale]/labs">): Promise<Metadata> {
  const locale = assertLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "labs" });
  return pageMetadata({ locale, path: "/labs", title: t("title"), description: t("intro") });
}

export default async function LabsPage({ params }: PageProps<"/[locale]/labs">) {
  const locale = assertLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "labs" });
  const tc = await getTranslations({ locale, namespace: "common" });
  const tf = await getTranslations({ locale, namespace: "floors" });

  return (
    <Container>
      <ExperienceGate data={await experienceDataFor(locale)} startFloor="L3" />
      <PageHeader eyebrow={`L3 · ${tf("L3")}`} title={t("title")} intro={t("intro")} />
      {(["software", "ai"] as const).map((wing) => {
        const pods = getPods(wing);
        const hero = pods.filter((p) => p.tier === "hero");
        const featured = pods.filter((p) => p.tier === "featured");
        const listed = pods.filter((p) => p.tier === "listed");
        return (
          <Section key={wing} id={`${wing}-wing`} eyebrow={tc(`wing.${wing}`)} title={tc(`wing.${wing}`)} intro={t(`${wing}Intro`)}>
            <ul className="grid gap-4 md:grid-cols-3">
              {hero.map((pod) => (
                <li key={pod.id}>
                  <PodCard pod={pod} locale={locale} />
                </li>
              ))}
            </ul>
            {featured.length > 0 && (
              <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {featured.map((pod) => (
                  <li key={pod.id}>
                    <PodCard pod={pod} locale={locale} compact />
                  </li>
                ))}
              </ul>
            )}
            {listed.length > 0 && (
              <div className="glass mt-6 p-5">
                <h3 className={`label mb-3 ${ACCENT_TEXT[WING_ACCENT[wing]]}`}>{t("directory")}</h3>
                <ul className="grid gap-x-6 gap-y-1 md:grid-cols-2">
                  {listed.map((pod) => (
                    <li key={pod.id}>
                      <Link href={`/labs/${pod.slug}`} className="group flex min-h-11 flex-col justify-center rounded-md px-2 py-1.5 transition hover:bg-white/5">
                        <span className="text-sm font-semibold text-ink group-hover:text-cyan">{pod.title[locale]}</span>
                        <span className="text-[13px] text-ink-3">
                          {pod.client ? `${pod.client} · ` : ""}
                          {formatPeriod(pod.period.start, pod.period.end, locale)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Section>
        );
      })}
    </Container>
  );
}

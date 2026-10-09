import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PostList, PublicationList, ResearchList, TalkList } from "@/components/LibraryBlocks";
import { Container, PageHeader, Section } from "@/components/Section";
import { getContact, getLibrary, getPosts, getProfile } from "@/content/load";
import { isResearch } from "@/content/selectors";
import { experienceDataFor } from "@/experience/gate-data";
import { ExperienceGate } from "@/experience/ExperienceGate";
import { assertLocale } from "@/i18n/locale";
import { pageMetadata } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/[locale]/library">): Promise<Metadata> {
  const locale = assertLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "library" });
  return pageMetadata({ locale, path: "/library", title: t("title"), description: t("intro") });
}

export default async function LibraryPage({ params }: PageProps<"/[locale]/library">) {
  const locale = assertLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "library" });
  const tf = await getTranslations({ locale, namespace: "floors" });
  const library = getLibrary();
  return (
    <Container>
      <ExperienceGate data={await experienceDataFor(locale)} startFloor="L4" />
      <PageHeader eyebrow={`L4 · ${tf("L4")}`} title={t("title")} intro={t("intro")} />
      <Section id="posts" title={t("posts")}>
        <PostList posts={getPosts()} locale={locale} />
      </Section>
      <Section id="research" title={t("research")} intro={t("researchIntro")}>
        <ResearchList publications={library.publications} self={getProfile().name} contact={getContact()} metrics={library.researchMetrics} locale={locale} />
      </Section>
      <Section id="publications" title={t("publications")}>
        <PublicationList publications={library.publications.filter((p) => !isResearch(p.kind))} locale={locale} />
      </Section>
      <Section id="talks" title={t("talks")}>
        <TalkList talks={library.talks} locale={locale} />
      </Section>
    </Container>
  );
}

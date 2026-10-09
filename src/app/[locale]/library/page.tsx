import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PostList, PublicationList, TalkList } from "@/components/LibraryBlocks";
import { Container, PageHeader, Section } from "@/components/Section";
import { getLibrary, getPosts } from "@/content/load";
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
      <PageHeader eyebrow={`L4 · ${tf("L4")}`} title={t("title")} intro={t("intro")} />
      <Section id="posts" title={t("posts")}>
        <PostList posts={getPosts()} locale={locale} />
      </Section>
      <Section id="publications" title={t("publications")}>
        <PublicationList publications={library.publications} locale={locale} />
      </Section>
      <Section id="talks" title={t("talks")}>
        <TalkList talks={library.talks} locale={locale} />
      </Section>
    </Container>
  );
}

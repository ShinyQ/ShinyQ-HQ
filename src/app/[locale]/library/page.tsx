import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ClientMessages } from "@/components/ClientMessages";
import { PostList, PublicationList, ResearchList, TalkList } from "@/components/LibraryBlocks";
import { Marker, PageIntro, SectionSplit } from "@/components/page/Layout";
import { TopicFilter } from "@/components/page/TopicFilter";
import { getContact, getLibrary, getPosts, getProfile, getTopicIndex } from "@/content/load";
import { isResearch } from "@/content/selectors";
import { experienceDataFor } from "@/experience/gate-data";
import { ExperienceGate } from "@/experience/ExperienceGate";
import { assertLocale } from "@/i18n/locale";
import { seoMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { pageJsonLd } from "@/lib/jsonld";

export async function generateMetadata({ params }: PageProps<"/[locale]/library">): Promise<Metadata> {
  return seoMetadata(assertLocale((await params).locale), "/library");
}

export default async function LibraryPage({ params }: PageProps<"/[locale]/library">) {
  const locale = assertLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "library" });
  const tw = await getTranslations({ locale, namespace: "writing" });
  const tf = await getTranslations({ locale, namespace: "floors" });
  const tt = await getTranslations({ locale, namespace: "library.topics" });
  const library = getLibrary();
  const posts = getPosts();
  const research = library.publications.filter((p) => isResearch(p.kind));
  const models = library.publications.filter((p) => !isResearch(p.kind));
  const sections = [
    { id: "posts", label: t("posts"), count: posts.length },
    { id: "research", label: t("research"), count: research.length },
    { id: "publications", label: t("publications"), count: models.length },
    { id: "talks", label: t("talks"), count: library.talks.length },
  ];
  // The Topic Constellation's topics (L4), as a filter over every row below.
  const topics = getTopicIndex().topics.map((x) => ({ slug: x.slug, label: tt(`names.${x.slug}`), count: x.items.length }));
  return (
    <ClientMessages>
      <JsonLd data={pageJsonLd(locale, "/library")} />
      <ExperienceGate data={await experienceDataFor(locale)} startFloor="L4" />
      <PageIntro
        marker={<Marker accent="white">L4 · {tf("L4")}</Marker>}
        title={tw("title")}
        lead={t("intro")}
        aside={
          <nav aria-label={tw("sections")}>
            <ul className="flex flex-wrap gap-1.5">
              {sections.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="chip min-h-11">
                    {s.label}
                    <span className="chip-count">{s.count}</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        }
      />
      <TopicFilter topics={topics} total={posts.length + library.publications.length + library.talks.length}>
        <SectionSplit id="posts" title={t("posts")} className="lg:!pt-24">
          <PostList posts={posts} locale={locale} lead />
        </SectionSplit>
        <SectionSplit id="research" title={t("research")} intro={t("researchIntro")}>
          <ResearchList publications={library.publications} self={getProfile().name} contact={getContact()} metrics={library.researchMetrics} locale={locale} />
        </SectionSplit>
        <SectionSplit id="publications" title={t("publications")}>
          <PublicationList publications={models} locale={locale} />
        </SectionSplit>
        <SectionSplit id="talks" title={t("talks")}>
          <TalkList talks={library.talks} locale={locale} />
        </SectionSplit>
      </TopicFilter>
    </ClientMessages>
  );
}

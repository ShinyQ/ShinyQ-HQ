import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PostList, PublicationList, ResearchList, TalkList } from "@/components/LibraryBlocks";
import { Marker, PageIntro, SectionSplit } from "@/components/page/Layout";
import { getContact, getLibrary, getPosts, getProfile } from "@/content/load";
import { isResearch } from "@/content/selectors";
import { experienceDataFor } from "@/experience/gate-data";
import { ExperienceGate } from "@/experience/ExperienceGate";
import { assertLocale } from "@/i18n/locale";
import { pageMetadata } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/[locale]/library">): Promise<Metadata> {
  const locale = assertLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "library" });
  const tw = await getTranslations({ locale, namespace: "writing" });
  return pageMetadata({ locale, path: "/library", title: tw("title"), description: t("intro") });
}

export default async function LibraryPage({ params }: PageProps<"/[locale]/library">) {
  const locale = assertLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "library" });
  const tw = await getTranslations({ locale, namespace: "writing" });
  const tf = await getTranslations({ locale, namespace: "floors" });
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
  return (
    <>
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
    </>
  );
}

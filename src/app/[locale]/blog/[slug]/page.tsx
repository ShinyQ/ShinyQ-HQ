import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { compileMDX } from "next-mdx-remote/rsc";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { JsonLd } from "@/components/JsonLd";
import { CrumbLink, Marker } from "@/components/page/Layout";
import { getPostSource } from "@/content/blog";
import { getContent, getPost } from "@/content/load";
import { LOCALES } from "@/content/schema";
import { assertLocale } from "@/i18n/locale";
import { formatDate } from "@/lib/format";
import { postJsonLd } from "@/lib/jsonld";
import { ogImagePath, pageMetadata } from "@/lib/site";

export const dynamicParams = false;

/** Only posts hosted here (no external `url`) get a page. */
export function generateStaticParams() {
  const posts = getContent().floors.library.posts.filter((p) => !p.url);
  return LOCALES.flatMap((locale) => posts.map((p) => ({ locale, slug: p.slug })));
}

export async function generateMetadata({ params }: PageProps<"/[locale]/blog/[slug]">): Promise<Metadata> {
  const { locale: raw, slug } = await params;
  const locale = assertLocale(raw);
  const post = getPost(slug);
  if (!post) return {};
  return pageMetadata({
    locale,
    path: `/blog/${slug}`,
    title: post.title[locale],
    description: post.excerpt[locale],
    type: "article",
    publishedTime: post.date,
    tags: post.tags,
    image: ogImagePath({ kind: "blog", locale, slug }),
  });
}

export default async function BlogPostPage({ params }: PageProps<"/[locale]/blog/[slug]">) {
  const { locale: raw, slug } = await params;
  const locale = assertLocale(raw);
  setRequestLocale(locale);
  const post = getPost(slug);
  const found = post && !post.url ? getPostSource(slug, locale) : undefined;
  if (!post || !found) notFound();

  const t = await getTranslations({ locale, namespace: "blog" });
  const tw = await getTranslations({ locale, namespace: "writing" });
  const tc = await getTranslations({ locale, namespace: "common" });
  const { content } = await compileMDX({ source: found.source, options: { parseFrontmatter: true } });

  return (
    <>
      <JsonLd data={postJsonLd(post, locale, found.locale)} />
      <article className="pv-wrap pt-6 sm:pt-10 lg:pt-14" lang={found.locale}>
        <div className="mx-auto max-w-[720px]">
          <p lang={locale}>
            <CrumbLink crumb={{ href: "/library", label: tw("title") }} />
          </p>
          <p className="pv-data mt-5 flex flex-wrap gap-x-4" lang={locale}>
            <Marker accent="white">L4</Marker>
            <span>{formatDate(post.date, locale)}</span>
            <span>{post.languages.map((l) => tc(`langBadge.${l}`)).join(" · ")}</span>
          </p>
          <h1 className="pv-d-l mt-5 text-[clamp(36px,4.6vw,60px)]">{post.title[found.locale]}</h1>
          <ul className="pv-tags mt-6">
            {post.tags.map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>
          {found.locale !== locale && (
            <p role="note" lang={locale} className="card mt-8 border-amber/40 px-4 py-3 text-sm text-amber">
              {t("translationMissing", { language: t(`languageName.${found.locale}`) })}
            </p>
          )}
          <div className="prose-hq mt-10 border-t border-line pt-10">{content}</div>
        </div>
      </article>
    </>
  );
}

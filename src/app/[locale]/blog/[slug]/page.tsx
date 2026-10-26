import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { compileMDX } from "next-mdx-remote/rsc";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { postMdxComponents } from "@/components/blog/mdx";
import { JsonLd } from "@/components/JsonLd";
import { ShareLinks } from "@/components/ShareLinks";
import { CrumbLink } from "@/components/page/Layout";
import { getPostSource } from "@/content/blog";
import { getContent, getPost } from "@/content/load";
import { LOCALES } from "@/content/schema";
import { assertLocale } from "@/i18n/locale";
import { formatDate } from "@/lib/format";
import { pageJsonLd } from "@/lib/jsonld";
import { seoMetadata } from "@/lib/seo";

export const dynamicParams = false;

/** Only posts hosted here (no external `url`) get a page. */
export function generateStaticParams() {
  const posts = getContent().floors.library.posts.filter((p) => !p.url);
  return LOCALES.flatMap((locale) => posts.map((p) => ({ locale, slug: p.slug })));
}

export async function generateMetadata({ params }: PageProps<"/[locale]/blog/[slug]">): Promise<Metadata> {
  const { locale: raw, slug } = await params;
  const post = getPost(slug);
  return post && !post.url ? seoMetadata(assertLocale(raw), `/blog/${slug}`) : {};
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
  const { content } = await compileMDX({
    source: found.source,
    components: postMdxComponents(slug, found.locale),
    options: { parseFrontmatter: true },
  });

  return (
    <>
      <JsonLd data={pageJsonLd(locale, `/blog/${slug}`)} />
      <article className="pv-wrap pt-6 sm:pt-10 lg:pt-14" lang={found.locale}>
        <div className="mx-auto max-w-[720px]">
          <p lang={locale}>
            <CrumbLink crumb={{ href: "/library", label: tw("title") }} />
          </p>
          <h1 className="pv-d-l mt-6 text-[length:var(--text-display-s)]">{post.title[found.locale]}</h1>
          <p className="pv-meta mt-5 flex flex-wrap gap-x-4" lang={locale}>
            <time dateTime={post.date} className="pv-date">
              {formatDate(post.date, locale)}
            </time>
            <span>{post.languages.map((l) => tc(`langBadge.${l}`)).join(", ")}</span>
          </p>
          <ul className="pv-tags mt-6">
            {post.tags.map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>
          <div className="mt-6" lang={locale}>
            <ShareLinks variant="page" labels={{ group: tc("share"), classic: tc("copyClassicLink"), threeD: tc("copy3dLink"), copied: tc("linkCopied"), failed: tc("linkCopyFailed") }} />
          </div>
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

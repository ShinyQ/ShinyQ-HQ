import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { compileMDX } from "next-mdx-remote/rsc";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChipList } from "@/components/Chip";
import { Container } from "@/components/Section";
import { getPostSource } from "@/content/blog";
import { getContent, getPost } from "@/content/load";
import { LOCALES } from "@/content/schema";
import { assertLocale } from "@/i18n/locale";
import { Link } from "@/i18n/navigation";
import { formatDate } from "@/lib/format";
import { pageMetadata } from "@/lib/site";

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
  return pageMetadata({ locale, path: `/blog/${slug}`, title: post.title[locale], description: post.excerpt[locale] });
}

export default async function BlogPostPage({ params }: PageProps<"/[locale]/blog/[slug]">) {
  const { locale: raw, slug } = await params;
  const locale = assertLocale(raw);
  setRequestLocale(locale);
  const post = getPost(slug);
  const found = post && !post.url ? getPostSource(slug, locale) : undefined;
  if (!post || !found) notFound();

  const t = await getTranslations({ locale, namespace: "blog" });
  const { content } = await compileMDX({ source: found.source, options: { parseFrontmatter: true } });

  return (
    <Container>
      <article className="mx-auto max-w-2xl pt-10 sm:pt-16" lang={found.locale}>
        <p className="mb-4" lang={locale}>
          <Link href="/library" className="link text-sm">
            ← {t("back")}
          </Link>
        </p>
        <p className="label text-ink-3" lang={locale}>
          L4 · {formatDate(post.date, locale)}
        </p>
        <h1 className="mt-3 text-[26px] leading-[32px] font-extrabold tracking-tight text-ink sm:text-[32px] sm:leading-[38px]">
          {post.title[found.locale]}
        </h1>
        <div className="mt-4">
          <ChipList items={post.tags} />
        </div>
        {found.locale !== locale && (
          <p role="note" lang={locale} className="mt-6 rounded-lg border border-amber/40 bg-amber/5 px-4 py-3 text-sm text-amber">
            {t("translationMissing", { language: t(`languageName.${found.locale}`) })}
          </p>
        )}
        <div className="prose-hq mt-8">{content}</div>
      </article>
    </Container>
  );
}

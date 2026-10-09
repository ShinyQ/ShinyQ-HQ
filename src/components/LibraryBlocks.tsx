import { getTranslations } from "next-intl/server";
import type { Locale, PostRef, Publication, Talk } from "@/content/schema";
import { Link } from "@/i18n/navigation";
import { formatDate, formatYearMonth } from "@/lib/format";
import { ExternalLink } from "./ExternalLink";

export async function PostList({ posts, locale }: { posts: readonly PostRef[]; locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "library" });
  const tc = await getTranslations({ locale, namespace: "common" });
  return (
    <ul className="grid gap-3 md:grid-cols-3">
      {posts.map((post) => (
        <li key={post.slug} className="glass relative flex flex-col gap-2 p-5 transition hover:border-white/50">
          <p className="label flex flex-wrap gap-2 text-ink-3">
            <span>{formatDate(post.date, locale)}</span>
            {post.languages.map((l) => (
              <span key={l} className="rounded border border-glass-border px-1 text-ink-2">
                {tc(`langBadge.${l}`)}
              </span>
            ))}
            {post.url && <span className="text-cyan">{t("onMedium")}</span>}
          </p>
          <h3 className="font-bold leading-6 text-ink">
            {post.url ? (
              <a href={post.url} target="_blank" rel="noopener noreferrer" className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">
                {post.title[locale]}
                <span aria-hidden="true"> ↗</span>
                <span className="sr-only"> ({tc("external")})</span>
              </a>
            ) : (
              <Link href={`/blog/${post.slug}`} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">
                {post.title[locale]}
              </Link>
            )}
          </h3>
          <p className="text-sm leading-6 text-ink-2">{post.excerpt[locale]}</p>
        </li>
      ))}
    </ul>
  );
}

export async function PublicationList({ publications, locale }: { publications: readonly Publication[]; locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "library" });
  const tc = await getTranslations({ locale, namespace: "common" });
  const sorted = [...publications].sort((a, b) => b.year - a.year);
  return (
    <ul className="grid gap-2 md:grid-cols-2">
      {sorted.map((pub) => (
        <li key={pub.id} className="rounded-lg border border-glass-border p-3">
          <p className="label text-ink-3">
            {t(`kind.${pub.kind}`)} · {pub.year}
            {pub.venue ? ` · ${pub.venue}` : ""}
          </p>
          <p className="mt-1 text-sm leading-6 font-semibold text-ink">
            {pub.url ? (
              <ExternalLink href={pub.url} srHint={tc("external")}>
                {pub.title}
              </ExternalLink>
            ) : (
              pub.title
            )}
          </p>
        </li>
      ))}
    </ul>
  );
}

export async function TalkList({ talks, locale }: { talks: readonly Talk[]; locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "library" });
  const sorted = [...talks].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <ul className="grid gap-2 md:grid-cols-2">
      {sorted.map((talk) => (
        <li key={talk.id} className="rounded-lg border border-glass-border p-3">
          <p className="label text-ink-3">
            {formatYearMonth(talk.date, locale)} · {t(`role.${talk.role}`)}
          </p>
          <p className="mt-1 text-sm leading-6 font-semibold text-ink">{talk.title[locale]}</p>
          <p className="text-[13px] text-ink-2">{talk.event}</p>
        </li>
      ))}
    </ul>
  );
}

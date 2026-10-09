import { getTranslations } from "next-intl/server";
import { Fragment } from "react";
import type { Contact, Locale, PostRef, Publication, ResearchMetrics, Talk } from "@/content/schema";
import { publicationDate, researchPublications } from "@/content/selectors";
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

/**
 * Research: papers and the thesis with authors (the owner highlighted), venue, date, DOI, a one-line
 * summary and citations (with their source and date), then the research profiles.
 */
export async function ResearchList({
  publications,
  self,
  contact,
  metrics,
  locale,
}: {
  publications: readonly Publication[];
  self: string;
  contact: Contact;
  metrics?: ResearchMetrics;
  locale: Locale;
}) {
  const t = await getTranslations({ locale, namespace: "library" });
  const tc = await getTranslations({ locale, namespace: "common" });
  const asOf = metrics ? formatYearMonth(metrics.asOf, locale) : "";
  const profiles = [
    ...(contact.googleScholar ? [{ label: "Google Scholar", href: contact.googleScholar }] : []),
    ...(contact.ieeeXplore ? [{ label: "IEEE Xplore", href: contact.ieeeXplore }] : []),
  ];
  return (
    <div className="space-y-5">
      <ul className="grid gap-3 md:grid-cols-2">
        {researchPublications(publications).map((pub) => (
          <li key={pub.id} className="glass flex flex-col gap-2 p-5">
            <p className="label text-amber">
              {t(`kind.${pub.kind}`)} · {publicationDate(pub, locale)}
            </p>
            <p className="leading-6 font-semibold text-ink">
              {pub.url ? (
                <ExternalLink href={pub.url} srHint={tc("external")}>
                  {pub.title}
                </ExternalLink>
              ) : (
                pub.title
              )}
            </p>
            <p className="text-sm leading-6 text-ink-2">
              <span className="sr-only">{t("authors")}: </span>
              {(pub.authors ?? [self]).map((name, i) => (
                <Fragment key={name}>
                  {i > 0 && ", "}
                  {name === self ? <strong className="font-semibold text-amber">{name}</strong> : name}
                </Fragment>
              ))}
            </p>
            {(pub.venue || pub.publisher) && <p className="text-sm text-ink-3 italic">{[pub.venue, pub.publisher].filter(Boolean).join(", ")}</p>}
            {pub.summary && <p className="text-sm leading-6 text-ink">{pub.summary[locale]}</p>}
            <p className="mt-auto flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {pub.doi && (
                <ExternalLink href={`https://doi.org/${pub.doi}`} srHint={tc("external")}>
                  {t("doi")} {pub.doi}
                </ExternalLink>
              )}
              {pub.pdf && (
                <ExternalLink href={pub.pdf} srHint={tc("external")}>
                  {t("pdf")}
                </ExternalLink>
              )}
              {pub.code && (
                <ExternalLink href={pub.code} srHint={tc("external")}>
                  {t("code")}
                </ExternalLink>
              )}
            </p>
            {pub.citations !== undefined && metrics && (
              <p className="text-xs text-ink-3">{t("citations", { count: pub.citations, source: metrics.source, date: asOf })}</p>
            )}
          </li>
        ))}
      </ul>
      {profiles.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="label text-ink-2">{t("profiles")}</h3>
          {profiles.map((p) => (
            <ExternalLink key={p.href} href={p.href} srHint={tc("external")} className="glass inline-flex min-h-11 items-center px-4 text-sm font-semibold text-ink transition hover:border-amber/60">
              {p.label}
            </ExternalLink>
          ))}
          {metrics && (
            <p className="text-sm text-ink-3">{t("metrics", { citations: metrics.citations, hIndex: metrics.hIndex, source: metrics.source, date: asOf })}</p>
          )}
        </div>
      )}
    </div>
  );
}

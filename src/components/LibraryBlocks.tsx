import { getTranslations } from "next-intl/server";
import { Fragment } from "react";
import type { Contact, Locale, PostRef, Publication, ResearchMetrics, Talk } from "@/content/schema";
import { publicationDate, researchPublications } from "@/content/selectors";
import { Link } from "@/i18n/navigation";
import { formatDate, formatYearMonth } from "@/lib/format";
import { ExternalLink } from "./ExternalLink";

/** Post title link: hosted posts open their page, Medium posts open in a new tab. */
async function PostTitle({ post, locale, className }: { post: PostRef; locale: Locale; className: string }) {
  const tc = await getTranslations({ locale, namespace: "common" });
  return post.url ? (
    <a href={post.url} target="_blank" rel="noopener noreferrer" className={`pv-stretch ${className}`}>
      {post.title[locale]}
      <span aria-hidden="true"> ↗</span>
      <span className="sr-only"> ({tc("external")})</span>
    </a>
  ) : (
    <Link href={`/blog/${post.slug}`} className={`pv-stretch ${className}`}>
      {post.title[locale]}
    </Link>
  );
}

async function PostMeta({ post, locale }: { post: PostRef; locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "library" });
  const tc = await getTranslations({ locale, namespace: "common" });
  return <span>{post.url ? t("onMedium") : post.languages.map((l) => tc(`langBadge.${l}`)).join(" · ")}</span>;
}

/** Blog posts as ruled rows; with `lead`, the newest one opens as a larger card. */
export async function PostList({ posts, locale, lead = false }: { posts: readonly PostRef[]; locale: Locale; lead?: boolean }) {
  const t = await getTranslations({ locale, namespace: "writing" });
  const [first, ...rest] = posts;
  const rows = lead ? rest : posts;
  return (
    <div>
      {lead && first && (
        <article className="card relative p-6 transition hover:border-line-2 sm:p-8 [--pv-hover:var(--color-cyan)]">
          <p className="pv-data flex flex-wrap gap-x-4">
            <span>{formatDate(first.date, locale)}</span>
            <PostMeta post={first} locale={locale} />
          </p>
          <h3 className="pv-h3 pv-h3-l mt-4">
            <PostTitle post={first} locale={locale} className="transition hover:text-cyan" />
          </h3>
          <p className="pv-body mt-3">{first.excerpt[locale]}</p>
          <ul className="pv-tags mt-4">
            {first.tags.map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>
          <p aria-hidden="true" className="pv-go mt-3">
            {t("readPost")}
          </p>
        </article>
      )}
      <ul className={`pv-rows pv-rows-closed ${lead ? "mt-6" : ""}`}>
        {rows.map((post) => (
          <li key={post.slug} className="grid gap-x-6 gap-y-1.5 py-5 md:grid-cols-[120px_minmax(0,1fr)_100px] md:py-6">
            <p className="pv-data md:pt-1.5">{formatDate(post.date, locale)}</p>
            <div className="min-w-0">
              <h3 className="pv-h3 pv-row-title">
                <PostTitle post={post} locale={locale} className="" />
              </h3>
              <p className="pv-small mt-2 max-w-[62ch]">{post.excerpt[locale]}</p>
              <ul className="pv-tags mt-3">
                {post.tags.slice(0, 4).map((tag) => (
                  <li key={tag}>{tag}</li>
                ))}
              </ul>
            </div>
            <p className="pv-data -order-1 md:order-none md:pt-1.5 md:text-right">
              <PostMeta post={post} locale={locale} />
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export async function PublicationList({ publications, locale }: { publications: readonly Publication[]; locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "library" });
  const tc = await getTranslations({ locale, namespace: "common" });
  const sorted = [...publications].sort((a, b) => b.year - a.year);
  return (
    <ul className="pv-rows pv-rows-closed">
      {sorted.map((pub) => (
        <li key={pub.id} className="grid gap-x-6 gap-y-1 py-4 md:grid-cols-[70px_minmax(0,1fr)]">
          <p className="pv-data md:pt-1">{pub.year}</p>
          <div className="min-w-0">
            <p className="font-semibold text-ink">
              {pub.url ? (
                <ExternalLink href={pub.url} srHint={tc("external")} className="pv-stretch pv-row-title">
                  {pub.title}
                </ExternalLink>
              ) : (
                pub.title
              )}
            </p>
            <p className="pv-small mt-1">
              {t(`kind.${pub.kind}`)}
              {pub.venue ? ` · ${pub.venue}` : ""}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export async function TalkList({ talks, locale }: { talks: readonly Talk[]; locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "library" });
  const sorted = [...talks].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <ul className="pv-rows pv-rows-closed">
      {sorted.map((talk) => (
        <li key={talk.id} className="grid gap-x-6 gap-y-1 py-4 md:grid-cols-[90px_minmax(0,1fr)_100px]">
          <p className="pv-data md:pt-1">{formatYearMonth(talk.date, locale)}</p>
          <div className="min-w-0">
            <p className="font-semibold text-ink">{talk.title[locale]}</p>
            <p className="pv-small mt-1">{talk.event}</p>
          </div>
          <p className="pv-data md:pt-1 md:text-right">{t(`role.${talk.role}`)}</p>
        </li>
      ))}
    </ul>
  );
}

/**
 * Research: the citation metrics (with their source and date), then papers and the thesis with
 * authors (the owner highlighted), venue, summary, DOI, PDF and code links, then research profiles.
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
  const tw = await getTranslations({ locale, namespace: "writing" });
  const asOf = metrics ? formatYearMonth(metrics.asOf, locale) : "";
  const profiles = [
    ...(contact.googleScholar ? [{ label: "Google Scholar", href: contact.googleScholar }] : []),
    ...(contact.ieeeXplore ? [{ label: "IEEE Xplore", href: contact.ieeeXplore }] : []),
  ];
  const linkClass = "pv-uline inline-flex min-h-11 items-center gap-1 text-sm text-ink";
  return (
    <div>
      {metrics && (
        <div className="mb-6 flex flex-wrap items-end gap-x-10 gap-y-3">
          <p>
            <span className="pv-num block text-[40px] leading-none">{metrics.citations}</span>
            <span className="pv-data mt-2 block">{tw("citationsLabel")}</span>
          </p>
          <p>
            <span className="pv-num block text-[40px] leading-none">{metrics.hIndex}</span>
            <span className="pv-data mt-2 block">{tw("hIndexLabel")}</span>
          </p>
          <p className="pv-small">{t("metrics", { citations: metrics.citations, hIndex: metrics.hIndex, source: metrics.source, date: asOf })}</p>
        </div>
      )}
      <ul className="pv-rows pv-rows-closed">
        {researchPublications(publications).map((pub) => (
          <li key={pub.id} className="grid gap-x-6 gap-y-1.5 py-5 md:grid-cols-[110px_minmax(0,1fr)] md:py-6">
            <p className="pv-data md:pt-1">
              {t(`kind.${pub.kind}`)}
              <span className="mt-1 block">{publicationDate(pub, locale)}</span>
            </p>
            <div className="min-w-0">
              <p className="pv-h3 text-[19px]">
                {pub.url ? (
                  <ExternalLink href={pub.url} srHint={tc("external")} className="transition hover:text-cyan">
                    {pub.title}
                  </ExternalLink>
                ) : (
                  pub.title
                )}
              </p>
              <p className="mt-2 text-sm leading-6 text-ink-3">
                <span className="sr-only">{t("authors")}: </span>
                {(pub.authors ?? [self]).map((name, i) => (
                  <Fragment key={name}>
                    {i > 0 && ", "}
                    {name === self ? <strong className="font-semibold text-ink">{name}</strong> : name}
                  </Fragment>
                ))}
              </p>
              {(pub.venue || pub.publisher) && <p className="pv-small mt-1 italic">{[pub.venue, pub.publisher].filter(Boolean).join(", ")}</p>}
              {pub.summary && <p className="mt-2 max-w-[64ch] text-[15px] leading-6 text-ink-2">{pub.summary[locale]}</p>}
              <p className="mt-1 flex flex-wrap gap-x-5">
                {pub.doi && (
                  <ExternalLink href={`https://doi.org/${pub.doi}`} srHint={tc("external")} className={linkClass}>
                    {t("doi")} {pub.doi}
                  </ExternalLink>
                )}
                {pub.pdf && (
                  <ExternalLink href={pub.pdf} srHint={tc("external")} className={linkClass}>
                    {t("pdf")}
                  </ExternalLink>
                )}
                {pub.code && (
                  <ExternalLink href={pub.code} srHint={tc("external")} className={linkClass}>
                    {t("code")}
                  </ExternalLink>
                )}
              </p>
              {pub.citations !== undefined && metrics && (
                <p className="pv-data mt-1">{t("citations", { count: pub.citations, source: metrics.source, date: asOf })}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
      {profiles.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <h3 className="pv-data mr-2">{t("profiles")}</h3>
          {profiles.map((p) => (
            <ExternalLink key={p.href} href={p.href} srHint={tc("external")} className="pv-btn pv-btn-ghost">
              {p.label}
            </ExternalLink>
          ))}
        </div>
      )}
    </div>
  );
}

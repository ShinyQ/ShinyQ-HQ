import { getTranslations } from "next-intl/server";
import { certViews, type CertView } from "@/content/cert-views";
import { CERT_FILTER_MIN, featuredCertifications, issuerCounts } from "@/content/certs";
import type { Locale } from "@/content/schema";
import { Link } from "@/i18n/navigation";
import { CertIndex, type CertFilterData } from "./CertIndex";
import { IssuerMark } from "./IssuerMark";

const STATUS_CLASS = { earned: "text-green", "in-progress": "text-amber", expired: "text-ink-3" } as const;

function FeaturedCard({ cert, details }: { cert: CertView; details: string }) {
  return (
    <button
      type="button"
      data-cert-open={cert.id}
      aria-haspopup="dialog"
      className="card relative flex h-full min-h-[200px] w-full flex-col overflow-hidden p-5 text-left transition hover:border-line-2 hover:bg-surface-2"
    >
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 bg-cyan/70" />
      <span className="flex items-center gap-2">
        <IssuerMark cert={cert} size={20} />
        <span className="pv-data">{cert.issuer}</span>
      </span>
      {cert.code && <span className="pv-num mt-4 block text-[clamp(30px,3vw,40px)] leading-none">{cert.code}</span>}
      <span className={`block leading-snug text-ink ${cert.code ? "mt-3 text-[15px]" : "mt-4 text-[17px] font-semibold"}`}>{cert.short}</span>
      <span className="mt-auto flex items-center justify-between gap-3 pt-4">
        <span className="pv-data">{cert.issuedLabel}</span>
        <span className="text-sm text-ink-2">{details}</span>
      </span>
    </button>
  );
}

function CertRow({ cert, status, featured }: { cert: CertView; status: string; featured: boolean }) {
  const muted = cert.status === "expired";
  return (
    <li
      data-cert={cert.id}
      data-featured={featured ? "" : undefined}
      hidden={featured || undefined}
      className="relative grid grid-cols-[76px_minmax(0,1fr)] items-center gap-3 border-b border-line py-2.5 transition-colors hover:bg-surface"
    >
      {cert.code ? <span className={`truncate font-mono text-[13px] font-bold ${muted ? "text-ink-3" : "text-ink"}`}>{cert.code}</span> : <IssuerMark cert={cert} size={22} />}
      <span className="min-w-0">
        <button type="button" data-cert-open={cert.id} aria-haspopup="dialog" title={cert.name} className="pv-stretch block w-full truncate text-left text-[15px] text-ink-2 hover:text-ink">
          {cert.short}
        </button>
        <span className="pv-data mt-0.5 flex min-w-0 items-center gap-2">
          {cert.code ? (
            <>
              <IssuerMark cert={cert} size={12} />
              <span className="sr-only">{cert.issuer}, </span>
            </>
          ) : (
            <span className="truncate">{cert.issuer} ·</span>
          )}
          <span className="shrink-0">{cert.issuedLabel}</span>
          {cert.status !== "earned" && <span className={`pv-mark shrink-0 ${STATUS_CLASS[cert.status]}`}>{status}</span>}
        </span>
      </span>
    </li>
  );
}

/**
 * Certifications for Page View: up to 3 featured cards, then a dense two-column list. `limit` (home)
 * caps the list and links to the full one on About; without it every certification is listed, and from
 * CERT_FILTER_MIN on an issuer, status and search bar appears. Every card and row opens the shared preview.
 * `certs` defaults to the content (the dev route passes a scale fixture).
 */
export async function Certifications({ locale, limit, certs = certViews(locale) }: { locale: Locale; limit?: number; certs?: CertView[] }) {
  const t = await getTranslations({ locale, namespace: "certs" });
  if (certs.length === 0) return null;
  const featured = featuredCertifications(certs);
  const rest = certs.filter((c) => !featured.includes(c));
  const summary = limit !== undefined;
  const withFilters = !summary && certs.length >= CERT_FILTER_MIN;
  const rows = summary ? rest.slice(0, limit) : withFilters ? certs : rest;
  const filters: CertFilterData | null = withFilters
    ? {
        items: certs.map(({ id, code, name, issuer, status }) => ({ id, code, name, issuer, status })),
        issuers: issuerCounts(certs).map(({ issuer, count }) => ({ issuer, count, logo: certs.find((c) => c.issuer === issuer)?.logo ?? null })),
        statuses: (["earned", "in-progress", "expired"] as const).filter((s) => certs.some((c) => c.status === s)),
      }
    : null;
  const hidden = summary ? rest.length - rows.length : 0;
  return (
    <CertIndex filters={filters}>
      <ul data-cert-featured="" aria-label={t("featured")} className="grid gap-3 md:grid-cols-3">
        {featured.map((cert) => (
          <li key={cert.id}>
            <FeaturedCard cert={cert} details={t("details")} />
          </li>
        ))}
      </ul>
      {rows.length > 0 && (
        <ul aria-label={t("list")} className="mt-6 grid gap-x-6 sm:grid-cols-2">
          {rows.map((cert) => (
            <CertRow key={cert.id} cert={cert} status={t(`status.${cert.status}`)} featured={withFilters && featured.includes(cert)} />
          ))}
        </ul>
      )}
      {hidden > 0 && (
        <p className="mt-6">
          <Link href="/contact#certifications" className="pv-go">
            {t("seeAll", { count: certs.length })}
          </Link>
        </p>
      )}
    </CertIndex>
  );
}

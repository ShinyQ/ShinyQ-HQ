import { formatYearMonth } from "@/lib/format";
import { shortCertName, sortCertifications, type CertView } from "./certs";
import { guideForCert } from "./guide-views";

export type { CertView } from "./certs";
import { getCertifications } from "./load";
import type { Certification, Locale } from "./schema";
import { getTechLogo } from "./tech";

/**
 * Issuer logo under public/tech, or null for issuers shown as text (joint programs such as "Kominfo x IBM").
 * Server only: the tech registry stays out of the client islands that import ./certs.
 */
export function issuerLogo(issuer: string): string | null {
  if (/\sx\s/i.test(issuer)) return null;
  return getTechLogo(issuer)?.src ?? null;
}

/** Every certification, sorted (earned newest first, then in progress, then expired). */
export function certViews(locale: Locale): CertView[] {
  return toCertViews(getCertifications(), locale);
}

export function toCertViews(certs: readonly Certification[], locale: Locale): CertView[] {
  return sortCertifications(certs).map((c) => ({
    id: c.id,
    code: c.code ?? null,
    name: c.name,
    short: shortCertName(c.name),
    issuer: c.issuer,
    logo: issuerLogo(c.issuer),
    issued: c.issued,
    issuedLabel: formatYearMonth(c.issued, locale),
    expires: c.expires ?? null,
    expiresLabel: c.expires ? formatYearMonth(c.expires, locale) : null,
    status: c.status,
    url: c.credentialUrl ?? null,
    credentialId: c.credentialId ?? null,
    shortLabel: c.shortLabel ?? null,
    featured: c.featured ?? false,
    guide: guideForCert(c.id),
  }));
}

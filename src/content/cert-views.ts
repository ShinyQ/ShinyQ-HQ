import { formatYearMonth } from "@/lib/format";
import { issuerLogo, shortCertName, sortCertifications, type CertStatus } from "./certs";
import { getCertifications } from "./load";
import type { Certification, Locale } from "./schema";

/** Serializable, locale-resolved certification for client islands, the preview card and the 3D wall. */
export interface CertView {
  id: string;
  code: string | null;
  name: string;
  short: string;
  issuer: string;
  logo: string | null;
  issued: string;
  issuedLabel: string;
  expires: string | null;
  expiresLabel: string | null;
  status: CertStatus;
  url: string | null;
  credentialId: string | null;
  featured: boolean;
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
    featured: c.featured ?? false,
  }));
}

/**
 * Pure certification helpers shared by Page View, the 3D Lobby wall and the preview card.
 * No zod, React or three imports, so client bundles and Vitest can use them.
 */

export type CertStatus = "earned" | "in-progress" | "expired";

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


/** The fields every helper needs; content certs and the serialized client shapes both fit. */
export interface CertLike {
  id: string;
  code?: string | null;
  name: string;
  issuer: string;
  issued: string;
  status: CertStatus;
  featured?: boolean | null;
}

const STATUS_RANK: Record<CertStatus, number> = { earned: 0, "in-progress": 1, expired: 2 };

/** Earned first (newest first), then in progress, then expired; ties by code or name. */
export function sortCertifications<T extends CertLike>(list: readonly T[]): T[] {
  return [...list].sort(
    (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || b.issued.localeCompare(a.issued) || (a.code ?? a.name).localeCompare(b.code ?? b.name),
  );
}

/** Up to `n` featured certs: pinned ones (`featured: true`) first, then the newest earned with an exam code, then any earned. */
export function featuredCertifications<T extends CertLike>(list: readonly T[], n = 3): T[] {
  const sorted = sortCertifications(list);
  const pinned = sorted.filter((c) => c.featured && c.status !== "expired");
  const earned = sorted.filter((c) => c.status === "earned" && !pinned.includes(c));
  return [...pinned, ...earned.filter((c) => c.code), ...earned.filter((c) => !c.code)].slice(0, n);
}

export interface IssuerCount {
  issuer: string;
  count: number;
}

/** Issuers by count (most first), ties by the most recent certification, then by name. */
export function issuerCounts(list: readonly CertLike[]): IssuerCount[] {
  const counts = new Map<string, { count: number; latest: string }>();
  for (const c of list) {
    const entry = counts.get(c.issuer) ?? { count: 0, latest: "" };
    counts.set(c.issuer, { count: entry.count + 1, latest: c.issued > entry.latest ? c.issued : entry.latest });
  }
  return [...counts]
    .sort(([an, a], [bn, b]) => b.count - a.count || b.latest.localeCompare(a.latest) || an.localeCompare(bn))
    .map(([issuer, { count }]) => ({ issuer, count }));
}

export interface IssuerTab {
  /** "all", an issuer name, or "other" for the folded remainder. */
  key: string;
  issuers: string[];
  count: number;
}

/**
 * Tabs for the 3D wall: All, up to `max` issuers with 2 or more certifications, then Other for the
 * rest (a lone remaining issuer keeps its own tab). One issuer in total means just All.
 */
export function issuerTabs(list: readonly CertLike[], max = 3): IssuerTab[] {
  const counts = issuerCounts(list);
  if (counts.length < 2) return [{ key: "all", issuers: counts.map((c) => c.issuer), count: list.length }];
  let named = counts.filter((c) => c.count >= 2).slice(0, max);
  let rest = counts.filter((c) => !named.includes(c));
  if (rest.length === 1) {
    named = [...named, rest[0]];
    rest = [];
  }
  return [
    { key: "all", issuers: counts.map((c) => c.issuer), count: list.length },
    ...named.map((c) => ({ key: c.issuer, issuers: [c.issuer], count: c.count })),
    ...(rest.length ? [{ key: "other", issuers: rest.map((c) => c.issuer), count: rest.reduce((n, c) => n + c.count, 0) }] : []),
  ];
}

export interface CertFilter {
  issuer?: string | null;
  status?: CertStatus | null;
  q?: string | null;
}

/** Case-insensitive search over code, name and issuer, plus exact issuer and status filters. */
export function matchesCertFilter(cert: Pick<CertLike, "code" | "name" | "issuer" | "status">, { issuer, status, q }: CertFilter): boolean {
  if (issuer && cert.issuer !== issuer) return false;
  if (status && cert.status !== status) return false;
  const needle = q?.trim().toLowerCase();
  if (!needle) return true;
  return `${cert.code ?? ""} ${cert.name} ${cert.issuer}`.toLowerCase().includes(needle);
}

/** Display name without the issuer's program prefix ("Microsoft Certified: Azure Fundamentals" to "Azure Fundamentals", "GitHub Certified: Agentic AI Developer" to "Agentic AI Developer"). */
export function shortCertName(name: string): string {
  return name.replace(/^(Microsoft Certified|GitHub Certified|AWS Certified|Google Cloud Certified)\s*:?\s*/i, "").trim() || name;
}

/** Page View shows the filter bar from this many certifications on. */
export const CERT_FILTER_MIN = 10;

const STATUSES: readonly CertStatus[] = ["earned", "in-progress", "expired"];

/** Page View filter state from the query string (`?issuer=`, `?status=`); unknown values are ignored. */
export function parseCertFilter(search: string, issuers: readonly string[]): { issuer: string | null; status: CertStatus | null } {
  const params = new URLSearchParams(search);
  const issuer = params.get("issuer");
  const status = params.get("status") as CertStatus | null;
  return { issuer: issuer && issuers.includes(issuer) ? issuer : null, status: status && STATUSES.includes(status) ? status : null };
}

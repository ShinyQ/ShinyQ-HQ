/**
 * Dev-only certification fixture for the layout prototype (/{locale}/dev/certs).
 * The first 7 entries mirror content/site-content.json; the rest are FICTIONAL placeholders that
 * only exercise the layouts at about 30 certifications. Never import this outside the prototype.
 */
export type ProtoStatus = "earned" | "in-progress" | "expired";

export interface ProtoCert {
  id: string;
  code: string | null;
  name: string;
  issuer: string;
  issued: string;
  status: ProtoStatus;
  url: string | null;
  /** Credential or certificate ID shown in the preview (fictional entries only). */
  credentialId?: string;
  expires?: string;
}

const c = (id: string, code: string | null, name: string, issuer: string, issued: string, status: ProtoStatus = "earned", url: string | null = "https://example.com/credential"): ProtoCert => ({
  id,
  code,
  name,
  issuer,
  issued,
  status,
  url: status === "in-progress" ? null : url,
});

const REAL: ProtoCert[] = [
  c("ai-103", "AI-103", "Microsoft Certified: Azure AI Apps and Agents Developer Associate", "Microsoft", "2026-09"),
  c("ai-901", "AI-901", "Microsoft Certified: Azure AI Fundamentals", "Microsoft", "2026-05"),
  c("az-900", "AZ-900", "Microsoft Certified: Azure Fundamentals", "Microsoft", "2026-05"),
  c("gh-600", "GH-600", "Developing in Agentic AI Systems", "GitHub", "2026-10", "in-progress"),
  c("hackerrank-problem-solving-basic", null, "Problem Solving (Basic)", "HackerRank", "2021-02"),
  c("associate-data-scientist-microcredential", null, "Microcredential: Associate Data Scientist", "IARC x APTIKOM", "2021-12", "earned", null),
  c("digital-talent-machine-learning", null, "Digital Talent Scholarship: Machine Learning (160 hours)", "Kominfo x IBM", "2021-07", "earned", null),
];

const FICTIONAL: ProtoCert[] = [
  c("az-204", "AZ-204", "Microsoft Certified: Azure Developer Associate", "Microsoft", "2026-07"),
  c("az-104", "AZ-104", "Microsoft Certified: Azure Administrator Associate", "Microsoft", "2025-11"),
  c("az-305", "AZ-305", "Microsoft Certified: Azure Solutions Architect Expert", "Microsoft", "2026-10", "in-progress"),
  c("az-400", "AZ-400", "Microsoft Certified: DevOps Engineer Expert", "Microsoft", "2025-03"),
  c("dp-100", "DP-100", "Microsoft Certified: Azure Data Scientist Associate", "Microsoft", "2025-06"),
  c("dp-900", "DP-900", "Microsoft Certified: Azure Data Fundamentals", "Microsoft", "2024-09"),
  c("dp-203", "DP-203", "Microsoft Certified: Azure Data Engineer Associate", "Microsoft", "2023-04", "expired"),
  c("sc-900", "SC-900", "Microsoft Certified: Security, Compliance, and Identity Fundamentals", "Microsoft", "2024-02"),
  c("pl-900", "PL-900", "Microsoft Certified: Power Platform Fundamentals", "Microsoft", "2023-08"),
  c("ai-102", "AI-102", "Microsoft Certified: Azure AI Engineer Associate", "Microsoft", "2024-12"),
  c("gh-900", "GH-900", "GitHub Foundations", "GitHub", "2025-02"),
  c("gh-300", "GH-300", "GitHub Copilot", "GitHub", "2025-05"),
  c("gh-200", "GH-200", "GitHub Actions", "GitHub", "2025-08"),
  c("gh-500", "GH-500", "GitHub Advanced Security", "GitHub", "2026-01"),
  c("gh-100", "GH-100", "GitHub Administration", "GitHub", "2026-03"),
  c("clf-c02", "CLF-C02", "AWS Certified Cloud Practitioner", "AWS", "2024-05"),
  c("saa-c03", "SAA-C03", "AWS Certified Solutions Architect: Associate", "AWS", "2024-10"),
  c("dva-c02", "DVA-C02", "AWS Certified Developer: Associate", "AWS", "2025-04"),
  c("aif-c01", "AIF-C01", "AWS Certified AI Practitioner", "AWS", "2025-09"),
  c("mla-c01", "MLA-C01", "AWS Certified Machine Learning Engineer: Associate", "AWS", "2026-10", "in-progress"),
  c("gcp-ace", "ACE", "Google Cloud Associate Cloud Engineer", "Google Cloud", "2023-06", "expired"),
  c("gcp-pmle", "PMLE", "Google Cloud Professional Machine Learning Engineer", "Google Cloud", "2025-12"),
  c("hackerrank-python-basic", null, "Python (Basic)", "HackerRank", "2021-03"),
];

for (const [i, x] of FICTIONAL.entries()) {
  if (x.url) x.credentialId = `PROTO-${(4096 + i * 37).toString(16).toUpperCase()}`;
  if (x.status === "expired") x.expires = `${Number(x.issued.slice(0, 4)) + 1}${x.issued.slice(4)}`;
  else if (x.issuer === "Microsoft" && /Associate|Expert/.test(x.name)) x.expires = `${Number(x.issued.slice(0, 4)) + 1}${x.issued.slice(4)}`;
}

/** `n` 7 returns the real list; anything larger returns the real list plus fictional entries. */
export function protoCerts(n: number): ProtoCert[] {
  return n <= REAL.length ? REAL.slice(0, n) : [...REAL, ...FICTIONAL].slice(0, n);
}

export type IssuerGroup = "Microsoft" | "GitHub" | "AWS" | "Google Cloud" | "Other";
export const ISSUER_ORDER: IssuerGroup[] = ["Microsoft", "GitHub", "AWS", "Google Cloud", "Other"];
export const issuerGroup = (issuer: string): IssuerGroup => (ISSUER_ORDER.includes(issuer as IssuerGroup) ? (issuer as IssuerGroup) : "Other");
export const ISSUER_LOGO: Partial<Record<IssuerGroup, string>> = { Microsoft: "/tech/azure.svg", GitHub: "/tech/github.svg", AWS: "/tech/aws.webp", "Google Cloud": "/tech/google.svg" };
export const ISSUER_COLOR: Record<IssuerGroup, string> = { Microsoft: "#60a5fa", GitHub: "#e5e7eb", AWS: "#fbbf24", "Google Cloud": "#34d399", Other: "#a78bfa" };

const STATUS_RANK: Record<ProtoStatus, number> = { earned: 0, "in-progress": 1, expired: 2 };
/** Earned first (newest first), then in progress, then expired. */
export const sortCerts = (list: readonly ProtoCert[]) => [...list].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || b.issued.localeCompare(a.issued) || a.name.localeCompare(b.name));

export function groupByIssuer(list: readonly ProtoCert[]): { issuer: IssuerGroup; certs: ProtoCert[] }[] {
  const sorted = sortCerts(list);
  return ISSUER_ORDER.map((issuer) => ({ issuer, certs: sorted.filter((x) => issuerGroup(x.issuer) === issuer) })).filter((g) => g.certs.length > 0);
}

export function groupByYear(list: readonly ProtoCert[]): { year: string; certs: ProtoCert[] }[] {
  const years = [...new Set(list.map((x) => x.issued.slice(0, 4)))].sort((a, b) => b.localeCompare(a));
  return years.map((year) => ({ year, certs: sortCerts(list.filter((x) => x.issued.startsWith(year))) }));
}

/** Featured: the newest earned certs with an exam code (falls back to any earned). */
export function featured(list: readonly ProtoCert[], n = 3): ProtoCert[] {
  const earned = sortCerts(list).filter((x) => x.status === "earned");
  const coded = earned.filter((x) => x.code);
  return [...coded, ...earned.filter((x) => !x.code)].slice(0, n);
}

export const shortName = (name: string) => name.replace(/^Microsoft Certified: /, "").replace(/^AWS Certified /, "").replace(/^Google Cloud /, "");

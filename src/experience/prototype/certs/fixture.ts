import type { Certification } from "@/content/schema";

/**
 * Scale fixture for the certification layouts (unit tests and the dev-only /{locale}/dev/certs route).
 * The first 8 entries mirror content/site-content.json; the other 22 are FICTIONAL placeholders that
 * only exercise the layouts at 30 certifications. Never import this into shipped pages.
 */
const real: Certification[] = [
  { id: "ai-103", code: "AI-103", name: "Microsoft Certified: Azure AI Apps and Agents Developer Associate", issuer: "Microsoft", issued: "2026-09", credentialUrl: "https://example.com/credential/ai-103", status: "earned" },
  { id: "ai-901", code: "AI-901", name: "Microsoft Certified: Azure AI Fundamentals", issuer: "Microsoft", issued: "2026-05", credentialUrl: "https://example.com/credential/ai-901", status: "earned" },
  { id: "az-900", code: "AZ-900", name: "Microsoft Certified: Azure Fundamentals", issuer: "Microsoft", issued: "2026-05", credentialUrl: "https://example.com/credential/az-900", status: "earned" },
  { id: "gh-600", code: "GH-600", name: "GitHub Certified: Agentic AI Developer", issuer: "GitHub", issued: "2026-10", credentialUrl: "https://example.com/credential/gh-600", status: "earned", expires: "2027-10" },
  { id: "google-gen-ai-leader", name: "Google Certified: Generative AI Leader", issuer: "Google", issued: "2026-10", credentialUrl: "https://example.com/credential/google-gen-ai-leader", credentialId: "FIXTURE-GOOGLE", status: "earned", expires: "2029-10", featured: true },
  { id: "associate-data-scientist-microcredential", name: "Microcredential: Associate Data Scientist", issuer: "IARC x APTIKOM", issued: "2021-12", status: "earned" },
  { id: "digital-talent-machine-learning", name: "Digital Talent Scholarship: Machine Learning (160 hours)", issuer: "Kominfo x IBM", issued: "2021-07", status: "earned" },
  { id: "toefl-itp", name: "TOEFL ITP (score 547)", issuer: "ETS", issued: "2024", status: "earned" },
];

type Row = [id: string, code: string, name: string, issuer: string, issued: string, status?: Certification["status"]];
const fictional: Row[] = [
  ["az-204", "AZ-204", "Microsoft Certified: Azure Developer Associate", "Microsoft", "2026-07"],
  ["az-104", "AZ-104", "Microsoft Certified: Azure Administrator Associate", "Microsoft", "2025-11"],
  ["az-305", "AZ-305", "Microsoft Certified: Azure Solutions Architect Expert", "Microsoft", "2026-10", "in-progress"],
  ["az-400", "AZ-400", "Microsoft Certified: DevOps Engineer Expert", "Microsoft", "2025-03"],
  ["dp-100", "DP-100", "Microsoft Certified: Azure Data Scientist Associate", "Microsoft", "2025-06"],
  ["dp-900", "DP-900", "Microsoft Certified: Azure Data Fundamentals", "Microsoft", "2024-09"],
  ["dp-203", "DP-203", "Microsoft Certified: Azure Data Engineer Associate", "Microsoft", "2023-04", "expired"],
  ["sc-900", "SC-900", "Microsoft Certified: Security, Compliance, and Identity Fundamentals", "Microsoft", "2024-02"],
  ["pl-900", "PL-900", "Microsoft Certified: Power Platform Fundamentals", "Microsoft", "2023-08"],
  ["ai-102", "AI-102", "Microsoft Certified: Azure AI Engineer Associate", "Microsoft", "2024-12"],
  ["gh-900", "GH-900", "GitHub Foundations", "GitHub", "2025-02"],
  ["gh-300", "GH-300", "GitHub Copilot", "GitHub", "2025-05"],
  ["gh-200", "GH-200", "GitHub Actions", "GitHub", "2025-08"],
  ["gh-500", "GH-500", "GitHub Advanced Security", "GitHub", "2026-01"],
  ["gh-100", "GH-100", "GitHub Administration", "GitHub", "2026-03"],
  ["clf-c02", "CLF-C02", "AWS Certified Cloud Practitioner", "AWS", "2024-05"],
  ["saa-c03", "SAA-C03", "AWS Certified Solutions Architect: Associate", "AWS", "2024-10"],
  ["dva-c02", "DVA-C02", "AWS Certified Developer: Associate", "AWS", "2025-04"],
  ["aif-c01", "AIF-C01", "AWS Certified AI Practitioner", "AWS", "2025-09"],
  ["mla-c01", "MLA-C01", "AWS Certified Machine Learning Engineer: Associate", "AWS", "2026-10", "in-progress"],
  ["gcp-ace", "ACE", "Google Cloud Associate Cloud Engineer", "Google Cloud", "2023-06", "expired"],
  ["hackerrank-python-basic", "", "Python (Basic)", "HackerRank", "2021-03"],
];

const nextYear = (ym: string) => `${Number(ym.slice(0, 4)) + 1}${ym.slice(4)}`;

export const CERT_FIXTURE: Certification[] = [
  ...real,
  ...fictional.map(([id, code, name, issuer, issued, status = "earned"], i): Certification => ({
    id,
    ...(code ? { code } : {}),
    name,
    issuer,
    issued,
    status,
    ...(status !== "in-progress" ? { credentialUrl: `https://example.com/credential/${id}`, credentialId: `FIXTURE-${(4096 + i * 37).toString(16).toUpperCase()}` } : {}),
    ...(status === "expired" || (issuer === "Microsoft" && /Associate|Expert/.test(name)) ? { expires: nextYear(issued) } : {}),
  })),
];

/** `n` 8 is the live-like list; larger counts add fictional entries. */
export const certFixture = (n: number) => CERT_FIXTURE.slice(0, Math.max(0, Math.min(n, CERT_FIXTURE.length)));

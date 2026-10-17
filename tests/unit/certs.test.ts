import { describe, expect, it } from "vitest";
import { toCertViews } from "@/content/cert-views";
import { issuerLogo } from "@/content/cert-views";
import { featuredCertifications, issuerCounts, issuerTabs, matchesCertFilter, parseCertFilter, shortCertName, sortCertifications } from "@/content/certs";
import { getCertifications } from "@/content/load";
import { CertificationSchema } from "@/content/schema";
import { CERT_FIXTURE, certFixture } from "@/experience/prototype/certs/fixture";

describe("certification helpers", () => {
  it("keeps the scale fixture valid against the schema, with the live 8 first", () => {
    expect(CERT_FIXTURE).toHaveLength(30);
    for (const cert of CERT_FIXTURE) expect(CertificationSchema.safeParse(cert).success, cert.id).toBe(true);
    expect(certFixture(8).map((c) => c.id)).toEqual(getCertifications().map((c) => c.id));
  });

  it("sorts earned newest first, then in progress, then expired", () => {
    const sorted = sortCertifications(CERT_FIXTURE);
    const rank = { earned: 0, "in-progress": 1, expired: 2 } as const;
    for (let i = 1; i < sorted.length; i++) {
      const [a, b] = [sorted[i - 1], sorted[i]];
      expect(rank[a.status] <= rank[b.status], `${a.id} before ${b.id}`).toBe(true);
      if (a.status === b.status) expect(a.issued >= b.issued, `${a.id} before ${b.id}`).toBe(true);
    }
    expect(sorted[0].id).toBe("gh-600");
    expect(sorted.at(-1)?.status).toBe("expired");
  });

  it("features pinned certs first, then the newest earned with an exam code", () => {
    expect(featuredCertifications(getCertifications()).map((c) => c.id)).toEqual(["google-gen-ai-leader", "gh-600", "ai-103"]);
    const pinned = CERT_FIXTURE.map((c) => (c.id === "gh-900" ? { ...c, featured: true } : c));
    expect(featuredCertifications(pinned).map((c) => c.id)).toEqual(["google-gen-ai-leader", "gh-900", "gh-600"]);
    expect(featuredCertifications(CERT_FIXTURE.filter((c) => !c.code))).toHaveLength(3);
    expect(featuredCertifications(CERT_FIXTURE).every((c) => c.status === "earned")).toBe(true);
  });

  it("counts issuers, most first, ties by the newest certification", () => {
    expect(issuerCounts(CERT_FIXTURE).slice(0, 3)).toEqual([
      { issuer: "Microsoft", count: 13 },
      { issuer: "GitHub", count: 6 },
      { issuer: "AWS", count: 5 },
    ]);
    expect(issuerCounts(getCertifications())[0]).toEqual({ issuer: "Microsoft", count: 3 });
    expect(issuerCounts(getCertifications())[1].issuer).toBe("GitHub");
  });

  it("builds wall tabs: All, issuers with 2 or more, then Other", () => {
    expect(issuerTabs(getCertifications()).map((t) => [t.key, t.count])).toEqual([
      ["all", 8],
      ["Microsoft", 3],
      ["other", 5],
    ]);
    const tabs = issuerTabs(CERT_FIXTURE);
    expect(tabs.map((t) => t.key)).toEqual(["all", "Microsoft", "GitHub", "AWS", "other"]);
    expect(tabs.reduce((n, t) => (t.key === "all" ? n : n + t.count), 0)).toBe(30);
    expect(issuerTabs(CERT_FIXTURE.filter((c) => c.issuer === "AWS")).map((t) => t.key)).toEqual(["all"]);
    // A lone remaining issuer keeps its own tab instead of "Other".
    expect(issuerTabs(CERT_FIXTURE.filter((c) => ["Microsoft", "GitHub"].includes(c.issuer))).map((t) => t.key)).toEqual(["all", "Microsoft", "GitHub"]);
  });

  it("filters by issuer, status and search text", () => {
    const pick = (f: Parameters<typeof matchesCertFilter>[1]) => CERT_FIXTURE.filter((c) => matchesCertFilter(c, f)).map((c) => c.id);
    expect(pick({ issuer: "AWS" })).toHaveLength(5);
    expect(pick({ status: "expired" })).toEqual(["dp-203", "gcp-ace"]);
    expect(pick({ q: "  gh-6 " })).toEqual(["gh-600"]);
    expect(pick({ q: "copilot", issuer: "GitHub" })).toEqual(["gh-300"]);
    expect(pick({ q: "hackerrank" })).toHaveLength(1);
    expect(pick({})).toHaveLength(30);
  });

  it("reads filter state from the query string and ignores unknown values", () => {
    expect(parseCertFilter("?issuer=AWS&status=expired", ["AWS"])).toEqual({ issuer: "AWS", status: "expired" });
    expect(parseCertFilter("?issuer=Nope&status=verified&tier=lite", ["AWS"])).toEqual({ issuer: null, status: null });
  });

  it("resolves issuer logos and keeps joint programs as text", () => {
    expect(issuerLogo("Microsoft")).toBe("/tech/microsoft.svg");
    expect(issuerLogo("GitHub")).toBe("/tech/github.svg");
    expect(issuerLogo("AWS")).toBe("/tech/aws.webp");
    expect(issuerLogo("Google")).toBe("/tech/google.svg");
    expect(issuerLogo("Google Cloud")).toBe("/tech/google.svg");
    expect(issuerLogo("HackerRank")).toBe("/tech/hackerrank.svg");
    expect(issuerLogo("Kominfo x IBM")).toBeNull();
    expect(issuerLogo("IARC x APTIKOM")).toBeNull();
  });

  it("drops program prefixes from display names", () => {
    expect(shortCertName("Microsoft Certified: Azure Fundamentals")).toBe("Azure Fundamentals");
    expect(shortCertName("AWS Certified Cloud Practitioner")).toBe("Cloud Practitioner");
    expect(shortCertName("GitHub Certified: Agentic AI Developer")).toBe("Agentic AI Developer");
    expect(shortCertName("Google Certified: Generative AI Leader")).toBe("Generative AI Leader");
    expect(shortCertName("GitHub Copilot")).toBe("GitHub Copilot");
  });

  it("builds locale-resolved views without confidence or verified labels", () => {
    const en = toCertViews(CERT_FIXTURE, "en");
    const id = toCertViews(CERT_FIXTURE, "id");
    expect(en[0]).toMatchObject({ id: "gh-600", short: "Agentic AI Developer", logo: "/tech/github.svg", issuedLabel: "Oct 2026", expiresLabel: "Oct 2027" });
    expect(en.find((c) => c.id === "ai-103")).toMatchObject({ short: "Azure AI Apps and Agents Developer Associate", logo: "/tech/microsoft.svg", issuedLabel: "Sep 2026" });
    expect(id.find((c) => c.id === "az-305")?.issuedLabel).toBe("Okt 2026");
    expect(en.find((c) => c.id === "dp-203")).toMatchObject({ status: "expired", expires: "2024-04" });
    expect(JSON.stringify(en)).not.toMatch(/verified/i);
  });
});

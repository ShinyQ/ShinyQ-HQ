import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getPods, getProduction } from "@/content/load";
import { ProductionSchema } from "@/content/schema";
import { midSrc, thumbSrc } from "@/content/media";
import { collectStrings, findBlockedTerms, findForbiddenPatterns, loadBlocklist } from "@/content/safety";
import { webpChunks, webpSize } from "../helpers/webp";

/** "How I run AI in production" (owner approved 2026-10-14): facts only, no client or resource names. */
describe("production observability section", () => {
  const production = getProduction();

  it("validates against its schema", () => {
    expect(ProductionSchema.safeParse(production).success).toBe(true);
  });

  it("links only to existing case studies, in the approved order", () => {
    const slugs = new Set(getPods().map((p) => p.slug));
    expect(production.caseStudies.filter((s) => !slugs.has(s))).toEqual([]);
    expect(production.caseStudies).toEqual([
      "ai-code-security-platform",
      "voice-ai-contact-center",
      "fraud-review-platform",
      "azure-ai-operations",
      "ticket-marketplace-backend",
    ]);
  });

  it("fills all three Ops Control Room screens from the proof tiles", () => {
    const panels = new Set(production.tiles.map((t) => t.panel));
    expect([...panels].sort()).toEqual(["alerts", "metrics", "traces"]);
    expect(new Set(production.tiles.map((t) => t.id)).size).toBe(production.tiles.length);
  });

  it("keeps the approved facts", () => {
    const en = JSON.stringify(collectStrings(production).map((l) => l.value));
    for (const fact of ["OpenTelemetry", "Azure Monitor", "44", "Bicep", "Prometheus", "Grafana", "80 percent", "every 5 seconds"]) {
      expect(en).toContain(fact);
    }
    // The TEMMPAT Prometheus config probes 10 endpoints (11 was an older revision).
    expect(production.tiles.find((t) => t.id === "api-probes")?.value.en).toBe("10");
  });

  it("publishes no client name, resource id, hostname or GUID (masked excerpt included)", () => {
    const terms = loadBlocklist();
    const hits = collectStrings(production).flatMap(({ path: at, value }) => {
      const found = [...findBlockedTerms(value, terms), ...findForbiddenPatterns(value)];
      if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(value)) found.push("guid");
      if (/\/subscriptions\/|resourceGroups|\.azure\.com|\.windows\.net|https?:\/\//i.test(value)) found.push("resource path or url");
      return found.length ? [`${at}: ${found.join(", ")}`] : [];
    });
    expect(hits).toEqual([]);
  });

  it("ships the masked dashboard as reviewed WebP files without metadata (full, 480 and 1200 px)", () => {
    const dashboard = production.dashboard!;
    expect(dashboard.redacted).toBe(true);
    expect(dashboard.src.startsWith("/media/production/")).toBe(true);
    for (const [src, width] of [[dashboard.src, dashboard.width], [thumbSrc(dashboard.src), 480], [midSrc(dashboard.src), 1200]] as const) {
      const file = path.join(process.cwd(), "public", src);
      expect(existsSync(file), src).toBe(true);
      const bytes = readFileSync(file);
      expect(webpSize(bytes).width, src).toBe(width);
      expect(webpChunks(bytes).filter((c) => c === "EXIF" || c === "XMP "), src).toEqual([]);
    }
    expect(webpSize(readFileSync(path.join(process.cwd(), "public", dashboard.src))).height).toBe(dashboard.height);
  });

  it("is stored in the dataset, not hardcoded in components", () => {
    const raw = JSON.parse(readFileSync(path.join(process.cwd(), "content", "site-content.json"), "utf8"));
    expect(raw.production.title.en).toBe("How I run AI in production");
  });
});

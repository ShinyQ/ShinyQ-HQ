import { describe, expect, it } from "vitest";
import raw from "../../content/site-content.json";
import { buildKnowledgePack } from "@/ask/pack";
import { SiteContentSchema } from "@/content/schema";

const content = SiteContentSchema.parse(raw);
const pods = content.floors.labs.pods;
const pod = (slug: string) => pods.find((p) => p.slug === slug)!;
const pack = buildKnowledgePack({ content, contentDate: "2026-10-18", products: [] });
const packed = (slug: string, locale: "en" | "id") =>
  pack.chunks.find((c) => c.id === `project-${slug}`)![locale === "en" ? "text_en" : "text_id"];

describe("portfolio evidence and ownership", () => {
  it.each([
    ["voice-ai-contact-center", [/A\/B terkontrol/, /n=4 panggilan per jalur/]],
    ["fraud-review-platform", [/paket bersih/, /gangguan administratif/, /development offline/]],
  ] as const)("fits %s ID result scope inside the 80-character screenshot label", (slug, qualifiers) => {
    const label = pod(slug).results[0].label.id;
    expect(label.length).toBeLessThanOrEqual(80);
    for (const qualifier of qualifiers) expect(label).toMatch(qualifier);
  });

  for (const locale of ["en", "id"] as const) {
    it.each([
      ["voice-ai-contact-center", /n\s*=\s*4/i],
      ["fraud-review-platform", /offline.*development|development.*offline/i],
      ["covid-herd-immunity-forecast", /in-sample/i],
      ["ai-cv-screening-platform", /22.*(?:no recorded rerun|tanpa rerun tercatat)/i],
    ] as const)("keeps %s caveats inside an untruncated " + locale + " source summary", (slug, caveat) => {
      const text = pod(slug).tagline[locale];
      expect(text.length).toBeGreaterThanOrEqual(140);
      expect(text.length).toBeLessThanOrEqual(160);
      expect(text).toMatch(caveat);
    });
  }

  it.each(["en", "id"] as const)("separates Clearbox model scores from code reasons in packed %s", (locale) => {
    const first = pod("clearbox").approach[0][locale];
    const text = packed("clearbox", locale);
    expect(first).toMatch(/Microsoft-Decision-1/);
    expect(first).toMatch(/probabilities|probabilitas/);
    expect(first).toMatch(/code.*reasons|kode.*alasan/);
    expect(text).toContain(first);
    expect(text).toMatch(/approv|persetujuan/i);
    expect(text).toMatch(/Undo.{0,15}24/);
    expect(text).toMatch(/no permanent delet|tanpa penghapusan permanen/i);
    expect(text).toMatch(/40.{0,25}[Ss]ynthetic|40.{0,25}sintetis/);
    expect(pod("clearbox").approach[2][locale]).toMatch(/enough labels|label.{0,10}cukup/);
    expect(pod("clearbox").approach[2][locale]).toMatch(/target|menargetkan/);
    expect(pod("clearbox").approach[2][locale]).toMatch(/0\.99/);
  });

  it.each(["en", "id"] as const)("keeps colleague-led Cowork distinct from Deck and frontend work in %s", (locale) => {
    for (const slug of ["mii-cowork", "agent-deck-platform"]) {
      expect(packed(slug, locale)).toMatch(/colleague|rekan/);
      expect(packed(slug, locale)).toMatch(/Deck Studio/);
    }
    expect(pod("mii-cowork").tagline[locale]).toMatch(/frontend/);
    expect(packed("mii-cowork", locale)).toMatch(/no backend or API change|tanpa perubahan backend atau API/);
  });

  it("uses sector labels for client products but retains employer product identities", () => {
    expect(JSON.stringify(raw)).not.toMatch(/\bATLAS\b|\bFREDDY\b/);
    for (const name of ["ARIA", "Pris.AI", "MII Fraud Detection", "MII E-Recruitment", "eVendor", "MII Deck", "MII Cowork"]) {
      expect(JSON.stringify(raw)).toContain(name);
    }
  });

  it.each(["en", "id"] as const)("describes Sewise calculations without asserting physical validation in %s", (locale) => {
    const sewise = pod("sewise-fashion-labs");
    expect(sewise.tagline[locale]).toMatch(/hackathon 2026|2026 hackathon/);
    expect(sewise.tagline[locale]).toMatch(/calculated|perhitungan/);
    expect(sewise.tagline[locale]).not.toMatch(/exact fabric|kain yang tepat/);
    expect(packed("sewise-fashion-labs", locale)).toMatch(/not physical|bukan.{0,20}fisik/);
    expect(sewise.results.map((r) => r.value)).toEqual(["1,390", "118", "9"]);
  });

  it("localizes explanatory labels in all 19 graphs without translating canonical technologies", () => {
    const graphs = pods.flatMap((p) => p.architecture ? [p.architecture] : []);
    const canonical: Record<string, string> = {
      postgresql: "PostgreSQL", redis: "Redis", mysql: "MySQL",
      nessus: "Nessus", openai: "Azure OpenAI", search: "Azure AI Search",
    };
    expect(graphs).toHaveLength(19);
    for (const graph of graphs) {
      expect(graph.nodes.some((n) => typeof n.label !== "string")).toBe(true);
      expect(graph.edges.some((e) => e.label && typeof e.label !== "string")).toBe(true);
      for (const node of graph.nodes) {
        if (node.group) expect(typeof node.group).toBe("string");
        if (canonical[node.id]) {
          expect(typeof node.label).toBe("string");
          expect(node.label).toMatch(new RegExp(`^${canonical[node.id]}`));
        }
      }
    }
  });
});

import { describe, expect, it } from "vitest";
import { getContact, getLibrary, getProfile } from "@/content/load";
import { buildRoomViews } from "@/content/room-views";
import { isResearch, publicationDate, researchPublications } from "@/content/selectors";
import { buildHudIndex } from "@/hud/index-data";
import { buildPaletteEntries } from "@/hud/search";
import { getContent } from "@/content/load";

const research = researchPublications(getLibrary().publications);
const OWNER = getProfile().name;

describe("research publications (verified records)", () => {
  it("lists the two IEEE papers, the eProceedings paper and the BSc thesis, newest first", () => {
    expect(research.map((p) => p.id)).toEqual(["sentiboard-paper", "sentiboard-bsc-thesis", "covid-19-herd-immunity-study", "ewallet-sentiment-cnn-lstm"]);
    expect(research.every((p) => isResearch(p.kind))).toBe(true);
  });

  it("keeps DOIs, authors with the owner, venues and bilingual summaries", () => {
    const ewallet = research.find((p) => p.id === "ewallet-sentiment-cnn-lstm")!;
    expect(ewallet).toMatchObject({ doi: "10.1109/icaibda53487.2021.9689712", publisher: "IEEE", date: "2021-10-27", citations: 10 });
    expect(ewallet.url).toBe("https://doi.org/10.1109/icaibda53487.2021.9689712");
    expect(ewallet.authors).toHaveLength(5);
    const covid = research.find((p) => p.id === "covid-19-herd-immunity-study")!;
    expect(covid).toMatchObject({ doi: "10.1109/icicyta53712.2021.9689122", date: "2021-12-01" });
    const sentiboard = research.find((p) => p.id === "sentiboard-paper")!;
    expect(sentiboard.title).toMatch(/^Implementasi Model IndoBERT/);
    expect(sentiboard.authors).toEqual([OWNER]);
    expect(sentiboard.pdf).toMatch(/^https:\/\/openlibrarypublications\.telkomuniversity\.ac\.id\//);
    for (const p of research) {
      expect(p.authors).toContain(OWNER);
      expect(p.summary?.en.length).toBeGreaterThan(20);
      expect(p.summary?.id.length).toBeGreaterThan(20);
    }
  });

  it("never lists the unrelated Bandung licensing paper", () => {
    expect(JSON.stringify(getLibrary())).not.toMatch(/Licensing Service/i);
  });

  it("dates citations and profile metrics, and links Google Scholar and IEEE Xplore", () => {
    expect(getLibrary().researchMetrics).toEqual({ source: "Google Scholar", citations: 13, hIndex: 2, asOf: "2026-10" });
    expect(getContact().googleScholar).toBe("https://scholar.google.com/citations?user=u8OY1foAAAAJ");
    expect(getContact().ieeeXplore).toBe("https://ieeexplore.ieee.org/author/37089283106");
  });

  it("formats full dates, months and bare years", () => {
    expect(publicationDate(research.find((p) => p.id === "covid-19-herd-immunity-study")!, "en")).toMatch(/2021/);
    expect(publicationDate(research.find((p) => p.id === "sentiboard-paper")!, "id")).toMatch(/2023/);
    expect(publicationDate({ ...research[0], date: undefined, year: 2020 }, "en")).toBe("2020");
  });
});

describe("Research shelf room", () => {
  it("has a drawer view with highlighted authors, DOIs, dated citations and profiles in both languages", () => {
    for (const locale of ["en", "id"] as const) {
      const view = buildRoomViews(locale)["L4:research"];
      expect(view.kind).toBe("research");
      expect(view.research?.self).toBe(OWNER);
      expect(view.research?.items).toHaveLength(research.length);
      expect(view.research?.items.find((i) => i.id === "ewallet-sentiment-cnn-lstm")?.citations).toMatch(/10/);
      expect(view.research?.metrics).toMatch(locale === "en" ? /as of Oct/ : /per Okt/);
      expect(view.research?.profiles.map((p) => p.title)).toEqual(["Google Scholar", "IEEE Xplore"]);
    }
  });

  it("is searchable from Cmd-K by research terms", () => {
    const index = buildHudIndex(getContent());
    const room = index.rooms.find((r) => r.id === "L4:research")!;
    expect(room).toMatchObject({ floor: "L4", kind: "research", path: "/library#research" });
    expect(room.keywords).toEqual(expect.arrayContaining(["research", "IEEE", "10.1109/icaibda53487.2021.9689712"]));
    const entries = buildPaletteEntries(index, []);
    expect(entries.some((e) => e.target.type === "room" && e.target.id === "L4:research")).toBe(true);
  });

  it("moves papers off the models shelf", () => {
    const views = buildRoomViews("en");
    const models = views["L4:publications"].sections.flatMap((s) => s.items ?? []);
    expect(models.length).toBeGreaterThan(0);
    expect(models.every((i) => !/Implementasi|Herd Immunity|Digital Wallet/.test(i.title))).toBe(true);
  });
});

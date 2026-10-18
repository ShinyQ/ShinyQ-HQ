import { describe, expect, it } from "vitest";
import { apaCitation, bibtexCitation, bibtexKey, citationsFor, entryType, ieeeCitation, previewCitations, scholarSearchUrl, splitName } from "@/content/citation";
import { getLibrary, getProfile } from "@/content/load";
import { buildPaperPreview } from "@/content/papers";
import type { Publication } from "@/content/schema";
import { researchPublications } from "@/content/selectors";

const self = getProfile().name;
const papers = researchPublications(getLibrary().publications);
const byId = (id: string) => papers.find((p) => p.id === id)!;

describe("citation formats", () => {
  it("splits names into family and given names", () => {
    expect(splitName("Kurniadi Ahmad Wijaya")).toEqual({ family: "Wijaya", given: ["Kurniadi", "Ahmad"] });
    expect(splitName("Plato")).toEqual({ family: "Plato", given: [] });
  });

  it("classifies conference papers, journal-style proceedings and theses", () => {
    expect(entryType(byId("ewallet-sentiment-cnn-lstm"))).toBe("inproceedings");
    expect(entryType(byId("sentiboard-paper"))).toBe("article");
    expect(entryType(byId("sentiboard-bsc-thesis"))).toBe("thesis");
  });

  it("formats an IEEE conference paper in APA 7", () => {
    expect(apaCitation(byId("ewallet-sentiment-cnn-lstm"), self)).toBe(
      "Fattahila, A. A., Amorokhman, F. I., Auditama, K. M., Wijaya, K. A., & Romadhony, A. (2021). Indonesian Digital Wallet Sentiment Analysis Using CNN and LSTM Method. " +
        "In 2021 International Conference on Artificial Intelligence and Big Data Analytics (ICAIBDA) (pp. 1-6). IEEE. https://doi.org/10.1109/icaibda53487.2021.9689712",
    );
  });

  it("formats the same paper in IEEE style", () => {
    expect(ieeeCitation(byId("ewallet-sentiment-cnn-lstm"), self)).toBe(
      'A. A. Fattahila, F. I. Amorokhman, K. M. Auditama, K. A. Wijaya, and A. Romadhony, "Indonesian Digital Wallet Sentiment Analysis Using CNN and LSTM Method," ' +
        "in Proc. 2021 International Conference on Artificial Intelligence and Big Data Analytics (ICAIBDA), 2021, pp. 1-6, doi: 10.1109/icaibda53487.2021.9689712.",
    );
  });

  it("formats BibTeX with a stable key, braced acronyms and a page range", () => {
    const bib = bibtexCitation(byId("ewallet-sentiment-cnn-lstm"), self);
    expect(bib.split("\n")[0]).toBe("@inproceedings{fattahila2021indonesian,");
    expect(bib).toContain("title = {Indonesian Digital Wallet Sentiment Analysis Using {CNN} and {LSTM} Method}");
    expect(bib).toContain("author = {Fattahila, Ananda Affan and Amorokhman, Fendi Irfan and Auditama, Kaenova Mahendra and Wijaya, Kurniadi Ahmad and Romadhony, Ade}");
    expect(bib).toContain("pages = {1--6}");
    expect(bib).toContain("doi = {10.1109/icaibda53487.2021.9689712}");
    expect(bib.trim().endsWith("}")).toBe(true);
  });

  it("cites the thesis as a bachelor's thesis with its URL", () => {
    const thesis = byId("sentiboard-bsc-thesis");
    expect(bibtexCitation(thesis, self)).toMatch(/^@thesis\{wijaya2023sentiboard,/);
    expect(bibtexCitation(thesis, self)).toContain("type = {Bachelor's thesis}");
    expect(bibtexCitation(thesis, self)).toContain("school = {Telkom University}");
    expect(apaCitation(thesis, self)).toContain("[Bachelor's thesis, Telkom University]");
    expect(ieeeCitation(thesis, self)).toContain("B.Sc. thesis, Telkom University, 2023.");
  });

  it("falls back to the owner as the only author", () => {
    const pub: Publication = { id: "x", title: "A Paper", year: 2024, kind: "paper" };
    expect(bibtexKey(pub, self)).toBe("wijaya2024paper");
    expect(apaCitation(pub, self)).toBe("Wijaya, K. A. (2024). A Paper.");
  });

  it("links a Google Scholar search for the exact title", () => {
    expect(scholarSearchUrl('A "B" C')).toBe("https://scholar.google.com/scholar?q=%22A%20%22B%22%20C%22");
  });
});

describe("paper previews", () => {
  it.each(["en", "id"] as const)("every paper and the thesis has an abstract, citations and links (%s)", (locale) => {
    expect(papers.length).toBe(4);
    for (const pub of papers) {
      const preview = buildPaperPreview(pub, locale);
      expect(preview.abstract, pub.id).toBeTruthy();
      expect(preview.authors).toContain(self);
      expect(preview.scholar).toMatch(/^https:\/\/scholar\.google\.com\/scholar\?q=/);
      // The modal formats the same citations as the server would from the publication.
      expect(previewCitations(preview)).toEqual(citationsFor(pub, self));
      for (const text of Object.values(previewCitations(preview))) {
        expect(text).not.toMatch(/\u2014/);
        expect(text).toContain(pub.title.split(" ")[0]);
      }
    }
    const ewallet = buildPaperPreview(byId("ewallet-sentiment-cnn-lstm"), locale);
    expect(ewallet.kind).toBe(locale === "id" ? "Makalah" : "Paper");
    expect(ewallet.citationCount).toMatch(locale === "id" ? /10 sitasi/ : /10 citations on Google Scholar/);
  });
});

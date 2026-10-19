import { describe, expect, it } from "vitest";
import { generateStaticParams, GET } from "@/app/data/[...path]/route";
import { guidesDataUrl, GUIDES_FILE, type GuidesData } from "@/components/guides/data-path";
import en from "../../messages/en.json";
import id from "../../messages/id.json";

async function get(path: string[]) {
  return GET(new Request(`https://example.test/data/${path.join("/")}`), { params: Promise.resolve({ path }) } as never);
}

describe("/data/guides/{locale}.json", () => {
  it("pre-renders one guides file per locale", () => {
    const paths = generateStaticParams().map((p) => p.path.join("/"));
    expect(paths).toEqual(expect.arrayContaining(["guides/en.json", "guides/id.json"]));
    expect(GUIDES_FILE("en")).toBe("en.json");
    expect(guidesDataUrl("id")).toBe("/data/guides/id.json");
  });

  for (const locale of ["en", "id"] as const) {
    it(`serves the ${locale} guide views and only the guides strings`, async () => {
      const response = await get(["guides", GUIDES_FILE(locale)]);
      expect(response.status).toBe(200);
      const data = (await response.json()) as GuidesData;
      expect(data.guides).toHaveLength(4);
      expect(new Set(data.guides.map((g) => g.slug)).size).toBe(4);
      expect(Object.keys(data.messages)).toEqual(["guides"]);
      const strings = data.messages.guides as Record<string, string>;
      expect(Object.keys(strings).sort()).toEqual(Object.keys(en.guides).sort());
      expect(strings).toEqual((locale === "en" ? en : id).guides);
    });
  }

  it("keeps the en and id guides keys equal, and adds the CertDialog and shelf labels", () => {
    expect(Object.keys(id.guides).sort()).toEqual(Object.keys(en.guides).sort());
    expect(en.certs.preview.readGuide).toBe("Read study guide");
    expect(id.certs.preview.readGuide).toBe("Baca panduan belajar");
    expect(en.library.guides).toBe("Study guides");
    expect(id.library.guides).toBe("Panduan belajar");
  });

  it("answers 404 for an unknown guides file", async () => {
    expect((await get(["guides", "fr.json"])).status).toBe(404);
  });
});

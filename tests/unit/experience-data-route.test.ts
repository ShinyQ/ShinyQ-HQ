import { describe, expect, it, vi } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { LOCALES, type Locale } from "@/content/schema";
import en from "../../messages/en.json";
import idMessages from "../../messages/id.json";

const messages: Record<Locale, Record<string, Record<string, unknown>>> = { en, id: idMessages };

// The pages resolve the floor names through next-intl; outside a Next.js build it reads the message files directly.
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale, namespace }: { locale: Locale; namespace: string }) => (key: string) => messages[locale][namespace][key] as string,
}));

const { GET, generateStaticParams } = await import("@/app/data/[...path]/route");
const { experienceDataFor, experienceDataVersion } = await import("@/experience/gate-data");
const { EXPERIENCE_DATA_FILE, experienceDataUrl } = await import("@/experience/data-client");

const get = (path: string[]) => GET(new Request(`https://example.test/data/${path.join("/")}`), { params: Promise.resolve({ path }) });

describe("/data/experience/{locale}.json", () => {
  it("is pre-rendered for every locale", () => {
    const params = generateStaticParams().map((p) => p.path.join("/"));
    expect(params).toEqual(expect.arrayContaining(["experience/en.json", "experience/id.json"]));
    expect(LOCALES.map((l) => `experience/${EXPERIENCE_DATA_FILE(l)}`)).toEqual(["experience/en.json", "experience/id.json"]);
  });

  it.each(LOCALES)("serves exactly the gate's data with localized floor names (%s)", async (locale) => {
    const res = await get(["experience", EXPERIENCE_DATA_FILE(locale)]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(await experienceDataFor(locale));
    const floors = messages[locale].floors as Record<string, string>;
    expect(body).toEqual(JSON.parse(JSON.stringify(buildExperienceData(locale, { L1: floors.L1, L2: floors.L2, L3: floors.L3, L4: floors.L4, RF: floors.RF }))));
    expect(body.locale).toBe(locale);
    expect(body.floors.L1.name).toBe(floors.L1);
  });

  it("answers 404 for an unknown experience file", async () => {
    expect((await get(["experience", "fr.json"])).status).toBe(404);
  });

  it("versions each locale by a short content hash the page passes to the client", async () => {
    const [vEn, vId] = await Promise.all([experienceDataVersion("en"), experienceDataVersion("id")]);
    expect(vEn).toMatch(/^[0-9a-f]{12}$/);
    expect(vId).toMatch(/^[0-9a-f]{12}$/);
    expect(vEn).not.toBe(vId);
    expect(await experienceDataVersion("en")).toBe(vEn);
    expect(experienceDataUrl("en", vEn)).toBe(`/data/experience/en.json?v=${vEn}`);
  });
});

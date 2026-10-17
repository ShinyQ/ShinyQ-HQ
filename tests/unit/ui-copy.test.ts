import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createTranslator } from "next-intl";
import en from "../../messages/en.json";
import id from "../../messages/id.json";
import { getContent } from "@/content/load";
import { collectStrings } from "@/content/safety";
import { SESSION_SECONDS } from "../../functions/_lib/security";

const placeholders = (text: string) =>
  [...new Set([...text.matchAll(/\{([a-zA-Z]\w*)(?:\}|,)/g)].map((match) => match[1]))].sort();

describe("bilingual UI copy", () => {
  it("keeps message keys and interpolation variables aligned", () => {
    const english = collectStrings(en);
    const indonesian = new Map(collectStrings(id).map(({ path, value }) => [path, value]));
    expect(english.map(({ path }) => path).sort()).toEqual([...indonesian.keys()].sort());
    for (const { path, value } of english) {
      const translation = indonesian.get(path)!;
      expect(translation.trim(), path).not.toBe("");
      expect(placeholders(translation), path).toEqual(placeholders(value));
    }
  });

  it("formats every message with representative variables and counts", () => {
    const numeric = new Set(["count", "issuers", "shown", "total", "page", "index", "minutes", "year", "w", "d", "rooms", "plazas", "calls", "triangles", "archive", "employment", "freelance", "citations", "hIndex", "posts", "papers", "visits", "countries", "questions", "n", "threeD", "classic"]);
    for (const [locale, messages] of [["en", en], ["id", id]] as const) {
      for (const { path, value } of collectStrings(messages)) {
        const t = createTranslator({ locale, messages: { sample: value }, onError: (error) => { throw error; } });
        for (const count of [0, 1, 3]) {
          const variables = Object.fromEntries(placeholders(value).map((key) => [key, numeric.has(key) ? count : key === "name" ? "Kurniadi" : key === "date" ? "14 Oct 2026" : "Voice AI"]));
          const rendered = t("sample", variables);
          expect(rendered.trim(), `${locale}.${path}`).not.toBe("");
          expect(rendered, `${locale}.${path}`).not.toMatch(/\{[a-zA-Z]\w*(?:\}|,)/);
        }
      }
    }
  });

  it("describes the number shortcuts with the last key as a placeholder", () => {
    expect(en.hud.terminal.hint).toContain("1 to {last}");
    expect(id.hud.terminal.hint).toContain("1 hingga {last}");
  });

  it("includes the Data and ML wing in the L3 picker and introduction", () => {
    for (const messages of [en, id]) {
      expect(messages.hud.pads.floorDesc.L3).toContain(messages.common.wing.software);
      expect(messages.hud.pads.floorDesc.L3).toContain(messages.common.wing.ai);
      expect(messages.hud.pads.floorDesc.L3).toContain(messages.common.wing.data);
      expect(messages.dialog.floor.L3).toContain(messages.common.wing.data);
    }
  });

  it("distinguishes anonymous visit analytics from the 30-minute anti-bot cookie", () => {
    expect(SESSION_SECONDS).toBe(30 * 60);
    for (const text of [en.ask.privacy]) {
      expect(text).toContain("30-minute anti-bot cookie");
      expect(text).toMatch(/separate(?:ly)?/);
      expect(text).toMatch(/anonymous visit/i);
    }
    for (const text of [id.ask.privacy]) {
      expect(text).toContain("cookie anti-bot selama 30 menit");
      expect(text).toContain("terpisah");
      expect(text).toMatch(/kunjungan.*anonim/);
    }
    // The L1:visits drawer, the one remaining opt-out surface, names both browser signals.
    for (const messages of [en, id]) {
      expect(messages.stats.optOutHint).toContain("Do Not Track");
      expect(messages.stats.optOutHint).toContain("Global Privacy Control");
    }
  });

  it("names clearing a topic filter rather than deleting its writing", () => {
    expect(en.library.topics.clear).toBe("Clear topic filter");
    expect(id.library.topics.clear).toBe("Hapus filter topik");
  });

  it("uses both localized headings on the static 404 and the existing live-link label", () => {
    const notFound = readFileSync("src/app/global-not-found.tsx", "utf8");
    expect(notFound).toContain("{en.notFound.title}");
    expect(notFound).toMatch(/<h2\s+lang="id"[^>]*>\{id\.notFound\.title\}<\/h2>/);
    expect(notFound).toContain('href="/en"');
    expect(notFound).toContain('href="/id"');
    const workshop = readFileSync("src/components/WorkshopAnnex.tsx", "utf8");
    expect(workshop).toContain('{t("visitLive")}');
    expect(workshop).not.toMatch(/>\s+Live\s+</);
  });

  it("keeps rover dialogue within 40 characters per line", () => {
    const dialogue = [
      ...getContent().missions.flatMap((mission) =>
        mission.steps.flatMap((step) => step.kind === "say" ? collectStrings(step.text, mission.id) : []),
      ),
      ...[en, id].flatMap((messages) => [
        ...collectStrings(messages.hud.terminal.greeting),
        { path: "terminal.question", value: messages.hud.terminal.question },
        { path: "statusHello", value: messages.hud.statusHello },
      ]),
    ];
    for (const { path, value } of dialogue) {
      for (const line of value.split("\n")) expect(line.length, path).toBeLessThanOrEqual(40);
    }
  });

  it("keeps site and section metadata descriptions within 160 characters", () => {
    for (const messages of [en, id]) {
      for (const description of [
        messages.quick.intro,
        messages.journey.intro,
        messages.labs.intro,
        messages.library.intro,
        messages.contact.intro,
      ]) expect(description.length).toBeLessThanOrEqual(160);
    }
  });
});

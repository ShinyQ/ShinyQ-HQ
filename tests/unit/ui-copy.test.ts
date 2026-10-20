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
  it("qualifies the FPS share as session medians, not sustained frame rate", () => {
    expect(en.production.live.fps).toMatch(/sessions.*median 55\+ FPS/i);
    expect(id.production.live.fps).toMatch(/sesi.*median 55\+ FPS/i);
  });

  it("distinguishes local New chat clearing from retained service logs and signed follow-up context", () => {
    expect(en.ask.privacy).toMatch(/three earlier exchanges/i);
    expect(en.ask.privacy).toMatch(/New chat clears.*not.*service logs/i);
    expect(id.ask.privacy).toMatch(/tiga tanya-jawab sebelumnya/i);
    expect(id.ask.privacy).toMatch(/Obrolan baru mengosongkan.*bukan.*log layanan/i);
  });

  it("discloses opt-out timing and the narrower browser-signal coverage without claiming guard enforcement", () => {
    expect(en.stats.optOutHint).toMatch(/page load/i);
    expect(en.stats.optOutHint).toMatch(/cancels the active visit beacon/i);
    expect(en.stats.optOutHint).toMatch(/already-loaded.*may continue/i);
    expect(en.stats.optOutHint).toMatch(/not the Web Analytics loader/i);
    expect(id.stats.optOutHint).toMatch(/saat halaman dimuat/i);
    expect(id.stats.optOutHint).toMatch(/membatalkan beacon kunjungan aktif/i);
    expect(id.stats.optOutHint).toMatch(/sudah dimuat.*dapat tetap berjalan/i);
    expect(id.stats.optOutHint).toMatch(/bukan pemuat Web Analytics/i);
  });

  it("names Kurniadi as the assistant's About subject and distinguishes remainder projects from the full list", () => {
    expect(en.ask.topics.about).toBe("About Kurniadi");
    expect(id.ask.topics.about).toBe("Tentang Kurniadi");
    expect(en.work.allProjects).toBe("More projects");
    expect(id.work.allProjects).toBe("Proyek lainnya");
    expect(en.home.allProjects).toBe("All {count} projects");
    expect(id.home.allProjects).toBe("Semua {count} proyek");
  });

  it("names Classic return destinations without changing the floor names", () => {
    expect(en.labs.back).toBe("Back to Work");
    expect(id.labs.back).toBe("Kembali ke Karya");
    expect(en.blog.back).toBe("Back to Writing");
    expect(id.blog.back).toBe("Kembali ke Tulisan");
    expect(en.floors.L3).toBe("Labs");
    expect(id.floors.L4).toBe("Perpustakaan");
  });

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
    const numeric = new Set(["count", "issuers", "shown", "total", "page", "index", "minutes", "year", "w", "d", "rooms", "plazas", "calls", "triangles", "archive", "employment", "freelance", "citations", "hIndex", "posts", "papers", "visits", "countries", "questions", "n", "threeD", "classic", "tasks", "prs", "green", "runs"]);
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

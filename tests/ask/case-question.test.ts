import { beforeAll, describe, expect, it } from "vitest";
import { ASK_MAX_QUESTION } from "@/ask/protocol";
import { buildRepoPack } from "@/ask/repo-pack";
import { getPods } from "@/content/load";
import { namesProject, planRoute } from "../../functions/_lib/pipeline";
import { retrieve } from "../../functions/_lib/retrieve";
import type { KnowledgePack } from "../../functions/_lib/types";
import en from "../../messages/en.json";
import id from "../../messages/id.json";

/**
 * "Ask Rover about this project" (the case study's closing section) sends `case.askAbout` with the project title.
 * Every project's question must fit the Ask input, take the default route (a title such as "Anime Figure E-Commerce
 * Backend" or "... Kebijakan PPKM" is no hobby or policy question) and retrieve that project's own chunk, in both
 * languages.
 */
let pack: KnowledgePack;

beforeAll(() => {
  ({ pack } = buildRepoPack("2026-10-11"));
});

const LOCALES = [
  ["en", en.case.askAbout],
  ["id", id.case.askAbout],
] as const;

describe("case study Ask question", () => {
  for (const [locale, template] of LOCALES) {
    it(`fits, takes the default route and finds the project (${locale})`, () => {
      for (const pod of getPods()) {
        const q = template.replace("{title}", pod.title[locale]);
        expect(q.length, pod.slug).toBeLessThanOrEqual(ASK_MAX_QUESTION);
        const plan = planRoute({ question: q, pack });
        if (plan.kind !== "model") throw new Error(`${pod.slug}: canned ${plan.canned}`);
        expect(plan.route, q).toBe("default");
        expect(plan.named, q).toBe(true);
        const { topic, lead, adjacent, civic, mentoring, team } = plan;
        const { chunks } = retrieve(pack, plan.routed, locale, { topic, lead, adjacent, civic, mentoring, team });
        expect(chunks.map((c) => c.id), q).toContain(`project-${pod.slug}`);
      }
    });
  }

  it("names a project only by a full title", () => {
    expect(namesProject("Tell me about the Anime Figure E-Commerce Backend", pack)).toBe(true);
    expect(namesProject("Does he like anime?", pack)).toBe(false);
    expect(namesProject("What does he think about PPKM policy?", pack)).toBe(false);
  });
});

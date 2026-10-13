import { describe, expect, it } from "vitest";
import { ASK_TAGS, type AskTag } from "@/ask/protocol";
import { SUGGESTIONS } from "@/ask/suggestions";
import { STATS_TOPICS } from "@/lib/stats/protocol";
import { chipFor, TAG_TOPIC, topicOfTags } from "../../functions/_lib/askStats";

describe("topicOfTags", () => {
  it("maps every allowlisted tag to one stats topic", () => {
    for (const tag of ASK_TAGS) expect(STATS_TOPICS).toContain(TAG_TOPIC[tag]);
  });

  it.each<[AskTag[], string]>([
    [[], ""],
    [["work", "software"], "work"],
    [["work", "ai", "voice"], "ai"],
    [["career", "education"], "career"],
    [["contact"], "contact"],
    [["perspectives", "work"], "perspectives"],
    [["work", "career"], "career"],
    [["work", "ai"], "ai"],
    [["contact", "perspectives"], "perspectives"],
    [["writing", "stats", "github"], "work"],
    [["research", "data", "work"], "ai"],
  ])("%j gives %s", (tags, topic) => {
    expect(topicOfTags(tags)).toBe(topic);
  });
});

describe("chipFor", () => {
  const first = SUGGESTIONS[0];

  it("accepts a curated id whose question matches the text in either language", () => {
    expect(chipFor(first.q.en, first.id)?.id).toBe(first.id);
    expect(chipFor(first.q.id, first.id)?.id).toBe(first.id);
    expect(chipFor(`  ${first.q.en.toUpperCase()}  `, first.id)?.id).toBe(first.id);
  });

  it("ignores ids that are unknown, mismatched or not strings", () => {
    expect(chipFor(first.q.en, "made-up")).toBeUndefined();
    expect(chipFor("Something else entirely?", first.id)).toBeUndefined();
    expect(chipFor(SUGGESTIONS[1].q.en, first.id)).toBeUndefined();
    expect(chipFor(first.q.en, undefined)).toBeUndefined();
    expect(chipFor(first.q.en, 7)).toBeUndefined();
  });
});

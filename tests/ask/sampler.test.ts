import { describe, expect, it, vi } from "vitest";
import { ASK_SEED_KEY, ASK_TOPICS, readAskSeed, seededShuffle, starterQuestions, STARTER_SIZE, STATS_TOPIC_OF, SUGGESTIONS, TOPIC_SIZE, topicQuestions, type Suggestion } from "@/ask/suggestions";
import { STATS_TOPICS } from "@/lib/stats/protocol";

const pill = (id: string, topic: Suggestion["topic"]): Suggestion => ({ id, topic, q: { en: `${id} en?`, id: `${id} id?` }, tags: ["work"] });

const list: Suggestion[] = [
  ...["w1", "w2", "w3", "w4", "w5", "w6"].map((id) => pill(id, "work")),
  ...["a1", "a2", "a3", "a4", "a5"].map((id) => pill(id, "ai")),
  ...["c1", "c2"].map((id) => pill(id, "career")),
  pill("k1", "contact"),
  pill("s1", "site"),
];

const ids = (items: readonly Suggestion[]) => items.map((s) => s.id);
const SEEDS = Array.from({ length: 200 }, (_, i) => (i * 2_654_435_761) >>> 0);

class MemoryStorage {
  data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}

describe("seededShuffle", () => {
  const items = Array.from({ length: 20 }, (_, i) => i);

  it("gives the same order for the same seed and keeps every item", () => {
    expect(seededShuffle(items, 42)).toEqual(seededShuffle(items, 42));
    expect([...seededShuffle(items, 42)].sort((a, b) => a - b)).toEqual(items);
    expect(items).toEqual(Array.from({ length: 20 }, (_, i) => i));
  });

  it("gives a different order for most different seeds", () => {
    const orders = new Set(SEEDS.map((seed) => seededShuffle(items, seed).join(",")));
    expect(orders.size).toBeGreaterThan(SEEDS.length * 0.95);
  });
});

describe("topicQuestions with a seed", () => {
  it("keeps bank order without a seed and samples per seed otherwise", () => {
    expect(ids(topicQuestions("work", new Set(), list, 4, null))).toEqual(["w1", "w2", "w3", "w4"]);
    expect(ids(topicQuestions("work", new Set(), list, 4, 7))).toEqual(ids(topicQuestions("work", new Set(), list, 4, 7)));
    const firsts = new Set(SEEDS.map((seed) => topicQuestions("work", new Set(), list, 4, seed).map((s) => s.id).join(",")));
    expect(firsts.size).toBeGreaterThan(1);
  });

  it("never returns an asked pill, and nothing once every pill of the topic was asked", () => {
    for (const seed of [null, ...SEEDS.slice(0, 50)]) {
      const asked = new Set(["w2", "w5", "a1"]);
      const work = topicQuestions("work", asked, list, 4, seed);
      expect(work).toHaveLength(4);
      for (const s of work) {
        expect(asked.has(s.id)).toBe(false);
        expect(s.topic).toBe("work");
      }
      expect(topicQuestions("career", new Set(["c1", "c2"]), list, 4, seed)).toEqual([]);
      expect(topicQuestions("about", new Set(), list, 4, seed)).toEqual([]);
    }
  });

  it("orders topics differently for the same seed", () => {
    const twin = [...list.filter((s) => s.topic === "work"), ...["a1", "a2", "a3", "a4", "a5", "a6"].map((id) => pill(id, "ai"))];
    const pattern = (topic: Suggestion["topic"], seed: number) => topicQuestions(topic, new Set(), twin, 6, seed).map((s) => s.id.slice(1)).join(",");
    const same = SEEDS.filter((seed) => pattern("work", seed) === pattern("ai", seed));
    expect(same.length).toBeLessThan(SEEDS.length / 10);
  });

  it("shows every pill of the real bank in some topic expansion over 200 seeds", () => {
    const seen = new Set<string>();
    for (const seed of SEEDS) for (const topic of ASK_TOPICS) for (const s of topicQuestions(topic, new Set(), SUGGESTIONS, TOPIC_SIZE, seed)) seen.add(s.id);
    expect(SUGGESTIONS.filter((s) => !seen.has(s.id)).map((s) => s.id)).toEqual([]);
  });
});

describe("starterQuestions", () => {
  it("takes the first pill of each topic in bank order without a seed", () => {
    expect(ids(starterQuestions(new Set(), null, list))).toEqual(["w1", "a1", "c1"]);
    expect(ids(starterQuestions(new Set(), null))).toEqual(["work-best", "ai-voice", "career-now"]);
    expect(STARTER_SIZE).toBe(3);
  });

  it("returns distinct topics and no asked pill, at most the size", () => {
    for (const seed of [null, ...SEEDS]) {
      const asked = new Set(["w1", "a1", "a2", "k1"]);
      const starters = starterQuestions(asked, seed, list);
      expect(starters).toHaveLength(3);
      expect(new Set(starters.map((s) => s.topic)).size).toBe(starters.length);
      for (const s of starters) expect(asked.has(s.id)).toBe(false);
      expect(starterQuestions(new Set(), seed, list, 10)).toHaveLength(5);
    }
  });

  it("picks the same pill a topic expansion would show first", () => {
    for (const seed of SEEDS.slice(0, 30)) {
      for (const s of starterQuestions(new Set(["w3"]), seed, list)) expect(topicQuestions(s.topic, new Set(["w3"]), list, 1, seed)[0]).toBe(s);
    }
  });

  it("is stable for a seed and varies across seeds", () => {
    expect(ids(starterQuestions(new Set(), 1))).toEqual(ids(starterQuestions(new Set(), 1)));
    const sets = new Set(SEEDS.map((seed) => ids(starterQuestions(new Set(), seed)).join(",")));
    expect(sets.size).toBeGreaterThan(SEEDS.length / 2);
  });

  it("returns nothing once every pill was asked", () => {
    expect(starterQuestions(new Set(list.map((s) => s.id)), 3, list)).toEqual([]);
  });

  it("leads with an unasked recruiter pill, then other topics (owner decision 2026-11-01)", () => {
    const hiring = [...list, { ...pill("k2", "contact"), recruiter: true }, { ...pill("c3", "career"), recruiter: true }];
    expect(ids(starterQuestions(new Set(), null, hiring))).toEqual(["k2", "w1", "a1"]);
    expect(ids(starterQuestions(new Set(["k2"]), null, hiring))).toEqual(["c3", "w1", "a1"]);
    expect(ids(starterQuestions(new Set(["k2", "c3"]), null, hiring))).toEqual(["w1", "a1", "c1"]);
    for (const seed of SEEDS) {
      const starters = starterQuestions(new Set(), seed, hiring);
      expect(starters[0].recruiter, String(seed)).toBe(true);
      expect(new Set(starters.map((s) => s.topic)).size).toBe(starters.length);
    }
  });

  it("keeps the real bank's order row and always leads with a hiring question", () => {
    expect(ids(starterQuestions(new Set(), null))).toEqual(["work-best", "ai-voice", "career-now"]);
    expect(SUGGESTIONS.filter((s) => s.recruiter).length).toBeGreaterThanOrEqual(5);
    const leads = new Set<string>();
    for (const seed of SEEDS) {
      const [first] = starterQuestions(new Set(), seed);
      expect(first.recruiter, String(seed)).toBe(true);
      leads.add(first.id);
    }
    expect(leads.size, "the lead varies across seeds").toBeGreaterThan(3);
  });
});

describe("readAskSeed", () => {
  it("keeps bank order for the test value", () => {
    const storage = new MemoryStorage();
    storage.setItem(ASK_SEED_KEY, "order");
    expect(readAskSeed(storage)).toBeNull();
  });

  it("reuses a stored seed", () => {
    const storage = new MemoryStorage();
    storage.setItem(ASK_SEED_KEY, "123456");
    const random = vi.fn(() => 0.5);
    expect(readAskSeed(storage, random)).toBe(123456);
    expect(random).not.toHaveBeenCalled();
    storage.setItem(ASK_SEED_KEY, "0");
    expect(readAskSeed(storage, random)).toBe(0);
  });

  it("stores a new seed when none or a bad one is stored", () => {
    for (const bad of [null, "", "-1", "1.5", "abc", String(2 ** 32), "99999999999"]) {
      const storage = new MemoryStorage();
      if (bad !== null) storage.setItem(ASK_SEED_KEY, bad);
      expect(readAskSeed(storage, () => 0.25)).toBe(2 ** 30);
      expect(storage.getItem(ASK_SEED_KEY)).toBe(String(2 ** 30));
    }
    const storage = new MemoryStorage();
    const seed = readAskSeed(storage, () => 0.999999999);
    expect(seed).toBeLessThan(2 ** 32);
    expect(readAskSeed(storage, () => 0)).toBe(seed);
  });

  it("works without storage and survives storage errors", () => {
    expect(readAskSeed(null, () => 0.5)).toBe(2 ** 31);
    expect(readAskSeed(undefined, () => 0)).toBe(0);
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(readAskSeed(broken, () => 0.5)).toBe(2 ** 31);
  });
});

describe("STATS_TOPIC_OF", () => {
  it("maps every Ask topic onto a public stats topic", () => {
    for (const topic of ASK_TOPICS) expect(STATS_TOPICS).toContain(STATS_TOPIC_OF[topic]);
    for (const topic of STATS_TOPICS) expect(STATS_TOPIC_OF[topic]).toBe(topic);
    expect(STATS_TOPIC_OF.about).toBe("perspectives");
    expect(STATS_TOPIC_OF.site).toBe("work");
  });
});

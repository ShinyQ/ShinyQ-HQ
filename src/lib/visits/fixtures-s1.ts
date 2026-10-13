import type { StatsSnapshotV1 } from "./protocol-s1";

/**
 * TEMPORARY fixtures matching S1's `src/lib/stats/fixtures.ts` (delete with `protocol-s1.ts`). FICTIONAL
 * numbers for tests, e2e mocks and review captures only; never shown on the live site. Chip ids are real
 * ids from `content/ask/suggestions.json`.
 */
export const STATS_FIXTURE: StatsSnapshotV1 = {
  v: 1,
  updatedAt: "2026-10-14T00:00:00.000Z",
  since: "2026-10-01",
  sampled: true,
  visits: { d30: 1240, all: 12480 },
  pageViews: { d30: 3870, all: 41200 },
  countries: {
    d30: ["AU", "DE", "GB", "ID", "IN", "JP", "MY", "NL", "SG", "US"],
    all: ["AU", "BR", "CA", "DE", "FR", "GB", "ID", "IN", "JP", "KR", "MY", "NL", "PH", "SG", "TH", "US", "VN"],
  },
  topFloor: { d30: "L3", all: "L1" },
  mode: { d30: { threeD: 610, classic: 420 }, all: { threeD: 5900, classic: 4300 } },
  asks: {
    d30: {
      total: 318,
      topics: { work: 120, ai: 86, career: 52, contact: 21, perspectives: 14 },
      chips: [
        { id: "work-best", topic: "work", n: 40 },
        { id: "ai-voice", topic: "ai", n: 31 },
        { id: "career-now", topic: "career", n: 22 },
        { id: "work-stack", topic: "work", n: 18 },
        { id: "contact-open", topic: "contact", n: 9 },
      ],
    },
    all: {
      total: 2950,
      topics: { work: 1100, ai: 820, career: 510, contact: 260, perspectives: 140 },
      chips: [
        { id: "work-best", topic: "work", n: 410 },
        { id: "ai-voice", topic: "ai", n: 300 },
        { id: "career-now", topic: "career", n: 205 },
        { id: "work-stack", topic: "work", n: 160 },
        { id: "ai-agents", topic: "ai", n: 120 },
        { id: "contact-open", topic: "contact", n: 90 },
      ],
    },
  },
};

/** A snapshot with nothing counted yet (first day after launch). */
export const STATS_FIXTURE_EMPTY: StatsSnapshotV1 = {
  v: 1,
  updatedAt: "2026-10-14T00:00:00.000Z",
  since: "2026-10-13",
  sampled: true,
  visits: { d30: 0, all: 0 },
  pageViews: { d30: 0, all: 0 },
  countries: { d30: [], all: [] },
  topFloor: { d30: null, all: null },
  mode: { d30: { threeD: 0, classic: 0 }, all: { threeD: 0, classic: 0 } },
  asks: {
    d30: { total: 0, topics: { work: 0, ai: 0, career: 0, contact: 0, perspectives: 0 }, chips: [] },
    all: { total: 0, topics: { work: 0, ai: 0, career: 0, contact: 0, perspectives: 0 }, chips: [] },
  },
};

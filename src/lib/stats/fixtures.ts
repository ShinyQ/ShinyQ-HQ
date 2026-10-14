import type { StatsSnapshotV1 } from "./protocol";

/**
 * Example snapshots for the S2 display, tests and the dev pages. Fictional numbers in the steps the
 * real data uses (Web Analytics estimates move in steps of 10). Chip ids are real curated ids.
 */
export const STATS_FIXTURE: StatsSnapshotV1 = {
  v: 1,
  updatedAt: "2026-11-15T00:00:00.000Z",
  since: "2026-10-11",
  sampled: true,
  visits: { d30: 340, all: 520 },
  pageViews: { d30: 2110, all: 3480 },
  countries: { d30: ["AU", "DE", "ID", "IN", "JP", "MY", "NL", "SG", "US"], all: ["AU", "DE", "GB", "ID", "IN", "JP", "MY", "NL", "SG", "US"] },
  topFloor: { d30: "L3", all: "L3" },
  mode: { d30: { threeD: 212, classic: 98 }, all: { threeD: 301, classic: 166 } },
  asks: {
    d30: {
      total: 64,
      topics: { work: 21, ai: 18, career: 11, contact: 4, perspectives: 3 },
      chips: [
        { id: "work-best", topic: "work", n: 9 },
        { id: "ai-agents", topic: "ai", n: 7 },
        { id: "career-now", topic: "career", n: 5 },
        { id: "contact-reach", topic: "contact", n: 2 },
      ],
    },
    all: {
      total: 97,
      topics: { work: 33, ai: 27, career: 16, contact: 6, perspectives: 4 },
      chips: [
        { id: "work-best", topic: "work", n: 14 },
        { id: "ai-agents", topic: "ai", n: 10 },
        { id: "career-now", topic: "career", n: 8 },
        { id: "contact-reach", topic: "contact", n: 3 },
        { id: "work-security", topic: "work", n: 1 },
      ],
    },
  },
};

/** A first day with no traffic yet: every count zero, no countries, no top floor. */
export const STATS_FIXTURE_EMPTY: StatsSnapshotV1 = {
  v: 1,
  updatedAt: "2026-10-15T00:00:00.000Z",
  since: "2026-10-14",
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

/** STATS_FIXTURE with the optional RUM perf block (sampled 3D sessions, 25% of them). */
export const STATS_FIXTURE_PERF: StatsSnapshotV1 = {
  ...STATS_FIXTURE,
  perf: {
    d30: { sessions: 84, measured: 80, fps55: 52, explore: "3-5s" },
    all: { sessions: 121, measured: 115, fps55: 71, explore: "3-5s" },
  },
};

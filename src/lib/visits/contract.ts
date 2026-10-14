/**
 * The one import point for the public stats contract (S1's pipeline): the snapshot type, the
 * hand-written validator and the fixtures for tests and review captures.
 */
export { parseStatsSnapshot, STATS_ENDPOINT, STATS_EXPLORE, STATS_PERIODS, STATS_TOPICS, type StatsExplore, type StatsFloor, type StatsPerf, type StatsPeriod, type StatsSnapshotV1, type StatsTopic } from "@/lib/stats/protocol";
export { STATS_FIXTURE, STATS_FIXTURE_EMPTY, STATS_FIXTURE_PERF } from "@/lib/stats/fixtures";

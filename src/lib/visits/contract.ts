/**
 * The one import point for the public stats contract (S1's pipeline): the snapshot type, the
 * hand-written validator and the fixtures for tests and review captures.
 */
export { parseStatsSnapshot, STATS_ENDPOINT, STATS_PERIODS, STATS_TOPICS, type StatsFloor, type StatsPeriod, type StatsSnapshotV1, type StatsTopic } from "@/lib/stats/protocol";
export { STATS_FIXTURE, STATS_FIXTURE_EMPTY } from "@/lib/stats/fixtures";

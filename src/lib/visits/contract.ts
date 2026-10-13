/**
 * The one import point for the public stats contract. Until S1's pipeline PR merges this re-exports the
 * temporary copy; afterwards it re-exports `@/lib/stats/protocol` and `@/lib/stats/fixtures`.
 */
export { parseStatsSnapshot, STATS_PERIODS, STATS_TOPICS, type StatsFloor, type StatsPeriod, type StatsSnapshotV1, type StatsTopic } from "./protocol-s1";
export { STATS_FIXTURE, STATS_FIXTURE_EMPTY } from "./fixtures-s1";

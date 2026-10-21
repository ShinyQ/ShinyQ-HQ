/**
 * The v4 snapshot validators (GET /api/office?v=4, the 3D scene's poller and the Pages Function only): the pipeline
 * checks and `parseOfficeResponseV4`. A module of their own, never re-exported from `./protocol.ts`, so the Classic card
 * and the office watch (both on v3) never carry them. The types and `OFFICE_PIPELINE` stay in `./protocol.ts`.
 */
import {
  OFFICE_PIPELINE,
  OFFICE_SEATS,
  REPO,
  UNSAFE_TEXT,
  URL_RE,
  isInt,
  isObj,
  isText,
  matches,
  oneOf,
  onlyKeys,
  optional,
  parseOfficeResponseV3,
  type Obj,
  type OfficePipeline,
  type OfficeResponseV4,
} from "./protocol";

const JOB_STATUSES = ["queued", "running", "done", "failed"] as const;
const RUN_STATUSES = ["running", "success", "failure"] as const;
const SHIP_KINDS = ["merge", "deploy"] as const;
const SHIP_STATUSES = ["running", "success", "failure", "merged"] as const;
const isSeat = (x: unknown) => isInt(x, 0, OFFICE_SEATS - 1);

function isJob(x: unknown): boolean {
  return isObj(x) && onlyKeys(x, ["name", "status"]) && typeof x.name === "string" && x.name.length >= 1 && x.name.length <= OFFICE_PIPELINE.jobName && !UNSAFE_TEXT.test(x.name) && oneOf(JOB_STATUSES, x.status);
}

function isRun(x: unknown): boolean {
  return (
    isObj(x) &&
    onlyKeys(x, ["id", "repo", "title", "url", "status", "slot", "at", "jobs"]) &&
    isInt(x.id) &&
    matches(REPO)(x.repo) &&
    isText(x.title) &&
    matches(URL_RE)(x.url) &&
    oneOf(RUN_STATUSES, x.status) &&
    optional(x, "slot", isSeat) &&
    isInt(x.at) &&
    Array.isArray(x.jobs) &&
    x.jobs.length <= OFFICE_PIPELINE.jobs &&
    x.jobs.every(isJob)
  );
}

function isShip(x: unknown): boolean {
  return (
    isObj(x) &&
    onlyKeys(x, ["key", "kind", "status", "at", "slot"]) &&
    typeof x.key === "string" &&
    x.key.length >= 1 &&
    x.key.length <= OFFICE_PIPELINE.key &&
    !UNSAFE_TEXT.test(x.key) &&
    oneOf(SHIP_KINDS, x.kind) &&
    oneOf(SHIP_STATUSES, x.status) &&
    isInt(x.at) &&
    optional(x, "slot", isSeat)
  );
}

function isPipeline(x: unknown): x is OfficePipeline {
  return isObj(x) && onlyKeys(x, ["runs", "ships"]) && Array.isArray(x.runs) && x.runs.length <= OFFICE_PIPELINE.runs && x.runs.every(isRun) && Array.isArray(x.ships) && x.ships.length <= OFFICE_PIPELINE.ships && x.ships.every(isShip);
}

/**
 * Validates GET /api/office?v=4: the v3 checks (ten seats, desk helpers) on everything but `v` and `pipeline`, plus the
 * pipeline (strict keys). A v3, v2 or v1 body (a Worker or Pages deploy rolled back to before v4) reads as v4 with an
 * empty pipeline, so the scene shows the office and part A's anonymous tower progress; the disabled body passes as is.
 */
export function parseOfficeResponseV4(raw: unknown): OfficeResponseV4 | null {
  if (!isObj(raw)) return null;
  if (raw.v === 4) {
    const pipeline = raw.pipeline;
    if (raw.enabled !== true || !isPipeline(pipeline)) return null;
    const rest: Obj = { ...raw, v: 3 };
    delete rest.pipeline;
    const v3 = parseOfficeResponseV3(rest);
    return v3 && v3.enabled ? { ...v3, v: 4, pipeline } : null;
  }
  const older = parseOfficeResponseV3(raw);
  return older && older.enabled ? { ...older, v: 4, pipeline: { runs: [], ships: [] } } : older;
}

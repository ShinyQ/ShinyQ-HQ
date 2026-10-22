import { readCapped } from "../../../functions/_lib/security";
import { OFFICE_BEAT_MAX_BYTES, parseOfficeBeat } from "../../../src/lib/office/protocol";
import type { OfficeHistoryV1 } from "../../../src/lib/office/protocolHistory";
import { signatureOk } from "./crypto";
import { cleanHistory } from "./history";
import { parseActors, parseAllowlist, parseGithubEvent, sanitizeBeat } from "./ingest";
import type { OfficeWorkerEnv } from "./types";

export const GITHUB_MAX_BYTES = 512 * 1024;
export const REPLAY_WINDOW_MS = 60_000;
const DO_NAME = "office";
const DO_BASE = "https://office";

const status = (code: number) => new Response(null, { status: code, headers: { "Cache-Control": "no-store" } });
const HISTORY_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * hq-office routes, reached only through the Pages service binding (no public route): GET /snapshot (v1, v2 for `?v=2`, v3 for `?v=3`, v4 for `?v=4`),
 * GET /history (the 8-day replay index), GET /history?day=YYYY-MM-DD (one WIB day, cleaned again),
 * POST /beat (relay, X-Office-Signature) and POST /github (webhooks, X-Hub-Signature-256).
 */
export function createOfficeWorker(deps: { now?: () => number } = {}) {
  const now = deps.now ?? Date.now;
  return {
    async fetch(request: Request, env: OfficeWorkerEnv): Promise<Response> {
      const { pathname, searchParams } = new URL(request.url);
      const office = env.OFFICE_DO.get(env.OFFICE_DO.idFromName(DO_NAME));
      const post = async (path: string, value: unknown) => {
        const res = await office.fetch(`${DO_BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
        return status(res.ok ? 204 : 502);
      };
      if (pathname === "/snapshot") {
        if (request.method !== "GET") return status(405);
        // Only `?v=2`, `?v=3` and `?v=4` are forwarded: any other query reaches the Durable Object as the plain v1 request.
        const v = searchParams.get("v");
        return office.fetch(`${DO_BASE}/snapshot${v === "2" || v === "3" || v === "4" ? `?v=${v}` : ""}`);
      }
      if (pathname === "/history") {
        if (request.method !== "GET") return status(405);
        // No query is the index; exactly one well-formed `day` is that day; any other query is a 404 that never reaches the Durable Object.
        const names = [...searchParams.keys()];
        const day = searchParams.get("day");
        if (names.length > 1 || (names.length === 1 && (names[0] !== "day" || day === null || !HISTORY_DAY.test(day)))) return status(404);
        const res = await office.fetch(`${DO_BASE}/history${day === null ? "" : `?day=${day}`}`);
        if (!res.ok) return status(res.status);
        // The index carries counts only; a day's titles and repositories pass the allowlist and `cleanTitle` again.
        if (day === null) return res;
        const clean = cleanHistory((await res.json()) as OfficeHistoryV1, parseAllowlist(env.OFFICE_REPO_ALLOWLIST));
        return new Response(JSON.stringify(clean), { headers: { "Content-Type": "application/json; charset=utf-8" } });
      }
      if (pathname === "/beat") {
        if (request.method !== "POST") return status(405);
        if (!env.OFFICE_INGEST_KEY) return status(503);
        const body = await readCapped(request, OFFICE_BEAT_MAX_BYTES);
        if (body === null) return status(413);
        if (!(await signatureOk(env.OFFICE_INGEST_KEY, body, request.headers.get("X-Office-Signature")))) return status(401);
        let beat: ReturnType<typeof parseOfficeBeat> = null;
        try {
          beat = parseOfficeBeat(JSON.parse(body));
        } catch {
          beat = null;
        }
        if (!beat) return status(400);
        if (Math.abs(now() - beat.ts) > REPLAY_WINDOW_MS) return status(401);
        return post("/beat", sanitizeBeat(beat, parseAllowlist(env.OFFICE_REPO_ALLOWLIST)));
      }
      if (pathname === "/github") {
        if (request.method !== "POST") return status(405);
        if (!env.GITHUB_WEBHOOK_SECRET) return status(503);
        const body = await readCapped(request, GITHUB_MAX_BYTES);
        if (body === null) return status(413);
        if (!(await signatureOk(env.GITHUB_WEBHOOK_SECRET, body, request.headers.get("X-Hub-Signature-256")))) return status(401);
        let payload: unknown;
        try {
          payload = JSON.parse(body);
        } catch {
          return status(400);
        }
        const event = request.headers.get("X-GitHub-Event") ?? "";
        const update = parseGithubEvent(event, payload, parseAllowlist(env.OFFICE_REPO_ALLOWLIST), parseActors(env.OFFICE_GITHUB_ACTORS));
        if (!update) return status(204);
        return post("/github", { delivery: (request.headers.get("X-GitHub-Delivery") ?? "").slice(0, 64), update });
      }
      return status(404);
    },
  };
}

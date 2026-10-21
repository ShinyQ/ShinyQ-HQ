import { readCapped } from "../../../functions/_lib/security";
import { OFFICE_BEAT_MAX_BYTES, parseOfficeBeat } from "../../../src/lib/office/protocol";
import { signatureOk } from "./crypto";
import { parseActors, parseAllowlist, parseGithubEvent, sanitizeBeat } from "./ingest";
import type { OfficeWorkerEnv } from "./types";

export const GITHUB_MAX_BYTES = 512 * 1024;
export const REPLAY_WINDOW_MS = 60_000;
const DO_NAME = "office";
const DO_BASE = "https://office";

const status = (code: number) => new Response(null, { status: code, headers: { "Cache-Control": "no-store" } });

/**
 * hq-office routes, reached only through the Pages service binding (no public route): GET /snapshot (v1, v2 for `?v=2`, v3 for `?v=3`, v4 for `?v=4`),
 * POST /beat (relay, X-Office-Signature) and POST /github (webhooks, X-Hub-Signature-256).
 */
export function createOfficeWorker(deps: { blocklist: readonly string[]; now?: () => number }) {
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
        return post("/beat", sanitizeBeat(beat, parseAllowlist(env.OFFICE_REPO_ALLOWLIST), deps.blocklist));
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
        const update = parseGithubEvent(event, payload, parseAllowlist(env.OFFICE_REPO_ALLOWLIST), deps.blocklist, parseActors(env.OFFICE_GITHUB_ACTORS));
        if (!update) return status(204);
        return post("/github", { delivery: (request.headers.get("X-GitHub-Delivery") ?? "").slice(0, 64), update });
      }
      return status(404);
    },
  };
}

import { parseOfficeBeat } from "../../../src/lib/office/protocol";
import { applyBeat, applyGithub, emptyDoc, isGithubMessage, view, viewV2, type OfficeDoc } from "./state";
import type { DurableObjectStateLike, OfficeWorkerEnv } from "./types";

const DOC_KEY = "doc";
const status = (code: number) => new Response(null, { status: code });

/**
 * The Agent Office Durable Object (one instance, `idFromName("office")`). Holds one JSON document in its storage
 * API: read once per cold start, written once per accepted beat or webhook. Time rules apply on read (no alarms).
 */
export class Office {
  private doc: OfficeDoc | null = null;
  private readonly ctx: DurableObjectStateLike;
  private readonly now: () => number;

  constructor(ctx: DurableObjectStateLike, _env: OfficeWorkerEnv, now: () => number = Date.now) {
    this.ctx = ctx;
    this.now = now;
  }

  private async load(): Promise<OfficeDoc> {
    if (!this.doc) this.doc = (await this.ctx.storage.get<OfficeDoc>(DOC_KEY)) ?? emptyDoc(this.now());
    return this.doc;
  }

  private async save(doc: OfficeDoc): Promise<void> {
    this.doc = doc;
    await this.ctx.storage.put(DOC_KEY, doc);
  }

  async fetch(request: Request): Promise<Response> {
    const { pathname, searchParams } = new URL(request.url);
    if (pathname === "/snapshot") {
      if (request.method !== "GET") return status(405);
      // v2 only for exactly ?v=2; anything else is the unchanged v1 body.
      const doc = await this.load();
      const body = JSON.stringify(searchParams.get("v") === "2" ? viewV2(doc, this.now()) : view(doc, this.now()));
      return new Response(body, { headers: { "Content-Type": "application/json; charset=utf-8" } });
    }
    if (pathname !== "/beat" && pathname !== "/github") return status(404);
    if (request.method !== "POST") return status(405);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return status(400);
    }
    const doc = await this.load();
    const now = this.now();
    if (pathname === "/beat") {
      const beat = parseOfficeBeat(body);
      if (!beat) return status(400);
      await this.save(applyBeat(doc, beat, now));
      return status(204);
    }
    if (!isGithubMessage(body)) return status(400);
    const next = applyGithub(doc, body.update, body.delivery, now);
    if (next !== doc) await this.save(next);
    return status(204);
  }
}

import { parseOfficeBeat, wibDay } from "../../../src/lib/office/protocol";
import { historyWindow } from "../../../src/lib/office/protocolHistory";
import { closeLog, emptyLog, historyDay, historyIndex, logDoc, logKey, scrubRepo, startLog, type DayLog } from "./history";
import { applyBeat, applyGithub, emptyDoc, isGithubMessage, migrateDoc, view, viewV2, viewV3, viewV4, type OfficeDoc } from "./state";
import type { DurableObjectStateLike, OfficeWorkerEnv } from "./types";

const DOC_KEY = "doc";
const status = (code: number) => new Response(null, { status: code });

const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json; charset=utf-8" } });

/**
 * The Agent Office Durable Object (one instance, `idFromName("office")`). Holds one JSON document in its storage
 * API: read once per cold start, written once per accepted beat or webhook. Time rules apply on read (no alarms).
 * Beside it one replay log row per WIB day (`log:YYYY-MM-DD`, at most 8), written in the same put as the doc only when
 * something loggable changed.
 */
export class Office {
  private doc: OfficeDoc | null = null;
  private log: DayLog | null = null;
  private readonly ctx: DurableObjectStateLike;
  private readonly now: () => number;

  constructor(ctx: DurableObjectStateLike, _env: OfficeWorkerEnv, now: () => number = Date.now) {
    this.ctx = ctx;
    this.now = now;
  }

  private async load(): Promise<OfficeDoc> {
    if (this.doc) return this.doc;
    const stored = await this.ctx.storage.get<OfficeDoc>(DOC_KEY);
    if (!stored) return (this.doc = emptyDoc(this.now()));
    // Back-row seats stored in `slot` move to `seat` at once, so a Worker rolled back to five desks reads the document.
    const doc = migrateDoc(stored);
    if (doc !== stored) await this.save(doc);
    else this.doc = doc;
    return doc;
  }

  private async save(doc: OfficeDoc): Promise<void> {
    this.doc = doc;
    await this.ctx.storage.put(DOC_KEY, doc);
  }

  /**
   * Today's row, and on the first write of a new WIB day the latest earlier row closed from `doc` (null when it has
   * nothing open). After a cold start that row is read from storage, so a quiet day between keeps its open events.
   */
  private async logs(doc: OfficeDoc, now: number): Promise<{ log: DayLog; closed: DayLog | null; fresh: boolean }> {
    const day = wibDay(now);
    if (this.log?.day === day) return { log: this.log, closed: null, fresh: false };
    const stored = await this.ctx.storage.get<DayLog>(logKey(day));
    if (stored) return { log: stored, closed: null, fresh: false };
    const prev = this.log ?? [...(await this.ctx.storage.list<DayLog>({ prefix: "log:", end: logKey(day) })).values()].at(-1) ?? null;
    const closed = prev ? closeLog(prev, doc) : null;
    return { log: startLog(day, doc), closed: closed !== prev ? closed : null, fresh: true };
  }

  /**
   * Saves `next` with the log rows it changes in one put (one transaction); a keepalive writes the doc row alone. A
   * privatized `repo` leaves no name or title in any stored or new row, in that same put.
   */
  private async commit(before: OfficeDoc, next: OfficeDoc, now: number, privatized?: string): Promise<void> {
    const { log, closed, fresh } = await this.logs(before, now);
    const scrub = (row: DayLog) => (privatized === undefined ? row : scrubRepo(row, privatized));
    const rows: Record<string, unknown> = privatized === undefined ? {} : await this.scrubbed(privatized);
    const logged = scrub(logDoc(log, before, next, now));
    if (logged !== log || fresh) rows[logKey(logged.day)] = logged;
    if (closed) rows[logKey(closed.day)] = scrub(closed);
    if (Object.keys(rows).length) await this.ctx.storage.put({ [DOC_KEY]: next, ...rows });
    else await this.ctx.storage.put(DOC_KEY, next);
    this.doc = next;
    this.log = logged;
    if (fresh) await this.prune(now);
  }

  /** Deletes log rows older than the 8-day window (normally one, on the first write of a day). */
  private async prune(now: number): Promise<void> {
    const oldest = historyWindow(now).at(-1) as string;
    const stale = await this.ctx.storage.list<DayLog>({ prefix: "log:", end: logKey(oldest) });
    if (stale.size) await this.ctx.storage.delete([...stale.keys()]);
  }

  /** The stored rows a privatized repository changes, scrubbed (not yet written). */
  private async scrubbed(repo: string): Promise<Record<string, DayLog>> {
    const changed: Record<string, DayLog> = {};
    for (const [key, row] of await this.ctx.storage.list<DayLog>({ prefix: "log:" })) {
      const next = scrubRepo(row, repo);
      if (JSON.stringify(next) !== JSON.stringify(row)) changed[key] = next;
    }
    return changed;
  }

  async fetch(request: Request): Promise<Response> {
    const { pathname, searchParams } = new URL(request.url);
    if (pathname === "/snapshot") {
      if (request.method !== "GET") return status(405);
      // v2, v3 and v4 only for exactly ?v=2, ?v=3 and ?v=4; anything else is the unchanged v1 body.
      const doc = await this.load();
      const v = searchParams.get("v");
      const now = this.now();
      const body = JSON.stringify(v === "4" ? viewV4(doc, now) : v === "3" ? viewV3(doc, now) : v === "2" ? viewV2(doc, now) : view(doc, now));
      return new Response(body, { headers: { "Content-Type": "application/json; charset=utf-8" } });
    }
    if (pathname === "/history") {
      // Read-only: the 8-day index, or one day of the window (open events closed, no session hashes).
      if (request.method !== "GET") return status(405);
      const doc = await this.load();
      const now = this.now();
      const window = historyWindow(now);
      const day = searchParams.get("day");
      if (day === null) return json(historyIndex(window, await this.ctx.storage.get<DayLog>(window.map(logKey))));
      if (!window.includes(day)) return status(404);
      const log = this.log?.day === day ? this.log : ((await this.ctx.storage.get<DayLog>(logKey(day))) ?? emptyLog(day));
      return json(historyDay(log, doc));
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
      await this.commit(doc, applyBeat(doc, beat, now), now);
      return status(204);
    }
    if (!isGithubMessage(body)) return status(400);
    const next = applyGithub(doc, body.update, body.delivery, now);
    if (next === doc) return status(204);
    await this.commit(doc, next, now, body.update.changes.some((c) => c.type === "privatized") ? body.update.repo : undefined);
    return status(204);
  }
}

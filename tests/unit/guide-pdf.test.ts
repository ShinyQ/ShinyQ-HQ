import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { modern, legacy } = vi.hoisted(() => ({
  modern: { name: "modern", GlobalWorkerOptions: { workerPort: null as unknown } },
  legacy: { name: "legacy", GlobalWorkerOptions: { workerPort: null as unknown } },
}));
vi.mock("pdfjs-dist", () => modern);
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => legacy);

/** A stand-in for the browser's Worker: records its script URL and can fire `error`. */
class FakeWorker extends EventTarget {
  static made: FakeWorker[] = [];
  terminated = false;
  constructor(
    readonly url: URL,
    readonly options: WorkerOptions,
  ) {
    super();
    FakeWorker.made.push(this);
  }
  terminate() {
    this.terminated = true;
  }
}

async function freshPdf() {
  vi.resetModules();
  return import("@/components/guides/pdf");
}

beforeEach(() => {
  FakeWorker.made = [];
  modern.GlobalWorkerOptions.workerPort = null;
  legacy.GlobalWorkerOptions.workerPort = null;
  vi.stubGlobal("Worker", FakeWorker);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("needsLegacyPdfjs", () => {
  const full = () => ({
    Map: { prototype: { getOrInsertComputed() {} } },
    Math: { sumPrecise() {} },
    URL: { parse() {} },
    Promise: { try() {}, withResolvers() {} },
  });

  it("keeps the modern build when every feature it calls exists", async () => {
    const { needsLegacyPdfjs } = await freshPdf();
    expect(needsLegacyPdfjs(full() as never)).toBe(false);
  });

  it.each([
    ["Map.prototype.getOrInsertComputed", (env: ReturnType<typeof full>) => void delete (env.Map.prototype as Partial<typeof env.Map.prototype>).getOrInsertComputed],
    ["Math.sumPrecise", (env: ReturnType<typeof full>) => void delete (env.Math as Partial<typeof env.Math>).sumPrecise],
    ["URL.parse", (env: ReturnType<typeof full>) => void delete (env.URL as Partial<typeof env.URL>).parse],
    ["Promise.try", (env: ReturnType<typeof full>) => void delete (env.Promise as Partial<typeof env.Promise>).try],
    ["Promise.withResolvers", (env: ReturnType<typeof full>) => void delete (env.Promise as Partial<typeof env.Promise>).withResolvers],
  ])("picks the legacy build without %s", async (_name, drop) => {
    const { needsLegacyPdfjs } = await freshPdf();
    const env = full();
    drop(env);
    expect(needsLegacyPdfjs(env as never)).toBe(true);
  });
});

describe("loadPdfjs", () => {
  it("loads the modern build and its module worker once", async () => {
    const { loadPdfjs } = await freshPdf();
    const lib = await loadPdfjs(false);
    expect(lib).toMatchObject({ name: "modern" });
    expect(await loadPdfjs(false)).toBe(lib);
    expect(FakeWorker.made).toHaveLength(1);
    expect(FakeWorker.made[0].url.pathname).toMatch(/pdfjs-dist\/build\/pdf\.worker\.min\.mjs$/);
    expect(FakeWorker.made[0].options).toEqual({ type: "module" });
    expect(modern.GlobalWorkerOptions.workerPort).toBe(FakeWorker.made[0]);
  });

  it("loads the legacy build and the legacy worker when a feature is missing", async () => {
    const { loadPdfjs } = await freshPdf();
    const lib = await loadPdfjs(true);
    expect(lib).toMatchObject({ name: "legacy" });
    expect(FakeWorker.made).toHaveLength(1);
    expect(FakeWorker.made[0].url.pathname).toMatch(/pdfjs-dist\/legacy\/build\/pdf\.worker\.min\.mjs$/);
    expect(legacy.GlobalWorkerOptions.workerPort).toBe(FakeWorker.made[0]);
    expect(modern.GlobalWorkerOptions.workerPort).toBeNull();
  });

  it("on a worker error rejects workerFailure, drops the port and starts a new worker on the next load", async () => {
    const { loadPdfjs, workerFailure } = await freshPdf();
    await loadPdfjs(false);
    const failure = workerFailure();
    const first = FakeWorker.made[0];
    first.dispatchEvent(new Event("error"));
    await expect(failure).rejects.toThrow(/worker/i);
    expect(first.terminated).toBe(true);
    expect(modern.GlobalWorkerOptions.workerPort).toBeNull();
    await loadPdfjs(false);
    expect(FakeWorker.made).toHaveLength(2);
    expect(modern.GlobalWorkerOptions.workerPort).toBe(FakeWorker.made[1]);
    // The new worker has its own, still pending, failure promise.
    const next = workerFailure();
    expect(next).not.toBe(failure);
    let settled = false;
    next.catch(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
  });

  it("never reports an unhandled rejection when nobody listens for the failure", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    const { loadPdfjs } = await freshPdf();
    await loadPdfjs(false);
    FakeWorker.made[0].dispatchEvent(new Event("error"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    process.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });
});

describe("raceLoad", () => {
  it("resolves with the load", async () => {
    const { raceLoad } = await freshPdf();
    await expect(raceLoad(Promise.resolve(7), new Promise<never>(() => {}), 1000)).resolves.toBe(7);
  });

  it("rejects when the worker fails first", async () => {
    const { raceLoad } = await freshPdf();
    await expect(raceLoad(new Promise(() => {}), Promise.reject(new Error("worker failed")), 1000)).rejects.toThrow("worker failed");
  });

  it("rejects after the timeout and clears its timer when the load wins", async () => {
    vi.useFakeTimers();
    const { raceLoad } = await freshPdf();
    const slow = raceLoad(new Promise(() => {}), new Promise<never>(() => {}), 45_000);
    const caught = slow.catch((error: Error) => error.message);
    await vi.advanceTimersByTimeAsync(44_999);
    await vi.advanceTimersByTimeAsync(1);
    expect(await caught).toMatch(/timed out/i);
    await raceLoad(Promise.resolve(1), new Promise<never>(() => {}), 45_000);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("destroyTask and afterDestroy", () => {
  it("lets the next open wait for the previous document's destroy", async () => {
    const { afterDestroy, destroyTask } = await freshPdf();
    await expect(afterDestroy()).resolves.toBeUndefined();
    let finish!: () => void;
    const task = { destroy: vi.fn(() => new Promise<void>((resolve) => (finish = resolve))) };
    destroyTask(task);
    expect(task.destroy).toHaveBeenCalledOnce();
    let waited = false;
    const next = afterDestroy().then(() => (waited = true));
    await Promise.resolve();
    expect(waited).toBe(false);
    finish();
    await next;
    expect(waited).toBe(true);
  });

  it("does not wait on a destroy whose worker failed (pdf.js would wait for that worker forever)", async () => {
    const { afterDestroy, destroyTask } = await freshPdf();
    destroyTask({ destroy: () => new Promise<void>(() => {}) }, Promise.reject(new Error("worker failed")));
    await expect(afterDestroy()).resolves.toBeUndefined();
  });

  it("stops waiting for a hung destroy after the cap", async () => {
    vi.useFakeTimers();
    const { afterDestroy, destroyTask, DESTROY_WAIT_MS } = await freshPdf();
    destroyTask({ destroy: () => new Promise<void>(() => {}) }, new Promise<never>(() => {}));
    let waited = false;
    const next = afterDestroy().then(() => (waited = true));
    await vi.advanceTimersByTimeAsync(DESTROY_WAIT_MS - 1);
    expect(waited).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await next;
    expect(waited).toBe(true);
  });

  it("does not block the next open on a destroy that fails", async () => {
    const { afterDestroy, destroyTask } = await freshPdf();
    destroyTask({ destroy: () => Promise.reject(new Error("gone")) });
    await expect(afterDestroy()).resolves.toBeUndefined();
  });
});

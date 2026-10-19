type Pdfjs = typeof import("pdfjs-dist");

interface FeatureScope {
  Map: { prototype: object };
  Math: object;
  URL: object;
  Promise: object;
}

/**
 * True when the browser lacks a built-in the modern pdf.js build calls without a polyfill
 * (`Map.prototype.getOrInsertComputed`, `Math.sumPrecise`, `URL.parse`, `Promise.try`, `Promise.withResolvers`):
 * older iOS Safari, for example. Those browsers get the legacy build, which carries the polyfills.
 */
export function needsLegacyPdfjs(scope: FeatureScope = globalThis): boolean {
  const has = (owner: object, name: string) => typeof (owner as Record<string, unknown>)[name] === "function";
  return !(
    has(scope.Map.prototype, "getOrInsertComputed") &&
    has(scope.Math, "sumPrecise") &&
    has(scope.URL, "parse") &&
    has(scope.Promise, "try") &&
    has(scope.Promise, "withResolvers")
  );
}

let ready: Promise<Pdfjs> | undefined;
/** Rejects when the current worker fails to load (pdf.js itself never listens for a port's `error`). */
let failure: Promise<never> = new Promise<never>(() => {});

function startWorker(pdfjs: Pdfjs, legacy: boolean) {
  // Two literal `new URL(...)` expressions, so the bundler emits each worker as its own hashed asset.
  const worker = legacy
    ? new Worker(new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url), { type: "module" })
    : new Worker(new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url), { type: "module" });
  failure = new Promise<never>((_, reject) => {
    worker.addEventListener(
      "error",
      () => {
        if (pdfjs.GlobalWorkerOptions.workerPort === worker) {
          pdfjs.GlobalWorkerOptions.workerPort = null;
          ready = undefined;
        }
        worker.terminate();
        reject(new Error("The pdf.js worker failed to load"));
      },
      { once: true },
    );
  });
  failure.catch(() => {});
  pdfjs.GlobalWorkerOptions.workerPort = worker;
}

/**
 * Loads pdf.js on first use (only the study guide reader chunk imports this) and starts its worker once, as a
 * same-origin module worker bundled from the package, so the site CSP (`worker-src 'self' blob:`) allows it.
 * Browsers without the modern build's built-ins (`needsLegacyPdfjs`) get the legacy build and worker, two
 * separate lazy assets the modern path never downloads. A worker that fails to load rejects `workerFailure()`
 * and is forgotten, so the next load (Retry) starts a new one.
 */
export function loadPdfjs(legacy = needsLegacyPdfjs()): Promise<Pdfjs> {
  ready ??= (legacy ? (import("pdfjs-dist/legacy/build/pdf.mjs") as Promise<Pdfjs>) : import("pdfjs-dist")).then((pdfjs) => {
    if (!pdfjs.GlobalWorkerOptions.workerPort) startWorker(pdfjs, legacy);
    return pdfjs;
  });
  // A failed chunk load may succeed on Retry: forget the rejected promise.
  ready.catch(() => {
    ready = undefined;
  });
  return ready;
}

/** The current worker's failure: race a document load against it, since pdf.js would wait forever. */
export function workerFailure(): Promise<never> {
  return failure;
}

/** How long opening a document may take before the reader shows its error state. */
export const OPEN_TIMEOUT_MS = 45_000;

/** `load`, unless `failed` rejects first or `ms` pass (then it rejects with a timeout). Clears its timer. */
export function raceLoad<T>(load: Promise<T>, failed: Promise<never>, ms = OPEN_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Opening the document timed out after ${ms} ms`)), ms);
  });
  return Promise.race([load, failed, timeout]).finally(() => clearTimeout(timer));
}

let destroying: Promise<void> = Promise.resolve();

/** Destroys a loading task (and its document) and remembers it, so the next open can wait for it. */
export function destroyTask(task: { destroy(): Promise<void> }): void {
  const done = task.destroy().catch(() => {});
  destroying = Promise.all([destroying, done]).then(() => undefined);
}

/** Resolves once every destroy started so far has finished (a fast close and reopen, or Retry). */
export function afterDestroy(): Promise<void> {
  return destroying;
}

type Dest = string | unknown[] | null;
interface DestSource {
  getDestination(id: string): Promise<unknown[] | null>;
  getPageIndex(ref: never): Promise<number>;
}

/** The 1-based page an outline destination (named or explicit) points to, or null when it has none. */
export async function destPage(doc: DestSource, dest: Dest): Promise<number | null> {
  const explicit = typeof dest === "string" ? await doc.getDestination(dest) : dest;
  if (!Array.isArray(explicit) || explicit.length === 0) return null;
  const target = explicit[0];
  if (typeof target === "number") return target + 1;
  if (!target || typeof target !== "object") return null;
  return (await doc.getPageIndex(target as never)) + 1;
}

/**
 * Loads pdf.js on first use (only the study guide reader chunk imports this) and starts its worker once, as a
 * same-origin module worker bundled from the package, so the site CSP (`worker-src 'self' blob:`) allows it.
 */
let ready: Promise<typeof import("pdfjs-dist")> | undefined;

export function loadPdfjs(): Promise<typeof import("pdfjs-dist")> {
  ready ??= import("pdfjs-dist").then((pdfjs) => {
    if (!pdfjs.GlobalWorkerOptions.workerPort) {
      pdfjs.GlobalWorkerOptions.workerPort = new Worker(new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url), { type: "module" });
    }
    return pdfjs;
  });
  // A failed chunk load may succeed on Retry: forget the rejected promise.
  ready.catch(() => {
    ready = undefined;
  });
  return ready;
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

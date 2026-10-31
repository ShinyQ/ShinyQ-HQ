import type { Page } from "@playwright/test";

/** The fields of a V8 heap snapshot (`HeapProfiler.takeHeapSnapshot`) that `retainedJsBytes` reads. */
export interface HeapSnapshot {
  snapshot: { meta: { node_fields: string[]; node_types: [string[], ...unknown[]] } };
  nodes: number[];
}

/**
 * Node types that hold what the page's code keeps alive: objects (closure scopes and arrays too), closures, their
 * element and property stores, strings and heap numbers. Left out: `code` (bytecode, the Sparkplug, Maglev and TurboFan
 * code, feedback vectors, inline caches), `object shape` (hidden classes), `hidden` and `synthetic` nodes, and
 * `native` (Blink's DOM and style objects and ArrayBuffer stores, outside the JS heap).
 */
const RETAINED_TYPES = new Set(["object", "closure", "array", "string", "concatenated string", "sliced string", "number", "regexp", "symbol", "bigint"]);

/** Bytes of the snapshot's retained JS (`RETAINED_TYPES`): the sum of their self sizes. */
export function retainedJsBytes(heap: HeapSnapshot): number {
  const fields = heap.snapshot.meta.node_fields;
  const types = heap.snapshot.meta.node_types[0];
  const typeAt = fields.indexOf("type");
  const sizeAt = fields.indexOf("self_size");
  let bytes = 0;
  for (let i = 0; i < heap.nodes.length; i += fields.length) if (RETAINED_TYPES.has(types[heap.nodes[i + typeAt]])) bytes += heap.nodes[i + sizeAt];
  return bytes;
}

/**
 * JS heap the page retains, in bytes: `retainedJsBytes` of a heap snapshot, taken after a collection and two frames (so
 * finalizers of weakly held objects have run); V8 collects all available garbage again before the snapshot.
 * `Runtime.getHeapUsage` also counts V8's code space, which keeps growing for dozens of Page View toggles or rides as V8
 * optimizes more of the page (issue #298), so it cannot show a small leak.
 */
export async function readRetainedJsBytes(page: Page): Promise<number> {
  const cdp = await page.context().newCDPSession(page);
  const chunks: string[] = [];
  cdp.on("HeapProfiler.addHeapSnapshotChunk", ({ chunk }) => chunks.push(chunk));
  await cdp.send("HeapProfiler.collectGarbage");
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await cdp.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false });
  await cdp.detach();
  return retainedJsBytes(JSON.parse(chunks.join("")) as HeapSnapshot);
}

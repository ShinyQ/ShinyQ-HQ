import { expect, it } from "vitest";
import { retainedJsBytes, type HeapSnapshot } from "../../e2e/heap";

const TYPES = ["hidden", "array", "string", "object", "code", "closure", "regexp", "number", "native", "synthetic", "concatenated string", "sliced string", "symbol", "bigint", "object shape"];
const FIELDS = ["type", "name", "id", "self_size", "edge_count", "trace_node_id", "detachedness"];

/** A snapshot with one node per `[type, self_size]` pair, in V8's flat layout. */
function snapshot(nodes: [string, number][]): HeapSnapshot {
  return {
    snapshot: { meta: { node_fields: FIELDS, node_types: [TYPES, "string", "number", "number", "number", "number", "number"] } },
    nodes: nodes.flatMap(([type, size], i) => [TYPES.indexOf(type), 0, i + 1, size, 0, 0, 0]),
  };
}

it("counts the JS the page retains and leaves out V8's code, hidden classes and native memory", () => {
  const heap = snapshot([
    ["synthetic", 0],
    ["object", 100],
    ["closure", 40],
    ["array", 64],
    ["string", 24],
    ["concatenated string", 8],
    ["number", 16],
    ["code", 5000],
    ["object shape", 300],
    ["native", 9000],
    ["hidden", 70],
  ]);
  expect(retainedJsBytes(heap)).toBe(100 + 40 + 64 + 24 + 8 + 16);
});

it("reads the type and size columns wherever the snapshot puts them", () => {
  const heap = snapshot([["object", 10]]);
  heap.snapshot.meta.node_fields = ["name", "self_size", "type", "id", "edge_count", "trace_node_id", "detachedness"];
  heap.nodes = [0, 10, TYPES.indexOf("object"), 1, 0, 0, 0, 0, 7, TYPES.indexOf("code"), 2, 0, 0, 0];
  expect(retainedJsBytes(heap)).toBe(10);
});

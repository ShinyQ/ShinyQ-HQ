import { describe, expect, it } from "vitest";
import { architectureLayers, orderArchitectureNodes } from "@/content/architecture";

describe("architecture node order", () => {
  it("orders by layer, then row, without mutating the input", () => {
    const nodes = [
      { id: "c", layer: 2, row: 0 },
      { id: "b", layer: 0, row: 1 },
      { id: "a", layer: 0, row: 0 },
      { id: "d", layer: 1, row: 3 },
    ];
    expect(orderArchitectureNodes(nodes).map((n) => n.id)).toEqual(["a", "b", "d", "c"]);
    expect(nodes[0].id).toBe("c");
  });

  it("counts layers from the deepest node", () => {
    expect(architectureLayers([{ layer: 0 }, { layer: 4 }, { layer: 2 }])).toBe(5);
  });
});

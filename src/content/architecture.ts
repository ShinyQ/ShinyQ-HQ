/** Reading order of architecture nodes: left to right by layer, then top to bottom by row (stacked phone layout, screen readers). */
export function orderArchitectureNodes<T extends { layer: number; row: number }>(nodes: readonly T[]): T[] {
  return [...nodes].sort((a, b) => a.layer - b.layer || a.row - b.row);
}

export function architectureLayers(nodes: readonly { layer: number }[]): number {
  return Math.max(...nodes.map((n) => n.layer)) + 1;
}

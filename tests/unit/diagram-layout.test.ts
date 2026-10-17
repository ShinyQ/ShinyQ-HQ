import { describe, expect, it } from "vitest";
import { assignGrid, DIAGRAM_PRESETS, edgeCrossings, layoutArchitecture, PAD, textWidth, wrapText, type DiagramLayout } from "@/components/diagram/layout";
import { arrowHead, edgePath } from "@/components/diagram/DiagramSvg";
import { getBuildStory } from "@/content/build-story";
import { getPods } from "@/content/load";
import { getPostDiagrams } from "@/content/post-diagrams";
import type { Architecture } from "@/content/schema";

const texts = (n: Architecture["nodes"][number]) => ({ kind: n.kind.toUpperCase(), label: n.label, sublabel: n.sublabel?.en });

const diagrams: [string, Architecture][] = [
  ...getPods().flatMap((p) => (p.architecture ? [[`pod:${p.slug}`, p.architecture] as [string, Architecture]] : [])),
  ...Object.entries(getPostDiagrams()).flatMap(([post, list]) =>
    Object.entries(list).map(([id, a]) => [`post:${post}/${id}`, a] as [string, Architecture]),
  ),
  ["build-story:blueprint", getBuildStory().stations.blueprint.architecture],
];

type Rect = { x: number; y: number; w: number; h: number };
const overlap = (a: Rect, b: Rect, gap = 0) =>
  a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
const onBorder = ([x, y]: readonly [number, number], r: Rect) =>
  ((Math.abs(x - r.x) < 0.5 || Math.abs(x - r.x - r.w) < 0.5) && y >= r.y - 0.5 && y <= r.y + r.h + 0.5) ||
  ((Math.abs(y - r.y) < 0.5 || Math.abs(y - r.y - r.h) < 0.5) && x >= r.x - 0.5 && x <= r.x + r.w + 0.5);

function expectSound(name: string, arch: Architecture, layout: DiagramLayout) {
  const byId = new Map(layout.nodes.map((n) => [n.id, n]));
  expect(layout.nodes.length, name).toBe(arch.nodes.length);
  for (let i = 0; i < layout.nodes.length; i++)
    for (let j = i + 1; j < layout.nodes.length; j++)
      expect(overlap(layout.nodes[i], layout.nodes[j]), `${name}: ${layout.nodes[i].id} overlaps ${layout.nodes[j].id}`).toBe(false);
  const labels: Rect[] = [];
  arch.edges.forEach((e, i) => {
    const edge = layout.edges[i];
    const pts = edge.points;
    expect(onBorder(pts[0], byId.get(e.from)!), `${name}: ${e.from} to ${e.to} starts on its source`).toBe(true);
    expect(onBorder(pts[pts.length - 1], byId.get(e.to)!), `${name}: ${e.from} to ${e.to} ends on its target`).toBe(true);
    for (let k = 1; k < pts.length; k++) {
      const [ax, ay] = pts[k - 1];
      const [bx, by] = pts[k];
      expect(Math.abs(ax - bx) < 0.01 || Math.abs(ay - by) < 0.01, `${name}: ${e.from} to ${e.to} is orthogonal`).toBe(true);
    }
    expect(Boolean(edge.label), `${name}: label of ${e.from} to ${e.to}`).toBe(Boolean(e.label));
    if (edge.label) {
      for (const n of layout.nodes) expect(overlap(edge.label, n), `${name}: label "${e.label}" covers ${n.id}`).toBe(false);
      for (const l of labels) expect(overlap(edge.label, l), `${name}: label "${e.label}" covers another label`).toBe(false);
      expect(edge.label.x >= 0 && edge.label.x + edge.label.w <= layout.width, `${name}: label "${e.label}" inside`).toBe(true);
      labels.push(edge.label);
    }
  });
  for (const n of layout.nodes) expect(n.x >= 0 && n.y >= 0 && n.x + n.w <= layout.width && n.y + n.h <= layout.height, name).toBe(true);
  for (const g of layout.groups) expect(g.y - layout.preset.kindSize - 6, `${name}: group "${g.label}" name inside`).toBeGreaterThanOrEqual(0);
  const inner = (n: DiagramLayout["nodes"][number]) => n.w - 2 * PAD + 1;
  for (const n of layout.nodes)
    for (const line of n.label) expect(textWidth(line, layout.preset.labelSize, true), `${name}: "${line}" fits ${n.id}`).toBeLessThanOrEqual(inner(n));
  for (const n of layout.nodes)
    for (const line of n.sublabel) expect(textWidth(line, layout.preset.subSize), `${name}: "${line}" fits ${n.id}`).toBeLessThanOrEqual(inner(n));
}

describe("diagram layout", () => {
  it("wraps by measured width and keeps long words whole", () => {
    expect(wrapText("Agent Framework YAML agents", 120, 13, true)).toEqual(["Agent Framework", "YAML agents"]);
    expect(wrapText("Supercalifragilistic", 40, 12)).toEqual(["Supercalifragilistic"]);
    expect(wrapText("Microsoft-Decision-1", 100, 13, true)).toEqual(["Microsoft-", "Decision-1"]);
  });

  it("keeps the authored grid left to right and packs layers top to bottom", () => {
    const arch: Architecture = {
      nodes: [
        { id: "a", label: "A", layer: 0, row: 0, kind: "client" },
        { id: "b", label: "B", layer: 1, row: 0, kind: "service" },
        { id: "c", label: "C", layer: 1, row: 2, kind: "data" },
        { id: "d", label: "D", layer: 1, row: 3, kind: "ai" },
      ],
      edges: [],
    };
    expect(Object.fromEntries(assignGrid(arch, DIAGRAM_PRESETS.wide))).toEqual({
      a: { band: 0, slot: 0 },
      b: { band: 1, slot: 0 },
      c: { band: 1, slot: 2 },
      d: { band: 1, slot: 3 },
    });
    expect(Object.fromEntries(assignGrid(arch, DIAGRAM_PRESETS.phone))).toEqual({
      a: { band: 0, slot: 0.5 },
      b: { band: 1, slot: 0 },
      c: { band: 1, slot: 1 },
      d: { band: 2, slot: 0.5 },
    });
  });

  it("draws rounded orthogonal paths that stop short of the arrowhead", () => {
    expect(edgePath([[0, 0], [20, 0], [20, 20]], [0, 1])).toBe("M0 0L14 0Q20 0 20 6L20 14");
    expect(arrowHead([20, 20], [0, 1])).toBe("M20 20L15.8 13L24.2 13Z");
  });

  for (const [name, preset] of Object.entries(DIAGRAM_PRESETS)) {
    it(`lays out every real diagram soundly (${name})`, () => {
      for (const [id, arch] of diagrams) {
        const layout = layoutArchitecture(arch, texts, preset);
        expectSound(`${id} ${name}`, arch, layout);
      }
    });
  }

  it("draws every post diagram without crossing edges, in every layout", () => {
    const postPods = ["voice-ai-contact-center", "ai-cv-screening-platform", "fraud-review-platform", "vendor-management-portal"];
    const inPosts = diagrams.filter(([id]) => id.startsWith("post:") || postPods.some((slug) => id === `pod:${slug}`));
    expect(inPosts.length).toBeGreaterThanOrEqual(7);
    for (const [name, preset] of Object.entries(DIAGRAM_PRESETS))
      for (const [id, arch] of inPosts) expect(edgeCrossings(layoutArchitecture(arch, texts, preset).edges).crossings, `${id} ${name}`).toBe(0);
  });

  it("fits phones at scale 1 with text of at least 12 px", () => {
    const p = DIAGRAM_PRESETS.phone;
    expect(Math.min(p.kindSize, p.labelSize, p.subSize, p.edgeSize)).toBeGreaterThanOrEqual(12);
    for (const [id, arch] of diagrams) expect(layoutArchitecture(arch, texts, p).width, id).toBeLessThanOrEqual(p.maxWidth);
  });
});

import { describe, expect, it } from "vitest";
import { architectureRefs, resolvePostArchitecture } from "@/content/post-diagrams";
import { PostDiagramsSchema } from "@/content/schema";
import { resolveArchitecture } from "@/components/diagram/text";

const arch = { nodes: [{ id: "a", label: "A", layer: 0, row: 0, kind: "service" as const }], edges: [] };
const sources = { pods: [{ slug: "pod-x", architecture: arch }, { slug: "pod-bare" }], diagrams: { "post-y": { loop: arch } } };

describe("resolvePostArchitecture", () => {
  it("keeps reference resolution raw and resolves bilingual labels only at the locale boundary", () => {
    const diagrams = PostDiagramsSchema.parse({
      "post-y": { loop: { ...arch, nodes: [{ ...arch.nodes[0], label: { en: "Review", id: "Tinjauan" } }] } },
    });
    const raw = resolvePostArchitecture("post-y", { diagram: "loop" }, { pods: [], diagrams });
    expect(raw).toBe(diagrams["post-y"].loop);
    expect(resolveArchitecture(raw, "id").nodes[0].label).toBe("Tinjauan");
    expect(raw.nodes[0].label).toEqual({ en: "Review", id: "Tinjauan" });
  });
  it("finds a pod's architecture by slug", () => {
    expect(resolvePostArchitecture("post-y", { pod: "pod-x" }, sources)).toBe(arch);
  });
  it("finds a post-local diagram by id", () => {
    expect(resolvePostArchitecture("post-y", { diagram: "loop" }, sources)).toBe(arch);
  });
  it("fails on an unknown pod, a pod without architecture and an unknown diagram", () => {
    expect(() => resolvePostArchitecture("post-y", { pod: "nope" }, sources)).toThrow(/post-y.*nope/);
    expect(() => resolvePostArchitecture("post-y", { pod: "pod-bare" }, sources)).toThrow(/pod-bare/);
    expect(() => resolvePostArchitecture("post-y", { diagram: "nope" }, sources)).toThrow(/post-y.*nope/);
    expect(() => resolvePostArchitecture("other", { diagram: "loop" }, sources)).toThrow(/other.*loop/);
  });
  it("needs exactly one of pod and diagram", () => {
    expect(() => resolvePostArchitecture("post-y", {}, sources)).toThrow(/exactly one/);
    expect(() => resolvePostArchitecture("post-y", { pod: "pod-x", diagram: "loop" }, sources)).toThrow(/exactly one/);
  });
});

describe("architectureRefs", () => {
  it("reads every Architecture tag's string props", () => {
    const mdx = 'Text\n\n<Architecture pod="pod-x" caption="One, two." />\n\n<Architecture diagram="loop" caption="Loop" />\n';
    expect(architectureRefs(mdx)).toEqual([
      { pod: "pod-x", caption: "One, two." },
      { diagram: "loop", caption: "Loop" },
    ]);
  });
});

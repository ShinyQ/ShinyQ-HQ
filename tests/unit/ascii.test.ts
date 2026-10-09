import { describe, expect, it } from "vitest";
import type { RoomArchitecture, RoomView } from "@/content/room-views/types";
import { renderAsciiArchitecture, renderReadme, wrap, type ReadmeLabels } from "@/hud/drawer/ascii";

const EM_DASH = "\u2014";

const arch: RoomArchitecture = {
  nodes: [
    { id: "caller", label: "Caller", layer: 0, row: 0, kind: "human" },
    { id: "gateway", label: "Voice Gateway", layer: 1, row: 0, kind: "service" },
    { id: "agent", label: "LLM Agent", layer: 2, row: 0, kind: "ai" },
    { id: "crm", label: "CRM", layer: 2, row: 1, kind: "data" },
    { id: "queue", label: "Event Queue", layer: 1, row: 1, kind: "external" },
  ],
  edges: [
    { from: "caller", to: "gateway", label: "SIP" },
    { from: "gateway", to: "agent" },
    { from: "agent", to: "crm", label: "lookup" },
    { from: "queue", to: "crm", async: true },
  ],
};

const labels: ReadmeLabels = {
  overview: "Overview",
  architecture: "Architecture",
  results: "Results",
  stack: "Stack",
  links: "Links",
};

const view: RoomView = {
  id: "L3:voice-ai-contact-center",
  floor: "L3",
  kind: "pod",
  code: "L3:voice-ai-contact-center",
  title: "Voice AI Contact Center",
  subtitle: "Realtime voice agents for a bank call center",
  meta: ["Tech Lead", "2025"],
  badges: [],
  accent: "cyan",
  variant: "tabs",
  sections: [
    {
      title: "Problem",
      body: "Long queues and repetitive questions kept human agents busy with work that a well grounded voice agent can handle end to end without escalation.",
      bullets: ["Streaming speech to text and back", "Grounded answers from the knowledge base with citations for every reply"],
      items: [{ title: "Design doc", meta: "2025" }],
      chips: ["voice", "rag"],
    },
  ],
  metrics: [{ value: "40%", label: "shorter handling time", context: "pilot, n=200" }],
  architecture: arch,
  stack: [{ name: "TypeScript" }, { name: "Python" }, { name: "Redis" }],
  gallery: [],
  page: "/labs/voice-ai-contact-center",
  hologram: true,
  tabs: ["overview", "architecture", "results", "stack"],
};

const lines = (s: string) => s.split("\n");

describe("renderAsciiArchitecture", () => {
  const out = renderAsciiArchitecture(arch);

  it("draws one box per node with every label", () => {
    expect(out.split("┌").length - 1).toBe(arch.nodes.length);
    expect(out.split("┐").length - 1).toBe(arch.nodes.length);
    expect(out.split("└").length - 1).toBe(arch.nodes.length);
    expect(out.split("┘").length - 1).toBe(arch.nodes.length);
    for (const n of arch.nodes) expect(out).toContain(n.label);
    expect(out).toContain("[ai]");
    expect(out).toContain("[external]");
  });

  it("places layers left to right", () => {
    const row = lines(out).find((l) => l.includes("Caller") && l.includes("Voice Gateway"));
    expect(row).toBeDefined();
    const line = row ?? "";
    expect(line.indexOf("Caller")).toBeLessThan(line.indexOf("Voice Gateway"));
    expect(line.indexOf("Voice Gateway")).toBeLessThan(line.indexOf("LLM Agent"));
  });

  it("draws sync connectors between adjacent layers on the same row", () => {
    const line = lines(out).find((l) => l.includes("Caller")) ?? "";
    const between = line.slice(line.indexOf("Caller"), line.indexOf("Voice Gateway"));
    expect(between).toMatch(/─+▶/);
    expect(between).not.toContain("┄");
  });

  it("draws async connectors with dotted lines", () => {
    const line = lines(out).find((l) => l.includes("Event Queue") && l.includes("CRM")) ?? "";
    expect(line).toMatch(/┄+▶/);
  });

  it("draws right to left connectors", () => {
    const back = renderAsciiArchitecture({
      nodes: [
        { id: "a", label: "Alpha", layer: 0, row: 0, kind: "client" },
        { id: "b", label: "Beta", layer: 1, row: 0, kind: "service" },
      ],
      edges: [{ from: "b", to: "a" }],
    });
    expect(back).toMatch(/◀─+/);
  });

  it("lists every edge under flows and marks async", () => {
    const flows = out.slice(out.indexOf("flows:"));
    expect(flows).toContain("  Caller ───▶ Voice Gateway : SIP");
    expect(flows).toContain("  Voice Gateway ───▶ LLM Agent");
    expect(flows).toContain("  LLM Agent ───▶ CRM : lookup");
    expect(flows).toContain("  Event Queue ┄┄┄▶ CRM (async)");
    expect(lines(flows)).toHaveLength(arch.edges.length + 1);
  });

  it("keeps every line within maxWidth and truncates long labels", () => {
    const long: RoomArchitecture = {
      nodes: [
        ...arch.nodes,
        { id: "x", label: "An extremely long service name that cannot possibly fit", layer: 0, row: 1, kind: "service" },
      ],
      edges: arch.edges,
    };
    const narrow = renderAsciiArchitecture(long, { maxWidth: 60 });
    const grid = narrow.slice(0, narrow.indexOf("flows:"));
    for (const line of lines(grid)) expect(Array.from(line).length).toBeLessThanOrEqual(60);
    expect(grid).toContain("...");
    for (const line of lines(renderAsciiArchitecture(arch))) expect(Array.from(line).length).toBeLessThanOrEqual(72);
  });

  it("is deterministic", () => {
    expect(renderAsciiArchitecture(arch)).toBe(renderAsciiArchitecture(arch));
  });

  it("never leaves trailing spaces", () => {
    for (const line of lines(out)) expect(line).toBe(line.trimEnd());
  });
});

describe("renderReadme", () => {
  const readme = renderReadme(view, labels);

  it("renders a terminal document from the room view", () => {
    const l = lines(readme);
    expect(l[0]).toBe("$ cat README.md");
    expect(l[1]).toBe("");
    expect(l[2]).toBe("# Voice AI Contact Center");
    expect(readme).toContain("L3:voice-ai-contact-center · Tech Lead · 2025");
    expect(readme).toContain("## Overview");
    expect(readme).toContain("### Problem");
    expect(readme).toContain("- Streaming speech to text and back");
    expect(readme).toContain("- Design doc (2025)");
    expect(readme).toContain("voice, rag");
    expect(readme).toContain("## Architecture");
    expect(readme).toContain("```\n┌");
    expect(readme).toContain(renderAsciiArchitecture(arch, { maxWidth: 72 }));
    expect(readme).toContain("## Results");
    expect(readme).toContain("- 40%  shorter handling time (pilot, n=200)");
    expect(readme).toContain("## Stack");
    expect(readme).toContain("TypeScript, Python, Redis");
    expect(readme).toContain("- /labs/voice-ai-contact-center");
  });

  it("wraps prose to 72 columns with hanging bullets", () => {
    for (const line of lines(readme)) {
      expect(Array.from(line).length).toBeLessThanOrEqual(72);
      expect(line).toBe(line.trimEnd());
    }
  });

  it("skips optional headings when data is missing", () => {
    const bare = renderReadme(
      { ...view, architecture: undefined, metrics: [], stack: [], page: undefined, subtitle: undefined },
      labels,
    );
    expect(bare).not.toContain("## Architecture");
    expect(bare).not.toContain("## Results");
    expect(bare).not.toContain("## Stack");
    expect(bare).not.toContain("## Links");
  });

  it("never emits an em dash", () => {
    expect(readme).not.toContain(EM_DASH);
    const dashed = renderReadme({ ...view, title: `A ${EM_DASH} B`, sections: [{ body: `x ${EM_DASH} y` }] }, labels);
    expect(dashed).not.toContain(EM_DASH);
    expect(renderAsciiArchitecture(arch)).not.toContain(EM_DASH);
  });
});

describe("wrap", () => {
  it("never exceeds the width for normal words", () => {
    const text = "the quick brown fox jumps over the lazy dog ".repeat(10);
    for (const width of [10, 20, 33, 72]) {
      const out = wrap(text, width);
      expect(out.length).toBeGreaterThan(1);
      for (const line of out) expect(line.length).toBeLessThanOrEqual(width);
      expect(out.join(" ")).toBe(text.trim());
    }
  });

  it("splits words longer than the width", () => {
    for (const line of wrap("supercalifragilistic", 6)) expect(line.length).toBeLessThanOrEqual(6);
  });

  it("returns no lines for empty text", () => {
    expect(wrap("   ", 10)).toEqual([]);
  });
});

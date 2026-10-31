import { describe, expect, it, vi } from "vitest";
import * as buildStory from "@/content/build-story";
import { getBuildFacts, getBuildStory, STATION_IDS } from "@/content/build-story";
import { buildEngineRoomViews, buildRoomViews } from "@/content/room-views";
import { LOCALES } from "@/content/schema";
import enMessages from "../../messages/en.json";
import idMessages from "../../messages/id.json";
import { DIAGRAM_PRESETS } from "@/components/diagram/layout";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { b1DashboardTiles } from "@/content/room-views/engine";
import { dashboardTiles, prUrl, repoFileUrl, timelineRows } from "@/lib/build-page";

const story = getBuildStory();
const facts = getBuildFacts();

describe("B1 Engine Room drawers", () => {
  it("uses resolved native labels for both drawings and the accessible summary", () => {
    const localized = structuredClone(story);
    localized.stations.blueprint.architecture.nodes[0].label = { en: "Visitor browser", id: "Browser pengunjung" };
    localized.stations.blueprint.architecture.edges[0].label = { en: "request", id: "permintaan" };
    const before = structuredClone(localized);
    const spy = vi.spyOn(buildStory, "getBuildStory").mockReturnValue(localized);
    try {
      const diagram = buildEngineRoomViews("id")["B1:blueprint"].engine!.diagram!;
      for (const drawing of [diagram.layout, diagram.wide]) {
        expect(drawing.nodes[0].label.join(" ")).toBe("Browser pengunjung");
        expect(drawing.edges[0].label?.lines.join(" ")).toBe("permintaan");
      }
      expect(diagram.label).toContain("Browser pengunjung");
      expect(diagram.label).toContain("permintaan");
      expect(diagram.label).not.toContain("Visitor browser ke GitHub");
      expect(JSON.stringify(diagram)).not.toContain("[object Object]");
      expect(localized).toEqual(before);
    } finally {
      spy.mockRestore();
    }
  });

  for (const locale of LOCALES) {
    it(`keeps the secret B1 views out of the shared rooms file every 3D visitor fetches (${locale})`, () => {
      expect(Object.keys(buildRoomViews(locale)).filter((k) => k.startsWith("B1:"))).toEqual([]);
    });
  }

  for (const locale of LOCALES) {
    const views = buildEngineRoomViews(locale);
    const view = (id: string) => views[`B1:${id}`]!;

    it(`gives every station a single-pane engine view on B1, chained in station order, linking its /build section (${locale})`, () => {
      for (const [i, id] of STATION_IDS.entries()) {
        expect(view(id)).toMatchObject({ floor: "B1", kind: "engine", variant: "single", page: `/build#${id}`, accent: "amber", title: story.stations[id].title[locale] });
        expect(view(id).engine?.station).toBe(id);
        expect(view(id).prev).toBe(i > 0 ? `B1:${STATION_IDS[i - 1]}` : undefined);
        expect(JSON.parse(JSON.stringify(view(id)))).toEqual(view(id));
      }
      expect(Object.keys(views).filter((k) => k.startsWith("B1:")).sort()).toEqual([...STATION_IDS, "reactor"].map((id) => `B1:${id}`).sort());
    });

    it(`opens all seven stations in bay order, Rover's Brain and Rejected Designs included, then the reactor (${locale})`, () => {
      expect(STATION_IDS).toEqual(["blueprint", "timeline", "agents", "gates", "dashboard", "brain", "rejected"]);
      const chained: string[] = [];
      for (let id: string | undefined = "B1:blueprint"; id; id = views[id as keyof typeof views]?.next) chained.push(id);
      expect(chained).toEqual([...STATION_IDS, "reactor"].map((id) => `B1:${id}`));
    });

    it(`explains the reactor in plain words with its live labels and no Classic page (${locale})`, () => {
      const r = (locale === "en" ? enMessages : idMessages).build.reactor;
      const reactor = view("reactor");
      expect(reactor).toMatchObject({ floor: "B1", kind: "engine", variant: "single", accent: "amber", title: r.title, subtitle: r.subtitle, badges: [{ label: "B1", accent: "amber" }] });
      expect(reactor.title).toBe(locale === "en" ? "The Reactor" : "Reaktor");
      expect(reactor.page).toBeUndefined();
      expect(reactor.engine?.station).toBe("reactor");
      expect(reactor.sections).toEqual([{ title: r.howItReads, bullets: [r.segments, r.flash, r.sparks, r.pulse, r.idle] }, { body: r.polls }]);
      expect(reactor.engine?.reactor?.labels).toEqual({
        live: r.live,
        running: r.running,
        done: r.done,
        failed: r.failed,
        agents: r.agents,
        deploy: r.deploy,
        noDeploy: r.noDeploy,
        visits: r.visits,
        asks: r.asks,
        offline: r.offline,
      });
      for (const station of STATION_IDS) expect(view(station).engine?.reactor).toBeUndefined();
      expect(JSON.parse(JSON.stringify(reactor))).toEqual(reactor);
    });

    it(`draws Rover's Brain for the phone and the wide drawer and lists how it answers (${locale})`, () => {
      const { brain } = story.stations;
      const diagram = view("brain").engine?.diagram;
      expect(diagram?.layout.nodes).toHaveLength(brain.architecture.nodes.length);
      expect(diagram?.wide.nodes).toHaveLength(brain.architecture.nodes.length);
      expect(diagram?.layout.width).toBeLessThanOrEqual(DIAGRAM_PRESETS.phone.maxWidth);
      expect(diagram?.wide.width).toBeLessThanOrEqual(DIAGRAM_PRESETS.drawer.maxWidth);
      expect(diagram?.label.length).toBeGreaterThan(20);
      const steps = view("brain").sections.find((s) => s.bullets);
      expect(steps?.title).toBe(locale === "en" ? "How it answers" : "Cara menjawab");
      expect(steps?.bullets).toEqual(brain.steps.map((s) => `${s.title[locale]}: ${s.text[locale]}`));
    });

    it(`lists every rejected design with why it was dropped, linking those with a pull request (${locale})`, () => {
      const { ideas } = story.stations.rejected;
      const unlinked = story.stations.timeline.unlinkedPrs ?? [];
      const shown = view("rejected").engine?.ideas ?? [];
      expect(shown.length).toBeGreaterThanOrEqual(8);
      expect(shown.length).toBeLessThanOrEqual(14);
      expect(shown.map((i) => i.id)).toEqual(ideas.map((i) => i.id));
      shown.forEach((idea, i) => {
        expect(idea).toMatchObject({ title: ideas[i].title[locale], tried: ideas[i].tried[locale], reason: ideas[i].reason[locale] });
        const n = ideas[i].pr;
        // A pull request whose diff shows text the site hides (`unlinkedPrs`, C3) stays plain text here too.
        expect(idea.pr).toEqual(n === undefined ? undefined : unlinked.includes(n) ? { n } : { n, href: prUrl(n) });
      });
      expect(shown.some((i) => i.pr?.href)).toBe(true);
      expect(shown.find((i) => i.pr?.n === 288)?.pr).toEqual({ n: 288 });
      const l = view("rejected").engine!.labels;
      expect([l.tried, l.whyDropped]).toEqual(locale === "en" ? ["Tried", "Why it was dropped"] : ["Dicoba", "Alasan dibatalkan"]);
    });

    it(`lays the site diagram out for the drawer width and names it (${locale})`, () => {
      const diagram = view("blueprint").engine?.diagram;
      expect(diagram?.layout.nodes).toHaveLength(story.stations.blueprint.architecture.nodes.length);
      expect(diagram?.layout.width).toBeLessThanOrEqual(DIAGRAM_PRESETS.phone.maxWidth);
      // The wide side drawer layout (owner 2026-10-18): three nodes per band, as wide as a 560 px drawer's figure, text of at least 12 px.
      const d = DIAGRAM_PRESETS.drawer;
      expect(diagram?.wide.nodes).toHaveLength(story.stations.blueprint.architecture.nodes.length);
      expect(diagram?.wide.width).toBeLessThanOrEqual(d.maxWidth);
      expect(diagram?.wide.width).toBeGreaterThan(diagram!.layout.width);
      expect(Math.min(d.kindSize, d.labelSize, d.subSize, d.edgeSize)).toBeGreaterThanOrEqual(12);
      expect(diagram?.label.length).toBeGreaterThan(20);
    });

    it(`lists every round with its measured pull requests, linking all but the unlinked ones (${locale})`, () => {
      const rows = timelineRows(story, facts);
      const rounds = view("timeline").engine?.rounds ?? [];
      expect(rounds.map((r) => r.id)).toEqual(rows.map((r) => r.round.id));
      rounds.forEach((r, i) => {
        expect(r.prs.map((p) => p.n)).toEqual(rows[i].prs);
        for (const p of r.prs) expect(p.href).toBe(rows[i].unlinked.includes(p.n) ? undefined : prUrl(p.n));
      });
    });

    it(`shows every gate, the plan excerpt and only the numbers the snapshot carries (${locale})`, () => {
      expect(view("gates").engine?.gates?.map((g) => g.id)).toEqual(story.stations.gates.gates.map((g) => g.id));
      expect(view("agents").engine?.excerpt?.href.endsWith(story.stations.agents.excerpt.path)).toBe(true);
      // B1's Dashboard: the shared numbers less specs and plans (the Blueprint's ledger), then B1's own.
      const shared = dashboardTiles(facts, 5).map((t) => t.id).filter((id) => id !== "specs" && id !== "plans");
      expect(view("dashboard").engine?.tiles?.map((t) => t.id)).toEqual([...shared, ...b1DashboardTiles(facts).map((t) => t.id)]);
      expect(view("dashboard").engine?.tiles?.find((t) => t.id === "floors")?.value).toBe("5");
    });

    it(`adds B1's own layer: the decision log, the plan ledger, the dropped plans and Ask's numbers (${locale})`, () => {
      const log = facts.log!;
      const agents = view("agents").sections ?? [];
      const decisions = agents.find((s) => s.chips && s.title === (locale === "en" ? "Decision Log" : "Log Keputusan"));
      expect(decisions?.chips).toHaveLength(log.decisions.areas.length);
      const latest = agents.find((s) => s.items?.length === log.decisions.latest.length)?.items ?? [];
      expect(latest.map((i) => i.href)).toEqual(log.decisions.latest.map((d) => repoFileUrl(`docs/decisions/${d.file}`)));
      expect(latest.every((i) => i.external && i.title.length > 0)).toBe(true);
      expect(view("blueprint").engine?.tiles?.map((t) => t.id)).toEqual(["plansShipped", "plansInProgress", "plansDropped", "specs"]);
      expect(view("blueprint").sections?.some((s) => s.items?.length === log.plans.latest.length)).toBe(true);
      expect(view("rejected").sections?.[0]?.items?.map((i) => i.title)).toEqual(log.plans.droppedPlans.map((p) => p.title));
      expect(view("brain").engine?.tiles?.map((t) => t.id)).toEqual(["golden", "passMark", "promptDate", "packKb"]);
      expect(view("brain").engine?.tiles?.[0]?.value).toBe(String(facts.ask!.golden));
    });
  }
});

describe("the B1-only layer stays off /build", () => {
  it("never reads the decision log, the plan ledger, Ask's numbers or the activity from the Classic build page", () => {
    const files = [
      ...readdirSync("src/components/build").map((f) => path.join("src/components/build", f)),
      ...readdirSync("src/app/[locale]/build").map((f) => path.join("src/app/[locale]/build", f)),
      "src/lib/build-page.ts",
    ].filter((f) => /\.tsx?$/.test(f));
    for (const file of files) expect(readFileSync(file, "utf8"), file).not.toMatch(/\.(?:log|ask|activity)\b|b1DashboardTiles|perfFiles/);
  });
});

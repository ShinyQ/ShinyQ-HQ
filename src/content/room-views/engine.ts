import { createTranslator } from "next-intl";
import { DIAGRAM_PRESETS, drawnDiagram, layoutArchitecture } from "@/components/diagram/layout";
import { diagramSummary, diagramTexts, resolveArchitecture } from "@/components/diagram/text";
import { dashboardTiles, prUrl, repoFileUrl, roundDates, timelineRows } from "@/lib/build-page";
import { PUBLIC_FLOORS } from "@/lib/floors";
import { formatDate, intlLocale } from "@/lib/format";
import { STATION_IDS, type StationId, getBuildFacts, getBuildStory } from "../build-story";
import type { Architecture, Locale, LocalizedText } from "../schema";
import { chain, messages, single } from "./shared";
import type { RoomEngine, RoomSection, RoomView } from "./types";

type StationContent = { engine: Omit<RoomEngine, "station" | "labels">; sections: RoomSection[] };

/**
 * B1 Engine Room: one drawer per station from the build story (`content/build-story.json`) and the build-time
 * snapshot (`content/generated/build-facts.json`), through the same helpers as the Classic page
 * (`src/lib/build-page.ts`), so a number is shown only when the snapshot carries it. The eighth view, the Reactor
 * (`B1:reactor`), explains the live core; its numbers come from the B1 feed in the drawer (no Classic page).
 */
/** Laid-out station diagrams per locale and diagram: the layout search is the costly part, and the content is static per build. */
const DIAGRAMS = new Map<string, NonNullable<RoomEngine["diagram"]>>();

export function buildEngineViews(locale: Locale): RoomView[] {
  const m = messages(locale);
  const t = createTranslator({ locale, messages: m, namespace: "build" });
  const tCommon = createTranslator({ locale, messages: m, namespace: "common" });
  const tLabs = createTranslator({ locale, messages: m, namespace: "labs" });
  const tDiagram = createTranslator({ locale, messages: m, namespace: "diagram" });
  const story = getBuildStory();
  const facts = getBuildFacts();
  const number = new Intl.NumberFormat(intlLocale(locale));
  const date = formatDate(facts.generatedAt, locale);
  const snapshot = facts.commit ? t("snapshot", { date, commit: facts.commit }) : t("snapshotDate", { date });
  const labels: RoomEngine["labels"] = {
    before: t("before"),
    after: t("after"),
    budget: t("budget"),
    blocksMerge: t("blocksMerge"),
    reportsOnly: t("reportsOnly"),
    inProgress: t("inProgress"),
    excerpt: t("excerpt"),
    source: t("excerptSource"),
    hourly: t("hourly"),
    uptime: t("tiles.uptime"),
    visits: t("tiles.visits"),
    newTab: tCommon("external"),
    tried: t("tried"),
    whyDropped: t("whyDropped"),
  };
  const shot = (s: { src: string; width: number; height: number; alt: LocalizedText }) => ({ src: s.src, width: s.width, height: s.height, alt: s.alt[locale] });
  const { blueprint, agents, gates, brain, rejected } = story.stations;
  const hidden = new Set(story.stations.timeline.unlinkedPrs ?? []);
  const nodeTexts = diagramTexts(locale, (kind) => tLabs(`nodeKind.${kind}`));
  const diagram = (raw: Architecture): NonNullable<RoomEngine["diagram"]> => {
    const key = `${locale}:${JSON.stringify(raw)}`;
    const cached = DIAGRAMS.get(key);
    if (cached) return cached;
    const architecture = resolveArchitecture(raw, locale);
    const drawn = {
      layout: drawnDiagram(layoutArchitecture(architecture, nodeTexts, DIAGRAM_PRESETS.phone)),
      wide: drawnDiagram(layoutArchitecture(architecture, nodeTexts, DIAGRAM_PRESETS.drawer)),
      label: diagramSummary(architecture, { flow: (from, to) => tDiagram("flow", { from, to }), async: tDiagram("async"), summary: (count, flows) => tDiagram("summary", { count, flows }) }),
    };
    DIAGRAMS.set(key, drawn);
    return drawn;
  };

  const ones = (items: readonly unknown[]) => items.map(() => 1);
  const rows = timelineRows(story, facts);
  const busiest = Math.max(1, ...rows.map((r) => r.prs.length));
  const open = rows.findIndex((r) => r.open);
  const tileValues = dashboardTiles(facts, PUBLIC_FLOORS.length);
  const top = Math.log10(1 + Math.max(1, ...tileValues.map((tile) => tile.value)));
  const gateLevel = { ci: 1, nightly: 0.66, local: 0.33 } as const;
  const round2 = (x: number) => Math.round(x * 100) / 100;

  const content: Record<StationId, StationContent> = {
    blueprint: {
      engine: { diagram: diagram(blueprint.architecture), holo: { levels: ones(PUBLIC_FLOORS) } },
      sections: [{ title: t("howItRuns"), bullets: blueprint.steps.map((s) => s[locale]) }],
    },
    timeline: {
      engine: {
        holo: { levels: rows.map((r) => round2(r.prs.length / busiest)), ...(open >= 0 ? { mark: open } : {}) },
        rounds: rows.map(({ round, prs, unlinked, first, last, open }) => ({
          id: round.id,
          heading: t("round", { n: round.number }),
          dates: roundDates({ first, last }, locale, t("dateTo")),
          title: round.title[locale],
          summary: round.summary[locale],
          open,
          count: prs.length > 0 ? t("prCount", { count: prs.length }) : undefined,
          listLabel: t("prList", { n: round.number }),
          prs: prs.map((n) => (unlinked.includes(n) ? { n } : { n, href: prUrl(n) })),
          ...(round.shots ? { shots: { before: shot(round.shots.before), after: shot(round.shots.after), caption: round.shots.caption[locale] } } : {}),
        })),
      },
      sections: [{ body: t("prHint") }],
    },
    agents: {
      engine: { excerpt: { text: agents.excerpt.text, href: repoFileUrl(agents.excerpt.path) }, holo: { levels: ones(agents.tools) } },
      sections: [
        { title: t("loop"), bullets: agents.steps.map((s) => `${s.title[locale]}: ${s.text[locale]}`) },
        { title: t("tools"), chips: [...agents.tools] },
      ],
    },
    gates: {
      engine: {
        gates: gates.gates.map((g) => ({ id: g.id, title: g.title[locale], text: g.text[locale], budget: g.budget[locale], required: g.required })),
        holo: { levels: gates.gates.map((g) => gateLevel[g.where]) },
      },
      sections: [],
    },
    dashboard: {
      engine: {
        // The tower's public floor count (B1 stays a secret here too).
        holo: { levels: tileValues.map((tile) => round2(Math.log10(1 + tile.value) / top)) },
        tiles: tileValues.map((tile) => {
          const value = number.format(tile.value);
          return { id: tile.id, value: tile.unit === "kb" ? t("kb", { value }) : value, label: t(`tiles.${tile.id}`, { date: tile.since ? formatDate(tile.since, locale) : "" }) };
        }),
      },
      sections: [],
    },
    brain: {
      engine: { diagram: diagram(brain.architecture), holo: { levels: ones(brain.steps) } },
      sections: [{ title: t("steps"), bullets: brain.steps.map((s) => `${s.title[locale]}: ${s.text[locale]}`) }],
    },
    rejected: {
      engine: {
        holo: { levels: ones(rejected.ideas) },
        // A pull request whose diff shows text the site hides (`unlinkedPrs`) stays plain text, as on the timeline.
        ideas: rejected.ideas.map(({ id, title, tried, reason, pr }) => ({
          id,
          title: title[locale],
          tried: tried[locale],
          reason: reason[locale],
          ...(pr === undefined ? {} : { pr: hidden.has(pr) ? { n: pr } : { n: pr, href: prUrl(pr) } }),
        })),
      },
      sections: [],
    },
  };

  // Plain strings (no placeholders), read as they are.
  const r = m.build.reactor;
  const reactor = single({
    id: "B1:reactor",
    kind: "engine",
    title: r.title,
    subtitle: r.subtitle,
    badges: [{ label: "B1", accent: "amber" }],
    accent: "amber",
    sections: [{ title: r.howItReads, bullets: [r.segments, r.flash, r.sparks, r.pulse, r.idle] }, { body: r.polls }],
    engine: {
      station: "reactor",
      labels,
      reactor: { labels: { live: r.live, running: r.running, done: r.done, failed: r.failed, agents: r.agents, deploy: r.deploy, noDeploy: r.noDeploy, visits: r.visits, asks: r.asks, offline: r.offline } },
    },
  });

  return chain([
    ...STATION_IDS.map((id) =>
      single({
        id: `B1:${id}`,
        kind: "engine",
        title: story.stations[id].title[locale],
        subtitle: story.stations[id].summary[locale],
        meta: [snapshot],
        badges: [{ label: "B1", accent: "amber" }],
        accent: "amber",
        sections: content[id].sections,
        page: `/build#${id}`,
        engine: { station: id, labels, ...content[id].engine },
      }),
    ),
    reactor,
  ]);
}

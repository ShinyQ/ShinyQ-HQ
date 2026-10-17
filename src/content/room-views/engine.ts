import { createTranslator } from "next-intl";
import { DIAGRAM_PRESETS, drawnDiagram, layoutArchitecture } from "@/components/diagram/layout";
import { diagramSummary, diagramTexts } from "@/components/diagram/text";
import { ENGINE_STATIONS, engineRoom, type EngineStationId } from "@/experience/floors/engine/layout";
import { dashboardTiles, prUrl, repoFileUrl, roundDates, timelineRows } from "@/lib/build-page";
import { PUBLIC_FLOORS } from "@/lib/floors";
import { formatDate, intlLocale } from "@/lib/format";
import { getBuildFacts, getBuildStory } from "../build-story";
import type { Locale, LocalizedText } from "../schema";
import { chain, messages, single } from "./shared";
import type { RoomEngine, RoomSection, RoomView } from "./types";

type StationContent = { engine: Omit<RoomEngine, "station" | "labels">; sections: RoomSection[] };

/**
 * B1 Engine Room: one drawer per station from the build story (`content/build-story.json`) and the build-time
 * snapshot (`content/generated/build-facts.json`), through the same helpers as the Classic page
 * (`src/lib/build-page.ts`), so a number is shown only when the snapshot carries it.
 */
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
  };
  const shot = (s: { src: string; width: number; height: number; alt: LocalizedText }) => ({ src: s.src, width: s.width, height: s.height, alt: s.alt[locale] });
  const { blueprint, agents, gates } = story.stations;

  const content: Record<EngineStationId, StationContent> = {
    blueprint: {
      engine: {
        diagram: {
          layout: drawnDiagram(layoutArchitecture(blueprint.architecture, diagramTexts(locale, (kind) => tLabs(`nodeKind.${kind}`)), DIAGRAM_PRESETS.phone)),
          label: diagramSummary(blueprint.architecture, { flow: (from, to) => tDiagram("flow", { from, to }), async: tDiagram("async"), summary: (count, flows) => tDiagram("summary", { count, flows }) }),
        },
      },
      sections: [{ title: t("howItRuns"), bullets: blueprint.steps.map((s) => s[locale]) }],
    },
    timeline: {
      engine: {
        rounds: timelineRows(story, facts).map(({ round, prs, unlinked, first, last, open }) => ({
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
      engine: { excerpt: { text: agents.excerpt.text, href: repoFileUrl(agents.excerpt.path) } },
      sections: [
        { title: t("loop"), bullets: agents.steps.map((s) => `${s.title[locale]}: ${s.text[locale]}`) },
        { title: t("tools"), chips: [...agents.tools] },
      ],
    },
    gates: {
      engine: { gates: gates.gates.map((g) => ({ id: g.id, title: g.title[locale], text: g.text[locale], budget: g.budget[locale], required: g.required })) },
      sections: [],
    },
    dashboard: {
      engine: {
        // The tower's public floor count (B1 stays a secret here too).
        tiles: dashboardTiles(facts, PUBLIC_FLOORS.length).map((tile) => {
          const value = number.format(tile.value);
          return { id: tile.id, value: tile.unit === "kb" ? t("kb", { value }) : value, label: t(`tiles.${tile.id}`, { date: tile.since ? formatDate(tile.since, locale) : "" }) };
        }),
      },
      sections: [],
    },
  };

  return chain(
    ENGINE_STATIONS.map((id) =>
      single({
        id: engineRoom(id),
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
  );
}

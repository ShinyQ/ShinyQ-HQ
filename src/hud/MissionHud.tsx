"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { isAskEnabled } from "@/ask/status";
import type { Locale, RoomId } from "@/content/schema";
import type { MissionHost, PaletteFilter } from "@/experience/missions/host";
import { roomFromPath } from "@/experience/missions/rooms";
import { createMissionRunner, type MissionRunner } from "@/experience/missions/runner";
import { registerRunner, resolveHost, visitedRooms, type HostDeps } from "@/experience/missions/bridge";
import { createStaticHost } from "@/experience/missions/staticHost";
import { REACTOR_ROOM } from "@/experience/floors/labs/techHash";
import { TOPICS_ROOM } from "@/experience/floors/library/topicHash";
import { setSearchParams } from "@/components/page/urlState";
import { audio } from "@/lib/audio";
import type { MotionPref } from "@/lib/motion";
import { getHQStore } from "@/store/useHQStore";
import { CommandPalette } from "./CommandPalette";
import { useHintsOn, useTutorialAvailable } from "./dialog/hooks";
import { hintsOn, setHintsOn } from "./dialog/storage";
import { replayTutorial } from "./dialog/tutorial";
import { requestAskStatus, useAskStatus } from "./ask/availability";
import { onHudCommand, openAsk, openCv } from "./events";
import type { HudIndex } from "./index-data";
import { useHudIndex } from "./index-client";
import type { PaletteActionId, PaletteEntry } from "./palette-types";
import { pushRecent, readRecent } from "./recent";
import { RoverTerminal, markTerminalSeen, type TerminalExtra } from "./RoverTerminal";
import { buildPaletteEntries } from "./search";
import { orderTerminalMissions } from "./terminal";

const VISITS_KEY = "hq:visits";
const MIN_TOAST_MS = 2400;
const STATIC_ACTIONS: readonly PaletteActionId[] = ["view-cv", "copy-email", "toggle-language", "quick-view", "motion-system", "motion-full", "motion-reduced"];
const MOTION_ACTIONS: Partial<Record<PaletteActionId, MotionPref>> = { "motion-system": "system", "motion-full": "full", "motion-reduced": "reduced" };
/** Only while the 3D HUD is open (its OnboardingLayer hosts the replay). */
const TUTORIAL_ACTIONS: readonly PaletteActionId[] = ["replay-tutorial", "toggle-hints"];

export interface MissionHudProps {
  locale: Locale;
  /** Content hash of the static index file (`hudIndexVersion`); the HUD fetches it after hydration. */
  indexVersion?: string;
  /** Preloaded index (tests); skips the fetch. */
  index?: HudIndex;
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/** Counts visits once per browser session; drives the best-swe / best-ai alternation. */
function countVisit(): number {
  try {
    const current = Number(localStorage.getItem(VISITS_KEY) ?? "0") || 0;
    if (sessionStorage.getItem(VISITS_KEY)) return Math.max(0, current - 1);
    sessionStorage.setItem(VISITS_KEY, "1");
    localStorage.setItem(VISITS_KEY, String(current + 1));
    return current;
  } catch {
    return 0;
  }
}

/**
 * Missions HUD for the static pages: wires the Rover Terminal and the command palette to the
 * mission runner through the static host (route navigation). The 3D experience can reuse the
 * terminal and palette with its own `MissionHost`. The terminal never opens on its own over the
 * Page View (it would cover the landing); only the 3D Lobby opens it, after the intro (Director).
 */
export function MissionHud({ locale, indexVersion, index: preloaded }: MissionHudProps) {
  const { index, settled } = useHudIndex(indexVersion, preloaded);
  const t = useTranslations("hud.status");
  const router = useRouter();
  const pathname = usePathname();
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [filter, setFilter] = useState<PaletteFilter | null>(null);
  const [recent, setRecent] = useState<RoomId[]>([]);
  const [visit, setVisit] = useState(0);
  const [toast, setToast] = useState<{ text: string; ms: number; id: number } | null>(null);
  // Ask the HQ: the status is fetched on idle by the dock, or now when the terminal or the palette opens.
  const askEnabled = isAskEnabled(useAskStatus());
  const tutorial = useTutorialAvailable();
  const hints = useHintsOn();
  const tMenu = useTranslations("dialog.menu");

  const loadAskStatus = useCallback(() => {
    void requestAskStatus();
  }, []);

  const say = useCallback((text: string, ms = MIN_TOAST_MS) => {
    setToast({ text, ms: Math.max(ms, MIN_TOAST_MS), id: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return;
    // The clock starts once the toast has painted (the frame after the next one), so a long task right
    // after the action (a slow device restyling the page) cannot use up its time before anyone sees it.
    let timer = 0;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        timer = window.setTimeout(() => setToast(null), toast.ms);
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [toast]);

  const showTerminal = useCallback(() => {
    markTerminalSeen();
    loadAskStatus();
    setPaletteOpen(false);
    setTerminalOpen(true);
  }, [loadAskStatus]);

  const showPalette = useCallback(
    (next: PaletteFilter | null = null) => {
      loadAskStatus();
      setRecent(readRecent());
      setFilter(next);
      setTerminalOpen(false);
      setPaletteOpen(true);
    },
    [loadAskStatus],
  );

  const runner: MissionRunner | null = useMemo(() => {
    if (!index) return null;
    const deps: HostDeps = {
      locale,
      rooms: index.rooms,
      navigate: (href) => router.push(href),
      say: (text, ms) => say(text, ms),
      openPalette: (next) => showPalette(next ?? null),
    };
    const staticHost = createStaticHost({ ...deps, onSay: deps.say, onPalette: deps.openPalette });
    // The 3D experience registers its own host while it is open (see missions/bridge.ts).
    const current = () => resolveHost(deps, staticHost);
    const host: MissionHost = {
      get isStatic() {
        return current().isStatic;
      },
      elevator: (floor, ctx) => current().elevator(floor, ctx),
      driveTo: (target, ctx) => current().driveTo(target, ctx),
      openRoom: (room, tab, ctx) => current().openRoom(room, tab, ctx),
      say: (text, ms, ctx) => current().say(text, ms, ctx),
      openPalette: (filter, ctx) => current().openPalette(filter, ctx),
      finish: (status, id) => current().finish?.(status, id),
    };
    return createMissionRunner({ host, missions: index.missions, rooms: index.rooms, visited: () => visitedRooms() ?? readRecent() });
  }, [locale, index, router, say, showPalette]);

  useEffect(() => (runner ? registerRunner(runner) : undefined), [runner]);

  // The HUD is in the locale layout, so it marks the page as hydrated once its index has loaded (or
  // failed to), so the palette and terminal are complete. The Next.js chunks load after the first paint
  // (scripts/defer-scripts.ts), so `load` no longer implies it; e2e tests wait for this attribute
  // (`openPage` in e2e/hq.ts).
  useEffect(() => {
    if (settled) document.documentElement.setAttribute("data-hydrated", "");
  }, [settled]);

  const entries = useMemo(
    () => (index ? buildPaletteEntries(index, tutorial ? [...STATIC_ACTIONS, ...TUTORIAL_ACTIONS] : STATIC_ACTIONS) : []),
    [index, tutorial],
  );
  const extras = useMemo<TerminalExtra[]>(
    () =>
      tutorial
        ? [
            {
              key: "r",
              label: tMenu("replay"),
              onSelect: () => {
                setTerminalOpen(false);
                replayTutorial();
              },
            },
            { key: "h", label: hints ? tMenu("hintsOn") : tMenu("hintsOff"), onSelect: () => setHintsOn(!hints) },
          ]
        : [],
    [tutorial, hints, tMenu],
  );
  const terminalMissions = useMemo(() => (index ? orderTerminalMissions(index.missions, visit) : []), [index, visit]);

  // Visit counter, HUD commands and global shortcuts.
  useEffect(() => {
    const visitTimer = window.setTimeout(() => setVisit(countVisit()), 0);
    const offCommand = onHudCommand((command) => {
      if (command.type === "terminal") showTerminal();
      else if (command.type === "palette") showPalette(command.filter ?? null);
      else {
        // The Ask dock (src/hud/ask/AskDock.tsx) takes the question; close what would cover it.
        setTerminalOpen(false);
        setPaletteOpen(false);
      }
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => {
          if (!open) {
            loadAskStatus();
            setRecent(readRecent());
            setFilter(null);
            setTerminalOpen(false);
          }
          return !open;
        });
        return;
      }
      if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey && !isEditable(event.target) && !document.querySelector("[role='dialog'][aria-modal='true']")) {
        event.preventDefault();
        showPalette();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(visitTimer);
      offCommand();
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [showTerminal, showPalette, loadAskStatus]);

  // Remember rooms whose page was opened (palette "Recent", surprise skips them).
  useEffect(() => {
    if (!index) return;
    const local = pathname.replace(/^\/(en|id)(?=\/|$)/, "") || "/";
    const room = roomFromPath(local, index.rooms);
    if (room && room.kind !== "lobby") pushRecent(room.id);
  }, [pathname, index]);

  const runAction = async (action: PaletteActionId) => {
    switch (action) {
      case "view-cv":
        openCv();
        return;
      case "copy-email":
        if (!index) return;
        try {
          await navigator.clipboard.writeText(index.email);
          say(t("copied"));
        } catch {
          say(t("copyFailed", { email: index.email }), 6000);
        }
        return;
      case "toggle-language": {
        const other: Locale = locale === "en" ? "id" : "en";
        try {
          localStorage.setItem("hq:locale", other);
        } catch {
          // The link still works without remembering the choice.
        }
        const rest = pathname.replace(/^\/(en|id)(?=\/|$)/, "");
        router.push(`/${other}${rest}${window.location.hash}`);
        return;
      }
      case "quick-view":
        router.push(`/${locale}/quick`);
        return;
      case "toggle-sound":
        audio.toggleMuted();
        return;
      case "replay-tutorial":
        replayTutorial();
        return;
      case "toggle-hints": {
        const next = !hintsOn();
        setHintsOn(next);
        say(next ? tMenu("hintsOn") : tMenu("hintsOff"));
        return;
      }
      case "motion-system":
      case "motion-full":
      case "motion-reduced":
        getHQStore().getState().setMotion(MOTION_ACTIONS[action]!);
        if (index) say(index.actionLabels[action][locale]);
        return;
    }
  };

  const onSelect = (entry: PaletteEntry) => {
    const target = entry.target;
    if (!runner) return;
    switch (target.type) {
      case "mission":
        void runner.start(target.id);
        return;
      case "room":
        void runner.goTo(target.id);
        return;
      case "year":
        void runner.runSteps(`year:${target.year}`, [
          { kind: "elevator", floor: "L2" },
          { kind: "drive", to: target.room },
        ]);
        return;
      case "action":
        void runAction(target.id);
        return;
      case "ask":
        setPaletteOpen(false);
        openAsk(target.q, { source: "palette" });
        return;
      case "tech": {
        const tech = index?.techs.find((t) => t.slug === target.slug);
        if (!tech) return;
        // In the 3D tower: pick the tech (its pods light up) and ride to the Tech Reactor. On the
        // Classic site: the Work page filtered by that stack.
        if (document.documentElement.hasAttribute("data-hq")) {
          getHQStore().getState().selectReactorTech({ slug: tech.slug, name: tech.name, ring: tech.ring, count: tech.pods.length, pods: tech.pods });
          void runner.goTo(REACTOR_ROOM);
        } else {
          router.push(`/${locale}/labs?stack=${encodeURIComponent(tech.name)}#all-projects`);
        }
        return;
      }
      case "wing": {
        const wing = index?.wings.find((w) => w.wing === target.wing);
        // In the 3D tower: ride to L3 and drive to the wing's directory panel. On the Classic site: the
        // Work page filtered by that wing.
        if (wing?.stop && document.documentElement.hasAttribute("data-hq")) {
          void runner.runSteps(`wing:${wing.wing}`, [
            { kind: "elevator", floor: "L3" },
            { kind: "drive", to: wing.stop },
          ]);
        } else {
          router.push(`/${locale}/labs?wing=${target.wing}#all-projects`);
        }
        return;
      }
      case "topic": {
        const topic = index?.topics.find((t) => t.slug === target.slug);
        if (!topic) return;
        // In the 3D tower: pick the topic (its stations light up) and ride to the Topic Constellation. On
        // the Classic site: the Writing page filtered by that topic.
        if (document.documentElement.hasAttribute("data-hq")) {
          getHQStore().getState().selectTopic({ slug: topic.slug, name: topic.label[locale], count: topic.count, rooms: topic.rooms });
          void runner.goTo(TOPICS_ROOM);
        } else if (window.location.pathname.replace(/\/$/, "") === `/${locale}/library`) {
          // Already on the Writing page: a soft push would not tell the filter island, so set the param in place.
          setSearchParams({ topic: topic.slug });
          document.getElementById("topics")?.scrollIntoView({ block: "start" });
        } else {
          router.push(`/${locale}/library?topic=${topic.slug}#topics`);
        }
        return;
      }
    }
  };

  return (
    <>
      <RoverTerminal
        open={terminalOpen}
        locale={locale}
        missions={terminalMissions}
        ask={askEnabled}
        extras={extras}
        onAsk={() => {
          setTerminalOpen(false);
          openAsk(undefined, { source: "terminal" });
        }}
        onRun={(id) => {
          setTerminalOpen(false);
          void runner?.start(id);
        }}
        onClose={() => setTerminalOpen(false)}
      />
      <CommandPalette
        open={paletteOpen}
        locale={locale}
        entries={entries}
        recent={recent}
        filter={filter}
        ask={askEnabled}
        onFilterChange={setFilter}
        onSelect={onSelect}
        onClose={() => setPaletteOpen(false)}
      />
      <div role="status" aria-live="polite" className="no-print pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 pb-[env(safe-area-inset-bottom)]">
        {toast && (
          <p key={toast.id} className="rounded-lg border border-terminal-fg/40 bg-terminal-bg px-4 py-2 font-mono text-[13px] leading-5 text-terminal-fg shadow-[0_0_24px_rgb(52_211_153/0.2)]">
            <span aria-hidden="true">&gt; </span>
            {toast.text}
          </p>
        )}
      </div>
    </>
  );
}

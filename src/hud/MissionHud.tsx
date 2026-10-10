"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Locale, RoomId } from "@/content/schema";
import type { MissionHost, PaletteFilter } from "@/experience/missions/host";
import { roomFromPath } from "@/experience/missions/rooms";
import { createMissionRunner, type MissionRunner } from "@/experience/missions/runner";
import { isAutoOpenClaimed, registerRunner, resolveHost, visitedRooms, type HostDeps } from "@/experience/missions/bridge";
import { createStaticHost } from "@/experience/missions/staticHost";
import { audio } from "@/lib/audio";
import { cvDownloadName, cvPdfPath } from "@/lib/cv";
import { CommandPalette } from "./CommandPalette";
import { onHudCommand } from "./events";
import type { HudIndex } from "./index-data";
import type { PaletteActionId, PaletteEntry } from "./palette-types";
import { pushRecent, readRecent } from "./recent";
import { RoverTerminal, markTerminalSeen, shouldAutoOpenTerminal } from "./RoverTerminal";
import { buildPaletteEntries } from "./search";
import { orderTerminalMissions } from "./terminal";

const VISITS_KEY = "hq:visits";
const AUTO_OPEN_DELAY_MS = 600;
const MIN_TOAST_MS = 2400;
const STATIC_ACTIONS: readonly PaletteActionId[] = ["download-cv", "copy-email", "toggle-language", "quick-view"];

export interface MissionHudProps {
  locale: Locale;
  index: HudIndex;
  /** Auto-open the Rover Terminal on the first visit. Static pages enable it on the Lobby only. */
  autoOpenOnLobby?: boolean;
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
 * terminal and palette with its own `MissionHost`.
 */
export function MissionHud({ locale, index, autoOpenOnLobby = true }: MissionHudProps) {
  const t = useTranslations("hud.status");
  const router = useRouter();
  const pathname = usePathname();
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [filter, setFilter] = useState<PaletteFilter | null>(null);
  const [recent, setRecent] = useState<RoomId[]>([]);
  const [visit, setVisit] = useState(0);
  const [toast, setToast] = useState<{ text: string; ms: number; id: number } | null>(null);

  const say = useCallback((text: string, ms = MIN_TOAST_MS) => {
    setToast({ text, ms: Math.max(ms, MIN_TOAST_MS), id: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), toast.ms);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const showTerminal = useCallback(() => {
    markTerminalSeen();
    setPaletteOpen(false);
    setTerminalOpen(true);
  }, []);

  const showPalette = useCallback((next: PaletteFilter | null = null) => {
    setRecent(readRecent());
    setFilter(next);
    setTerminalOpen(false);
    setPaletteOpen(true);
  }, []);

  const runner: MissionRunner = useMemo(() => {
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

  useEffect(() => registerRunner(runner), [runner]);

  // The HUD is in the locale layout, so its first effect marks the page as hydrated. The Next.js
  // chunks load after the first paint (scripts/defer-scripts.ts), so `load` no longer implies it;
  // e2e tests wait for this attribute (`openPage` in e2e/hq.ts).
  useEffect(() => {
    document.documentElement.setAttribute("data-hydrated", "");
  }, []);

  const entries = useMemo(() => buildPaletteEntries(index, STATIC_ACTIONS), [index]);
  const terminalMissions = useMemo(() => orderTerminalMissions(index.missions, visit), [index.missions, visit]);

  // Visit counter, first-visit auto-open on the Lobby, HUD commands and global shortcuts.
  useEffect(() => {
    const visitTimer = window.setTimeout(() => setVisit(countVisit()), 0);
    const autoTimer =
      autoOpenOnLobby && pathname === `/${locale}` && shouldAutoOpenTerminal()
        ? window.setTimeout(() => {
            // In 3D the terminal opens after the intro instead (Director).
            if (!isAutoOpenClaimed()) showTerminal();
          }, AUTO_OPEN_DELAY_MS)
        : undefined;
    const offCommand = onHudCommand((command) => (command.type === "terminal" ? showTerminal() : showPalette(command.filter ?? null)));
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => {
          if (!open) {
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
      window.clearTimeout(autoTimer);
      offCommand();
      window.removeEventListener("keydown", onKeyDown);
    };
    // The auto-open check runs once per mount (first page view), not on every navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTerminal, showPalette]);

  // Remember rooms whose page was opened (palette "Recent", surprise skips them).
  useEffect(() => {
    const local = pathname.replace(/^\/(en|id)(?=\/|$)/, "") || "/";
    const room = roomFromPath(local, index.rooms);
    if (room && room.kind !== "lobby") pushRecent(room.id);
  }, [pathname, index.rooms]);

  const runAction = async (action: PaletteActionId) => {
    switch (action) {
      case "download-cv": {
        const link = document.createElement("a");
        link.href = cvPdfPath(index.cvFileName);
        link.download = cvDownloadName(index.cvFileName);
        document.body.append(link);
        link.click();
        link.remove();
        return;
      }
      case "copy-email":
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
    }
  };

  const onSelect = (entry: PaletteEntry) => {
    const target = entry.target;
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
    }
  };

  return (
    <>
      <RoverTerminal
        open={terminalOpen}
        locale={locale}
        missions={terminalMissions}
        onRun={(id) => {
          setTerminalOpen(false);
          void runner.start(id);
        }}
        onClose={() => setTerminalOpen(false)}
      />
      <CommandPalette
        open={paletteOpen}
        locale={locale}
        entries={entries}
        recent={recent}
        filter={filter}
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

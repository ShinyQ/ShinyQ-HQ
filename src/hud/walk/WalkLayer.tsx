"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { FloorId } from "@/content/schema";
import { WALK_FLOORS } from "@/experience/config";
import { intents } from "@/experience/input/intents";
import { cancelMission, runMissionSteps } from "@/experience/missions/bridge";
import { createWalk, markPromptSeen, promptSeen, type WalkController, type WalkDefinition, type WalkState } from "@/experience/missions/walk";
import { careerWalk, labsWalk, walkFloorsEnabled } from "@/experience/missions/walks";
import type { ExperienceData } from "@/experience/types";
import { useHQStore } from "@/store/useHQStore";
import { WalkBar, type WalkPlacement } from "./WalkBar";
import { WalkPrompt } from "./WalkPrompt";

/** Delay after arriving on a floor before the first-visit prompt shows (the ding and the camera settle). */
const PROMPT_DELAY_MS = 700;

function isEditable(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

/** Walk definitions for the floors that have one (labels resolved from messages). */
export function useWalkDefinitions(data: ExperienceData): Partial<Record<FloorId, WalkDefinition>> {
  const t = useTranslations("walk");
  const tc = useTranslations("common");
  const th = useTranslations("hud.career");
  return useMemo(
    () => ({
      L2: careerWalk(data.career, {
        types: { job: tc("type.job"), freelance: tc("type.freelance"), education: tc("type.education"), award: tc("type.award"), milestone: tc("type.milestone") },
        workshop: th("workshop"),
        workshopSub: t("workshopSub"),
      }),
      L3: labsWalk(data.labs.pods, { wings: data.labs.wings, more: t("more"), moreSub: t("moreSub") }),
    }),
    [data.career, data.labs, t, tc, th],
  );
}

/** Subscribes to a walk controller's state (null without a controller). */
export function useWalkState(walk: WalkController | null): WalkState | null {
  return useSyncExternalStore(
    (onChange) => {
      if (!walk) return () => {};
      const off = walk.subscribe(onChange);
      return () => void off();
    },
    () => walk?.state ?? null,
    () => null,
  );
}

/**
 * Guided walks in the 3D HUD: one controller per floor with a walk, the first-visit prompt, the
 * Walk HUD, `[` and `]` to step, and manual driving pausing the walk. Legs run as missions through
 * the active runner (missions/bridge.ts), so the rover follows the floor's road.
 */
export function WalkLayer({
  data,
  placement,
  coarse,
  hidden = false,
  onActive,
}: {
  data: ExperienceData;
  placement: WalkPlacement;
  coarse: boolean;
  /** Boot, intro and the hologram view own the screen: the walk keeps its state but draws nothing. */
  hidden?: boolean;
  onActive?: (active: boolean) => void;
}) {
  const t = useTranslations("walk");
  const definitions = useWalkDefinitions(data);
  const [enabled] = useState<readonly FloorId[]>(() => (typeof window === "undefined" ? WALK_FLOORS : walkFloorsEnabled(WALK_FLOORS, window.location.search)));
  const controllers = useMemo(() => {
    const out: Partial<Record<FloorId, WalkController>> = {};
    for (const [floor, def] of Object.entries(definitions) as [FloorId, WalkDefinition][]) {
      if (enabled.includes(floor) && def.stops.length) out[floor] = createWalk(def, { run: runMissionSteps, cancel: cancelMission });
    }
    return out;
  }, [definitions, enabled]);

  const floor = useHQStore((s) => s.floor);
  const exploring = useHQStore((s) => s.phase === "explore" && !s.ride && s.mission?.status !== "running");
  const walk = controllers[floor] ?? null;
  const state = useWalkState(walk);
  const active = Boolean(state && state.status !== "idle");
  const [prompt, setPrompt] = useState<FloorId | null>(null);

  const prompting = prompt === floor && !active;
  useEffect(() => onActive?.(active || prompting), [active, prompting, onActive]);

  // First visit to a floor with a walk: offer it once the rover is free to drive.
  useEffect(() => {
    if (!walk || !exploring || active || promptSeen(floor)) return;
    const timer = window.setTimeout(() => setPrompt(floor), PROMPT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [walk, exploring, active, floor]);

  const closePrompt = () => {
    if (prompt) markPromptSeen(prompt);
    setPrompt(null);
  };

  // Manual driving pauses the walk (the Director already cancels a running leg); `[` and `]` step.
  useEffect(() => {
    if (!walk) return;
    const offIntents = intents.on((intent) => {
      if (intent.type === "move" || intent.type === "goto" || intent.type === "scrub") {
        if (prompt) closePrompt();
        if (walk.state.status === "driving" || walk.state.status === "arrived") walk.pause();
      }
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "[" && event.key !== "]") return;
      if (event.metaKey || event.ctrlKey || event.altKey || isEditable(event.target)) return;
      // The room drawer is modal but the walk keeps stepping through it; other overlays own the keys.
      if (document.querySelector("[role='dialog'][aria-modal='true']:not([data-testid='room-drawer'])")) return;
      const status = walk.state.status;
      if (status !== "driving" && status !== "arrived" && status !== "paused") return;
      event.preventDefault();
      void (event.key === "]" ? walk.next() : walk.prev());
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      offIntents();
      window.removeEventListener("keydown", onKeyDown);
    };
    // closePrompt only reads `prompt`, which is a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walk, prompt]);

  if (!walk || !state || hidden) return null;
  if (prompting) {
    const saved = walk.saved();
    const resumeIndex = saved && !saved.done && saved.stop ? walk.stops().findIndex((s) => s.id === saved.stop) : -1;
    return (
      <WalkPrompt
        walkId={walk.definition.id}
        placement={placement}
        resumeAt={resumeIndex > 0 ? resumeIndex + 1 : null}
        onStart={() => {
          closePrompt();
          void walk.start({ restart: true });
        }}
        onResume={() => {
          closePrompt();
          void walk.start();
        }}
        onExplore={closePrompt}
      />
    );
  }
  return <WalkBar walk={walk} state={state} placement={placement} coarse={coarse} launcher={promptSeen(floor) ? t(`${walk.definition.id}.start`) : undefined} />;
}

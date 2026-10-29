"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { isContinuing, onContinuationChange } from "@/experience/introContinue";
import { roverRuntime } from "@/experience/rover/runtime";
import type { ExperienceData } from "@/experience/types";
import { getHQStore, useHQStore } from "@/store/useHQStore";
import { firstName } from "./names";
import type { OnboardingVariant, TourT } from "./onboarding";
import { markOnboarded, onboarded } from "./storage";
import { cancelAllDialogs, cancelDialog, say } from "./store";
import { loadTour } from "./tourChunk";
import { registerTutorial } from "./tutorial";

/** Pause after the intro hands over (or a deep link arrives) before Rover speaks. */
export const START_DELAY_MS = 600;

/**
 * Starts the first-session tour once per browser: in the Lobby right after the boot and intro
 * (full), or after a deep link has ridden on to its floor or room and the drawer is closed (short).
 * Replaces the old first-visit Rover Terminal auto-open. Also the host of "Replay the tutorial". The script is a lazy
 * chunk (`tourChunk.ts`), loaded only by a session that plays the tour or replays it.
 */
export function OnboardingLayer({ data }: { data: ExperienceData }) {
  const t = useTranslations("dialog.onboarding");
  const coarse = useHQStore((s) => s.device.coarse);
  const phone = useHQStore((s) => s.device.coarse && s.device.viewport === "mobile");
  const ready = useHQStore((s) => s.phase === "explore" && !s.ride);
  const [continuing, setContinuing] = useState(false);
  const deepLinked = useRef(false);
  const running = useRef(false);
  const name = firstName(data.profile.name);

  // The deep link target is set in Experience's layout effect, after this component rendered: sync on mount.
  useEffect(() => {
    const sync = () => {
      const now = isContinuing();
      if (now) deepLinked.current = true;
      setContinuing(now);
    };
    sync();
    return onContinuationChange(sync);
  }, []);

  const run = useCallback(
    async (variant: OnboardingVariant, replay: boolean) => {
      if (running.current) return;
      running.current = true;
      try {
        const tour = await loadTour();
        // A failed chunk: no tour this time, nothing marked, so a later session (or Replay) tries again.
        if (!tour) return;
        const outcome = await tour.runOnboarding({
          say,
          cancel: cancelDialog,
          copy: tour.onboardingCopy(t as unknown as TourT, name),
          coarse,
          phone,
          variant,
          waitForMove: (signal) => tour.waitForRoverMove(getHQStore(), signal),
          askAi: () => document.querySelector("[data-testid='hud'] [data-onboard='ask-ai']") !== null,
        });
        if (outcome !== "cancelled" && (!replay || !onboarded())) markOnboarded(outcome);
      } finally {
        running.current = false;
      }
    },
    [t, name, coarse, phone],
  );

  // A session that will play the tour fetches its chunk early (during the boot and intro); a returning visitor never does.
  useEffect(() => {
    if (!onboarded()) void loadTour();
  }, []);

  // "Replay the tutorial" (Settings, Cmd-K): stop whatever Rover says, then start over in full.
  useEffect(
    () =>
      registerTutorial(() => {
        cancelAllDialogs();
        window.setTimeout(() => void run("full", true), 0);
      }),
    [run],
  );

  useEffect(() => {
    if (!ready || continuing || running.current || onboarded()) return;
    let timer = 0;
    const attempt = () => {
      const s = getHQStore().getState();
      if (s.phase !== "explore" || onboarded() || running.current) return;
      // Let an arrival roll-on (FloorLayout.arrival) or a mission drive finish first, so the try-it step starts from rest.
      const pilot = roverRuntime.autopilot;
      if (s.mission?.status === "running" || (pilot && pilot.state !== "done")) {
        timer = window.setTimeout(attempt, START_DELAY_MS);
        return;
      }
      void run(s.floor === "L1" && !deepLinked.current ? "full" : "short", false);
    };
    timer = window.setTimeout(attempt, START_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [ready, continuing, run]);

  return null;
}

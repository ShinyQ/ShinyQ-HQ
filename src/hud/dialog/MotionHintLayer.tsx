"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { markMotionHintSeen, motionHintSeen } from "@/lib/motion";
import { getHQStore, useHQStore } from "@/store/useHQStore";
import { useOnboardingSettled } from "./hooks";
import { START_DELAY_MS } from "./OnboardingLayer";
import { say } from "./store";

/**
 * One-time Rover line when the OS asks for reduced motion and the Motion setting is still System
 * (Windows turns it on with "Animation effects" off): "Full motion" sets Full, "Keep reduced" or Esc
 * keeps it. Once per browser (`hq:motion-hint`), after the first-session tour, never in the boot or
 * intro (phase gate) and never on the Classic site (it lives in the 3D HUD).
 */
export function MotionHintLayer() {
  const t = useTranslations("dialog.motion");
  const settled = useOnboardingSettled();
  const due = useHQStore((s) => s.phase === "explore" && !s.ride && s.motion === "system" && s.systemReducedMotion);
  const asked = useRef(false);

  useEffect(() => {
    if (!due || !settled || asked.current || motionHintSeen()) return;
    const timer = window.setTimeout(async () => {
      const s = getHQStore().getState();
      if (asked.current || motionHintSeen() || s.phase !== "explore" || s.motion !== "system" || !s.systemReducedMotion) return;
      asked.current = true;
      const result = await say(
        {
          key: "motion-hint",
          text: t("ask"),
          choices: [
            { id: "full", label: t("full") },
            { id: "keep", label: t("keep"), cancel: true },
          ],
        },
        { id: "motion" },
      );
      // Cancelled (a tutorial replay cleared the queue): unanswered, so it may come back next visit.
      if (result.status === "cancelled") return;
      markMotionHintSeen();
      const full = result.choice === "full";
      if (full) getHQStore().getState().setMotion("full");
      void say({ key: full ? "motion-on" : "motion-kept", text: t(full ? "on" : "kept"), spotlight: "motion" }, { id: "motion" });
    }, START_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [due, settled, t]);

  return null;
}

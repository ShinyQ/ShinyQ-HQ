"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { FloorId } from "@/content/schema";
import { intents, type Intent } from "@/experience/input/intents";
import type { ExperienceData } from "@/experience/types";
import { useHQStore } from "@/store/useHQStore";
import { FLOOR_LINES, floorIntroLine } from "./floorIntro";
import { useOnboardingSettled } from "./hooks";
import { firstName } from "./onboarding";
import { floorIntroSeen, markFloorIntroSeen } from "./storage";
import { cancelDialog, say } from "./store";

/** Delay after arriving on a floor before its first-visit line (the ding and the camera settle). */
const PROMPT_DELAY_MS = 700;

/** Driving, a point-and-go action or a scrub means the visitor is busy: the floor line steps aside for good. */
const dismisses = (intent: Intent) => intent.type === "move" || intent.type === "interact" || intent.type === "scrub";

/**
 * First visit to L2, L3, L4 or RF: once the first-session tour is settled and the rover is free,
 * Rover says one line about the floor (`dialog.floor.<id>`). A finished or skipped line is
 * remembered (`hq:floor-intro`); a cancelled one shows again on the next visit.
 */
export function FloorIntroLayer({ data }: { data: ExperienceData }) {
  const tFloor = useTranslations("dialog.floor");
  const name = firstName(data.profile.name);
  const settled = useOnboardingSettled();
  const floor = useHQStore((s) => s.floor);
  const exploring = useHQStore((s) => s.phase === "explore" && !s.ride && s.mission?.status !== "running");
  const [prompt, setPrompt] = useState<FloorId | null>(null);
  const showing = prompt === floor;

  // Pending: wait for the rover to settle on a floor whose line was not spoken yet.
  useEffect(() => {
    if (showing || !exploring || !settled || !FLOOR_LINES.includes(floor) || floorIntroSeen(floor)) return;
    const timer = window.setTimeout(() => setPrompt(floor), PROMPT_DELAY_MS);
    const off = intents.on((intent) => {
      if (!dismisses(intent)) return;
      markFloorIntroSeen(floor);
      window.clearTimeout(timer);
      off();
    });
    return () => {
      window.clearTimeout(timer);
      off();
    };
  }, [showing, exploring, settled, floor]);

  // Showing: one line, no choices.
  useEffect(() => {
    if (!showing) return;
    const id = `floor:${floor}`;
    let live = true;
    const done = () => {
      live = false;
      setPrompt(null);
    };
    void say(floorIntroLine(tFloor(floor, { name })), { id }).then((result) => {
      if (!live) return;
      // Cancelled from elsewhere (a tutorial replay): not seen, so the line waits for its next chance.
      if (result.status !== "cancelled") markFloorIntroSeen(floor);
      done();
    });
    const off = intents.on((intent) => {
      if (!dismisses(intent) || !live) return;
      markFloorIntroSeen(floor);
      done();
      cancelDialog(id);
    });
    return () => {
      live = false;
      off();
      cancelDialog(id);
    };
  }, [showing, floor, name, tFloor]);

  return null;
}

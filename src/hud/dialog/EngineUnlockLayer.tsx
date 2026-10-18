"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { b1FromHash, floorProgress } from "@/experience/b1";
import { audio } from "@/lib/audio";
import { getHQStore, useHQStore } from "@/store/useHQStore";
import { useOnboardingSettled } from "./hooks";
import * as dialog from "./store";

const MOMENT = "b1-unlock";

/**
 * B1 Engine Room unlock (spec section 2): once the fifth public floor is reached (store `b1Moment`), a chime and
 * Rover's offer, "Take me there" (rides to B1) or "Later"; the elevator rows pulse meanwhile (FloorButtons). A
 * cancelled line comes back at the next chance; a ride or the tour first waits. A locked visitor who followed
 * `/{locale}#B1` hears how to unlock it. Renders nothing. Strings live in the 3D-only `engine` namespace.
 */
export function EngineUnlockLayer() {
  const t = useTranslations("engine");
  const moment = useHQStore((s) => s.b1Moment);
  const free = useHQStore((s) => s.phase === "explore" && s.ride === null);
  const settled = useOnboardingSettled();

  useEffect(() => {
    if (!b1FromHash(undefined, window.location.hash)) return;
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
    const s = getHQStore().getState();
    if (s.b1Unlocked) return;
    const { seen, total } = floorProgress(s.floorsSeen);
    void dialog.say({ key: "b1-locked", text: t("lockedLine", { seen, total }), face: "thinking" }, { id: "b1-locked" });
  }, [t]);

  useEffect(() => {
    if (!moment || !free || !settled) return;
    let live = true;
    audio.play("chime");
    void dialog
      .say(
        { key: MOMENT, text: t("unlock"), face: "arrived", choices: [{ id: "go", label: t("go") }, { id: "later", label: t("later"), cancel: true }] },
        { id: MOMENT },
      )
      .then((result) => {
        if (!live || result.status === "cancelled") return;
        const s = getHQStore().getState();
        s.clearB1Moment();
        if (result.choice === "go") s.requestElevator("B1");
      });
    return () => {
      live = false;
      dialog.cancelDialog(MOMENT);
    };
  }, [moment, free, settled, t]);

  return null;
}

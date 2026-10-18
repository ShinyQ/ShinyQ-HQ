"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { b1FromHash, floorProgress } from "@/experience/b1";
import { audio } from "@/lib/audio";
import { getHQStore, useHQStore } from "@/store/useHQStore";
import { useOnboardingSettled } from "./hooks";
import * as dialog from "./store";
import { useDialog } from "./store";

const MOMENT = "b1-unlock";

/**
 * B1 Engine Room unlock (spec section 2): once the fifth public floor is reached (store `b1Moment`), a chime and
 * Rover's offer, "Take me there" (rides to B1) or "Later"; the elevator rows pulse meanwhile (FloorButtons). A
 * cancelled line (a tutorial replay) is offered again; a ride or the tour first waits. The chime plays once per
 * moment, when the dialog is not paused. The moment is not persisted: a reload before the answer drops the offer
 * (the row stays lit and B1 is reachable from every picker, so nothing is lost). A locked visitor who followed
 * `/{locale}#B1` hears how to unlock it. Renders nothing. Strings live in the 3D-only `engine` namespace.
 */
export function EngineUnlockLayer() {
  const t = useTranslations("engine");
  const moment = useHQStore((s) => s.b1Moment);
  const free = useHQStore((s) => s.phase === "explore" && s.ride === null);
  const settled = useOnboardingSettled();
  const paused = useDialog((view) => view.paused);
  const [retry, setRetry] = useState(0);
  const chimed = useRef(false);

  useEffect(() => {
    if (!settled || !b1FromHash(undefined, window.location.hash)) return;
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
    const s = getHQStore().getState();
    if (s.b1Unlocked) return;
    const { seen, total } = floorProgress(s.floorsSeen);
    void dialog.say({ key: "b1-locked", text: t("lockedLine", { seen, total }), face: "thinking" }, { id: "b1-locked" });
  }, [t, settled]);

  useEffect(() => {
    if (!moment) chimed.current = false;
    else if (free && settled && !paused && !chimed.current) {
      chimed.current = true;
      audio.play("chime");
    }
  }, [moment, free, settled, paused]);

  useEffect(() => {
    if (!moment || !free || !settled) return;
    let live = true;
    void dialog
      .say(
        { key: MOMENT, text: t("unlock"), face: "arrived", choices: [{ id: "go", label: t("go") }, { id: "later", label: t("later"), cancel: true }] },
        { id: MOMENT },
      )
      .then((result) => {
        if (!live) return;
        if (result.status === "cancelled") {
          setRetry((n) => n + 1);
          return;
        }
        const s = getHQStore().getState();
        s.clearB1Moment();
        if (result.choice === "go") s.requestElevator("B1");
      });
    return () => {
      live = false;
      dialog.cancelDialog(MOMENT);
    };
  }, [moment, free, settled, t, retry]);

  return null;
}

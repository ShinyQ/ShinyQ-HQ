"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { b1FromHash, floorProgress } from "@/experience/b1";
import { audio } from "@/lib/audio";
import { getHQStore, useHQStore } from "@/store/useHQStore";
import { registerHudAction } from "../hudActions";
import { engineRoomAction } from "./engineRoomAction";
import { useOnboardingSettled } from "./hooks";
import * as dialog from "./store";
import { useDialog } from "./store";

const MOMENT = "b1-unlock";
/** Re-offers per moment after a cancel, and how long the queue must stay idle first (a replayed tutorial queues its first line a tick after the cancel). */
const MAX_RETRIES = 3;
const IDLE_GRACE_MS = 300;

/**
 * B1 Engine Room unlock (spec section 2): once the fifth public floor is reached (store `b1Moment`), a chime and
 * Rover's offer, "Take me there" (rides to B1) or "Later"; the elevator rows pulse meanwhile (FloorButtons). A
 * cancelled line (a tutorial replay) is offered again, at most 3 times, once the dialog queue has been idle for a moment and the visitor is free, so it never queues ahead of the replayed tutorial; a ride or the tour first waits. The chime plays once per
 * moment, when the dialog is not paused. The moment is not persisted: a reload before the answer drops the offer
 * (the row stays lit and B1 is reachable from every picker, so nothing is lost). A locked visitor who followed
 * `/{locale}#B1` hears how to unlock it. Once unlocked, Cmd-K lists "Go to B1 Engine Room" while this layer is
 * mounted (the 3D tower only). Renders nothing. Strings live in the 3D-only `engine` namespace.
 */
export function EngineUnlockLayer() {
  const t = useTranslations("engine");
  const moment = useHQStore((s) => s.b1Moment);
  const unlocked = useHQStore((s) => s.b1Unlocked);
  const goTo = t("goTo");
  const free = useHQStore((s) => s.phase === "explore" && s.ride === null);
  const settled = useOnboardingSettled();
  const paused = useDialog((view) => view.paused);
  const idle = useDialog((view) => view.id === null);
  const [retry, setRetry] = useState(0);
  const [cancels, setCancels] = useState(0);
  const cancelled = cancels > retry;
  const retries = useRef(0);
  const chimed = useRef(false);

  // The palette lives in the locale layout, which has no `engine` strings: hand it the resolved label.
  useEffect(() => (unlocked ? registerHudAction(engineRoomAction(goTo)) : undefined), [unlocked, goTo]);

  // Once exploring, so the Lobby is already counted in the progress the line reads.
  useEffect(() => {
    if (!settled || !free || !b1FromHash(undefined, window.location.hash)) return;
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
    const s = getHQStore().getState();
    if (s.b1Unlocked) return;
    const { seen, total } = floorProgress(s.floorsSeen);
    void dialog.say({ key: "b1-locked", text: t("lockedLine", { seen, total }), face: "thinking" }, { id: "b1-locked" });
  }, [t, settled, free]);

  useEffect(() => {
    if (!moment) {
      chimed.current = false;
      retries.current = 0;
    } else if (free && settled && !paused && !chimed.current) {
      chimed.current = true;
      audio.play("chime");
    }
  }, [moment, free, settled, paused]);

  useEffect(() => {
    if (!moment || !cancelled || !idle || !free || !settled) return;
    const timer = window.setTimeout(() => {
      if (dialog.dialog.busy()) return;
      setRetry((n) => n + 1);
    }, IDLE_GRACE_MS);
    return () => window.clearTimeout(timer);
  }, [moment, cancelled, idle, free, settled]);

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
          if (retries.current < MAX_RETRIES) {
            retries.current += 1;
            setCancels((n) => n + 1);
          }
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

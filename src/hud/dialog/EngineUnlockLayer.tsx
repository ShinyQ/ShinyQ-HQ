"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { LOCALES } from "@/content/locales";
import { b1FromHash, floorProgress } from "@/experience/b1";
import { audio } from "@/lib/audio";
import { getHQStore, useHQStore } from "@/store/useHQStore";
import { registerHudAction } from "../hudActions";
import { engineRoomAction, rideToEngineRoom } from "./engineRoomAction";
import { useOnboardingSettled } from "./hooks";
import * as dialog from "./store";
import { useDialog } from "./store";

const MOMENT = "b1-unlock";
/** Re-offers per moment after a cancel, and how long the queue must stay idle first (a replayed tutorial queues its first line a tick after the cancel). */
const MAX_RETRIES = 3;
const IDLE_GRACE_MS = 300;
/** `/{locale}`: the only route whose gate honours `#B1`. */
const LOBBY_PATH = new RegExp(`^/(?:${LOCALES.join("|")})/?$`);

/**
 * B1 Engine Room unlock (spec section 2): once the fifth public floor is reached (store `b1Moment`), a chime and
 * Rover's offer, "Take me there" (rides to B1) or "Later"; the elevator rows pulse meanwhile (FloorButtons). A
 * cancelled line (a tutorial replay) is offered again, at most 3 times, once the dialog queue has been idle for a moment and the visitor is free, so it never queues ahead of the replayed tutorial; a ride, a running mission or the tour first waits. The chime plays once per
 * moment, when the offer line actually starts and the dialog is not paused. The moment is not persisted, but the
 * unlock is: after a reload the row stays lit and the offer is not repeated (B1 is reachable from every picker).
 * A locked visitor who followed `/{locale}#B1` (Lobby route only) or runs the Cmd-K action hears how to unlock
 * it. Cmd-K lists "Go to B1 Engine Room" in both states while this layer is mounted (the 3D tower only): unlocked
 * it rides there, locked it says the locked line. Renders nothing. Strings live in the 3D-only `engine` namespace.
 */
export function EngineUnlockLayer() {
  const t = useTranslations("engine");
  const moment = useHQStore((s) => s.b1Moment);
  const goTo = t("goTo");
  const free = useHQStore((s) => s.phase === "explore" && s.ride === null && s.mission?.status !== "running");
  const settled = useOnboardingSettled();
  const paused = useDialog((view) => view.paused);
  const idle = useDialog((view) => view.id === null);
  const offering = useDialog((view) => view.id === MOMENT);
  const [retry, setRetry] = useState(0);
  const [cancels, setCancels] = useState(0);
  const cancelled = cancels > retry;
  const retries = useRef(0);
  const chimed = useRef(false);

  const sayLocked = useCallback(() => {
    const { seen, total } = floorProgress(getHQStore().getState().floorsSeen);
    void dialog.say({ key: "b1-locked", text: t("lockedLine", { seen, total }), face: "thinking" }, { id: "b1-locked" });
  }, [t]);

  // The palette lives in the locale layout, which has no `engine` strings: hand it the resolved label. Unlocked
  // the action rides to B1; locked it says why not (the same line as the locked #B1 deep link).
  useEffect(
    () => registerHudAction(engineRoomAction(goTo, () => (getHQStore().getState().b1Unlocked ? rideToEngineRoom() : sayLocked()))),
    [goTo, sayLocked],
  );

  // Once exploring, so the Lobby is already counted in the progress the line reads.
  useEffect(() => {
    if (!settled || !free || !LOBBY_PATH.test(window.location.pathname) || !b1FromHash(undefined, window.location.hash)) return;
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
    if (!getHQStore().getState().b1Unlocked) sayLocked();
  }, [settled, free, sayLocked]);

  useEffect(() => {
    if (!moment) {
      chimed.current = false;
      retries.current = 0;
    } else if (offering && !paused && !chimed.current) {
      chimed.current = true;
      audio.play("chime");
    }
  }, [moment, offering, paused]);

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

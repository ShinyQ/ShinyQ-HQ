"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { setBoost as SetBoost } from "@/experience/input/joystick";
import { getHQStore } from "@/store/useHQStore";

/**
 * Touch boost state behind the joystick's double tap (`setBoost` from `input/joystick.ts`, passed in by the touch chunk). Boost only applies
 * while driving by hand (`boostOn`), so the rover still stops when the joystick is released. A floor
 * change, an elevator ride and unmount (Classic site, the hologram, reload) turn it off; it is never
 * persisted.
 */
export function useBoostToggle(setBoost: typeof SetBoost): { on: boolean; toggle: () => void; set: (on: boolean) => void } {
  const [on, setOn] = useState(false);
  // Mirrors `on` so two toggles in one event (a fast double tap) never read a stale value.
  const current = useRef(false);

  useEffect(() => () => setBoost(false), [setBoost]);

  useEffect(
    () =>
      getHQStore().subscribe((state, prev) => {
        const rideStarted = state.ride !== null && prev.ride === null;
        if (state.floor === prev.floor && !rideStarted) return;
        current.current = false;
        setBoost(false);
        setOn(false);
      }),
    [setBoost],
  );

  const set = useCallback((next: boolean) => {
    current.current = next;
    setBoost(next);
    setOn(next);
  }, [setBoost]);

  const toggle = useCallback(() => set(!current.current), [set]);

  return { on, toggle, set };
}

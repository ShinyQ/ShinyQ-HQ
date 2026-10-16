"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { setBoost } from "@/experience/input/joystick";
import { getHQStore } from "@/store/useHQStore";

/**
 * Touch boost state shared by the Boost button and the joystick's double tap. Boost only applies
 * while driving by hand (`boostOn`), so the rover still stops when the joystick is released. A floor
 * change, an elevator ride and unmount (Classic site, the hologram, reload) turn it off; it is never
 * persisted.
 */
export function useBoostToggle(): { on: boolean; toggle: () => void; set: (on: boolean) => void } {
  const [on, setOn] = useState(false);
  // Mirrors `on` so two toggles in one event (a fast double tap) never read a stale value.
  const current = useRef(false);

  useEffect(() => () => setBoost(false), []);

  useEffect(
    () =>
      getHQStore().subscribe((state, prev) => {
        const rideStarted = state.ride !== null && prev.ride === null;
        if (state.floor === prev.floor && !rideStarted) return;
        current.current = false;
        setBoost(false);
        setOn(false);
      }),
    [],
  );

  const set = useCallback((next: boolean) => {
    current.current = next;
    setBoost(next);
    setOn(next);
  }, []);

  const toggle = useCallback(() => set(!current.current), [set]);

  return { on, toggle, set };
}

"use client";

import { useEffect } from "react";
import { useHQStore, type Phase } from "@/store/useHQStore";
import { useAskPanelOpen } from "../ask/availability";
import { DialogBox } from "./DialogBox";
import { dialogPlacement } from "./placement";
import { Spotlight } from "./Spotlight";
import { dialog, useDialog } from "./store";
import { useModalOpen } from "./useModalOpen";

/** Rover never talks over these: the line waits (hidden, clock stopped) until they close. */
const QUIET_PHASES: readonly Phase[] = ["boot", "intro", "room", "hologram", "palette", "terminal", "static"];

/** Lazily loaded on the first line: the box, the spotlight, and the pause and reduced motion rules. */
export default function DialogLayer() {
  const phase = useHQStore((s) => s.phase);
  const picker = useHQStore((s) => s.picker !== null);
  const viewport = useHQStore((s) => s.device.viewport);
  const coarse = useHQStore((s) => s.device.coarse);
  const reduced = useHQStore((s) => s.reducedMotion);
  const askOpen = useAskPanelOpen();
  const modal = useModalOpen();
  const quiet = QUIET_PHASES.includes(phase) || picker || askOpen || modal;
  const spotlight = useDialog((v) => (v.paused || !v.line ? null : (v.line.spotlight ?? null)));

  useEffect(() => dialog.setPaused(quiet), [quiet]);
  useEffect(() => dialog.setInstant(reduced), [reduced]);

  return (
    <>
      <DialogBox placement={dialogPlacement(viewport, coarse)} reducedMotion={reduced} />
      {spotlight && <Spotlight target={spotlight} still={reduced} />}
    </>
  );
}

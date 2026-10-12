"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { hintRuntime, registerHintElement, subscribeHintTarget } from "@/experience/hints/runtime";
import { intents } from "@/experience/input/intents";
import { useHQStore } from "@/store/useHQStore";
import { useAskPanelOpen } from "../ask/availability";
import { hintGoKey, hintLine, hintObjectKey } from "./hintLines";
import { useHintsOn } from "./hooks";
import { say, useDialog } from "./store";

const TEXT_INPUT = 'input, textarea, select, [contenteditable="true"], [contenteditable=""]';
const CONTROL = "button, a, [role='button'], summary";
const MODAL = "[role='dialog'][aria-modal='true']";

const pickedItem = () => hintRuntime.target?.item ?? null;

/**
 * The "!" bubble over the nearest point-and-go target (HintProbe moves it every frame, above the
 * target's hover label). Enter, a tap or a click opens Rover's one-line dialog about it; its Go choice
 * emits point-and-go's `interact` intent, so the rover drives there and runs the action exactly as a
 * click on the object would. Hidden while hints are off, during walks (`suppressed`), missions, rides,
 * beams, pickers, drawers, the Ask panel, while Rover is already talking, and while point-and-go has
 * a hovered or tap-selected target (its label, live text and "Go to" chip own that moment).
 */
export function HintLayer({ suppressed, name }: { suppressed: boolean; name: string }) {
  const t = useTranslations("dialog.hints");
  const on = useHintsOn();
  const target = useSyncExternalStore(subscribeHintTarget, pickedItem, () => null);
  const free = useHQStore((s) => s.phase === "explore" && !s.picker && !s.ride && !s.beam && !s.hover && s.mission?.status !== "running");
  const talking = useDialog((v) => v.id !== null);
  const askOpen = useAskPanelOpen();
  const item = on && !suppressed && free && !talking && !askOpen ? target : null;
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    registerHintElement(item ? button.current : null);
    return () => registerHintElement(null);
  }, [item]);

  const open = () => {
    if (!item) return;
    const key = hintObjectKey(item);
    const text = key ? t(`object.${key}`, { name }) : t(`kind.${item.kind}`, { label: item.label });
    void say(hintLine(item, { text, go: t(`go.${hintGoKey(item)}`), notNow: t("notNow") }), { id: `hint:${item.id}` }).then((result) => {
      if (result.choice === "go") intents.emit({ type: "interact", item });
    });
  };

  // Enter is the bubble's A press while it shows (instead of opening Ask Rover).
  useEffect(() => {
    if (!item) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (document.querySelector(MODAL)) return;
      const el = event.target instanceof Element ? event.target : null;
      if (el?.closest(TEXT_INPUT) || el?.closest(CONTROL)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      open();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  });

  if (!item) return null;
  return (
    <button
      ref={button}
      type="button"
      onClick={open}
      data-testid="hint-bubble"
      data-hint={item.id}
      data-kind={item.kind}
      aria-label={t("bubble", { label: item.label })}
      aria-keyshortcuts="Enter"
      // Transparent until HintProbe has placed it (it then sets opacity and visibility every frame).
      style={{ opacity: 0 }}
      className="pointer-events-auto absolute top-0 left-0 z-10 grid size-11 place-items-center will-change-transform"
    >
      <span aria-hidden="true" className="hq-dialog grid size-8 place-items-center font-mono text-base font-bold text-amber motion-safe:animate-bounce">
        !
      </span>
    </button>
  );
}

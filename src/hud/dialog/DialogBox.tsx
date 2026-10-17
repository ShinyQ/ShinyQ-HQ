"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { audio } from "@/lib/audio";
import { BLIP_EVERY, CONTINUE_CHOICE, type DialogChoice, type DialogView } from "./engine";
import { DIALOG_PLACE, type DialogPlacement } from "./placement";
import { RoverPortrait } from "./RoverPortrait";
import { dialog, useDialog } from "./store";

const TEXT_INPUT = 'input, textarea, select, [contenteditable="true"], [contenteditable=""]';
const CONTROL = "button, a, [role='button'], summary";
const MODAL = "[role='dialog'][aria-modal='true']";
/** How long a finished, choiceless toast on a phone stays before it moves on by itself. */
export const TOAST_HOLD_MS = 4500;
const NEXT_KEYS = new Set(["ArrowDown", "ArrowRight"]);
const PREV_KEYS = new Set(["ArrowUp", "ArrowLeft"]);

function choicesOf(view: DialogView, continueLabel: string): readonly DialogChoice[] {
  if (!view.line || view.shown < view.length) return [];
  if (view.line.choices?.length) return view.line.choices;
  return view.fallback ? [{ id: CONTINUE_CHOICE, label: continueLabel }] : [];
}

/**
 * Rover's text box (handheld RPG style): portrait, name, typewriter line, then a blinking A button or
 * the choices. Not modal: the world keeps driving behind it. Enter and Space advance unless a text
 * field, another control or a modal dialog has the key; arrows move between the choices once one has
 * focus; Esc picks a "cancel" choice. A tap or click anywhere on the box advances too.
 *
 * On phones (`placement === "phone"`) it is a slim toast: the text is clamped to two rows until a tap
 * expands it, and a finished line without choices or a try-it task moves on by itself after
 * `TOAST_HOLD_MS` only when it fits in those two rows: a clamped line waits for a tap, and an expanded
 * line never moves on by itself.
 */
export function DialogBox({ placement, reducedMotion }: { placement: DialogPlacement; reducedMotion: boolean }) {
  const t = useTranslations("dialog");
  const view = useDialog((v) => v);
  const nameId = useId();
  const textId = useId();
  const box = useRef<HTMLElement>(null);
  const textRow = useRef<HTMLParagraphElement>(null);
  const toast = placement === "phone";
  const [expandedLine, setExpandedLine] = useState<unknown>(null);
  const line = view.line;
  const visible = Boolean(line) && !view.paused;
  const done = Boolean(line) && view.shown >= view.length;
  const choices = choicesOf(view, t("continue"));
  const choiceKey = choices.map((choice) => choice.id).join("|");
  const expanded = toast && Boolean(line) && expandedLine === line;
  const autoAdvance = toast && visible && done && !expanded && !line?.choices?.length && !line?.until;

  useEffect(() => {
    if (!autoAdvance) return;
    // The untyped rest is laid out invisibly, so the row already has the line's full height here.
    const clamped = () => {
      const text = textRow.current;
      return Boolean(text && text.scrollHeight > text.clientHeight);
    };
    if (clamped()) return;
    const timer = window.setTimeout(() => {
      if (!clamped()) dialog.advance();
    }, TOAST_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [autoAdvance, line]);

  // Typewriter clock (also the try-it fallback clock) and one soft blip per few characters.
  useEffect(() => {
    if (!visible) return;
    let raf = 0;
    let last = performance.now();
    let count = 0;
    const loop = (now: number) => {
      count += dialog.tick(now - last);
      last = now;
      if (count >= BLIP_EVERY) {
        count = 0;
        audio.play("blip");
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [visible]);

  // Choices take focus when they appear and follow the highlight (no trap: Tab leaves), but never from a text
  // field or another dialog (Cmd-K, the Ask panel): the visitor's typing would land on a choice instead.
  useEffect(() => {
    if (!choiceKey) return;
    const focused = document.activeElement;
    if (focused && !box.current?.contains(focused) && focused.closest(`${TEXT_INPUT}, [role='dialog']`)) return;
    box.current?.querySelector<HTMLButtonElement>(`[data-choice-index="${view.active}"]`)?.focus({ preventScroll: true });
  }, [choiceKey, view.active]);

  useEffect(() => {
    if (!visible) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (document.querySelector(MODAL)) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(TEXT_INPUT)) return;
      const inBox = Boolean(target && box.current?.contains(target));
      if (!inBox && target?.closest(CONTROL)) return;
      const current = dialog.view;
      if (event.key === "Enter" || event.key === " ") {
        // A focused choice or button activates natively.
        if (inBox && target?.closest("button")) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        dialog.advance();
        return;
      }
      if (inBox && (NEXT_KEYS.has(event.key) || PREV_KEYS.has(event.key)) && current.line?.choices?.length && current.shown >= current.length) {
        event.preventDefault();
        event.stopImmediatePropagation();
        dialog.move(NEXT_KEYS.has(event.key) ? 1 : -1);
        return;
      }
      if (event.key === "Escape" && dialog.escape()) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    // Capture on window runs before the game's keyboard handler (Enter would open the Rover menu).
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [visible]);

  if (!line || view.paused) return null;

  return (
    <section
      ref={box}
      role="dialog"
      aria-modal="false"
      aria-labelledby={nameId}
      aria-describedby={textId}
      data-testid="dialog-box"
      data-dialog={view.id ?? undefined}
      data-line={line.key}
      data-typing={done ? "false" : "true"}
      data-motion={reducedMotion ? "still" : "live"}
      data-expanded={toast ? String(expanded) : undefined}
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest("button")) return;
        const text = textRow.current;
        if (toast && !expanded && text && text.scrollHeight > text.clientHeight) {
          setExpandedLine(line);
          return;
        }
        dialog.advance();
      }}
      className={`hq-dialog pointer-events-auto absolute z-20 flex cursor-pointer text-ink font-mono ${
        toast ? "gap-2 p-2.5 text-[13px] leading-5" : "gap-3 p-3 text-[14px] leading-6 sm:p-4"
      } ${DIALOG_PLACE[placement]}`}
    >
      <RoverPortrait face={line.face ?? "idle"} still={reducedMotion} compact={toast} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h2 id={nameId} className="label text-cyan">
            {t("name")}
          </h2>
          {view.skipLabel && (
            <button
              type="button"
              data-testid="dialog-skip"
              onClick={() => dialog.skip()}
              className="label -mt-3 -mr-2 inline-flex min-h-11 items-center px-2 text-ink-3 hover:text-ink"
            >
              {view.skipLabel}
            </button>
          )}
        </div>
        <p id={textId} className="sr-only" aria-live="polite">
          {line.text}
        </p>
        {/* The untyped rest is laid out but invisible, so the box keeps its height while it types. */}
        <p
          ref={textRow}
          aria-hidden="true"
          className={`whitespace-pre-line ${toast ? `min-h-10 ${expanded ? "" : "line-clamp-2"}` : "min-h-12"}`}
        >
          {line.text.slice(0, view.shown)}
          <span className="invisible">{line.text.slice(view.shown)}</span>
        </p>
        {choices.length > 0 ? (
          <div role="group" aria-label={t("choices")} data-testid="dialog-choices" className="mt-2 flex flex-wrap gap-2">
            {choices.map((choice, index) => (
              <button
                key={choice.id}
                type="button"
                data-choice-index={index}
                onClick={() => dialog.choose(choice.id)}
                className={`inline-flex min-h-11 items-center gap-1 rounded px-3 font-semibold ${
                  index === view.active ? "bg-cyan text-void" : "border border-glass-border text-ink hover:border-ink-3"
                }`}
              >
                <span aria-hidden="true" className="w-3">
                  {index === view.active ? ">" : ""}
                </span>
                {choice.label}
              </button>
            ))}
          </div>
        ) : view.waiting ? (
          <p className="label mt-2 text-amber" data-testid="dialog-try">
            {t("tryIt")}
          </p>
        ) : null}
      </div>
      {choices.length === 0 && !view.waiting && (
        <button
          type="button"
          data-testid="dialog-next"
          aria-label={t("next")}
          onClick={() => dialog.advance()}
          className="grid size-11 shrink-0 place-items-center self-end rounded-full border-2 border-ink text-ink hover:border-cyan hover:text-cyan"
        >
          <span aria-hidden="true" className="flex flex-col items-center leading-none font-bold">
            <span className="text-[13px]">A</span>
            <svg viewBox="0 0 10 6" className={`mt-0.5 h-1.5 w-2.5 fill-current ${done ? "motion-safe:animate-pulse" : "invisible"}`}>
              <path d="M0 0h10L5 6z" />
            </svg>
          </span>
        </button>
      )}
    </section>
  );
}

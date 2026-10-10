"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { askQuestion, isAskError, sanitizeAnswer, MAX_ANSWER_CHARS, type AskClientError, type AskResult } from "@/ask/client";
import type { AskOutcome } from "@/ask/protocol";
import type { Locale } from "@/content/schema";
import { setAskFace } from "@/experience/rover/askFace";
import { audio } from "@/lib/audio";
import { formatDate } from "@/lib/format";

/** At most one soft click per streamed chunk window. */
export const CLICK_THROTTLE_MS = 80;
/** How long the rover keeps ^_^ or o_o after an answer (3D only). */
const FACE_HOLD_MS = 3000;

export type AskPhase = "idle" | "thinking" | "streaming" | "done" | "error";

export interface AskState {
  phase: AskPhase;
  question: string;
  /** Plain text. Render it only as a React text child, never as HTML (threat T6). */
  text: string;
  outcome?: AskOutcome;
  asOf?: string;
  error?: AskClientError;
  retryAfter?: number;
}

const IDLE: AskState = { phase: "idle", question: "", text: "" };

/** Rover face text for the terminal: `...` while thinking, `^_^` on an answer, `o_o` otherwise. */
export function askFaceText(state: AskState): string | null {
  if (state.phase === "thinking" || state.phase === "streaming") return "...";
  if (state.phase === "done") return state.outcome === "answer" ? "^_^" : "o_o";
  if (state.phase === "error") return "o_o";
  return null;
}

export type AskFn = typeof askQuestion;

/**
 * One question at a time: a new question aborts the previous one. Streams text into state, plays a
 * throttled `click` per chunk (the engine respects mute and the paused Page View) and, when
 * `roverFace` is set, mirrors the state on the 3D rover's face.
 */
export function useAsk(locale: Locale, { roverFace = false, ask = askQuestion }: { roverFace?: boolean; ask?: AskFn } = {}) {
  const [state, setState] = useState<AskState>(IDLE);
  const controller = useRef<AbortController | null>(null);
  const lastClick = useRef(0);

  const face = useCallback(
    (next: Parameters<typeof setAskFace>[0], hold?: number) => {
      if (roverFace) setAskFace(next, hold);
    },
    [roverFace],
  );

  const reset = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    face(null);
    setState(IDLE);
  }, [face]);

  const submit = useCallback(
    async (raw: string) => {
      const question = raw.replace(/\s+/g, " ").trim();
      if (!question) return;
      controller.current?.abort();
      const own = new AbortController();
      controller.current = own;
      face("thinking");
      setState({ phase: "thinking", question, text: "" });
      let result: AskResult;
      try {
        result = await ask({
          q: question,
          locale,
          signal: own.signal,
          onDelta: (delta) => {
            if (controller.current !== own) return;
            const now = performance.now();
            if (now - lastClick.current >= CLICK_THROTTLE_MS) {
              lastClick.current = now;
              audio.play("click");
            }
            setState((s) => ({ ...s, phase: "streaming", text: sanitizeAnswer(s.text + delta).slice(0, MAX_ANSWER_CHARS) }));
          },
        });
      } catch {
        result = { error: "network" };
      }
      if (controller.current !== own) return;
      controller.current = null;
      if (isAskError(result)) {
        if (result.error === "aborted") return;
        face("blocked", FACE_HOLD_MS);
        setState((s) => ({ ...s, phase: "error", error: result.error, retryAfter: result.retryAfter }));
        return;
      }
      face(result.outcome === "answer" ? "arrived" : "blocked", FACE_HOLD_MS);
      setState((s) => ({ ...s, phase: "done", outcome: result.outcome, asOf: result.asOf }));
    },
    [ask, face, locale],
  );

  useEffect(
    () => () => {
      controller.current?.abort();
      if (roverFace) setAskFace(null);
    },
    [roverFace],
  );

  return { state, submit, reset };
}

/** Friendly copy for a failed question (rate limit, paused service, anything else). */
export function useAskErrorMessage() {
  const t = useTranslations("ask.error");
  return (state: AskState) => {
    if (state.error === "rate_limited") return t("rateLimited", { minutes: Math.max(1, Math.ceil((state.retryAfter ?? 60) / 60)) });
    if (state.error === "disabled" || state.error === "paused") return t("offline");
    return t("fallback");
  };
}

/** "Answered by AI from this site, as of {date}". */
export function AskAsOf({ asOf, locale, className }: { asOf?: string; locale: Locale; className?: string }) {
  const t = useTranslations("ask");
  if (!asOf || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return null;
  return <p className={className}>{t("asOf", { date: formatDate(asOf, locale) })}</p>;
}

/** What happens to a question (design section 7.5, threat T10). */
export function AskPrivacy({ className }: { className?: string }) {
  const t = useTranslations("ask");
  return (
    <p className={className}>
      <span className="font-semibold">{t("privacyTitle")}: </span>
      {t("privacy")}
    </p>
  );
}

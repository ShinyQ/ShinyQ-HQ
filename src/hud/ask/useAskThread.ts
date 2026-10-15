"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { askQuestion, isAskError, MAX_ANSWER_CHARS, sanitizeAnswer, type AskResult } from "@/ask/client";
import type { AskEntry } from "@/ask/protocol";
import { matchSuggestion } from "@/ask/suggestions";
import { capThread, loadThread, messageId, saveThread, type ThreadMessage } from "@/ask/thread";
import type { Locale } from "@/content/schema";
import { setAskFace } from "@/experience/rover/askFace";
import { audio } from "@/lib/audio";

/** At most one soft click per streamed chunk window. */
export const CLICK_THROTTLE_MS = 80;
/** How long the rover keeps ^_^ or o_o after an answer (3D only). */
const FACE_HOLD_MS = 3000;

export type ThreadPhase = "idle" | "thinking" | "streaming";

export type AskFn = typeof askQuestion;

export interface SendOptions {
  source: AskEntry;
  /** Curated suggestion id; found by text when omitted. */
  qid?: string;
}

/**
 * The chat thread: one question at a time (a new one aborts the previous), streamed into an
 * answer message, errors as system messages, saved to `sessionStorage` when settled. Each
 * question is sent on its own (no history goes to the server). Plays a throttled `click` per
 * chunk and, with `roverFace`, mirrors the state on the 3D rover's face.
 */
export function useAskThread(locale: Locale, { roverFace = false, ask = askQuestion }: { roverFace?: boolean; ask?: AskFn } = {}) {
  const [messages, setMessages] = useState<ThreadMessage[]>(() => loadThread());
  const [phase, setPhase] = useState<ThreadPhase>("idle");
  const controller = useRef<AbortController | null>(null);
  const lastClick = useRef(0);
  const faceRef = useRef(roverFace);
  useEffect(() => {
    faceRef.current = roverFace;
  }, [roverFace]);

  const face = useCallback((next: Parameters<typeof setAskFace>[0], hold?: number) => {
    if (faceRef.current) setAskFace(next, hold);
  }, []);

  useEffect(() => {
    if (phase === "idle") saveThread(messages);
  }, [messages, phase]);

  const send = useCallback(
    async (raw: string, { source, qid }: SendOptions) => {
      const question = sanitizeAnswer(raw).replace(/\s+/g, " ").trim();
      if (!question) return;
      controller.current?.abort();
      const own = new AbortController();
      controller.current = own;
      const user: ThreadMessage = { id: messageId(), role: "user", text: question };
      const curated = qid ?? matchSuggestion(question)?.id;
      if (curated) user.qid = curated;
      const answerId = messageId();
      setMessages((list) => capThread([...list, user]));
      setPhase("thinking");
      face("thinking");

      let result: AskResult;
      try {
        result = await ask({
          q: question,
          locale,
          source,
          ...(curated ? { chip: curated } : {}),
          signal: own.signal,
          onDelta: (delta) => {
            if (controller.current !== own) return;
            const now = performance.now();
            if (now - lastClick.current >= CLICK_THROTTLE_MS) {
              lastClick.current = now;
              audio.play("click");
            }
            setPhase("streaming");
            setMessages((list) => {
              const at = list.findIndex((m) => m.id === answerId);
              if (at === -1) return capThread([...list, { id: answerId, role: "assistant", text: sanitizeAnswer(delta).slice(0, MAX_ANSWER_CHARS) }]);
              const next = [...list];
              next[at] = { ...next[at], text: sanitizeAnswer(next[at].text + delta).slice(0, MAX_ANSWER_CHARS) };
              return next;
            });
          },
        });
      } catch {
        result = { error: "network" };
      }
      if (controller.current !== own) {
        // Superseded or cleared: drop this question's partial answer.
        setMessages((list) => list.filter((m) => m.id !== answerId));
        return;
      }
      controller.current = null;

      if (isAskError(result)) {
        if (result.error !== "aborted") {
          face("blocked", FACE_HOLD_MS);
          const system: ThreadMessage = { id: messageId(), role: "system", text: "", error: result.error };
          if (result.retryAfter !== undefined) system.retryAfter = result.retryAfter;
          // A half-streamed answer is dropped: the error replaces it.
          setMessages((list) => capThread([...list.filter((m) => m.id !== answerId), system]));
        }
        setPhase("idle");
        return;
      }
      face(result.outcome === "answer" ? "arrived" : "blocked", FACE_HOLD_MS);
      setMessages((list) => {
        const at = list.findIndex((m) => m.id === answerId);
        const answer: ThreadMessage = { ...(at === -1 ? { id: answerId, role: "assistant" as const, text: "" } : list[at]), outcome: result.outcome };
        if (result.asOf) answer.asOf = result.asOf;
        if (result.tags?.length) answer.tags = result.tags;
        if (result.cite) answer.cite = result.cite;
        if (result.contact) answer.contact = result.contact;
        if (curated) answer.qid = curated;
        if (at === -1) return capThread([...list, answer]);
        const next = [...list];
        next[at] = answer;
        return next;
      });
      setPhase("idle");
    },
    [ask, face, locale],
  );

  const clear = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    face(null);
    setPhase("idle");
    setMessages([]);
  }, [face]);

  useEffect(
    () => () => {
      controller.current?.abort();
      if (faceRef.current) setAskFace(null);
    },
    [],
  );

  const asked = useMemo(() => new Set(messages.flatMap((m) => (m.role === "user" && m.qid ? [m.qid] : []))), [messages]);

  return { messages, phase, busy: phase !== "idle", send, clear, asked };
}

"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { fetchAskStatus, isAskEnabled, prepareAsk } from "@/ask/client";
import { ASK_MAX_QUESTION, type AskStatus } from "@/ask/protocol";
import type { Locale } from "@/content/schema";
import { AskAsOf, AskPrivacy, useAsk, useAskErrorMessage } from "@/hud/ask-ui";
import { registerAskPanel } from "@/hud/events";
import { SectionSplit } from "./Layout";

const SUGGESTIONS = ["now", "ai", "contact"] as const;
/** Fetch the status a little before the panel scrolls in, so hiding it never shifts what is on screen. */
const ROOT_MARGIN = "600px 0px";

/**
 * "Ask about Kurniadi" (design section 8) for the Page View on Home and About. The HTML shell is
 * server-rendered; nothing is fetched until the panel nears the viewport or the input gets focus,
 * and the panel hides itself when the feature is off or unavailable (`bun run serve`, 503).
 * Answers are plain text children only (threat T6).
 */
export function AskPanel({ locale, id = "ask" }: { locale: Locale; id?: string }) {
  const t = useTranslations("ask");
  const baseId = useId();
  const inputId = `${baseId}-q`;
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<AskStatus | null | undefined>(undefined);
  const [value, setValue] = useState("");
  const { state, submit, reset } = useAsk(locale);
  const errorMessage = useAskErrorMessage();
  const hidden = status === null || (status !== undefined && !status.enabled);
  const hiddenRef = useRef(hidden);
  useEffect(() => {
    hiddenRef.current = hidden;
  }, [hidden]);
  const busy = state.phase === "thinking" || state.phase === "streaming";

  const load = useCallback(async () => {
    const next = await fetchAskStatus();
    setStatus(next);
    return next;
  }, []);

  const ask = useCallback(
    async (question: string) => {
      if (!question.trim()) return;
      const next = await load();
      if (!isAskEnabled(next)) return;
      prepareAsk(next);
      void submit(question);
    },
    [load, submit],
  );

  useEffect(() => {
    const node = wrapRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (records) => {
        if (!records.some((record) => record.isIntersecting)) return;
        observer.disconnect();
        void load();
      },
      { rootMargin: ROOT_MARGIN },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [load]);

  // Cmd-K "Ask" row and `openAsk(q)` on this page: scroll here and ask.
  useEffect(
    () =>
      registerAskPanel((q) => {
        if (hiddenRef.current) return false;
        wrapRef.current?.scrollIntoView({ block: "start" });
        inputRef.current?.focus({ preventScroll: true });
        if (q?.trim()) {
          setValue(q);
          void ask(q);
        }
        return true;
      }),
    [ask],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (!busy) void ask(value);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setValue("");
      reset();
    }
  };

  const choose = (question: string) => {
    setValue(question);
    void ask(question);
  };

  return (
    <div ref={wrapRef} hidden={hidden} data-ask-panel="">
      <SectionSplit id={id} title={t("title")} intro={t("intro")}>
        <div className="max-w-[720px]">
          <label htmlFor={inputId} className="pv-data">
            {t("label")}
          </label>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input
              ref={inputRef}
              id={inputId}
              type="text"
              value={value}
              maxLength={ASK_MAX_QUESTION}
              autoComplete="off"
              enterKeyHint="send"
              placeholder={t("placeholder")}
              onChange={(event) => setValue(event.target.value)}
              onFocus={() => void load().then(prepareAsk)}
              onKeyDown={onKeyDown}
              className="min-h-12 min-w-0 flex-1 rounded-[10px] border border-line-2 bg-surface px-4 text-base text-ink transition-colors placeholder:text-ink-3 hover:border-ink-3 focus:border-ink-2 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
            />
            <button type="button" onClick={() => void ask(value)} disabled={busy} className="pv-btn pv-btn-primary disabled:opacity-60">
              {t("submit")}
            </button>
          </div>

          <ul aria-label={t("suggestionsLabel")} className="mt-4 flex flex-wrap gap-2">
            {SUGGESTIONS.map((key) => (
              <li key={key}>
                <button type="button" disabled={busy} onClick={() => choose(t(`suggestions.${key}`))} className="chip min-h-11 disabled:opacity-60">
                  {t(`suggestions.${key}`)}
                </button>
              </li>
            ))}
          </ul>

          <div aria-live="polite" aria-busy={busy} className="mt-8" data-testid="ask-answer">
            {state.question && (
              <div className="border-t border-line pt-6">
                <p className="pv-data">{t("asked")}</p>
                <p className="pv-lead mt-2 break-words">{state.question}</p>
                {state.phase === "thinking" && <p className="pv-body mt-4 text-ink-2">{t("thinking")}</p>}
                {state.text && <p className="pv-body mt-4 break-words whitespace-pre-wrap text-ink">{state.text}</p>}
                {state.phase === "error" && <p className="pv-body mt-4 text-ink-2">{errorMessage(state)}</p>}
                {state.phase === "done" && state.outcome !== "fallback" && (
                  <AskAsOf asOf={state.asOf || status?.asOf} locale={locale} className="pv-data mt-5" />
                )}
                {(state.phase === "done" || state.phase === "error") && (
                  <button
                    type="button"
                    onClick={() => {
                      setValue("");
                      reset();
                      inputRef.current?.focus();
                    }}
                    className="pv-go mt-3"
                  >
                    {t("clear")}
                  </button>
                )}
              </div>
            )}
          </div>

          <AskPrivacy className="pv-small mt-8 max-w-[64ch] text-ink-3" />
        </div>
      </SectionSplit>
    </div>
  );
}

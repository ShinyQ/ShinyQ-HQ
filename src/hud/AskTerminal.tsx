"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { fetchAskStatus, prepareAsk } from "@/ask/client";
import { ASK_MAX_QUESTION } from "@/ask/protocol";
import type { Locale } from "@/content/schema";
import { AskAsOf, AskPrivacy, askFaceText, useAsk, useAskErrorMessage } from "./ask-ui";

const SUGGESTIONS = ["now", "ai"] as const;

export interface AskTerminalProps {
  locale: Locale;
  /** Prefilled and submitted on mount (Cmd-K "Ask" row, `openAsk(q)`). */
  initialQuestion?: string;
  /** Esc: back to the missions, or close when the terminal was opened straight into ask mode. */
  onBack: () => void;
}

/**
 * Rover Terminal ask mode (design section 8): `rover@hq:~$ ask "..."`, two suggestions, the answer
 * streamed as plain text and the rover face (`...`, `^_^`, `o_o`), mirrored on the 3D rover.
 */
export function AskTerminal({ locale, initialQuestion, onBack }: AskTerminalProps) {
  const t = useTranslations("ask");
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initialQuestion ?? "");
  const { state, submit } = useAsk(locale, { roverFace: true });
  const errorMessage = useAskErrorMessage();
  const busy = state.phase === "thinking" || state.phase === "streaming";
  const face = askFaceText(state);

  useEffect(() => {
    inputRef.current?.focus();
    void fetchAskStatus().then(prepareAsk);
    if (initialQuestion?.trim()) void submit(initialQuestion);
    // Runs once per mount: the terminal remounts this view for every new prefilled question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (!busy) void submit(value);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onBack();
    }
  };

  const ask = (question: string) => {
    setValue(question);
    void submit(question);
    inputRef.current?.focus();
  };

  return (
    <div className="max-h-[60vh] overflow-y-auto px-4 pt-3 pb-3 sm:max-h-[min(70vh,560px)]">
      <label htmlFor={`${id}-q`} className="sr-only">
        {t("terminal.label")}
      </label>
      <div className="flex items-center text-terminal-hi">
        <span aria-hidden="true" className="shrink-0 whitespace-pre">
          {t("terminal.prompt")} &quot;
        </span>
        <input
          ref={inputRef}
          id={`${id}-q`}
          type="text"
          value={value}
          maxLength={ASK_MAX_QUESTION}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="send"
          placeholder={t("terminal.placeholder")}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
          className="min-h-11 min-w-0 flex-1 bg-transparent text-terminal-hi placeholder:text-terminal-fg/50 focus:outline-none"
        />
        <span aria-hidden="true">&quot;</span>
      </div>

      <ul aria-label={t("suggestionsLabel")} className="mt-1 flex flex-wrap gap-2">
        {SUGGESTIONS.map((key) => (
          <li key={key}>
            <button
              type="button"
              disabled={busy}
              onClick={() => ask(t(`terminal.suggestions.${key}`))}
              className="inline-flex min-h-11 items-center rounded border border-terminal-fg/30 px-2.5 text-left text-terminal-fg hover:border-terminal-fg/60 hover:text-terminal-hi disabled:opacity-50"
            >
              {t(`terminal.suggestions.${key}`)}
            </button>
          </li>
        ))}
      </ul>

      <div aria-live="polite" aria-busy={busy} className="mt-3 min-h-[44px] rounded-[10px] border border-terminal-fg/25 bg-black/40 px-3 py-2" data-testid="ask-terminal-answer">
        {face && (
          <p aria-hidden="true" className="text-terminal-hi" data-testid="ask-face">
            [{face}]
          </p>
        )}
        {state.phase === "thinking" && <p className="text-terminal-fg/85">{t("thinking")}</p>}
        {state.text && <p className="break-words whitespace-pre-wrap">{state.text}</p>}
        {state.phase === "error" && <p>{errorMessage(state)}</p>}
        {state.phase === "done" && state.outcome !== "fallback" && (
          <AskAsOf asOf={state.asOf} locale={locale} className="mt-2 text-[11px] text-terminal-fg/85" />
        )}
      </div>
      <AskPrivacy className="mt-3 text-[11px] leading-4 text-terminal-fg/85" />
    </div>
  );
}

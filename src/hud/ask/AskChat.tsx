"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { prepareAsk } from "@/ask/client";
import { ASK_MAX_QUESTION, type AskEntry, type AskStatus } from "@/ask/protocol";
import { ASK_TOPICS, pickFollowUps, topicQuestions, type AskTopic, type Suggestion } from "@/ask/suggestions";
import type { ThreadMessage } from "@/ask/thread";
import type { Locale } from "@/content/schema";
import type { DrawerLayout } from "@/hud/drawer/layout";
import { CloseIcon, EditIcon, SendIcon, SparkIcon } from "./icons";
import { anchoredScrollTop, askReducedMotion, scrolledAway } from "./scroll";
import { AskAsOf, AskCiteLink, AskContactCard, useAskErrorMessage } from "./ui";
import { useAskThread, type AskFn } from "./useAskThread";

export interface AskRequest {
  id: number;
  q?: string;
  topic?: AskTopic;
  source?: AskEntry;
}

export interface AskChatProps {
  open: boolean;
  locale: Locale;
  layout: DrawerLayout;
  /** Over the 3D tower: the side panel starts below the HUD top bar and the rover face mirrors the state. */
  tower: boolean;
  status: AskStatus | null | undefined;
  request: AskRequest | null;
  onClose: () => void;
  /** Test hook. */
  ask?: AskFn;
}

/** "auto": follow-ups after an answer, topics otherwise. */
type PillMode = "auto" | "topics" | AskTopic;

/** Dragging the sheet handle down this far closes it. */
const SHEET_CLOSE_PX = 110;

/**
 * Ask the HQ chat panel (lazy chunk): thread, topic and follow-up pills, input. Side panel on
 * desktop (non-modal, the page or 3D view stays usable), modal bottom sheet on phones and portrait
 * tablets. Stays mounted while closed so a streaming answer and the thread survive.
 */
export default function AskChat({ open, locale, layout, tower, status, request, onClose, ask }: AskChatProps) {
  const t = useTranslations("ask");
  const td = useTranslations("ask.dock");
  const errorMessage = useAskErrorMessage();
  const id = useId();
  const { messages, phase, busy, send, clear, asked } = useAskThread(locale, { roverFace: tower, ask });
  const [value, setValue] = useState("");
  const [mode, setMode] = useState<PillMode>(request?.topic ?? "auto");
  const [seenRequest, setSeenRequest] = useState<number | undefined>(undefined);
  const [drag, setDrag] = useState(0);
  const dragStart = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const offline = status === null || (status !== undefined && !status.enabled);
  const sheet = layout === "sheet";
  const typedSource: AskEntry = request?.source === "terminal" ? "terminal" : "dock";

  // A new request from openAsk: show its topic, or reset the pills for its question.
  if (request && request.id !== seenRequest) {
    setSeenRequest(request.id);
    setMode(request.topic ?? "auto");
  }

  const sentRequest = useRef<number | null>(null);
  useEffect(() => {
    if (!request || sentRequest.current === request.id) return;
    sentRequest.current = request.id;
    if (request.q?.trim()) void send(request.q, { source: request.source ?? "dock" });
  }, [request, send]);

  useEffect(() => {
    if (open) prepareAsk(status);
  }, [open, status]);

  // After the opener (Rover Terminal, palette) has closed and restored its own focus.
  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  // Esc also closes the side panel when focus has left it (non-modal), unless another dialog owns Esc.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (panelRef.current?.contains(event.target as Node)) return;
      if (document.querySelector("[role='dialog'][aria-modal='true']:not([data-testid='ask-dock'])")) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Owner request 2026-10-16: follow the answer as it streams, but never past its first line, and
  // stop following once the visitor scrolls the thread; a new question, an open or a pill mode
  // change follows again.
  const last = messages.at(-1);
  const follow = useRef(true);
  const lastSet = useRef<number | null>(null);
  const prevPhase = useRef(phase);
  const scrollThread = useCallback((top: number, smooth: boolean) => {
    const node = scrollRef.current;
    if (!node) return;
    lastSet.current = top;
    if (smooth && typeof node.scrollTo === "function" && !askReducedMotion()) node.scrollTo({ top, behavior: "smooth" });
    else node.scrollTop = top;
  }, []);
  const onThreadScroll = () => {
    const node = scrollRef.current;
    if (node && scrolledAway(node.scrollTop, lastSet.current)) follow.current = false;
  };
  useLayoutEffect(() => {
    follow.current = true;
    // Content may shrink in this commit (pills hide) and clamp scrollTop: not the visitor's scroll.
    lastSet.current = null;
  }, [messages.length, open]);
  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    follow.current = true;
    scrollThread(Math.max(0, node.scrollHeight - node.clientHeight), false);
  }, [mode, scrollThread]);
  useLayoutEffect(() => {
    const node = scrollRef.current;
    const finished = prevPhase.current !== "idle" && phase === "idle";
    prevPhase.current = phase;
    if (!node) return;
    // The scroll event of a visitor's scroll can arrive after this commit: read the position too.
    if (scrolledAway(node.scrollTop, lastSet.current)) follow.current = false;
    if (!follow.current) return;
    const answers = threadRef.current?.querySelectorAll<HTMLElement>("[data-role='assistant']");
    const answer = last?.role === "assistant" && answers?.length ? answers[answers.length - 1] : null;
    const answerTop = answer ? answer.getBoundingClientRect().top - node.getBoundingClientRect().top + node.scrollTop : null;
    scrollThread(anchoredScrollTop(node, answerTop), finished);
  }, [messages.length, last?.text, last?.role, phase, open, scrollThread]);

  const followUps = useMemo(() => {
    if (busy || !last || last.role !== "assistant") return [];
    const question = [...messages].reverse().find((m) => m.role === "user");
    return pickFollowUps({ answered: question?.qid, tags: last.tags, asked });
  }, [busy, last, messages, asked]);

  if (!open) return null;

  const ask_ = (text: string, source: AskEntry, qid?: string) => {
    if (busy || offline || !text.trim()) return;
    // The pills disappear while the answer streams: keep focus in the panel (on the thread, so
    // phones do not pop the keyboard) instead of letting it fall back to the page.
    if (document.activeElement !== inputRef.current) threadRef.current?.focus({ preventScroll: true });
    setMode("auto");
    setValue("");
    void send(text, { source, qid });
  };

  const edit = (s: Suggestion) => {
    setValue(s.q[locale]);
    inputRef.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key === "Tab" && sheet) {
      const nodes = [...(panelRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), summary, [href]") ?? [])];
      if (nodes.length === 0) return;
      const index = nodes.indexOf(document.activeElement as HTMLElement);
      const next = event.shiftKey ? (index <= 0 ? nodes.length - 1 : index - 1) : index === nodes.length - 1 ? 0 : index + 1;
      event.preventDefault();
      nodes[next].focus();
    }
  };

  const onHandleDown = (event: PointerEvent<HTMLDivElement>) => {
    dragStart.current = event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onHandleMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragStart.current !== null) setDrag(Math.max(0, event.clientY - dragStart.current));
  };
  const onHandleUp = () => {
    const moved = drag;
    dragStart.current = null;
    setDrag(0);
    if (moved > SHEET_CLOSE_PX) onClose();
  };

  const topic = mode !== "auto" && mode !== "topics" ? mode : null;
  const showFollowUps = mode === "auto" && followUps.length > 0;

  const panelClass = sheet
    ? "fixed inset-x-0 bottom-0 z-50 flex h-[85dvh] flex-col rounded-t-[20px] border-x-0 border-b-0 pb-[env(safe-area-inset-bottom)] motion-safe:animate-[ask-sheet-in_.34s_cubic-bezier(.16,1,.3,1)]"
    : `fixed right-4 bottom-4 z-50 flex w-[420px] max-w-[calc(100vw-2rem)] flex-col motion-safe:animate-[ask-panel-in_.32s_cubic-bezier(.16,1,.3,1)] ${tower ? "top-[124px] lg:top-[76px]" : "top-[76px]"}`;

  return (
    <>
      {sheet && <div aria-hidden="true" className="fixed inset-0 z-50 bg-void/60" onClick={onClose} />}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal={sheet ? "true" : "false"}
        aria-labelledby={`${id}-title`}
        onKeyDown={onKeyDown}
        data-testid="ask-dock"
        data-layout={layout}
        style={drag ? { transform: `translateY(${drag}px)` } : undefined}
        className={`glass glass-solid no-print overflow-hidden bg-[rgb(10_10_18)] ${panelClass}`}
      >
        {sheet && (
          <div
            aria-hidden="true"
            onPointerDown={onHandleDown}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleUp}
            onPointerCancel={onHandleUp}
            className="flex h-6 shrink-0 cursor-grab touch-none items-end justify-center"
            data-testid="ask-handle"
          >
            <span className="h-1 w-10 rounded-full bg-line-2" />
          </div>
        )}

        <header className="flex shrink-0 items-center gap-3 border-b border-line py-2 pr-2 pl-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-full border border-cyan/35 bg-cyan/10 text-cyan">
            <SparkIcon />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={`${id}-title`} className="text-[15px] leading-5 font-semibold text-ink">
              {td("title")}
            </h2>
            <p className="truncate text-xs leading-4 text-ink-2">{td("subtitle")}</p>
          </div>
          {messages.length > 0 && (
            <button type="button" onClick={clear} className="min-h-11 rounded-full px-3 text-sm text-ink-2 transition hover:text-ink">
              {td("clear")}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label={td("close")}
            className="grid size-11 shrink-0 place-items-center rounded-full text-ink-2 transition hover:bg-surface-2 hover:text-ink"
          >
            <CloseIcon />
          </button>
        </header>

        <div ref={scrollRef} onScroll={onThreadScroll} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-3" data-testid="ask-scroll">
          <div ref={threadRef} tabIndex={-1} role="log" aria-live="polite" aria-busy={busy} aria-label={td("threadLabel")} className="focus:outline-none" data-testid="ask-thread">
            <ol className="flex flex-col gap-3">
              {messages.length === 0 && (
                <li className="max-w-[92%] self-start rounded-2xl rounded-bl-md border border-line bg-surface px-3.5 py-2.5 text-[15px] leading-6 text-ink">
                  {td("welcome")}
                </li>
              )}
              {messages.map((m) => (
                <Message key={m.id} message={m} locale={locale} errorText={errorMessage} labels={{ you: td("you"), hq: td("hq") }} onCite={layout === "sheet" ? onClose : undefined} />
              ))}
              {phase === "thinking" && (
                <li className="self-start rounded-2xl rounded-bl-md border border-line bg-surface px-3.5 py-2.5 text-sm text-ink-2" data-testid="ask-thinking">
                  <span aria-hidden="true" className="mr-2 inline-flex gap-1 align-middle">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="size-1.5 rounded-full bg-cyan/80 motion-safe:animate-pulse" style={{ animationDelay: `${i * 160}ms` }} />
                    ))}
                  </span>
                  {t("thinking")}
                </li>
              )}
            </ol>
          </div>

          {offline ? (
            <p role="status" className="mt-4 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink-2">
              {t("error.offline")}
            </p>
          ) : (
            !busy && (
              <section aria-labelledby={`${id}-pills`} className="mt-5" data-testid="ask-pills">
                <h3 id={`${id}-pills`} className="mb-2.5 text-xs font-medium text-ink-2">
                  {showFollowUps ? td("followUpsLabel") : topic ? td("topicQuestions", { topic: t(`topics.${topic}`) }) : td("topicsLabel")}
                </h3>
                {showFollowUps ? (
                  <ul className="flex flex-col items-start gap-2" data-testid="ask-followups">
                    {followUps.map((s) => (
                      <QuestionPill key={s.id} suggestion={s} locale={locale} onAsk={() => ask_(s.q[locale], "followup", s.id)} onEdit={() => edit(s)} editLabel={td("edit", { q: s.q[locale] })} />
                    ))}
                    <li>
                      <button type="button" onClick={() => setMode("topics")} className="chip min-h-11 text-ink-2">
                        {td("moreTopics")}
                      </button>
                    </li>
                  </ul>
                ) : topic ? (
                  <ul className="flex flex-col items-start gap-2" data-testid="ask-topic-questions" data-topic={topic}>
                    {topicQuestions(topic, asked).map((s) => (
                      <QuestionPill key={s.id} suggestion={s} locale={locale} onAsk={() => ask_(s.q[locale], "pill", s.id)} onEdit={() => edit(s)} editLabel={td("edit", { q: s.q[locale] })} />
                    ))}
                    <li>
                      <button type="button" onClick={() => setMode("topics")} className="chip min-h-11 text-ink-2">
                        <span aria-hidden="true">&larr;</span>
                        {td("backToTopics")}
                      </button>
                    </li>
                  </ul>
                ) : (
                  <ul className="grid grid-cols-2 gap-2" data-testid="ask-topics">
                    {ASK_TOPICS.map((key) => (
                      <li key={key} className="last:odd:col-span-2">
                        <button
                          type="button"
                          aria-expanded={false}
                          onClick={() => setMode(key)}
                          className="group flex min-h-12 w-full items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3.5 text-left text-sm font-medium text-ink transition hover:border-cyan/45 hover:bg-cyan/5"
                        >
                          {t(`topics.${key}`)}
                          <span aria-hidden="true" className="text-ink-3 transition group-hover:translate-x-0.5 group-hover:text-cyan">
                            &rarr;
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )
          )}
        </div>

        <footer className="shrink-0 border-t border-line px-3 pt-3 pb-2">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              ask_(value, typedSource);
            }}
            className="flex items-center gap-2"
          >
            <label htmlFor={`${id}-q`} className="sr-only">
              {td("inputLabel")}
            </label>
            <input
              ref={inputRef}
              id={`${id}-q`}
              type="text"
              value={value}
              maxLength={ASK_MAX_QUESTION}
              autoComplete="off"
              enterKeyHint="send"
              disabled={offline}
              placeholder={td("placeholder")}
              onChange={(event) => setValue(event.target.value)}
              className="min-h-11 min-w-0 flex-1 rounded-full border border-line-2 bg-surface px-4 text-base text-ink transition-colors placeholder:text-ink-3 hover:border-ink-3 focus:border-cyan/60 focus:outline-none disabled:opacity-60 sm:text-[15px]"
            />
            <button
              type="submit"
              disabled={busy || offline || !value.trim()}
              aria-label={td("send")}
              className="grid size-11 shrink-0 place-items-center rounded-full bg-cyan text-void transition hover:bg-cyan/85 disabled:bg-surface-2 disabled:text-ink-3"
            >
              <SendIcon />
            </button>
          </form>
          <details className="group mt-1.5 px-1 text-xs leading-5 text-ink-3">
            <summary className="inline-flex min-h-8 cursor-pointer items-center gap-1 list-none hover:text-ink-2 [&::-webkit-details-marker]:hidden">
              {t("privacyTitle")}
              <span aria-hidden="true" className="transition group-open:rotate-180">
                &#8964;
              </span>
            </summary>
            <p className="pb-1 text-ink-2">{t("privacy")}</p>
          </details>
        </footer>
      </div>
    </>
  );
}

function Message({
  message,
  locale,
  errorText,
  labels,
  onCite,
}: {
  message: ThreadMessage;
  locale: Locale;
  errorText: (state: { error?: ThreadMessage["error"]; retryAfter?: number }) => string;
  labels: { you: string; hq: string };
  /** Called before a source link navigates (closes the bottom sheet, which covers the page). */
  onCite?: () => void;
}) {
  if (message.role === "user") {
    return (
      <li className="max-w-[85%] self-end rounded-2xl rounded-br-md border border-cyan/25 bg-cyan/10 px-3.5 py-2 text-[15px] leading-6 break-words text-ink" data-role="user">
        <span className="sr-only">{labels.you}: </span>
        {message.text}
      </li>
    );
  }
  if (message.role === "system") {
    return (
      <li className="self-stretch rounded-xl border border-amber/30 bg-amber/5 px-3.5 py-2.5 text-sm leading-5 text-ink" data-role="system">
        {errorText(message)}
      </li>
    );
  }
  return (
    <li className="max-w-[92%] self-start rounded-2xl rounded-bl-md border border-line bg-surface px-3.5 py-2.5" data-role="assistant">
      <p className="text-[15px] leading-6 break-words whitespace-pre-wrap text-ink">
        <span className="sr-only">{labels.hq}: </span>
        {message.text}
      </p>
      {message.cite && <AskCiteLink path={message.cite} locale={locale} onNavigate={onCite} className="mt-1.5 text-[13px] leading-5" />}
      {message.contact && <AskContactCard contact={message.contact} locale={locale} onNavigate={onCite} className="mt-2" />}
      {message.outcome && message.outcome !== "fallback" && <AskAsOf asOf={message.asOf} locale={locale} className="mt-1.5 text-[11px] leading-4 text-ink-3" />}
    </li>
  );
}

function QuestionPill({ suggestion, locale, onAsk, onEdit, editLabel }: { suggestion: Suggestion; locale: Locale; onAsk: () => void; onEdit: () => void; editLabel: string }) {
  return (
    <li className="flex max-w-full items-stretch rounded-[22px] border border-line bg-surface-2 transition hover:border-cyan/45" data-qid={suggestion.id}>
      <button type="button" onClick={onAsk} className="min-h-11 min-w-0 rounded-l-[22px] py-2 pr-2 pl-4 text-left text-sm leading-5 text-ink hover:text-cyan">
        {suggestion.q[locale]}
      </button>
      <button
        type="button"
        onClick={onEdit}
        aria-label={editLabel}
        title={editLabel}
        className="grid min-h-11 w-11 shrink-0 place-items-center rounded-r-[22px] border-l border-line text-ink-3 transition hover:text-ink"
      >
        <EditIcon />
      </button>
    </li>
  );
}

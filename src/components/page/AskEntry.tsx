"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { isAskEnabled } from "@/ask/status";
import { ASK_MAX_QUESTION } from "@/ask/protocol";
import { openAsk } from "@/hud/events";
import { loadAskChat } from "@/hud/ask/AskDock";
import { requestAskStatus, setHeroVisible, useAskStatus } from "@/hud/ask/availability";
import { SendIcon, SparkIcon } from "@/hud/ask/icons";

/** Topic keys, in pill order (labels come from messages; the curated bank loads with the panel). */
const TOPICS = ["work", "ai", "career", "contact"] as const;

/** Height of the bottom band the floating launcher occupies. */
const LAUNCHER_BAND_PX = 120;

const preload = () => {
  void requestAskStatus();
  void loadAskChat();
};

/**
 * Home hero ask bar: an input and the four topic pills. Server-rendered HTML with nothing fetched
 * until focus, hover or idle; submitting (or a topic) opens the shared dock. When Ask the HQ is off
 * it turns invisible but keeps its space, so nothing below it shifts (CLS).
 */
export function AskHeroBar() {
  const t = useTranslations("ask");
  const th = useTranslations("ask.hero");
  const id = useId();
  const status = useAskStatus();
  const [value, setValue] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const off = status === null || (status !== undefined && !isAskEnabled(status));

  // While the bar reaches the bottom band where the floating launcher sits (phones, short
  // viewports), the launcher steps aside instead of covering it.
  useEffect(() => {
    const node = ref.current;
    if (!node || off || typeof IntersectionObserver === "undefined") return;
    const band = `${-Math.max(0, window.innerHeight - LAUNCHER_BAND_PX)}px 0px 0px 0px`;
    const observer = new IntersectionObserver((records) => setHeroVisible(records.some((r) => r.isIntersecting)), { rootMargin: band });
    observer.observe(node);
    return () => {
      observer.disconnect();
      setHeroVisible(false);
    };
  }, [off]);

  return (
    <div ref={ref} aria-hidden={off || undefined} inert={off} className={`mt-8 max-w-[640px] ${off ? "invisible" : ""}`} data-testid="ask-hero" data-off={off ? "" : undefined}>
      <label htmlFor={`${id}-q`} className="pv-data mb-3 flex items-center gap-2 text-cyan">
        <SparkIcon className="size-4" />
        {th("label")}
      </label>
      <form
        role="search"
        aria-label={th("label")}
        onSubmit={(event) => {
          event.preventDefault();
          const q = value.trim();
          if (!q) return;
          setValue("");
          openAsk(q, { source: "hero" });
        }}
        onPointerEnter={preload}
        className="flex items-center gap-2 rounded-full border border-line-2 bg-surface py-1.5 pr-1.5 pl-4 transition-colors focus-within:border-cyan/60 hover:border-ink-3"
      >
        <input
          id={`${id}-q`}
          type="text"
          value={value}
          maxLength={ASK_MAX_QUESTION}
          autoComplete="off"
          enterKeyHint="send"
          placeholder={th("placeholder")}
          onFocus={preload}
          onChange={(event) => setValue(event.target.value)}
          className="min-h-11 min-w-0 flex-1 bg-transparent text-base text-ink placeholder:text-ink-3 focus:outline-none sm:text-[17px]"
        />
        <button type="submit" disabled={!value.trim()} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-cyan px-4 font-semibold text-void transition hover:bg-cyan/85 disabled:bg-surface-2 disabled:text-ink-3 sm:px-5">
          <span className="hidden sm:inline">{th("submit")}</span>
          <SendIcon className="size-[18px] sm:hidden" />
          <span className="sr-only sm:hidden">{th("submit")}</span>
        </button>
      </form>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="pv-small mr-1 text-ink-2">{th("topicsLabel")}</span>
        {TOPICS.map((topic) => (
          <button key={topic} type="button" onPointerEnter={preload} onFocus={preload} onClick={() => openAsk(undefined, { topic, source: "hero" })} className="chip min-h-11 px-4 text-sm">
            {t(`topics.${topic}`)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Renders its children only once Ask the HQ is known to be on (below-the-fold sections, so no visible shift). */
export function AskOnly({ children }: { children: ReactNode }) {
  const status = useAskStatus();
  return isAskEnabled(status) ? <>{children}</> : null;
}

/** Compact "Ask AI" call to action (About): opens the dock. */
export function AskCta() {
  const t = useTranslations("ask.cta");
  return (
    <button type="button" onPointerEnter={preload} onFocus={preload} onClick={() => openAsk(undefined, { source: "dock" })} className="pv-btn pv-btn-primary gap-2" data-testid="ask-cta">
      <SparkIcon />
      {t("button")}
    </button>
  );
}

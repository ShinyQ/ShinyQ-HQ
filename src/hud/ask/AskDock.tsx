"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { isAskEnabled } from "@/ask/status";
import type { Locale } from "@/content/schema";
import { onHudCommand } from "@/hud/events";
import { BOOT_ATTR } from "@/lib/boot-first";
import type { AskRequest } from "./AskChat";
import { requestAskStatus, scheduleAskStatus, setAskPanelOpen, useAskStatus, useDockLayout, useHeroVisible, useTowerOpen } from "./availability";
import { CloseIcon, SparkIcon } from "./icons";

export const loadAskChat = () => import("./AskChat");
const AskChat = dynamic(loadAskChat, { ssr: false });

export const TEASER_KEY = "hq:ask-teaser";
const TEASER_DELAY_MS = 6000;
const TEASER_DELAY_3D_MS = 9000;
const TEASER_SHOW_MS = 14000;

function teaserSeen(): boolean {
  try {
    return sessionStorage.getItem(TEASER_KEY) !== null;
  } catch {
    return true;
  }
}

function markTeaserSeen() {
  try {
    sessionStorage.setItem(TEASER_KEY, "1");
  } catch {
    // Without storage the teaser may show again on the next page.
  }
}

const DIALOG_BOX = "[data-testid='dialog-box']";
const DIALOG_WATCH_MS = 500;
const dialogOpen = () => Boolean(document.querySelector(DIALOG_BOX));
const modalOpen = () => Boolean(document.querySelector("[role='dialog'][aria-modal='true']"));

/**
 * Ask the HQ dock, mounted once in the locale layout (outside #site-shell, so it works over the 3D
 * tower). Owns the floating Page View launcher (bottom-left; the 3D HUD has its own pill in the
 * top-right cluster), the once-per-session teaser and the lazily loaded chat panel. Every entry
 * point (hero bar, launcher, 3D pill, Rover Terminal, Cmd-K, `openAsk`) opens it through the
 * `hq:hud` "ask" command.
 */
export function AskDock({ locale }: { locale: Locale }) {
  const t = useTranslations("ask.dock");
  const status = useAskStatus();
  const tower = useTowerOpen();
  const layout = useDockLayout();
  const hero = useHeroVisible();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [request, setRequest] = useState<AskRequest | null>(null);
  const [teaser, setTeaser] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  useEffect(() => setAskPanelOpen(open), [open]);
  const enabled = isAskEnabled(status);

  const show = useCallback((next: Omit<AskRequest, "id">) => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body) returnFocus.current = active;
    void requestAskStatus();
    markTeaserSeen();
    setTeaser(false);
    setRequest({ id: Date.now(), ...next });
    setMounted(true);
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    const target = returnFocus.current;
    returnFocus.current = null;
    window.requestAnimationFrame(() => {
      if (target?.isConnected) target.focus({ preventScroll: true });
      else launcherRef.current?.focus({ preventScroll: true });
    });
  }, []);

  useEffect(() => {
    scheduleAskStatus();
    return onHudCommand((command) => {
      if (command.type === "ask") show({ q: command.q, topic: command.topic, source: command.source });
      else setOpen(false);
    });
  }, [show]);

  // Teaser: once per session, a few seconds after the feature is known to be on.
  useEffect(() => {
    if (!enabled || open || (hero && !tower) || teaserSeen()) return;
    let hide: number | undefined;
    const delay = tower ? TEASER_DELAY_3D_MS : TEASER_DELAY_MS;
    const attempt = (retries: number) => {
      if (teaserSeen()) return;
      if (document.documentElement.hasAttribute(BOOT_ATTR) || modalOpen() || dialogOpen()) {
        if (retries > 0) timer = window.setTimeout(() => attempt(retries - 1), delay);
        return;
      }
      markTeaserSeen();
      setTeaser(true);
      hide = window.setTimeout(() => setTeaser(false), TEASER_SHOW_MS);
    };
    let timer = window.setTimeout(() => attempt(2), delay);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(hide);
    };
  }, [enabled, open, tower, hero]);

  // Rover speaking takes the stage: the nudge steps aside (it stays "seen"). The watch runs only while the
  // teaser shows, so hiding it (the hold ends, dismiss, Ask opens) stops the interval.
  useEffect(() => {
    if (!teaser) return;
    const watch = window.setInterval(() => {
      if (dialogOpen()) setTeaser(false);
    }, DIALOG_WATCH_MS);
    return () => window.clearInterval(watch);
  }, [teaser]);

  const showLauncher = enabled && !tower && !open && !hero;

  return (
    <>
      {(showLauncher || (teaser && enabled && !open && tower)) && (
        <div
          className={`no-print pointer-events-none fixed z-40 flex gap-2 ${
            tower
              ? "top-[var(--hq-teaser-top,116px)] right-3 sm:right-4"
              : "bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 flex-col-reverse items-start sm:bottom-6 sm:left-6 sm:flex-row sm:items-center sm:gap-3"
          }`}
        >
          {showLauncher && (
            <button
              ref={launcherRef}
              type="button"
              onClick={() => show({ source: "dock" })}
              onPointerEnter={() => void loadAskChat()}
              onFocus={() => void loadAskChat()}
              aria-haspopup="dialog"
              aria-label={t("launcherLabel")}
              data-testid="ask-launcher"
              className="glass glass-solid pointer-events-auto inline-flex min-h-12 shrink-0 items-center gap-2.5 rounded-full border-cyan/40 pr-5 pl-4 font-semibold text-ink shadow-[0_10px_28px_-10px_rgb(34_211_238/0.55)] transition hover:border-cyan/70 hover:text-cyan focus-visible:outline-offset-4 sm:min-h-14 sm:pr-6 sm:text-[17px]"
            >
              <span className="text-cyan">
                <SparkIcon className="size-5" />
              </span>
              {t("launcher")}
            </button>
          )}
          {teaser && enabled && !open && (
            <div role="status" className="pointer-events-auto flex max-w-[min(300px,calc(100vw-2rem))] items-start gap-1 motion-safe:animate-[ask-teaser-in_.4s_cubic-bezier(.16,1,.3,1)]" data-testid="ask-teaser">
              <button
                type="button"
                onClick={() => show({ source: "dock" })}
                className="glass glass-solid min-h-11 rounded-2xl px-4 py-2.5 text-left text-sm leading-5 text-ink transition hover:border-cyan/50"
              >
                {t("teaser")}
              </button>
              <button
                type="button"
                onClick={() => setTeaser(false)}
                aria-label={t("teaserDismiss")}
                className="glass glass-solid grid size-11 shrink-0 place-items-center rounded-full text-ink-2 hover:text-ink"
              >
                <CloseIcon className="size-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {mounted && <AskChat open={open} locale={locale} layout={layout} tower={tower} status={status} request={request} onClose={close} />}
    </>
  );
}

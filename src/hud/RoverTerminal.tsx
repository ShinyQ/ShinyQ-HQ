"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import type { Locale, Mission } from "@/content/schema";
import { resolveReducedMotion } from "@/lib/motion";
import { useHQStore } from "@/store/useHQStore";
import { greetingKey } from "./terminal";

export { TERMINAL_SEEN_KEY, markTerminalSeen } from "./terminal";
const CHAR_MS = 12;
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia?.(REDUCED_MOTION);
  query?.addEventListener("change", onChange);
  return () => query?.removeEventListener("change", onChange);
}

/** `prefers-reduced-motion`, unless the visitor's Motion setting (store `motion`) overrides it. */
export function usePrefersReducedMotion(): boolean {
  const motion = useHQStore((s) => s.motion);
  const system = useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia?.(REDUCED_MOTION).matches ?? false,
    () => false,
  );
  return resolveReducedMotion(motion, system);
}

export interface RoverTerminalProps {
  open: boolean;
  locale: Locale;
  /** Already ordered (see `orderTerminalMissions`); the keys 1 to 9 cover up to 9. */
  missions: readonly Mission[];
  onRun: (missionId: string) => void;
  /** Esc, "drive myself", close button or backdrop. */
  onClose: () => void;
  /** Overrides the clock for the greeting (tests, previews). */
  now?: Date;
  /** Overrides `prefers-reduced-motion` and the Motion setting. */
  reducedMotion?: boolean;
  /** Positioning override, e.g. to anchor next to the rover in 3D. */
  className?: string;
}

/**
 * Rover menu (spec appendix 02 section 4), a terminal-styled panel: a greeting, the numbered missions and
 * "drive myself". Digit keys 1 to N (one per mission), arrows plus Home/End and Enter, tap, Esc. Bottom sheet on
 * mobile; the panel never outgrows the viewport and its option list scrolls.
 */
export function RoverTerminal({ open, reducedMotion, onRun, onClose, ...rest }: RoverTerminalProps) {
  const systemReduced = usePrefersReducedMotion();
  const [openedBefore, setOpenedBefore] = useState(false);
  if (!open) return null;
  return (
    <TerminalPanel
      {...rest}
      animate={!openedBefore && !(reducedMotion ?? systemReduced)}
      onRun={(missionId) => {
        setOpenedBefore(true);
        onRun(missionId);
      }}
      onClose={() => {
        setOpenedBefore(true);
        onClose();
      }}
    />
  );
}

interface PanelProps extends Omit<RoverTerminalProps, "open" | "reducedMotion"> {
  animate: boolean;
}

function TerminalPanel({ locale, missions, onRun, onClose, now, className, animate }: PanelProps) {
  const t = useTranslations("hud.terminal");
  const id = useId();
  const [time] = useState(() => now ?? new Date());
  const lines = [t("prompt"), `${t(`greeting.${greetingKey(time.getHours(), locale)}`)}.`, t("question")];
  const total = lines.reduce((sum, line) => sum + line.length, 0);
  const [typed, setTyped] = useState(animate ? 0 : total);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const typing = typed < total;
  const optionCount = missions.length + 1;

  useEffect(() => {
    if (!animate) return;
    const timer = window.setInterval(() => {
      setTyped((n) => {
        if (n + 1 >= total) window.clearInterval(timer);
        return Math.min(total, n + 1);
      });
    }, CHAR_MS);
    return () => window.clearInterval(timer);
  }, [animate, total]);

  // Read during the first render, before the list takes focus.
  const [previous] = useState(() => (typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null)));
  useEffect(() => {
    listRef.current?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, [previous]);

  useEffect(() => {
    document.getElementById(`${id}-opt-${active}`)?.scrollIntoView?.({ block: "nearest" });
  }, [active, id]);

  const choose = (index: number) => {
    if (index < missions.length) return onRun(missions[index].id);
    onClose();
  };

  const focusables = () => [...(panelRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), [tabindex='0']") ?? [])];

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (typing) setTyped(total);
    const key = event.key;
    if (/^[1-9]$/.test(key)) {
      const index = Number(key) - 1;
      if (index < missions.length) {
        event.preventDefault();
        choose(index);
      }
      return;
    }
    switch (key) {
      case "ArrowDown":
        event.preventDefault();
        setActive((i) => (i + 1) % optionCount);
        return;
      case "ArrowUp":
        event.preventDefault();
        setActive((i) => (i - 1 + optionCount) % optionCount);
        return;
      case "Home":
        event.preventDefault();
        setActive(0);
        return;
      case "End":
        event.preventDefault();
        setActive(optionCount - 1);
        return;
      case "Enter":
      case " ":
        if (event.target !== listRef.current) return;
        event.preventDefault();
        choose(active);
        return;
      case "Escape":
        event.preventDefault();
        onClose();
        return;
      case "Tab":
        trapTab(event);
        return;
    }
  };

  const trapTab = (event: KeyboardEvent<HTMLDivElement>) => {
    const nodes = focusables();
    if (nodes.length === 0) return;
    event.preventDefault();
    const index = nodes.indexOf(document.activeElement as HTMLElement);
    const next = event.shiftKey ? (index - 1 + nodes.length) % nodes.length : (index + 1) % nodes.length;
    nodes[next].focus();
  };

  let budget = typed;
  const shown = lines.map((line) => {
    const part = line.slice(0, Math.max(0, budget));
    budget -= line.length;
    return part;
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-void/60 pt-[max(0.75rem,env(safe-area-inset-top))] sm:justify-end sm:bg-transparent sm:p-6"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        onKeyDown={onKeyDown}
        onClick={(event) => event.stopPropagation()}
        className={
          className ??
          "flex max-h-[calc(100dvh-max(0.75rem,env(safe-area-inset-top)))] w-full flex-col overflow-hidden rounded-t-2xl border border-terminal-fg/40 bg-terminal-bg/95 pb-[env(safe-area-inset-bottom)] font-mono text-[13px] leading-5 text-terminal-fg shadow-[0_12px_40px_rgb(0_0_0/0.45),0_0_32px_rgb(52_211_153/0.18),inset_0_1px_0_rgb(255_255_255/0.05)] sm:max-h-[calc(100dvh-3rem)] sm:w-[360px] sm:rounded-2xl sm:pb-0"
        }
      >
        <div className="flex shrink-0 items-center justify-between border-b border-terminal-fg/25 py-1 pr-1 pl-4">
          <h2 id={`${id}-title`} className="label text-terminal-fg">
            {t("title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded text-terminal-fg/80 hover:text-terminal-hi"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <div className="shrink-0 px-4 pt-3 pb-2">
          <p className="sr-only">{lines.join(" ")}</p>
          <div aria-hidden="true" className="min-h-[60px]">
            {/* The untyped rest is laid out but invisible and the cursor takes no width, so the bottom
                sheet keeps its height while the lines type (no layout shift). */}
            {shown.map((part, i) => (
              <p key={i} className={i === 0 ? "text-terminal-hi" : undefined}>
                {part}
                {typing && part.length > 0 && part.length < lines[i].length && (
                  <span className="relative">
                    <span className="absolute animate-pulse">_</span>
                  </span>
                )}
                {part.length < lines[i].length && <span className="invisible">{lines[i].slice(part.length)}</span>}
              </p>
            ))}
          </div>
        </div>

        <ul
          ref={listRef}
          role="listbox"
          tabIndex={0}
          aria-label={t("options")}
          aria-activedescendant={`${id}-opt-${active}`}
          className="mx-3 mb-3 min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-[10px] border border-terminal-fg/25 bg-black/40 p-1 outline-none focus-visible:ring-1 focus-visible:ring-terminal-fg/60"
        >
          {[...missions.map((m) => m.label[locale]), t("driveMyself")].map((label, index) => {
            const selected = index === active;
            const key = index < missions.length ? String(index + 1) : "esc";
            return (
              <li
                key={key}
                id={`${id}-opt-${index}`}
                role="option"
                aria-selected={selected}
                aria-keyshortcuts={key === "esc" ? "Escape" : key}
                onClick={() => choose(index)}
                onMouseEnter={() => setActive(index)}
                className={`flex min-h-11 cursor-pointer items-center gap-2 rounded px-2 ${
                  selected ? "bg-terminal-fg/15 text-terminal-hi" : "hover:bg-terminal-fg/10"
                }`}
              >
                <span aria-hidden="true" className="w-3">
                  {selected ? ">" : ""}
                </span>
                <span aria-hidden="true" className="text-terminal-fg/85">
                  [{key}]
                </span>
                <span>{label}</span>
              </li>
            );
          })}
        </ul>
        <p className="hidden shrink-0 border-t border-terminal-fg/25 px-4 py-2 text-[11px] text-terminal-fg/85 sm:block">
          {t("hint", { last: missions.length })}
        </p>
      </div>
    </div>
  );
}

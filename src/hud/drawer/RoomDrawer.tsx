"use client";

import { useTranslations } from "next-intl";
import { createElement, Suspense, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { DrawerTab, Locale, RoomId } from "@/content/schema";
import type { RoomArchitecture, RoomView } from "@/content/room-views/types";
import { AccentDot } from "@/components/AccentDot";
import { Gallery as ImageGallery } from "@/components/Gallery";
import { LiveSiteLink } from "@/components/LiveSiteLink";
import { MetricStrip } from "@/components/MetricStrip";
import { ShareLinks } from "@/components/ShareLinks";
import { TypeIcon } from "@/components/TypeIcon";
import { CAREER_TONE } from "@/experience/fx/holoIcons";
import { Link } from "@/i18n/navigation";
import { ACCENT_TEXT } from "@/lib/accent";
import { lazyRoomBody } from "./bodies";
import { Chips, MetricTiles, Sections } from "./blocks";
import { SHEET_SNAPS, snapSheet, type DrawerLayout } from "./layout";

// HologramOverlay and older callers import the blocks from here.
export { MetricTiles, Sections };

export interface RoomDrawerProps {
  view: RoomView;
  locale: Locale;
  layout: DrawerLayout;
  tab: DrawerTab;
  readme: boolean;
  /** Titles of the prev/next rooms for the arrow buttons. */
  neighbours?: { prev?: string; next?: string };
  /** Side layout only: match the Ask side panel's width while it is open over the drawer. */
  narrow?: boolean;
  onTab: (tab: DrawerTab) => void;
  onToggleReadme: () => void;
  onClose: () => void;
  onNavigate: (room: RoomId) => void;
  onHologram: () => void;
  /** "See the case study on L3" style link to a room on another floor. */
  onLink: (room: RoomId) => void;
  /** Leaving the tower for a full page (switches to page view first). */
  onLeave?: () => void;
}

const FOCUSABLE = "a[href], button:not([disabled]), [tabindex='0'], pre[tabindex]";

const KIND_STYLE: Record<RoomArchitecture["nodes"][number]["kind"], string> = {
  client: "border-cyan/60 text-cyan",
  service: "border-blue/60 text-blue",
  ai: "border-violet/60 text-violet",
  data: "border-green/60 text-green",
  human: "border-amber/60 text-amber",
  external: "border-white/50 text-white",
};

function isTextInput(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

function Gallery({ view }: { view: RoomView }) {
  const t = useTranslations("drawer");
  if (view.gallery.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="label text-ink-2">{t("gallery")}</h3>
      <ImageGallery images={view.gallery} label={`${t("gallery")}: ${view.title}`} layout="strip" />
    </section>
  );
}

export function ArchitectureGrid({ architecture }: { architecture: RoomArchitecture }) {
  const t = useTranslations("drawer");
  const tk = useTranslations("labs.nodeKind");
  const layers = Math.max(...architecture.nodes.map((n) => n.layer)) + 1;
  const byId = new Map(architecture.nodes.map((n) => [n.id, n]));
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto pb-1">
        <ol className="grid min-w-[360px] gap-2" style={{ gridTemplateColumns: `repeat(${layers}, minmax(0, 1fr))` }} aria-label={t("tabs.architecture")}>
          {architecture.nodes.map((node) => (
            <li
              key={node.id}
              className={`flex flex-col gap-0.5 rounded-lg border bg-white/[0.03] p-2 ${KIND_STYLE[node.kind]}`}
              style={{ gridColumn: node.layer + 1, gridRow: node.row + 1 }}
            >
              <span className="label text-[10px] opacity-80">{tk(node.kind)}</span>
              <span className="text-[13px] leading-4 font-semibold text-ink">{node.label}</span>
            </li>
          ))}
        </ol>
      </div>
      {architecture.edges.length > 0 && (
        <div>
          <h3 className="label mb-2 text-ink-2">{t("flow")}</h3>
          <ul className="space-y-1 font-mono text-[12px] leading-5 text-ink-2">
            {architecture.edges.map((edge, i) => (
              <li key={i}>
                <span className="text-ink">{byId.get(edge.from)?.label}</span>{" "}
                <span aria-hidden="true" className="text-cyan">
                  {edge.async ? "⇢" : "→"}
                </span>
                <span className="sr-only">{" "}{t(edge.async ? "flowAsyncTo" : "flowTo")}{" "}</span>{" "}
                <span className="text-ink">{byId.get(edge.to)?.label}</span>
                {edge.label && <span className="text-ink-3"> ({edge.label})</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

interface OverflowProps {
  readme: boolean;
  onToggleReadme: () => void;
  page?: string;
  onLeave?: () => void;
  /** Related room on another floor (also shown under the title, which scrolls away). */
  link?: { label: string; onClick: () => void };
}

const MENU_ITEM = "flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-3 text-left text-sm text-ink transition hover:bg-white/5";

/** Runs `onLeave` for plain clicks only: a new tab or window leaves this tab in 3D. */
function leaveOnPlainClick(onLeave?: () => void) {
  return (event: ReactMouseEvent) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    onLeave?.();
  };
}

/**
 * A drawer page link opens the Classic site, so it says so in the URL: the target never equals the URL the
 * room pushed (which would keep the 3D route mounted), and new tabs open Classic too. `data-hq-view` keeps
 * ViewParamSync from stripping it while the tab is in 3D.
 */
function classicHref(page: string): string {
  const at = page.indexOf("#");
  return at < 0 ? `${page}?view=classic` : `${page.slice(0, at)}?view=classic${page.slice(at)}`;
}

type RenderReadme = (typeof import("./ascii"))["renderReadme"];

/** The README renderer loads the first time the README view opens (Round 7 B: keeps it out of the main 3D chunk). */
function useReadmeRenderer(open: boolean): RenderReadme | null {
  const [render, setRender] = useState<RenderReadme | null>(null);
  useEffect(() => {
    if (!open || render) return;
    let alive = true;
    void import("./ascii").then((m) => alive && setRender(() => m.renderReadme));
    return () => {
      alive = false;
    };
  }, [open, render]);
  return render;
}

function Overflow({ readme, onToggleReadme, page, onLeave, link }: OverflowProps) {
  const t = useTranslations("drawer");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label={t("more")}
        aria-keyshortcuts="t"
        title={t("readmeHint")}
        onClick={() => setOpen((v) => !v)}
        className="grid size-11 place-items-center rounded-full text-ink-2 transition hover:bg-white/5 hover:text-ink"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      </button>
      {open && (
        <ul id={id} className="glass glass-solid absolute top-12 right-0 z-30 w-64 p-1.5">
          <li>
            <button
              type="button"
              aria-pressed={readme}
              aria-keyshortcuts="t"
              title={t("readmeHint")}
              onClick={() => {
                setOpen(false);
                onToggleReadme();
              }}
              className={MENU_ITEM}
            >
              <span>{t("readme")}</span>
              <kbd className="label rounded border border-glass-border px-1.5 py-0.5 text-ink-3">t</kbd>
            </button>
          </li>
          {link && (
            <li>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  link.onClick();
                }}
                className={MENU_ITEM}
              >
                <span>{link.label}</span>
                <span aria-hidden="true" className="text-amber">
                  →
                </span>
              </button>
            </li>
          )}
          {page && (
            <li>
              <Link href={classicHref(page)} onClick={leaveOnPlainClick(onLeave)} data-hq-view="page" className={MENU_ITEM}>
                {t("openPage")}
              </Link>
            </li>
          )}
          <ShareLinks
            variant="menu"
            itemClassName={MENU_ITEM}
            labels={{ group: tc("share"), classic: tc("copyClassicLink"), threeD: tc("copy3dLink"), copied: tc("linkCopied"), failed: tc("linkCopyFailed") }}
          />
        </ul>
      )}
    </div>
  );
}

/** Pointer-driven sheet height with snap points (`SHEET_SNAPS`: half open and nearly full). */
function useSheet(active: boolean, onClose: () => void) {
  const [fraction, setFraction] = useState<number>(SHEET_SNAPS[0]);
  const drag = useRef<{ startY: number; start: number; lastY: number; lastT: number; v: number } | null>(null);
  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (!active) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { startY: e.clientY, start: fraction, lastY: e.clientY, lastT: e.timeStamp, v: 0 };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const h = window.innerHeight || 1;
    const dt = Math.max(1, e.timeStamp - d.lastT);
    d.v = ((e.clientY - d.lastY) / h / dt) * 1000;
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    setFraction(Math.min(0.96, Math.max(0.1, d.start - (e.clientY - d.startY) / h)));
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const snap = snapSheet(fraction, d.v);
    if (snap === "close") {
      setFraction(SHEET_SNAPS[0]);
      onClose();
    } else setFraction(snap);
  };
  return { fraction, setFraction, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp } };
}

function TabPanel({ view, tab, onHologram }: { view: RoomView; tab: DrawerTab; onHologram: () => void }) {
  const t = useTranslations("drawer");
  switch (tab) {
    case "architecture":
      return view.architecture ? (
        <div className="space-y-4">
          {view.hologram && <HologramButton onClick={onHologram} />}
          <ArchitectureGrid architecture={view.architecture} />
        </div>
      ) : (
        <p className="text-sm text-ink-2">{t("noArchitecture")}</p>
      );
    case "results":
      return <MetricTiles metrics={view.metrics} fluid />;
    case "stack":
      return <Chips items={view.stack.map((s) => s.name)} logos={view.stack.map((s) => s.logo)} />;
    default: {
      const headline = view.metrics.filter((m) => m.headline);
      return (
        <div className="space-y-5">
          {headline.length > 0 && (
            <section className="space-y-2">
              <h3 className="label text-ink-2">{t("keyResults")}</h3>
              <MetricStrip items={headline} label={t("keyResults")} variant="panel" />
            </section>
          )}
          <Sections sections={view.sections} />
          <Gallery view={view} />
        </div>
      );
    }
  }
}

function HologramButton({ onClick, compact = false }: { onClick: () => void; compact?: boolean }) {
  const t = useTranslations("drawer");
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-violet/60 font-semibold text-ink transition hover:border-violet hover:bg-violet/10 ${
        compact ? "px-3 text-[13px]" : "px-4 text-sm"
      }`}
    >
      <span aria-hidden="true" className="text-violet">
        ◈
      </span>
      {t("viewArchitecture")}
    </button>
  );
}

/** Wing, tier and type chips: under the title, and in the condensed bar when it has room. */
function Badges({ view, className, hidden = false }: { view: RoomView; className: string; hidden?: boolean }) {
  return (
    <span className={`label items-center gap-1.5 ${className}`} aria-hidden={hidden || undefined}>
      {view.badges.map((b) =>
        b.type ? (
          // Career types: the Neon line icon in its type hue, like the 3D room and the Page View chips.
          <span
            key={b.label}
            className="inline-flex items-center gap-1.5 rounded border border-current/40 px-1.5 py-0.5"
            style={{ color: CAREER_TONE[b.type] }}
            data-badge-type={b.type}
          >
            <TypeIcon type={b.type} size={14} className="shrink-0" />
            {b.label}
          </span>
        ) : (
          <span key={b.label} className={`rounded border border-current/40 px-1.5 py-0.5 ${ACCENT_TEXT[b.accent]}`}>
            {b.label}
          </span>
        ),
      )}
    </span>
  );
}

const ICON_BUTTON = "grid size-11 shrink-0 place-items-center rounded-full text-ink-2 transition hover:bg-white/5 hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent";
/** Scrolled this far into the body, a half-open bottom sheet expands to full height. */
const SHEET_EXPAND_AT = 24;

/**
 * Glass Drawer (appendix 02 section 6, appendix 04 section 2): the shared room panel for every
 * floor. Pods get tabs; every other room uses the single-pane variant (with an optional custom body
 * from `bodies.tsx`). Presentational: `DrawerHost` wires it to the store, data and URL.
 *
 * Layout, top to bottom: a slim bar that stays put (room code, badges, prev/next, menu, close; the
 * title joins it once the big title scrolls away), one scrolling region (title, subtitle and meta,
 * then the tabs, which stick under the bar, then the tab body), and a footer row: the primary action,
 * Visit live site for pods with a public site (R4-J, new tab), the cross-floor link right of them
 * (owner request: more room for the body), then View architecture.
 */
export function RoomDrawer({
  view,
  locale,
  layout,
  tab,
  readme,
  neighbours,
  narrow = false,
  onTab,
  onToggleReadme,
  onClose,
  onNavigate,
  onHologram,
  onLink,
  onLeave,
}: RoomDrawerProps) {
  const t = useTranslations("drawer");
  const tc = useTranslations("common");
  const tl = useTranslations("labs");
  const panel = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const tablist = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const tabsId = useId();
  const sheet = useSheet(layout === "sheet", onClose);
  // Condensed state belongs to one room, so a new room starts with the full header.
  const [condensedRoom, setCondensedRoom] = useState<RoomId | null>(null);
  const condensed = condensedRoom === view.id;
  const tabs = view.variant === "tabs" ? view.tabs : [];
  const activeTab = tabs.includes(tab) ? tab : "overview";
  const customBody = lazyRoomBody(view.kind);
  const renderReadme = useReadmeRenderer(readme);
  const readmeText = useMemo(
    () =>
      readme && renderReadme
        ? renderReadme(view, { overview: t("tabs.overview"), architecture: t("tabs.architecture"), results: t("tabs.results"), stack: t("tabs.stack"), links: t("openPage") })
        : "",
    [readme, renderReadme, view, t],
  );

  // Focus moves into the drawer on open and when the room changes; a new room starts at the top.
  useEffect(() => {
    panel.current?.focus({ preventScroll: true });
    if (scroller.current) scroller.current.scrollTop = 0;
  }, [view.id]);

  // A new tab starts at its top: when the tabs are stuck under the bar, scroll back to where they stick.
  useEffect(() => {
    const el = scroller.current;
    const bar = tablist.current;
    if (el && bar && el.scrollTop > bar.offsetTop) el.scrollTop = bar.offsetTop;
  }, [activeTab]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const title = heading.current;
    setCondensedRoom(el.scrollTop > Math.max(8, title ? title.offsetTop + title.offsetHeight - 8 : 0) ? view.id : null);
    if (layout === "sheet" && el.scrollTop > SHEET_EXPAND_AT && sheet.fraction < SHEET_SNAPS[SHEET_SNAPS.length - 1]) sheet.setFraction(SHEET_SNAPS[SHEET_SNAPS.length - 1]);
  };

  // Esc and `t` work wherever focus is (the canvas, the body) unless another modal owns the keyboard.
  const actions = useRef({ onClose, onToggleReadme });
  useEffect(() => {
    actions.current = { onClose, onToggleReadme };
  });
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      const other = [...document.querySelectorAll("[role='dialog'][aria-modal='true']")].some((d) => d !== panel.current);
      if (other || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "Escape") {
        event.preventDefault();
        actions.current.onClose();
      } else if (event.key.toLowerCase() === "t" && !isTextInput(event.target) && !event.repeat) {
        event.preventDefault();
        actions.current.onToggleReadme();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Focus stays inside the drawer while it is open (Tab and Shift+Tab wrap around).
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const focusables = [...(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter((el) => !el.hasAttribute("disabled"));
    if (focusables.length === 0) return;
    const index = focusables.indexOf(document.activeElement as HTMLElement);
    const next = event.shiftKey ? (index <= 0 ? focusables.length - 1 : index - 1) : index === focusables.length - 1 ? 0 : index + 1;
    event.preventDefault();
    focusables[next].focus();
  };

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const i = tabs.indexOf(activeTab);
    const move = { ArrowRight: 1, ArrowLeft: -1, Home: -i, End: tabs.length - 1 - i }[event.key];
    if (move === undefined) return;
    event.preventDefault();
    const next = tabs[(i + move + tabs.length) % tabs.length];
    onTab(next);
    document.getElementById(`${tabsId}-${next}`)?.focus();
  };

  // Side panel width comes from `--hq-drawer-w` (globals.css); with the Ask panel open it matches
  // the Ask panel (420 px), which then covers it exactly instead of leaving a sliver.
  const placement =
    layout === "side"
      ? `top-[124px] right-3 bottom-3 md:right-4 md:bottom-4 lg:top-[76px] ${narrow ? "w-[min(420px,calc(100vw-1.5rem))]" : "w-[min(var(--hq-drawer-w),calc(100vw-1.5rem))]"}`
      : "inset-x-0 bottom-0 rounded-b-none pb-[env(safe-area-inset-bottom)]";

  let body: ReactNode;
  if (readme && !renderReadme) {
    body = <p className="pv-small text-ink-2" role="status">{t("loading")}</p>;
  } else if (readme) {
    body = (
      <pre
        tabIndex={0}
        aria-label={t("readme")}
        className="overflow-x-auto rounded-lg border border-terminal-fg/30 bg-terminal-bg p-3 font-mono text-[12px] leading-5 whitespace-pre text-terminal-fg"
        data-testid="readme"
      >
        {readmeText}
      </pre>
    );
  } else if (view.variant === "tabs") {
    body = (
      <div id={`${tabsId}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-${activeTab}`} tabIndex={-1}>
        <TabPanel view={view} tab={activeTab} onHologram={onHologram} />
      </div>
    );
  } else if (customBody) {
    body = (
      <Suspense fallback={<p className="pv-small text-ink-2" role="status">{t("loading")}</p>}>
        {createElement(customBody, { view, locale })}
      </Suspense>
    );
  } else {
    body = (
      <div className="space-y-5">
        {view.metrics.length > 0 && <MetricTiles metrics={view.metrics} fluid />}
        <Sections sections={view.sections} />
        {view.stack.length > 0 && (
          <section className="space-y-2">
            <h3 className="label text-ink-2">{tc("stack")}</h3>
            <Chips items={view.stack.map((s) => s.name)} logos={view.stack.map((s) => s.logo)} />
          </section>
        )}
        <Gallery view={view} />
      </div>
    );
  }

  const primaryLabel = view.kind === "pod" ? tc("caseStudy") : view.kind === "post" ? t("rooms.readPost") : t("openPage");
  const showHologram = view.hologram && !readme && activeTab !== "architecture";
  const link = view.link ? { label: view.link.label, onClick: () => onLink(view.link!.room) } : undefined;
  const hasFooter = Boolean(view.page || view.external || view.live || link || showHologram);

  return (
    <div
      ref={panel}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      data-testid="room-drawer"
      data-layout={layout}
      data-room={view.id}
      data-condensed={condensed ? "true" : undefined}
      data-hq-cover=""
      className={`glass glass-solid pointer-events-auto absolute z-20 flex flex-col overflow-hidden shadow-[0_0_48px_-12px_rgb(0_0_0/0.8)] outline-none ${placement}`}
      style={layout === "sheet" ? { height: `${Math.round(sheet.fraction * 100)}dvh` } : undefined}
    >
      {layout === "sheet" && (
        <div className="flex shrink-0 justify-center">
          <button
            type="button"
            aria-label={sheet.fraction < 0.7 ? t("expand") : t("collapse")}
            onClick={() => sheet.setFraction(sheet.fraction < 0.7 ? SHEET_SNAPS[1] : SHEET_SNAPS[0])}
            className="flex h-6 w-full touch-none items-center justify-center"
            data-testid="sheet-handle"
            {...sheet.handlers}
          >
            <span aria-hidden="true" className="h-1.5 w-12 rounded-full bg-ink-3/60" />
          </button>
        </div>
      )}

      <header className="flex min-h-14 shrink-0 items-center gap-1 border-b border-glass-border py-1.5 pr-1.5 pl-4 sm:pl-5" data-testid="drawer-bar">
        <div className="@container/bar flex min-w-0 flex-1 flex-col justify-center">
          <p className={`label flex min-w-0 items-center gap-x-2 whitespace-nowrap ${ACCENT_TEXT[view.accent]}`}>
            <AccentDot tone={view.accent} size="md" />
            <span className="min-w-0 truncate">{view.code}</span>
            {condensed && <Badges view={view} className="hidden shrink-0 @[21rem]/bar:inline-flex" hidden />}
          </p>
          {/* The title joins the bar once the big one scrolls away (screen readers keep the h2). */}
          <div className={`grid motion-safe:transition-[grid-template-rows,opacity] motion-safe:duration-200 ${condensed ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
            <p aria-hidden="true" className="min-h-0 overflow-hidden" data-testid="drawer-compact-title">
              <span className="block truncate pt-1 text-[15px] leading-5 font-bold text-ink">{view.title}</span>
            </p>
          </div>
        </div>
        {(view.prev || view.next) && (
          <nav aria-label={tl("title")} className="flex shrink-0 items-center">
            <button
              type="button"
              disabled={!view.prev}
              onClick={() => view.prev && onNavigate(view.prev)}
              aria-label={neighbours?.prev ? `${t("previous")}: ${neighbours.prev}` : t("previous")}
              title={neighbours?.prev ?? t("previous")}
              className={ICON_BUTTON}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </button>
            <button
              type="button"
              disabled={!view.next}
              onClick={() => view.next && onNavigate(view.next)}
              aria-label={neighbours?.next ? `${t("next")}: ${neighbours.next}` : t("next")}
              title={neighbours?.next ?? t("next")}
              className={ICON_BUTTON}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          </nav>
        )}
        <Overflow readme={readme} onToggleReadme={onToggleReadme} page={view.page} onLeave={onLeave} link={link} />
        <button type="button" onClick={onClose} aria-label={t("close")} className={ICON_BUTTON}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </header>

      {/* Focusable so keyboard users can scroll long rooms (axe scrollable-region-focusable). */}
      <div
        ref={scroller}
        role="region"
        aria-label={t("label")}
        tabIndex={0}
        onScroll={onScroll}
        className="@container relative min-h-0 flex-1 overflow-y-auto overscroll-contain outline-none focus-visible:ring-1 focus-visible:ring-cyan/60 focus-visible:ring-inset"
        data-testid="drawer-body"
      >
        <div className="px-4 pt-4 pb-4 sm:px-5">
          {view.badges.length > 0 && <Badges view={view} className="mb-2 flex flex-wrap" />}
          <h2 ref={heading} id={titleId} className="text-[22px] leading-7 font-extrabold tracking-tight text-ink sm:text-[26px] sm:leading-8">
            {view.title}
          </h2>
          {view.subtitle && (
            <p className="mt-1 flex items-center gap-2 text-[15px] leading-6 text-ink-2">
              {view.logo && (
                <span className="inline-flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white p-0.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={view.logo.src} alt={view.logo.alt} width={24} height={24} className="h-full w-full object-contain" />
                </span>
              )}
              <span>{view.subtitle}</span>
            </p>
          )}
          {view.meta.length > 0 && <p className="mt-1 text-[13px] leading-5 text-ink-3">{view.meta.join(" · ")}</p>}
        </div>

        {tabs.length > 0 && !readme && (
          <div
            ref={tablist}
            role="tablist"
            aria-label={t("tabsLabel")}
            className="sticky top-0 z-10 flex gap-1 overflow-x-auto border-y border-glass-border bg-[rgb(10_10_18)] px-2 sm:px-3"
          >
            {tabs.map((id) => (
              <button
                key={id}
                id={`${tabsId}-${id}`}
                type="button"
                role="tab"
                aria-selected={id === activeTab}
                aria-controls={`${tabsId}-panel`}
                tabIndex={id === activeTab ? 0 : -1}
                onClick={() => onTab(id)}
                onKeyDown={onTabKey}
                className={`min-h-11 shrink-0 border-b-2 px-3 text-sm font-semibold transition ${
                  id === activeTab ? "border-cyan text-ink" : "border-transparent text-ink-2 hover:text-ink"
                }`}
              >
                {t(`tabs.${id}`)}
              </button>
            ))}
          </div>
        )}

        <div className={`px-4 pb-6 sm:px-5 ${tabs.length > 0 && !readme ? "pt-4" : "mx-4 border-t border-glass-border px-0 pt-4 sm:mx-5 sm:px-0"}`}>{body}</div>
      </div>

      {hasFooter && (
        <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-glass-border px-4 py-2.5 sm:px-5" data-testid="drawer-footer">
          {view.page && (
            <Link
              href={classicHref(view.page)}
              onClick={leaveOnPlainClick(onLeave)}
              data-hq-view="page"
              className="inline-flex min-h-11 shrink-0 items-center rounded-lg bg-cyan px-4 text-sm font-semibold text-void transition hover:bg-cyan/85"
            >
              {primaryLabel}
            </Link>
          )}
          {view.external && (
            <a
              href={view.external}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 shrink-0 items-center rounded-lg bg-cyan px-4 text-sm font-semibold text-void transition hover:bg-cyan/85"
            >
              {view.externalLabel ?? t("external")}
              <span className="sr-only"> ({tc("external")})</span>
            </a>
          )}
          {view.live && (
            <LiveSiteLink
              href={view.live}
              label={tc("visitLive")}
              srHint={tc("external")}
              testId="drawer-live-link"
              className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-cyan/50 px-3 text-[13px] font-semibold text-ink transition hover:border-cyan hover:bg-cyan/10"
            />
          )}
          {link && (
            <button
              type="button"
              onClick={link.onClick}
              data-testid="drawer-cross-link"
              className="inline-flex min-h-11 min-w-0 items-center gap-2 rounded-lg border border-amber/50 px-3 text-left text-[13px] font-semibold text-ink transition hover:border-amber hover:bg-amber/10"
            >
              <span className="min-w-0">{link.label}</span>
              <span aria-hidden="true" className="shrink-0 text-amber">
                →
              </span>
            </button>
          )}
          {showHologram && <HologramButton onClick={onHologram} compact />}
        </footer>
      )}
    </div>
  );
}

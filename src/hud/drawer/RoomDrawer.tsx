"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { DrawerTab, Locale, RoomId } from "@/content/schema";
import type { RoomArchitecture, RoomLinkItem, RoomMetric, RoomSection, RoomView } from "@/content/room-views/types";
import { Gallery as ImageGallery } from "@/components/Gallery";
import { Link } from "@/i18n/navigation";
import { ACCENT_DOT, ACCENT_TEXT } from "@/lib/accent";
import { renderReadme } from "./ascii";
import { ROOM_BODIES } from "./bodies";
import { SHEET_SNAPS, snapSheet, type DrawerLayout } from "./layout";

export interface RoomDrawerProps {
  view: RoomView;
  locale: Locale;
  layout: DrawerLayout;
  tab: DrawerTab;
  readme: boolean;
  /** Titles of the prev/next rooms for the arrow buttons. */
  neighbours?: { prev?: string; next?: string };
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

export function MetricTiles({ metrics, single = false }: { metrics: RoomMetric[]; single?: boolean }) {
  const tc = useTranslations("common.confidence");
  return (
    <ul className={`grid gap-2 ${single ? "" : "min-[420px]:grid-cols-2"}`}>
      {metrics.map((m, i) => (
        <li key={i} className="flex flex-col gap-1 rounded-xl border border-glass-border bg-white/[0.03] p-3" data-testid="metric">
          <p className="text-[28px] leading-8 font-extrabold tracking-tight text-ink">{m.value}</p>
          <p className="text-sm leading-5 text-ink">{m.label}</p>
          {m.context && <p className="text-[13px] leading-5 text-ink-2">{m.context}</p>}
          {m.confidence && <p className="label mt-auto pt-1 text-ink-3">{tc(m.confidence)}</p>}
        </li>
      ))}
    </ul>
  );
}

function ItemLink({ item }: { item: RoomLinkItem }) {
  const t = useTranslations("common");
  const body = (
    <>
      <span className="flex items-center gap-2 text-sm font-semibold text-ink">
        {item.logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.logo} alt="" width={16} height={16} className="size-4 shrink-0 object-contain" />
        )}
        {item.title}
      </span>
      {item.meta && <span className="block text-[13px] leading-5 text-ink-2">{item.meta}</span>}
    </>
  );
  if (!item.href) return <div className="py-1.5">{body}</div>;
  if (item.href.startsWith("/") && !item.external)
    return (
      <Link href={item.href} className="block min-h-11 rounded-md px-2 py-1.5 transition hover:bg-white/5">
        {body}
      </Link>
    );
  return (
    <a
      href={item.href}
      target={item.external ? "_blank" : undefined}
      rel={item.external ? "noopener noreferrer" : undefined}
      className="block min-h-11 rounded-md px-2 py-1.5 transition hover:bg-white/5"
    >
      {body}
      {item.external && <span className="sr-only"> ({t("external")})</span>}
    </a>
  );
}

export function Sections({ sections }: { sections: RoomSection[] }) {
  return (
    <>
      {sections.map((section, i) => (
        <section key={i} className="space-y-2">
          {section.title && <h3 className="label text-ink-2">{section.title}</h3>}
          {section.body && <p className="text-[15px] leading-6 text-ink-2">{section.body}</p>}
          {section.bullets && (
            <ul className="space-y-2">
              {section.bullets.map((b, j) => (
                <li key={j} className="flex gap-2 text-[15px] leading-6 text-ink-2">
                  <span aria-hidden="true" className="label pt-1.5 text-cyan">
                    {String(j + 1).padStart(2, "0")}
                  </span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}
          {section.items && (
            <ul className="-mx-2">
              {section.items.map((item, j) => (
                <li key={j}>
                  <ItemLink item={item} />
                </li>
              ))}
            </ul>
          )}
          {section.chips && <Chips items={section.chips} logos={section.chipLogos} />}
        </section>
      ))}
    </>
  );
}

function Chips({ items, logos }: { items: string[]; logos?: (string | null | undefined)[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <li key={`${item}-${i}`} className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-glass-border px-2.5 text-[13px] text-ink-2">
          {logos?.[i] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logos[i]} alt="" width={16} height={16} className="size-4" />
          )}
          {item}
        </li>
      ))}
    </ul>
  );
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
                <span className="sr-only">{edge.async ? " sends asynchronously to " : " to "}</span>{" "}
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

function Overflow({ readme, onToggleReadme, page, onLeave }: { readme: boolean; onToggleReadme: () => void; page?: string; onLeave?: () => void }) {
  const t = useTranslations("drawer");
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label={t("more")}
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
        <ul id={id} className="glass glass-solid absolute top-12 right-0 z-10 w-52 p-1.5">
          <li>
            <button
              type="button"
              aria-pressed={readme}
              onClick={() => {
                setOpen(false);
                onToggleReadme();
              }}
              className="flex min-h-11 w-full items-center justify-between rounded-md px-3 text-left text-sm text-ink transition hover:bg-white/5"
            >
              <span>{t("readme")}</span>
              <kbd className="label rounded border border-glass-border px-1.5 py-0.5 text-ink-3">t</kbd>
            </button>
          </li>
          {page && (
            <li>
              <Link href={page} onClick={onLeave} className="flex min-h-11 items-center rounded-md px-3 text-sm text-ink transition hover:bg-white/5">
                {t("openPage")}
              </Link>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/** Pointer-driven sheet height with snap points (appendix 04: 45% and 92%). */
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
      return <MetricTiles metrics={view.metrics} />;
    case "stack":
      return <Chips items={view.stack.map((s) => s.name)} logos={view.stack.map((s) => s.logo)} />;
    default:
      return (
        <div className="space-y-5">
          {view.metrics.length > 0 && (
            <section className="space-y-2">
              <h3 className="label text-ink-2">{t("keyResults")}</h3>
              <MetricTiles metrics={view.metrics.slice(0, 3)} />
            </section>
          )}
          <Sections sections={view.sections} />
          <Gallery view={view} />
        </div>
      );
  }
}

function HologramButton({ onClick }: { onClick: () => void }) {
  const t = useTranslations("drawer");
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-violet/60 px-4 text-sm font-semibold text-ink transition hover:border-violet hover:bg-violet/10"
    >
      <span aria-hidden="true" className="text-violet">
        ◈
      </span>
      {t("viewArchitecture")}
    </button>
  );
}

/**
 * Glass Drawer (appendix 02 section 6, appendix 04 section 2): the shared room panel for every
 * floor. Pods get tabs; every other room uses the single-pane variant (with an optional custom body
 * from `bodies.tsx`). Presentational: `DrawerHost` wires it to the store, data and URL.
 */
export function RoomDrawer({
  view,
  locale,
  layout,
  tab,
  readme,
  neighbours,
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
  const titleId = useId();
  const tabsId = useId();
  const sheet = useSheet(layout === "sheet", onClose);
  const tabs = view.variant === "tabs" ? view.tabs : [];
  const activeTab = tabs.includes(tab) ? tab : "overview";
  const Body = ROOM_BODIES[view.kind];
  const readmeText = useMemo(
    () =>
      readme
        ? renderReadme(view, { overview: t("tabs.overview"), architecture: t("tabs.architecture"), results: t("tabs.results"), stack: t("tabs.stack"), links: t("openPage") })
        : "",
    [readme, view, t],
  );

  // Focus moves into the drawer on open and when the room changes.
  useEffect(() => {
    panel.current?.focus({ preventScroll: true });
  }, [view.id]);

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

  const placement =
    layout === "side"
      ? "top-[68px] right-3 bottom-3 w-[min(420px,calc(100vw-1.5rem))] md:top-[76px] md:right-4 md:bottom-4"
      : "inset-x-0 bottom-0 rounded-b-none pb-[env(safe-area-inset-bottom)]";

  let body: ReactNode;
  if (readme) {
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
  } else if (Body) {
    body = <Body view={view} locale={locale} />;
  } else {
    body = (
      <div className="space-y-5">
        {view.metrics.length > 0 && <MetricTiles metrics={view.metrics} />}
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
      <header className="flex shrink-0 items-start gap-2 border-b border-glass-border px-4 pt-3 pb-3 sm:px-5">
        <div className="min-w-0 flex-1">
          <p className={`label flex flex-wrap items-center gap-x-2 gap-y-1 ${ACCENT_TEXT[view.accent]}`}>
            <span className={`h-2 w-2 rounded-full ${ACCENT_DOT[view.accent]}`} aria-hidden="true" />
            <span>{view.code}</span>
            {view.badges.map((b) => (
              <span key={b.label} className={`rounded border border-current/40 px-1.5 py-0.5 ${ACCENT_TEXT[b.accent]}`}>
                {b.label}
              </span>
            ))}
          </p>
          <h2 id={titleId} className="mt-2 text-[22px] leading-7 font-extrabold tracking-tight text-ink sm:text-[26px] sm:leading-8">
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
        <Overflow readme={readme} onToggleReadme={onToggleReadme} page={view.page} onLeave={onLeave} />
        <button
          type="button"
          onClick={onClose}
          aria-label={t("close")}
          className="grid size-11 shrink-0 place-items-center rounded-full text-ink-2 transition hover:bg-white/5 hover:text-ink"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </header>

      {tabs.length > 0 && !readme && (
        <div role="tablist" aria-label={t("tabsLabel")} className="flex shrink-0 gap-1 overflow-x-auto border-b border-glass-border px-3 sm:px-4">
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

      {/* Focusable so keyboard users can scroll long rooms (axe scrollable-region-focusable). */}
      <div
        role="region"
        aria-label={t("label")}
        tabIndex={0}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 outline-none focus-visible:ring-1 focus-visible:ring-cyan/60 sm:px-5"
      >
        {body}
      </div>

      <footer className="shrink-0 space-y-2 border-t border-glass-border px-4 py-3 sm:px-5">
        <div className="flex flex-wrap gap-2">
          {view.page && (
            <Link
              href={view.page}
              onClick={onLeave}
              className="inline-flex min-h-11 items-center rounded-lg bg-cyan px-4 text-sm font-semibold text-void transition hover:bg-cyan/85"
            >
              {view.kind === "pod" ? tc("caseStudy") : view.kind === "post" ? t("rooms.readPost") : t("openPage")}
            </Link>
          )}
          {view.external && (
            <a
              href={view.external}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center rounded-lg bg-cyan px-4 text-sm font-semibold text-void transition hover:bg-cyan/85"
            >
              {t("external")}
              <span className="sr-only"> ({tc("external")})</span>
            </a>
          )}
          {view.hologram && !readme && activeTab !== "architecture" && <HologramButton onClick={onHologram} />}
          {view.link && (
            <button
              type="button"
              onClick={() => onLink(view.link!.room)}
              className="inline-flex min-h-11 items-center rounded-lg border border-amber/50 px-4 text-sm font-semibold text-ink transition hover:border-amber hover:bg-amber/10"
            >
              {view.link.label}
            </button>
          )}
        </div>
        {(view.prev || view.next) && (
          <nav aria-label={tl("title")} className="flex items-center justify-between gap-2">
            <button
              type="button"
              disabled={!view.prev}
              onClick={() => view.prev && onNavigate(view.prev)}
              aria-label={neighbours?.prev ? `${t("previous")}: ${neighbours.prev}` : t("previous")}
              className="inline-flex min-h-11 min-w-0 items-center gap-2 rounded-lg px-2 text-sm text-ink-2 transition hover:bg-white/5 hover:text-ink disabled:opacity-40"
            >
              <span aria-hidden="true">←</span>
              <span className="truncate">{neighbours?.prev ?? t("previous")}</span>
            </button>
            <button
              type="button"
              disabled={!view.next}
              onClick={() => view.next && onNavigate(view.next)}
              aria-label={neighbours?.next ? `${t("next")}: ${neighbours.next}` : t("next")}
              className="inline-flex min-h-11 min-w-0 items-center gap-2 rounded-lg px-2 text-sm text-ink-2 transition hover:bg-white/5 hover:text-ink disabled:opacity-40"
            >
              <span className="truncate">{neighbours?.next ?? t("next")}</span>
              <span aria-hidden="true">→</span>
            </button>
          </nav>
        )}
        <p className="hidden text-[12px] text-ink-3 sm:block">{t("readmeHint")}</p>
      </footer>
    </div>
  );
}

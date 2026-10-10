"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import type { FloorId, Locale, RoomId } from "@/content/schema";
import type { PaletteFilter } from "@/experience/missions/host";
import type { PaletteEntry, PaletteGroup } from "./palette-types";
import { searchPalette } from "./search";

export interface CommandPaletteProps {
  open: boolean;
  locale: Locale;
  entries: readonly PaletteEntry[];
  recent: readonly RoomId[];
  filter?: PaletteFilter | null;
  onFilterChange?: (filter: PaletteFilter | null) => void;
  /** Runs the entry. The palette calls `onClose` first. */
  onSelect: (entry: PaletteEntry) => void;
  onClose: () => void;
}

const FLOOR_BADGE: Record<FloorId, string> = {
  L1: "text-green border-green/40",
  L2: "text-amber border-amber/40",
  L3: "text-violet border-violet/40",
  L4: "text-ink border-ink/40",
  RF: "text-blue border-blue/40",
};

interface Row {
  entry: PaletteEntry;
  group: number;
}

/** Command palette (spec appendix 02 section 5): full-screen sheet below 640 px, centered 640 px modal above. */
export function CommandPalette(props: CommandPaletteProps) {
  // Mounting the dialog only while open resets the query and active row on every open.
  return props.open ? <PaletteDialog {...props} /> : null;
}

function PaletteDialog({ locale, entries, recent, filter = null, onFilterChange, onSelect, onClose }: CommandPaletteProps) {
  const t = useTranslations("hud.palette");
  const tFloors = useTranslations("floors");
  const baseId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const groups = useMemo<PaletteGroup[]>(() => searchPalette(entries, query, { filter, recent }), [entries, query, filter, recent]);
  const rows = useMemo<Row[]>(() => groups.flatMap((g, group) => g.entries.map((entry) => ({ entry, group }))), [groups]);
  const active = rows.length ? Math.min(activeIndex, rows.length - 1) : -1;

  const titleId = `${baseId}-title`;
  const listId = `${baseId}-list`;
  const optionId = (i: number) => `${baseId}-opt-${i}`;
  const activeId = active >= 0 ? optionId(active) : undefined;

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    inputRef.current?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  useEffect(() => {
    if (!activeId) return;
    const node = document.getElementById(activeId);
    if (typeof node?.scrollIntoView === "function") node.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  const select = (entry: PaletteEntry) => {
    onClose();
    onSelect(entry);
  };

  const firstOfGroup = (group: number) => rows.findIndex((row) => row.group === group);

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const count = rows.length;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp":
        event.preventDefault();
        if (count) setActiveIndex((Math.max(active, 0) + (event.key === "ArrowDown" ? 1 : count - 1)) % count);
        break;
      case "Home":
      case "End":
        if (!count) return;
        event.preventDefault();
        setActiveIndex(event.key === "Home" ? 0 : count - 1);
        break;
      case "Enter":
        event.preventDefault();
        if (active >= 0) select(rows[active].entry);
        break;
      case "Tab": {
        event.preventDefault();
        if (!groups.length) break;
        const current = active >= 0 ? rows[active].group : 0;
        const step = event.shiftKey ? groups.length - 1 : 1;
        setActiveIndex(firstOfGroup((current + step) % groups.length));
        break;
      }
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        onClose();
        break;
      case "Backspace":
        if (query === "" && filter && onFilterChange) {
          event.preventDefault();
          onFilterChange(null);
          setActiveIndex(0);
        }
        break;
    }
  };

  // Keeps focus inside the dialog when it sits on another control (close or clear-filter button).
  const onDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target === inputRef.current) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    } else if (event.key === "Tab") {
      event.preventDefault();
      inputRef.current?.focus();
    }
  };

  const subtitleOf = (entry: PaletteEntry) =>
    entry.subtitle?.[locale] ?? (entry.target.type === "year" && entry.keywords.length ? entry.keywords.join(", ") : undefined);

  const offsets = groups.map((_, group) => firstOfGroup(group));

  return (
    <div className="fixed inset-0 z-50">
      <div aria-hidden="true" className="absolute inset-0 bg-void/70 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onDialogKeyDown}
        className="glass glass-solid absolute inset-0 flex flex-col overflow-hidden max-sm:bg-void pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-ink shadow-2xl max-sm:rounded-none max-sm:border-0 sm:inset-auto sm:top-[12vh] sm:left-1/2 sm:w-[90%] sm:max-w-[640px] sm:-translate-x-1/2 sm:pt-0 sm:pb-0"
      >
        <h2 id={titleId} className="sr-only">
          {t("title")}
        </h2>
        <div className="flex min-h-14 items-center gap-2 border-b border-glass-border px-3 focus-within:border-cyan/60 motion-safe:transition-colors">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 shrink-0 text-ink-3" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          {filter ? (
            <span className="label inline-flex shrink-0 items-center gap-1 rounded-full border border-cyan/40 bg-cyan/10 py-0.5 pr-0.5 pl-2.5 text-cyan">
              {t(`filter.${filter}`)}
              <button
                type="button"
                aria-label={t("clearFilter")}
                onClick={() => {
                  onFilterChange?.(null);
                  setActiveIndex(0);
                  inputRef.current?.focus();
                }}
                className="inline-flex size-7 items-center justify-center rounded-full hover:bg-cyan/20 focus-visible:outline-2 focus-visible:outline-cyan"
              >
                <span aria-hidden="true">×</span>
              </button>
            </span>
          ) : null}
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={rows.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeId}
            aria-label={t("label")}
            placeholder={t("placeholder")}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="go"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onInputKeyDown}
            className="min-h-11 min-w-0 flex-1 bg-transparent text-base text-ink placeholder:text-ink-3 focus:outline-none focus-visible:outline-none"
          />
          <button
            type="button"
            aria-label={t("close")}
            onClick={onClose}
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-cyan"
          >
            <span aria-hidden="true" className="label hidden sm:inline">
              Esc
            </span>
            <span aria-hidden="true" className="text-xl leading-none sm:hidden">
              ×
            </span>
          </button>
        </div>

        <div
          id={listId}
          role="listbox"
          aria-label={t("results")}
          className="flex-1 overflow-y-auto overscroll-contain py-2 sm:max-h-[min(60vh,28rem)] sm:flex-none"
        >
          {groups.map((group, groupIndex) => {
            const headingId = `${baseId}-group-${group.id}`;
            return (
              <div key={group.id} role="group" aria-labelledby={headingId} className="pb-1">
                <div id={headingId} role="presentation" className="label px-4 pt-2 pb-1 text-ink-3">
                  {t(`groups.${group.id}`)}
                </div>
                {group.entries.map((entry, i) => {
                  const index = offsets[groupIndex] + i;
                  const selected = index === active;
                  const subtitle = subtitleOf(entry);
                  return (
                    <div
                      key={`${group.id}:${entry.key}`}
                      id={optionId(index)}
                      role="option"
                      aria-selected={selected}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseMove={() => {
                        if (!selected) setActiveIndex(index);
                      }}
                      onClick={() => select(entry)}
                      className={`flex min-h-11 cursor-pointer items-center gap-3 border-l-2 px-4 py-2 motion-safe:transition-colors ${
                        selected ? "border-cyan bg-cyan/10" : "border-transparent"
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate ${selected ? "text-ink" : "text-ink-2"}`}>{entry.title[locale]}</span>
                        {subtitle ? <span className="block truncate text-sm text-ink-3">{subtitle}</span> : null}
                      </span>
                      {entry.floor ? (
                        <span title={tFloors(entry.floor)} className={`label shrink-0 rounded border px-1.5 py-0.5 ${FLOOR_BADGE[entry.floor]}`}>
                          <span aria-hidden="true">{entry.floor}</span>
                          <span className="sr-only">{tFloors(entry.floor)}</span>
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {rows.length === 0 && query.trim() ? (
          <p role="status" className="px-4 py-6 text-center text-ink-2">
            {t("empty", { query: query.trim() })}
          </p>
        ) : null}

        <p className="label hidden border-t border-glass-border px-4 py-2.5 text-ink-3 sm:block">{t("hint")}</p>
      </div>
    </div>
  );
}

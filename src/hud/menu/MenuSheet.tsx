"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { PageViewIcon } from "@/components/PageViewIcon";
import { intents } from "@/experience/input/intents";
import type { ExperienceData } from "@/experience/types";
import { ACCENT_TEXT, FLOOR_ACCENT } from "@/lib/accent";
import { useHQStore } from "@/store/useHQStore";
import { openPalette, openTerminal } from "../events";
import { Kbd } from "../Kbd";
import type { HudLayout } from "../layout";
import { ProfilePhoto } from "../ProfileCard";
import { LazySettingsPanel } from "../settings/LazySettingsPanel";
import { RotateLeftIcon, RotateRightIcon, rotateView } from "../ViewControls";

const action =
  "hq-glow inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-2 px-3 py-2 text-left text-sm text-ink-2 hover:bg-surface-2 hover:text-ink";
const primary =
  "col-span-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-cyan px-4 text-sm font-semibold text-void shadow-[0_0_24px_-6px_var(--color-cyan)] transition hover:bg-cyan/85 focus-visible:outline-offset-4";

function SearchIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function MapIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" className="shrink-0">
      <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14" />
    </svg>
  );
}

/** Who and where: the photo, name, headline and current floor (no buttons; the desktop shows the same in its profile card). */
function MenuProfile({ data }: { data: ExperienceData }) {
  const t = useTranslations("hud");
  const floor = useHQStore((s) => s.floor);
  return (
    <section aria-label={t("profile")} data-testid="menu-profile" className="flex items-center gap-3 px-3">
      <ProfilePhoto size={44} />
      <div className="min-w-0">
        <p className="truncate text-[15px] leading-5 font-bold text-ink">{data.profile.name}</p>
        <p className="text-[13px] leading-5 text-cyan">{data.profile.headline}</p>
        <p className="text-sm leading-5 text-ink-2">
          <span className={`label mr-1.5 ${ACCENT_TEXT[FLOOR_ACCENT[floor]]}`}>{floor}</span>
          {data.floors[floor].name}
        </p>
      </div>
    </section>
  );
}

export type MenuSheetProps = {
  data: ExperienceData;
  layout: HudLayout;
  onExit: () => void;
  /** Closes the sheet (focus back on the menu button first). */
  close: () => void;
  controls: boolean;
  onControls: () => void;
};

/**
 * The Corners menu sheet's body (a lazy chunk, `menuChunk.ts`): the profile, the actions (Classic site, search, Rover
 * menu, rotate, map, the controls help) and every setting. Rotate and map name their keys with `aria-keyshortcuts` and a
 * `Kbd` chip that only fine pointers see. Tablets show search in the bar, so the sheet leaves it out.
 */
export function MenuSheet({ data, layout, onExit, close, controls, onControls }: MenuSheetProps) {
  const t = useTranslations("hud");
  // `close` runs first, so the overlay an action opens takes focus and returns it to the menu button;
  // rotating keeps the menu open.
  const actions: { key: string; label: string; icon: ReactNode; run: () => void; close: boolean; kbd?: string; expanded?: boolean }[] = [
    ...(layout === "tablet" ? [] : [{ key: "search", label: t("launcher.search"), icon: <SearchIcon />, run: () => openPalette(), close: true }]),
    {
      key: "rover-menu",
      label: t("launcher.roverMenu"),
      icon: (
        <span aria-hidden="true" className="w-[18px] shrink-0 text-center font-mono text-cyan">
          &gt;_
        </span>
      ),
      run: openTerminal,
      close: true,
    },
    { key: "rotate-left", label: t("view.rotateLeft"), icon: <RotateLeftIcon />, run: () => rotateView(-1), close: false, kbd: "Q" },
    { key: "rotate-right", label: t("view.rotateRight"), icon: <RotateRightIcon />, run: () => rotateView(1), close: false, kbd: "E" },
    { key: "map", label: t("map.open"), icon: <MapIcon />, run: () => intents.emit({ type: "toggle", what: "map" }), close: true, kbd: "N" },
    {
      key: "controls",
      label: t("controls"),
      icon: (
        <span aria-hidden="true" className="w-[18px] shrink-0 text-center font-mono text-cyan">
          ?
        </span>
      ),
      run: onControls,
      close: false,
      expanded: controls,
    },
  ];

  return (
    <>
      <MenuProfile data={data} />
      <div data-testid="menu-actions" className="grid grid-cols-2 gap-2 px-3">
        <button type="button" onClick={onExit} title={t("pageViewHint")} className={primary} data-testid="page-view">
          <PageViewIcon />
          {t("pageView")}
        </button>
        {actions.map((a, i) => (
          // An odd last action takes the full row.
          <button
            key={a.key}
            type="button"
            data-testid={a.expanded === undefined ? undefined : `menu-${a.key}`}
            aria-expanded={a.expanded}
            aria-keyshortcuts={a.kbd}
            onClick={() => {
              if (a.close) close();
              a.run();
            }}
            className={`${action} ${i === actions.length - 1 && actions.length % 2 === 1 ? "col-span-2" : ""}`}
          >
            {a.icon}
            {a.label}
            {a.kbd && <Kbd className="ml-auto">{a.kbd}</Kbd>}
          </button>
        ))}
      </div>
      <LazySettingsPanel headingLevel={3} onClose={close} controls={controls} />
    </>
  );
}

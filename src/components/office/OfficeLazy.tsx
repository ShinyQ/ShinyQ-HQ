"use client";

import { createContext, useContext, useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import type { Locale } from "@/content/locales";
import type { OfficeFeedStatus } from "@/lib/office/poll";
import { OFFICE_RESERVE, type OfficeCardLabels } from "./labels";
import type { OfficePanelProps } from "./OfficePanel";

type PanelLoader = () => Promise<ComponentType<OfficePanelProps>>;

const loadPanel: PanelLoader = () => import("./OfficePanel").then((m) => m.OfficePanel);
const StatusContext = createContext<(status: OfficeFeedStatus) => void>(() => undefined);

/** The home page's office section wrapper: hidden when the office is switched off (`{"v":1,"enabled":false}`). */
export function OfficeShell({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<OfficeFeedStatus>("idle");
  return (
    <StatusContext.Provider value={setStatus}>
      <div hidden={status === "disabled"} data-testid="office-section" data-status={status}>
        {children}
      </div>
    </StatusContext.Provider>
  );
}

/**
 * Loads the panel chunk once the section comes within a screen of the viewport, like VisitsLazy, so neither the
 * panel nor the polling weighs on the page's first load or runs under the 3D tower (`content-visibility: hidden`
 * never intersects). Until then the static loading line and note hold the card's height; a chunk that fails to load
 * leaves the offline line and releases the height.
 */
export function OfficeLazy({ locale, labels, load = loadPanel }: { locale: Locale; labels: OfficeCardLabels; load?: PanelLoader }) {
  const onStatus = useContext(StatusContext);
  const [Panel, setPanel] = useState<ComponentType<OfficePanelProps> | null>(null);
  const [failed, setFailed] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = anchor.current;
    if (!el) return;
    let alive = true;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        load().then(
          (p) => alive && setPanel(() => p),
          () => alive && setFailed(true),
        );
      },
      { rootMargin: "100% 0px" },
    );
    observer.observe(el);
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, [load]);
  useEffect(() => {
    if (failed) onStatus("offline");
  }, [failed, onStatus]);
  if (failed)
    return (
      <p data-testid="office-live" className="pv-meta">
        <span role="status">{labels.offlineEmpty}</span>
      </p>
    );
  if (!Panel)
    return (
      <div ref={anchor} className={OFFICE_RESERVE[locale]}>
        <p className="pv-meta">{labels.loading}</p>
        <p className="mt-3 text-sm text-ink-2">{labels.loadingNote}</p>
      </div>
    );
  return <Panel locale={locale} labels={labels} onStatus={onStatus} />;
}

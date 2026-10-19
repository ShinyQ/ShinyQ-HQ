"use client";

import { createContext, useContext, useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import type { Locale } from "@/content/locales";
import type { OfficeFeedStatus } from "@/lib/office/poll";
import { OFFICE_RESERVE, type OfficeCardLabels } from "./labels";
import type { OfficePanelProps } from "./OfficePanel";

const loadPanel = () => import("./OfficePanel").then((m) => m.OfficePanel);
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
 * never intersects).
 */
export function OfficeLazy({ locale, labels }: { locale: Locale; labels: OfficeCardLabels }) {
  const onStatus = useContext(StatusContext);
  const [Panel, setPanel] = useState<ComponentType<OfficePanelProps> | null>(null);
  const anchor = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const el = anchor.current;
    if (!el) return;
    let alive = true;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        void loadPanel().then((p) => alive && setPanel(() => p));
      },
      { rootMargin: "100% 0px" },
    );
    observer.observe(el);
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, []);
  if (!Panel)
    return (
      <p ref={anchor} className={`pv-data text-ink-3 ${OFFICE_RESERVE}`}>
        {labels.loading}
      </p>
    );
  return <Panel locale={locale} labels={labels} onStatus={onStatus} />;
}

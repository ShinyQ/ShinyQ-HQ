"use client";

import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { requestStats, useStats } from "@/lib/visits/store";
import type { VisitsPanelProps } from "./VisitsPanel";

const loadPanel = () => import("./VisitsPanel").then((m) => m.VisitsPanel);

/**
 * The Contact page's "Visits" section shell. The whole section hides when the stats are hidden (invalid,
 * 204 or older than 7 days).
 */
export function VisitsShell({ children }: { children: ReactNode }) {
  const { status } = useStats();
  return (
    <div hidden={status === "hidden"} data-testid="visits-section" data-status={status}>
      {children}
    </div>
  );
}

/**
 * Loads the panel chunk and starts the stats fetch once the section comes within a screen of the viewport
 * (a `#visits` link scrolls it in at once), so neither the panel nor the map data weighs on the page's
 * first load, and nothing loads while the 3D tower hides the page (`content-visibility: hidden` never intersects).
 */
export function VisitsLazy({ loading, ...props }: VisitsPanelProps & { loading: string }) {
  const [Panel, setPanel] = useState<ComponentType<VisitsPanelProps> | null>(null);
  const anchor = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const el = anchor.current;
    if (!el) return;
    let alive = true;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        void requestStats();
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
      <p ref={anchor} className="pv-data text-ink-3">
        {loading}
      </p>
    );
  return <Panel {...props} />;
}

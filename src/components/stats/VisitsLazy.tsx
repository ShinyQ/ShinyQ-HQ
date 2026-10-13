"use client";

import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { whenIdle } from "@/lib/visits/idle";
import { requestStats, useStats } from "@/lib/visits/store";
import type { VisitsPanelProps } from "./VisitsPanel";

const loadPanel = () => import("./VisitsPanel").then((m) => m.VisitsPanel);

/**
 * The Contact page's "Visits" section shell: after hydration, on idle (at once for a `#visits` link) it
 * starts the stats fetch and loads the panel chunk, so neither the panel nor the map data weighs on the
 * page's first load. The whole section hides when the stats are hidden (invalid, 204 or older than 7 days).
 */
export function VisitsShell({ children }: { children: ReactNode }) {
  const { status } = useStats();
  return (
    <div hidden={status === "hidden"} data-testid="visits-section" data-status={status}>
      {children}
    </div>
  );
}

export function VisitsLazy({ loading, ...props }: VisitsPanelProps & { loading: string }) {
  const [Panel, setPanel] = useState<ComponentType<VisitsPanelProps> | null>(null);
  useEffect(() => {
    let alive = true;
    const start = () => {
      void requestStats();
      void loadPanel().then((p) => alive && setPanel(() => p));
    };
    const cancel = window.location.hash === "#visits" ? (start(), () => {}) : whenIdle(start);
    return () => {
      alive = false;
      cancel();
    };
  }, []);
  if (!Panel) return <p className="pv-data text-ink-3">{loading}</p>;
  return <Panel {...props} />;
}

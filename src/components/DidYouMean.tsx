"use client";

import { useEffect, useState } from "react";
import { suggestRoute, type RouteEntry } from "@/lib/did-you-mean";

/** The 404's "Did you mean" line: fetches the static route index after paint and shows the closest page, or nothing. The live region is always rendered with a reserved line so the late suggestion shifts nothing. */
export function DidYouMean({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  const [match, setMatch] = useState<RouteEntry | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/data/routes/index.json")
      .then((r) => (r.ok ? (r.json() as Promise<RouteEntry[]>) : []))
      .then(
        (routes) => live && setMatch(suggestRoute(location.pathname, routes)),
      )
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return (
    <div className={className} role="status" aria-live="polite">
      {match && (
        <p data-testid="did-you-mean">
          <span className="pv-data">{label}</span>{" "}
          <a href={match.p} className="font-semibold text-cyan">
            {match.t} →
          </a>
        </p>
      )}
    </div>
  );
}

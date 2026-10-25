"use client";

import { useEffect, useState } from "react";
import { suggestRoute, type RouteEntry } from "@/lib/did-you-mean";

/** The 404's "Did you mean" line: fetches the static route index after paint and shows the closest page, or nothing. */
export function DidYouMean({ label, className }: { label: string; className?: string }) {
  const [match, setMatch] = useState<RouteEntry | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/data/routes/index.json")
      .then((r) => (r.ok ? (r.json() as Promise<RouteEntry[]>) : []))
      .then((routes) => live && setMatch(suggestRoute(location.pathname, routes)))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  if (!match) return null;
  return (
    <p className={className} data-testid="did-you-mean">
      <span className="pv-data">{label}</span>{" "}
      <a href={match.p} className="font-semibold text-cyan">
        {match.t} →
      </a>
    </p>
  );
}

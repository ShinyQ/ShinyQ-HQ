"use client";

import { useId } from "react";
import { useStatsOptOut } from "./optOutStore";

/**
 * The "Don't count my visits" switch (footer privacy line and the L1:visits drawer). A native checkbox
 * with `role="switch"`, so it works with the keyboard and announces on or off; checked means opted out.
 */
export function OptOutToggle({ label, hint, className = "" }: { label: string; hint?: string; className?: string }) {
  const [optedOut, setOptedOut] = useStatsOptOut();
  const hintId = useId();
  return (
    <label className={`inline-flex min-h-11 cursor-pointer items-center gap-2 ${className}`} data-testid="stats-optout">
      <input
        type="checkbox"
        role="switch"
        className="size-4 shrink-0 accent-cyan"
        checked={optedOut}
        onChange={(e) => setOptedOut(e.currentTarget.checked)}
        aria-describedby={hint ? hintId : undefined}
      />
      <span>{label}</span>
      {hint && (
        <span id={hintId} className="sr-only">
          {hint}
        </span>
      )}
    </label>
  );
}

"use client";

import { useEffect, useId, useRef, useState } from "react";
import { SITE_URL } from "@/lib/site";
import { shareUrls } from "@/lib/view-param";

type Kind = "classic" | "threeD";
type ShareCopyState =
  | { status: "idle" }
  | { status: "copied"; kind: Kind }
  | { status: "failed"; kind: Kind; value: string };

export interface ShareLinksProps {
  labels: { group: string; classic: string; threeD: string; copied: string; failed: string };
  variant?: "page" | "menu";
  /** Class for each menu item button (the drawer's `MENU_ITEM`). */
  itemClassName?: string;
}

/** Copies the generated view link, or exposes that same value for manual copying. */
export function ShareLinks({ labels, variant = "page", itemClassName }: ShareLinksProps) {
  const [state, setState] = useState<ShareCopyState>({ status: "idle" });
  const attempt = useRef(0);
  const failureId = useId();

  useEffect(() => {
    if (state.status !== "copied") return;
    const id = window.setTimeout(() => setState({ status: "idle" }), 2000);
    return () => window.clearTimeout(id);
  }, [state]);

  useEffect(() => () => { attempt.current += 1; }, []);

  const copy = async (kind: Kind) => {
    const current = ++attempt.current;
    const value = shareUrls(SITE_URL, window.location)[kind];
    setState({ status: "idle" });
    try {
      await navigator.clipboard.writeText(value);
      if (current === attempt.current) setState({ status: "copied", kind });
    } catch {
      if (current === attempt.current) setState({ status: "failed", kind, value });
    }
  };

  const recovery = state.status === "failed" && (
    <div className="w-full min-w-0 space-y-2">
      <p id={failureId} role="status" aria-live="polite" className="text-sm text-ink-2">{labels.failed}</p>
      <input
        type="text"
        readOnly
        tabIndex={0}
        aria-labelledby={failureId}
        value={state.value}
        className="w-full min-w-0 rounded-lg border border-line-2 bg-surface px-3 py-2 font-mono text-sm text-ink"
      />
    </div>
  );

  const buttonClassName = variant === "menu" ? itemClassName : "pv-btn pv-btn-ghost";
  const classicButton = (
    <button type="button" className={buttonClassName} onClick={() => void copy("classic")}>
      <span aria-live="polite">{state.status === "copied" && state.kind === "classic" ? labels.copied : labels.classic}</span>
    </button>
  );
  const threeDButton = (
    <button type="button" className={buttonClassName} onClick={() => void copy("threeD")}>
      <span aria-live="polite">{state.status === "copied" && state.kind === "threeD" ? labels.copied : labels.threeD}</span>
    </button>
  );

  if (variant === "menu") return (
    <>
      <li>{classicButton}{state.status === "failed" && state.kind === "classic" && recovery}</li>
      <li>{threeDButton}{state.status === "failed" && state.kind === "threeD" && recovery}</li>
    </>
  );
  return (
    <div role="group" aria-label={labels.group} className="flex flex-wrap gap-3">
      {classicButton}
      {threeDButton}
      {recovery}
    </div>
  );
}

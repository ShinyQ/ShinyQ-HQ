"use client";

import { useEffect, useState } from "react";
import { SITE_URL } from "@/lib/site";
import { shareUrls } from "@/lib/view-param";

type Kind = "classic" | "threeD";

export interface ShareLinksProps {
  labels: { group: string; classic: string; threeD: string; copied: string };
  variant?: "page" | "menu";
  /** Class for each menu item button (the drawer's `MENU_ITEM`). */
  itemClassName?: string;
}

/** Copies the Classic or 3D address of the current page; the status text is announced to screen readers. */
export function ShareLinks({ labels, variant = "page", itemClassName }: ShareLinksProps) {
  const [done, setDone] = useState<Kind | null>(null);

  useEffect(() => {
    if (!done) return;
    const id = window.setTimeout(() => setDone(null), 2000);
    return () => window.clearTimeout(id);
  }, [done]);

  const copy = async (kind: Kind) => {
    try {
      await navigator.clipboard.writeText(shareUrls(SITE_URL, window.location)[kind]);
      setDone(kind);
    } catch {
      // Clipboard can be blocked; nothing else to offer here.
    }
  };

  const items: { kind: Kind; label: string }[] = [
    { kind: "classic", label: labels.classic },
    { kind: "threeD", label: labels.threeD },
  ];

  const buttons = items.map(({ kind, label }) => {
    const button = (
      <button
        key={kind}
        type="button"
        className={variant === "menu" ? itemClassName : "pv-btn pv-btn-ghost"}
        onClick={() => void copy(kind)}
      >
        <span aria-live="polite">{done === kind ? labels.copied : label}</span>
      </button>
    );
    return variant === "menu" ? <li key={kind}>{button}</li> : button;
  });

  if (variant === "menu") return <>{buttons}</>;
  return (
    <div role="group" aria-label={labels.group} className="flex flex-wrap gap-3">
      {buttons}
    </div>
  );
}

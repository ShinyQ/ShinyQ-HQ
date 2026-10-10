"use client";

import { useState } from "react";

/** Copies the address and confirms in place; the status text is announced to screen readers. */
export function CopyEmail({ email, label, copied }: { email: string; label: string; copied: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="pv-btn pv-btn-ghost w-full"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(email);
          setDone(true);
          window.setTimeout(() => setDone(false), 2000);
        } catch {
          // Clipboard can be blocked; the mailto button above still works.
        }
      }}
    >
      <span aria-live="polite">{done ? copied : label}</span>
    </button>
  );
}

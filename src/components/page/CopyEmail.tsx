"use client";

import { useEffect, useId, useRef, useState } from "react";

type EmailCopyState =
  | { status: "idle" }
  | { status: "copied" }
  | { status: "failed"; value: string };

/** Copies the raw address, or exposes it for manual copying. */
export function CopyEmail({ email, label, copied, failed }: { email: string; label: string; copied: string; failed: string }) {
  const [state, setState] = useState<EmailCopyState>({ status: "idle" });
  const attempt = useRef(0);
  const failureId = useId();

  useEffect(() => {
    if (state.status !== "copied") return;
    const id = window.setTimeout(() => setState({ status: "idle" }), 2000);
    return () => window.clearTimeout(id);
  }, [state]);

  useEffect(() => () => { attempt.current += 1; }, []);

  const copy = async () => {
    const current = ++attempt.current;
    const value = email;
    setState({ status: "idle" });
    try {
      await navigator.clipboard.writeText(value);
      if (current === attempt.current) setState({ status: "copied" });
    } catch {
      if (current === attempt.current) setState({ status: "failed", value });
    }
  };

  return (
    <>
      <button type="button" className="pv-btn pv-btn-ghost w-full" onClick={() => void copy()}>
        <span aria-live="polite">{state.status === "copied" ? copied : label}</span>
      </button>
      {state.status === "failed" && (
        <div className="w-full min-w-0 space-y-2">
          <p id={failureId} role="status" aria-live="polite" className="text-sm text-ink-2">{failed}</p>
          <input
            type="text"
            readOnly
            aria-labelledby={failureId}
            value={state.value}
            className="w-full min-w-0 rounded-lg border border-line-2 bg-surface px-3 py-2 font-mono text-sm text-ink"
          />
        </div>
      )}
    </>
  );
}

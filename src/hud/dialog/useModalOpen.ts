"use client";

import { useEffect, useState } from "react";

const MODAL = "[role='dialog'][aria-modal='true']";

const modalOpen = () => typeof document !== "undefined" && document.querySelector(MODAL) !== null;

/**
 * True while any modal dialog is open (terminal, palette, pad picker, room drawer, the CV and paper viewers in DialogHost, cert).
 * Synchronous on purpose: right from the first render (Rover's box can mount while Cmd-K is open) and in the mutation
 * callback, never a frame later, or the box would show for a frame and its choices would take the visitor's focus.
 */
export function useModalOpen(): boolean {
  const [open, setOpen] = useState(modalOpen);
  useEffect(() => {
    const check = () => setOpen(modalOpen());
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-modal", "role"] });
    check();
    return () => observer.disconnect();
  }, []);
  return open;
}

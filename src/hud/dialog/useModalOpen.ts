"use client";

import { useEffect, useState } from "react";

const MODAL = "[role='dialog'][aria-modal='true']";

/** True while any modal dialog is open (terminal, palette, pad picker, room drawer, the CV and paper viewers in DialogHost, cert). */
export function useModalOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let raf = 0;
    const check = () => {
      raf = 0;
      setOpen(document.querySelector(MODAL) !== null);
    };
    const observer = new MutationObserver(() => {
      if (!raf) raf = requestAnimationFrame(check);
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-modal", "role"] });
    check();
    return () => {
      observer.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return open;
}

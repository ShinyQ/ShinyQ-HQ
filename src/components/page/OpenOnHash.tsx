"use client";

import { useEffect } from "react";

/**
 * Opens the `<details>` element named by the URL hash (for example `#perspectives-spec-before-code`,
 * the anchor Ask cites) on load and on every hash change, then scrolls it into view. Renders nothing.
 */
export function OpenOnHash({ prefix }: { prefix: string }) {
  useEffect(() => {
    const open = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id.startsWith(prefix)) return;
      const target = document.getElementById(id);
      if (!(target instanceof HTMLDetailsElement)) return;
      target.open = true;
      target.scrollIntoView?.({ block: "start" });
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, [prefix]);
  return null;
}

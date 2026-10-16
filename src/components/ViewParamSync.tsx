"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { syncViewLinks } from "@/lib/view-links";
import { currentView, syncViewUrl, VIEW_EVENT } from "@/lib/view-pref";

/**
 * Keeps `?view=classic` on the Classic site (Round 8 L): after every client navigation (Next links and
 * router.push drop it) it rewrites the URL in place, and it keeps every internal `<a href>` in step so
 * copy link, new tab and middle-click carry the view. Observes the DOM only while the tab is on the Classic site.
 */
function Sync() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  useEffect(() => {
    let observer: MutationObserver | null = null;
    const apply = () => {
      const view = currentView();
      syncViewUrl(view);
      syncViewLinks(document.body, view, window.location.href);
      if (view === "page" && !observer) {
        observer = new MutationObserver((records) => {
          const base = window.location.href;
          for (const r of records) {
            if (r.type === "attributes") syncViewLinks(r.target as Element, "page", base);
            else r.addedNodes.forEach((n) => n instanceof Element && syncViewLinks(n, "page", base));
          }
        });
        observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["href"] });
      } else if (view === "3d" && observer) {
        observer.disconnect();
        observer = null;
      }
    };
    apply();
    window.addEventListener(VIEW_EVENT, apply);
    return () => {
      window.removeEventListener(VIEW_EVENT, apply);
      observer?.disconnect();
    };
  }, [pathname, search]);
  return null;
}

export function ViewParamSync() {
  return (
    <Suspense fallback={null}>
      <Sync />
    </Suspense>
  );
}

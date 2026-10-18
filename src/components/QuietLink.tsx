"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { Link, useRouter } from "@/i18n/navigation";

const QUIET_ATTRS = ["data-hq-boot", "data-hq"];

/** True while the boot cover (html[data-hq-boot]) or the 3D tower (html[data-hq]) hides the page. */
export function isQuiet(root: Element | null = typeof document === "undefined" ? null : document.documentElement): boolean {
  return root !== null && QUIET_ATTRS.some((attr) => root.hasAttribute(attr));
}

export function useQuietNav(): boolean {
  // The initializer runs on the client during hydration too; prefetch is not rendered, so no mismatch.
  const [quiet, setQuiet] = useState(() => isQuiet());
  useEffect(() => {
    const root = document.documentElement;
    const update = () => setQuiet(isQuiet(root));
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: QUIET_ATTRS });
    return () => observer.disconnect();
  }, []);
  return quiet;
}

/**
 * Locale link that prefetches on intent (pointer enter, focus or touchstart), never in the viewport, and never
 * while the page is hidden behind the boot cover or the tower (REPORT SP3). An explicit `prefetch` prop keeps
 * Next's own behavior for that link.
 */
export function QuietLink({ prefetch, onPointerEnter, onFocus, onTouchStart, ...props }: ComponentProps<typeof Link>) {
  const quiet = useQuietNav();
  const router = useRouter();
  const warmed = useRef(false);
  const warm = () => {
    if (prefetch !== undefined || quiet || warmed.current || typeof props.href !== "string") return;
    warmed.current = true;
    router.prefetch(props.href);
  };
  return (
    <Link
      {...props}
      prefetch={quiet ? false : (prefetch ?? false)}
      onPointerEnter={(e) => {
        warm();
        onPointerEnter?.(e);
      }}
      onFocus={(e) => {
        warm();
        onFocus?.(e);
      }}
      onTouchStart={(e) => {
        warm();
        onTouchStart?.(e);
      }}
    />
  );
}

"use client";

import { useEffect, useState, type ComponentProps } from "react";
import { Link } from "@/i18n/navigation";

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

/** Locale link that does not prefetch while the page is hidden behind the boot cover or the tower (REPORT SP3). */
export function QuietLink(props: ComponentProps<typeof Link>) {
  const quiet = useQuietNav();
  return <Link {...props} prefetch={quiet ? false : props.prefetch} />;
}

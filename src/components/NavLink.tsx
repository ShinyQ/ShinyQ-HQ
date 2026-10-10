"use client";

import type { CSSProperties, ReactNode } from "react";
import type { Accent } from "@/content/schema";
import { navMatch } from "@/content/pageview";
import { Link, usePathname } from "@/i18n/navigation";

/** Primary nav item: `aria-current="page"` on its section and child routes, underlined in the floor color. */
export function NavLink({
  href,
  accent,
  variant = "bar",
  children,
}: {
  href: string;
  accent: Accent;
  variant?: "bar" | "tab";
  children: ReactNode;
}) {
  const current = navMatch(usePathname(), href);
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={variant === "tab" ? "pv-tab" : "pv-nav-link"}
      style={{ "--pv-accent": `var(--color-${accent})` } as CSSProperties}
    >
      {children}
    </Link>
  );
}

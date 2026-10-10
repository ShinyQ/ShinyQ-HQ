"use client";

import { useLocale } from "next-intl";
import { LOCALES } from "@/content/schema";
import { usePathname } from "@/i18n/navigation";

const STORAGE_KEY = "hq:locale";

/** EN / ID segmented control that keeps the current path (spec appendix 04 section 4). */
export function LocaleSwitch({ label }: { label: string }) {
  const locale = useLocale();
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="flex overflow-hidden rounded-lg border border-line">
      {LOCALES.map((l) => {
        const active = l === locale;
        const href = `/${l}${pathname === "/" ? "" : pathname}`;
        return (
          <a
            key={l}
            href={href}
            hrefLang={l}
            lang={l}
            aria-current={active ? "true" : undefined}
            onClick={() => {
              try {
                localStorage.setItem(STORAGE_KEY, l);
              } catch {
                // Storage can be unavailable (private mode); the link still works.
              }
            }}
            className={`inline-flex min-h-[42px] min-w-10 items-center justify-center font-mono text-xs transition ${
              active ? "bg-ink text-void" : "text-ink-2 hover:text-ink"
            }`}
          >
            {l.toUpperCase()}
          </a>
        );
      })}
    </nav>
  );
}

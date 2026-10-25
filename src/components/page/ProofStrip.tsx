import type { Locale, Stat } from "@/content/schema";

/**
 * The landing hero's proof strip (owner decision 2026-10-25, style B): three verified stats in one quiet bordered row,
 * the value in the display face beside its short label; on phones three equal cells with the value above the label.
 * Server-rendered, no motion. The ticker below skips these ids so no number shows twice in the first screen.
 */
export function ProofStrip({ stats, locale, label }: { stats: readonly Stat[]; locale: Locale; label: string }) {
  return (
    <ul aria-label={label} data-testid="hero-proof" className="mt-7 grid grid-cols-3 divide-x divide-line rounded-xl border border-line-2 bg-surface sm:inline-grid">
      {stats.map((stat) => (
        <li key={stat.id} data-stat={stat.id} className="flex min-w-0 flex-col gap-1 px-3 py-3 sm:flex-row sm:items-baseline sm:gap-2.5 sm:px-5">
          <span className="pv-num text-[22px] leading-none sm:text-[28px]">{stat.value}</span>
          <span className="text-[12px] leading-4 text-ink-2 sm:text-[13px]">{stat.short?.[locale] ?? stat.label[locale]}</span>
        </li>
      ))}
    </ul>
  );
}

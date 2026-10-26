import type { Locale, Stat } from "@/content/schema";

/**
 * The landing hero's proof (owner decision 2026-10-25): the three stats in `profile.heroProof`, each value in the
 * display face over its short label, parted by vertical hairlines (no box). Server-rendered, no motion. The #stats
 * ledger skips these ids, so no number shows twice.
 */
export function ProofStrip({ stats, locale, label }: { stats: readonly Stat[]; locale: Locale; label: string }) {
  return (
    <ul aria-label={label} data-testid="hero-proof" className="hx-proof">
      {stats.map((stat) => (
        <li key={stat.id} data-stat={stat.id} className="min-w-0">
          <span className="pv-num hx-proof-value">{stat.value}</span>
          <span className="pv-meta text-ink-2">{stat.short?.[locale] ?? stat.label[locale]}</span>
        </li>
      ))}
    </ul>
  );
}

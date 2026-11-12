import type { Locale, Stat } from "@/content/schema";
import { DeltaValue, type DeltaLabels } from "../DeltaValue";

/**
 * The landing hero's proof (owner decision 2026-10-25): the three stats in `profile.heroProof`, each value in the
 * display face over its short label, parted by vertical hairlines (no box). Server-rendered, no motion. The #stats
 * ledger skips these ids, so no number shows twice.
 */
export function ProofStrip({ stats, locale, label, deltaLabels }: { stats: readonly Stat[]; locale: Locale; label: string; deltaLabels: DeltaLabels }) {
  return (
    <ul aria-label={label} data-testid="hero-proof" className="hx-proof">
      {stats.map((stat) => (
        <li key={stat.id} data-stat={stat.id} className="min-w-0">
          <span className="pv-num hx-proof-value">
            <DeltaValue value={stat.value} delta={stat.delta} labels={deltaLabels} compact />
          </span>
          <span className="pv-meta text-ink-2">{stat.short?.[locale] ?? stat.label[locale]}</span>
        </li>
      ))}
    </ul>
  );
}

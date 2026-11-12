import type { Locale, Stat } from "@/content/schema";

/**
 * The muted footnote under a stats list (owner decision 2026-11-13): the scale stats (PRs, contributions) as
 * "{value} {short}", after a lead-in that says they are agent-assisted volume. Renders nothing without scale stats.
 */
export function ScaleNote({ stats, locale, lead }: { stats: readonly Stat[]; locale: Locale; lead: string }) {
  if (stats.length === 0) return null;
  return (
    <p className="pv-meta mt-6" data-testid="scale-note">
      {lead} {stats.map((s) => `${s.value} ${s.short?.[locale] ?? s.label[locale]}`).join(", ")}.
    </p>
  );
}

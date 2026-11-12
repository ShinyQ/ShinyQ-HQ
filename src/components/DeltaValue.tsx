import type { Delta } from "@/content/schema";

/** Words read around a before and after: "from" (compact form) and "to" (screen readers, in place of the arrow). */
export interface DeltaLabels {
  from: string;
  to: string;
}

/**
 * A result or stat value (owner decision 2026-11-13). With a `delta`: the before muted and struck, an arrow, the after
 * at full ink, and "to" for screen readers instead of the arrow. `compact` (rows, cards, the hero proof) shows the after
 * large and "from {before}" small. Without a delta: the plain `value`. Hook-free, so server and client pages share it.
 */
export function DeltaValue({ value, delta, labels, compact = false }: { value: string; delta?: Delta; labels?: DeltaLabels; compact?: boolean }) {
  if (!delta || !labels) return <>{value}</>;
  if (compact) {
    return (
      <span data-delta="compact">
        {delta.after}
        <span className="hq-delta-from">
          {" "}
          {labels.from} <span className="line-through">{delta.before}</span>
        </span>
      </span>
    );
  }
  return (
    <span data-delta="full">
      <span className="text-ink-2 line-through">{delta.before}</span>
      <span aria-hidden="true" className="text-ink-2">
        {" → "}
      </span>
      <span className="sr-only"> {labels.to} </span>
      {delta.after}
    </span>
  );
}

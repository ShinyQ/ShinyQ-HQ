export interface MetricStripItem {
  value: string;
  label: string;
}

const LAYOUT = {
  page: {
    list: "grid border-y border-line md:grid-cols-3",
    item: "flex flex-col gap-2.5 py-4 md:py-5 md:pr-6",
    rule: "border-t border-line md:border-t-0 md:border-l md:pl-6",
    value: "pv-num text-[28px] sm:text-[36px] lg:text-[40px]",
    label: "text-sm leading-[21px] text-ink",
  },
  // Inside an `@container` (the Glass Drawer body): 3 across from 22rem, stacked below.
  panel: {
    list: "grid gap-2 @[22rem]:grid-cols-3",
    item: "flex flex-col gap-1 rounded-xl border border-glass-border bg-white/[0.03] p-3",
    rule: "",
    value: "text-xl leading-7 font-extrabold tracking-tight text-ink",
    label: "text-[13px] leading-5 text-ink",
  },
} as const;

/**
 * The results a case study opens with: a big value and its label, never the internal confidence (decision #44).
 * Hook-free so the Classic page renders it on the server.
 */
export function MetricStrip({
  items,
  label,
  variant = "page",
  className = "",
}: {
  items: readonly MetricStripItem[];
  label: string;
  variant?: keyof typeof LAYOUT;
  className?: string;
}) {
  const l = LAYOUT[variant];
  return (
    <ul aria-label={label} className={`${l.list} ${className}`} data-testid="metric-strip">
      {items.map((item, i) => (
        <li key={i} className={`${l.item} ${i > 0 ? l.rule : ""}`} data-testid="metric-strip-item">
          <p className={`${l.value} [overflow-wrap:anywhere]`}>{item.value}</p>
          <p className={l.label}>{item.label}</p>
        </li>
      ))}
    </ul>
  );
}

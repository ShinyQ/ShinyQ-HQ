import type { ReactNode } from "react";

export function Chip({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "cyan" | "violet" | "amber" | "green" }) {
  const tones = {
    default: "border-glass-border text-ink-2",
    cyan: "border-cyan/40 text-cyan",
    violet: "border-violet/40 text-violet",
    amber: "border-amber/40 text-amber",
    green: "border-green/40 text-green",
  } as const;
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-xs leading-5 ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function ChipList({ items, label }: { items: readonly string[]; label?: string }) {
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={label}>
      {items.map((item) => (
        <li key={item}>
          <Chip>{item}</Chip>
        </li>
      ))}
    </ul>
  );
}

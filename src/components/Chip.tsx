import type { ReactNode } from "react";
import { getTechLogo } from "@/content/tech";

export function Chip({
  children,
  tone = "default",
  logo,
}: {
  children: ReactNode;
  tone?: "default" | "cyan" | "violet" | "amber" | "green";
  /** Logo path under public/, shown before the label. */
  logo?: string;
}) {
  const tones = {
    default: "border-glass-border text-ink-2",
    cyan: "border-cyan/40 text-cyan",
    violet: "border-violet/40 text-violet",
    amber: "border-amber/40 text-amber",
    green: "border-green/40 text-green",
  } as const;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-xs leading-5 ${tones[tone]}`}>
      {logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" width={16} height={16} loading="lazy" decoding="async" className="size-4 shrink-0 object-contain" />
      )}
      {children}
    </span>
  );
}

/** Chip list. `logos` resolves tech logos through `getTechLogo`; unknown names stay text chips. */
export function ChipList({ items, label, logos = false }: { items: readonly string[]; label?: string; logos?: boolean }) {
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={label}>
      {items.map((item) => (
        <li key={item}>
          <Chip logo={logos ? getTechLogo(item)?.src : undefined}>{item}</Chip>
        </li>
      ))}
    </ul>
  );
}

/** Compact row of distinct stack logos (pod cards). Names without a logo are skipped. */
export function TechLogoRow({ items, max = 6 }: { items: readonly string[]; max?: number }) {
  const seen = new Set<string>();
  const logos = items.flatMap((name) => {
    const logo = getTechLogo(name);
    if (!logo || seen.has(logo.src)) return [];
    seen.add(logo.src);
    return [logo];
  });
  if (logos.length === 0) return null;
  const shown = logos.slice(0, max);
  return (
    <ul className="flex flex-wrap items-center gap-2" aria-label={shown.map((l) => l.label).join(", ")}>
      {shown.map((logo) => (
        <li key={logo.src} title={logo.label}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo.src} alt={logo.label} width={20} height={20} loading="lazy" decoding="async" className="size-5 object-contain opacity-90" />
        </li>
      ))}
      {logos.length > max && <li className="label text-ink-3">+{logos.length - max}</li>}
    </ul>
  );
}

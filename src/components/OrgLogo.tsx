import type { Asset, Locale } from "@/content/schema";

/** Company or school logo on a light tile so dark marks stay legible on the void. */
export function OrgLogo({ logo, locale, size = 40 }: { logo: Asset; locale: Locale; size?: number }) {
  return (
    <span className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-1" style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logo.src} alt={logo.alt[locale]} width={logo.width} height={logo.height} loading="lazy" decoding="async" className="h-full w-full object-contain" />
    </span>
  );
}

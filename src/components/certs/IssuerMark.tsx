import type { CertView } from "@/content/cert-views";

/** Issuer logo, or the issuer's first letter in a square for joint programs without one. */
export function IssuerMark({ cert, size = 20, className = "" }: { cert: Pick<CertView, "issuer" | "logo">; size?: number; className?: string }) {
  if (cert.logo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={cert.logo} alt="" width={size} height={size} loading="lazy" decoding="async" className={`shrink-0 object-contain ${className}`} style={{ width: size, height: size }} />;
  }
  return (
    <span aria-hidden="true" className="grid shrink-0 place-items-center rounded-[4px] border border-line-2 font-mono text-ink-2" style={{ width: size, height: size, fontSize: Math.max(9, size * 0.5) }}>
      {cert.issuer.slice(0, 1)}
    </span>
  );
}

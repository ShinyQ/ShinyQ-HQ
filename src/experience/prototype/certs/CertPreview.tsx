"use client";

import { useEffect, useRef } from "react";
import { ISSUER_COLOR, ISSUER_LOGO, issuerGroup, type ProtoCert } from "./fixture";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const long = (s: string) => `${MONTHS[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}`;
const STATUS = { earned: ["Earned", "text-green"], "in-progress": ["In progress", "text-amber"], expired: ["Expired", "text-ink-3"] } as const;

/**
 * Shared certification preview: our own card (no third-party iframe; credential sites refuse framing
 * and CSP keeps frame-src to self). Native <dialog> gives the focus trap, Esc and the backdrop.
 */
export function CertPreview({ cert, onClose }: { cert: ProtoCert | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (cert && !d.open) d.showModal();
    if (!cert && d.open) d.close();
  }, [cert]);
  const group = cert ? issuerGroup(cert.issuer) : "Other";
  const logo = ISSUER_LOGO[group];
  const [statusLabel, statusClass] = cert ? STATUS[cert.status] : STATUS.earned;
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      aria-labelledby="cert-preview-title"
      data-testid="cert-preview"
      className="glass glass-solid m-auto w-[min(440px,calc(100%-2rem))] overflow-hidden p-0 text-ink backdrop:bg-void/70 backdrop:backdrop-blur-sm"
    >
      {cert && (
        <div className="relative p-6">
          <span aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5" style={{ background: ISSUER_COLOR[group] }} />
          <div className="flex items-center gap-3">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" width={28} height={28} className="size-7 object-contain" />
            ) : (
              <span aria-hidden="true" className="grid size-7 place-items-center rounded-md border border-line-2 font-mono text-xs text-ink-2">
                {cert.issuer.slice(0, 1)}
              </span>
            )}
            <span className="pv-data">{cert.issuer}</span>
            <button type="button" onClick={onClose} className="ml-auto grid size-11 place-items-center rounded-full text-ink-2 hover:bg-surface-2 hover:text-ink" aria-label="Close">
              ✕
            </button>
          </div>
          {cert.code && <p className="pv-num mt-4 text-[44px] leading-none">{cert.code}</p>}
          <h2 id="cert-preview-title" className="mt-3 text-lg leading-snug font-semibold text-ink">
            {cert.name}
          </h2>
          <dl className="mt-5 grid grid-cols-[110px_minmax(0,1fr)] gap-y-2 text-sm">
            <dt className="pv-data pt-0.5">Status</dt>
            <dd className={`pv-mark ${statusClass}`}>{statusLabel}</dd>
            <dt className="pv-data pt-0.5">{cert.status === "in-progress" ? "Started" : "Issued"}</dt>
            <dd className="text-ink-2">{long(cert.issued)}</dd>
            {cert.expires && (
              <>
                <dt className="pv-data pt-0.5">{cert.status === "expired" ? "Expired" : "Renews"}</dt>
                <dd className="text-ink-2">{long(cert.expires)}</dd>
              </>
            )}
            {cert.credentialId && (
              <>
                <dt className="pv-data pt-0.5">Credential ID</dt>
                <dd className="font-mono text-[13px] text-ink-2">{cert.credentialId}</dd>
              </>
            )}
          </dl>
          <div className="mt-6 flex flex-wrap gap-3">
            {cert.url ? (
              <a href={cert.url} target="_blank" rel="noopener noreferrer" className="pv-btn pv-btn-primary">
                Open credential<span aria-hidden="true"> ↗</span>
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            ) : (
              <p className="pv-small">{cert.status === "in-progress" ? "Credential link appears once the exam is passed." : "No public credential link."}</p>
            )}
          </div>
        </div>
      )}
    </dialog>
  );
}

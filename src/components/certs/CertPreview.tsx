"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import type { CertView } from "@/content/cert-views";
import { onCertPreview } from "./events";
import { IssuerMark } from "./IssuerMark";

const STATUS_CLASS = { earned: "text-green", "in-progress": "text-amber", expired: "text-ink-3" } as const;

/**
 * The one certification preview card (Page View and the 3D Lobby), opened with `openCertPreview(id)`.
 * Our own card instead of an iframe: credential sites refuse framing and the CSP keeps frame-src to self.
 * A native modal <dialog> brings the focus trap, Esc and focus return; keys are captured so the rover,
 * drawer and other global shortcuts ignore them while it is open.
 */
export function CertPreviewHost({ certs }: { certs: CertView[] }) {
  const t = useTranslations("certs");
  const ref = useRef<HTMLDialogElement>(null);
  const [cert, setCert] = useState<CertView | null>(null);

  useEffect(() => onCertPreview((id) => setCert(certs.find((c) => c.id === id) ?? null)), [certs]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (cert && !dialog.open) dialog.showModal();
    if (!cert && dialog.open) dialog.close();
    if (!cert) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setCert(null);
      }
      // Default actions (Tab focus, Enter or Space on a button) still run; only other listeners are skipped.
      e.stopImmediatePropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [cert]);

  return (
    <dialog
      ref={ref}
      // The 3D input pauses while a modal dialog is open (see useInputSources).
      role="dialog"
      aria-modal={cert ? "true" : undefined}
      aria-labelledby="cert-preview-title"
      onClose={() => setCert(null)}
      onClick={(e) => e.target === e.currentTarget && setCert(null)}
      data-testid="cert-preview"
      className="glass glass-solid m-auto w-[min(460px,calc(100%-2rem))] overflow-hidden p-0 text-ink backdrop:bg-void/70"
    >
      {cert && (
        <div className="relative p-6">
          <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-0.5 ${cert.status === "in-progress" ? "bg-amber" : cert.status === "expired" ? "bg-ink-3" : "bg-cyan"}`} />
          <div className="flex items-center gap-3">
            <IssuerMark cert={cert} size={28} />
            <span className="pv-data">{cert.issuer}</span>
            <button type="button" onClick={() => setCert(null)} className="ml-auto grid size-11 place-items-center rounded-full text-ink-2 transition hover:bg-surface-2 hover:text-ink" aria-label={t("preview.close")}>
              <span aria-hidden="true">✕</span>
            </button>
          </div>
          {cert.code && <p className="pv-num mt-4 text-[44px] leading-none">{cert.code}</p>}
          <h2 id="cert-preview-title" className="mt-3 text-lg leading-snug font-semibold text-ink">
            {cert.name}
          </h2>
          <dl className="mt-5 grid grid-cols-[minmax(0,130px)_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
            <dt className="pv-data pt-0.5">{t("statusLabel")}</dt>
            <dd className={`pv-mark ${STATUS_CLASS[cert.status]}`}>{t(`status.${cert.status}`)}</dd>
            <dt className="pv-data pt-0.5">{cert.status === "in-progress" ? t("preview.planned") : t("preview.issued")}</dt>
            <dd className="text-ink-2">{cert.issuedLabel}</dd>
            {cert.expiresLabel && (
              <>
                <dt className="pv-data pt-0.5">{cert.status === "expired" ? t("preview.expiredOn") : t("preview.renews")}</dt>
                <dd className="text-ink-2">{cert.expiresLabel}</dd>
              </>
            )}
            {cert.credentialId && (
              <>
                <dt className="pv-data pt-0.5">{t("preview.credentialId")}</dt>
                <dd className="font-mono text-[13px] break-all text-ink-2">{cert.credentialId}</dd>
              </>
            )}
          </dl>
          <div className="mt-6">
            {cert.url ? (
              <a href={cert.url} target="_blank" rel="noopener noreferrer" className="pv-btn pv-btn-primary">
                {t("preview.open")}
                <span aria-hidden="true"> ↗</span>
                <span className="sr-only"> ({t("preview.newTab")})</span>
              </a>
            ) : (
              <p className="pv-small">{cert.status === "in-progress" ? t("preview.pending") : t("preview.noLink")}</p>
            )}
          </div>
        </div>
      )}
    </dialog>
  );
}

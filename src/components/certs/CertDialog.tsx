"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";
import type { CertView } from "@/content/certs";
import { Modal } from "../Modal";
import { IssuerMark } from "./IssuerMark";

const STATUS_CLASS = { earned: "text-green", "in-progress": "text-amber", expired: "text-ink-3" } as const;

/**
 * Certification preview card (lazy chunk, opened by `DialogHost` on the `hq:hud` "cert" command from
 * Page View cards and rows or a 3D Lobby badge): issuer, exam code, full name, status, dates,
 * credential ID, "Read study guide" when the certification has one (a `[data-hq-guide]` button: `DialogHost`'s delegated click
 * swaps this card for the reader and keeps the original opener for focus return, so it never closes first) and
 * "Open credential" in a new tab. Credential sites are never framed (they refuse
 * framing and the CSP keeps `frame-src 'self'`), and there is no "Verified" style label.
 */
export default function CertDialog({ cert, onClose }: { cert: CertView; onClose: () => void }) {
  const t = useTranslations("certs");
  const titleId = useId();
  return (
    <Modal labelledBy={titleId} onClose={onClose} width="sm" testId="cert-dialog">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6">
        <div className="flex items-center gap-3">
          <IssuerMark cert={cert} size={28} />
          <span className="pv-data min-w-0 truncate">{cert.issuer}</span>
          <button
            type="button"
            onClick={onClose}
            data-autofocus
            aria-label={t("preview.close")}
            className="ml-auto inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-line-2 text-ink transition hover:border-ink-2 hover:bg-surface-2"
          >
            <span aria-hidden="true" className="text-xl leading-none">
              ×
            </span>
          </button>
        </div>
        {cert.code && <p className="pv-num mt-4 text-[44px] leading-none">{cert.code}</p>}
        <h2 id={titleId} className="mt-3 text-lg leading-snug font-semibold text-ink">
          {cert.name}
        </h2>
        <dl className="mt-5 grid grid-cols-[minmax(0,130px)_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
          <dt className="label pt-0.5 text-ink-3">{t("statusLabel")}</dt>
          <dd className={`pv-mark ${STATUS_CLASS[cert.status]}`}>{t(`status.${cert.status}`)}</dd>
          <dt className="label pt-0.5 text-ink-3">{cert.status === "in-progress" ? t("preview.planned") : t("preview.issued")}</dt>
          <dd className="text-ink-2">{cert.issuedLabel}</dd>
          {cert.expiresLabel && (
            <>
              <dt className="label pt-0.5 text-ink-3">{cert.status === "expired" ? t("preview.expiredOn") : t("preview.renews")}</dt>
              <dd className="text-ink-2">{cert.expiresLabel}</dd>
            </>
          )}
          {cert.credentialId && (
            <>
              <dt className="label pt-0.5 text-ink-3">{t("preview.credentialId")}</dt>
              <dd className="font-mono text-[13px] break-all text-ink-2">{cert.credentialId}</dd>
            </>
          )}
        </dl>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {cert.guide && (
            <button
              type="button"
              data-hq-guide={cert.guide}
              data-testid="cert-read-guide"
              aria-haspopup="dialog"
              className="pv-btn pv-btn-primary"
            >
              {t("preview.readGuide")}
            </button>
          )}
          {cert.url ? (
            <a
              href={cert.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`pv-btn ${cert.guide ? "pv-btn-ghost" : "pv-btn-primary"}`}
              data-testid="cert-open"
            >
              {t("preview.open")}
              <span aria-hidden="true">&nbsp;&#8599;</span>
              <span className="sr-only"> ({t("preview.newTab")})</span>
            </a>
          ) : (
            <p className="pv-small">{cert.status === "in-progress" ? t("preview.pending") : t("preview.noLink")}</p>
          )}
        </div>
      </div>
    </Modal>
  );
}

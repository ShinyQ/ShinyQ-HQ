"use client";

import { useTranslations } from "next-intl";
import { Fragment, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { previewCitations, type PaperCitations, type PaperPreview } from "@/content/citation";
import { Modal } from "../Modal";
import { PaperNotice, PaperReader } from "./PaperReader";

type Format = keyof PaperCitations;
const FORMATS: readonly Format[] = ["apa", "ieee", "bibtex"];

const BUTTON =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-line-2 px-3 text-sm font-semibold text-ink transition hover:border-ink-2 hover:bg-surface-2";

function External({ href, children, testId }: { href: string; children: ReactNode; testId?: string }) {
  const t = useTranslations("paper");
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={BUTTON} data-testid={testId}>
      {children}
      <span aria-hidden="true">&nbsp;&#8599;</span>
      <span className="sr-only"> ({t("external")})</span>
    </a>
  );
}

/**
 * Paper preview modal (lazy chunk, opened by `DialogHost` on the `hq:hud` "paper" command): title,
 * authors with the owner highlighted, venue, date, abstract, a copyable citation (APA, IEEE,
 * BibTeX) and DOI, Google Scholar, PDF and code links in a new tab. Papers with a self-hosted PDF
 * get "Read the paper", which swaps the body for the paper reader (page images, `PaperReader`);
 * `read` opens the reader at once. Nothing from a third party is framed (CSP keeps `frame-src 'self'`).
 */
export default function PaperDialog({ paper, read = false, onClose }: { paper: PaperPreview; read?: boolean; onClose: () => void }) {
  const t = useTranslations("paper");
  const titleId = useId();
  const citeId = useId();
  const doc = paper.document;
  const [reading, setReading] = useState(read && Boolean(doc));
  const readRef = useRef<HTMLButtonElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const switched = useRef(false);
  useEffect(() => {
    // The Modal focuses on mount; after a switch, focus the control that switches back.
    if (!switched.current) return;
    (reading ? backRef : readRef).current?.focus({ preventScroll: true });
  }, [reading]);
  const switchTo = (next: boolean) => {
    switched.current = true;
    setReading(next);
  };
  const [format, setFormat] = useState<Format>("apa");
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const reset = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(reset.current), []);

  const citations = useMemo(() => previewCitations(paper), [paper]);
  const citation = citations[format];
  const doiUrl = paper.doi ? `https://doi.org/${paper.doi}` : undefined;
  // A GitHub URL without a separate code link is the source code, not a publisher page.
  const code = paper.code ?? (paper.url?.startsWith("https://github.com/") ? paper.url : undefined);
  const publisherPage = paper.url && paper.url !== doiUrl && paper.url !== code ? paper.url : undefined;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(citation);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
    window.clearTimeout(reset.current);
    reset.current = window.setTimeout(() => setStatus("idle"), 4000);
  };

  if (reading && doc) {
    return (
      <Modal labelledBy={titleId} onClose={onClose} width="lg" testId="paper-dialog">
        <PaperReader paper={paper} document={doc} titleId={titleId} backRef={backRef} onBack={() => switchTo(false)} onClose={onClose} />
      </Modal>
    );
  }

  return (
    <Modal labelledBy={titleId} onClose={onClose} width="md" testId="paper-dialog">
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-4 sm:px-6">
        <div className="min-w-0">
          <p className="label text-amber">
            {paper.kind} · {paper.date}
          </p>
          <h2 id={titleId} className="mt-2 text-lg leading-7 font-semibold text-ink sm:text-xl">
            {paper.title}
          </h2>
        </div>
        <button type="button" onClick={onClose} className={BUTTON} aria-label={t("close")} data-autofocus data-testid="paper-close">
          <span aria-hidden="true" className="text-xl leading-none">
            ×
          </span>
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6">
        <dl className="grid gap-x-6 gap-y-3 text-sm leading-6 sm:grid-cols-[110px_minmax(0,1fr)]">
          <dt className="label pt-1 text-ink-3">{t("authors")}</dt>
          <dd className="text-ink-2">
            {paper.authors.map((name, i) => (
              <Fragment key={name}>
                {i > 0 && ", "}
                {name === paper.self ? <strong className="font-semibold text-ink">{name}</strong> : name}
              </Fragment>
            ))}
          </dd>
          {(paper.venue || paper.publisher) && (
            <>
              <dt className="label pt-1 text-ink-3">{t("venue")}</dt>
              <dd className="text-ink-2 italic">{[paper.venue, paper.publisher].filter((v, i, all) => v && all.indexOf(v) === i).join(", ")}</dd>
            </>
          )}
          <dt className="label pt-1 text-ink-3">{t("year")}</dt>
          <dd className="text-ink-2">{paper.year}</dd>
          {paper.citationCount && (
            <>
              <dt className="label pt-1 text-ink-3">{t("cited")}</dt>
              <dd className="text-ink-2">{paper.citationCount}</dd>
            </>
          )}
        </dl>

        {doc && (
          <section className="space-y-2 rounded-lg border border-line p-3" data-testid="paper-document">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <button
                ref={readRef}
                type="button"
                onClick={() => switchTo(true)}
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-cyan px-4 text-sm font-semibold text-void transition hover:bg-cyan/85"
                data-testid="paper-read"
              >
                {t("read")}
              </button>
              <p className="text-sm text-ink-2">
                {t("readHint", { count: doc.pageCount })} · {t(`version.${doc.version}`)}
              </p>
            </div>
            <PaperNotice paper={paper} document={doc} />
          </section>
        )}

        {(paper.abstract || paper.summary) && (
          <section aria-labelledby={`${titleId}-abstract`}>
            <h3 id={`${titleId}-abstract`} className="label text-ink-2">
              {paper.abstract ? t("abstract") : t("summary")}
            </h3>
            <p lang={paper.abstract ? "en" : undefined} className="mt-2 text-[15px] leading-7 text-ink" data-testid="paper-abstract">
              {paper.abstract ?? paper.summary}
            </p>
          </section>
        )}

        <section aria-labelledby={citeId}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id={citeId} className="label text-ink-2">
              {t("cite")}
            </h3>
            <div role="group" aria-label={t("format")} className="flex gap-1.5">
              {FORMATS.map((f) => (
                <button key={f} type="button" className="chip min-h-11" aria-pressed={format === f} onClick={() => setFormat(f)} data-testid={`cite-${f}`}>
                  {t(`formats.${f}`)}
                </button>
              ))}
            </div>
          </div>
          <pre
            className="mt-3 max-h-56 overflow-auto rounded-lg border border-line bg-void/60 p-3 font-mono text-[12.5px] leading-5 whitespace-pre-wrap text-ink-2 [overflow-wrap:anywhere]"
            tabIndex={0}
            aria-label={t("citationIn", { format: t(`formats.${format}`) })}
            data-testid="paper-citation"
          >
            {citation}
          </pre>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button type="button" onClick={copy} className={BUTTON} data-testid="paper-copy">
              {t("copy")}
            </button>
            <p role="status" aria-live="polite" className="text-sm text-ink-2">
              {status === "copied" ? t("copied") : status === "failed" ? t("copyFailed") : ""}
            </p>
          </div>
        </section>

        <section>
          <h3 className="label text-ink-2">{t("links")}</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {doiUrl && (
              <External href={doiUrl} testId="paper-doi">
                {t("doi")} {paper.doi}
              </External>
            )}
            <External href={paper.scholar} testId="paper-scholar">
              {t("scholar")}
            </External>
            {publisherPage && <External href={publisherPage}>{t("publisher")}</External>}
            {paper.pdf && <External href={paper.pdf}>{t("pdf")}</External>}
            {code && <External href={code}>{t("code")}</External>}
          </div>
        </section>
      </div>
    </Modal>
  );
}

"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState, type ComponentType, type ReactNode } from "react";
import type { PdfReaderProps } from "./PdfReader";
import { loadPdfjs } from "./pdf";
import { BackButton, COMPACT_BUTTON, HEADER_ROW, ReaderSkeleton, useKeepFocus, type ReaderBack } from "./ui";

/**
 * Loads the reader chunk (`./PdfReader`, imported by hand rather than through `next/dynamic`, so a failed chunk lands
 * in the error state) and starts pdf.js in parallel. `fail` puts the dialog in its error state (a failed PDF open, or
 * the guide dialog's data fetch); `retry` clears it and bumps `attempt`, which remounts the reader.
 */
export function useLazyReader() {
  const [Reader, setReader] = useState<ComponentType<PdfReaderProps> | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    loadPdfjs().catch(() => {});
    import("./PdfReader")
      .then((mod) => {
        if (live) setReader(() => mod.default);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setFailed(false);
    setAttempt((n) => n + 1);
  }, []);
  const fail = useCallback(() => setFailed(true), []);
  return { Reader, failed, attempt, retry, fail };
}

export interface ReaderHeaderProps {
  title: string;
  titleId: string;
  closeLabel: string;
  onClose: () => void;
  back?: ReaderBack;
  testPrefix: string;
}

/** The loading and error states' header row: the reader's own row without Chapters and Download, so the swap does not jump. */
export function ReaderHeader({ title, titleId, closeLabel, onClose, back, testPrefix }: ReaderHeaderProps) {
  const close = useKeepFocus();
  return (
    <div className={HEADER_ROW}>
      <button ref={close} type="button" onClick={onClose} data-autofocus aria-label={closeLabel} className={COMPACT_BUTTON} data-testid={`${testPrefix}-close`}>
        <span aria-hidden="true" className="text-xl leading-none">
          ×
        </span>
      </button>
      {back && <BackButton back={back} testPrefix={testPrefix} />}
      <h2 id={titleId} className="min-w-0 truncate text-base font-semibold text-ink">
        {title}
      </h2>
    </div>
  );
}

export interface ReaderStateProps extends ReaderHeaderProps {
  failed: boolean;
  /** Retry in the error state (absent when retrying cannot help, e.g. an unknown guide). */
  onRetry?: () => void;
  /** Download in the error state, once the document is known. */
  download?: { url: string; file: string };
  cover?: string;
  labels: { loading: string; error?: string; retry: string; download: string };
  footer?: ReactNode;
}

/** Loading (skeleton with the cover) or the error state (Retry, Download), under the reader's header row. */
export function ReaderState({ failed, onRetry, download, cover, labels, footer, ...header }: ReaderStateProps) {
  const { testPrefix } = header;
  return (
    <>
      <ReaderHeader {...header} />
      <div className="min-h-0 flex-1 overflow-y-auto" aria-busy={!failed} data-testid={failed ? `${testPrefix}-error` : `${testPrefix}-loading`}>
        {failed ? (
          <div role="alert" className="flex flex-col items-center gap-4 px-4 py-10 text-center">
            {labels.error ? (
              <p className="text-ink">{labels.error}</p>
            ) : (
              <span aria-hidden="true" className="text-2xl text-amber">
                !
              </span>
            )}
            <div className="flex flex-wrap justify-center gap-3">
              {onRetry && (
                <button type="button" onClick={onRetry} className="pv-btn pv-btn-primary" data-testid={`${testPrefix}-retry`}>
                  {labels.retry}
                </button>
              )}
              {download && (
                <a href={download.url} download={download.file} className="pv-btn pv-btn-ghost" data-testid={`${testPrefix}-download`}>
                  {labels.download}
                </a>
              )}
            </div>
          </div>
        ) : (
          <>
            <p className="sr-only" role="status">
              {labels.loading}
            </p>
            <ReaderSkeleton cover={cover} />
          </>
        )}
      </div>
      {footer && <div className="border-t border-line px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-4">{footer}</div>}
    </>
  );
}

/**
 * The reader inside a dialog whose document is known at once (the CV, a paper PDF): the header, a skeleton with the
 * cover and the error state come from this small module, the reader and pdf.js load lazily. Strings from `reader`.
 */
export function LazyPdfReader(props: Omit<PdfReaderProps, "onError">) {
  const t = useTranslations("reader");
  const { Reader, failed, attempt, retry, fail } = useLazyReader();
  const { doc, titleId, closeLabel, onClose, back, footer, testPrefix = "guide" } = props;
  if (Reader && !failed) return <Reader key={attempt} {...props} onError={fail} />;
  return (
    <ReaderState
      title={doc.title}
      titleId={titleId}
      closeLabel={closeLabel}
      onClose={onClose}
      back={back}
      testPrefix={testPrefix}
      failed={failed}
      onRetry={retry}
      download={{ url: doc.downloadUrl, file: doc.file }}
      cover={doc.cover}
      labels={{ loading: t("loading"), error: t("error"), retry: t("retry"), download: t("download") }}
      footer={footer}
    />
  );
}

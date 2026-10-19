"use client";

import { NextIntlClientProvider, useLocale, useTranslations, type AbstractIntlMessages } from "next-intl";
import { useCallback, useEffect, useId, useState, type ComponentType } from "react";
import type { GuideView } from "@/content/guides";
import { Modal } from "../Modal";
import { guidesDataUrl, type GuidesData } from "./data-path";
import type { GuideReaderProps } from "./GuideReader";
import { loadPdfjs } from "./pdf";
import { BUTTON, GuideSkeleton, useKeepFocus } from "./ui";

/**
 * Study guide dialog (lazy chunk, opened by `DialogHost` on the `hq:hud` "guide" command). The Modal mounts at
 * once (Close focused, Esc live) while the guide data, the reader chunk and pdf.js load in parallel. The `guides`
 * strings come with the views from `/data/guides/{locale}.json`, never in a page's HTML, so the content sits in a
 * nested intl provider; until they arrive the header reads the layout's `certs.preview` strings. A failed data
 * fetch, chunk import or PDF load shows the error state with Retry (and Download once the view is known).
 * The reader is imported by hand rather than through `next/dynamic`, so a failed chunk lands in that error state.
 */
export default function GuideDialog({ slug, onClose }: { slug: string; onClose: () => void }) {
  const locale = useLocale();
  const titleId = useId();
  const [data, setData] = useState<GuidesData | null>(null);
  const [Reader, setReader] = useState<ComponentType<GuideReaderProps> | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    const fail = () => {
      if (live) setFailed(true);
    };
    loadPdfjs().catch(() => {});
    import("./GuideReader")
      .then((mod) => {
        if (live) setReader(() => mod.default);
      })
      .catch(fail);
    fetch(guidesDataUrl(locale))
      .then((response) => (response.ok ? (response.json() as Promise<GuidesData>) : Promise.reject(new Error(String(response.status)))))
      .then((next) => {
        if (live) setData(next);
      })
      .catch(fail);
    return () => {
      live = false;
    };
  }, [locale, attempt]);

  const retry = useCallback(() => {
    setFailed(false);
    setAttempt((n) => n + 1);
  }, []);
  const onError = useCallback(() => setFailed(true), []);

  const view = data?.guides.find((g) => g.slug === slug);
  const missing = data !== null && !view;
  return (
    <Modal labelledBy={titleId} onClose={onClose} width="lg" testId="guide-dialog">
      {data ? (
        <NextIntlClientProvider locale={locale} messages={data.messages as AbstractIntlMessages}>
          {view && Reader && !failed ? (
            <Reader key={attempt} view={view} titleId={titleId} onClose={onClose} onError={onError} />
          ) : (
            <GuideState view={view} titleId={titleId} onClose={onClose} onRetry={missing ? undefined : retry} failed={failed || missing} />
          )}
        </NextIntlClientProvider>
      ) : (
        <Pending titleId={titleId} onClose={onClose} onRetry={failed ? retry : undefined} />
      )}
    </Modal>
  );
}

function Header({ title, titleId, closeLabel, onClose }: { title: string; titleId: string; closeLabel: string; onClose: () => void }) {
  const close = useKeepFocus();
  return (
    <div className="flex items-center gap-3 border-b border-line px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 sm:px-5">
      <button ref={close} type="button" onClick={onClose} data-autofocus aria-label={closeLabel} className={BUTTON} data-testid="guide-close">
        <span aria-hidden="true" className="text-xl leading-none">
          ×
        </span>
      </button>
      <h2 id={titleId} className="min-w-0 truncate text-base font-semibold text-ink sm:text-lg">
        {title}
      </h2>
    </div>
  );
}

/** Before the guide data arrives only the layout's `certs.preview` strings exist, so Retry reads "Read study guide". */
function Pending({ titleId, onClose, onRetry }: { titleId: string; onClose: () => void; onRetry?: () => void }) {
  const t = useTranslations("certs.preview");
  return (
    <>
      <Header title={t("readGuide")} titleId={titleId} closeLabel={t("close")} onClose={onClose} />
      <div className="min-h-0 flex-1 overflow-y-auto" aria-busy={!onRetry} data-testid={onRetry ? "guide-error" : "guide-loading"}>
        {onRetry ? (
          <div role="alert" className="flex flex-col items-center gap-4 px-4 py-10 text-center">
            <span aria-hidden="true" className="text-2xl text-amber">
              !
            </span>
            <button type="button" onClick={onRetry} className="pv-btn pv-btn-primary" data-testid="guide-retry">
              {t("readGuide")}
            </button>
          </div>
        ) : (
          <GuideSkeleton />
        )}
      </div>
    </>
  );
}

/** Loading (data known, the reader chunk on its way) or the error state, with the `guides` strings. */
function GuideState({ view, titleId, onClose, onRetry, failed }: { view?: GuideView; titleId: string; onClose: () => void; onRetry?: () => void; failed: boolean }) {
  const t = useTranslations("guides");
  return (
    <>
      <Header title={view?.title ?? t("eyebrow")} titleId={titleId} closeLabel={t("close")} onClose={onClose} />
      <div className="min-h-0 flex-1 overflow-y-auto" aria-busy={!failed} data-testid={failed ? "guide-error" : "guide-loading"}>
        {failed ? (
          <div role="alert" className="flex flex-col items-center gap-4 px-4 py-10 text-center">
            <p className="text-ink">{t("error")}</p>
            <div className="flex flex-wrap justify-center gap-3">
              {onRetry && (
                <button type="button" onClick={onRetry} className="pv-btn pv-btn-primary" data-testid="guide-retry">
                  {t("retry")}
                </button>
              )}
              {view && (
                <a href={view.downloadUrl} download={view.file} className="pv-btn pv-btn-ghost" data-testid="guide-download">
                  {t("download")}
                </a>
              )}
            </div>
          </div>
        ) : (
          <>
            <p className="sr-only" role="status">
              {t("loading")}
            </p>
            <GuideSkeleton cover={view?.cover} />
          </>
        )}
      </div>
    </>
  );
}

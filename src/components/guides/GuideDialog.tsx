"use client";

import { NextIntlClientProvider, useLocale, useTranslations, type AbstractIntlMessages } from "next-intl";
import { useEffect, useId, useState } from "react";
import { GUIDE_PAGE_KEY, type GuideView } from "@/content/guides";
import { Modal } from "../Modal";
import { ReaderState, useLazyReader } from "../pdf-reader/ReaderDialog";
import { guidesDataUrl, type GuidesData } from "./data-path";

/**
 * Study guide dialog (lazy chunk, opened by `DialogHost` on the `hq:hud` "guide" command), on the shared PDF reader
 * (`../pdf-reader`). The Modal mounts at once (Close focused, Esc live) while the guide data, the reader chunk and
 * pdf.js load in parallel. The `guides` strings come with the views (and the `reader` strings) from
 * `/data/guides/{locale}.json`, never in a page's HTML, so the content sits in a nested intl provider; until they
 * arrive the header reads the layout's `certs.preview` and `reader` strings. A failed data fetch, chunk import or
 * PDF load shows the error state with Retry (and Download once the view is known).
 */
export default function GuideDialog({ slug, onClose }: { slug: string; onClose: () => void }) {
  const locale = useLocale();
  const titleId = useId();
  const [data, setData] = useState<GuidesData | null>(null);
  const { Reader, failed, attempt, retry, fail } = useLazyReader();

  useEffect(() => {
    let live = true;
    fetch(guidesDataUrl(locale))
      .then((response) => (response.ok ? (response.json() as Promise<GuidesData>) : Promise.reject(new Error(String(response.status)))))
      .then((next) => {
        if (live) setData(next);
      })
      .catch(() => {
        if (live) fail();
      });
    return () => {
      live = false;
    };
  }, [locale, attempt, fail]);

  const view = data?.guides.find((g) => g.slug === slug);
  const missing = data !== null && !view;
  return (
    <Modal labelledBy={titleId} onClose={onClose} width="lg" testId="guide-dialog">
      {data ? (
        <NextIntlClientProvider locale={locale} messages={data.messages as AbstractIntlMessages}>
          {view && Reader && !failed ? (
            <GuideReader Reader={Reader} attempt={attempt} view={view} titleId={titleId} onClose={onClose} onError={fail} />
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

type Reader = NonNullable<ReturnType<typeof useLazyReader>["Reader"]>;

function GuideReader({ Reader, attempt, view, titleId, onClose, onError }: { Reader: Reader; attempt: number; view: GuideView; titleId: string; onClose: () => void; onError: () => void }) {
  const t = useTranslations("guides");
  return (
    <Reader
      key={attempt}
      doc={{ url: view.url, downloadUrl: view.downloadUrl, file: view.file, title: view.title, cover: view.cover, pageKey: GUIDE_PAGE_KEY(view.slug) }}
      titleId={titleId}
      closeLabel={t("close")}
      onClose={onClose}
      onError={onError}
      testPrefix="guide"
    />
  );
}

/** Before the guide data arrives only the layout's strings exist, so Retry reads "Read study guide". */
function Pending({ titleId, onClose, onRetry }: { titleId: string; onClose: () => void; onRetry?: () => void }) {
  const t = useTranslations("certs.preview");
  const r = useTranslations("reader");
  return (
    <ReaderState
      title={t("readGuide")}
      titleId={titleId}
      closeLabel={t("close")}
      onClose={onClose}
      testPrefix="guide"
      failed={Boolean(onRetry)}
      onRetry={onRetry}
      labels={{ loading: r("loading"), retry: t("readGuide"), download: r("download") }}
    />
  );
}

/** Loading (data known, the reader chunk on its way) or the error state, with the `guides` strings. */
function GuideState({ view, titleId, onClose, onRetry, failed }: { view?: GuideView; titleId: string; onClose: () => void; onRetry?: () => void; failed: boolean }) {
  const t = useTranslations("guides");
  const r = useTranslations("reader");
  return (
    <ReaderState
      title={view?.title ?? t("eyebrow")}
      titleId={titleId}
      closeLabel={t("close")}
      onClose={onClose}
      testPrefix="guide"
      failed={failed}
      onRetry={onRetry}
      download={view ? { url: view.downloadUrl, file: view.file } : undefined}
      cover={view?.cover}
      labels={{ loading: t("loading"), error: t("error"), retry: r("retry"), download: t("download") }}
    />
  );
}

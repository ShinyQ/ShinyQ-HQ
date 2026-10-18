"use client";

import { NextIntlClientProvider, useLocale, useTranslations, type AbstractIntlMessages } from "next-intl";
import { useEffect, useId, useState } from "react";
import { Modal } from "../Modal";
import { guidesDataUrl, type GuidesData } from "./data-path";

/**
 * Study guide dialog (lazy chunk, opened by `DialogHost` on the `hq:hud` "guide" command). The `guides` strings
 * come with the guide views from `/data/guides/{locale}.json`, never in a page's HTML, so this wraps its content in
 * a nested intl provider. Placeholder until the pdf.js reader lands: the title and a close button.
 */
export default function GuideDialog({ slug, onClose }: { slug: string; onClose: () => void }) {
  const locale = useLocale();
  const [data, setData] = useState<GuidesData | null>(null);

  useEffect(() => {
    let live = true;
    fetch(guidesDataUrl(locale))
      .then((response) => (response.ok ? (response.json() as Promise<GuidesData>) : Promise.reject(new Error(String(response.status)))))
      .then((next) => live && setData(next))
      .catch(() => live && onClose());
    return () => {
      live = false;
    };
  }, [locale, onClose]);

  if (!data) return null;
  return (
    <NextIntlClientProvider locale={locale} messages={data.messages as AbstractIntlMessages}>
      <GuideBody title={data.guides.find((g) => g.slug === slug)?.title ?? slug} onClose={onClose} />
    </NextIntlClientProvider>
  );
}

function GuideBody({ title, onClose }: { title: string; onClose: () => void }) {
  const t = useTranslations("guides");
  const titleId = useId();
  return (
    <Modal labelledBy={titleId} onClose={onClose} width="lg" testId="guide-dialog">
      <div className="flex items-center gap-3 px-5 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-6">
        <h2 id={titleId} className="min-w-0 truncate text-lg font-semibold text-ink">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          data-autofocus
          aria-label={t("close")}
          className="ml-auto inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-line-2 text-ink transition hover:border-ink-2 hover:bg-surface-2"
        >
          <span aria-hidden="true" className="text-xl leading-none">
            ×
          </span>
        </button>
      </div>
    </Modal>
  );
}

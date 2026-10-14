"use client";

import { useTranslations } from "next-intl";
import type { AskClientError } from "@/ask/client";
import { citeKind, isAskCite } from "@/ask/protocol";
import type { Locale } from "@/content/schema";
import { formatDate } from "@/lib/format";

/** Friendly copy for a failed question (rate limit, paused service, anything else). */
export function useAskErrorMessage() {
  const t = useTranslations("ask.error");
  return ({ error, retryAfter }: { error?: AskClientError; retryAfter?: number }) => {
    if (error === "rate_limited") return t("rateLimited", { minutes: Math.max(1, Math.ceil((retryAfter ?? 60) / 60)) });
    if (error === "disabled" || error === "paused") return t("offline");
    return t("fallback");
  };
}

/** "Answered by AI from this site, as of {date}". */
export function AskAsOf({ asOf, locale, className }: { asOf?: string; locale: Locale; className?: string }) {
  const t = useTranslations("ask");
  if (!asOf || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return null;
  return <p className={className}>{t("asOf", { date: formatDate(asOf, locale) })}</p>;
}

/** What happens to a question (design section 7.5, threat T10). */
export function AskPrivacy({ className }: { className?: string }) {
  const t = useTranslations("ask");
  return (
    <p className={className}>
      <span className="font-semibold">{t("privacyTitle")}: </span>
      {t("privacy")}
    </p>
  );
}

/**
 * "Read on this site" link under a cited answer (spec section 13). A plain anchor on purpose, so a
 * same-page hash (`/contact#how`) still scrolls; the path is allowlisted (`isAskCite`) and never
 * comes from the model's text.
 */
export function AskCiteLink({ path, locale, className, onNavigate }: { path: string; locale: Locale; className?: string; onNavigate?: () => void }) {
  const t = useTranslations("ask");
  if (!isAskCite(path)) return null;
  return (
    <p className={className}>
      <a href={`/${locale}${path}`} onClick={onNavigate} className="link" data-testid="ask-cite">
        {t("dock.source", { label: t(`cite.${citeKind(path)}`) })}
      </a>
    </p>
  );
}

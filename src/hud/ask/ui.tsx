"use client";

import { useTranslations } from "next-intl";
import type { AskClientError } from "@/ask/client";
import { citeKind, isAskCite, isAskContact, type AskContact } from "@/ask/protocol";
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

/**
 * "Read on this site" link under a cited answer (spec section 13). A plain anchor on purpose, so a
 * same-page hash (`/contact#how`) still scrolls; the path is allowlisted (`isAskCite`) and never
 * comes from the model's text. The site's public repository (a cite kept for older cached answers) opens in a new tab instead and leaves the chat open.
 */
export function AskCiteLink({ path, locale, className, onNavigate }: { path: string; locale: Locale; className?: string; onNavigate?: () => void }) {
  const t = useTranslations("ask");
  if (!isAskCite(path)) return null;
  if (citeKind(path) === "repo") {
    return (
      <p className={className}>
        <a href={path} target="_blank" rel="noopener noreferrer" className="link" data-testid="ask-cite">
          {t("dock.sourceExternal", { label: t("cite.repo") })}
          <span aria-hidden="true"> ↗</span>
          <span className="sr-only"> ({t("dock.newTab")})</span>
        </a>
      </p>
    );
  }
  return (
    <p className={className}>
      <a href={`/${locale}${path}`} onClick={onNavigate} className="link" data-testid="ask-cite">
        {t("dock.source", { label: t(`cite.${citeKind(path)}`) })}
      </a>
    </p>
  );
}

/**
 * Contact card under a lead-intent answer (owner request 2026-10-15): email, LinkedIn and the
 * Contact page. The values come from the dataset through the `done` frame, never from the model's
 * text, and are validated again here (`isAskContact`).
 */
export function AskContactCard({ contact, locale, className = "", onNavigate }: { contact: AskContact; locale: Locale; className?: string; onNavigate?: () => void }) {
  const t = useTranslations("ask");
  if (!isAskContact(contact)) return null;
  const item = "inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-surface-2 px-3 text-sm text-ink transition hq-glow hover:text-cyan";
  return (
    <section aria-label={t("contact.label")} className={`rounded-xl border border-line bg-surface-2/60 p-3 ${className}`} data-testid="ask-contact">
      <p className="text-[13px] leading-5 font-semibold text-ink">{t("contact.title")}</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        <li>
          <a href={`mailto:${contact.email}`} className={item} data-testid="ask-contact-email">
            {t("contact.email")}
            <span className="sr-only">: {contact.email}</span>
          </a>
        </li>
        <li>
          <a href={contact.linkedin} target="_blank" rel="noopener noreferrer" className={item} data-testid="ask-contact-linkedin">
            {t("contact.linkedin")}
            <span aria-hidden="true">↗</span>
            <span className="sr-only"> ({t("dock.newTab")})</span>
          </a>
        </li>
        <li>
          <a href={`/${locale}/contact`} onClick={onNavigate} className={item} data-testid="ask-contact-page">
            {t("contact.page")}
          </a>
        </li>
      </ul>
      <p className="mt-2 text-[12px] leading-4 break-all text-ink-3">{contact.email}</p>
    </section>
  );
}

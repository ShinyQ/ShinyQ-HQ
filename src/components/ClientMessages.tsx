import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { CLIENT_NAMESPACES, omitMessages, pickMessages, SERVER_PATHS } from "@/i18n/client-messages";

/**
 * Wraps a page whose client islands read namespaces beyond the layout's (src/i18n/client-messages.ts).
 * React dedupes the namespace objects the layout already sent, so the overlap costs only references.
 * Server-only sub-paths (SERVER_PATHS) are dropped.
 */
export async function ClientMessages({ children }: { children: ReactNode }) {
  return <NextIntlClientProvider messages={omitMessages(pickMessages(await getMessages(), CLIENT_NAMESPACES), SERVER_PATHS)}>{children}</NextIntlClientProvider>;
}

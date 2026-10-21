import { createTranslator, type AbstractIntlMessages } from "next-intl";
import type { OfficeTranslate } from "@/experience/floors/lobby/officeLayout";

/** An `office` namespace translator over one locale's `office` messages (dotted keys, ICU placeholders). */
export function makeT(office: AbstractIntlMessages, locale: "en" | "id" = "en"): OfficeTranslate {
  return createTranslator({ locale, messages: { office }, namespace: "office" }) as unknown as OfficeTranslate;
}

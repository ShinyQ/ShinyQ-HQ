import { LOCALES, type Locale } from "@/content/locales";
import { switchLocale } from "@/hud/switchLocale";
import { getHQStore } from "@/store/useHQStore";
import { defineSetting } from "../registry";

export const languageSetting = defineSetting({
  id: "language",
  group: "general",
  order: 10,
  labelKey: "language.label",
  control: {
    kind: "choice",
    options: LOCALES.map((value) => ({ value, labelKey: `language.${value}` })),
    get: () => getHQStore().getState().locale,
    set: (value) => {
      if (value !== getHQStore().getState().locale) switchLocale(value as Locale);
    },
  },
  subscribe: (listener) => getHQStore().subscribe(() => listener()),
});

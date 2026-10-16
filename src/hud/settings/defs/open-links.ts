import { getViewPreference, setViewPreference, subscribeViewPreference } from "@/lib/view-pref";
import { defineSetting } from "../registry";

export const openLinks = defineSetting({
  id: "open-links",
  group: "general",
  order: 20,
  labelKey: "openLinks.label",
  hintKey: "openLinks.hint",
  control: {
    kind: "choice",
    options: [
      { value: "page", labelKey: "openLinks.page" },
      { value: "3d", labelKey: "openLinks.3d" },
    ],
    get: () => getViewPreference() ?? "3d",
    set: (value) => setViewPreference(value === "page" ? "page" : "3d"),
  },
  subscribe: subscribeViewPreference,
});

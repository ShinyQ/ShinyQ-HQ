import { viewHref, type ViewChoice } from "./view-param";

/** Links that pick their own view (the boot card's Classic site, Enter the 3D HQ) or are downloads. */
const SKIP = "[data-hq-page-link],[data-hq-view],[download]";

export function syncViewLinks(root: ParentNode, view: ViewChoice, base: string): void {
  const links = root instanceof Element && root.matches("a[href]") ? [root] : [];
  for (const a of [...links, ...root.querySelectorAll("a[href]")]) {
    if (a.matches(SKIP)) continue;
    const next = viewHref(a.getAttribute("href") ?? "", view, base);
    if (next !== null) a.setAttribute("href", next);
  }
}

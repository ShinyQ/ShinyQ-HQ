import { PERSPECTIVE_ANCHOR_PREFIX, perspectiveAnchor, type PerspectiveLink } from "@/content/perspectives";
import type { Locale, Perspective } from "@/content/schema";
import { Link } from "@/i18n/navigation";
import { OpenOnHash } from "./OpenOnHash";

export interface PerspectiveItem {
  entry: Perspective;
  links: PerspectiveLink[];
}

/**
 * Published perspectives as an accordion (About and Quick view). Native details/summary: keyboard and
 * screen reader friendly and readable without JS. Each entry is anchored `perspectives-<id>`, the
 * target Ask cites; `OpenOnHash` opens it. Server component: receives published entries only.
 */
export function PerspectiveList({
  items,
  locale,
  labels,
}: {
  items: readonly PerspectiveItem[];
  locale: Locale;
  labels: { related: string; external: string; asOf: (yearMonth: string) => string };
}) {
  if (items.length === 0) return null;
  return (
    <>
      <OpenOnHash prefix={PERSPECTIVE_ANCHOR_PREFIX} />
      <ul className="pv-rows pv-rows-closed" data-testid="perspectives">
        {items.map(({ entry, links }) => (
          <li key={entry.id}>
            <details id={perspectiveAnchor(entry.id)} data-perspective={entry.id} className="group scroll-mt-28">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 [&::-webkit-details-marker]:hidden">
                <h3 className="pv-h3">{entry.question[locale]}</h3>
                <span aria-hidden="true" className="shrink-0 text-ink-3 transition group-open:rotate-180">
                  &#8964;
                </span>
              </summary>
              <div className="pb-6">
                <p className="pv-body text-ink-2">{entry.answer[locale]}</p>
                {links.length > 0 && (
                  <p className="pv-small mt-3">
                    <span className="text-ink-3">{labels.related}: </span>
                    {links.map((link, i) => (
                      <span key={link.href}>
                        {i > 0 && ", "}
                        {link.external ? (
                          <a href={link.href} target="_blank" rel="noopener noreferrer" className="link">
                            {link.label}
                            <span className="sr-only"> ({labels.external})</span>
                          </a>
                        ) : (
                          <Link href={link.href} className="link">
                            {link.label}
                          </Link>
                        )}
                      </span>
                    ))}
                  </p>
                )}
                <p className="pv-small mt-3 text-ink-3">{labels.asOf(entry.asOf)}</p>
              </div>
            </details>
          </li>
        ))}
      </ul>
    </>
  );
}

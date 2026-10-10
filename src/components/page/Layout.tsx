import type { ReactNode } from "react";
import type { Accent } from "@/content/schema";
import { Link } from "@/i18n/navigation";
import { ACCENT_TEXT } from "@/lib/accent";

/** Floor or wing locator: a small square in the accent color before a data label. */
export function Marker({ accent, children }: { accent: Accent; children: ReactNode }) {
  return <span className={`pv-mark ${ACCENT_TEXT[accent]}`}>{children}</span>;
}

export interface Crumb {
  href: string;
  label: string;
}

export function CrumbLink({ crumb }: { crumb: Crumb }) {
  return (
    <Link href={crumb.href} className="inline-flex min-h-11 items-center gap-2 text-sm text-ink-2 transition hover:text-ink">
      <span aria-hidden="true">←</span>
      {crumb.label}
    </Link>
  );
}

/** Page title block: optional crumb and floor locator, the h1, a lead and an aside column. */
export function PageIntro({
  marker,
  title,
  lead,
  aside,
  crumb,
  children,
}: {
  marker?: ReactNode;
  title: string;
  lead?: string;
  aside?: ReactNode;
  crumb?: Crumb;
  children?: ReactNode;
}) {
  return (
    <header className="pv-wrap pt-8 sm:pt-12 lg:pt-16">
      {crumb && (
        <p className="mb-4">
          <CrumbLink crumb={crumb} />
        </p>
      )}
      <div className="grid gap-10 lg:grid-cols-12 lg:gap-6">
        <div className="min-w-0 lg:col-span-8">
          {marker && <p className="pv-data mb-5 flex flex-wrap items-center gap-x-4 gap-y-2">{marker}</p>}
          <h1 className="pv-d-l">{title}</h1>
          {lead && <p className="pv-lead mt-6">{lead}</p>}
          {children}
        </div>
        {aside && <div className="min-w-0 lg:col-span-4 lg:self-end">{aside}</div>}
      </div>
    </header>
  );
}

/** Section with a sidehead (title, intro, "more" link; sticky on desktop) and a content column. */
export function SectionSplit({
  id,
  title,
  intro,
  more,
  children,
  className = "",
}: {
  id: string;
  title: string;
  intro?: string;
  more?: { href: string; label: string };
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={`pv-wrap pv-sec grid gap-8 lg:grid-cols-12 lg:gap-6 ${className}`}>
      <div className="pv-sidehead lg:col-span-4">
        <h2 id={`${id}-title`} className="pv-h2">
          {title}
        </h2>
        {intro && <p>{intro}</p>}
        {more && (
          <p className="mt-5">
            <Link href={more.href} className="pv-go">
              {more.label}
            </Link>
          </p>
        )}
      </div>
      <div className="min-w-0 lg:col-span-8">{children}</div>
    </section>
  );
}

/** Full-width section with its heading on the left and an optional link on the right. */
export function SectionWide({
  id,
  title,
  more,
  note,
  children,
  className = "",
}: {
  id: string;
  title: string;
  more?: { href: string; label: string };
  note?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={`pv-wrap pv-sec ${className}`}>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-2 sm:mb-10">
        <h2 id={`${id}-title`} className="pv-h2">
          {title}
        </h2>
        {more && (
          <Link href={more.href} className="pv-go">
            {more.label}
          </Link>
        )}
        {note && <p className="pv-data">{note}</p>}
      </div>
      {children}
    </section>
  );
}

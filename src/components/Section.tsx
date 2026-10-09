import type { ReactNode } from "react";

export function Section({
  id,
  eyebrow,
  title,
  intro,
  children,
  className = "",
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  intro?: string;
  children: ReactNode;
  className?: string;
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section id={id} aria-labelledby={headingId} className={`scroll-mt-24 py-10 sm:py-14 ${className}`}>
      <header className="mb-6 max-w-3xl">
        {eyebrow && <p className="label mb-2 text-cyan">{eyebrow}</p>}
        <h2 id={headingId} className="text-[22px] leading-[30px] font-bold tracking-tight text-ink sm:text-2xl">
          {title}
        </h2>
        {intro && <p className="mt-2 text-ink-2">{intro}</p>}
      </header>
      {children}
    </section>
  );
}

export function PageHeader({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow?: string;
  title: string;
  intro?: string;
  children?: ReactNode;
}) {
  return (
    <header className="pt-10 pb-4 sm:pt-16">
      {eyebrow && <p className="label mb-3 text-cyan">{eyebrow}</p>}
      <h1 className="text-[26px] leading-[32px] font-extrabold tracking-tight text-ink sm:text-[32px] sm:leading-[38px]">
        {title}
      </h1>
      {intro && <p className="mt-3 max-w-3xl text-base text-ink-2 sm:text-lg">{intro}</p>}
      {children}
    </header>
  );
}

export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 ${className}`}>{children}</div>;
}

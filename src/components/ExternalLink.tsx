import type { ReactNode } from "react";

export function ExternalLink({
  href,
  children,
  className = "link",
  srHint,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  srHint?: string;
}) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
      <span aria-hidden="true"> ↗</span>
      {srHint && <span className="sr-only"> ({srHint})</span>}
    </a>
  );
}

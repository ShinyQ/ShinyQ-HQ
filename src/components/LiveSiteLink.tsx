/** External-link icon (a box with an arrow), drawn as SVG so no font glyph is needed. */
export function ExternalIcon({ className = "size-4 shrink-0" }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M14 4h6v6" />
      <path d="M20 4 10 14" />
      <path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
    </svg>
  );
}

/**
 * "Visit live site" (R4-J): a pod's public site in a new tab with `rel="noopener noreferrer"`, the
 * external icon and a screen reader hint. No hooks, so server pages and the client Glass Drawer share
 * it. Pass `podLiveLink(pod).href` (or `RoomView.live`), never a raw content string.
 */
export function LiveSiteLink({
  href,
  label,
  srHint,
  className,
  testId,
}: {
  href: string;
  label: string;
  srHint: string;
  className?: string;
  testId?: string;
}) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className} data-live-link="" data-testid={testId}>
      <span>{label}</span>
      <ExternalIcon />{" "}
      <span className="sr-only">({srHint})</span>
    </a>
  );
}

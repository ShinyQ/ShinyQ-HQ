/** Hides a key hint on a coarse pointer (owner decision 2026-10-28): touch visitors never see keyboard keys. */
export const KEY_HINT = "pointer-coarse:hidden";

/** A key cap in the HUD's one style, shown only with a fine pointer; the control names its key with `aria-keyshortcuts`. */
export function Kbd({ children, className = "" }: { children: string; className?: string }) {
  return (
    <kbd aria-hidden="true" className={`label rounded border border-glass-border px-1.5 py-0.5 text-ink-3 ${KEY_HINT} ${className}`}>
      {children}
    </kbd>
  );
}

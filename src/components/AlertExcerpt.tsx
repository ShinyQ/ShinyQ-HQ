/**
 * A masked Bicep excerpt of one alert rule ("How I run AI in production"). Shared by the About page and
 * the Ops Control Room drawer; plain text, no highlighter, so it adds no JavaScript.
 */
export function AlertExcerpt({ label, caption, code, className = "" }: { label: string; caption: string; code: string; className?: string }) {
  return (
    <figure className={className} data-testid="alert-excerpt">
      <figcaption className="pv-data mb-3">{label}</figcaption>
      <pre
        tabIndex={0}
        aria-label={label}
        className="max-h-96 overflow-auto rounded-lg border border-line bg-void/60 p-4 font-mono text-[12.5px] leading-5 whitespace-pre text-ink-2"
      >
        <code>{code}</code>
      </pre>
      <p className="pv-small mt-3 text-ink-2">{caption}</p>
    </figure>
  );
}

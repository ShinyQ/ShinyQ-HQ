/** Wireframe "KAW" monogram (C5: no photo). Decorative unless a label is given. */
export function Monogram({ text, size = 96, label }: { text: string; size?: number; label?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className="shrink-0"
    >
      <defs>
        <linearGradient id="kaw-edge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#a78bfa" />
        </linearGradient>
      </defs>
      <polygon points="60,4 112,32 112,88 60,116 8,88 8,32" fill="rgb(15 15 25 / 0.82)" stroke="url(#kaw-edge)" strokeWidth="2" />
      <polygon points="60,18 98,39 98,81 60,102 22,81 22,39" fill="none" stroke="#6366f1" strokeOpacity="0.45" strokeWidth="1" />
      <text
        x="60"
        y="69"
        textAnchor="middle"
        fontFamily="var(--font-jetbrains), monospace"
        fontWeight="700"
        fontSize="26"
        letterSpacing="2"
        fill="#f4f4f5"
      >
        {text}
      </text>
    </svg>
  );
}

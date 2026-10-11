import { CAREER_ICONS, CAREER_TONE, iconPath } from "@/experience/fx/holoIcons";
import type { CareerType } from "@/experience/types";

/**
 * 2D twin of the 3D `HoloIcon`: the same 24 x 24 neon line strokes as an SVG, for Page View type
 * chips and legends. Decorative by default (`aria-hidden`); pass `title` when the icon is the only
 * label. `color` overrides the type color (for example `currentColor` on a pressed chip).
 */
export function TypeIcon({ type, size = 18, title, color, className }: { type: CareerType; size?: number; title?: string; color?: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={color ?? CAREER_TONE[type]}
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      <path d={iconPath(CAREER_ICONS[type])} />
    </svg>
  );
}

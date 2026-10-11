import { CAREER_ICONS, hexFrame, ICON_TONES, iconPath, type IconStyle } from "@/experience/fx/holoIcons";
import type { CareerType } from "@/experience/types";

/**
 * 2D twin of the 3D `HoloIcon`: the same 24 x 24 strokes as an SVG, for Page View type chips and
 * legends. Decorative by default (`aria-hidden`); pass `title` when the icon is the only label.
 */
export function TypeIcon({ type, style = "line", size = 18, title, className }: { type: CareerType; style?: IconStyle; size?: number; title?: string; className?: string }) {
  const tone = ICON_TONES[style][type];
  const badge = style === "badge";
  return (
    <svg
      viewBox={badge ? "-3 -3 30 30" : "0 0 24 24"}
      width={size}
      height={size}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      style={style === "solid" ? { filter: `drop-shadow(0 0 3px ${tone.glow})` } : undefined}
    >
      {title && <title>{title}</title>}
      {badge && <path d={iconPath([hexFrame()])} stroke={tone.glow} strokeWidth={1.4} fill={tone.glow} fillOpacity={0.12} />}
      <path d={iconPath(CAREER_ICONS[type])} stroke={tone.stroke} strokeWidth={style === "solid" ? 2.2 : badge ? 1.6 : 1.75} />
    </svg>
  );
}

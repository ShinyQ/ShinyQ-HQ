import type { Wing } from "@/content/schema";
import { RoverMark } from "../RoverMark";

const MINOR = new Set(["a", "an", "and", "of", "for", "the", "to", "in", "on", "with", "dan", "di", "ke", "untuk", "yang", "dengan"]);

/** Initials of a project title: the first letters of its first two significant words. */
export function projectInitials(title: string): string {
  const words = title.split(/[\s:/]+/).filter((w) => /^\p{L}/u.test(w) && !MINOR.has(w.toLowerCase()));
  return words
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/**
 * Stand-in for a project screenshot when the pod has no gallery (owner request 2026-10-16): the rover glyph
 * and the title's initials on a wing-tinted gradient. CSS and inline SVG only, decorative.
 */
export function ProjectPlaceholder({ id, title, wing, size }: { id: string; title: string; wing: Wing; size: "row" | "film" | "card" }) {
  return (
    <span className={`pv-ph pv-ph-${size}`} data-wing={wing} data-project-placeholder="" aria-hidden="true">
      <RoverMark id={id} size={size === "film" ? 22 : size === "row" ? 30 : 56} variant="glyph" className="pv-ph-mark" />
      {size !== "film" && <span className="pv-ph-initials">{projectInitials(title)}</span>}
    </span>
  );
}

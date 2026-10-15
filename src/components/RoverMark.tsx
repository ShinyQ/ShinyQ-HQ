import { MARK, roverMarkBody, type MarkVariant } from "@/lib/brand-mark";

/**
 * The rover brand mark inline (`src/lib/brand-mark.ts`), for the Classic site header. No hooks, so
 * server and client components can render it. Decorative: the owner's name or a title always sits next
 * to it. `id` must be unique on the page (it prefixes the gradient ids).
 */
export function RoverMark({ id, size, variant = "tile", className }: { id: string; size: number; variant?: MarkVariant; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox={`0 0 ${MARK.size} ${MARK.size}`}
      className={className}
      data-brand-mark=""
      dangerouslySetInnerHTML={{ __html: roverMarkBody(variant, id) }}
    />
  );
}

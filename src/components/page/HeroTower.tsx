import type { Accent, FloorId } from "@/content/schema";
import { Link } from "@/i18n/navigation";
import { ACCENT_TEXT } from "@/lib/accent";

export interface TowerFloor {
  floor: FloorId;
  label: string;
  href: string;
  accent: Accent;
  /** The floor this page is (L1 on the landing). */
  current?: boolean;
}

/**
 * The landing's tower directory (from lg): one stacked neon slab per floor, top floor first, each a
 * link to its page; the floor color marks the slab and the code only (wayfinding). Pure HTML and CSS.
 */
export function HeroTower({ title, here, floors }: { title: string; here: string; floors: readonly TowerFloor[] }) {
  return (
    <nav aria-label={title} className="hx-tower">
      <p className="pv-data mb-6">{title}</p>
      <ol className="hx-floors">
        {floors.map((f) => (
          <li key={f.floor} className={ACCENT_TEXT[f.accent]}>
            <Link href={f.href} className="hx-level" aria-current={f.current ? "page" : undefined}>
              <span aria-hidden="true" className="hx-slab" />
              <span className="pv-data hx-code">{f.floor}</span>
              <span className="hx-level-name">{f.label}</span>
              {f.current && <span className="pv-data">{here}</span>}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}

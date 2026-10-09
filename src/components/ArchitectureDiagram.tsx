import { getTranslations } from "next-intl/server";
import type { Architecture, Locale } from "@/content/schema";

const KIND_STYLE: Record<Architecture["nodes"][number]["kind"], string> = {
  client: "border-cyan/60 text-cyan",
  service: "border-blue/60 text-blue",
  ai: "border-violet/60 text-violet",
  data: "border-green/60 text-green",
  human: "border-amber/60 text-amber",
  external: "border-white/50 text-white",
};

/**
 * HTML rendering of the hologram data: nodes in a layer x row grid plus an
 * accessible list of edges. The 3D hologram (Phase 4) reuses the same data.
 */
export async function ArchitectureDiagram({ architecture, locale }: { architecture: Architecture; locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "labs" });
  const layers = Math.max(...architecture.nodes.map((n) => n.layer)) + 1;
  const byId = new Map(architecture.nodes.map((n) => [n.id, n]));
  return (
    <div className="space-y-6">
      <div className="overflow-x-auto pb-2">
        <ol
          className="grid min-w-[560px] gap-3"
          style={{ gridTemplateColumns: `repeat(${layers}, minmax(0, 1fr))` }}
          aria-label={t("architecture")}
        >
          {architecture.nodes.map((node) => (
            <li
              key={node.id}
              className={`glass flex flex-col gap-1 border p-3 ${KIND_STYLE[node.kind]}`}
              style={{ gridColumn: node.layer + 1, gridRow: node.row + 1 }}
            >
              <span className="label opacity-80">{t(`nodeKind.${node.kind}`)}</span>
              <span className="text-sm leading-5 font-semibold text-ink">{node.label}</span>
              {node.sublabel && <span className="text-xs leading-4 text-ink-2">{node.sublabel[locale]}</span>}
            </li>
          ))}
        </ol>
      </div>
      {architecture.edges.length > 0 && (
        <div>
          <h3 className="label mb-2 text-ink-2">{t("architectureFlow")}</h3>
          <ul className="grid gap-1.5 font-mono text-[13px] leading-5 text-ink-2 sm:grid-cols-2">
            {architecture.edges.map((edge, i) => (
              <li key={`${edge.from}-${edge.to}-${i}`}>
                <span className="text-ink">{byId.get(edge.from)?.label}</span>{" "}
                <span aria-hidden="true" className="text-cyan">
                  {edge.async ? "⇢" : "→"}
                </span>
                <span className="sr-only">{edge.async ? " sends asynchronously to " : " to "}</span>{" "}
                <span className="text-ink">{byId.get(edge.to)?.label}</span>
                {edge.label && <span className="text-ink-3"> ({edge.label})</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

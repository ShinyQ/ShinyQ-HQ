"use client";

import { useTranslations } from "next-intl";
import type { RoomId } from "@/content/schema";
import type { RoomReactor } from "@/content/room-views/types";
import { AccentDot } from "@/components/AccentDot";
import { goToRoom } from "@/experience/missions/bridge";
import { getHQStore, useHQStore } from "@/store/useHQStore";
import type { RoomBodyProps } from "./bodies";
import { FILTER_ACTION as ACTION, FilterOption, FilterPiece } from "./filterParts";

/** The selected tech: "N projects use X", its projects (each rides to its pod), Clear. */
function Selection({ reactor }: { reactor: RoomReactor }) {
  const t = useTranslations("labs.reactor");
  const tech = useHQStore((s) => s.reactor.tech);
  if (!tech) return null;
  return (
    <section className="space-y-2" data-testid="reactor-selection" data-tech={tech.slug} aria-live="polite">
      <h3 className="label text-ink-2">{t("projects", { tech: tech.name })}</h3>
      <p className="text-sm text-ink" data-testid="reactor-uses">
        {t("uses", { count: tech.count, tech: tech.name })}
      </p>
      <ul className="space-y-1">
        {tech.pods.map((slug) => {
          const pod = reactor.pods[slug];
          if (!pod) return null;
          return (
            <li key={slug}>
              <FilterPiece
                title={pod.title}
                meta={pod.docked ? pod.wing : `${pod.wing} · ${t("directory")}`}
                onClick={() => goToRoom(`L3:${slug}` as RoomId)}
                data={{ "data-testid": "reactor-project", "data-pod": slug }}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * L3 Tech Reactor (kind "reactor"): six ring chips (the CV skill groups), the ring's techs with their
 * project counts, and the selection with its projects. Picking a tech lights its pods on the floor
 * (store `reactor.tech`, `#labs-tech=<slug>`); picking it again or Clear turns them off; Surprise me
 * spins the rings and drives to a random pod (`ReactorSurprise` in the floor).
 */
export function ReactorBody({ view }: RoomBodyProps) {
  const t = useTranslations("labs.reactor");
  const ringId = useHQStore((s) => s.reactor.ring);
  const selected = useHQStore((s) => s.reactor.tech?.slug ?? null);
  const reactor = view.reactor;
  if (!reactor) return null;
  const ring = reactor.rings.find((r) => r.id === ringId) ?? reactor.rings[0];
  const store = getHQStore().getState;

  return (
    <div className="space-y-5" data-testid="reactor-body">
      <div role="group" aria-label={t("ringsLabel")} className="flex flex-wrap gap-2">
        {reactor.rings.map((r) => (
          <button key={r.id} type="button" className="chip" aria-pressed={r.id === ring.id} onClick={() => store().setReactorRing(r.id)} data-ring={r.id}>
            <AccentDot tone={r.accent} glow={r.id === ring.id} />
            {r.label}
            <span className="chip-count">{r.techs.length}</span>
          </button>
        ))}
      </div>

      <Selection reactor={reactor} />

      <div className="flex flex-wrap gap-2">
        <button type="button" className={ACTION} onClick={() => store().spinReactor()} data-testid="reactor-surprise">
          {t("surprise")}
        </button>
        {selected && (
          <button type="button" className={ACTION} onClick={() => store().clearReactorTech()} data-testid="reactor-clear">
            {t("clear")}
          </button>
        )}
      </div>

      <section className="space-y-2">
        <h3 className="label text-ink-2">{t("techsLabel", { ring: ring.label })}</h3>
        <ul className="grid gap-1 sm:grid-cols-2" data-testid="reactor-techs" data-ring={ring.id}>
          {ring.techs.map((tech) => {
            const on = tech.slug === selected;
            return (
              <li key={tech.slug}>
                <FilterOption
                  on={on}
                  accent={ring.accent}
                  label={tech.name}
                  count={t("count", { count: tech.pods.length })}
                  icon={
                    tech.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={tech.logo} alt="" width={18} height={18} loading="lazy" decoding="async" className="size-[18px] shrink-0 object-contain" />
                    ) : undefined
                  }
                  onClick={() => (on ? store().clearReactorTech() : store().selectReactorTech({ slug: tech.slug, name: tech.name, ring: ring.id, count: tech.pods.length, pods: tech.pods }))}
                  data={{ "data-tech": tech.slug }}
                />
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

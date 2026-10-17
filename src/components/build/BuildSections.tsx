import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { AccentDot } from "@/components/AccentDot";
import { ArchitectureDiagram } from "@/components/ArchitectureDiagram";
import { ExternalLink } from "@/components/ExternalLink";
import { SectionSplit } from "@/components/page/Layout";
import { COMING_SOON_IDS, type StationId, getBuildStory } from "@/content/build-story";
import type { Locale } from "@/content/schema";
import { repoFileUrl } from "@/lib/build-page";
import { DashboardBody } from "./BuildDashboard";
import { TimelineBody } from "./BuildTimeline";

export { DashboardBody, TimelineBody };

/**
 * The build story stations (/[locale]/build). Each `*Section` is a `SectionSplit` with the station id as its
 * anchor; the `*Body` components are the bare content, so the B1 Engine Room drawers can reuse them.
 */
type Props = { locale: Locale };

function Station({ id, locale, children }: { id: StationId; locale: Locale; children: ReactNode }) {
  const station = getBuildStory().stations[id];
  return (
    <SectionSplit id={id} title={station.title[locale]} intro={station.summary[locale]}>
      {children}
    </SectionSplit>
  );
}

export async function BlueprintBody({ locale }: Props) {
  const t = await getTranslations({ locale, namespace: "build" });
  const { architecture, steps } = getBuildStory().stations.blueprint;
  return (
    <>
      <ArchitectureDiagram architecture={architecture} locale={locale} />
      <h3 className="pv-h3 mt-14 mb-4">{t("howItRuns")}</h3>
      <ol className="pv-rows pv-rows-closed">
        {steps.map((step, i) => (
          <li key={step.en} className="flex gap-3 py-4">
            <span className="pv-num min-w-[4ch] shrink-0 text-[22px]">{i + 1}</span>
            <p className="pv-body">{step[locale]}</p>
          </li>
        ))}
      </ol>
    </>
  );
}

export async function AgentsBody({ locale }: Props) {
  const t = await getTranslations({ locale, namespace: "build" });
  const tc = await getTranslations({ locale, namespace: "common" });
  const { steps, tools, excerpt } = getBuildStory().stations.agents;
  return (
    <>
      <h3 className="pv-h3 mb-4">{t("loop")}</h3>
      <ol className="pv-rows pv-rows-closed">
        {steps.map((step, i) => (
          <li key={step.title.en} className="flex gap-3 py-4">
            <span className="pv-num min-w-[4ch] shrink-0 text-[22px]">{i + 1}</span>
            <div>
              <p className="font-semibold text-ink">{step.title[locale]}</p>
              <p className="pv-body mt-1">{step.text[locale]}</p>
            </div>
          </li>
        ))}
      </ol>
      <h3 className="pv-h3 mt-14 mb-4">{t("tools")}</h3>
      <ul className="flex flex-wrap gap-2">
        {tools.map((tool) => (
          <li key={tool} className="chip">
            {tool}
          </li>
        ))}
      </ul>
      <figure className="mt-14">
        <figcaption className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span className="pv-h3">{t("excerpt")}</span>
          <ExternalLink href={repoFileUrl(excerpt.path)} className="pv-uline inline-flex min-h-11 items-center text-sm text-ink-2 hover:text-ink" srHint={tc("external")}>
            {t("excerptSource")}
          </ExternalLink>
        </figcaption>
        <pre className="card p-4 font-mono text-[13px] whitespace-pre-wrap text-ink-2 [overflow-wrap:anywhere] sm:p-5">
          <code>{excerpt.text}</code>
        </pre>
      </figure>
    </>
  );
}

export async function GatesBody({ locale }: Props) {
  const t = await getTranslations({ locale, namespace: "build" });
  const { title, gates } = getBuildStory().stations.gates;
  const status = (required: boolean) => (
    <span className="chip mt-2">
      <AccentDot tone={required ? "green" : "muted"} />
      {t(required ? "blocksMerge" : "reportsOnly")}
    </span>
  );
  return (
    <table className="w-full text-left">
      <caption className="sr-only">{title[locale]}</caption>
      <thead className="pv-data">
        <tr className="border-b border-line">
          <th scope="col" className="py-3 pr-4 font-normal">
            {t("gate")}
          </th>
          <th scope="col" className="py-3 font-normal">
            {t("checks")}
          </th>
        </tr>
      </thead>
      <tbody>
        {gates.map((gate) => (
          <tr key={gate.id} id={`gate-${gate.id}`} className="border-b border-line align-top">
            <th scope="row" className="py-4 pr-4 font-semibold text-ink">
              <span className="block">{gate.title[locale]}</span>
              {status(gate.required)}
            </th>
            <td className="py-4 text-ink-2">
              {gate.text[locale]}
              <span className="mt-2 block text-ink">
                <span className="pv-data">{t("budget")}</span> {gate.budget[locale]}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function BlueprintSection({ locale }: Props) {
  return (
    <Station id="blueprint" locale={locale}>
      <BlueprintBody locale={locale} />
    </Station>
  );
}

export function TimelineSection({ locale }: Props) {
  return (
    <Station id="timeline" locale={locale}>
      <TimelineBody locale={locale} />
    </Station>
  );
}

export function AgentsSection({ locale }: Props) {
  return (
    <Station id="agents" locale={locale}>
      <AgentsBody locale={locale} />
    </Station>
  );
}

export function GatesSection({ locale }: Props) {
  return (
    <Station id="gates" locale={locale}>
      <GatesBody locale={locale} />
    </Station>
  );
}

export function DashboardSection({ locale }: Props) {
  return (
    <Station id="dashboard" locale={locale}>
      <DashboardBody locale={locale} />
    </Station>
  );
}

/** Two dimmed plates for the stations still being written (dashed outline, muted text, a "Coming soon" chip). */
export async function ComingSoonSection({ locale }: Props) {
  const t = await getTranslations({ locale, namespace: "build" });
  const soon = getBuildStory().comingSoon;
  return (
    <SectionSplit id="coming-soon" title={t("comingSoonTitle")} intro={t("comingSoonIntro")}>
      <ul className="grid gap-3 sm:grid-cols-2">
        {COMING_SOON_IDS.map((id) => (
          <li key={id} id={id} className="rounded-xl border border-line p-5 sm:p-6">
            <span className="chip text-ink-3">
              <AccentDot tone="muted" />
              {t("comingSoon")}
            </span>
            <h3 className="pv-h3 mt-4 text-ink-2">{soon[id].title[locale]}</h3>
            <p className="pv-small mt-2 text-ink-3">{soon[id].summary[locale]}</p>
          </li>
        ))}
      </ul>
    </SectionSplit>
  );
}

import { getTranslations } from "next-intl/server";
import { SectionSplit } from "@/components/page/Layout";
import type { Locale } from "@/content/locales";
import { OFFICE_ACTIVITIES, OFFICE_AGENTS, OFFICE_STATES, type OfficeGithubStatus } from "@/lib/office/protocol";
import type { OfficeCardLabels } from "./labels";
import { OfficeLazy, OfficeShell } from "./OfficeLazy";

const STATUSES: readonly OfficeGithubStatus[] = ["running", "success", "failure", "merged", "opened", "pushed"];

/** The card's strings, raw (`{name}` placeholders kept for `fill`): `office.classic` never reaches the client messages. */
export async function officeCardLabels(locale: Locale): Promise<OfficeCardLabels> {
  const t = await getTranslations({ locale, namespace: "office" });
  const c = (key: string) => t.raw(`classic.${key}`) as string;
  return {
    title: c("title"),
    intro: c("intro"),
    loading: c("loading"),
    live: c("live"),
    semiLive: c("semiLive"),
    resting: c("resting"),
    offline: c("offline"),
    updated: c("updated"),
    counts: { active: c("counts.active"), thinking: c("counts.thinking"), waiting: c("counts.waiting"), asleep: c("counts.asleep") },
    agents: c("agents"),
    noAgents: c("noAgents"),
    extra: c("extra"),
    github: c("github"),
    noGithub: c("noGithub"),
    today: c("today"),
    status: Object.fromEntries(STATUSES.map((s) => [s, c(`status.${s}`)])) as OfficeCardLabels["status"],
    clientProject: t("clientProject"),
    privacy: t("privacy"),
    states: Object.fromEntries(OFFICE_STATES.map((s) => [s, t(`state.${s}`)])) as OfficeCardLabels["states"],
    activities: Object.fromEntries(OFFICE_ACTIVITIES.map((a) => [a, t(`activity.${a}`)])) as OfficeCardLabels["activities"],
    agentNames: Object.fromEntries(OFFICE_AGENTS.map((a) => [a, t(`agent.${a}`)])) as OfficeCardLabels["agentNames"],
  };
}

/** "Live Agent Office" on the Classic home page (`#office`): the L1 office's data as a card (spec section 4.2). */
export async function OfficeSection({ locale }: { locale: Locale }) {
  const labels = await officeCardLabels(locale);
  return (
    <OfficeShell>
      <SectionSplit id="office" title={labels.title} intro={labels.intro}>
        <OfficeLazy locale={locale} labels={labels} />
      </SectionSplit>
    </OfficeShell>
  );
}

import { getTranslations } from "next-intl/server";
import type { Locale, RepoRef, SideProject } from "@/content/schema";
import { TechLogoRow } from "./Chip";
import { ExternalLink } from "./ExternalLink";

export async function SideProjectGrid({ projects, locale }: { projects: readonly SideProject[]; locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "common" });
  return (
    <ul className="pv-rows pv-rows-closed">
      {projects.map((p) => (
        <li key={p.id} className="grid gap-x-6 gap-y-1.5 py-5 md:grid-cols-[90px_minmax(0,1fr)] md:py-6">
          <p className="pv-data md:pt-1.5">{p.year}</p>
          <div className="min-w-0">
            <h3 className="pv-h3">{p.title}</h3>
            <p className="mt-2 max-w-[64ch] text-[15px] leading-6 text-ink-2">{p.summary[locale]}</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
              <TechLogoRow items={p.stack} max={10} />
              {p.url && (
                <ExternalLink href={p.url} srHint={t("external")} className="pv-uline inline-flex min-h-11 items-center text-sm text-ink">
                  Live
                </ExternalLink>
              )}
              {p.repo && (
                <ExternalLink href={p.repo} srHint={t("external")} className="pv-uline inline-flex min-h-11 items-center text-sm text-ink">
                  GitHub
                </ExternalLink>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export async function RepoWall({ repos, locale }: { repos: readonly RepoRef[]; locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "journey" });
  const tc = await getTranslations({ locale, namespace: "common" });
  return (
    <ul className="pv-rows pv-rows-closed">
      {repos.map((repo) => (
        <li key={repo.url} className="flex flex-col gap-1 py-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
          <div className="min-w-0">
            <ExternalLink href={repo.url} className="pv-stretch pv-row-title font-mono text-sm font-medium break-all text-ink" srHint={tc("external")}>
              {repo.name}
            </ExternalLink>
            <p className="pv-small mt-1">{repo.description[locale]}</p>
          </div>
          <p className="pv-data shrink-0">
            {repo.language} · {t("stars", { count: repo.stars })}
          </p>
        </li>
      ))}
    </ul>
  );
}

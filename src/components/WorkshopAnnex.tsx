import { getTranslations } from "next-intl/server";
import type { Locale, RepoRef, SideProject } from "@/content/schema";
import { ChipList } from "./Chip";
import { ExternalLink } from "./ExternalLink";

export async function SideProjectGrid({ projects, locale }: { projects: readonly SideProject[]; locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "common" });
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((p) => (
        <li key={p.id} className="glass flex flex-col gap-2 p-4">
          <h3 className="font-bold text-ink">
            {p.title}
            {p.year && <span className="label ml-2 text-ink-3">{p.year}</span>}
          </h3>
          <p className="text-sm leading-6 text-ink-2">{p.summary[locale]}</p>
          <ChipList items={p.stack} logos />
          {(p.url || p.repo) && (
            <p className="mt-auto flex gap-4 pt-1 text-[13px]">
              {p.url && (
                <ExternalLink href={p.url} srHint={t("external")}>
                  Live
                </ExternalLink>
              )}
              {p.repo && (
                <ExternalLink href={p.repo} srHint={t("external")}>
                  GitHub
                </ExternalLink>
              )}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

export async function RepoWall({ repos, locale }: { repos: readonly RepoRef[]; locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "journey" });
  const tc = await getTranslations({ locale, namespace: "common" });
  return (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {repos.map((repo) => (
        <li key={repo.url} className="rounded-lg border border-glass-border p-3">
          <ExternalLink href={repo.url} className="font-mono text-sm font-semibold text-cyan hover:underline" srHint={tc("external")}>
            {repo.name}
          </ExternalLink>
          <p className="mt-1 text-[13px] leading-5 text-ink-2">{repo.description[locale]}</p>
          <p className="label mt-2 text-ink-3">
            {repo.language} · {t("stars", { count: repo.stars })}
          </p>
        </li>
      ))}
    </ul>
  );
}

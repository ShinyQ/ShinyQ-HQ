import { getTranslations } from "next-intl/server";
import { getLibrary } from "@/content/load";
import { buildPaperPreview } from "@/content/papers";
import type { Locale, Pod } from "@/content/schema";
import { isResearch, podPublications, publicationDate, repoName } from "@/content/selectors";
import { ExternalLink } from "../ExternalLink";
import { PaperTrigger } from "../paper/PaperTrigger";

const linkClass = "link inline-flex min-h-11 items-center";

/**
 * "Code and research" on a case study (Data and ML pods, owner request 2026-10-14): the pod's public
 * GitHub repositories, then the papers, thesis and models it produced. Papers and the thesis open the
 * paper preview; models and repositories open in a new tab.
 */
export async function PodCodeResearch({ pod, locale }: { pod: Pick<Pod, "repos" | "publications">; locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "labs" });
  const tl = await getTranslations({ locale, namespace: "library" });
  const tc = await getTranslations({ locale, namespace: "common" });
  const pubs = podPublications(pod, getLibrary().publications);
  const repos = pod.repos ?? [];
  if (!repos.length && !pubs.length) return null;
  return (
    <div className="grid gap-8" data-testid="pod-code-research">
      {repos.length > 0 && (
        <div>
          <h3 className="font-semibold text-ink">{t("repositories")}</h3>
          <ul className="mt-2 grid gap-1">
            {repos.map((url) => (
              <li key={url} className="min-w-0 break-words">
                <ExternalLink href={url} srHint={tc("external")} className={linkClass}>
                  {repoName(url)}
                </ExternalLink>
              </li>
            ))}
          </ul>
        </div>
      )}
      {pubs.length > 0 && (
        <div>
          <h3 className="font-semibold text-ink">{t("research")}</h3>
          <ul className="pv-rows pv-rows-closed mt-2">
            {pubs.map((pub) => (
              <li key={pub.id} className="grid gap-x-6 gap-y-1 py-4 md:grid-cols-[110px_minmax(0,1fr)]" data-testid="pod-publication">
                <p className="pv-meta md:pt-1">
                  {tl(`kind.${pub.kind}`)}
                  <span className="mt-1 block">{publicationDate(pub, locale)}</span>
                </p>
                <div className="min-w-0">
                  <p className="pv-h3 text-[17px]">
                    {isResearch(pub.kind) ? (
                      <PaperTrigger paper={buildPaperPreview(pub, locale)} className="text-left transition hover:text-cyan">
                        {pub.title}
                      </PaperTrigger>
                    ) : pub.url ? (
                      <ExternalLink href={pub.url} srHint={tc("external")} className="transition hover:text-cyan">
                        {pub.title}
                      </ExternalLink>
                    ) : (
                      pub.title
                    )}
                  </p>
                  {pub.venue && <p className="pv-small mt-1 italic">{pub.venue}</p>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

import { getTranslations } from "next-intl/server";
import { getBuildFacts, getBuildStory } from "@/content/build-story";
import type { Locale } from "@/content/schema";
import { prUrl, roundDates, timelineRows } from "@/lib/build-page";

/** Pull request links stay bare (no per-link arrow or hint, one hint above the rounds) and reuse existing utilities (CSS budget). */
const PR_LINK = "pv-uline inline-flex min-h-6 items-center px-1 font-mono text-[13px] text-ink-2 hover:text-cyan";

const PR_TEXT = "inline-flex min-h-6 items-center px-1 font-mono text-[13px] text-ink-2";

/** The build rounds, oldest first: title, merge dates, summary, merged pull requests and the optional before and after captures. */
export async function TimelineBody({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "build" });
  const rows = timelineRows(getBuildStory(), getBuildFacts());
  return (
    <>
      <p className="pv-small mb-6">{t("prHint")}</p>
      <ol className="pv-rows pv-rows-closed">
        {rows.map(({ round, prs, unlinked, first, last, open }) => {
          const dates = roundDates({ first, last }, locale, t("dateTo"));
          return (
            <li key={round.id} id={`round-${round.number}`} className="py-6">
              <p className="pv-data flex flex-wrap gap-x-4 gap-y-1">
                <span>{t("round", { n: round.number })}</span>
                {dates && <span>{dates}</span>}
                {open && <span className="text-cyan">{t("inProgress")}</span>}
              </p>
              <h3 className="pv-h3 mt-2">{round.title[locale]}</h3>
              <p className="pv-body mt-3">{round.summary[locale]}</p>
              {prs.length > 0 && (
                <>
                  <p className="pv-small mt-4">{t("prCount", { count: prs.length })}</p>
                  <ul aria-label={t("prList", { n: round.number })} className="mt-2 flex flex-wrap gap-x-2 gap-y-1">
                    {prs.map((n) => (
                      <li key={n}>
                        {unlinked.includes(n) ? (
                          <span className={PR_TEXT}>{`#${n}`}</span>
                        ) : (
                          <a href={prUrl(n)} target="_blank" rel="noopener noreferrer" className={PR_LINK}>{`#${n}`}</a>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {round.shots && (
                <figure className="mt-6">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(["before", "after"] as const).map((key) => {
                      const shot = round.shots![key];
                      return (
                        <div key={key}>
                          <p className="pv-data mb-2">{t(key)}</p>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={shot.src}
                            width={shot.width}
                            height={shot.height}
                            alt={shot.alt[locale]}
                            loading="lazy"
                            decoding="async"
                            className="h-auto w-full rounded-lg border border-line"
                          />
                        </div>
                      );
                    })}
                  </div>
                  <figcaption className="pv-small mt-3">{round.shots.caption[locale]}</figcaption>
                </figure>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}

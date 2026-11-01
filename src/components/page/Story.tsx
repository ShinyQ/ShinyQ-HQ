import type { EngineeringTopic, Locale, LocalizedText, PodStory } from "@/content/schema";
import { Link } from "@/i18n/navigation";

/** Key decisions of a story case study: numbered like `StepList`, each a title and its reason (owner decision 2026-10-25). */
export function DecisionList({ decisions, locale, whyLabel }: { decisions: PodStory["decisions"]; locale: Locale; whyLabel: string }) {
  return (
    <ol className="pv-rows pv-rows-closed">
      {decisions.map((d, i) => (
        <li key={i} className="grid grid-cols-[40px_1fr] gap-3 py-5">
          <span aria-hidden="true" className="pv-num text-xl text-ink-3">
            {i + 1}
          </span>
          <div className="min-w-0">
            <p className="pv-h3">{d.title[locale]}</p>
            <p className="mt-2 text-ink-2">
              <span className="font-semibold text-ink">{whyLabel}:</span> {d.why[locale]}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * "Engineering detail" (owner decision 2026-11-02): numbered like `DecisionList`, each topic a heading, a summary, its
 * sourced points, the known limits and an optional related post. Reuses existing classes only (no new CSS).
 */
export function EngineeringList({
  topics,
  locale,
  labels,
  posts,
}: {
  topics: readonly EngineeringTopic[];
  locale: Locale;
  labels: { limits: string; post: string };
  posts: Readonly<Record<string, LocalizedText>>;
}) {
  return (
    <ol className="pv-rows pv-rows-closed" data-testid="engineering-detail">
      {topics.map((topic, i) => {
        const postTitle = topic.post ? posts[topic.post] : undefined;
        return (
          <li key={i} className="grid grid-cols-[40px_1fr] gap-3 py-5">
            <span aria-hidden="true" className="pv-num text-xl text-ink-3">
              {i + 1}
            </span>
            <div className="min-w-0">
              <h3 className="pv-h3">{topic.title[locale]}</h3>
              <p className="mt-2 text-ink-2">{topic.summary[locale]}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-2 marker:text-cyan/70">
                {topic.points.map((point, j) => (
                  <li key={j}>{point[locale]}</li>
                ))}
              </ul>
              {topic.limits && (
                <p className="mt-2 text-ink-2">
                  <span className="font-semibold text-ink">{labels.limits}:</span> {topic.limits[locale]}
                </p>
              )}
              {topic.post && postTitle && (
                <p className="mt-2">
                  <span className="text-ink-2">{labels.post}: </span>
                  <Link href={`/blog/${topic.post}`} className="link">
                    {postTitle[locale]}
                  </Link>
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** The owner's lesson: a quote with a neutral hairline rule (never a colored stripe). */
export function Lesson({ text }: { text: string }) {
  return <blockquote className="pv-h3 border-l border-line-2 pl-6 leading-snug">{text}</blockquote>;
}

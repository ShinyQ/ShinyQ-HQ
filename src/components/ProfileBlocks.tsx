import type { Award, Locale, Principle, SkillGroup } from "@/content/schema";
import { formatYearMonth } from "@/lib/format";
import { ChipList } from "./Chip";

/** How I work: each principle as a ruled row, title beside its explanation. */
export function PrincipleGrid({ principles, locale }: { principles: readonly Principle[]; locale: Locale }) {
  return (
    <ol className="pv-rows pv-rows-closed">
      {principles.map((p) => (
        <li key={p.id} className="grid gap-x-6 gap-y-2 py-5 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:py-6">
          <h3 className="pv-h3">{p.title[locale]}</h3>
          <p className="text-ink-2">{p.text[locale]}</p>
        </li>
      ))}
    </ol>
  );
}

export function SkillsWall({ skills, locale }: { skills: readonly SkillGroup[]; locale: Locale }) {
  return (
    <ul className="pv-rows pv-rows-closed">
      {skills.map((group) => (
        <li key={group.id} className="grid gap-x-6 gap-y-3 py-5 md:grid-cols-[180px_minmax(0,1fr)] md:py-6">
          <h3 className="font-semibold text-ink md:pt-2">{group.label[locale]}</h3>
          <ChipList items={group.items} label={group.label[locale]} logos />
        </li>
      ))}
    </ul>
  );
}

export function AwardList({ awards, locale }: { awards: readonly Award[]; locale: Locale }) {
  return (
    <ul className="pv-rows pv-rows-closed">
      {awards.map((award) => (
        <li key={award.id} className="grid gap-x-6 gap-y-1 py-3.5 sm:grid-cols-[90px_minmax(0,1fr)]">
          <span className="pv-date sm:pt-1">{formatYearMonth(award.date, locale)}</span>
          <span>
            <span className="font-semibold text-ink">{award.placement[locale]}</span>
            <span className="text-ink-2">
              {" "}
              · {award.title}
              {award.organizer ? ` (${award.organizer})` : ""}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

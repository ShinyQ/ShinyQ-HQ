import { getTranslations } from "next-intl/server";
import type { Award, Certification, Locale, Principle, SkillGroup } from "@/content/schema";
import { formatYearMonth } from "@/lib/format";
import { ChipList } from "./Chip";
import { ExternalLink } from "./ExternalLink";

export function PrincipleGrid({ principles, locale }: { principles: readonly Principle[]; locale: Locale }) {
  return (
    <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {principles.map((p, i) => (
        <li key={p.id} className="glass p-4">
          <p className="label text-green">{String(i + 1).padStart(2, "0")}</p>
          <h3 className="mt-2 font-bold text-ink">{p.title[locale]}</h3>
          <p className="mt-1 text-sm leading-6 text-ink-2">{p.text[locale]}</p>
        </li>
      ))}
    </ol>
  );
}

export function SkillsWall({ skills, locale }: { skills: readonly SkillGroup[]; locale: Locale }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {skills.map((group) => (
        <div key={group.id} className="glass p-4">
          <h3 className="mb-3 font-bold text-ink">{group.label[locale]}</h3>
          <ChipList items={group.items} label={group.label[locale]} />
        </div>
      ))}
    </div>
  );
}

export async function CertificationList({ certifications, locale }: { certifications: readonly Certification[]; locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "common" });
  const sorted = [...certifications].sort((a, b) => b.issued.localeCompare(a.issued));
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {sorted.map((cert) => (
        <li key={cert.id} className="glass flex flex-col gap-1 p-4">
          <p className="label text-cyan">
            {cert.code ? `${cert.code} · ` : ""}
            {cert.issuer}
          </p>
          <p className="font-semibold text-ink">{cert.name}</p>
          <p className="text-[13px] text-ink-2">
            {formatYearMonth(cert.issued, locale)}
            {cert.status === "in-progress" && <span className="ml-2 text-amber">({t("inProgress")})</span>}
          </p>
          {cert.credentialUrl && (
            <p className="mt-auto pt-1 text-[13px]">
              <ExternalLink href={cert.credentialUrl} srHint={t("external")}>
                {t("verify")}
              </ExternalLink>
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

export function AwardList({ awards, locale }: { awards: readonly Award[]; locale: Locale }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {awards.map((award) => (
        <li key={award.id} className="flex gap-3 rounded-lg border border-glass-border px-3 py-2">
          <span className="label w-16 shrink-0 pt-1 text-pink">{formatYearMonth(award.date, locale)}</span>
          <span className="text-sm leading-6">
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

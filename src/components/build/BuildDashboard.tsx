import { getTranslations } from "next-intl/server";
import { getBuildFacts } from "@/content/build-story";
import type { Locale } from "@/content/schema";
import { dashboardTiles } from "@/lib/build-page";
import { PUBLIC_FLOORS } from "@/lib/floors";
import { formatDate, intlLocale } from "@/lib/format";
import { BuildVisits } from "./BuildVisits";
import { TILE, TILE_LABEL, TILE_VALUE } from "./tile";

/**
 * Numbers measured from the repository (`content/generated/build-facts.json`): a tile only for a value the
 * snapshot carries, the hourly uptime check and the 30-day visits once the stats store has them.
 */
export async function DashboardBody({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "build" });
  const number = new Intl.NumberFormat(intlLocale(locale));
  const tiles = dashboardTiles(getBuildFacts(), PUBLIC_FLOORS.length);
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {tiles.map((tile) => {
        const value = number.format(tile.value);
        return (
          <li key={tile.id} className={TILE} data-tile={tile.id}>
            <p className={TILE_VALUE}>{tile.unit === "kb" ? t("kb", { value }) : value}</p>
            <p className={TILE_LABEL}>{t(`tiles.${tile.id}`, { date: tile.since ? formatDate(tile.since, locale) : "" })}</p>
          </li>
        );
      })}
      <li className={TILE} data-tile="uptime">
        <p className={TILE_VALUE}>{t("hourly")}</p>
        <p className={TILE_LABEL}>{t("tiles.uptime")}</p>
      </li>
      <BuildVisits locale={locale} label={t("tiles.visits")} />
    </ul>
  );
}
